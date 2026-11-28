// Opens the game in headless Chrome and drives the menu's screens, at a wide
// window and at a phone's size: opening a screen beside the column of home's
// buttons and closing it again by its ✕, its button, Escape or the browser's
// back, moving the selection between the column and the screen with the
// keys, the narrower layout that gives home's buttons way to the screen,
// the trails' thumbnails, drawn ahead, the previews drawn in the game,
// which wait until their screen opens, the flights between the backdrop and
// the ride (Continue and Resume ride into it, and Escape out of a ride the
// rider has set off on), the trail Continue leads to, the rewind a restart
// plays (see test-rewind.mjs for its recorder), and where the Garage keeps
// its buttons.
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
    // A canvas is clear until a preview, opaque sky and all, is painted into it.
    painted: canvas => canvas.getContext('2d').getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data[3] > 0,
    howArt: () => [...document.querySelectorAll('[data-how-art]')],
  };`;
const page = async expression => evaluate(`(async () => { ${expression} })()`);

// --- A wide window: the column layout ------------------------------------
await load(1280, 800, 2);
await evaluate(PAGE_HELPERS);
check('wide: the column layout', await page(`return getComputedStyle(document.getElementById('menu-screen')).getPropertyValue('--menu-layout').trim() === 'column'`));
// Before any screen opens: their previews wait.
check('wide: no preview of a closed screen paints on home', await page(`
  await t.frames(240);
  return t.howArt().length > 0 && t.howArt().every(canvas => !t.painted(canvas));`));
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
check('wide: its trails show their thumbnails, drawn ahead', await page(`
  const image = document.querySelector('#menu-trail-view .trail-preview');
  for (let i = 0; i < 300 && !(image.complete && image.naturalWidth); i++) await t.frames(1);
  return image.tagName === 'IMG' && image.naturalWidth === 576 && image.naturalHeight === 192;`));

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
  for (let i = 0; i < 300 && !t.painted(t.howArt()[0]); i++) await t.frames(1);
  const painted = t.painted(t.howArt()[0]);
  history.back();
  for (let i = 0; i < 60 && t.view() !== 'home'; i++) await t.frames(1);
  return { state, marked, painted, after: t.view() };`);
check('wide: another button switches the screen', switched.state === 'how' && switched.marked === 'menu-how-to', JSON.stringify(switched));
check('wide: its previews paint once it opens', switched.painted);
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

// --- Continue: flying from the backdrop into the ride ------------------------
// A rider who has seen How to play, so Continue starts their next trail,
// the one the backdrop shows.
await evaluate(`(async () => {
  const storage = await import('/js/storage.js'), { trails } = await import('/js/trails.js');
  storage.createSave(0, {}, trails.length, 'Tester');
  storage.saveSeenHowTo();
})()`);
await load(1280, 800, 2);
await evaluate(PAGE_HELPERS);
const flight = await page(`
  const screen = document.getElementById('menu-screen'), game = document.getElementById('game');
  t.click('menu-continue'); await t.frames(2);
  const flying = 'flying' in screen.dataset;
  for (let i = 0; i < 180 && !screen.hidden; i++) await t.frames(1);
  return { flying, landed: screen.hidden, riding: !game.classList.contains('menu-open'), arrived: 'arrived' in game.dataset };`);
check('Continue flies from the backdrop into the ride', flight.flying && flight.landed && flight.riding && flight.arrived, JSON.stringify(flight));
// Before the rider sets off there is nothing to resume: Escape opens the menu
// as it is with no ride, Continue and the trail moving behind it, flown out
// to as this is the trail Continue leads to. Escape on home keeps it open,
// and Continue flies into the trail again.
const waiting = await page(`
  const screen = document.getElementById('menu-screen'), backdrop = document.getElementById('menu-background');
  t.key('Escape'); await t.frames(2);
  const at = { open: !screen.hidden, flewOut: screen.dataset.flying === 'out', label: document.getElementById('active-save-label').textContent };
  for (let i = 0; i < 180 && 'flying' in screen.dataset; i++) await t.frames(1);
  const drawn = backdrop.toDataURL();
  await t.frames(30);
  const moving = backdrop.toDataURL() !== drawn;
  t.key('Escape'); await t.frames(2);
  const stays = !screen.hidden;
  t.click('menu-continue'); await t.frames(2);
  const flying = 'flying' in screen.dataset;
  for (let i = 0; i < 180 && !screen.hidden; i++) await t.frames(1);
  return { ...at, moving, stays, flying, landed: screen.hidden };`);
