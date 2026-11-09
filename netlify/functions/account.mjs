// Online riders: passkey sign-up and login, and the cloud copy of a savegame.
//   POST /api/account/register-options  { name }                     -> { options, state }
//   POST /api/account/register          { state, response, look }    -> { token, player }
//   POST /api/account/login-options     {}                           -> { options, state }
//   POST /api/account/login             { state, response }          -> { token, player, save, runs }
//   GET  /api/account/save              (Bearer token)               -> { player, save, token? }
//   PUT  /api/account/save              { save }  (Bearer token)     -> { ok, save, token? }
//   POST /api/account/delete            { state, response } (Bearer) -> { ok }   removes the rider for good
//   GET  /api/account/notifications?after=ID  (Bearer token)       -> { notifications, more, token? }
// `token` is a fresh session token, sent when the current one is close to
// expiring. PUT merges the save with the cloud copy and returns the result.
import { randomBytes, randomUUID } from 'node:crypto';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { db } from '../lib/db.mjs';
import {
  HttpError, json, respond, readBody, unsign, sessionToken, challengeToken, requireSession, renewedToken, relyingParty,
} from '../lib/auth.mjs';
import { cleanName, validName, nameKey, blockedName } from '../lib/names.mjs';
import { TRAIL_RE } from '../lib/verify-run.mjs';
import { lookOf, legacyRider, playerLook } from '../lib/looks.mjs';
import { rateLimit, clientAddress } from '../lib/rate-limit.mjs';
import { cleanAchievements, cleanStats, mergeAchievements, mergeStats } from '../../js/achievements.js';
import { cleanNisseFinds, mergeNisseFinds } from '../../js/nisse.js';

// The Ghost setting's choices, as GHOST_MODES in js/storage.js (which this
// can't import: it reads the browser's storage).
const GHOST_MODES = ['on', 'world', 'off'];

const RP_NAME = 'Hjulben';
// How long news waits for a rider to come back, and how much comes at once.
const NOTIFICATION_DAYS = 60;
const NOTIFICATIONS_AT_ONCE = 20;
// Passkey ceremonies per address a minute: enough for retries, not for guessing names.
const CEREMONIES_PER_MINUTE = 20;

async function registerOptions(req, context) {
  const body = await readBody(req, 2_000);
  const name = cleanName(body.name);
  if (!validName(name)) throw new HttpError(400, 'invalid name');
  if (blockedName(name)) throw new HttpError(400, 'name not allowed');
  const sql = await db();
  await rateLimit(sql, 'ceremony:' + clientAddress(req, context), CEREMONIES_PER_MINUTE, 60);
  // A name without a passkey (imported from the old board) is free to claim.
  const [existing] = await sql`
    select id, exists (select 1 from credentials c where c.player_id = players.id) as claimed
    from players where name_key = ${nameKey(name)}`;
  if (existing?.claimed) throw new HttpError(409, 'name taken');

  const { rpID, origin } = relyingParty(req);
  const playerId = existing?.id ?? randomUUID();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME, rpID,
    userName: name, userDisplayName: name,
    userID: Buffer.from(playerId.replaceAll('-', ''), 'hex'),
    challenge: randomBytes(32),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  const state = challengeToken({ type: 'register', challenge: options.challenge, name, player: playerId, rpID, origin });
  return json({ options, state });
}

async function register(req) {
  const body = await readBody(req, 20_000);
  const state = unsign(body.state, 'register');
  if (!state) throw new HttpError(400, 'expired, try again');

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: state.challenge,
      expectedOrigin: state.origin,
      expectedRPID: state.rpID,
      requireUserVerification: false,
    });
  } catch (_) {
    throw new HttpError(400, 'passkey rejected');
  }
  if (!verification.verified) throw new HttpError(400, 'passkey rejected');

  const { credential } = verification.registrationInfo;
  const look = lookOf(body);
  const rider = legacyRider(look);
  const sql = await db();
  let rows;
  try {
    // Takes over an unclaimed rider of the same name, keeping its times.
    rows = await sql`
      with player as (
        insert into players (id, name, name_key, rider, look)
        values (${state.player}, ${state.name}, ${nameKey(state.name)}, ${rider}, ${JSON.stringify(look)}::jsonb)
        on conflict (name_key) do update set name = excluded.name, rider = excluded.rider, look = excluded.look
          where not exists (select 1 from credentials c where c.player_id = players.id)
        returning id
      )
      insert into credentials (id, player_id, public_key, counter, transports)
      select ${credential.id}, id, ${Buffer.from(credential.publicKey).toString('base64url')}, ${credential.counter}, ${credential.transports ?? []}
      from player
      returning player_id`;
  } catch (error) {
    if (error?.code === '23505') throw new HttpError(409, 'name taken');
    throw error;
  }
  if (!rows.length) throw new HttpError(409, 'name taken');
  const playerId = rows[0].player_id;
  return json({ token: sessionToken(playerId), player: { id: playerId, name: state.name, rider, look } });
}

