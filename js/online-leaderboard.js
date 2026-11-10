// Talks to the online leaderboard. Everything fails quietly so the game
// keeps working offline (and on GitHub Pages) with the local board.
import { isSandbox, store } from './local-store.js';
import { cleanRiderName as cleanName } from './rider-name.js';
import { legacyRider, lookOf } from './cosmetics.js';
import { noteRenewal, SIGNED_OUT_EVENT } from './account.js';

const API = '/api/leaderboard';
// How old a board may get before a run start fetches it again: short enough
// that riders racing each other see a new best within a few restarts.
const REFRESH_MS = 10_000;
// How soon a board is asked for again after the server couldn't be reached.
const RETRY_MS = 5_000;
export const ONLINE_LEADERBOARD_EVENT = 'hjulben:online-leaderboard';
export const ONLINE_STANDINGS_EVENT = 'hjulben:online-standings';
// How old the rider's standings may get before the trail picker asks again.
const STANDINGS_MS = 60_000;

// Shipped trails only ('official:<id>@<hash>', 'bonus:<id>@<hash>'); custom trails ('trail:<hash>') stay local.
const TRAIL_RE = /^(official|bonus):[a-z0-9][a-z0-9-]{0,55}@[0-9a-f]{8}$/;

const boards = new Map();     // trailKey -> { runs, total, near, viewer }
const signatures = new Map(); // trailKey -> JSON of the board, to spot boards that didn't change
const lastFetch = new Map();  // trailKey -> timestamp of the last fetch that got an answer
const failed = new Map();     // trailKey -> timestamp of the last fetch that didn't
const pending = new Set();    // trailKeys with a fetch in flight

export const isOnlineTrail = trail => typeof trail === 'string' && TRAIL_RE.test(trail);

/** @type {() => { playerId: string, token: string } | null} */
let viewerOf = () => null;

/**
 * Tells the boards who is looking: an online rider's boards come with their
 * own row when they are below the top. A board fetched for another rider (or
 * none) is fetched again, whatever its age.
 * @param {() => { playerId: string, token: string } | null} viewer
 */
export function useBoardViewer(viewer) {
  viewerOf = viewer;
}

// Sandbox riders are throwaway, so the server never hears of them.
const viewer = () => isSandbox() ? null : viewerOf();

/**
 * How the world board for a trail stands: 'loading' before its first answer,
 * 'failed' when the server couldn't be reached last time (whatever is shown
 * is then the device's own board or an older world board), otherwise 'ok'.
 * @returns {'loading' | 'failed' | 'ok'}
 */
export function boardStatus(trail) {
  if (failed.has(trail) && (failed.get(trail) ?? 0) > (lastFetch.get(trail) ?? 0)) return 'failed';
  return boards.has(trail) ? 'ok' : 'loading';
}


function toRuns(runs) {
  return (Array.isArray(runs) ? runs : [])
    .map(r => ({
      time: Number(r.time),
      look: lookOf(r),
      rider: r.rider === 'female' ? 'female' : 'male',
      name: cleanName(r.name) || null,
      slot: null, saveId: null,
      date: Number(r.date) || null,
      rank: Number(r.rank) || null,
      replay: r.replay === true,
    }))
    .filter(r => Number.isFinite(r.time) && r.time > 0);
}

/** A board as the server sent it, for the rider it was fetched for. */
const toBoard = (data, playerId) => ({
  runs: toRuns(data.runs),
  total: Number(data.total) || 0,
  near: toRuns(data.near),
  viewer: playerId,
});

function announce(trail) {
  window.dispatchEvent(new CustomEvent(ONLINE_LEADERBOARD_EVENT, { detail: { trail } }));
}

/**
 * Stores a fresh board and returns whether it differs from the one before.
 * A new world best also drops the cached world ghost, so the next ride races it.
 */
function setBoard(trail, board) {
  const signature = JSON.stringify(board);
  if (signatures.get(trail) === signature) return false;
  const before = boards.get(trail)?.runs[0];
  if (before && (before.time !== board.runs[0]?.time || before.name !== board.runs[0]?.name)) dropWorldGhost(trail);
  boards.set(trail, board);
  signatures.set(trail, signature);
  return true;
}

/** The top of the world board, once fetched. */
export function cachedOnlineBoard(trail) {
  return boards.get(trail)?.runs ?? null;
}

/**
 * How many riders the world board has, and the active rider's row with the
 * rows either side when it is below the top (empty when it isn't, or the
 * board was fetched for someone else).
 * @returns {{ total: number, near: ReturnType<typeof toRuns> } | null}
 */
