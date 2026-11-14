// @ts-check
// Session state shared by the browser modules. Only game.js changes the
// ride and the state machine; the menu changes saves and preferences.
import { trails, officialTrailEntries, bonusTrailEntries, customTrailEntries } from './trails.js';
import { trailHash } from './trail-hash.js';
import { DEFAULT_LOOK, LOOK_ITEMS, lookItem, ownedLook, ownsWith } from './cosmetics.js';
import { lookUnlock, trailUnlock, unlockStatus } from './unlocks.js';
import { achievement, hasAchievement, statProgressText } from './achievements.js';
import { GHOST_MODES, loadSeenGear, saveSeenGear } from './storage.js';
import { isNight } from './time-of-day.js';

/** @typedef {import('./types.js').Ride} Ride */
/** @typedef {'menu' | 'running' | 'paused' | 'ragdoll' | 'won'} GameState */

export const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

// A live binding: importers see the system setting change while the game runs.
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export let reducedMotion = reducedMotionQuery.matches;
reducedMotionQuery.addEventListener('change', event => { reducedMotion = event.matches; });

/** Default key bindings; each action accepts several `KeyboardEvent.code`s. */
export const DEFAULT_BINDINGS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  back: ['ArrowLeft', 'KeyA'],
  forward: ['ArrowRight', 'KeyD'],
  flip: ['Space'],
  lights: ['KeyL'],
  restart: ['KeyR'],
  pause: ['KeyP'],
  fullscreen: ['KeyF'],
  interact: ['KeyE']
};

export const DEFAULT_PREFERENCES = {
  scenery: 'full',
  controls: 'show',
  sound: 'on',
  music: 'off',
  volume: 80,
  shake: reducedMotion ? 'off' : 'on',
  // On out of the box, as on a console, for the phone and the gamepad alike.
  haptics: 'on',
  ghost: 'on',
  headlight: 'on',
  bindings: DEFAULT_BINDINGS
};

const CHOICES = {
  scenery: ['full', 'reduced'], controls: ['show', 'hide'], sound: ['on', 'off'], music: ['on', 'off'],
  shake: ['on', 'off'], haptics: ['on', 'off'], ghost: GHOST_MODES,
  headlight: ['on', 'off']
};

/** Repairs preferences loaded from storage. */
export function sanitizePreferences(preferences) {
  const next = { ...DEFAULT_PREFERENCES, ...preferences };
  for (const [key, choices] of Object.entries(CHOICES)) if (!choices.includes(next[key])) next[key] = DEFAULT_PREFERENCES[key];
  const volume = Number(next.volume);
  next.volume = Number.isFinite(volume) ? Math.max(0, Math.min(100, Math.round(volume))) : DEFAULT_PREFERENCES.volume;
  const bindings = {};
  const used = new Set();
  for (const [action, codes] of Object.entries(DEFAULT_BINDINGS)) {
    const stored = next.bindings?.[action];
    const valid = Array.isArray(stored) && stored.every(code => typeof code === 'string');
    bindings[action] = valid ? stored.slice(0, 2) : codes.filter(code => !used.has(code));
    bindings[action].forEach(code => used.add(code));
  }
  next.bindings = bindings;
  return next;
}

export const session = {
  /** @type {GameState} */ state: 'menu',
  /** @type {GameState} */ stateBeforeMenu: 'running',
  trailIndex: 0,
  trail: trails[0],
  /** @type {'official' | 'bonus' | 'custom' | 'playtest'} */ trailSource: 'official',
  bonusTrailIndex: -1,
  customTrailIndex: -1,
  /** @type {import('./cosmetics.js').Look} */ look: DEFAULT_LOOK,
  unlockedTrail: 0,
  savedTrail: 0,
  /** @type {any} */ saveGame: null,
  /** @type {any[]} */ saveSlots: [null, null, null],
  activeSaveSlot: 0,
  preferences: sanitizePreferences({}),
  /** @type {Ride | null} */ ride: null,
  gameLoopStarted: false,
  /** Save the current ride belongs to, so a slot switch can't resume it. */
  /** @type {number | null} */ rideSaveId: null
};

/**
 * The ghost the rider races: the active rider's own choice, which follows
 * them to other devices, or else this device's setting.
 */
export const ghostMode = () => session.saveGame?.ghost ?? session.preferences.ghost;

export const officialTrailIds = officialTrailEntries.map(entry => entry.id);
export const leaderboardTrails = () => [...officialTrailEntries, ...bonusTrailEntries, ...customTrailEntries];

/** Shipped trails: their times are save bests and go to the online board. */
export const isRankedSource = source => source === 'official' || source === 'bonus';

// Hashing a trail reads all of it, and progressOf keys every official trail
// for each flip and jump the rider lands, mid-ride; that stalled the frame.
// Shipped trails never change while the game runs, so each is hashed once.
// A custom trail can be edited in place, so it is hashed every time.
const shippedHashes = new WeakMap();