async function loginOptions(req, context) {
  const { rpID, origin } = relyingParty(req);
  await rateLimit(await db(), 'ceremony:' + clientAddress(req, context), CEREMONIES_PER_MINUTE, 60);
  // No allowCredentials: the browser offers every passkey this site owns.
  const options = await generateAuthenticationOptions({ rpID, challenge: randomBytes(32), userVerification: 'preferred' });
  return json({ options, state: challengeToken({ type: 'login', challenge: options.challenge, rpID, origin }) });
}

/**
 * Checks a passkey assertion made for login-options' challenge, and returns
 * the credential's row joined with its player. Used by login and, as a fresh
 * proof that it is really the rider, by delete.
 */
async function verifyPasskey(sql, body) {
  const state = unsign(body.state, 'login');
  if (!state) throw new HttpError(400, 'expired, try again');
  const credentialId = String(body.response?.id ?? '');
  const [row] = await sql`
    select c.id, c.public_key, c.counter, c.transports, p.id as player_id, p.name, p.rider, p.look, p.save
    from credentials c join players p on p.id = c.player_id
    where c.id = ${credentialId}`;
  if (!row) throw new HttpError(404, 'unknown passkey');

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: state.challenge,
      expectedOrigin: state.origin,
      expectedRPID: state.rpID,
      credential: {
        id: row.id,
        publicKey: new Uint8Array(Buffer.from(row.public_key, 'base64url')),
        counter: Number(row.counter),
        transports: row.transports ?? [],
      },
      requireUserVerification: false,
    });
  } catch (_) {
    throw new HttpError(400, 'passkey rejected');
  }
  if (!verification.verified) throw new HttpError(400, 'passkey rejected');

  await sql`update credentials set counter = ${verification.authenticationInfo.newCounter}, last_used_at = now() where id = ${row.id}`;
  return row;
}

async function login(req) {
  const body = await readBody(req, 20_000);
  const sql = await db();
  const row = await verifyPasskey(sql, body);
  const runs = await sql`select trail, replay from runs where player_id = ${row.player_id} and replay is not null`;
  return json({
    token: sessionToken(row.player_id),
    player: { id: row.player_id, name: row.name, rider: row.rider, look: lookOf(row) },
    save: row.save ?? null,
    runs: runs.map(run => ({ trail: run.trail, ghost: run.replay })),
  });
}

/**
 * Removes a rider for good: their name, cloud save, passkeys and every run
 * on the world board (the tables cascade). A session token alone isn't
 * enough, since one could be lifted from a device: the rider proves it is
 * them with their passkey, which must belong to the signed-in player.
 */
async function deleteRider(req) {
  const session = requireSession(req);
  const body = await readBody(req, 20_000);
  const sql = await db();
  const row = await verifyPasskey(sql, body);
  if (row.player_id !== session.player) throw new HttpError(403, 'wrong passkey');
  await sql`delete from players where id = ${session.player}`;
  return json({ ok: true });
}

/** Keeps only the fields a savegame has, so the column can't be used as free storage. */
function sanitizeSave(save) {
  if (!save || typeof save !== 'object') throw new HttpError(400, 'bad save');
  const int = (value, max) => Math.min(max, Math.max(0, Math.floor(Number(value)) || 0));
  const bestTimes = {};
  if (save.bestTimes && typeof save.bestTimes === 'object') {
    for (const [key, value] of Object.entries(save.bestTimes).slice(0, 200)) {
      const time = Number(value);
      if (TRAIL_RE.test(key) && Number.isFinite(time) && time > 0) bestTimes[key] = time;
    }
  }
  const look = lookOf(save);
  return {
    look,
    // When the look was last changed in the Garage, so the newest one wins (see mergeSaves).
    lookUpdatedAt: int(save.lookUpdatedAt, Number.MAX_SAFE_INTEGER),
    // The ghost the rider races and when they picked it; null until they do.
    ghost: GHOST_MODES.includes(save.ghost) ? save.ghost : null,
    ghostUpdatedAt: int(save.ghostUpdatedAt, Number.MAX_SAFE_INTEGER),
    rider: legacyRider(look),
    createdAt: int(save.createdAt, Number.MAX_SAFE_INTEGER),
    trail: int(save.trail, 999),
    unlocked: int(save.unlocked, 999),
    bestTimes,
    achievements: cleanAchievements(save.achievements),
    stats: cleanStats(save.stats),
    // Official and bonus trails' nisse finds; custom ones stay on the device.
    nisse: cleanNisseFinds(save.nisse, true),
  };
}

/**
 * A save folded into the cloud copy, the way the game merges them: best times
 * keep the faster, progress and lifetime stats the higher, achievements and
 * nisse finds the union. So a device that uploads a stale copy, because it
 * played before its download finished or offline, never wipes out what
 * another device saved. The look and the ghost choice are whichever was
 * changed last, and the current trail is the one sent.
 */
