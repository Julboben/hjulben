// Headless Chrome for scripts that need a real browser: a static server for
// the repo's files, Chrome driven over its DevTools protocol, and a tab to
// run code in. Used by scripts/test-console.mjs and scripts/render-trail.mjs.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { contentType } from './mime-types.mjs';
import { repoRoot } from './trails.mjs';

/** Chrome, at CHROME_PATH or where macOS or Linux installs it; undefined without one. */
export const chromePath = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(candidate => candidate && existsSync(candidate));

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Static hosting: the repo's files as they are, and nothing else. `handle`
 * may answer a request first (returning true); every request is passed to
 * `onRequest` with the status it got, so none can go unseen.
 * @param {{ onRequest?: (pathname: string, status: number) => void,
 *   handle?: (pathname: string, response: http.ServerResponse) => boolean }} [options]
 * @returns {Promise<http.Server>}
 */
export function startStaticServer({ onRequest = () => {}, handle = () => false } = {}) {
  const server = http.createServer(async (request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    response.on('finish', () => onRequest(pathname, response.statusCode));
    if (handle(pathname, response)) return;
    let filePath = path.normalize(path.join(repoRoot, decodeURIComponent(pathname)));
    if (!filePath.startsWith(repoRoot)) { response.writeHead(403); return response.end(); }
    try {
      if ((await stat(filePath)).isDirectory()) filePath = path.join(filePath, 'index.html');
      const content = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store' });
      response.end(content);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      response.writeHead(404, { 'Cache-Control': 'no-store' });
      response.end();
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/**
 * A connection to Chrome's DevTools protocol, attached to every page and
 * worker it opens. `onAttached` names the domains to enable on each.
 * @param {string} chromePath
 * @param {{ flags?: string[], onAttached?: (sessionId: string, targetInfo: any) => string[] }} [options]
 */
const STARTUP_MS = 30_000;
// How long Chrome gets to quit when asked before it is killed.
const CLOSE_MS = 5_000;

export async function launchChrome(chromePath, { flags = [], onAttached = () => [] } = {}) {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'hjulben-chrome-'));
  const allFlags = [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio', '--window-size=1200,800',
    // A fresh profile otherwise downloads and installs Chrome's default
    // extensions a few seconds after it starts. Installing one kills a page's
    // service worker that is still installing ("failed to install: Operation
    // has failed"), which a busy machine makes likely, and it all costs CPU
    // the pages need.
    '--disable-extensions', '--disable-component-update', '--disable-background-networking',
    ...flags,
  ];
  if (process.getuid?.() === 0) allFlags.push('--no-sandbox');
  const chrome = spawn(chromePath, [...allFlags, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  // A script that throws, times out or exits before close() would leave this
  // Chrome running for good, and leftovers slow every later run until they
  // hang it. Exit handlers can only do synchronous work, which kill() is.
  const killOnExit = () => { if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL'); };
  process.once('exit', killOnExit);
  // The end of what Chrome says on stderr, to tell why it didn't start.
  let said = '';
  chrome.stderr.on('data', chunk => { said = (said + chunk).slice(-2000); });
  // Chrome writes the port it picked here once it listens. A busy CI machine
  // can take many seconds to start it, so it gets STARTUP_MS.
  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  let endpoint = null;
  for (const started = Date.now(); !endpoint && Date.now() - started < STARTUP_MS;) {
    await sleep(100);
    if (chrome.exitCode !== null || chrome.signalCode !== null) break;
    try {
      const [port, wsPath] = (await readFile(portFile, 'utf8')).trim().split('\n');
      endpoint = `ws://127.0.0.1:${port}${wsPath}`;
    } catch (_) { /* not up yet */ }
  }
  if (!endpoint) {
    const ended = chrome.exitCode ?? chrome.signalCode;
    chrome.kill();
    throw new Error(`Chrome did not start${ended !== null ? ` (it exited: ${ended})` : ` within ${STARTUP_MS / 1000} s`}${said.trim() ? `:\n${said.trim()}` : ''}`);
  }
  const ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('Could not connect to Chrome')); });
  let nextId = 0;
  const pending = new Map();
  const listeners = [];
  const sessionOf = new Map(); // targetId -> sessionId
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else if (message.method) {
      for (const listener of listeners) listener(message);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, message => (message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result)));
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  listeners.push(message => {
    if (message.method !== 'Target.attachedToTarget') return;
    const { sessionId, targetInfo } = message.params;
    sessionOf.set(targetInfo.targetId, sessionId);
    for (const method of onAttached(sessionId, targetInfo)) send(method, {}, sessionId).catch(() => {});
  });
  // Pages and workers are attached as they appear. They are not held until
  // the listeners are on (waitForDebuggerOnStart): Chrome then stalls a
  // navigation served by the service worker. So a worker's first requests
  // may go unseen; its warnings and everything after are caught, and a
  // page's listeners can be confirmed on before it is navigated.
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  return {
    send,
    on: listener => listeners.push(listener),
    /**
     * A new tab, kept active: only the active tab gets animation frames.
     * @returns {Promise<{ session: string, evaluate: (expression: string) => Promise<any> }>}
     */
    async openTab() {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      await send('Target.activateTarget', { targetId });
      let session = null;
      for (let i = 0; i < 50 && !session; i++) {
        await sleep(100);
        session = sessionOf.get(targetId);
      }
      if (!session) throw new Error('Chrome did not open the page');
      const evaluate = async expression => {
        const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session);
        if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
        return result.value;
      };
      return { session, evaluate };
    },
    /**
     * Stops Chrome, then removes its profile: Chrome writes to it until it has
     * exited. A Chrome that ignores the request is killed outright.
     */
    async close() {
      ws.close();
      process.removeListener('exit', killOnExit);
      if (chrome.exitCode === null && chrome.signalCode === null) {
        const exited = new Promise(resolve => chrome.once('exit', resolve));
        chrome.kill();
        const stubborn = setTimeout(() => chrome.kill('SIGKILL'), CLOSE_MS);
        await exited;
        clearTimeout(stubborn);
      }
      // Leftovers in the temporary directory are no reason to fail.
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}