export function onlineBoardStanding(trail) {
  const board = boards.get(trail);
  if (!board) return null;
  return { total: board.total, near: board.viewer === (viewer()?.playerId ?? null) ? board.near : [] };
}

/** True while the first fetch for a trail is in flight, before there is anything to show. */
export function isOnlineBoardLoading(trail) {
  return pending.has(trail) && !boards.has(trail);
}

/**
 * Fetches in the background unless the board is younger than `maxAge` ms or
 * already on its way. Fires ONLINE_LEADERBOARD_EVENT when the board changed,
 * or when the first fetch settles so a loading board can stop waiting.
 */
export function refreshOnlineBoard(trail, maxAge = REFRESH_MS) {
  if (typeof window === 'undefined' || !isOnlineTrail(trail) || pending.has(trail)) return;
  const now = Date.now();
  const rider = viewer();
  const playerId = rider?.playerId ?? null;
  // A fetch that failed is tried again sooner, so a reconnect shows soon, and
  // a board fetched for another rider at once, unless that just failed.
  const forSomeoneElse = boards.has(trail) && boards.get(trail).viewer !== playerId;
  const since = forSomeoneElse ? failed.get(trail) ?? 0 : Math.max(lastFetch.get(trail) ?? 0, failed.get(trail) ?? 0);
  const wait = forSomeoneElse || boardStatus(trail) === 'failed' ? Math.min(RETRY_MS, maxAge) : maxAge;
  if (now - since < wait) return;
  pending.add(trail);
  const first = !boards.has(trail);
  const wasFailed = boardStatus(trail) === 'failed';
  let changed = false, answered = false;
  fetch(`${API}?trail=${encodeURIComponent(trail)}`, {
    headers: rider ? { authorization: 'Bearer ' + rider.token } : {},
    signal: AbortSignal.timeout(5000),
  })
    .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
    .then(data => { answered = true; changed = setBoard(trail, toBoard(data, playerId)); })
    .catch(() => {})
    .finally(() => {
      pending.delete(trail);
      if (answered) { lastFetch.set(trail, Date.now()); failed.delete(trail); }
      else failed.set(trail, Date.now());
      // A board that stopped or started failing is shown differently too.
      if (changed || first || answered === wasFailed) announce(trail);
    });
}

const worldGhosts = new Map();  // trailKey -> Promise<ghost | null>
const settledGhosts = new Map(); // trailKey -> ghost | null, once its fetch has succeeded

function dropWorldGhost(trail) {
  worldGhosts.delete(trail);
  settledGhosts.delete(trail);
}

/** A fetched ghost reply, in ghost format plus who rode it, or null. */
function toGhost(ghost) {
  const replay = ghost?.replay;
  return !replay || !Number.isFinite(replay.time) || !Array.isArray(replay.inputs) ? null
    : { ...replay, name: cleanName(ghost.name) || null, look: lookOf(ghost), rider: ghost.rider === 'female' ? 'female' : 'male' };
}

/** The cached world ghost: undefined until fetched (or after a new world best), null when there is none. */
export const settledWorldGhost = trail => settledGhosts.get(trail);

/**
 * The world's fastest verified run on a trail, in ghost format plus who rode
 * it. Cached until the board shows a new world best, so restarts don't refetch it.
 * @param {string} trail
 * @returns {Promise<{ name: string, look: import('./cosmetics.js').Look, rider: string, time: number, splits: number[], startStep: number, seed: number, inputs: number[][], physics: number } | null>}
 */
export function fetchWorldGhost(trail) {
  if (typeof window === 'undefined' || isSandbox() || !isOnlineTrail(trail)) return Promise.resolve(null);
  if (!worldGhosts.has(trail)) {
    const request = fetch(`${API}?ghost=1&trail=${encodeURIComponent(trail)}`, { signal: AbortSignal.timeout(8000) })
      .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(({ ghost }) => {
        const world = toGhost(ghost);
        // A new world best may have dropped this request while it was out.
        if (worldGhosts.get(trail) === request) settledGhosts.set(trail, world);
        return world;
      })
      .catch(() => { if (worldGhosts.get(trail) === request) worldGhosts.delete(trail); return null; });
    worldGhosts.set(trail, request);
  }
  return worldGhosts.get(trail);
}

/** @type {{ playerId: string, at: number, byTrail: Record<string, { time: number, rank: number, total: number }> } | null} */
let standings = null;
let standingsPending = false;

