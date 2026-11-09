import { clamp } from './config.js';
import { STORAGE_FAILED_EVENT, store } from './local-store.js';
import { cachedOnlineBoard } from './online-leaderboard.js';
import { RIDE_VERSION } from './ride.js';
import { cleanRiderName } from './rider-name.js';
import { isDefaultItem, keepIdentity, legacyRider, lookOf, normalizeLook, ownedLook } from './cosmetics.js';
import { aheadOf, cleanAchievements, cleanStats, mergeAchievements, mergeStats } from './achievements.js';
import { cleanNisseFinds, mergeNisseFinds } from './nisse.js';

const SETTINGS_KEY = 'hjulben-settings-v1';
const SAVE_SLOTS_KEY = 'hjulben-saves-v2';
const ACTIVE_SLOT_KEY = 'hjulben-active-slot-v1';
const LEADERBOARD_KEY = 'hjulben-leaderboard-v1';
const SEEN_VERSION_KEY = 'hjulben-seen-version-v1';
const SEEN_HOW_TO_KEY = 'hjulben-seen-how-to-v1';
const SEEN_GEAR_KEY = 'hjulben-seen-gear-v1';
const NOTIFICATIONS_KEY = 'hjulben-notifications-v1';
const SLOT_COUNT = 3;
// The ghost a rider races (see the Ghost setting): their own best, the faster
// of that and the world's best, or none.
export const GHOST_MODES = ['on', 'world', 'off'];
export const LEADERBOARD_SIZE = 10;
export { STORAGE_FAILED_EVENT };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export { cleanRiderName };

// crypto.randomUUID only exists on https/localhost, so fall back for LAN testing.
const newPlayerId = () => globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });

// Parsed copies of each key. storage is only read on first use and after
// another tab writes, and every change is written through immediately.
const cache = new Map();
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === null) cache.clear();
    else cache.delete(event.key);
  });
}

function readJson(key, fallback) {
  if (cache.has(key)) return cache.get(key);
  let value = fallback;
  try { value = JSON.parse(store().getItem(key) || 'null') ?? fallback; } catch (_) {}
  cache.set(key, value);
  return value;
}

/**
 * Writes through to storage. The parsed copy is kept even when the write
 * fails, so the session carries on with what it has, and the failure is
 * announced so the player can be told their progress won't survive a reload.
 */
function writeThrough(key, text) {
  try {
    store().setItem(key, text);
  } catch (_) {
    // Full: make room by dropping ghosts of outdated runs, then try once more.
    pruneGhosts();
    try { store().setItem(key, text); } catch (_) {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STORAGE_FAILED_EVENT, { detail: { key } }));
    }
  }
}

function writeJson(key, value) {
  cache.set(key, value);
  writeThrough(key, JSON.stringify(value));
}

const emptySlots = () => Array(SLOT_COUNT).fill(null);
const cloneSave = save => save && {
  ...save, look: { ...save.look }, bestTimes: { ...save.bestTimes }, achievements: { ...save.achievements }, stats: { ...save.stats },
  nisse: { ...save.nisse }
};
const TOKEN_RE = /^[\w-]+\.[\w-]+$/;

