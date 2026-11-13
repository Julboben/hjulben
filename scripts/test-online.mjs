// End-to-end tests for the online API (netlify/functions) against an in-memory
// Postgres (PGlite) and a software passkey authenticator: schema setup,
// passkey sign-up and login, cloud saves, and server-side run verification.
// Needs the npm dependencies: run `npm ci` first.
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign as signData } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { useSql } from '../netlify/lib/db.mjs';
import { useTrailLoader } from '../netlify/lib/verify-run.mjs';
import { sign } from '../netlify/lib/auth.mjs';
import account from '../netlify/functions/account.mjs';
import leaderboard from '../netlify/functions/leaderboard.mjs';
import { trailHash } from '../js/trail-hash.js';
import { RIDE_VERSION } from '../js/ride.js';
import { legacyLook } from '../js/cosmetics.js';
import { loadCatalogTrails, readJson, replayFile } from './lib/trails.mjs';

process.env.AUTH_SECRET = randomBytes(32).toString('hex');
delete process.env.RP_ID;

const SITE = 'https://h.julben.dk';
const RP_ID = 'julben.dk';

// --- Database ---------------------------------------------------------------

const pg = new PGlite();
// Like Neon's HTTP driver, a query runs once awaited, so a list of them can
// also run in order in one transaction.
const sql = (strings, ...values) => {
  const run = db => db.sql(strings, ...values).then(result => result.rows);
  return { run, then: (resolve, reject) => run(pg).then(resolve, reject) };
};
sql.transaction = queries => pg.transaction(async tx => {
  const results = [];
  for (const query of queries) results.push(await query.run(tx));
  return results;
});
sql.query = (text, params) => pg.query(text, params).then(result => result.rows);
useSql(sql);

const officialTrails = loadCatalogTrails('official');
const trails = new Map(officialTrails.map(entry => [entry.id, entry.trail]));
// Tests pick trails by catalog position, so renaming a trail never breaks them.
const [firstTrail, secondTrail, thirdTrail] = officialTrails;
assert.ok(thirdTrail, 'online tests need at least three official trails');
useTrailLoader(async id => trails.get(id) ?? null);
const keyOf = id => {
  assert.ok(trails.has(id), `unknown official trail ${id}`);
  return `${id}@${trailHash(trails.get(id))}`;
};
const fixture = entry => readJson(`tests/replays/${replayFile(entry)}`);

// --- HTTP helpers -------------------------------------------------------------

async function call(handler, path, { method = 'POST', body, token, origin = SITE } = {}) {
  const headers = { 'content-type': 'application/json', origin };
  if (token) headers.authorization = 'Bearer ' + token;
  const res = await handler(new Request(SITE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}
const api = (action, options) => call(account, '/api/account/' + action, options);
// Each submission starts with a clean rate limit; the limit itself is tested on its own below.
const submit = async (options) => { await sql`delete from rate_limits`; return call(leaderboard, '/api/leaderboard', options); };
const board = (trail, token) => call(leaderboard, '/api/leaderboard?trail=' + encodeURIComponent(trail), { method: 'GET', token });

// --- Software authenticator (ES256, "none" attestation) -------------------------

const b64url = bytes => Buffer.from(bytes).toString('base64url');
const sha256 = data => createHash('sha256').update(data).digest();

function cbor(value) {
  const head = (major, n) => {
    if (n < 24) return Buffer.from([major << 5 | n]);
    if (n < 256) return Buffer.from([major << 5 | 24, n]);
    const out = Buffer.alloc(3); out[0] = major << 5 | 25; out.writeUInt16BE(n, 1); return out;
  };
  if (Number.isInteger(value)) return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === 'string') return Buffer.concat([head(3, Buffer.byteLength(value)), Buffer.from(value)]);
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  const entries = value instanceof Map ? [...value] : Object.entries(value);
  return Buffer.concat([head(5, entries.length), ...entries.flatMap(([key, item]) => [cbor(key), cbor(item)])]);
}

function createAuthenticator(rpID = RP_ID) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credentialId = randomBytes(16);
  let counter = 0;
  const counterBytes = () => { const out = Buffer.alloc(4); out.writeUInt32BE(counter); return out; };
  return {
    id: b64url(credentialId),
    register(options, origin = SITE) {
      assert.equal(options.rp.id, rpID);
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin, crossOrigin: false }));
      const coseKey = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
      const length = Buffer.alloc(2); length.writeUInt16BE(credentialId.length);
      const authData = Buffer.concat([sha256(rpID), Buffer.from([0x45]), counterBytes(), Buffer.alloc(16), length, credentialId, coseKey]);
      return {
        id: b64url(credentialId), rawId: b64url(credentialId), type: 'public-key', clientExtensionResults: {},
        response: { clientDataJSON: b64url(clientDataJSON), attestationObject: b64url(cbor({ fmt: 'none', attStmt: {}, authData })), transports: ['internal'] },
      };
    },
    login(options, origin = SITE) {
      assert.equal(options.rpId, rpID);
      counter++;
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin, crossOrigin: false }));
      const authData = Buffer.concat([sha256(rpID), Buffer.from([0x05]), counterBytes()]);
      const signature = signData('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), privateKey);
      return {
        id: b64url(credentialId), rawId: b64url(credentialId), type: 'public-key', clientExtensionResults: {},
        response: { clientDataJSON: b64url(clientDataJSON), authenticatorData: b64url(authData), signature: b64url(signature) },
      };
    },
  };
}