check('Escape before setting off opens the menu with Continue, flying out to the trail moving behind it', waiting.open && waiting.flewOut && waiting.label === 'CONTINUE' && waiting.moving, JSON.stringify(waiting));
check('where Escape keeps it open, and Continue flies into the trail', waiting.stays && waiting.flying && waiting.landed, JSON.stringify(waiting));
// Setting off makes the ride one to resume.
await page(`
  const game = document.getElementById('game');
  const { session } = await import('/js/state.js');
  game.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp', bubbles: true }));
  for (let i = 0; i < 120 && !session.ride.started; i++) await t.frames(1);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp', key: 'ArrowUp' }));`);
// Escape mid-ride opens the menu at once, usable, while the backdrop flies
// out of the ride behind it, which holds still there.
const reopened = await page(`
  const menu = document.getElementById('menu-screen'), backdrop = document.getElementById('menu-background');
  t.key('Escape'); await t.frames(2);
  const at = { flying: menu.dataset.flying, open: !menu.hidden, usable: !menu.inert, selected: t.selected(), label: document.getElementById('active-save-label').textContent };
  for (let i = 0; i < 180 && 'flying' in menu.dataset; i++) await t.frames(1);
  const screen = menu.getBoundingClientRect(), box = backdrop.getBoundingClientRect();
  const landed = backdrop.toDataURL();
  await t.frames(30);
  return { ...at, landed: !('flying' in menu.dataset), styled: backdrop.hasAttribute('style'), fits: box.width === screen.width && box.height === screen.height,
    still: backdrop.toDataURL() === landed };`);
check('Escape opens the menu at once, Resume ride picked', reopened.open && reopened.usable && reopened.selected === 'menu-continue' && reopened.label === 'RESUME RIDE', JSON.stringify(reopened));
check('while the backdrop flies out of the ride, to land over the whole menu', reopened.flying === 'out' && reopened.landed && !reopened.styled && reopened.fits, JSON.stringify(reopened));
check('and the ride behind the menu holds still, as a paused ride does', reopened.still, JSON.stringify(reopened));
// Resume ride flies back into the ride the backdrop shows; Escape on the
// way can't stop it. Gas pressed in the menu is held when the ride carries on.
const resumed = await page(`
  const screen = document.getElementById('menu-screen'), game = document.getElementById('game');
  const { session } = await import('/js/state.js');
  t.key('ArrowUp');
  t.click('menu-continue'); await t.frames(2);
  const flying = 'flying' in screen.dataset;
  t.key('Escape');
  for (let i = 0; i < 180 && !screen.hidden; i++) await t.frames(1);
  await t.frames(20);
  const throttle = session.ride.throttle;
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp', key: 'ArrowUp' }));
  return { flying, landed: screen.hidden, riding: !game.classList.contains('menu-open'), throttle };`);
check('Resume ride flies back into the ride, past an Escape', resumed.flying && resumed.landed && resumed.riding, JSON.stringify(resumed));
check('gas pressed in the menu is held in the ride', resumed.throttle > 0.5, JSON.stringify(resumed));
// Gas let go of in the rider's name field, which keeps its keys to itself, is
// let go of in the ride too.
const letGo = await page(`
  const screen = document.getElementById('menu-screen');
  const { session } = await import('/js/state.js');
  t.key('Escape');
  for (let i = 0; i < 180 && 'flying' in screen.dataset; i++) await t.frames(1);
  t.key('ArrowUp');
  document.getElementById('new-save-name').dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp', key: 'ArrowUp', bubbles: true }));
  t.click('menu-continue');
  for (let i = 0; i < 180 && !screen.hidden; i++) await t.frames(1);
  await t.frames(30);
  return { throttle: session.ride.throttle };`);