// Saves from before looks existed only have a `rider` of 'male' or 'female',
// which becomes the matching look; `rider` is still written for older clients.
// Anything else that is off gets repaired rather than dropped: a save holds
// best times and achievements that must not vanish over a bad name.
function normalizeSave(save, trailCount) {
  if (!save || typeof save !== 'object') return null;
  const look = lookOf(save);
  const name = cleanRiderName(save.name) || 'Rider';
  const playerId = typeof save.playerId === 'string' && UUID_RE.test(save.playerId) ? save.playerId : newPlayerId();
  const unlocked = clamp(Number(save.unlocked) || 0, 0, trailCount - 1);
  const trail = clamp(Number(save.trail) || 0, 0, unlocked);
  // Keyed by trailKey(), so editing a trail's gameplay leaves its old best behind.
  const stored = save.bestTimes && typeof save.bestTimes === 'object' && !Array.isArray(save.bestTimes) ? save.bestTimes : {};
  const bestTimes = Object.fromEntries(Object.entries(stored)
    .map(([key, value]) => [key, Number(value)])
    .filter(([, value]) => Number.isFinite(value) && value > 0));
  return {
    look, rider: legacyRider(look), createdAt: Number(save.createdAt) || Date.now(), trail, unlocked, bestTimes,
    // When the look was last changed in the Garage; the newer of two copies wins when they merge.
    lookUpdatedAt: Math.max(0, Math.floor(Number(save.lookUpdatedAt)) || 0),
    // The ghost the rider races, kept with the rider so it follows them to
    // other devices; null until they pick one, and the device's setting applies.
    ghost: GHOST_MODES.includes(save.ghost) ? save.ghost : null,
    ghostUpdatedAt: Math.max(0, Math.floor(Number(save.ghostUpdatedAt)) || 0),
    // Earned achievements (id -> time) and lifetime stats; see achievements.js.
    achievements: cleanAchievements(save.achievements), stats: cleanStats(save.stats),
    // Where the rider has found a trail's nisse: trail key -> time (see nisse.js).
    nisse: cleanNisseFinds(save.nisse),
    name, playerId,
    // Online riders carry the server's session token; offline saves have none.
    token: typeof save.token === 'string' && TOKEN_RE.test(save.token) ? save.token : null,
    // Stays true after the session expires, so the rider is shown as signed out, not offline.
    online: Boolean(save.online || save.token)
  };
}

function slots(trailCount) {
  const stored = readJson(SAVE_SLOTS_KEY, null);
  if (stored?.trailCount === trailCount && Array.isArray(stored.slots)) return stored.slots;
  const normalized = Array.isArray(stored)
    ? emptySlots().map((_, index) => normalizeSave(stored[index], trailCount))
    : Array.isArray(stored?.slots)
      ? emptySlots().map((_, index) => normalizeSave(stored.slots[index], trailCount))
      : emptySlots();
  cache.set(SAVE_SLOTS_KEY, { trailCount, slots: normalized });
  return normalized;
}

function persistSlots(trailCount, next) {
  cache.set(SAVE_SLOTS_KEY, { trailCount, slots: next });
  writeThrough(SAVE_SLOTS_KEY, JSON.stringify(next));
}

export function savePreferences(preferences) {
  writeJson(SETTINGS_KEY, { ...preferences });
}

/** The last game version whose release notes the player has opened, or null. */
export function loadSeenVersion() {
  const version = readJson(SEEN_VERSION_KEY, null);
  return typeof version === 'string' ? version : null;
}

export function saveSeenVersion(version) {
  writeJson(SEEN_VERSION_KEY, version);
}

/** Whether How to play has been shown on this device, before a first ride or from the menu. */
export function loadSeenHowTo() {
  return readJson(SEEN_HOW_TO_KEY, false) === true;
}

export function saveSeenHowTo() {
  writeJson(SEEN_HOW_TO_KEY, true);
}

/**
 * The won rider items each rider has seen in the Garage on this device, by
 * player id, as 'slot:id' keys; null for a rider with no record yet. Kept
 * apart from the saves, as a NEW badge only matters on the device showing it.
 * @returns {string[] | null}
 */
export function loadSeenGear(playerId) {
  const seen = readJson(SEEN_GEAR_KEY, {})?.[playerId];
  return Array.isArray(seen) ? seen.filter(key => typeof key === 'string') : null;
}

/** @param {string[] | null} keys  null forgets the rider */
export function saveSeenGear(playerId, keys) {
  const stored = readJson(SEEN_GEAR_KEY, {});
  const next = { ...(stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}) };
  if (keys) next[playerId] = [...new Set(keys)];
  else delete next[playerId];
  writeJson(SEEN_GEAR_KEY, next);
}

/**
 * The notification log on this device (see notifications.js): its entries,
 * and for each online rider the id of the last notice taken from the server.
 * Kept apart from the saves, as what was shown, and read, is this device's.
 * @returns {{ items: object[], after: Record<string, number> }}
 */
