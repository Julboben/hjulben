// Online leaderboard API.
//   GET  /api/leaderboard?trail=ID                                   -> { runs }
//   GET  /api/leaderboard?trail=ID&ghost=1                           -> { ghost: { name, look, rider, replay } | null }
//   POST /api/leaderboard  { trail, look, run }  (Bearer token)     -> { rank, total, time, best, improved, ahead, behind, runs }
// `ahead` is the nearest rider faster than the player's best and `behind` the
// nearest one at or behind it, each { name, time } or null.
// `run` is the ride's recorded inputs ({ inputs, seed, physics }). The server
// replays them and takes the time from its own simulation, never the client's.
import { db } from '../lib/db.mjs';
import { HttpError, json, respond, readBody, requireSession, renewedToken } from '../lib/auth.mjs';
import { TRAIL_RE, verifyRun } from '../lib/verify-run.mjs';
import { lookOf, legacyRider, playerLook } from '../lib/looks.mjs';
import { rateLimit } from '../lib/rate-limit.mjs';

const TOP = 10;
// Replaying a run costs real CPU, so a player gets this many a minute.
const SUBMITS_PER_MINUTE = 12;

async function top(sql, trail) {
  const rows = await sql`
    select p.name, r.rider, r.look, r.time_ms, r.updated_at
    from runs r join players p on p.id = r.player_id
    where r.trail = ${trail}
    order by r.time_ms asc, r.updated_at asc
    limit ${TOP}`;
  return rows.map(r => ({
    name: r.name, rider: r.rider, look: lookOf(r), time: r.time_ms / 1000, date: new Date(r.updated_at).getTime(),
  }));
}

async function list(req) {
  const params = new URL(req.url).searchParams;
  const trail = params.get('trail') ?? '';
  if (!TRAIL_RE.test(trail)) throw new HttpError(400, 'bad trail');
  if (params.has('ghost')) return json({ ghost: await worldGhost(await db(), trail) });
  return json({ runs: await top(await db(), trail) });
}

/** The fastest run that has a replay (imported times have none), for the World ghost. */
async function worldGhost(sql, trail) {
  const [row] = await sql`
    select p.name, r.rider, r.look, r.replay
    from runs r join players p on p.id = r.player_id
    where r.trail = ${trail} and r.replay is not null
    order by r.time_ms asc, r.updated_at asc
    limit 1`;
  return row ? { name: row.name, rider: row.rider, look: lookOf(row), replay: row.replay } : null;
}

async function submit(req) {
  const session = requireSession(req);
  const playerId = session.player;
  const body = await readBody(req, 1_000_000);
  const trail = String(body.trail ?? '');
  if (!TRAIL_RE.test(trail)) throw new HttpError(400, 'bad trail');
  const sql = await db();
  // Checked before the replay, which is the expensive part.
  await rateLimit(sql, 'submit:' + playerId, SUBMITS_PER_MINUTE, 60);
  const { timeMs, replay } = await verifyRun(trail, body.run, new URL(req.url).origin);

  const [player] = await sql`select name, look, rider from players where id = ${playerId}`;
  if (!player) throw new HttpError(401, 'not signed in');
  // Whether this run beats the player's row, before the upsert folds them together.
  const [previous] = await sql`select time_ms from runs where trail = ${trail} and player_id = ${playerId}`;
  // Who held the world record before it, to tell them if this run took it.
  const [leader] = await sql`
    select player_id, time_ms from runs where trail = ${trail}
    order by time_ms asc, updated_at asc limit 1`;
  // The look the run was ridden in, shown on the board and on its ghost, as
  // the player was created: gender and skin come from their row.
  const look = playerLook(body, player);
  const rider = legacyRider(look);

  // Keep only each player's best run per trail, with its replay for the ghost.
  const [best] = await sql`
    insert into runs (trail, player_id, rider, look, time_ms, replay)
    values (${trail}, ${playerId}, ${rider}, ${JSON.stringify(look)}::jsonb, ${timeMs}, ${JSON.stringify(replay)}::jsonb)
    on conflict (trail, player_id) do update set
      rider      = case when excluded.time_ms < runs.time_ms then excluded.rider else runs.rider end,
      look       = case when excluded.time_ms < runs.time_ms then excluded.look else runs.look end,
      replay     = case when excluded.time_ms < runs.time_ms then excluded.replay else runs.replay end,
      updated_at = case when excluded.time_ms < runs.time_ms then now() else runs.updated_at end,
      time_ms    = least(runs.time_ms, excluded.time_ms)
    returning time_ms`;

  const [{ rank, total, ahead, behind }] = await sql`
    select
      (select count(*) from runs where trail = ${trail} and time_ms < ${best.time_ms})::int + 1 as rank,
      (select count(*) from runs where trail = ${trail})::int as total,
      (select json_build_object('name', p.name, 'time_ms', r.time_ms)
         from runs r join players p on p.id = r.player_id
         where r.trail = ${trail} and r.time_ms < ${best.time_ms}
         order by r.time_ms desc, r.updated_at desc limit 1) as ahead,
      (select json_build_object('name', p.name, 'time_ms', r.time_ms)
         from runs r join players p on p.id = r.player_id
         where r.trail = ${trail} and r.player_id <> ${playerId} and r.time_ms >= ${best.time_ms}
         order by r.time_ms asc, r.updated_at asc limit 1) as behind`;
  const rival = row => row ? { name: row.name, time: row.time_ms / 1000 } : null;

  // A tie keeps the older run first, so only a faster one takes the record.
  if (leader && leader.player_id !== playerId && timeMs < leader.time_ms) {
    const data = { trail, name: player.name, time: timeMs / 1000, was: leader.time_ms / 1000 };
    // Sent only if this run still holds the record as the notice is written:
    // of two runs that took it at once, only the faster one tells the old
    // holder. Only the latest news per trail is kept, under a new id so
    // devices that already read the old notice fetch it again.
    await sql`
      insert into notifications (player_id, kind, data)
      select ${leader.player_id}, 'record-lost', ${JSON.stringify(data)}::jsonb
      where (select player_id from runs where trail = ${trail} order by time_ms asc, updated_at asc limit 1) = ${playerId}
      on conflict (player_id, (data->>'trail')) where kind = 'record-lost'
      do update set id = default, data = excluded.data, created_at = now()`;
  }

  return json({
    rank, total,
    time: timeMs / 1000,
    best: best.time_ms / 1000,
    // A run that only ties the row's time changes nothing on the board.
    improved: !previous || timeMs < previous.time_ms,
    ahead: rival(ahead),
    behind: rival(behind),
    runs: await top(sql, trail),
    token: renewedToken(session),
  });
}

export default req => respond(async () => {
  if (req.method === 'GET') return list(req);
  if (req.method === 'POST') return submit(req);
  throw new HttpError(405, 'method not allowed');
});

export const config = { path: '/api/leaderboard' };