async function registerRider(name, authenticator = createAuthenticator(), rider = 'male') {
  const options = await api('register-options', { body: { name } });
  assert.equal(options.status, 200, JSON.stringify(options.body));
  const response = authenticator.register(options.body.options);
  return api('register', { body: { state: options.body.state, response, rider } });
}

async function loginRider(authenticator) {
  const options = await api('login-options', { body: {} });
  assert.equal(options.status, 200);
  assert.deepEqual(options.body.options.allowCredentials ?? [], [], 'login offers every passkey (discoverable)');
  return api('login', { body: { state: options.body.state, response: authenticator.login(options.body.options) } });
}

// --- Schema ---------------------------------------------------------------------

const firstTrailKey = keyOf(firstTrail.id);
{
  const { status, body } = await board(firstTrailKey);
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body.runs, []);
  useSql(sql);   // a fresh instance runs the schema again, which must be a no-op
  assert.equal((await board(firstTrailKey)).status, 200);
  // A rider imported from the pre-accounts board: no passkey, no replay.
  await sql`insert into players (id, name, name_key, rider) values (${crypto.randomUUID()}, 'julben', 'julben', 'female')`;
  await sql`insert into runs (trail, player_id, rider, time_ms) select ${firstTrailKey}, id, 'female', 6908 from players where name_key = 'julben'`;
  assert.deepEqual((await board(firstTrailKey)).body.runs.map(run => [run.name, run.time]), [['julben', 6.908]]);
}

// --- Sign-up ------------------------------------------------------------------

const julian = createAuthenticator();
let julianToken;
{
  assert.equal((await api('register-options', { body: { name: '<script>' } })).status, 400, 'markup is not a valid name');
  assert.equal((await api('register-options', { body: { name: 'A'.repeat(17) } })).status, 400, 'names are at most 16 characters');
  assert.equal((await api('register-options', { body: { name: 'Admin' } })).status, 400, 'reserved names are blocked');
  assert.equal((await api('register-options', { body: { name: 'shithead' } })).status, 400, 'offensive names are blocked');
  assert.equal((await api('register-options', { body: { name: 'Freja' }, origin: 'https://evil.example' })).status, 400, 'foreign origins are refused');

  const { status, body } = await registerRider('  Freja  ', julian, 'female');
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.player.name, 'Freja');
  assert.equal(body.player.rider, 'female');
  assert.deepEqual(body.player.look, legacyLook('female'), 'a client sending only a rider gets its look');
  julianToken = body.token;

  for (const lookalike of ['freja', 'FREJA', 'Fréja', 'Fr_eja', 'Fr eja']) {
    const result = await api('register-options', { body: { name: lookalike } });
    assert.equal(result.status, 409, `${lookalike} counts as the taken name Freja`);
    assert.equal(result.body.error, 'name taken');
  }

  for (const markup of ['a&b', 'a"b', "a'b", 'a`b', 'a>b']) {
    assert.equal((await api('register-options', { body: { name: markup } })).status, 400, `${markup} is not a valid name`);
  }
  assert.equal((await api('register-options', { body: { name: '$$$' } })).status, 400, 'a name needs a letter or number');
  assert.equal((await api('register-options', { body: { name: 'f$uck' } })).status, 400, 'symbols don\'t get around the filter');
  assert.equal((await api('register-options', { body: { name: 'admin!' } })).status, 400, 'symbols don\'t get around reserved names');
  assert.equal((await api('register-options', { body: { name: 'C.o_da' } })).status, 400, 'Coda is reserved');
  assert.equal((await api('register-options', { body: { name: 'Jülian' } })).status, 400, 'Julian is reserved');

  const soren = await registerRider('$øren', createAuthenticator());
  assert.equal(soren.status, 200, JSON.stringify(soren.body));
  assert.equal(soren.body.player.name, '$øren', 'symbols like $ are kept');
  assert.equal((await api('register-options', { body: { name: '$Øren' } })).status, 409, 'case still doesn\'t make a new name');
  assert.equal((await api('register-options', { body: { name: 'øren' } })).status, 200, 'a symbol makes a different name');

  // Two people racing for one name: the second insert loses.
  const a = await api('register-options', { body: { name: 'Racer' } });
  const b = await api('register-options', { body: { name: 'racer' } });
  assert.equal((await api('register', { body: { state: a.body.state, response: createAuthenticator().register(a.body.options) } })).status, 200);
  assert.equal((await api('register', { body: { state: b.body.state, response: createAuthenticator().register(b.body.options) } })).status, 409);

  // A response for one challenge can't be used with another.
  const first = await api('register-options', { body: { name: 'Mallory' } });
  const second = await api('register-options', { body: { name: 'Mallory' } });
  const response = createAuthenticator().register(first.body.options);
  assert.equal((await api('register', { body: { state: second.body.state, response } })).status, 400, 'challenge mismatch is rejected');
  assert.equal((await api('register', { body: { state: first.body.state + 'x', response } })).status, 400, 'tampered state is rejected');
  const expired = sign({ type: 'register', challenge: first.body.options.challenge, name: 'Mallory', player: crypto.randomUUID(), rpID: RP_ID, origin: SITE }, -1);
  assert.equal((await api('register', { body: { state: expired, response } })).status, 400, 'expired state is rejected');
  const forged = createAuthenticator().register(first.body.options, 'https://evil.julben.dk.example');
  assert.equal((await api('register', { body: { state: first.body.state, response: forged } })).status, 400, 'passkey origin must match');
}

