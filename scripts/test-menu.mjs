// Opens the game in headless Chrome and drives the menu's screens, at a wide
// window and at a phone's size: opening a screen beside the column of home's
// buttons and closing it again by its ✕, its button, Escape or the browser's
// back, moving the selection between the column and the screen with the
// keys, the narrower layout that gives home's buttons way to the screen,
// and the previews that wait until their screen opens.
//
//   node scripts/test-menu.mjs
//
// Needs Chrome, at CHROME_PATH or where macOS or Linux installs it. Without
// it the test is skipped; CI has it.
import { chromePath, launchChrome, sleep, startStaticServer } from './lib/chrome.mjs';

const BOOT_TIMEOUT_MS = 20_000;
const TOTAL_TIMEOUT_MS = 120_000;

if (!chromePath) {
  console.log('Menu test skipped: Chrome not found (set CHROME_PATH).');
  process.exit(0);
}

let failures = 0;
const check = (label, condition, detail = '') => {
  if (!condition) { failures++; console.log('FAIL', label, detail); }
  else console.log('ok  ', label);
};

// The repo as it is; the API answers nothing, as offline.
const server = await startStaticServer({
  handle(pathname, response) {
    if (!pathname.startsWith('/api/')) return false;
    response.writeHead(204, { 'Cache-Control': 'no-store' });
    response.end();
    return true;
  },
});
const base = `http://127.0.0.1:${server.address().port}/`;
const chrome = await launchChrome(chromePath);
const timer = setTimeout(async () => { console.error('Menu test timed out.'); await chrome.close(); process.exit(1); }, TOTAL_TIMEOUT_MS);
// Kept active: only the active tab gets animation frames, which the menu waits on.
const { session, evaluate } = await chrome.openTab();

/** Loads the game at `width` × `height` CSS pixels, `pixelRatio` device pixels each, and waits for the menu. */
async function load(width, height, pixelRatio = 1) {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: pixelRatio, mobile: false }, session);
  await chrome.send('Page.navigate', { url: base }, session);
  const started = Date.now();
  while (Date.now() - started < BOOT_TIMEOUT_MS) {
    const ready = await evaluate(`document.readyState === 'complete' && !document.querySelector('[data-booting]') && !document.getElementById('menu-screen').hidden`).catch(() => false);
    if (ready) return;
    await sleep(100);
  }
  throw new Error(`The menu did not open within ${BOOT_TIMEOUT_MS / 1000} s`);
}

// Helpers in the page: the open screen, the selected control, and a key press.
const PAGE_HELPERS = `
  window.t = {
    view: () => document.getElementById('menu-screen').dataset.view,
    selected: () => document.querySelector('.menu-selected')?.id || null,
    selectedInColumn: () => Boolean(document.querySelector('#menu-home .menu-selected')),
    homeShown: () => document.getElementById('menu-home').getClientRects().length > 0,
    marked: () => document.querySelector('#menu-home [aria-current="page"]')?.id || null,
    click: id => document.getElementById(id).click(),
    key: code => (document.querySelector('.menu-selected') ?? document.body)
      .dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true })),
    frames: n => new Promise(resolve => { const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step)); requestAnimationFrame(step); }),
    painted: canvas => canvas.width === ${576} && canvas.height === ${192},
  };`;
const page = async expression => evaluate(`(async () => { ${expression} })()`);

// --- A wide window: the column layout ------------------------------------
await load(1280, 800, 2);
await evaluate(PAGE_HELPERS);
check('wide: the column layout', await page(`return getComputedStyle(document.getElementById('menu-screen')).getPropertyValue('--menu-layout').trim() === 'column'`));
// Before any screen opens: their previews wait.
check('wide: no preview of a closed screen paints on home', await page(`
  await t.frames(240);
  return [...document.querySelectorAll('#menu-trail-view .trail-preview')].every(canvas => !t.painted(canvas));`));
// The backdrop is sharp on home, where it is the view, and coarser behind a screen.
const backdrop = await page(`
  const canvas = document.getElementById('menu-background'), width = canvas.getBoundingClientRect().width;
  await t.frames(2);
  const home = canvas.width / width;
  t.click('menu-trails'); await t.frames(3);
  const open = canvas.width / width;
  t.click('menu-trails'); await t.frames(3);
  return { home, open };`);
