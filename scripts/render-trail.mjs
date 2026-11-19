// Renders a trail to PNG images with the game's own renderer, so a trail can
// be looked at while it's being built, by a person or an AI that can read
// images but can't open the game.
//
//   node scripts/render-trail.mjs trails/custom/my-trail.json   an overview and the sections
//   node scripts/render-trail.mjs 12                            a catalog trail whose id or file name contains "12"
//   node scripts/render-trail.mjs <trail> --route               mark up the sections too
//   node scripts/render-trail.mjs <trail> --props               label every prop with its index and type
//   node scripts/render-trail.mjs <trail> --view 1200,100,900,500   one view: x,y of its top left, width, height
//   node scripts/render-trail.mjs <trail> --camera              what the player sees, every few seconds of the route
//
// Options:
//   --scale N      device pixels per art pixel in the sections (default 3; a section is then about 1300 px wide)
//   --out DIR      where to write the images (default .playtest/renders/<trail>/)
//   --camera-every S   seconds between --camera frames (default 3)
//
// The overview shows the whole trail, marked up: a coordinate ruler and grid,
// the apples by number, the start (S), the finish (F) and the nisse (N). When
// scripts/playtest.mjs has been run on the trail, its route is drawn too,
// coloured by speed and dashed in the air, with its turns (T) and the tight
// spots where jittered reruns failed (! with how many got through, and × where
// most failed). The sections are views at about the size the game shows,
// following the route (or the terrain's top before a playtest), drawn clean
// as the game does with only a ruler around them, unless --route marks them up
// too. --props labels each prop in the sections with its index in the trail's
// `props` list and its type, so a prop that is out of place can be found in the
// file. The files are listed with what each shows, and a section's name holds
// the x range it covers, so the right one can be opened.
//
// The sections show everything near the route, more than a player ever sees:
// the game's camera keeps the rider about two thirds of the way down the
// screen, so it shows only so much above them. --camera renders what the
// player sees instead, with the game's own camera following the playtest's
// route, every few seconds, for a laptop-sized window, with the bike where
// the run has it and its lights, so night and caves look as they do in the
// game. The overview darkens
// whatever that camera never shows, so a landmark too tall to be seen stands
// out. Places where scripts/playtest.mjs found a trap are marked TRAP. Needs
// Chrome, at CHROME_PATH or where macOS or Linux installs it.
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { STEP } from '../js/config.js';
import { createCamera } from '../js/camera.js';
import { bikeSpeed, createRide, stepRide } from '../js/ride.js';
import { ragdollCenter } from '../js/ragdoll.js';
import { fallLine } from '../js/terrain.js';
import { vehicleMetrics } from '../js/vehicle-physics.js';
import { decodeInputs } from '../js/replay-codec.js';
import { normalizeTrail } from '../js/trail-schema.js';
import { surfaceProfile } from '../js/trail-preview.js';
import { chromePath, launchChrome, sleep, startStaticServer } from './lib/chrome.mjs';
import { loadTrailArgument, playtestRunPath, repoRoot } from './lib/trails.mjs';

const args = process.argv.slice(2);
const option = name => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const VALUED = ['--scale', '--out', '--view', '--camera-every'];
const target = args.find((arg, index) => !arg.startsWith('--') && !VALUED.includes(args[index - 1]));
if (!target) {
  console.log('Usage: node scripts/render-trail.mjs <trail file or catalog id> [--route] [--props] [--view X,Y,WIDTH,HEIGHT] [--camera] [--camera-every S] [--scale N] [--out DIR]');
  process.exit(1);
}
if (!chromePath) {
  console.error('render-trail needs Chrome: install it or set CHROME_PATH.');
  process.exit(1);
}

// About the view the game shows on a desktop screen, in world units.
const SECTION = { width: 880, height: 500 };
// The game's view in a 1440 × 900 laptop window, in world units (see resize
// in js/render.js). A phone in landscape shows less, about 760 × 350.
const CAMERA_VIEW = { width: 1000, height: 620 };
const CAMERA_EVERY = Number(option('--camera-every')) || 3;
const OVERLAP = 80;
// The tallest a section gets before it is split into rows.
const TALLEST = 760;
const SCALE = Number(option('--scale')) || 3;
// Images much wider than this are scaled down before an AI reads them anyway.
const OVERVIEW_WIDTH = 1500;

const entry = loadTrailArgument(target);
const trail = normalizeTrail(entry.trail);
const outDir = option('--out') ? option('--out').replace(/\/?$/, '/') : repoRoot + '.playtest/renders/' + entry.id.replace(/[^\w.-]+/g, '_') + '/';

// --- The playtest's route --------------------------------------------------

