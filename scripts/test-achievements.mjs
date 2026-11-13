// Achievements and unlocks: the achievement catalog and how each kind is
// earned, the unlock table pointing at real trails, items and achievements,
// unlock rules and hints, and achievements and stats in saves and cloud sync.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACHIEVEMENTS, ACHIEVEMENT_GROUPS, achievement, statGains, eventAchievements, finishAchievements,
  interactAchievements, eggAchievements, editorAchievements, editorProgress, bikeBroken, hasAchievement, newlyEarned, cleanAchievements, cleanStats, mergeAchievements, mergeStats, aheadOf,
  createFeatTracker, statProgressText, finishGains
} from '../js/achievements.js';
import { createLimWatcher } from '../js/easter-eggs.js';
import { UNLOCKS, trailUnlock, lookUnlock, unlockStatus } from '../js/unlocks.js';
import { lookItem } from '../js/cosmetics.js';
import icons from '../icons/pixel-icons.mjs';

const catalog = JSON.parse(readFileSync(new URL('../trails/catalog.json', import.meta.url), 'utf8'));
const trailIds = new Set(catalog.trails.map(entry => entry.id));

// --- Catalog ---------------------------------------------------------------------

{
  const groups = new Set(ACHIEVEMENT_GROUPS.map(group => group.id));
  const ids = new Set();
  for (const a of ACHIEVEMENTS) {
    assert.match(a.id, /^[a-z0-9-]+$/, `${a.id} is a plain id`);
    assert.ok(!ids.has(a.id), `${a.id} is listed once`);
    ids.add(a.id);
    assert.ok(groups.has(a.group), `${a.id} is in a known group`);
    assert.ok(a.name && a.blurb, `${a.id} has a name and blurb`);
    assert.ok(icons[a.icon], `${a.id}'s icon "${a.icon}" exists`);
    assert.ok(Object.isFrozen(a), `${a.id} is frozen`);
    const ways = ['career', 'stat', 'event', 'finish', 'interact', 'egg', 'editor'].filter(way => a[way] !== undefined);
    assert.equal(ways.length, 1, `${a.id} is earned exactly one way`);
    if (a.hint) assert.ok(a.secret, `${a.id} only has a hint as a secret`);
    if (a.group === 'easter-eggs') assert.ok(a.secret, `${a.id} is a secret, like every easter egg`);
    if (a.stat) assert.ok(Number.isInteger(a.goal) && a.goal > 0, `${a.id} has a goal`);
    assert.equal(achievement(a.id), a);
  }
  assert.equal(achievement('nope'), null);
}

// --- Unlock table ------------------------------------------------------------------

{
  for (const [key, rule] of Object.entries(UNLOCKS)) {
    const [kind, ...rest] = key.split(':');
    if (kind === 'trail') assert.ok(trailIds.has(rest.join(':')), `${key} is a trail in the catalog`);
    else if (kind === 'look') assert.ok(lookItem(rest[0], rest[1]), `${key} is a rider item`);
    else assert.fail(`${key} is a trail or look reward`);
    for (const [part, value] of Object.entries(rule)) {
      assert.ok(['trails', 'golds', 'trail', 'achievement', 'soon'].includes(part), `${key}.${part} is a rule part`);
      if (part === 'soon') assert.equal(value, true, `${key}.soon is true`);
      else if (part === 'trail') assert.ok(trailIds.has(value), `${key} asks for a trail in the catalog`);
      else if (part === 'achievement') assert.ok(achievement(value), `${key} asks for a known achievement`);
      else assert.ok(Number.isInteger(value) && value > 0, `${key}.${part} is a positive count`);
    }
  }
  assert.deepEqual(trailUnlock('bonus:the-bonny-tyler'), { golds: 2 });
  assert.deepEqual(trailUnlock('bonus:the-mining-cave'), { golds: 4 });
  assert.equal(trailUnlock('official:the-orchard'), null, 'official trails follow the career instead');
  assert.equal(lookUnlock('bike', 'elasto'), null);
}

// --- Unlock rules ------------------------------------------------------------------

