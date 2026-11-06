// Achievements: feats a rider earns while playing. Shared by the game, the
// editor and the server, so it stays free of the DOM.
//
// Each achievement is earned one of these ways:
//   career    worked out from the save's progress (trails finished, gold
//             medals), so riders from before achievements get them as well
//   stat      a lifetime total in `save.stats` reaching `goal`
//   event     a ride event (see RideEvent in types.js), or a feat (time in
//             the air, a wheelie or a stoppie; see createFeatTracker), during a run
//   finish    something about a finished run
//   interact  using a prop of that type (see interactions.js)
//   egg       an easter egg game.js reports by name: poking at the game from
//             the console, breaking it, or a cheat code held down
//   editor    something done with the trail editor: publishing a custom trail,
//             sharing one or finishing a play-test. It's handed to the game (see
//             reportEditorFeat in trails.js), which gives it to the active rider.
//             New trails published count towards the `published` stat
// Only event, finish, interact, egg and editor achievements are stored, in
// `save.achievements` as id -> time earned; the rest are worked out whenever
// they're needed. Every trail counts, custom ones too, but editor play-tests
// don't (see game.js). Ids are stored in saves, so they are never renamed or
// reused.

import { WHEELBASE } from './config.js';

/**
 * @typedef {{
 *   trails: number, golds: number, officialTotal: number,
 *   bonusFinished: number, bonusTotal: number,
 *   nisseFound?: number, nisseTotal?: number,
 *   nightFinished?: number, nightTotal?: number
 * }} CareerProgress
 * @typedef {{
 *   flips: number, time: number, medal: string | null, gold: number | null,
 *   helmet: boolean, bike: string, night: boolean, rain: boolean, snow: boolean,
 *   attempts: number, previousBest: number | null, worldBest: number | null, custom: boolean,
 *   shared: boolean
 * }} FinishedRun what a run that reached the finish did: its flips, time,
 *   medal and the gold time, whether the rider wore a helmet, the bike
 *   (item id), whether the trail is at night or has rain or snow, how many
 *   attempts it took since the trail was opened, the best time on the trail
 *   before it and the world-best time (null if none), whether it is a
 *   custom trail, and whether it came from someone's share link
 * @typedef {{ type: 'air' | 'wheelie' | 'stoppie', time: number }} Feat
 *   a stretch in the air, on the back wheel only or on the front wheel only,
 *   in seconds
 * @typedef {{
 *   id: string, group: 'career' | 'riding' | 'lifetime' | 'trail-maker' | 'easter-eggs',
 *   name: string, blurb: import('./ui/key-text.js').KeyText, icon: string,
 *   secret?: boolean, hint?: string,
 *   career?: (progress: CareerProgress) => boolean,
 *   tally?: (progress: CareerProgress) => [number, number],
 *   stat?: string, goal?: number, unit?: 'tenths',
 *   event?: (event: any) => boolean,
 *   finish?: (run: FinishedRun) => boolean,
 *   interact?: string, egg?: string, editor?: 'publish' | 'share' | 'playtest'
 * }} Achievement
 *   `hint` is shown in place of the blurb while a secret is still hidden.
 *   `tally` counts a career goal as done and needed, for the Garage to show
 *   how close a rider is to the item it wins.
 */

/** The achievement groups, in the order the menu lists them. */
export const ACHIEVEMENT_GROUPS = Object.freeze([
  { id: 'career', title: 'CAREER', blurb: 'Progress through the official and bonus trails' },
  { id: 'riding', title: 'RIDING', blurb: 'Earned on any trail, custom ones too' },
  { id: 'lifetime', title: 'LIFETIME', blurb: 'Totals across every ride' },
  { id: 'trail-maker', title: 'TRAIL MAKER', blurb: 'Build your own trails in the editor and share them' },
  { id: 'easter-eggs', title: 'EASTER EGGS', blurb: 'For the curious. Bring your dev tools.' },
].map(group => Object.freeze(group)));