check('gas let go of in the name field is let go of in the ride', letGo.throttle < 0.5, JSON.stringify(letGo));
// Reduced motion turned on mid-flight lands the flight rather than leave the
// menu stuck over the ride.
await page(`
  const screen = document.getElementById('menu-screen');
  t.key('Escape');
  for (let i = 0; i < 180 && 'flying' in screen.dataset; i++) await t.frames(1);
  t.click('menu-continue'); await t.frames(2);`);
await chrome.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, session);
const stilled = await page(`
  const screen = document.getElementById('menu-screen');
  for (let i = 0; i < 30 && !screen.hidden; i++) await t.frames(1);
  return { landed: screen.hidden, usable: !screen.inert, riding: !document.getElementById('game').classList.contains('menu-open') };`);
await chrome.send('Emulation.setEmulatedMedia', { features: [] }, session);
// The page hears of the change a little later: wait for the game to before
// the rewind checks, which reduced motion turns into plain restarts.
await page(`
  const state = await import('/js/state.js');
  for (let i = 0; i < 60 && state.reducedMotion; i++) await t.frames(1);`);
check('reduced motion turned on mid-flight lands it', stilled.landed && stilled.usable && stilled.riding, JSON.stringify(stilled));

// --- Restarting: hands off the controls, the run rewinds to the start; with a
// hand on them, or once one is pressed, it starts again at once under a flourish
const RIDE = `
  const game = document.getElementById('game');
  const { session } = await import('/js/state.js');
  const ride = (type, code) => (type === 'keyup' ? window : game).dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
  ride('keydown', 'ArrowUp');
  for (let i = 0; i < 300 && session.ride.elapsed < 1.3; i++) await t.frames(1);`;
const RIDE_AND_RESTART = `${RIDE}
  ride('keyup', 'ArrowUp');
  ride('keydown', 'KeyR'); ride('keyup', 'KeyR');
  const rewinding = 'rewinding' in game.dataset;`;
const rewound = await page(`${RIDE_AND_RESTART}
  let frames = 0;
  for (; frames < 120 && 'rewinding' in game.dataset; frames++) await t.frames(1);
  return { rewinding, frames, back: !('rewinding' in game.dataset), elapsed: session.ride.elapsed, state: session.state };`);
check('R rewinds a run to the start', rewound.rewinding && rewound.back && rewound.frames > 10 && rewound.elapsed === 0 && rewound.state === 'running', JSON.stringify(rewound));
const skipped = await page(`${RIDE_AND_RESTART}
  await t.frames(2);
  ride('keydown', 'ArrowUp'); await t.frames(2);
  const result = { rewinding, back: !('rewinding' in game.dataset), flourish: 'rewound' in game.dataset, gas: session.ride.throttle };
  ride('keyup', 'ArrowUp');
  return result;`);
check('and gas pressed during it skips to the run, gas held, under the flourish', skipped.rewinding && skipped.back && skipped.flourish && skipped.gas > 0, JSON.stringify(skipped));
const instant = await page(`${RIDE}
  ride('keydown', 'KeyR'); ride('keyup', 'KeyR');
  const at = { rewinding: 'rewinding' in game.dataset, flourish: 'rewound' in game.dataset, steps: session.ride.steps };
  for (let i = 0; i < 60 && 'rewound' in game.dataset; i++) await t.frames(1);
  ride('keyup', 'ArrowUp');
  return { ...at, ended: !('rewound' in game.dataset) };`);
check('gas held at R starts the run again at once, under the flourish', !instant.rewinding && instant.flourish && instant.steps === 0 && instant.ended, JSON.stringify(instant));
// A wait at the line isn't riding: a short ride after one restarts at once.
const waited = await page(`
  const game = document.getElementById('game');
  const { session } = await import('/js/state.js');
  const ride = (type, code) => (type === 'keyup' ? window : game).dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
  ride('keydown', 'KeyR'); ride('keyup', 'KeyR');
  for (let i = 0; i < 120 && ('rewinding' in game.dataset || 'rewound' in game.dataset); i++) await t.frames(1);
  await t.frames(90);
  ride('keydown', 'ArrowUp');
  for (let i = 0; i < 120 && session.ride.elapsed < 0.4; i++) await t.frames(1);
  ride('keyup', 'ArrowUp');
  ride('keydown', 'KeyR'); ride('keyup', 'KeyR');
  return { rewinding: 'rewinding' in game.dataset, steps: session.ride.steps };`);