function toStandings(byTrail) {
  return Object.fromEntries(Object.entries(byTrail && typeof byTrail === 'object' ? byTrail : {})
    .filter(([trail, row]) => isOnlineTrail(trail) && [row?.time, row?.rank, row?.total].every(Number.isFinite))
    .map(([trail, row]) => [trail, { time: row.time, rank: row.rank, total: row.total }]));
}

/**
 * The active online rider's time, rank and board size on a trail, once their
 * standings have been fetched; null otherwise, or without a time there.
 */
export function myStanding(trail) {
  const rider = viewer();
  return rider && standings?.playerId === rider.playerId ? standings.byTrail[trail] ?? null : null;
}

/**
 * Fetches the active online rider's place on every trail in one request,
 * unless that was done less than a minute ago. Fires ONLINE_STANDINGS_EVENT
 * when they arrive.
 */
export function refreshMyStandings() {
  const rider = viewer();
  if (typeof window === 'undefined' || !rider || standingsPending) return;
  if (standings?.playerId === rider.playerId && Date.now() - standings.at < STANDINGS_MS) return;
  standingsPending = true;
  fetch(`${API}?mine=1`, { headers: { authorization: 'Bearer ' + rider.token }, signal: AbortSignal.timeout(5000) })
    .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
    .then(data => {
      standings = { playerId: rider.playerId, at: Date.now(), byTrail: toStandings(data.standings) };
      window.dispatchEvent(new CustomEvent(ONLINE_STANDINGS_EVENT));
    })
    .catch(() => {})
    .finally(() => {
      standingsPending = false;
      // Another rider may have taken over meanwhile, and their request was dropped.
      if (viewer()?.playerId !== rider.playerId) refreshMyStandings();
    });
}

const riderGhosts = new Map(); // trailKey, name and time -> Promise<ghost | null>

/**
 * One rider's best run on a trail, to watch from the board or race. Fetched
 * only when asked for, and kept while the board shows the same time for them.
 * @param {string} trail
 * @param {string} name
 * @param {number} time the rider's time on the board
 * @returns {Promise<Awaited<ReturnType<typeof fetchWorldGhost>>>}
 */