export function loadNotifications() {
  const stored = readJson(NOTIFICATIONS_KEY, null);
  const items = Array.isArray(stored?.items) ? stored.items.filter(item => item && typeof item.key === 'string') : [];
  const after = stored?.after && typeof stored.after === 'object' && !Array.isArray(stored.after) ? stored.after : {};
  return { items, after };
}

export function saveNotifications(log) {
  writeJson(NOTIFICATIONS_KEY, log);
}

export function loadPreferences(defaults) {
  const stored = readJson(SETTINGS_KEY, null);
  const merged = { ...defaults };
  if (stored && typeof stored === 'object') {
    for (const key of Object.keys(defaults)) if (stored[key] !== undefined) merged[key] = stored[key];
  }
  return merged;
}

export function loadSaveSlots(trailCount) {
  return slots(trailCount).map(cloneSave);
}

export function loadActiveSlot() {
  return clamp(Number(readJson(ACTIVE_SLOT_KEY, 0)) || 0, 0, SLOT_COUNT - 1);
}

export function saveActiveSlot(slotIndex) {
  writeJson(ACTIVE_SLOT_KEY, clamp(slotIndex, 0, SLOT_COUNT - 1));
}

/**
 * @param {{ playerId: string, token: string } | null} [account] the online rider, or null for an offline save
 * @param {string | null} [ghost] the ghost the rider races, or null to go by the device's setting
 */
export function createSave(slotIndex, look, trailCount, name, account = null, ghost = null) {
  const next = [...slots(trailCount)];
  const index = clamp(slotIndex, 0, SLOT_COUNT - 1);
  const cleanName = cleanRiderName(name);
  if (next[index] || !cleanName) return null;
  // A new rider has won nothing yet, so only default items are theirs.
  const clean = ownedLook(look, isDefaultItem);
  const save = {
    look: clean,
    lookUpdatedAt: Date.now(),
    rider: legacyRider(clean),
    createdAt: Date.now(),
    trail: 0,
    unlocked: 0,
    bestTimes: {},
    achievements: {},
    stats: {},
    nisse: {},
    ghost: GHOST_MODES.includes(ghost) ? ghost : null,
    ghostUpdatedAt: GHOST_MODES.includes(ghost) ? Date.now() : 0,
    name: cleanName,
    playerId: account?.playerId ?? newPlayerId(),
    token: account?.token ?? null,
    online: Boolean(account)
  };
  next[index] = save;
  persistSlots(trailCount, next);
  saveActiveSlot(index);
  return cloneSave(save);
}

/**
 * Changes a save's look. Unknown items keep the current ones, items the rider
 * doesn't `own` go back to their starter ones, and gender and skin, picked
 * when it was created, stay.
 * @param {(slot: string, id: string) => boolean} owns
 */
export function saveLook(slotIndex, trailCount, look, owns) {
  updateSave(slotIndex, trailCount, save => {
    save.look = ownedLook(keepIdentity(normalizeLook(look, { fallback: save.look }), save.look), owns);
    save.rider = legacyRider(save.look);
    save.lookUpdatedAt = Date.now();
  });
  return cloneSave(slots(trailCount)[slotIndex]);
}

/**
 * Sets the ghost a save's rider races. `at` is when it was picked: the newer
 * of two copies' choices wins when they merge (see newerGhost).
 */
export function saveGhostMode(slotIndex, trailCount, ghost, at = Date.now()) {
  if (!GHOST_MODES.includes(ghost)) return null;
  updateSave(slotIndex, trailCount, save => {
    save.ghost = ghost;
    save.ghostUpdatedAt = at;
  });
  return cloneSave(slots(trailCount)[slotIndex]);
}

/**
 * Copies the device's Ghost setting into the saves without one of their own,
 * from before the setting moved into saves. Only a setting the player changed
 * is copied, stamped as old as can be: a device left on the default must not
 * outvote a choice another device already synced.
 * @returns {number[]} the slots that changed
 */