{
  const progress = ({ trails = 0, golds = 0, finished = [], has = [] } = {}) =>
    ({ trails, golds, finished: id => finished.includes(id), has: id => has.includes(id) });
  assert.deepEqual(unlockStatus(null, null), { open: true, hint: '' }, 'no rule is open, even without a save');
  assert.equal(unlockStatus({ trails: 3 }, null).open, false, 'a rule stays shut without a save');
  assert.equal(unlockStatus({ trails: 3 }, progress({ trails: 2, golds: 9 })).open, false);
  assert.equal(unlockStatus({ trails: 3 }, progress({ trails: 3 })).open, true);
  assert.equal(unlockStatus({ trails: 3, golds: 2 }, progress({ trails: 5, golds: 1 })).open, false, 'every part must be met');
  assert.equal(unlockStatus({ trails: 1, golds: 2 }, null).hint, 'FINISH 1 TRAIL & WIN 2 GOLD MEDALS TO UNLOCK');

  const everything = progress({ trails: 99, golds: 99, finished: ['bonus:the-bonny-tyler'], has: ['career-rider'] });
  assert.deepEqual(unlockStatus({ soon: true }, everything), { open: false, hint: 'COMING SOON' }, 'nothing wins a reward that comes later');

  const trailRule = { trail: 'bonus:the-bonny-tyler' };
  assert.equal(unlockStatus(trailRule, progress()).open, false);
  assert.equal(unlockStatus(trailRule, progress({ finished: [trailRule.trail] })).open, true);
  assert.equal(unlockStatus(trailRule, null).hint, 'FINISH A TRAIL TO UNLOCK');
  assert.equal(unlockStatus(trailRule, null, () => 'The Bonny Tyler').hint, 'FINISH THE BONNY TYLER TO UNLOCK');

  const earnRule = { achievement: 'triple-threat' };
  assert.equal(unlockStatus(earnRule, progress()).open, false);
  assert.equal(unlockStatus(earnRule, progress({ has: ['triple-threat'] })).open, true);
  assert.equal(unlockStatus(earnRule, null).hint, 'EARN “TRIPLE THREAT” TO UNLOCK');
  assert.equal(unlockStatus({ achievement: 'photo-finish' }, null).hint, 'EARN A SECRET ACHIEVEMENT TO UNLOCK', 'secrets stay secret');
}

// --- Earning -----------------------------------------------------------------------