/** The last playtest's run replayed: points along it, its turns and tight spots, and a crash if it has one. */
function loadRun() {
  const path = playtestRunPath(entry.id);
  if (!existsSync(path)) return null;
  let saved;
  try { saved = JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
  const inputs = (saved.stretches || []).flatMap(decodeInputs);
  if (!inputs.length) return null;
  const ride = createRide(trail);
  const points = [], turns = [];
  const mid = () => ({ x: (ride.rear.x + ride.front.x) / 2, y: (ride.rear.y + ride.front.y) / 2 });
  // The game's camera, following the ride as it does in the game: what it
  // shows every tenth of a second (`seen`), and a frame every few seconds.
  const camera = createCamera();
  const fallY = fallLine(trail);
  const seen = [], frames = [];
  const every = Math.round(CAMERA_EVERY / STEP);
  let crash = null;
  for (let index = 0; index < inputs.length && ride.status === 'running'; index++) {
    const input = inputs[index];
    if (input.facing && input.facing !== ride.facing) turns.push(mid());
    for (const event of stepRide(ride, input)) if (event.type === 'crash') crash = { cause: event.cause, x: event.x, y: event.y };
    if (index % 3 === 0 || ride.status !== 'running') {
      points.push({ ...mid(), speed: Math.abs(bikeSpeed(ride)), air: !ride.rear.grounded && !ride.front.grounded });
    }
    const focus = ride.ragdoll ? ragdollCenter(ride.ragdoll) : vehicleMetrics(ride.vehicle).center;
    camera.follow(focus, { facing: ride.facing, loose: Boolean(ride.ragdoll), ...CAMERA_VIEW, dt: STEP, fallY });
    const view = { x: Math.round(camera.x), y: Math.round(camera.y), ...CAMERA_VIEW };
    if (index % 12 === 0) seen.push(view);
    if (index % every === 0) frames.push({ ...view, time: index * STEP, step: index + 1 });
  }
  const round = point => ({ ...point, x: Math.round(point.x), y: Math.round(point.y) });
  return {
    points: points.map(round), turns: turns.map(round), crash: crash && round(crash),
    tightSpots: saved.tightSpots || [], traps: saved.traps || [], status: ride.status, seconds: inputs.length * STEP,
    seen, frames, stretches: saved.stretches,
  };
}

// --- Planning the views ----------------------------------------------------

const run = loadRun();
const apples = createRide(trail).apples;
const interesting = [
  ...apples, { x: trail.start.x, y: createRide(trail).rear.y },
  { x: trail.finish.x, y: createRide(trail).flower.y },
  ...(run ? run.points : []),
];
if (trail.nisse && Number.isFinite(trail.nisse.y)) interesting.push(trail.nisse);
const xs = interesting.map(point => point.x);
const left = Math.min(...xs) - 200, right = Math.max(...xs) + 200;
// Before a playtest, the terrain's top surface stands in for the route.
if (!run) {
  for (const { x, y } of surfaceProfile(trail, 16)) if (y !== null && x >= left && x <= right) interesting.push({ x, y });
}

const bounds = points => {
  const ys = points.map(point => point.y);
  return { top: Math.min(...ys), bottom: Math.max(...ys) };
};

function planViews() {
  const all = bounds(interesting);
  const overview = { name: 'overview', x: Math.round(left), y: Math.round(all.top - 220), width: Math.round(right - left), height: Math.round(all.bottom - all.top + 360), overlay: true };
  // Drawn at least as sharp as the image it ends up in (a world unit is scale / 2 device pixels).
  overview.scale = Math.min(3, Math.max(1, Math.ceil(2 * OVERVIEW_WIDTH / overview.width)));
  // The overview keeps a wide trail readable: no flatter than 4:1.
  if (overview.width / overview.height > 4) {
    const grow = overview.width / 4 - overview.height;
    overview.y -= Math.round(grow * .6);
    overview.height += Math.round(grow);
  }
  const sections = [];
  for (let x = left; x < right - OVERLAP; x += SECTION.width - OVERLAP) {
    const inside = interesting.filter(point => point.x >= x && point.x <= x + SECTION.width);
    if (!inside.length) continue;
    const band = bounds(inside);
    // The bike stands a little above its axles: leave room above the highest point.
    const top = band.top - 200, bottom = band.bottom + 90;
    // A section is as tall as the game's view, or taller to keep what's in it
    // together; taller still, it is split into rows.
    if (bottom - top <= TALLEST) {
      const height = Math.max(SECTION.height, Math.round(bottom - top));
      sections.push({ x: Math.round(x), y: Math.round((top + bottom - height) / 2), width: SECTION.width, height, overlay: args.includes('--route'), scale: SCALE });
      continue;
    }
    for (let y = top; y < bottom - OVERLAP; y += SECTION.height - OVERLAP) {
      // A row with nothing of interest in it is only sky or rock.
      if (!inside.some(point => point.y >= y - 60 && point.y <= y + SECTION.height + 60)) continue;
      sections.push({ x: Math.round(x), y: Math.round(y), width: SECTION.width, height: SECTION.height, overlay: args.includes('--route'), scale: SCALE });
    }
  }
  sections.forEach((view, index) => { view.name = `section-${String(index + 1).padStart(2, '0')}_x${view.x}-${view.x + view.width}`; });
  return [overview, ...sections];
}

let views;
if (option('--view')) {
  const [x, y, width, height] = option('--view').split(',').map(Number);
  if (![x, y, width, height].every(Number.isFinite)) throw new Error('--view takes X,Y,WIDTH,HEIGHT');
  views = [{ name: `view-${x}_${y}_${width}x${height}`, x, y, width, height, overlay: args.includes('--route'), scale: SCALE }];
} else if (args.includes('--camera')) {
  if (!run) {
    console.error('--camera follows the route of the last playtest: run scripts/playtest.mjs on the trail first.');
    process.exit(1);
  }
  views = run.frames.map((frame, index) => ({
    ...frame, name: `camera-${String(index + 1).padStart(2, '0')}_t${frame.time.toFixed(0)}s`, overlay: args.includes('--route'), scale: SCALE,
  }));
} else views = planViews();

// --- Drawing ----------------------------------------------------------------

const PAGE = '/__render-trail__.html';
await using server = await startStaticServer({
  handle(pathname, response) {
    if (pathname !== PAGE) return false;
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('<!doctype html><meta charset="utf-8"><script type="module" src="/scripts/lib/render-page.mjs"></script>');
    return true;
  },
});
const problems = [];
await using chrome = await launchChrome(chromePath, {
  onAttached: (_sessionId, { type }) => (type === 'page' ? ['Runtime.enable'] : []),
});
chrome.on(({ method, params }) => {
  if (method === 'Runtime.exceptionThrown') problems.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
});

const { session, evaluate } = await chrome.openTab();
await chrome.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${PAGE}` }, session);
let ready = false;
for (let i = 0; i < 100 && !ready; i++) {
  await sleep(100);
  ready = await evaluate('typeof window.hjulbenRender === "function"').catch(() => false);
}
if (!ready) throw new Error(`the render page did not load${problems.length ? `: ${problems.join('; ')}` : ''}`);
await evaluate(`hjulbenSetTrail(${JSON.stringify(trail)})`);
// Camera frames show the bike where the run has it, lights and all.
if (args.includes('--camera')) await evaluate(`hjulbenSetRun(${JSON.stringify(run.stretches)})`);
mkdirSync(outDir, { recursive: true });
// Images from an earlier render would be mistaken for this one's.
const stale = args.includes('--camera') ? (file => file.startsWith('camera-')) : (file => !file.startsWith('camera-'));
if (!option('--view')) for (const file of readdirSync(outDir)) if (file.endsWith('.png') && stale(file)) unlinkSync(outDir + file);
console.log(`${trail.name}: ${views.length} image${views.length === 1 ? '' : 's'} in ${outDir.replace(repoRoot, '')}`);
if (run) {
  console.log(`Route from the last playtest (${run.seconds.toFixed(1)} s, ${run.status === 'won' ? 'finished' : run.status === 'crashed' ? 'CRASHED: the trail has changed since; playtest again' : 'not finished'}), ${run.tightSpots.length} tight spots${run.traps.length ? `, ${run.traps.length} trap${run.traps.length === 1 ? '' : 's'}` : ''}.`);
} else console.log('No playtest yet: run scripts/playtest.mjs first to draw the route and tight spots.');
for (const view of views) {
  const title = `${view.name} · x ${view.x} to ${view.x + view.width}, y ${Math.round(view.y)} to ${Math.round(view.y + view.height)}`;
  const job = {
    view, scale: view.scale, maxWidth: view.name === 'overview' ? OVERVIEW_WIDTH : view.width * SCALE / 2,
    overlay: view.overlay, props: args.includes('--props') && view.name !== 'overview', run, title, step: view.step,
    // The overview darkens what the game's camera never shows.
    unseen: view.name === 'overview',
  };
  const url = await evaluate(`hjulbenRender(${JSON.stringify(job)})`);
  writeFileSync(outDir + view.name + '.png', Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  const within = point => point.x >= view.x && point.x <= view.x + view.width && point.y >= view.y && point.y <= view.y + view.height;
  const has = [
    apples.some(within) && `apples ${apples.map((apple, index) => within(apple) ? index + 1 : null).filter(Boolean).join(', ')}`,
    within({ x: trail.start.x, y: createRide(trail).rear.y }) && 'start',
    within(createRide(trail).flower) && 'finish',
    run?.tightSpots.some(spot => within(spot.from)) && 'tight spots',
    run?.traps.some(within) && 'TRAPS',
  ].filter(Boolean);
  console.log(`  ${view.name}.png: x ${view.x} to ${view.x + view.width}, y ${Math.round(view.y)} to ${Math.round(view.y + view.height)}${has.length ? `; ${has.join(', ')}` : ''}`);
}
if (problems.length) console.log(`The page reported: ${[...new Set(problems)].join('; ')}`);