export function adoptGhostSetting(trailCount, ghost, defaultGhost) {
  if (ghost === defaultGhost || !GHOST_MODES.includes(ghost)) return [];
  const changed = slots(trailCount).flatMap((save, index) => (save && !save.ghost ? [index] : []));
  for (const index of changed) saveGhostMode(index, trailCount, ghost, 1);
  return changed;
}

/** Turns an offline save into the online rider that was just created for it. */
export function linkSave(slotIndex, trailCount, { playerId, token, name }) {
  updateSave(slotIndex, trailCount, save => {
    save.playerId = playerId;
    save.token = token;
    save.online = true;
    save.name = cleanRiderName(name) || save.name;
  });
  return cloneSave(slots(trailCount)[slotIndex]);
}

/** Forgets an online save's expired session; the rider logs in again to get a new one. */
export function clearSaveToken(slotIndex, trailCount) {
  updateSave(slotIndex, trailCount, save => {
    if (save.token) save.online = true;
    save.token = null;
  });
}

/**
 * Swaps in the fresh session token the server sent for a rider whose old one
 * was about to expire. Returns the slot it went into, or -1.
 */
export function renewSaveToken(playerId, token, trailCount) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return -1;
  const index = slots(trailCount).findIndex(save => save?.playerId === playerId && save.token);
  if (index >= 0) updateSave(index, trailCount, save => { save.token = token; });
  return index;
}

/**
 * Puts a logged-in rider into their existing slot, or the first free one,
 * merging the cloud save and the server's best runs (as ghosts) with what is
 * on this device.
 * @returns {number} the slot, or -1 when every slot is taken by someone else
 */
export function restoreOnlineSave(trailCount, { token, player, save: cloud, runs }) {
  const next = [...slots(trailCount)];
  let index = next.findIndex(save => save?.playerId === player.id);
  if (index < 0) index = next.findIndex(save => !save);
  if (index < 0) return -1;
  const local = next[index];
  const bestTimes = { ...cloud?.bestTimes };
  for (const [key, time] of Object.entries(local?.bestTimes ?? {})) bestTimes[key] = Math.min(time, bestTimes[key] ?? Infinity);
  for (const { trail, ghost } of Array.isArray(runs) ? runs : []) {
    const time = Number(ghost?.time);
    if (!Number.isFinite(time) || time <= 0) continue;
    bestTimes[trail] = Math.min(time, bestTimes[trail] ?? Infinity);
    // Only a ghost this build can play replaces what the device has: the
    // server keeps runs from older physics, which would oust a usable one.
    if (ghost.physics !== RIDE_VERSION || !Array.isArray(ghost.inputs)) continue;
    const stored = readGhost(trail);
    if (!stored || stored.physics !== RIDE_VERSION || time < stored.time) saveGhost(trail, ghost);
  }
  const unlocked = Math.max(Number(local?.unlocked) || 0, Number(cloud?.unlocked) || 0);
  const look = newerLook(local, cloud, player);
  next[index] = normalizeSave({
    ...look,
    ...newerGhost(local, cloud),
    rider: player.rider,
    createdAt: local?.createdAt ?? cloud?.createdAt ?? Date.now(),
    trail: local?.trail ?? cloud?.trail ?? 0,
    unlocked, bestTimes,
    achievements: mergeAchievements(local?.achievements, cloud?.achievements),
    stats: mergeStats(local?.stats, cloud?.stats),
    nisse: mergeNisseFinds(local?.nisse, cloud?.nisse),
    name: player.name, playerId: player.id, token
  }, trailCount);
  persistSlots(trailCount, next);
  saveActiveSlot(index);
  return next[index] ? index : -1;
}

/**
 * The look to keep of a device's copy and the cloud's: whichever was changed
 * in the Garage last, so a change made while offline isn't undone by the
 * next sync. Without timestamps (older saves) the cloud's wins, as it is what
 * the rider last saved from any device.
 * @returns {{ look: object, lookUpdatedAt: number }}
 */
function newerLook(local, cloud, player) {
  const localAt = Number(local?.lookUpdatedAt) || 0, cloudAt = Number(cloud?.lookUpdatedAt) || 0;
  if (local?.look && localAt > cloudAt) return { look: local.look, lookUpdatedAt: localAt };
  return { look: player?.look ?? cloud?.look ?? local?.look, lookUpdatedAt: Math.max(localAt, cloudAt) };
}