{
  assert.deepEqual(statGains({ type: 'flip', count: 2, direction: 1 }), { flips: 2 });
  assert.deepEqual(statGains({ type: 'crash', cause: 'head' }), { crashes: 1 });
  assert.deepEqual(statGains({ type: 'apple', collected: 1, total: 3 }), { apples: 1 });
  assert.deepEqual(statGains({ type: 'shatter', blockId: 'a' }), { panes: 1 });
  assert.equal(statGains({ type: 'land', impact: 50 }), null);
  assert.deepEqual(statGains({ type: 'air', time: 1.26 }), { airtime: 13 }, 'times count in tenths of a second');
  assert.deepEqual(statGains({ type: 'wheelie', time: 2 }), { wheelie: 20 });
  assert.equal(statGains({ type: 'stoppie', time: 2 }), null);

  assert.deepEqual(eventAchievements({ type: 'flip', count: 1 }), ['head-over-heels']);
  assert.deepEqual(eventAchievements({ type: 'flip', count: 3 }), ['head-over-heels', 'triple-threat']);
  assert.deepEqual(eventAchievements({ type: 'flip', count: 4 }), ['head-over-heels', 'triple-threat', 'spin-cycle']);
  assert.deepEqual(eventAchievements({ type: 'air', time: 1.4 }), []);
  assert.deepEqual(eventAchievements({ type: 'air', time: 1.5 }), ['hang-time']);
  assert.deepEqual(eventAchievements({ type: 'wheelie', time: 5 }), ['wheelie-king']);
  assert.deepEqual(eventAchievements({ type: 'stoppie', time: 2 }), ['stoppie']);
  assert.deepEqual(eventAchievements({ type: 'stoppie', time: 1.9 }), []);
  assert.deepEqual(eventAchievements({ type: 'crash', cause: 'water' }), ['splashdown']);
  assert.deepEqual(eventAchievements({ type: 'crash', cause: 'spike' }), []);
  assert.deepEqual(eventAchievements({ type: 'shatter' }), ['bull-in-a-china-shop']);
  assert.deepEqual(eventAchievements({ type: 'helmet' }), ['bonk']);
  assert.deepEqual(interactAchievements('corgi'), ['pet-coda']);
  assert.deepEqual(interactAchievements('sign'), []);
  assert.deepEqual(eventAchievements({ type: 'crash', cause: 'fall' }), ['into-the-void']);
  assert.deepEqual(eventAchievements({ type: 'goalLocked', missing: 2 }), ['not-so-fast']);
  assert.deepEqual(eventAchievements({ type: 'start', wait: 59.9 }), []);
  assert.deepEqual(eventAchievements({ type: 'start', wait: 60 }), ['patience']);
  assert.deepEqual(eventAchievements({ type: 'start' }), [], 'a start without its wait earns nothing');
  for (const name of ['debug-console', 'cheat', 'rejected-run', 'kraken', 'lim']) {
    assert.equal(eggAchievements(name).length, 1, `easter egg ${name} earns an achievement`);
  }
  assert.deepEqual(eggAchievements('nope'), []);
  assert.deepEqual(editorAchievements('publish'), ['groundbreaker']);
  assert.deepEqual(editorAchievements('share'), ['show-and-tell']);
  assert.deepEqual(editorAchievements('playtest'), ['test-pilot']);
  assert.deepEqual(editorAchievements('nope'), []);
  assert.deepEqual(editorProgress({ publish: 1, 'new-trail': 2 }), { ids: ['groundbreaker'], gains: { published: 2 } });
  assert.deepEqual(editorProgress({ share: 3 }), { ids: ['show-and-tell'], gains: {} });
  assert.ok(hasAchievement('trail-network', {}, { published: 5 }, { trails: 0, golds: 0, officialTotal: 9, bonusFinished: 0, bonusTotal: 2 }), 'five new trails make a network');
  assert.ok(!hasAchievement('trail-network', {}, { published: 4 }, { trails: 0, golds: 0, officialTotal: 9, bonusFinished: 0, bonusTotal: 2 }));
  for (const a of ACHIEVEMENTS) if (a.group === 'trail-maker') assert.ok(!a.secret, `${a.id} is listed openly`);

  // Here Be Kraken: real riding stretches the bike by about a tenth at most.
  const wheel = (x, y = 0) => ({ x, y });
  assert.equal(bikeBroken(wheel(0), wheel(50)), false);
  assert.equal(bikeBroken(wheel(0), wheel(30, 40)), false, 'the wheelbase at any angle');
  assert.equal(bikeBroken(wheel(0), wheel(70)), false);
  assert.equal(bikeBroken(wheel(0), wheel(80)), true, 'pulled apart');
  assert.equal(bikeBroken(wheel(0), wheel(20)), true, 'squashed together');
  assert.equal(bikeBroken(wheel(0), wheel(NaN)), true, 'left the finite world');

  // Wolfenstein 3D's LIM code: L, I and M held at once, in any order.
  {
    const lim = createLimWatcher();
    assert.equal(lim.down('KeyM'), false);
    assert.equal(lim.down('KeyL'), false);
    assert.equal(lim.down('KeyI'), true, 'the third key completes it');
    assert.equal(lim.down('KeyI'), false, 'a key still held is not pressed again');
    assert.equal(lim.down('KeyX'), false, 'other keys alongside do not count');
    lim.up('KeyI');
    assert.equal(lim.down('KeyI'), true, 'pressing it again earns it again');
    lim.clear();
    assert.deepEqual(['KeyL', 'KeyI'].map(lim.down), [false, false]);
    lim.up('KeyL');
    assert.equal(lim.down('KeyM'), false, 'one key let go breaks it');
  }

  const run = {
    flips: 0, time: 30, medal: null, gold: 20, helmet: true, bike: 'elasto', night: false, rain: false, snow: false,
    attempts: 3, previousBest: null, worldBest: null, custom: false, shared: false
  };
  const gold = { ...run, time: 19.5, medal: 'gold' };
  assert.deepEqual(finishAchievements(run), [], 'a plain finish earns nothing');
  assert.deepEqual(finishAchievements(gold), [], 'nor does a plain gold');
  assert.deepEqual(finishAchievements({ ...run, flips: 3 }), ['flip-circus']);
  assert.deepEqual(finishAchievements({ ...run, flips: 15 }), ['flip-circus', 'show-off']);
  assert.deepEqual(finishAchievements({ ...run, attempts: 1 }), ['first-try']);
  assert.deepEqual(finishAchievements({ ...gold, attempts: 1 }), ['first-try'], 'a gold on the first try is one feat');
  assert.deepEqual(finishGains(run), {}, 'a plain finish adds no stats');
  assert.deepEqual(finishGains({ ...run, attempts: 1 }), { 'first-rides': 1 }, 'a first ride counts');
  assert.deepEqual(finishGains({ ...run, attempts: 1, previousBest: 30 }), {}, 'but not on a trail finished before');
  assert.deepEqual(finishGains({ ...run, helmet: false }), { bareheaded: 1 });
  assert.deepEqual(finishAchievements({ ...run, helmet: false }), ['wind-in-your-hair']);
  assert.deepEqual(finishAchievements({ ...gold, helmet: false }), ['wind-in-your-hair']);
  assert.deepEqual(finishAchievements({ ...run, night: true }), ['night-rider']);
  assert.deepEqual(finishAchievements({ ...gold, night: true }), ['night-rider']);
  assert.deepEqual(finishAchievements({ ...gold, bike: 'classic' }), ['old-school']);
  assert.deepEqual(finishAchievements({ ...run, time: 19.95, medal: 'gold' }), ['photo-finish']);
  assert.deepEqual(finishAchievements({ ...run, time: 19.95, medal: 'gold', gold: null }), [], 'photo finish needs a gold time');
  assert.deepEqual(finishAchievements({ ...run, time: 20.05, medal: 'silver' }), ['so-close']);
  assert.deepEqual(finishAchievements({ ...run, time: 20, medal: 'gold' }), ['photo-finish'], 'matching the gold time wins it, so it is not So Close');
  assert.deepEqual(finishAchievements({ ...run, time: 60 }), ['sunday-driver']);
  assert.deepEqual(finishAchievements({ ...run, time: 60, gold: null }), [], 'trails without medals have no gold time to compare');
  assert.deepEqual(finishAchievements({ ...run, worldBest: 30.5 }), ['ghostbuster']);
  assert.deepEqual(finishAchievements({ ...run, worldBest: 30 }), [], 'tying the world best does not beat it');
  assert.deepEqual(finishAchievements({ ...run, previousBest: 35 }), ['leaps-and-bounds']);
  assert.deepEqual(finishAchievements({ ...run, previousBest: 34.9 }), []);
  assert.deepEqual(finishAchievements({ ...run, attempts: 25 }), ['never-give-up']);
  assert.deepEqual(finishAchievements({ ...run, custom: true }), ['homebrew']);
  assert.deepEqual(finishAchievements({ ...run, custom: true, shared: true }), ['homebrew', 'guest-rider']);
  assert.deepEqual(finishAchievements({ ...run, rain: true, snow: true }), ['singin-in-the-rain', 'snow-day']);
  assert.deepEqual(finishAchievements({ ...run, previousBest: 30.0004 }), ['deja-vu'], 'matching to the millisecond');
  assert.deepEqual(finishAchievements({ ...run, time: 30.001, previousBest: 30 }), []);
  assert.deepEqual(finishAchievements({ ...run, time: 0.9, gold: null }), ['any-percent']);
  assert.deepEqual(finishAchievements({ ...run, time: 1, gold: null }), []);

  // Feats: reported as they end, if long enough to be more than a bump.
  const feats = createFeatTracker(0.1);
  const ride = (rear, front, steps) => Array.from({ length: steps }, () => feats.step(rear, front)).flat();
  assert.deepEqual(ride(true, true, 5), [], 'riding on both wheels is no feat');
  assert.deepEqual(ride(false, false, 2), [], 'a feat is only reported once it ends');
  const hop = ride(true, true, 1);
  assert.deepEqual(hop, [], 'a 0.2 s hop is too short');
  ride(false, false, 15);
  const [jump] = ride(true, false, 1);
  assert.equal(jump.type, 'air');
  assert.ok(Math.abs(jump.time - 1.5) < 1e-9, 'air time is counted step by step');
  ride(true, false, 11);
  const [wheelie] = ride(true, true, 1);
  assert.equal(wheelie.type, 'wheelie');
  assert.ok(Math.abs(wheelie.time - 1.2) < 1e-9, 'the wheelie began when the jump landed on the back wheel');
  ride(false, true, 12);
  assert.equal(feats.finish()[0].type, 'stoppie', 'finishing completes the feat in progress');
  assert.deepEqual(feats.finish(), [], 'and only once');
  ride(true, false, 30);
  feats.reset();
  assert.deepEqual(ride(true, true, 1), [], 'a crash throws the feat away');

  assert.equal(statProgressText(achievement('frequent-flyer'), 37), '37 / 100');
  assert.equal(statProgressText(achievement('frequent-flyer'), 140), '100 / 100', 'progress stops at the goal');
  assert.equal(statProgressText(achievement('satellite'), 1200), '1,000 / 1,000', 'like the blurbs, big numbers have commas');
  assert.equal(statProgressText(achievement('cloud-nine'), 1254), '2:05 / 10:00', 'times show as minutes');

  const career = { trails: 0, golds: 0, officialTotal: 9, bonusFinished: 0, bonusTotal: 2 };
  assert.ok(!hasAchievement('first-steps', {}, {}, career));
  assert.ok(!hasAchievement('first-steps', {}, {}, { ...career, trails: 2 }));
  assert.ok(hasAchievement('first-steps', {}, {}, { ...career, trails: 3 }), 'career achievements come from progress');
  assert.ok(!hasAchievement('black-tie', {}, {}, { ...career, golds: 9 }));
  assert.ok(hasAchievement('black-tie', {}, {}, { ...career, golds: 10 }));
  assert.ok(!hasAchievement('night-owl', {}, {}, { ...career, nightFinished: 3, nightTotal: 4 }));
  assert.ok(hasAchievement('night-owl', {}, {}, { ...career, nightFinished: 4, nightTotal: 4 }));
  assert.ok(!hasAchievement('night-owl', {}, {}, career), 'no night trails is not every night trail');
  assert.ok(hasAchievement('natural-talent', {}, { 'first-rides': 5 }, career));
  assert.ok(hasAchievement('nerves-of-steel', {}, { bareheaded: 10 }, career));
  assert.ok(!hasAchievement('career-rider', {}, {}, { ...career, trails: 8 }));
  assert.ok(hasAchievement('career-rider', {}, {}, { ...career, trails: 9 }));
  assert.ok(!hasAchievement('career-rider', {}, {}, { ...career, officialTotal: 0 }), 'no trails is not every trail');
  assert.ok(hasAchievement('gold-rush', {}, {}, { ...career, golds: 9 }));
  assert.ok(!hasAchievement('completionist', {}, {}, { ...career, trails: 9, bonusFinished: 1 }));
  assert.ok(hasAchievement('completionist', {}, {}, { ...career, trails: 9, bonusFinished: 2 }));
  assert.ok(!hasAchievement('crash-test-dummy', {}, { crashes: 99 }, career));
  assert.ok(hasAchievement('crash-test-dummy', {}, { crashes: 100 }, career), 'stat achievements come from totals');
  assert.ok(hasAchievement('bonk', { bonk: 1 }, {}, career), 'the rest are stored');
  assert.ok(!hasAchievement('bonk', {}, {}, career));
  assert.ok(hasAchievement('from-a-newer-version', { 'from-a-newer-version': 1 }, {}, career));

  const snapshot = (stored, stats = {}) => ({ has: id => hasAchievement(id, stored, stats, career) });
  assert.deepEqual(newlyEarned(snapshot({}), snapshot({ bonk: 1 }, { flips: 100 })).map(a => a.id), ['bonk', 'frequent-flyer']);
  assert.deepEqual(newlyEarned(snapshot({ bonk: 1 }), snapshot({ bonk: 1 })), []);
}