// --- Claiming an imported name -------------------------------------------------

{
  const owner = createAuthenticator();
  const { status, body } = await registerRider('JulBen', owner, 'male');
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.player.name, 'JulBen');
  assert.equal((await board(firstTrailKey)).body.runs[0].name, 'JulBen', 'the claimer gets the old times');
  assert.equal((await api('register-options', { body: { name: 'julben' } })).status, 409, 'claimed names are taken');
  const login = await loginRider(owner);
  assert.equal(login.status, 200);
  assert.deepEqual(login.body.runs, [], 'imported runs have no ghost to restore');
}

// --- Login --------------------------------------------------------------------

{
  const { status, body } = await loginRider(julian);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.player.name, 'Freja');
  assert.equal(body.save, null);
  assert.deepEqual(body.runs, []);
  assert.equal((await loginRider(createAuthenticator())).status, 404, 'unknown passkeys are refused');

  const options = await api('login-options', { body: {} });
  const response = julian.login(options.body.options);
  response.response.signature = b64url(randomBytes(70));
  assert.equal((await api('login', { body: { state: options.body.state, response } })).status, 400, 'bad signatures are refused');
}

// --- Run verification ---------------------------------------------------------

await sql`delete from runs where replay is null`;   // start from an empty board

const firstKey = keyOf(firstTrail.id);
const firstTrailRun = fixture(firstTrail);
const run = (replay = firstTrailRun) => ({ inputs: replay.inputs, seed: replay.seed, physics: RIDE_VERSION });
{
  assert.equal((await submit({ body: { trail: firstKey, rider: 'female', run: run() } })).status, 401, 'runs need a signed-in rider');
  assert.equal((await submit({ body: { trail: firstKey, run: run() }, token: julianToken + 'x' })).status, 401, 'forged tokens are refused');
  const otherPlayer = sign({ type: 'session', player: crypto.randomUUID() }, 60).replace(/.$/, c => (c === 'A' ? 'B' : 'A'));
  assert.equal((await submit({ body: { trail: firstKey, run: run() }, token: otherPlayer })).status, 401, 'tokens signed with another key are refused');

  // A client claiming a time gets the simulated one instead.
  const { status, body } = await submit({ body: { trail: firstKey, rider: 'female', run: run(), time: 1 }, token: julianToken });
  assert.equal(status, 200, JSON.stringify(body));
  assert.ok(Math.abs(body.time - firstTrailRun.outcome.elapsed) < 0.001, `server time ${body.time} matches the replay`);
  assert.equal(body.rank, 1);
  assert.equal(body.total, 1);
  assert.equal(body.runs[0].name, 'Freja');
  assert.equal(body.runs[0].rider, 'female');
  assert.equal(body.ahead, null, 'nobody is ahead of the only rider');
  assert.equal(body.behind, null, 'nor behind');

  // Cutting inputs off before the finish line.
  const short = structuredClone(firstTrailRun.inputs);
  short[short.length - 1][0] = 1;
  short.splice(-3);
  assert.equal((await submit({ body: { trail: firstKey, run: run({ ...firstTrailRun, inputs: short }) }, token: julianToken })).status, 422, 'unfinished runs are refused');
  assert.equal((await submit({ body: { trail: firstKey.replace(/@.*/, '@00000000'), run: run() }, token: julianToken })).status, 409, 'stale trail versions are refused');
  assert.equal((await submit({ body: { trail: firstKey, run: { ...run(), physics: RIDE_VERSION - 1 } }, token: julianToken })).status, 409, 'old physics versions are refused');
  assert.equal((await submit({ body: { trail: keyOf(secondTrail.id), run: run() }, token: julianToken })).status, 422, 'inputs from another trail do not finish it');
  for (const inputs of [[], [[1, 1, 2, 1, 0]], [[0, 1, 0, 1, 0]], [[1.5, 1, 0, 1, 0]], [[1, 0, 0, 1, 0]], [[1, 1, 0, 2, 0]], [[72001, 1, 0, 0, 0]], 'x']) {
    assert.equal((await submit({ body: { trail: firstKey, run: { ...run(), inputs } }, token: julianToken })).status, 400, `malformed inputs ${JSON.stringify(inputs)}`);
  }

  // A slower run keeps the best one and its ghost; a faster one replaces it.
  await sql`update runs set time_ms = 5000, replay = '{"marker":1}'::jsonb where trail = ${firstKey}`;
  const slower = await submit({ body: { trail: firstKey, rider: 'male', run: run() }, token: julianToken });
  assert.equal(slower.status, 200, JSON.stringify(slower.body));
  assert.equal(slower.body.best, 5);
  assert.equal(slower.body.improved, false);
  assert.equal(slower.body.runs[0].rider, 'female', 'the best run keeps its rider');
  assert.equal((await sql`select replay from runs where trail = ${firstKey}`)[0].replay.marker, 1);
  await sql`update runs set time_ms = 60000 where trail = ${firstKey}`;
  const faster = await submit({ body: { trail: firstKey, rider: 'female', run: run() }, token: julianToken });
  assert.equal(faster.body.improved, true);
  assert.equal(faster.body.runs.length, 1, 'one row per rider');
  assert.deepEqual(faster.body.runs[0].look, legacyLook('female'), 'rows from rider-only clients show that rider');

  // A run's look is kept with it, and the board falls back for unknown items.
  // Freja was created female with tan skin, and a run can't change that.
  const bareLook = {
    ...legacyLook('female'), hair: 'bob', hairColor: 'blonde', helmet: 'none', outfitColor: 'yellow',
    bike: 'classic', bikeColor: 'blue'
  };
  await sql`update runs set time_ms = 60000 where trail = ${firstKey}`;
  const styled = await submit({ body: { trail: firstKey, look: { ...bareLook, gender: 'male', skin: 'deep' }, run: run() }, token: julianToken });
  assert.deepEqual(styled.body.runs[0].look, bareLook, 'the board shows the look a run was ridden in, with the rider\'s own gender and skin');
  assert.equal(styled.body.runs[0].rider, 'female', 'and a rider for older clients');
  await sql`update runs set time_ms = 60000 where trail = ${firstKey}`;
  const odd = await submit({ body: { trail: firstKey, look: { ...bareLook, helmet: 'golden-crown', outfit: 7 }, run: run() }, token: julianToken });
  // A run sent without a rider takes the male rider's old look for them.
  const oldLook = legacyLook('male');
  assert.deepEqual(odd.body.runs[0].look, { ...bareLook, helmet: oldLook.helmet, outfit: oldLook.outfit }, 'unknown items fall back to the old rider\'s look');
  await sql`update runs set time_ms = 60000 where trail = ${firstKey}`;
  await submit({ body: { trail: firstKey, rider: 'female', run: run() }, token: julianToken });

  // The riders either side of the player's best, for the finish screen.
  const bestMs = Math.round(firstTrailRun.outcome.elapsed * 1000);
  const rivals = [['Speedy', bestMs - 500], ['Tied', bestMs], ['Slowpoke', bestMs + 1000], ['Slowest', bestMs + 2000]];
  for (const [name, timeMs] of rivals) {
    const id = crypto.randomUUID();
    await sql`insert into players (id, name, name_key, rider) values (${id}, ${name}, ${name.toLowerCase()}, 'male')`;
    await sql`insert into runs (trail, player_id, rider, time_ms) values (${firstKey}, ${id}, 'male', ${timeMs})`;
  }
  const chasing = await submit({ body: { trail: firstKey, rider: 'female', run: run() }, token: julianToken });
  assert.equal(chasing.body.rank, 2);
  assert.deepEqual(chasing.body.ahead, { name: 'Speedy', time: (bestMs - 500) / 1000, replay: false }, 'the nearest faster rider');
  assert.deepEqual(chasing.body.behind, { name: 'Tied', time: bestMs / 1000 }, 'a tied rider counts as behind');
  assert.deepEqual(chasing.body.runs.map(r => [r.name, r.rank]), [['Speedy', 1], ['Freja', 2], ['Tied', 2], ['Slowpoke', 4], ['Slowest', 5]],
    'riders on the same time share a rank, the older run listed first');
  assert.deepEqual(chasing.body.runs.map(r => r.replay), [false, true, false, false, false], 'only runs with a replay can be watched');
  assert.equal(chasing.body.total, 5);
  assert.deepEqual(chasing.body.near, [], 'a player in the top ten needs no row of their own');
  await sql`delete from players where name_key in ('speedy', 'tied')`;
  const leading = await submit({ body: { trail: firstKey, rider: 'female', run: run() }, token: julianToken });
  assert.equal(leading.body.rank, 1);
  assert.equal(leading.body.ahead, null);
  assert.deepEqual(leading.body.behind, { name: 'Slowpoke', time: (bestMs + 1000) / 1000 }, 'the leader sees who is chasing');
  await sql`delete from players where name_key in ('slowpoke', 'slowest')`;

  const ghost = await call(leaderboard, '/api/leaderboard?ghost=1&trail=' + encodeURIComponent(firstKey), { method: 'GET' });
  assert.equal(ghost.status, 200);
  assert.equal(ghost.body.ghost.name, 'Freja');
  assert.equal(ghost.body.ghost.replay.physics, RIDE_VERSION);
  assert.ok(Math.abs(ghost.body.ghost.replay.time - firstTrailRun.outcome.elapsed) < 0.001, 'world ghost is the best replay');
  const none = await call(leaderboard, '/api/leaderboard?ghost=1&trail=' + encodeURIComponent(keyOf(thirdTrail.id)), { method: 'GET' });
  assert.equal(none.body.ghost, null, 'no ghost before anyone finishes');

  const listed = await board(firstKey);
  assert.equal(listed.body.runs[0].name, 'Freja');
  assert.equal((await board('trail:abcdef12')).status, 400, 'custom trails stay local');

  // A player below the top ten gets their row and the riders either side.
  const quick = Array.from({ length: 11 }, (_, index) => ['Quick' + index, bestMs - 1100 + index * 10]);
  for (const [name, timeMs] of [...quick, ['Behind', bestMs + 10]]) {
    const id = crypto.randomUUID();
    await sql`insert into players (id, name, name_key, rider) values (${id}, ${name}, ${name.toLowerCase()}, 'male')`;
    await sql`insert into runs (trail, player_id, rider, time_ms) values (${firstKey}, ${id}, 'male', ${timeMs})`;
  }
  const below = await board(firstKey, julianToken);
  assert.equal(below.body.runs.length, 10);
  assert.equal(below.body.total, 13);
  assert.deepEqual(below.body.near.map(r => [r.name, r.rank]), [['Quick10', 11], ['Freja', 12], ['Behind', 13]]);
  assert.deepEqual((await board(firstKey)).body.near, [], 'a board fetched without a session has no rows of its own');
  assert.deepEqual((await board(firstKey, julianToken + 'x')).body.near, [], 'nor one with a broken session, which still gets the board');

  // Any rider's run can be watched or raced by name.
  const named = await call(leaderboard, '/api/leaderboard?ghost=1&name=Freja&trail=' + encodeURIComponent(firstKey), { method: 'GET' });
  assert.equal(named.body.ghost.name, 'Freja');
  const imported = await call(leaderboard, '/api/leaderboard?ghost=1&name=Quick0&trail=' + encodeURIComponent(firstKey), { method: 'GET' });
  assert.equal(imported.body.ghost, null, 'a time without a replay has no ghost');
  await sql`delete from players where name_key like 'quick%' or name_key = 'behind'`;
}

