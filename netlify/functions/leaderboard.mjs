// Online leaderboard API.
//   GET  /api/leaderboard?trail=ID              (Bearer token optional)  -> { runs, total, near }
//   GET  /api/leaderboard?trail=ID&ghost=1[&name=NAME]                   -> { ghost: { name, look, rider, replay } | null }
//   GET  /api/leaderboard?mine=1                (Bearer token)           -> { standings: { [trail]: { time, rank, total } } }
//   POST /api/leaderboard  { trail, look, run }  (Bearer token)     -> { rank, total, time, best, improved, ahead, behind, runs, near }
// `runs` is the top of the board, `total` how many riders it has, and `near`
// the signed-in player's row with the rows either side of it, when it is
// below the top. Each row has its `rank`, shared by riders on the same time,
// and `replay`, whether it can be watched (imported times can't).
// `ahead` is the nearest rider faster than the player's best, { name, time,
// replay } or null, and `behind` the nearest one at or behind it, { name, time } or null.
// `run` is the ride's recorded inputs ({ inputs, seed, physics }). The server
// replays them and takes the time from its own simulation, never the client's.
import { db } from '../lib/db.mjs';
import { HttpError, json, respond, readBody, requireSession, optionalPlayer, renewedToken } from '../lib/auth.mjs';
import { TRAIL_RE, verifyRun } from '../lib/verify-run.mjs';
import { lookOf, legacyRider, playerLook } from '../lib/looks.mjs';
import { rateLimit } from '../lib/rate-limit.mjs';

const TOP = 10;
// Replaying a run costs real CPU, so a player gets this many a minute.
const SUBMITS_PER_MINUTE = 12;

/**
 * The top of a trail's board and, for a signed-in player below it, their row
 * with the rows either side, in one query so a board costs one round trip.
 */
async function board(sql, trail, playerId = null) {
  const rows = await sql`
    with ranked as (
      select p.name, r.player_id, r.rider, r.look, r.time_ms, r.updated_at, r.replay is not null as replay,
        rank() over (order by r.time_ms)::int as rank,
        row_number() over (order by r.time_ms, r.updated_at)::int as place,
        count(*) over ()::int as total
      from runs r join players p on p.id = r.player_id
      where r.trail = ${trail}
    ), mine as (select place from ranked where player_id = ${playerId})
    select * from ranked
    where place <= ${TOP} or place between (select place from mine) - 1 and (select place from mine) + 1
    order by place`;
  const row = r => ({
    name: r.name, rider: r.rider, look: lookOf(r), time: r.time_ms / 1000, date: new Date(r.updated_at).getTime(),
    rank: r.rank, replay: r.replay,
  });
  return {
    runs: rows.filter(r => r.place <= TOP).map(row),
    total: rows[0]?.total ?? 0,
    near: rows.filter(r => r.place > TOP).map(row),
  };
}

/** The player's place on every trail they have a time on, for the trail picker. */
async function standings(sql, playerId) {
  const rows = await sql`
    select trail, time_ms, rank, total from (
      select trail, player_id, time_ms,
        rank() over (partition by trail order by time_ms)::int as rank,
        count(*) over (partition by trail)::int as total
      from runs
      where trail in (select trail from runs where player_id = ${playerId})
    ) ranked
    where player_id = ${playerId}`;
  return Object.fromEntries(rows.map(r => [r.trail, { time: r.time_ms / 1000, rank: r.rank, total: r.total }]));
}

async function list(req) {
  const params = new URL(req.url).searchParams;
  if (params.has('mine')) return json({ standings: await standings(await db(), requireSession(req).player) });
  const trail = params.get('trail') ?? '';
  if (!TRAIL_RE.test(trail)) throw new HttpError(400, 'bad trail');
  if (params.has('ghost')) return json({ ghost: await ghost(await db(), trail, params.get('name')) });
  return json(await board(await db(), trail, optionalPlayer(req)));
}

/**
 * A rider's run with its replay, to watch or race: the named rider's, or
 * else the fastest that has one (imported times have none), for the World ghost.
 */
async function ghost(sql, trail, name) {
  const [row] = await sql`
    select p.name, r.rider, r.look, r.replay
    from runs r join players p on p.id = r.player_id
    where r.trail = ${trail} and r.replay is not null and (${name}::text is null or p.name = ${name})
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
  // Who held the world record before it, and who was last in the top ten,
  // to tell them if this run took the record or pushed them off the top.
  const places = await sql`
    select player_id, time_ms, updated_at, place from (
      select player_id, time_ms, updated_at, row_number() over (order by time_ms, updated_at)::int as place
      from runs where trail = ${trail}
    ) ranked
    where place in (1, ${TOP})`;
  const leader = places.find(row => row.place === 1);
  const last = places.find(row => row.place === TOP);
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

  const [{ rank, ahead, behind }] = await sql`
    select
      (select count(*) from runs where trail = ${trail} and time_ms < ${best.time_ms})::int + 1 as rank,
      (select json_build_object('name', p.name, 'time_ms', r.time_ms, 'replay', r.replay is not null)
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

  // The rider who was last in the top ten hears of it once this run has
  // pushed them below it; a run that was in the top ten already moves nobody
  // out. Only the latest news per trail is kept, as for a lost record.
  if (last && last.player_id !== playerId && (!previous || timeMs < previous.time_ms)) {
    const data = { trail, name: player.name, time: timeMs / 1000 };
    await sql`
      insert into notifications (player_id, kind, data)
      select ${last.player_id}, 'top-ten-lost', ${JSON.stringify(data)}::jsonb
      where (select count(*) from runs where trail = ${trail}
               and (time_ms, updated_at) < (${last.time_ms}, ${last.updated_at})) >= ${TOP}
      on conflict (player_id, (data->>'trail')) where kind = 'top-ten-lost'
      do update set id = default, data = excluded.data, created_at = now()`;
  }

  return json({
    rank,
    time: timeMs / 1000,
    best: best.time_ms / 1000,
    // A run that only ties the row's time changes nothing on the board.
    improved: !previous || timeMs < previous.time_ms,
    // The rider to chase, and whether their run can be raced as a ghost.
    ahead: ahead && { ...rival(ahead), replay: ahead.replay },
    behind: rival(behind),
    // The board as it stands after this run, with `total`.
    ...await board(sql, trail, playerId),
    token: renewedToken(session),
  });
}

export default req => respond(async () => {
  if (req.method === 'GET') return list(req);
  if (req.method === 'POST') return submit(req);
  throw new HttpError(405, 'method not allowed');
});

export const config = { path: '/api/leaderboard' };