// --- Saving and syncing ------------------------------------------------------------------

{
  assert.deepEqual(cleanAchievements({ bonk: 5, 'from-a-newer-version': 7, 'Bad Id': 1, gone: 0, nan: 'x' }), { bonk: 5, 'from-a-newer-version': 7 },
    'unknown ids are kept, so an older version cannot drop them');
  assert.deepEqual(cleanAchievements([1, 2]), {});
  assert.deepEqual(cleanStats({ flips: 4.7, crashes: -1, apples: 2e12, 'Bad Name': 3 }), { flips: 4, apples: 1e9 });
  assert.deepEqual(mergeAchievements({ bonk: 5, 'pet-coda': 9 }, { bonk: 3, splashdown: 4 }), { bonk: 3, 'pet-coda': 9, splashdown: 4 }, 'the earlier time wins');
  assert.deepEqual(mergeStats({ flips: 10, crashes: 2 }, { flips: 4, apples: 7 }), { flips: 10, crashes: 2, apples: 7 }, 'the higher count wins');
  assert.ok(aheadOf({ achievements: { bonk: 1 } }, { achievements: {} }));
  assert.ok(aheadOf({ stats: { flips: 3 } }, { stats: { flips: 2 } }));
  assert.ok(!aheadOf({ achievements: { bonk: 1 }, stats: { flips: 2 } }, { achievements: { bonk: 9 }, stats: { flips: 3 } }));
  assert.ok(!aheadOf({}, null));

  const items = new Map();
  globalThis.localStorage = /** @type {any} */ ({
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: key => items.delete(key),
  });
  const playerId = '0a1b2c3d-1111-4222-8333-444455556666';
  items.set('hjulben-saves-v2', JSON.stringify([
    { rider: 'female', createdAt: 1, trail: 0, unlocked: 0, bestTimes: {}, name: 'OLDIE', playerId },
  ]));
  const storage = await import('../js/storage.js');
  const [old] = storage.loadSaveSlots(9);
  assert.deepEqual(old.achievements, {}, 'saves from before achievements start with none');
  assert.deepEqual(old.stats, {});

  const after = storage.recordAchievements(0, 9, ['bonk'], { flips: 3, crashes: 1 });
  assert.deepEqual(Object.keys(after.achievements), ['bonk']);
  assert.deepEqual(after.stats, { flips: 3, crashes: 1 });
  const firstTime = after.achievements.bonk;
  const again = storage.recordAchievements(0, 9, ['bonk'], { flips: 2 });
  assert.equal(again.achievements.bonk, firstTime, 'earning again keeps the first time');
  assert.equal(again.stats.flips, 5, 'stats add up');
  assert.deepEqual(storage.loadSaveSlots(9)[0].stats, { flips: 5, crashes: 1 }, 'and are written to storage');
  assert.equal(storage.recordAchievements(2, 9, ['bonk'], {}), null, 'an empty slot has nothing to record');

  const onlineId = '0a1b2c3d-9999-4222-8333-444455556666';
  const created = storage.createSave(1, old.look, 9, 'NEWBIE', { playerId: onlineId, token: 'abc.def' });
  assert.deepEqual([created.achievements, created.stats], [{}, {}]);
  storage.recordAchievements(1, 9, ['pet-coda'], { apples: 10 });
  const player = { id: onlineId, name: 'NEWBIE', look: created.look };
  const synced = storage.applyCloudSave(1, 9, {
    player, save: { unlocked: 0, bestTimes: {}, achievements: { bonk: 2 }, stats: { apples: 4, flips: 8 } }
  });
  assert.ok(synced.changed, 'the cloud copy brought something new');
  assert.ok(synced.ahead, 'and this device has something the cloud lacks');
  assert.deepEqual(Object.keys(synced.save.achievements).sort(), ['bonk', 'pet-coda']);
  assert.deepEqual(synced.save.stats, { apples: 10, flips: 8 });
  const caughtUp = storage.applyCloudSave(1, 9, { player, save: { ...synced.save } });
  assert.ok(!caughtUp.changed && !caughtUp.ahead, 'an equal cloud copy changes nothing');

  storage.deleteSave(1, 9);
  const index = storage.restoreOnlineSave(9, {
    token: 'abc.def', player, runs: [], save: { unlocked: 0, bestTimes: {}, achievements: { splashdown: 3 }, stats: { panes: 2 } }
  });
  const restored = storage.loadSaveSlots(9)[index];
  assert.deepEqual(restored.achievements, { splashdown: 3 }, 'logging in brings the cloud achievements');
  assert.deepEqual(restored.stats, { panes: 2 });
}

console.log('Achievement tests passed.');