/**
 * Leaderboard, ghost and best-time key for a trail. It includes a hash of
 * everything that decides a run, so an edit that changes the ride starts fresh
 * boards while a rename or new props keep them. Official and bonus trails keep
 * their id in front, so the online board can tell which trail it is.
 */
export function trailKey(entry) {
  if (!isRankedSource(entry.source)) return 'trail:' + trailHash(entry.trail);
  let hash = shippedHashes.get(entry.trail);
  if (hash === undefined) shippedHashes.set(entry.trail, (hash = trailHash(entry.trail)));
  return `${entry.id}@${hash}`;
}

/**
 * Where finding a trail's nisse is remembered: an official or bonus trail by
 * its id, so editing the trail keeps the find, and a custom trail by its hash.
 */
export function nisseKey(entry) {
  return isRankedSource(entry.source) ? entry.id : 'trail:' + trailHash(entry.trail);
}

export function currentTrailEntry() {
  if (session.trailSource === 'official') return officialTrailEntries[session.trailIndex];
  if (session.trailSource === 'bonus') return bonusTrailEntries[session.bonusTrailIndex];
  return customTrailEntries[session.customTrailIndex];
}

/**
 * @typedef {import('./unlocks.js').UnlockProgress & import('./achievements.js').CareerProgress & {
 *   stats: Record<string, number>
 * }} Progress
 */

/**
 * Whether the page was opened with ?debug=1 on a developer's own machine or
 * network, which turns on every debugging aid. It never works on a public
 * address, whatever the site is called, so players can't open trails and
 * gear early or reach the online board with them.
 */
export const debugMode = () =>
  isDevHost(globalThis.location?.hostname ?? '') &&
  new URLSearchParams(globalThis.location?.search ?? '').get('debug') === '1';

/** This computer, or a private network address such as a phone testing over Wi-Fi. */
const isDevHost = host =>
  ['localhost', '127.0.0.1', '[::1]'].includes(host) ||
  (/^\d+\.\d+\.\d+\.\d+$/.test(host) && /^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) ||
  host.endsWith('.local');

/**
 * The furthest official trail a save has open, by its place in the career.
 * Worked out from the trails it has finished, by id, rather than kept as a
 * place: a trail is open once the one before it is finished, and stays open
 * once finished itself, so moving or adding trails never locks a player out
 * of one they have ridden. A trail counts as finished under any version of
 * it, as in progressOf.
 */
export function unlockedOf(save) {
  // ?debug=1 opens every trail, to try any of them while building the career;
  // only the trails open, nothing counts as finished.
  if (debugMode()) return officialTrailEntries.length - 1;
  const keys = Object.keys(save?.bestTimes || {});
  let open = 0;
  officialTrailEntries.forEach((entry, index) => {
    if (keys.some(key => key.startsWith(entry.id + '@'))) open = Math.max(open, Math.min(index + 1, officialTrailEntries.length - 1));
  });
  return open;
}

/**
 * What a save has done, for unlocks and achievements: official trails
 * finished and gold medals won on them, which trails it has finished, its
 * lifetime stats and the achievements it has earned. A shipped trail counts
 * as finished under any version of it, so an edit that moves its best time
 * to a new key keeps what it won; a gold medal is checked against the
 * current medal times. A snapshot: later changes to the save don't show.
 * Null without a savegame.
 * @returns {Progress | null}
 */
export function progressOf(save) {
  if (!save) return null;
  const keys = Object.keys(save.bestTimes || {});
  const finished = trailId => keys.some(key => key.startsWith(trailId + '@'));
  let trails = 0, golds = 0;
  const nightTrails = officialTrailEntries.filter(entry => isNight(entry.trail.timeOfDay));
  for (const entry of officialTrailEntries) {
    if (finished(entry.id)) trails++;
    const best = save.bestTimes?.[trailKey(entry)];
    if (best && entry.trail.medals && best <= entry.trail.medals.gold) golds++;
  }
  const career = {
    trails, golds, officialTotal: officialTrailEntries.length,
    bonusFinished: bonusTrailEntries.filter(entry => finished(entry.id)).length, bonusTotal: bonusTrailEntries.length,
    // The official trails with a nisse, and how many of those it was found on.
    nisseTotal: officialTrailEntries.filter(entry => entry.trail.nisse).length,
    nisseFound: officialTrailEntries.filter(entry => entry.trail.nisse && save.nisse?.[nisseKey(entry)]).length,
    // The official trails at night, and how many of those it has finished.
    nightTotal: nightTrails.length,
    nightFinished: nightTrails.filter(entry => finished(entry.id)).length,
  };
  const achievements = { ...save.achievements };
  const stats = { ...save.stats };
  return { ...career, finished, stats, has: id => hasAchievement(id, achievements, stats, career) };
}

/**
 * Which rider items a save may wear. ?debug=1 opens every item, to try any of
 * it in the Garage; as with the trails, nothing counts as won, so a look saved
 * there rides in its starter items again without the flag.
 */
export const lookOwner = save => (debugMode() ? (slot, id) => Boolean(lookItem(slot, id)) : ownsWith(progressOf(save)));