const everyTrail = (finished, total) => total > 0 && finished >= total;

/** Every achievement, in the order the menu lists them. */
export const ACHIEVEMENTS = /** @type {readonly Achievement[]} */ (Object.freeze([
  {
    id: 'first-steps', group: 'career', name: 'First Steps', icon: 'footprints',
    blurb: 'Finish 3 official trails.', career: p => p.trails >= 3,
    tally: p => [p.trails, 3]
  },
  {
    id: 'career-rider', group: 'career', name: 'Career Rider', icon: 'flag',
    blurb: 'Finish every official trail.', career: p => everyTrail(p.trails, p.officialTotal),
    tally: p => [p.trails, p.officialTotal]
  },
  {
    id: 'golden-touch', group: 'career', name: 'Golden Touch', icon: 'trophy',
    blurb: 'Win your first gold medal.', career: p => p.golds >= 1
  },
  {
    id: 'gold-rush', group: 'career', name: 'Gold Rush', icon: 'pickaxe',
    blurb: 'Win gold on every official trail.', career: p => everyTrail(p.golds, p.officialTotal),
    tally: p => [p.golds, p.officialTotal]
  },
  {
    id: 'off-the-beaten-path', group: 'career', name: 'Off the Beaten Path', icon: 'tree',
    blurb: 'Finish a bonus trail.', career: p => p.bonusFinished >= 1
  },
  {
    id: 'completionist', group: 'career', name: 'Completionist', icon: 'crown',
    blurb: 'Finish every official and bonus trail.',
    career: p => everyTrail(p.trails, p.officialTotal) && p.bonusFinished >= p.bonusTotal
  },
  {
    id: 'halfway-there', group: 'career', name: 'Halfway There', icon: 'halfway',
    blurb: 'Finish half of the official trails.',
    career: p => p.officialTotal > 0 && p.trails >= Math.ceil(p.officialTotal / 2)
  },
  {
    id: 'hat-trick', group: 'career', name: 'Hat Trick', icon: 'medals',
    blurb: 'Win 3 gold medals.', career: p => p.golds >= 3
  },
  {
    id: 'black-tie', group: 'career', name: 'Black Tie', icon: 'medal',
    blurb: 'Win 10 gold medals.', career: p => p.golds >= 10,
    tally: p => [p.golds, 10]
  },
  {
    id: 'treasure-hunter', group: 'career', name: 'Treasure Hunter', icon: 'chest',
    blurb: 'Finish every bonus trail.', career: p => everyTrail(p.bonusFinished, p.bonusTotal)
  },
  {
    id: 'night-owl', group: 'career', name: 'Night Owl', icon: 'moon',
    blurb: 'Finish every official night trail.',
    career: p => everyTrail(p.nightFinished ?? 0, p.nightTotal ?? 0),
    tally: p => [p.nightFinished ?? 0, p.nightTotal ?? 0]
  },
  {
    id: 'nisse-hunter', group: 'career', name: 'Nisse Hunter', icon: 'nisse',
    blurb: 'Find the nisse on every official trail that hides one.',
    career: p => everyTrail(p.nisseFound ?? 0, p.nisseTotal ?? 0),
    tally: p => [p.nisseFound ?? 0, p.nisseTotal ?? 0]
  },

  {
    id: 'head-over-heels', group: 'riding', name: 'Head over Heels', icon: 'rotate-right',
    blurb: 'Land your first flip.', event: e => e.type === 'flip'
  },
  {
    id: 'triple-threat', group: 'riding', name: 'Triple Threat', icon: 'rotate-right',
    blurb: 'Land a triple flip in one jump.', event: e => e.type === 'flip' && e.count >= 3
  },
  {
    id: 'flip-circus', group: 'riding', name: 'Flip Circus', icon: 'tent',
    blurb: 'Land 3 flips in one run and finish it.', finish: run => run.flips >= 3
  },
  {
    id: 'first-try', group: 'riding', name: 'First Try', icon: 'check',
    blurb: 'Finish a trail on your first attempt.', finish: run => run.attempts === 1
  },
  {
    id: 'photo-finish', group: 'riding', name: 'Photo Finish', icon: 'camera', secret: true,
    blurb: 'Win a gold medal by less than a tenth of a second.',
    finish: run => run.medal === 'gold' && Number.isFinite(run.gold) && run.gold - run.time < 0.1
  },
  {
    id: 'wind-in-your-hair', group: 'riding', name: 'Wind in Your Hair', icon: 'hair',
    blurb: 'Finish a trail without a helmet.', finish: run => !run.helmet
  },
  {
    id: 'old-school', group: 'riding', name: 'Old School', icon: 'bike',
    blurb: 'Win a gold medal on the Pocket Classic.', finish: run => run.medal === 'gold' && run.bike === 'classic'
  },
  {
    id: 'night-rider', group: 'riding', name: 'Night Rider', icon: 'headlight',
    blurb: 'Finish a trail at night.', finish: run => run.night
  },
  {
    id: 'splashdown', group: 'riding', name: 'Splashdown', icon: 'water',
    blurb: 'Crash into water.', event: e => e.type === 'crash' && e.cause === 'water'
  },
  {
    id: 'bull-in-a-china-shop', group: 'riding', name: 'Bull in a China Shop', icon: 'shatter',
    blurb: 'Shatter a glass pane.', event: e => e.type === 'shatter'
  },
  {
    id: 'bonk', group: 'riding', name: 'Bonk', icon: 'helmet',
    blurb: 'Lose your helmet in a crash.', event: e => e.type === 'helmet'
  },
  {
    id: 'pet-coda', group: 'riding', name: 'Pet Coda', icon: 'paw',
    blurb: 'Give Coda the corgi some attention.', interact: 'corgi'
  },
  {
    id: 'natural-talent', group: 'riding', name: 'Natural Talent', icon: 'star',
    blurb: 'Finish 5 trails on your first ride of them.', stat: 'first-rides', goal: 5
  },
  {
    id: 'nerves-of-steel', group: 'riding', name: 'Nerves of Steel', icon: 'hair',
    blurb: 'Finish 10 runs without a helmet.', stat: 'bareheaded', goal: 10
  },
  {
    id: 'show-off', group: 'riding', name: 'Show-Off', icon: 'shades',
    blurb: 'Land 15 flips in one run and finish it.', finish: run => run.flips >= 15
  },
  {
    id: 'spin-cycle', group: 'riding', name: 'Spin Cycle', icon: 'washer', secret: true,
    blurb: 'Land a quadruple flip in one jump.', event: e => e.type === 'flip' && e.count >= 4
  },
  {
    id: 'so-close', group: 'riding', name: 'So Close', icon: 'clock', secret: true,
    blurb: 'Miss a gold medal by less than a tenth of a second.',
    finish: run => Number.isFinite(run.gold) && run.time > run.gold && run.time - run.gold < 0.1
  },
  {
    id: 'sunday-driver', group: 'riding', name: 'Sunday Driver', icon: 'snail', secret: true,
    blurb: 'Finish a trail in more than three times the gold time.',
    finish: run => Number.isFinite(run.gold) && run.time >= run.gold * 3
  },
  {
    id: 'ghostbuster', group: 'riding', name: 'Ghostbuster', icon: 'ghost',
    blurb: 'Beat the world-best ghost on an official or bonus trail.',
    finish: run => Number.isFinite(run.worldBest) && run.time < run.worldBest
  },
  {
    id: 'leaps-and-bounds', group: 'riding', name: 'Leaps and Bounds', icon: 'fast-forward',
    blurb: 'Take 5 seconds off your best time on a trail.',
    finish: run => Number.isFinite(run.previousBest) && run.previousBest - run.time >= 5
  },
  {
    id: 'never-give-up', group: 'riding', name: 'Never Give Up', icon: 'retry', secret: true,
    blurb: 'Finish a trail after 25 or more attempts.', finish: run => run.attempts >= 25
  },
  {
    id: 'homebrew', group: 'riding', name: 'Homebrew', icon: 'pencil',
    blurb: 'Finish a custom trail.', finish: run => run.custom
  },
  {
    id: 'singin-in-the-rain', group: 'riding', name: 'Singin’ in the Rain', icon: 'rain',
    blurb: 'Finish a trail in the rain.', finish: run => run.rain
  },
  {
    id: 'snow-day', group: 'riding', name: 'Snow Day', icon: 'snowflake',
    blurb: 'Finish a trail in the snow.', finish: run => run.snow
  },
  {
    id: 'hang-time', group: 'riding', name: 'Hang Time', icon: 'arrow-up',
    blurb: 'Stay in the air for 1.5 seconds in one jump.', event: e => e.type === 'air' && e.time >= 1.5
  },
  {
    id: 'wheelie-king', group: 'riding', name: 'Wheelie King', icon: 'wheelie',
    blurb: 'Hold a wheelie for 5 seconds.', event: e => e.type === 'wheelie' && e.time >= 5
  },
  {
    id: 'stoppie', group: 'riding', name: 'Stoppie', icon: 'stoppie', secret: true,
    blurb: 'Roll on just the front wheel for 2 seconds.', event: e => e.type === 'stoppie' && e.time >= 2
  },
  {
    id: 'into-the-void', group: 'riding', name: 'Into the Void', icon: 'arrow-down', secret: true,
    blurb: 'Fall out of the world.', event: e => e.type === 'crash' && e.cause === 'fall'
  },
  {
    id: 'not-so-fast', group: 'riding', name: 'Not So Fast', icon: 'no-entry', secret: true,
    blurb: 'Reach the finish with apples still missing.', event: e => e.type === 'goalLocked'
  },
  {
    id: 'patience', group: 'riding', name: 'Patience', icon: 'hourglass', secret: true,
    blurb: 'Wait a whole minute at the start before setting off.', event: e => e.type === 'start' && e.wait >= 60
  },
  {
    id: 'hej-nisse', group: 'riding', name: 'Hej, Nisse!', icon: 'nisse',
    blurb: 'Find a nisse hidden off the trail.', event: e => e.type === 'nisse'
  },
  {
    id: 'deja-vu', group: 'riding', name: 'Déjà Vu', icon: 'ghost', secret: true,
    blurb: 'Match your best time on a trail to the millisecond.',
    finish: run => Number.isFinite(run.previousBest) && Math.round(run.time * 1000) === Math.round(run.previousBest * 1000)
  },

  {
    id: 'frequent-flyer', group: 'lifetime', name: 'Frequent Flyer', icon: 'plane',
    blurb: 'Land 100 flips.', stat: 'flips', goal: 100
  },
  {
    id: 'crash-test-dummy', group: 'lifetime', name: 'Crash Test Dummy', icon: 'dummy',
    blurb: 'Crash 100 times.', stat: 'crashes', goal: 100
  },
  {
    id: 'an-apple-a-day', group: 'lifetime', name: 'An Apple a Day', icon: 'apple',
    blurb: 'Collect 500 apples.', stat: 'apples', goal: 500
  },
  {
    id: 'glaziers-nightmare', group: 'lifetime', name: 'Glazier’s Nightmare', icon: 'shatter',
    blurb: 'Shatter 50 glass panes.', stat: 'panes', goal: 50
  },
  {
    id: 'satellite', group: 'lifetime', name: 'Satellite', icon: 'satellite',
    blurb: 'Land 1,000 flips.', stat: 'flips', goal: 1000
  },
  {
    id: 'spare-parts', group: 'lifetime', name: 'Spare Parts', icon: 'wrench',
    blurb: 'Crash 500 times.', stat: 'crashes', goal: 500
  },
  {
    id: 'orchard-keeper', group: 'lifetime', name: 'Orchard Keeper', icon: 'basket',
    blurb: 'Collect 2,500 apples.', stat: 'apples', goal: 2500
  },
  {
    id: 'window-shopper', group: 'lifetime', name: 'Window Shopper', icon: 'bag',
    blurb: 'Shatter 250 glass panes.', stat: 'panes', goal: 250
  },
  {
    id: 'cloud-nine', group: 'lifetime', name: 'Cloud Nine', icon: 'cloud',
    blurb: 'Spend 10 minutes in the air.', stat: 'airtime', goal: 6000, unit: 'tenths'
  },
  {
    id: 'one-wheel-wonder', group: 'lifetime', name: 'One-Wheel Wonder', icon: 'unicycle',
    blurb: 'Spend 5 minutes on your back wheel.', stat: 'wheelie', goal: 3000, unit: 'tenths'
  },

  {
    id: 'groundbreaker', group: 'trail-maker', name: 'Groundbreaker', icon: 'pencil',
    blurb: 'Publish your first custom trail in the editor.', editor: 'publish'
  },
  {
    id: 'test-pilot', group: 'trail-maker', name: 'Test Pilot', icon: 'play',
    blurb: 'Finish a playtest of a trail in the editor.', editor: 'playtest'
  },
  {
    id: 'show-and-tell', group: 'trail-maker', name: 'Show and Tell', icon: 'share',
    blurb: 'Copy a share link for a trail in the editor.', editor: 'share'
  },
  {
    id: 'trail-network', group: 'trail-maker', name: 'Trail Network', icon: 'publish',
    blurb: 'Publish 5 different custom trails.', stat: 'published', goal: 5
  },
  {
    id: 'guest-rider', group: 'trail-maker', name: 'Guest Rider', icon: 'download',
    blurb: 'Finish a trail someone shared with you.', finish: run => run.shared
  },

  {
    id: 'under-the-hood', group: 'easter-eggs', name: 'Under the Hood', icon: 'terminal', secret: true,
    hint: 'Some query strings open doors.',
    blurb: 'Reach into a ride from the browser console.', egg: 'debug-console'
  },
  {
    id: 'i-saw-that', group: 'easter-eggs', name: 'I Saw That', icon: 'search', secret: true,
    hint: 'The console has something to say.',
    blurb: 'Ask the browser console for a cheat.', egg: 'cheat'
  },
  {
    id: 'nice-try', group: 'easter-eggs', name: 'Nice Try', icon: 'lock', secret: true,
    hint: 'The server rides every world time again. Make it disagree.',
    blurb: 'Send a world time the server can’t reproduce.', egg: 'rejected-run'
  },
  {
    id: 'here-be-kraken', group: 'easter-eggs', name: 'Here Be Kraken', icon: 'kraken', secret: true,
    hint: 'Every physics engine has its limits.',
    blurb: 'Break the physics: pull the bike apart.', egg: 'kraken'
  },
  {
    id: 'lim', group: 'easter-eggs', name: 'Full Health, No High Score', icon: 'keyboard', secret: true,
    hint: 'Wolfenstein 3D had a cheat. It still works.', blurb: ['Hold ', { key: 'L' }, ', ', { key: 'I' }, ' and ', { key: 'M' }, ' at once.'], egg: 'lim'
  },
  {
    id: 'any-percent', group: 'easter-eggs', name: 'Any%', icon: 'bolt', secret: true,
    hint: 'Some trails are shorter than others. Make one.',
    blurb: 'Finish a trail in under a second.', finish: run => run.time < 1
  },
].map(achievement => Object.freeze(achievement))));

