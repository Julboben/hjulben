// Opens the game and the editor in headless Chrome, served the way static
// hosting serves them, and fails on anything that reaches the console that
// nobody put there on purpose: a failed request (a file that only exists on
// the dev server, say), an uncaught exception, or a warning or error logged
// by the page or its service worker. In production the console should hold
// only the easter-egg hints.
//
// The pages load from a hostname that is not local, so the service worker
// behaves as in production (sw.js keeps localhost network-first), and a
// return visit is checked to come from its cache.
//
//   node scripts/test-console.mjs
//
// Needs Chrome, at CHROME_PATH or where macOS or Linux installs it. Without
// it the test is skipped; CI has it.
import { chromePath, launchChrome, sleep, startStaticServer } from './lib/chrome.mjs';

const PAGES = ['index.html', 'editor.html'];
// Mapped to the test server; reserved for testing, so it never resolves elsewhere.
const HOST = 'hjulben.test';
// The API routes production has (netlify/functions); any other /api/ request
// would be a 404 there too.
const PRODUCTION_API = [/^\/api\/account\/[a-z-]+$/, /^\/api\/leaderboard$/];
const BOOT_TIMEOUT_MS = 20_000;
const TOTAL_TIMEOUT_MS = 120_000;

if (!chromePath) {
  console.log('Console test skipped: Chrome not found (set CHROME_PATH).');
  process.exit(0);
}

const problems = [];
let served = []; // what reached the server during the current visit
const server = await startStaticServer({
  onRequest(pathname, status) {
    served.push(pathname);
    if (status >= 400) problems.push(`${status} ${pathname}`);
  },
  handle(pathname, response) {
    if (!pathname.startsWith('/api/')) return false;
    // Production answers these from functions; an empty reply stands in.
    const status = PRODUCTION_API.some(route => route.test(pathname)) ? 204 : 404;
    response.writeHead(status, { 'Cache-Control': 'no-store' });
    response.end();
    return true;
  },
});
const base = `http://${HOST}:${server.address().port}/`;
const requests = new Map(); // requestId -> url, for failures that report none
const sessions = new Map(); // sessionId -> 'page' | 'service worker', for the report
const origin = new URL(base).origin;

const chrome = await launchChrome(chromePath, {
  // The test host resolves to the server, and counts as secure like the
  // HTTPS site, or the service worker would not register at all.
  flags: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${origin}`],
  onAttached(sessionId, { type }) {
    if (type !== 'page' && type !== 'service_worker') return [];
    sessions.set(sessionId, type === 'page' ? 'page' : 'service worker');
    return ['Network.enable', 'Runtime.enable', 'Log.enable'];
  },
});
const where = sessionId => sessions.get(sessionId) ?? 'page';
const describe = args => args.map(arg => arg.value ?? arg.description ?? arg.type).join(' ');
chrome.on(({ method, params, sessionId }) => {
  // A 4xx or 5xx is reported by the server; here only requests that never got an answer.
  if (method === 'Network.requestWillBeSent') requests.set(params.requestId, params.request.url);
  else if (method === 'Network.loadingFailed' && !params.canceled) {
    problems.push(`${where(sessionId)}: request failed (${params.errorText}) ${requests.get(params.requestId) ?? ''}`);
  } else if (method === 'Runtime.exceptionThrown') {
    const { exception, text } = params.exceptionDetails;
    problems.push(`${where(sessionId)}: uncaught ${exception?.description ?? text}`);
  } else if (method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(params.type)) {
    problems.push(`${where(sessionId)}: console.${params.type} ${describe(params.args)}`);
  } else if (method === 'Log.entryAdded' && ['error', 'warning'].includes(params.entry.level) && params.entry.source !== 'network') {
    problems.push(`${where(sessionId)}: ${params.entry.level} ${params.entry.text}`);
  }
});

const timer = setTimeout(async () => { console.error('Console test timed out.'); await chrome.close(); process.exit(1); }, TOTAL_TIMEOUT_MS);

// The pages are driven in a tab of their own, kept active: only the active
// tab gets animation frames, and the game finishes booting on one.
const { session: page, evaluate } = await chrome.openTab();
// Enabling twice is harmless; awaiting it means nothing the page does is missed.
await Promise.all(['Network.enable', 'Runtime.enable', 'Log.enable'].map(method => chrome.send(method, {}, page)));

/**
 * Evaluate, giving up after `ms`. Chrome can leave a question asked just as
 * the page navigates unanswered for good, which would hang the test.
 */
async function evaluateWithin(expression, ms) {
  let timer;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms); });
  try {
    return await Promise.race([evaluate(expression), late]);
  } finally {
    // A timer left running would keep the test alive after it has finished.
    clearTimeout(timer);
  }
}

/** Resolves once the page has drawn its first screen (both pages clear `data-booting` then). */
async function booted(label) {
  const started = Date.now();
  while (Date.now() - started < BOOT_TIMEOUT_MS) {
    if (await evaluateWithin(`document.readyState === 'complete' && !document.querySelector('[data-booting]')`, 2000).catch(() => false)) return;
    await sleep(100);
  }
  problems.push(`${label}: did not finish booting within ${BOOT_TIMEOUT_MS / 1000} s`);
}

async function open(file, label) {
  served = [];
  await chrome.send('Page.navigate', { url: base + file }, page);
  await booted(label);
}

await open(PAGES[0], PAGES[0]);
// The service worker installs on the first visit: wait for it, then load
// again so the page is served from its cache like a return visit. It has
// finished once it controls the page, which it claims last thing when it
// activates (see sw.js).
const controlled = await evaluateWithin(`navigator.serviceWorker.ready
  .then(() => navigator.serviceWorker.controller
    ?? new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })))
  .then(() => true)`, BOOT_TIMEOUT_MS).catch(() => false);
if (!controlled) problems.push(`${PAGES[0]}: the service worker did not install`);
await open(PAGES[0], `${PAGES[0]} (cached)`);
// Production serves the game's own files from the cache; any that still
// reach the server mean the return visit tested the network instead.
const uncached = served.filter(pathname => pathname.startsWith('/js/') || pathname.startsWith('/css/'));
if (uncached.length) {
  const more = uncached.length > 3 ? ` and ${uncached.length - 3} more` : '';
  problems.push(`${PAGES[0]} (cached): fetched from the server, not the cache: ${uncached.slice(0, 3).join(', ')}${more}`);
}
for (const file of PAGES.slice(1)) await open(file, file);
// A moment for anything still in flight to land.
await sleep(1000);

clearTimeout(timer);
await chrome.close();
server.close();

if (problems.length) {
  console.error('Console test failed. The game or editor logged what production should never show:');
  for (const problem of [...new Set(problems)]) console.error('  ' + problem);
  process.exit(1);
}
console.log(`Console test passed: ${PAGES.join(' and ')} load from static hosting without a failed request, exception or warning.`);
