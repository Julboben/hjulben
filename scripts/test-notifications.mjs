// The notification log behind the menu's bell (js/notifications.js): what it
// keeps, what it counts as unread, and whose entries a rider sees.
import assert from 'node:assert/strict';

const items = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: key => items.get(key) ?? null,
  setItem: (key, value) => items.set(key, String(value)),
  removeItem: key => items.delete(key),
  key: index => [...items.keys()][index] ?? null,
  get length() { return items.size; },
});
globalThis.window = /** @type {any} */ (new EventTarget());

const log = await import('../js/notifications.js');
const storage = await import('../js/storage.js');

const freja = '0a1b2c3d-1111-4222-8333-444455556666';
const bo = '0a1b2c3d-2222-4222-8333-444455556666';
const entry = (key, playerId, at) => ({ key, playerId, at, label: 'NEW GEAR', title: key, text: '', icon: 'garage', opens: { view: 'garage' } });
let announced = 0;
window.addEventListener(log.NOTIFICATIONS_EVENT, () => announced++);

// --- Whose entries a rider sees, newest first ----------------------------------

{
  log.notify(entry('a', freja, 1));
  log.notify(entry('b', bo, 2));
  log.notify(entry('version', null, 3));
  log.notify(entry('c', freja, 4));
  assert.equal(announced, 4, 'each change is announced');
  assert.deepEqual(log.notificationsFor(freja).map(item => item.key), ['c', 'version', 'a'], 'a rider sees their own and the device\'s, newest first');
  assert.deepEqual(log.notificationsFor(null).map(item => item.key), ['version'], 'without a rider, only the device\'s');
  assert.equal(log.unreadCount(freja), 3);
}

// --- Reading -------------------------------------------------------------------

{
  log.markRead(bo, ['version']);
  assert.equal(log.unreadCount(freja), 2, 'reading the device\'s news reads it for everyone');
  log.markRead(freja);
  assert.equal(log.unreadCount(freja), 0);
  assert.equal(log.unreadCount(bo), 1, 'another rider\'s entries stay unread');
  const before = announced;
  log.markRead(freja);
  assert.equal(announced, before, 'nothing to read, nothing announced');
}

// --- The same news again --------------------------------------------------------

{
  log.notify(entry('a', freja, 10));
  const again = log.notificationsFor(freja).filter(item => item.key === 'a');
  assert.equal(again.length, 1, 'one entry per key');
  assert.equal(again[0].read, false, 'news again is unread again');
  assert.equal(log.notificationsFor(freja)[0].key, 'a', 'and back at the top');
}

// --- A full log keeps the newest ------------------------------------------------

{
  for (let index = 0; index < 80; index++) log.notify(entry('many' + index, bo, 100 + index));
  const kept = log.notificationsFor(bo);
  assert.equal(kept.length, 60, 'the log has a limit');
  assert.equal(kept[0].key, 'many79');
  assert.ok(!log.notificationsFor(freja).some(item => item.key === 'version'), 'the oldest go first');
}

// --- The server's news, and a rider who is gone ----------------------------------

{
  assert.equal(log.lastNoticeId(freja), 0);
  log.setLastNoticeId(freja, 7);
  log.setLastNoticeId(freja, 5);
  assert.equal(log.lastNoticeId(freja), 7, 'the last notice taken only moves on');
  log.notify(entry('d', freja, 200));

  const slot = storage.createSave(0, {}, 3, 'Freja', { playerId: freja, token: 'aaa.bbb' });
  assert.ok(slot);
  storage.deleteSave(0, 3);
  assert.equal(log.notificationsFor(freja).length, 0, 'a removed rider\'s entries go with them');
  assert.equal(log.lastNoticeId(freja), 0, 'and so does where their news had got to');
  assert.equal(log.notificationsFor(bo)[0].key, 'many79', 'other riders keep theirs');
}

console.log('Notification tests passed.');