const BY_ID = new Map(ACHIEVEMENTS.map(achievement => [achievement.id, achievement]));

/** @returns {Achievement | null} */
export const achievement = id => BY_ID.get(id) ?? null;

/**
 * What each ride event or feat adds to the lifetime stats. Times are kept in
 * tenths of a second, since stats are whole numbers.
 */
const STAT_EVENTS = {
  flip: e => ({ flips: e.count }),
  crash: () => ({ crashes: 1 }),
  apple: () => ({ apples: 1 }),
  shatter: () => ({ panes: 1 }),
  air: e => ({ airtime: Math.round(e.time * 10) }),
  wheelie: e => ({ wheelie: Math.round(e.time * 10) }),
};

/** @returns {Record<string, number> | null} what a ride event or feat adds to the lifetime stats */
export const statGains = event => STAT_EVENTS[event.type]?.(event) ?? null;

/**
 * What a finished run adds to the lifetime stats: a trail finished on its
 * first ride, the first attempt with no best time before it, so each trail
 * counts once, and a run finished without a helmet.
 * @param {FinishedRun} run
 * @returns {Record<string, number>}
 */
export function finishGains(run) {
  const gains = {};
  if (run.attempts === 1 && run.previousBest === null) gains['first-rides'] = 1;
  if (!run.helmet) gains.bareheaded = 1;
  return gains;
}