/** The look a save rides in: its own, with any item it hasn't unlocked swapped for a starter one. */
export const riderLook = (save = session.saveGame) => (save ? ownedLook(save.look, lookOwner(save)) : DEFAULT_LOOK);

/** A shipped trail's name, by catalog id, for unlock hints. */
const shippedTrailName = trailId =>
  [...officialTrailEntries, ...bonusTrailEntries].find(entry => entry.id === trailId)?.name ?? 'a trail';

/**
 * What unlocks a rider item, in the words the trail list uses, or '' for
 * items everyone has.
 * @param {import('./cosmetics.js').LookItem} item
 */
export const lookItemHint = item => unlockStatus(lookUnlock(item.slot, item.id), null, shippedTrailName).hint;

/**
 * How far a career has got towards a locked rider item, e.g. 137 / 500 for an
 * achievement that counts apples, or '' when there is nothing to count.
 * Secret achievements keep their goal to themselves.
 * @param {import('./cosmetics.js').LookItem} item
 */
export function lookItemProgress(item, progress) {
  const rule = lookUnlock(item.slot, item.id);
  if (!rule || !progress) return '';
  const tally = (have, need) => Math.min(have, need) + ' / ' + need;
  const parts = [];
  if (rule.trails) parts.push(tally(progress.trails, rule.trails));
  if (rule.golds) parts.push(tally(progress.golds, rule.golds));
  const wanted = rule.achievement ? achievement(rule.achievement) : null;
  if (wanted && !wanted.secret) {
    if (wanted.stat) parts.push(statProgressText(wanted, progress.stats[wanted.stat] || 0));
    else if (wanted.tally) parts.push(tally(...wanted.tally(progress)));
  }
  return parts.join(' · ');
}

/**
 * The won items (as 'slot:id' keys) a save's rider has yet to see in the
 * Garage on this device. Won by its real progress, so ?debug=1 opening every
 * item doesn't count them as seen. A rider with no record yet, such as one
 * from before the badges, has seen everything won so far.
 */
export function unseenGear(save) {
  if (!save) return [];
  const owns = ownsWith(progressOf(save));
  const won = LOOK_ITEMS.filter(item => !item.hidden && lookUnlock(item.slot, item.id) && owns(item.slot, item.id))
    .map(item => item.slot + ':' + item.id);
  const seen = loadSeenGear(save.playerId);
  if (!seen) { saveSeenGear(save.playerId, won); return []; }
  return won.filter(key => !seen.includes(key));
}

/** Records the items (as 'slot:id' keys) as seen in the Garage. */
export function markGearSeen(save, keys) {
  if (!save || !keys.length) return;
  const seen = loadSeenGear(save.playerId) ?? [];
  if (keys.every(key => seen.includes(key))) return;
  saveSeenGear(save.playerId, [...seen, ...keys]);
}

/**
 * What a save's career has put in the Garage (see drawGarage).
 * @returns {import('./garage-backdrop.js').GarageRoom | null}
 */
export function garageRoom(save) {
  const progress = progressOf(save);
  if (!progress) return null;
  return {
    route: progress.officialTotal ? Math.min(1, progress.trails / progress.officialTotal) : 0,
    cups: ['golden-touch', 'hat-trick', 'black-tie', 'gold-rush'].filter(id => progress.has(id)).length,
    nisse: (progress.nisseFound ?? 0) > 0,
    coda: progress.has('pet-coda'),
  };
}

/** The bonus trails open with `after`'s progress that were shut with `before`'s (see progressOf). */
export const newlyOpenedBonusTrails = (before, after) => bonusTrailEntries.filter(entry => {
  const rule = trailUnlock(entry.id);
  return rule && !unlockStatus(rule, before, shippedTrailName).open && unlockStatus(rule, after, shippedTrailName).open;
});

/** Whether a bonus trail is open for this save, and what opens it if not. */
export const bonusUnlock = (entry, save = session.saveGame) =>
  unlockStatus(trailUnlock(entry.id), progressOf(save), shippedTrailName);

export function timeText(seconds) {
  const tenths = Math.floor(seconds * 10 + 0.00001);
  return Math.floor(tenths / 600) + ':' + String(Math.floor(tenths / 10) % 60).padStart(2, '0') + '.' + (tenths % 10);
}

/** A finished run's time to the millisecond, e.g. 1:04.517. */
export function runTimeText(seconds) {
  const ms = Math.round(seconds * 1000);
  return Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0') + '.' + String(ms % 1000).padStart(3, '0');
}

export function deltaText(seconds) {
  const sign = seconds < 0 ? '−' : '+';
  return sign + Math.abs(seconds).toFixed(2);
}

/** A trail's number, by its index in leaderboardTrails(): 01, B01 or C01. */
export function trailMarker(index) {
  if (index < officialTrailEntries.length) return String(index + 1).padStart(2, '0');
  index -= officialTrailEntries.length;
  if (index < bonusTrailEntries.length) return `B${String(index + 1).padStart(2, '0')}`;
  return `C${String(index - bonusTrailEntries.length + 1).padStart(2, '0')}`;
}