/**
 * The ghost choice to keep of a device's copy and the cloud's: the one made
 * last, and on a tie (or without a choice here) the cloud's, like the look.
 * @returns {{ ghost: string | null, ghostUpdatedAt: number }}
 */
function newerGhost(local, cloud) {
  const localAt = Number(local?.ghostUpdatedAt) || 0, cloudAt = Number(cloud?.ghostUpdatedAt) || 0;
  const cloudGhost = GHOST_MODES.includes(cloud?.ghost) ? cloud.ghost : null;
  if (local?.ghost && (localAt > cloudAt || !cloudGhost)) return { ghost: local.ghost, ghostUpdatedAt: localAt };
  return { ghost: cloudGhost ?? local?.ghost ?? null, ghostUpdatedAt: cloudGhost ? cloudAt : localAt };
}

/**
 * Catches a signed-in save up with its cloud copy, fetched without logging in
 * again. The look changed last wins (see newerLook); best times, unlocked
 * trails, achievements and stats keep the best of both, so neither device
 * loses progress.
 * @returns {{ save: object, changed: boolean, ahead: boolean } | null} the
 *   updated save, whether this device's copy changed, and whether it has
 *   progress the cloud lacks (so it should be uploaded); null if the slot no
 *   longer holds that rider
 */
export function applyCloudSave(slotIndex, trailCount, { player, save: cloud }) {
  const local = slots(trailCount)[slotIndex];
  if (!local?.token || local.playerId !== player?.id) return null;
  const cloudBest = cloud?.bestTimes && typeof cloud.bestTimes === 'object' ? cloud.bestTimes : {};
  const bestTimes = { ...local.bestTimes };
  for (const [key, value] of Object.entries(cloudBest)) {
    const time = Number(value);
    if (Number.isFinite(time) && time > 0) bestTimes[key] = Math.min(time, bestTimes[key] ?? Infinity);
  }
  const cloudUnlocked = Number(cloud?.unlocked) || 0;
  const merged = normalizeSave({
    ...local,
    ...newerLook(local, cloud, player),
    ...newerGhost(local, cloud),
    unlocked: Math.max(Number(local.unlocked) || 0, cloudUnlocked),
    bestTimes,
    achievements: mergeAchievements(local.achievements, cloud?.achievements),
    stats: mergeStats(local.stats, cloud?.stats),
    nisse: mergeNisseFinds(local.nisse, cloud?.nisse),
    name: player.name ?? local.name
  }, trailCount);
  if (!merged) return null;
  const ahead = cloudUnlocked < merged.unlocked
    // A look changed here (in the Garage, maybe offline) that the cloud hasn't got.
    || merged.lookUpdatedAt > (Number(cloud?.lookUpdatedAt) || 0)
    // A ghost choice made here that the cloud hasn't got, or made again
    // since: its newer time must reach the cloud to outvote older choices.
    || Boolean(merged.ghost) && (merged.ghost !== cloud?.ghost || merged.ghostUpdatedAt > (Number(cloud?.ghostUpdatedAt) || 0))
    || Object.entries(merged.bestTimes).some(([key, time]) => !(Number(cloudBest[key]) <= time))
    || aheadOf(merged, cloud)
    // An official or bonus trail's nisse found here and not yet in the cloud.
    || Object.keys(cleanNisseFinds(merged.nisse, true)).some(key => !cleanNisseFinds(cloud?.nisse, true)[key]);
  const changed = JSON.stringify(merged) !== JSON.stringify(normalizeSave(local, trailCount));
  if (changed) updateSave(slotIndex, trailCount, save => Object.assign(save, merged));
  return { save: cloneSave(slots(trailCount)[slotIndex]), changed, ahead };
}