/** A lifetime total and its goal, as the menu shows them: 37 / 1,000, or 2:05 / 10:00 for times. */
export function statProgressText(achievement, count) {
  const shown = Math.min(count, achievement.goal);
  const number = value => value.toLocaleString('en-US');
  if (achievement.unit !== 'tenths') return number(shown) + ' / ' + number(achievement.goal);
  const clock = tenths => {
    const seconds = Math.floor(tenths / 10);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  };
  return clock(shown) + ' / ' + clock(achievement.goal);
}

// The shortest stretch of each feat worth reporting, in seconds: shorter ones
// are bumps and hops, not jumps or wheelies.
const FEAT_MIN = { air: 0.3, wheelie: 1, stoppie: 1 };

/**
 * Follows the wheels' ground contact step by step and reports each feat as
 * it ends: time in the air (both wheels off the ground), a wheelie (only the
 * back wheel down) or a stoppie (only the front one). It only watches the
 * ride, so the simulation and its replays are untouched.
 * @param {number} step seconds per simulation step
 */
export function createFeatTracker(step) {
  /** @type {Feat['type'] | null} */
  let kind = null;
  let time = 0;
  /** @returns {Feat[]} */
  function end() {
    const done = kind && time >= FEAT_MIN[kind] ? [{ type: kind, time }] : [];
    kind = null;
    time = 0;
    return done;
  }
  return {
    /** One simulation step; returns the feats it ended. */
    step(rearGrounded, frontGrounded) {
      const now = rearGrounded ? (frontGrounded ? null : 'wheelie') : (frontGrounded ? 'stoppie' : 'air');
      const done = now === kind ? [] : end();
      kind = now;
      if (kind) time += step;
      return done;
    },
    /** Ends the feat in progress, as when the run reaches the finish. */
    finish: end,
    /** Forgets the feat in progress, as when the rider crashes. */
    reset() { kind = null; time = 0; },
  };
}