export function fetchRiderGhost(trail, name, time) {
  if (typeof window === 'undefined' || isSandbox() || !isOnlineTrail(trail)) return Promise.resolve(null);
  const key = `${trail}\n${name}\n${time}`;
  if (!riderGhosts.has(key)) {
    const request = fetch(`${API}?ghost=1&trail=${encodeURIComponent(trail)}&name=${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(8000) })
      .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(({ ghost }) => toGhost(ghost))
      .catch(() => { riderGhosts.delete(key); return null; });
    riderGhosts.set(key, request);
  }
  return riderGhosts.get(key);
}

/**
 * @typedef {{ inputs: number[][], seed: number, physics: number }} RunInputs
 * @typedef {{rank:number,total:number,time:number,best:number,improved:boolean,ahead?:{name:string,time:number,replay:boolean}|null,behind?:{name:string,time:number}|null}} Standing
 */

/**
 * Sends a finished run's inputs; the server replays them to get the time.
 * `rejected` means the server won't have the run (its replay didn't finish,
 * it is too long, or the trail or game version is out of date), `failed`
 * that it couldn't be reached: the run is worth sending again.
 * @param {string} trail
 * @param {{ look: import('./cosmetics.js').Look, token: string, playerId?: string, run: RunInputs }} submission
 *   `look` is shown with the run; `rider` is still sent for servers from before looks.
 * @returns {Promise<Standing | { signedOut: true } | { rejected: true, reason: string } | { failed: true, retryAfter?: number } | null>}
 *   `retryAfter` (seconds) comes with a rate limit, which lifts by itself.
 */
export async function submitOnlineRun(trail, { look, token, playerId, run }) {
  // Sandbox riders are throwaway, so they never reach the shared board.
  if (typeof window === 'undefined' || isSandbox() || !isOnlineTrail(trail) || !token) return null;
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ trail, look, rider: legacyRider(look), run }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 401) return { signedOut: true };
    if ([400, 409, 422].includes(res.status)) {
      const { error } = await res.json().catch(() => ({ error: '' }));
      return { rejected: true, reason: String(error || 'rejected') };
    }
    if (res.status === 429) return { failed: true, retryAfter: 60 };
    if (!res.ok) return { failed: true };
    const data = await res.json();
    noteRenewal(playerId ?? null, data);
    // A new world best also drops the old ghost when no board was cached to compare with.
    if (data.rank === 1 && data.improved) dropWorldGhost(trail);
    if (setBoard(trail, toBoard(data, playerId ?? null))) announce(trail);
    // The posted run's place, without asking for every trail again.
    if (standings && standings.playerId === playerId) standings.byTrail[trail] = { time: data.best, rank: data.rank, total: data.total };
    lastFetch.set(trail, Date.now());
    failed.delete(trail);
    return data;
  } catch (_) {
    return { failed: true };
  }
}

// --- Runs waiting to be sent --------------------------------------------------
// A run finished offline, or whose upload broke off, is kept until the server
// takes it. Sending a run twice is harmless: the server keeps the fastest.

const PENDING_RUNS_KEY = 'hjulben-pending-runs-v1';
const MAX_PENDING_RUNS = 20;

function readPendingRuns() {
  try {
    const list = JSON.parse(store().getItem(PENDING_RUNS_KEY) || '[]');
    return Array.isArray(list) ? list.filter(item => item && isOnlineTrail(item.trail) && item.run && typeof item.playerId === 'string') : [];
  } catch (_) {
    return [];
  }
}

/** @returns {boolean} whether the list was stored */
function writePendingRuns(list) {
  try {
    if (list.length) store().setItem(PENDING_RUNS_KEY, JSON.stringify(list));
    else store().removeItem(PENDING_RUNS_KEY);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Keeps a run to send later. A rider has one waiting run per trail, the
 * fastest: a slower one never replaces it, since the board only keeps bests.
 * @param {{ look: object, playerId: string, run: RunInputs, time: number }} entry
 * @returns {{ at: number | null } | null} the stored run's stamp (null when a
 *   faster run was already waiting), or null when storage refused it
 */
export function queuePendingRun(trail, { look, playerId, run, time }) {
  if (typeof window === 'undefined' || isSandbox() || !isOnlineTrail(trail) || !playerId) return null;
  const list = readPendingRuns();
  const waiting = list.find(item => item.trail === trail && item.playerId === playerId);
  if (waiting && Number.isFinite(waiting.time) && waiting.time <= time) return { at: null };
  // Each stored run's stamp is its own, even within the same millisecond.
  const at = Math.max(Date.now(), ...list.map(item => (Number(item.at) || 0) + 1));
  const kept = list.filter(item => item !== waiting);
  kept.push({ trail, playerId, look, run, time, at });
  return writePendingRuns(kept.slice(-MAX_PENDING_RUNS)) ? { at } : null;
}

/** Forgets one waiting run, once the server has answered for it. */
export function dropPendingRun(trail, playerId, at) {
  writePendingRuns(readPendingRuns().filter(item => !(item.trail === trail && item.playerId === playerId && item.at === at)));
}

export const pendingRunCount = () => readPendingRuns().length;

/** Forgets a rider's waiting runs, when the rider is gone. */
export function dropPendingRuns(playerId) {
  writePendingRuns(readPendingRuns().filter(item => item.playerId !== playerId));
}

let flushing = null;
let retryTimer = 0;

/**
 * Sends every waiting run whose rider is signed in, one at a time.
 * `tokenFor` gives a rider's current session token, or null. A rate limit
 * pauses the rest until it lifts, and a refused session signs its rider out
 * (SIGNED_OUT_EVENT) while their runs wait for the next login.
 * @param {(playerId: string) => string | null} tokenFor
 * @returns {Promise<number>} how many runs the server took
 */
export function flushPendingRuns(tokenFor) {
  if (flushing) return flushing;
  clearTimeout(retryTimer);
  flushing = (async () => {
    let sent = 0;
    const refused = new Set();
    for (const item of readPendingRuns()) {
      const token = tokenFor(item.playerId);
      if (!token || refused.has(item.playerId)) continue;
      const result = await submitOnlineRun(item.trail, { look: item.look, token, playerId: item.playerId, run: item.run });
      if (result && 'failed' in result) {
        // Still unreachable: the rest can wait too. A rate limit lifts by itself.
        if (result.retryAfter) retryTimer = setTimeout(() => { flushPendingRuns(tokenFor); }, result.retryAfter * 1000);
        break;
      }
      if (result && 'signedOut' in result) {
        refused.add(item.playerId);
        window.dispatchEvent(new CustomEvent(SIGNED_OUT_EVENT, { detail: { playerId: item.playerId } }));
        continue;
      }
      // Settled: taken, or refused for good.
      dropPendingRun(item.trail, item.playerId, item.at);
      if (result && 'rank' in result) sent++;
    }
    return sent;
  })().finally(() => { flushing = null; });
  return flushing;
}