// --- Notifications ----------------------------------------------------------------

{
  await sql`delete from rate_limits`;
  const { body: racer } = await registerRider('Chaser', createAuthenticator(), 'male');
  const racerId = (await sql`select id from players where name_key = 'chaser'`)[0].id;
  const fresh = (token, after = 0) => api('notifications?after=' + after, { method: 'GET', token });
  const recordNotices = async () => (await sql`select count(*)::int as count from notifications where kind = 'record-lost'`)[0].count;
  const bestMs = Math.round(firstTrailRun.outcome.elapsed * 1000);
  assert.equal((await fresh(undefined)).status, 401, 'news needs a signed-in rider');
  assert.deepEqual((await fresh(julianToken)).body.notifications, [], 'no news to begin with');

  // Taking the record tells the rider who held it.
  await sql`update runs set time_ms = 60000 where trail = ${firstKey}`;
  assert.equal((await submit({ body: { trail: firstKey, run: run() }, token: racer.token })).status, 200);
  let news = (await fresh(julianToken)).body.notifications;
  assert.equal(news.length, 1, 'the old record holder hears of it');
  assert.equal(news[0].kind, 'record-lost');
  assert.equal(news[0].trail, firstKey);
  assert.equal(news[0].name, 'Chaser');
  assert.ok(Math.abs(news[0].time - bestMs / 1000) < 0.001, 'with the new time');
  assert.equal(news[0].was, 60, 'and the time it beat');
  assert.ok(news[0].at > Date.now() - 60_000);
  assert.deepEqual((await fresh(julianToken, news[0].id)).body.notifications, [], 'a device asks only for what it has not had');
  assert.deepEqual((await fresh(racer.token)).body.notifications, [], 'the new holder gets no news');

  // Beating your own record, tying it, or a run behind the leader tell nobody.
  await sql`update runs set time_ms = 50000 where trail = ${firstKey} and player_id = ${racerId}`;
  await submit({ body: { trail: firstKey, run: run() }, token: racer.token });
  await sql`update runs set time_ms = ${bestMs}, updated_at = now() - interval '1 day' where trail = ${firstKey} and player_id <> ${racerId}`;
  await sql`update runs set time_ms = 70000 where trail = ${firstKey} and player_id = ${racerId}`;
  await submit({ body: { trail: firstKey, run: run() }, token: racer.token });
  await sql`update runs set time_ms = ${bestMs - 500} where trail = ${firstKey} and player_id <> ${racerId}`;
  await sql`update runs set time_ms = 70000 where trail = ${firstKey} and player_id = ${racerId}`;
  await submit({ body: { trail: firstKey, run: run() }, token: racer.token });
  assert.equal(await recordNotices(), 1, 'only a faster run by someone else takes the record');

  // A record lost again on the same trail is one notice, the latest.
  await sql`update runs set time_ms = 60000 where trail = ${firstKey}`;
  await sql`update runs set time_ms = 40000 where trail = ${firstKey} and player_id <> ${racerId}`;
  await submit({ body: { trail: firstKey, run: run() }, token: racer.token });
  await sql`update runs set time_ms = 30000 where trail = ${firstKey} and player_id <> ${racerId}`;
  await sql`update runs set time_ms = 60000 where trail = ${firstKey} and player_id = ${racerId}`;
  await submit({ body: { trail: firstKey, run: run() }, token: racer.token });
  const lastSeen = news[0].id;
  news = (await fresh(julianToken)).body.notifications;
  assert.deepEqual(news.map(notice => notice.was), [30], 'one notice per trail');
  assert.ok(news[0].id > lastSeen, 'under a new id, so devices that read the old one fetch it again');

  // Two runs taking the record at once tell the old holder once, about the run that holds it.
  const { body: rival } = await registerRider('Rival', createAuthenticator(), 'female');
  await sql`update runs set time_ms = 60000 where trail = ${firstKey}`;
  await sql`delete from notifications`;
  await Promise.all([racer.token, rival.token].map(token => submit({ body: { trail: firstKey, run: run() }, token })));
  const [holder] = await sql`select p.name from runs r join players p on p.id = r.player_id where r.trail = ${firstKey} order by r.time_ms, r.updated_at limit 1`;
  news = (await fresh(julianToken)).body.notifications;
  assert.deepEqual(news.map(notice => notice.name), [holder.name], 'one notice, naming the rider who holds the record');
  await sql`delete from players where name_key = 'rival'`;

  // A run that enters the top ten tells the rider it pushed out of it.
  // Freja's run stays, at the back of the board.
  await sql`delete from runs where trail = ${firstKey} and player_id <> (select id from players where name_key = 'freja')`;
  await sql`update runs set time_ms = 90000 where trail = ${firstKey}`;
  await sql`delete from notifications`;
  const others = [...Array.from({ length: 9 }, (_, index) => ['Fast' + index, bestMs - 900 + index * 100]), ['Tenth', bestMs + 500]];
  for (const [name, timeMs] of others) {
    const id = crypto.randomUUID();
    await sql`insert into players (id, name, name_key, rider) values (${id}, ${name}, ${name.toLowerCase()}, 'male')`;
    await sql`insert into runs (trail, player_id, rider, time_ms) values (${firstKey}, ${id}, 'male', ${timeMs})`;
  }
  const tenthId = (await sql`select id from players where name_key = 'tenth'`)[0].id;
  const topTenNotices = () => sql`select player_id, data from notifications where kind = 'top-ten-lost'`;
  await submit({ body: { trail: firstKey, run: run() }, token: racer.token });
  let pushed = await topTenNotices();
  assert.deepEqual(pushed.map(row => [row.player_id, row.data.name]), [[tenthId, 'Chaser']], 'the rider pushed out hears who did it');
  assert.ok(Math.abs(pushed[0].data.time - bestMs / 1000) < 0.001, 'and with what time');

  // Each rider's place on every trail they have a time on, for the trail picker.
  assert.equal((await call(leaderboard, '/api/leaderboard?mine=1', { method: 'GET' })).status, 401, 'standings need a signed-in rider');
  const mine = await call(leaderboard, '/api/leaderboard?mine=1', { method: 'GET', token: racer.token });
  assert.deepEqual(Object.keys(mine.body.standings), [firstKey]);
  assert.deepEqual({ ...mine.body.standings[firstKey], time: undefined }, { rank: 10, total: 12, time: undefined });
  assert.deepEqual((await board(firstKey, racer.token)).body.near, [], 'a rider tenth on the board has no rows below the top');

  // A run that moves up within the top ten pushes nobody out.
  await sql`delete from notifications`;
  await sql`delete from players where name_key = 'fast0'`;
  await sql`update runs set time_ms = ${bestMs + 100} where trail = ${firstKey} and player_id = ${racerId}`;
  await submit({ body: { trail: firstKey, run: run() }, token: racer.token });
  assert.deepEqual(await topTenNotices(), [], 'the last rider in the top ten is still in it');

  // Two runs entering the top ten at once push out, and tell, two different riders.
  const ninthId = crypto.randomUUID();
  await sql`insert into players (id, name, name_key, rider) values (${ninthId}, 'Ninth', 'ninth', 'male')`;
  await sql`insert into runs (trail, player_id, rider, time_ms) values (${firstKey}, ${ninthId}, 'male', ${bestMs + 300})`;
  await sql`update runs set time_ms = 90000 where trail = ${firstKey} and player_id = ${racerId}`;
  await sql`delete from notifications`;
  const { body: entrant } = await registerRider('Entrant', createAuthenticator(), 'female');
  await Promise.all([racer.token, entrant.token].map(token => submit({ body: { trail: firstKey, run: run() }, token })));
  pushed = await topTenNotices();
  assert.deepEqual(pushed.map(row => row.player_id).sort(), [ninthId, tenthId].sort(), 'each pushed-out rider hears of it once');
  await sql`delete from players where name_key like 'fast%' or name_key in ('tenth', 'ninth', 'entrant')`;

  // News that doesn't fit in one reply says more is waiting.
  const frejaId = (await sql`select id from players where name_key = 'freja'`)[0].id;
  for (let index = 0; index < 21; index++) {
    await sql`insert into notifications (player_id, kind, data) values (${frejaId}, 'test', '{}'::jsonb)`;
  }
  let page = (await fresh(julianToken, news[0].id)).body;
  assert.equal(page.notifications.length, 20);
  assert.equal(page.more, true, 'more is waiting');
  page = (await fresh(julianToken, page.notifications.at(-1).id)).body;
  assert.equal(page.notifications.length, 1);
  assert.equal(page.more, false, 'and then no more');
  await sql`delete from notifications where kind = 'test'`;

  // Old news is cleared.
  await sql`update notifications set created_at = now() - interval '61 days'`;
  assert.deepEqual((await fresh(julianToken)).body.notifications, [], 'news older than 60 days is gone');
  assert.equal(await recordNotices(), 0);
  await sql`update runs set time_ms = 60000 where trail = ${firstKey}`;
  await sql`delete from runs where trail = ${firstKey} and player_id = ${racerId}`;
  await sql`delete from players where id = ${racerId}`;
  await sql`update runs set time_ms = ${bestMs} where trail = ${firstKey}`;
}