/** The ids a ride event or feat earns. */
export const eventAchievements = event => ACHIEVEMENTS.filter(a => a.event?.(event)).map(a => a.id);

/** The ids a finished run earns. @param {FinishedRun} run */
export const finishAchievements = run => ACHIEVEMENTS.filter(a => a.finish?.(run)).map(a => a.id);

/** The ids using a prop of `type` earns. */
export const interactAchievements = type => ACHIEVEMENTS.filter(a => a.interact === type).map(a => a.id);

/** The ids the easter egg `name` earns. */
export const eggAchievements = name => ACHIEVEMENTS.filter(a => a.egg === name).map(a => a.id);

/** The ids doing `feat` with the editor earns: 'publish', 'share' or 'playtest'. */
export const editorAchievements = feat => ACHIEVEMENTS.filter(a => a.editor === feat).map(a => a.id);

/**
 * The editor's feats, feat -> how many times, as achievement ids and lifetime
 * stat gains. 'new-trail' is a custom trail published for the first time.
 * @param {Record<string, number>} feats
 */
export function editorProgress(feats) {
  const ids = Object.keys(feats).flatMap(editorAchievements);
  const published = feats['new-trail'] || 0;
  return { ids, gains: published > 0 ? { published } : {} };
}

/**
 * Whether the physics has come apart: the wheels have left the finite world,
 * or are half a wheelbase further apart or closer together than the bike is
 * long. Real riding stays within about a tenth of it.
 * @param {{ x: number, y: number }} rear
 * @param {{ x: number, y: number }} front
 */