check('a short ride after a wait at the line restarts at once', !waited.rewinding && waited.steps === 0, JSON.stringify(waited));

// --- Buttons for a whole screen: in its head on a wide screen, where the page
// has them on a phone. A screen starts on what it shows, not on them.
const placed = `
  const inHead = id => Boolean(document.getElementById(id).closest('.menu-view-head'));
  const startsInHead = () => Boolean(document.querySelector('.menu-selected')?.closest('.menu-view-head'));
  t.click('menu-garage'); await t.frames(3);
  const garage = { view: t.view(), inHead: inHead('save-look'), pinned: getComputedStyle(document.querySelector('#save-look').closest('.look-actions')).position === 'fixed', startsInHead: startsInHead() };
  t.click('menu-garage'); await t.frames(2);
  t.click('menu-settings'); await t.frames(3);
  const settings = { view: t.view(), reset: inHead('reset-settings'), credits: inHead('show-credits'), about: !document.getElementById('settings-about').hidden, startsInHead: startsInHead() };
  return { garage, settings };`;
await load(1280, 800, 2);
await evaluate(PAGE_HELPERS);
const wideScreens = await page(placed);
check('wide: the Garage\'s buttons sit in its head', wideScreens.garage.view === 'look' && wideScreens.garage.inHead && !wideScreens.garage.pinned, JSON.stringify(wideScreens.garage));
check('wide: and Settings\' Reset and Credits, without the About heading', wideScreens.settings.view === 'settings' && wideScreens.settings.reset && wideScreens.settings.credits && !wideScreens.settings.about, JSON.stringify(wideScreens.settings));
check('wide: the screens start on what they show, past those buttons', !wideScreens.garage.startsInHead && !wideScreens.settings.startsInHead, JSON.stringify(wideScreens));
// Changelog, in the column beside the Garage, asks first about an unsaved look.
const guarded = await page(`
  t.click('menu-garage'); await t.frames(3);
  [...document.querySelectorAll('#garage-look .look-option')].find(option => option.getAttribute('aria-checked') === 'false' && !option.classList.contains('locked')).click();
  await t.frames(2);
  t.click('menu-whats-new'); await t.frames(2);
  const asked = document.getElementById('look-confirm').open, view = t.view();
  document.getElementById('look-confirm-discard').click(); await t.frames(2);
  return { asked, view };`);
check('wide: Changelog asks first about an unsaved look', guarded.asked && guarded.view === 'look', JSON.stringify(guarded));
await load(390, 844);
await evaluate(PAGE_HELPERS);
const phoneScreens = await page(placed);
check('phone: the Garage\'s buttons make a bar along the bottom', phoneScreens.garage.view === 'look' && !phoneScreens.garage.inHead && phoneScreens.garage.pinned, JSON.stringify(phoneScreens.garage));
check('phone: and Reset and Credits stay in Settings', !phoneScreens.settings.reset && !phoneScreens.settings.credits && phoneScreens.settings.about, JSON.stringify(phoneScreens.settings));

// --- Continue leads on to the next trail not yet finished, not back to the
// one opened last.
await evaluate(`(async () => {
  const storage = await import('/js/storage.js'), { trails, officialTrailEntries } = await import('/js/trails.js'), { trailKey } = await import('/js/state.js');
  officialTrailEntries.slice(0, 2).forEach(entry => storage.saveBest(0, trailKey(entry), 30, trails.length));
  storage.saveProgress(0, 0, 2, trails.length);
})()`);
await load(1280, 800, 2);
const next = await evaluate(`(async () => {
  const { trails } = await import('/js/trails.js');
  return { title: document.getElementById('active-save-title').textContent, third: trails[2].name };
})()`);
check('Continue names the next trail not yet finished', next.title === next.third, JSON.stringify(next));

clearTimeout(timer);
await chrome.close();
server.close();
if (failures) {
  console.error(`Menu test failed: ${failures} check${failures === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log('Menu test passed.');