function mergeSaves(cloud, save) {
  if (!cloud || typeof cloud !== 'object') return save;
  const bestTimes = { ...save.bestTimes };
  for (const [key, value] of Object.entries(cloud.bestTimes ?? {})) {
    const time = Number(value);
    if (TRAIL_RE.test(key) && Number.isFinite(time) && time > 0) bestTimes[key] = Math.min(time, bestTimes[key] ?? Infinity);
  }
  const cloudLookAt = Math.floor(Number(cloud.lookUpdatedAt)) || 0;
  const newerLook = cloudLookAt > save.lookUpdatedAt && cloud.look && typeof cloud.look === 'object';
  // The ghost choice too, and a save from a client that doesn't send one keeps the cloud's.
  const cloudGhostAt = Math.floor(Number(cloud.ghostUpdatedAt)) || 0;
  const cloudGhost = GHOST_MODES.includes(cloud.ghost) && (!save.ghost || cloudGhostAt >= save.ghostUpdatedAt);
  return {
    ...save,
    ghost: cloudGhost ? cloud.ghost : save.ghost,
    ghostUpdatedAt: cloudGhost ? cloudGhostAt : save.ghostUpdatedAt,
    look: newerLook ? lookOf(cloud) : save.look,
    lookUpdatedAt: newerLook ? cloudLookAt : save.lookUpdatedAt,
    createdAt: Math.min(save.createdAt || Infinity, Number(cloud.createdAt) || Infinity) || save.createdAt,
    unlocked: Math.max(save.unlocked, Math.floor(Number(cloud.unlocked)) || 0),
    bestTimes,
    achievements: mergeAchievements(save.achievements, cloud.achievements),
    stats: mergeStats(save.stats, cloud.stats),
    nisse: cleanNisseFinds(mergeNisseFinds(save.nisse, cloud.nisse), true),
  };
}

async function putSave(req) {
  const session = requireSession(req);
  const playerId = session.player;
  const body = await readBody(req, 32_000);
  const sent = sanitizeSave(body.save);
  const sql = await db();
  // Read, merge and write without a transaction (the HTTP driver has none):
  // the write only lands if the row is still what was read, else it merges
  // again on the fresh row, so two devices uploading at once can't undo each
  // other. The stamp is read as text: Postgres keeps microseconds, which a
  // JavaScript Date would round off, and then the row would never match.
  for (let attempt = 0; attempt < 5; attempt++) {
    const [player] = await sql`select look, rider, save, save_updated_at::text as save_stamp from players where id = ${playerId}`;
    if (!player) throw new HttpError(401, 'not signed in');
    const save = mergeSaves(player.save, sent);
    save.look = playerLook(save, player);
    save.rider = legacyRider(save.look);
    const rows = await sql`
      update players set save = ${JSON.stringify(save)}::jsonb, rider = ${save.rider},
        look = ${JSON.stringify(save.look)}::jsonb, save_updated_at = now()
      where id = ${playerId} and save_updated_at is not distinct from ${player.save_stamp}::timestamptz
      returning id`;
    if (rows.length) return json({ ok: true, save, token: renewedToken(session) });
  }
  throw new HttpError(409, 'save changed, try again');
}

/** The cloud save and look of a signed-in rider, so another device can catch up without logging in again. */
async function getSave(req) {
  const session = requireSession(req);
  const sql = await db();
  const [row] = await sql`select id, name, rider, look, save from players where id = ${session.player}`;
  if (!row) throw new HttpError(401, 'not signed in');
  return json({
    player: { id: row.id, name: row.name, rider: row.rider, look: lookOf(row) },
    save: row.save ?? null,
    token: renewedToken(session),
  });
}

/**
 * News for the rider newer than the id their device last had (see
 * notifications.js), oldest first, each as { id, kind, at, ...data }.
 */
async function getNotifications(req) {
  const session = requireSession(req);
  const after = Number(new URL(req.url).searchParams.get('after')) || 0;
  const sql = await db();
  // Every rider's old news, not just this one's: riders who never come back
  // would otherwise keep theirs for good.
  await sql`delete from notifications where created_at < now() - make_interval(days => ${NOTIFICATION_DAYS})`;
  // One more than is sent, to tell whether more are waiting.
  const rows = await sql`
    select id, kind, data, created_at from notifications
    where player_id = ${session.player} and id > ${after}
    order by id asc limit ${NOTIFICATIONS_AT_ONCE + 1}`;
  return json({
    notifications: rows.slice(0, NOTIFICATIONS_AT_ONCE).map(row => ({ ...row.data, id: Number(row.id), kind: row.kind, at: new Date(row.created_at).getTime() })),
    more: rows.length > NOTIFICATIONS_AT_ONCE,
    token: renewedToken(session),
  });
}

const ROUTES = {
  'register-options': { POST: registerOptions },
  'register': { POST: register },
  'login-options': { POST: loginOptions },
  'login': { POST: login },
  'save': { GET: getSave, PUT: putSave },
  'delete': { POST: deleteRider },
  'notifications': { GET: getNotifications },
};

export default (req, context) => respond(async () => {
  const action = context?.params?.action ?? new URL(req.url).pathname.split('/').pop();
  const route = Object.hasOwn(ROUTES, action) ? ROUTES[action] : null;
  if (!route) throw new HttpError(404, 'not found');
  const handler = Object.hasOwn(route, req.method) ? route[req.method] : null;
  if (!handler) throw new HttpError(405, 'method not allowed');
  return handler(req, context);
});

export const config = { path: '/api/account/:action' };