export function bikeBroken(rear, front) {
  const apart = Math.hypot(front.x - rear.x, front.y - rear.y);
  return !Number.isFinite(apart) || Math.abs(apart / WHEELBASE - 1) > 0.5;
}

/**
 * Whether a save has earned achievement `id`: stored when it was earned, or
 * worked out from its career progress and lifetime stats.
 * @param {Record<string, number>} stored
 * @param {Record<string, number>} stats
 * @param {CareerProgress} career
 */
export function hasAchievement(id, stored, stats, career) {
  if (stored[id]) return true;
  const found = achievement(id);
  if (!found) return false;
  if (found.career) return found.career(career);
  if (found.stat) return (stats[found.stat] || 0) >= found.goal;
  return false;
}

/**
 * The achievements earned between two snapshots of a save's progress.
 * @param {{ has: (id: string) => boolean }} before
 * @param {{ has: (id: string) => boolean }} after
 */
export const newlyEarned = (before, after) => ACHIEVEMENTS.filter(a => !before.has(a.id) && after.has(a.id));

// --- Saving ------------------------------------------------------------------

// Ids this version doesn't know are kept, so an older copy of the game can't
// drop what a newer one earned when it syncs.
const ID_RE = /^[a-z0-9-]{1,40}$/;
const MAX_ACHIEVEMENTS = 200;
const MAX_STATS = 50;
const MAX_STAT = 1e9;
const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** A save's earned achievements, id -> time earned, with anything else dropped. */
export function cleanAchievements(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([id, time]) => ID_RE.test(id) && Number.isFinite(Number(time)) && Number(time) > 0)
    .slice(0, MAX_ACHIEVEMENTS)
    .map(([id, time]) => [id, Number(time)]));
}