export function deleteSave(slotIndex, trailCount) {
  const next = [...slots(trailCount)];
  const playerId = next[clamp(slotIndex, 0, SLOT_COUNT - 1)]?.playerId;
  if (playerId) {
    saveSeenGear(playerId, null);
    const log = loadNotifications();
    delete log.after[playerId];
    saveNotifications({ items: log.items.filter(item => item.playerId !== playerId), after: log.after });
  }
  next[clamp(slotIndex, 0, SLOT_COUNT - 1)] = null;
  persistSlots(trailCount, next);
}

function updateSave(slotIndex, trailCount, change) {
  const next = [...slots(trailCount)];
  const save = cloneSave(next[slotIndex]);
  if (!save) return;
  change(save);
  next[slotIndex] = save;
  persistSlots(trailCount, next);
}

export function saveProgress(slotIndex, trailIndex, unlockedTrail, trailCount) {
  updateSave(slotIndex, trailCount, save => {
    // Another tab may have got further meanwhile; progress only goes forward.
    save.unlocked = clamp(Math.max(unlockedTrail, Number(save.unlocked) || 0), 0, trailCount - 1);
    save.trail = clamp(trailIndex, 0, save.unlocked);
  });
}

/**
 * Adds newly earned achievements (by id) and lifetime stat gains to a save.
 * @param {string[]} earned
 * @param {Record<string, number>} gains how much to add to each stat
 * @returns {{ achievements: Record<string, number>, stats: Record<string, number> } | null}
 *   the save's achievements and stats afterwards, or null without a save
 */
export function recordAchievements(slotIndex, trailCount, earned, gains) {
  updateSave(slotIndex, trailCount, save => {
    const now = Date.now();
    for (const id of earned) save.achievements[id] ??= now;
    for (const [name, gain] of Object.entries(gains)) save.stats[name] = (save.stats[name] || 0) + gain;
    save.achievements = cleanAchievements(save.achievements);
    save.stats = cleanStats(save.stats);
  });
  const save = slots(trailCount)[slotIndex];
  return save ? { achievements: { ...save.achievements }, stats: { ...save.stats } } : null;
}

/**
 * Remembers that the rider found a trail's nisse (keyed by nisseKey in
 * state.js). Returns whether it is a new find.
 */
export function recordNisse(slotIndex, trailCount, key) {
  const found = Boolean(slots(trailCount)[slotIndex]?.nisse?.[key]);
  if (!found) updateSave(slotIndex, trailCount, save => {
    save.nisse = cleanNisseFinds({ ...save.nisse, [key]: Date.now() });
  });
  return !found;
}

/** Whether the rider has found a trail's nisse. */
export function hasNisse(slotIndex, key, trailCount) {
  return Boolean(slots(trailCount)[slotIndex]?.nisse?.[key]);
}

export function readBest(slotIndex, trailKey, trailCount) {
  return slots(trailCount)[slotIndex]?.bestTimes?.[trailKey] ?? null;
}

export function saveBest(slotIndex, trailKey, elapsed, trailCount) {
  updateSave(slotIndex, trailCount, save => { save.bestTimes[trailKey] = elapsed; });
}

function normalizeRun(run) {
  const time = Number(run?.time);
  if (!Number.isFinite(time) || time <= 0) return null;
  const slot = run.slot === null || run.slot === undefined ? null : Number(run.slot);
  return {
    time,
    look: lookOf(run),
    rider: run.rider === 'female' ? 'female' : 'male',
    name: cleanRiderName(run.name) || null,
    slot: Number.isInteger(slot) && slot >= 0 && slot < SLOT_COUNT ? slot : null,
    saveId: Number(run.saveId) || null,
    date: Number(run.date) || null
  };
}

// One row per rider, like the online board: a save's runs share its id, and
// runs without a save are grouped by name.
const runOwner = run => run.saveId ? `save:${run.saveId}` : `name:${run.name ?? ''}`;

function rankRuns(runs) {
  const owners = new Set();
  return runs.map(normalizeRun).filter(Boolean)
    .sort((a, b) => a.time - b.time || (a.date ?? 0) - (b.date ?? 0))
    .filter(run => !owners.has(runOwner(run)) && owners.add(runOwner(run)))
    .slice(0, LEADERBOARD_SIZE);
}