// --- Cloud save and login restore ---------------------------------------------

{
  const save = { rider: 'female', createdAt: 1700000000000, trail: 1, unlocked: 2, bestTimes: { [firstKey]: 8.192, 'not-a-key': 3, [keyOf(secondTrail.id)]: -1 }, achievements: { bonk: 5, 'Bad Id': 1 }, stats: { flips: 3, crashes: -2 }, extra: 'x'.repeat(100) };
  assert.equal((await api('save', { method: 'PUT', body: { save } })).status, 401);
  assert.equal((await api('save', { method: 'POST', body: { save }, token: julianToken })).status, 405);
  assert.equal((await api('save', { method: 'PUT', body: { save }, token: julianToken })).status, 200);
  assert.equal((await api('save', { method: 'PUT', body: { save: { ...save, extra: 'x'.repeat(40_000) } }, token: julianToken })).status, 413);

  let { body } = await loginRider(julian);
  assert.deepEqual(body.save, { look: legacyLook('female'), lookUpdatedAt: 0, ghost: null, ghostUpdatedAt: 0, rider: 'female', createdAt: 1700000000000, trail: 1, unlocked: 2, bestTimes: { [firstKey]: 8.192 }, achievements: { bonk: 5 }, stats: { flips: 3 }, nisse: {} }, 'only savegame fields are kept');
  assert.deepEqual(body.player.look, legacyLook('female'));

  // A look changed in the Garage reaches the player and their next login.
  const look = { ...legacyLook('female'), hair: 'buzz', hairColor: 'red', helmet: 'none', outfitColor: 'black', bikeColor: 'purple' };
  assert.equal((await api('save', { method: 'PUT', body: { save: { ...save, look: { ...look, gender: 'male', skin: 'fair' } } }, token: julianToken })).status, 200);
  ({ body } = await loginRider(julian));
  assert.deepEqual(body.save.look, look, 'gender and skin stay as they were created');
  assert.equal(body.save.rider, 'female', 'a buzz cut does not change who the rider is');
  assert.deepEqual(body.player.look, look);
  // A device that is already signed in fetches the same look without logging in again.
  assert.equal((await api('save', { method: 'GET' })).status, 401);
  assert.equal((await api('save', { method: 'DELETE', token: julianToken })).status, 405);
  const fetched = await api('save', { method: 'GET', token: julianToken });
  assert.equal(fetched.status, 200);
  assert.deepEqual(fetched.body.player.look, look);
  assert.deepEqual(fetched.body.save, body.save);
  assert.equal(body.runs.length, 1);

  // A stale copy from another device can't wipe out progress: the cloud keeps the best of both.
  const stale = { ...save, unlocked: 1, bestTimes: { [firstKey]: 9.5 }, achievements: { wheelie: 7 }, stats: { flips: 1, crashes: 4 } };
  const merged = await api('save', { method: 'PUT', body: { save: stale }, token: julianToken });
  assert.equal(merged.status, 200);
  assert.equal(merged.body.save.unlocked, 2, 'progress keeps the higher');
  assert.equal(merged.body.save.bestTimes[firstKey], 8.192, 'best times keep the faster');
  assert.deepEqual(merged.body.save.achievements, { bonk: 5, wheelie: 7 }, 'achievements are the union');
  assert.deepEqual(merged.body.save.stats, { flips: 3, crashes: 4 }, 'stats keep the higher');
  assert.equal(merged.body.token, null, 'a fresh session is not renewed');
  assert.deepEqual((await api('save', { method: 'GET', token: julianToken })).body.save, merged.body.save);
  // Postgres stamps saves to the microsecond (PGlite only to the millisecond),
  // and a save after one must still go through.
  await sql`update players set save_updated_at = now() + interval '123 microseconds'`;
  assert.equal((await api('save', { method: 'PUT', body: { save: stale }, token: julianToken })).status, 200, 'a save stamped to the microsecond is not a conflict');

  // The look changed last wins, whichever device sends it.
  const older = { ...save, look: { ...look, hair: 'ponytail' }, lookUpdatedAt: 1000 };
  const newer = { ...save, look: { ...look, hair: 'mohawk' }, lookUpdatedAt: 2000 };
  assert.equal((await api('save', { method: 'PUT', body: { save: newer }, token: julianToken })).status, 200);
  const staleLook = await api('save', { method: 'PUT', body: { save: older }, token: julianToken });
  assert.equal(staleLook.body.save.look.hair, 'mohawk', 'an older look does not replace a newer one');
  assert.equal(staleLook.body.save.lookUpdatedAt, 2000);
  assert.equal((await api('save', { method: 'GET', token: julianToken })).body.player.look.hair, 'mohawk');
  const newest = await api('save', { method: 'PUT', body: { save: { ...older, lookUpdatedAt: 3000 } }, token: julianToken });
  assert.equal(newest.body.save.look.hair, 'ponytail', 'a newer look does');

  // So does the ghost the rider races, and a client that sends none keeps the cloud's.
  assert.equal(newest.body.save.ghost, null, 'a save without a ghost choice has none');
  const world = await api('save', { method: 'PUT', body: { save: { ...save, ghost: 'world', ghostUpdatedAt: 2000 } }, token: julianToken });
  assert.equal(world.body.save.ghost, 'world');
  const staleGhost = await api('save', { method: 'PUT', body: { save: { ...save, ghost: 'off', ghostUpdatedAt: 1000 } }, token: julianToken });
  assert.equal(staleGhost.body.save.ghost, 'world', 'an older ghost choice does not replace a newer one');
  assert.equal((await api('save', { method: 'PUT', body: { save }, token: julianToken })).body.save.ghost, 'world', 'nor does a save without one');
  const bogus = await api('save', { method: 'PUT', body: { save: { ...save, ghost: 'sideways', ghostUpdatedAt: 9000 } }, token: julianToken });
  assert.equal(bogus.body.save.ghost, 'world', 'an unknown ghost is dropped');
  const newestGhost = await api('save', { method: 'PUT', body: { save: { ...save, ghost: 'on', ghostUpdatedAt: 3000 } }, token: julianToken });
  assert.equal(newestGhost.body.save.ghost, 'on', 'a newer choice does');
  assert.equal(newestGhost.body.save.ghostUpdatedAt, 3000);
  const { trail, ghost } = body.runs[0];
  assert.equal(trail, firstKey);
  assert.equal(ghost.physics, RIDE_VERSION);
  assert.ok(Math.abs(ghost.time - firstTrailRun.outcome.elapsed) < 0.001);
  assert.equal(ghost.splits.length, firstTrailRun.outcome.apples, 'ghost has a split per apple');
  assert.ok(Number.isInteger(ghost.startStep) && ghost.startStep >= 0);
  assert.equal(ghost.inputs.reduce((sum, row) => sum + row[0], 0), firstTrailRun.steps, 'ghost keeps the inputs up to the finish');
}