/** A save's lifetime stats, name -> whole count, with anything else dropped. */
export function cleanStats(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([name, count]) => ID_RE.test(name) && Number.isFinite(Number(count)) && Number(count) > 0)
    .slice(0, MAX_STATS)
    .map(([name, count]) => [name, Math.min(MAX_STAT, Math.floor(Number(count)))]));
}

/** Both copies' achievements, each with the earlier time it was earned. */
export function mergeAchievements(a, b) {
  const merged = cleanAchievements(a);
  for (const [id, time] of Object.entries(cleanAchievements(b))) merged[id] = Math.min(time, merged[id] ?? Infinity);
  return cleanAchievements(merged);
}

/**
 * Both copies' stats, each the higher count. Rides done on two devices since
 * they last synced are not added up: the higher count wins, so a device never
 * loses what it has, but totals can undercount.
 */
export function mergeStats(a, b) {
  const merged = cleanStats(a);
  for (const [name, count] of Object.entries(cleanStats(b))) merged[name] = Math.max(count, merged[name] ?? 0);
  return merged;
}

/** Whether `local` has achievements or stats that `cloud` lacks. */
export function aheadOf(local, cloud) {
  const cloudAchievements = cleanAchievements(cloud?.achievements);
  const cloudStats = cleanStats(cloud?.stats);
  return Object.keys(cleanAchievements(local?.achievements)).some(id => !cloudAchievements[id])
    || Object.entries(cleanStats(local?.stats)).some(([name, count]) => count > (cloudStats[name] ?? 0));
}