check('wide: the backdrop is drawn at the screen\'s resolution on home', Math.abs(backdrop.home - 2) < 0.05, JSON.stringify(backdrop));
check('wide: and at half of it behind an open screen', Math.abs(backdrop.open - 1) < 0.05, JSON.stringify(backdrop));

const trails = await page(`t.click('menu-trails'); await t.frames(2); return { view: t.view(), home: t.homeShown(), marked: t.marked(), inColumn: t.selectedInColumn() }`);
check('wide: Trails opens beside home\'s buttons', trails.view === 'trails' && trails.home, JSON.stringify(trails));
check('wide: its button is marked', trails.marked === 'menu-trails', trails.marked);
check('wide: the selection moves into the screen', !trails.inColumn);
check('wide: its previews paint once it opens', await page(`
  for (let i = 0; i < 300; i++) {
    if (t.painted(document.querySelector('#menu-trail-view .trail-preview'))) return true;
    await t.frames(1);
  }
  return false;`));

const crossing = await page(`
  t.key('ArrowLeft'); await t.frames(1);
  const left = t.selected();
  t.key('ArrowDown'); await t.frames(1);
  const down = t.selectedInColumn() && t.selected();
  t.key('ArrowRight'); await t.frames(1);
  return { left, down, right: t.selectedInColumn() };`);
check('wide: left crosses to the open screen\'s button', crossing.left === 'menu-trails', crossing.left);
check('wide: down stays in the column', crossing.down === 'menu-leaderboard', String(crossing.down));
check('wide: right crosses back to the screen', crossing.right === false);

const toggled = await page(`t.click('menu-trails'); await t.frames(2); return { view: t.view(), selected: t.selected() }`);
check('wide: the open screen\'s button closes it', toggled.view === 'home', toggled.view);
check('wide: back home, its button stays picked', toggled.selected === 'menu-trails', toggled.selected);

const closed = await page(`
  t.click('menu-leaderboard'); await t.frames(2);
  document.querySelector('#menu-leaderboard-view [data-menu-back]').click(); await t.frames(2);
  return { view: t.view(), selected: t.selected() };`);
check('wide: the ✕ closes a screen', closed.view === 'home' && closed.selected === 'menu-leaderboard', JSON.stringify(closed));

const escaped = await page(`
  t.click('menu-settings'); await t.frames(2);
  t.key('Escape'); await t.frames(2);
  return t.view();`);
check('wide: Escape closes a screen', escaped === 'home', escaped);

const switched = await page(`
  t.click('menu-trails'); await t.frames(2);
  t.click('menu-how-to'); await t.frames(2);
  const state = history.state?.hjulben, marked = t.marked();
  history.back();
  for (let i = 0; i < 60 && t.view() !== 'home'; i++) await t.frames(1);
  return { state, marked, after: t.view() };`);
check('wide: another button switches the screen', switched.state === 'how' && switched.marked === 'menu-how-to', JSON.stringify(switched));
check('wide: the browser\'s back then goes home, not to the screen before', switched.after === 'home', switched.after);

// --- A phone: home's buttons give way to the screen ------------------------
await load(390, 844);
await evaluate(PAGE_HELPERS);
check('phone: no column layout', await page(`return getComputedStyle(document.getElementById('menu-screen')).getPropertyValue('--menu-layout').trim() === ''`));
const phone = await page(`
  t.click('menu-trails'); await t.frames(2);
  const opened = { view: t.view(), home: t.homeShown() };
  document.querySelector('#menu-trail-view [data-menu-back]').click(); await t.frames(2);
  return { ...opened, back: t.view(), homeAgain: t.homeShown() };`);
check('phone: Trails replaces home\'s buttons', phone.view === 'trails' && !phone.home, JSON.stringify(phone));
check('phone: Back brings them back', phone.back === 'home' && phone.homeAgain, JSON.stringify(phone));

clearTimeout(timer);
await chrome.close();
server.close();
if (failures) {
  console.error(`Menu test failed: ${failures} check${failures === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log('Menu test passed.');