// --- Rate limits ----------------------------------------------------------------

{
  await sql`delete from rate_limits`;
  let last = 200;
  for (let count = 0; count < 20 && last === 200; count++) {
    ({ status: last } = await call(leaderboard, '/api/leaderboard', { body: { trail: firstKey, run: run() }, token: julianToken }));
  }
  assert.equal(last, 429, 'a player is limited to a few submissions a minute');
  await sql`delete from rate_limits`;
  assert.equal((await call(leaderboard, '/api/leaderboard', { body: { trail: firstKey, run: run() }, token: julianToken })).status, 200, 'the limit lifts with the window');
  last = 200;
  for (let count = 0; count < 25 && last !== 429; count++) {
    ({ status: last } = await api('register-options', { body: { name: 'someone' + count } }));
  }
  assert.equal(last, 429, 'passkey ceremonies are limited per address');
  await sql`delete from rate_limits`;
}

// --- Deleting a rider -------------------------------------------------------------

{
  const doomed = createAuthenticator();
  const { status, body: created } = await registerRider('Doomed', doomed, 'male');
  assert.equal(status, 200, JSON.stringify(created));
  const doomedToken = created.token;
  assert.equal((await submit({ body: { trail: firstKey, run: run() }, token: doomedToken })).status, 200);
  assert.ok((await board(firstKey)).body.runs.some(r => r.name === 'Doomed'), 'the rider is on the board');

  const ceremony = async authenticator => {
    const options = await api('login-options', { body: {} });
    return { state: options.body.state, response: authenticator.login(options.body.options) };
  };
  assert.equal((await api('delete', { body: await ceremony(doomed) })).status, 401, 'deleting needs a signed-in rider');
  assert.equal((await api('delete', { body: await ceremony(julian), token: doomedToken })).status, 403, 'another rider’s passkey cannot delete this one');
  assert.equal((await api('delete', { body: { state: 'x', response: {} }, token: doomedToken })).status, 400);
  assert.equal((await api('delete', { body: await ceremony(doomed), token: doomedToken })).status, 200, 'the rider confirms with their own passkey');

  assert.equal((await loginRider(doomed)).status, 404, 'the passkey is gone');
  assert.equal((await api('save', { method: 'GET', token: doomedToken })).status, 401, 'the session is gone');
  assert.ok(!(await board(firstKey)).body.runs.some(r => r.name === 'Doomed'), 'the runs are gone');
  assert.equal((await api('register-options', { body: { name: 'doomed' } })).status, 200, 'the name is free again');
}

// --- Passkeys on other hosts ----------------------------------------------------

{
  const preview = 'https://deploy-preview-1--hjulben.netlify.app';
  const options = await call(account, '/api/account/login-options', { body: {}, origin: preview });
  assert.equal(options.status, 400, 'the API refuses origins other than its own host');
  const local = new Request('http://localhost:8888/api/account/login-options', { method: 'POST', headers: { origin: 'http://localhost:8888' }, body: '{}' });
  const localOptions = await (await account(local)).json();
  assert.equal(localOptions.options.rpId, 'localhost', 'other hosts use their own rpID');
}

// --- Not configured -------------------------------------------------------------

{
  const secret = process.env.AUTH_SECRET;
  delete process.env.AUTH_SECRET;
  assert.equal((await api('login-options', { body: {} })).status, 503);
  process.env.AUTH_SECRET = secret;
}

await pg.close();
console.log('Online API tests passed.');
