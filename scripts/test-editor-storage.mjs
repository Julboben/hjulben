// The editor's drafts and autosaves, and the trails saved in the browser, in
// a real browser: they are kept in IndexedDB, compressed, so a trail far
// larger than localStorage holds can be saved; what was kept in localStorage
// before moves over; a quick write as the page closes is never overwritten by
// a slower one started before it; and the play test gets its trail without
// anything being stored.
//
//   node scripts/test-editor-storage.mjs
//
// Needs Chrome, at CHROME_PATH or where macOS or Linux installs it. Without
// it the test is skipped; CI has it.
import assert from 'node:assert/strict';
import { chromePath, launchChrome, sleep, startStaticServer } from './lib/chrome.mjs';

if (!chromePath) {
  console.log('Editor storage test skipped: Chrome not found (set CHROME_PATH).');
  process.exit(0);
}

const BLANK = '/__blank__.html';
await using server = await startStaticServer({
  handle(pathname, response) {
    if (pathname !== BLANK) return false;
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>blank</title>');
    return true;
  },
});
const base = `http://127.0.0.1:${server.address().port}`;
const problems = [];
await using chrome = await launchChrome(chromePath, {
  onAttached: (_sessionId, { type }) => (type === 'page' ? ['Runtime.enable'] : []),
});
chrome.on(({ method, params }) => {
  if (method === 'Runtime.exceptionThrown') problems.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
});

const { session, evaluate } = await chrome.openTab();
const visit = async (path, ready) => {
  await chrome.send('Page.navigate', { url: base + path }, session);
  for (let i = 0; i < 200; i++) {
    await sleep(100);
    if (await evaluate(ready).catch(() => false)) return;
  }
  throw new Error(`${path} did not load${problems.length ? `: ${problems.join('; ')}` : ''}`);
};
// The editor has opened its trail once the picker lists the trails.
const openEditor = () => visit('/editor.html', 'document.querySelectorAll("#trail-picker option").length > 0');
const inEditor = body => evaluate(`(async () => {
  const drafts = await import('/js/editor/drafts.js');
  const store = await import('/js/editor/draft-store.js');
  ${body}
})()`);

// Drafts and an autosave as the editor kept them in localStorage before.
await visit(BLANK, 'document.title === "blank"');
await evaluate(`
  localStorage.setItem('hjulben-editor-drafts-v2-legacy', JSON.stringify([{ at: 1000, base: 'b', trail: { name: 'Old draft' } }]));
  localStorage.setItem('hjulben-editor-autosave-v1-legacy', JSON.stringify({ at: 2000, base: 'b', trail: { name: 'Old autosave' } }));
  localStorage.setItem('hjulben-playtest-v1', '{"name":"stale"}');
  (async () => {
    const orchard = await (await fetch('/trails/official/01-the-orchard.json')).json();
    localStorage.setItem('hjulben-browser-trails-v1', JSON.stringify([{ key: 'old-one', trail: { ...orchard, name: 'Old one' } }]));
  })();
`);
await sleep(300);

await openEditor();
const moved = await inEditor(`
  await store.whenWritten();
  return {
    draft: drafts.listDrafts('legacy').map(draft => draft.trail.name),
    autosave: drafts.readAutosave('legacy')?.trail.name,
    left: ['hjulben-editor-drafts-v2-legacy', 'hjulben-editor-autosave-v1-legacy', 'hjulben-playtest-v1'].filter(key => localStorage.getItem(key) !== null),
  };
`);
assert.deepEqual(moved.draft, ['Old draft'], 'a draft from localStorage moves over');
assert.equal(moved.autosave, 'Old autosave', 'and so does an autosave');
assert.deepEqual(moved.left, [], 'localStorage is cleared once they are written');

// Trails saved in the browser move over too, and a large one fits.
const library = await evaluate(`(async () => {
  const trails = await import('/js/trails.js');
  for (let i = 0; i < 40 && localStorage.getItem('hjulben-browser-trails-v1') !== null; i++) await new Promise(resolve => setTimeout(resolve, 50));
  const old = trails.trailEntries.find(entry => entry.id === 'browser:old-one');
  trails.saveBrowserTrail({ ...old.trail, name: 'Big', filler: 'z'.repeat(8e6) });
  return { old: old?.name, saved: await trails.browserTrailSaved(), left: localStorage.getItem('hjulben-browser-trails-v1') };
})()`);
assert.equal(library.old, 'Old one', 'a trail saved in localStorage before moves over');
assert.equal(library.left, null, 'and localStorage is cleared once it is written');
assert.equal(library.saved, true, 'a trail far larger than localStorage holds is saved');

// A trail several times larger than localStorage holds, and a write as the
// page closes racing a slower compressed one to the same key.
await inEditor(`
  drafts.addDraft('big', { name: 'Big', filler: 'x'.repeat(8e6) }, 'b');
  store.writeText('race', JSON.stringify('slow ' + 'y'.repeat(4e6)));
  store.writeText('race', JSON.stringify('closing'), { urgent: true });
  await store.whenWritten();
`);

await openEditor();
const reopened = await inEditor(`
  const big = drafts.listDrafts('big');
  const records = await new Promise((resolve, reject) => {
    const request = indexedDB.open('hjulben-editor');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const all = request.result.transaction('texts').objectStore('texts').getAll();
      all.onsuccess = () => resolve(all.result);
    };
  });
  return {
    drafts: drafts.listDrafts('legacy').length + big.length,
    size: big[0]?.trail.filler.length,
    largest: Math.max(...records.map(record => record.gzip ? record.gzip.byteLength : record.text.length)),
    race: JSON.parse(store.readText('race')),
    browser: (await import('/js/trails.js')).trailEntries.filter(entry => entry.storage === 'browser').map(entry => [entry.name, entry.trail.filler?.length ?? 0]),
  };
`);
assert.equal(reopened.drafts, 2, 'the drafts are there after a reload');
assert.equal(reopened.size, 8e6, 'the large draft is kept whole');
assert.ok(reopened.largest < 100_000, `and stored compressed (largest record ${reopened.largest} bytes)`);
assert.equal(reopened.race, 'closing', 'the write as the page closes wins over an earlier, slower one');
assert.deepEqual(reopened.browser, [['Old one', 0], ['Big', 8e6]], 'the browser\'s trails are there after a reload, whole and in order');

// The play test reads its trail from the editor's window.
const playtest = await inEditor(`
  const { openPlaytest } = await import('/js/editor/playtest.js');
  openPlaytest();
  const frame = document.getElementById('playtest-frame');
  for (let i = 0; i < 100 && frame.contentWindow.location.search !== '?playtest=1'; i++) await new Promise(resolve => setTimeout(resolve, 100));
  const trails = await new frame.contentWindow.Function("return import('/js/trails.js')")();
  return { name: trails.readPlaytestTrail()?.name, stored: localStorage.getItem('hjulben-playtest-v1') };
`);
const editing = await evaluate(`import('/js/editor/state.js').then(module => module.editor.trail.name)`);
assert.equal(playtest.name, editing, 'the play test gets the trail being edited');
assert.equal(playtest.stored, null, 'without storing it');

assert.deepEqual(problems, [], 'no exceptions');
console.log('Editor storage tests passed.');