function loadLeaderboards() {
  const stored = readJson(LEADERBOARD_KEY, {});
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

/**
 * The board to show for a trail: the world board if one has been fetched
 * (see refreshOnlineBoard, which the menu calls for the boards it shows),
 * otherwise this device's own.
 */
export function readLeaderboard(trailId) {
  const online = cachedOnlineBoard(trailId);
  if (online) return online.slice(0, LEADERBOARD_SIZE);
  const runs = loadLeaderboards()[trailId];       // fallback: local board
  return Array.isArray(runs) ? rankRuns(runs) : [];
}

const GHOST_KEY_PREFIX = 'hjulben-ghost-v1:';

/**
 * The fastest finished run on a trail, as encoded inputs for ghost playback.
 * Ghosts saved since looks existed also carry the rider's `look` (see lookOf).
 * `slow` marks a run the game ran in slow motion for: fine as a ghost, never
 * sent to the world board.
 * @returns {{ time: number, splits: number[], startStep: number, seed: number, inputs: number[][], physics: number, look?: object, rider?: string, slow?: boolean } | null}
 */
export function readGhost(trailKey) {
  const ghost = readJson(GHOST_KEY_PREFIX + trailKey, null);
  return ghost && Number.isFinite(ghost.time) && Array.isArray(ghost.inputs) ? ghost : null;
}

export function saveGhost(trailKey, ghost) {
  writeJson(GHOST_KEY_PREFIX + trailKey, ghost);
}

/** Every stored ghost's key, as 'official:<id>@<hash>' or 'trail:<hash>'. */
function ghostKeys() {
  const keys = [];
  try {
    const storage = store();
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(GHOST_KEY_PREFIX)) keys.push(key.slice(GHOST_KEY_PREFIX.length));
    }
  } catch (_) {}
  return keys;
}

/** Drops ghosts that this build can no longer play, which only take up room. */
function pruneGhosts() {
  for (const key of ghostKeys()) {
    const ghost = readJson(GHOST_KEY_PREFIX + key, null);
    if (!ghost || ghost.physics !== RIDE_VERSION) {
      cache.delete(GHOST_KEY_PREFIX + key);
      try { store().removeItem(GHOST_KEY_PREFIX + key); } catch (_) {}
    }
  }
}

/**
 * Clears out what an edit to a shipped trail leaves behind: the ghost and
 * local board of a version that is no longer in the catalog (`current` is
 * every trail key the game knows now). Best times stay in the saves, where
 * they also say which trails a rider has finished. Custom trails keep theirs,
 * since a trail imported again gets the same key.
 */
export function pruneStaleTrailData(current) {
  const currentKeys = new Set(current);
  const currentIds = new Set([...currentKeys].map(key => key.replace(/@.*$/, '')));
  const stale = key => !currentKeys.has(key) && currentIds.has(key.replace(/@.*$/, ''));
  for (const key of ghostKeys()) {
    if (!stale(key)) continue;
    cache.delete(GHOST_KEY_PREFIX + key);
    try { store().removeItem(GHOST_KEY_PREFIX + key); } catch (_) {}
  }
  const boards = loadLeaderboards();
  const kept = Object.fromEntries(Object.entries(boards).filter(([key]) => !stale(key)));
  if (Object.keys(kept).length !== Object.keys(boards).length) writeJson(LEADERBOARD_KEY, kept);
  pruneGhosts();
}

// Returns the 1-based rank of the new run, or null when it misses the board.
export function recordLeaderboardRun(trailId, run) {
  const boards = { ...loadLeaderboards() };
  const entry = normalizeRun({ ...run, date: Date.now() });
  if (!entry) return null;
  const ranked = rankRuns([...(Array.isArray(boards[trailId]) ? boards[trailId] : []), entry]);
  boards[trailId] = ranked;
  writeJson(LEADERBOARD_KEY, boards);
  // The rider's row, which is their best: a slower run doesn't get a row of its own.
  return ranked.findIndex(item => runOwner(item) === runOwner(entry)) + 1 || null;
}
