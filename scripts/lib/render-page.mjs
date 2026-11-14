// The browser half of scripts/render-trail.mjs: draws views of a trail with
// the game's own renderer (see js/scene-preview.js), then marks them up for
// whoever is building the trail: a coordinate ruler, the apples, start,
// finish, nisse and checkpoints, the replay bot's route coloured by speed, and the spots
// where its reruns failed. Runs in headless Chrome; the script calls
// `hjulbenSetTrail` once, `hjulbenSetRun` for camera frames, and then
// `hjulbenRender` for each view.
import { decodeInputs } from '../../js/replay-codec.js';
import { createRide, stepRide } from '../../js/ride.js';
import { drawScene } from '../../js/scene-preview.js';
import { terrainGeometry } from '../../js/terrain.js';
import { surfaceY } from '../../js/trail-preview.js';

const MARGIN = { left: 46, top: 22, bottom: 22, right: 8 };
const FONT = 'bold 12px ui-monospace, Menlo, monospace';
const PROP_FONT = 'bold 11px ui-monospace, Menlo, monospace';
// Route colours run from blue (standing still) to red (this fast or more).
const FAST = 550;
// How far a failure may be from where its rerun started to be joined to it.
const NEAR = 400;

let trail = null;
let ride = null;

window.hjulbenSetTrail = next => {
  trail = next;
  // A ride parked far outside the trail, so no bike shows, but with the nisse
  // still in place (the menu's previews hide it; an author wants to see it).
  const left = terrainGeometry(trail)?.bounds.left ?? 0;
  ride = createRide(trail, { start: { x: Math.min(left, trail.start.x) - 100000, y: 0, facing: 1 } });
  return true;
};

// The playtest's run, ridden on as camera frames ask for later moments of it,
// so a frame shows the bike where it is then, with its lights.
let replay = null;

window.hjulbenSetRun = stretches => {
  replay = { inputs: stretches.flatMap(decodeInputs), ride: createRide(trail), step: 0 };
  return true;
};

/** The run's ride after `step` steps, or the parked ride without a bike. */
function rideAt(step) {
  if (!replay || !Number.isFinite(step)) return ride;
  if (step < replay.step) Object.assign(replay, { ride: createRide(trail), step: 0 });
  while (replay.step < step && replay.ride.status === 'running') stepRide(replay.ride, replay.inputs[replay.step++]);
  return replay.ride;
}

/**
 * Draws one view and returns it as a PNG data URL.
 * @param {{ view: { x: number, y: number, width: number, height: number }, scale: number, maxWidth: number,
 *   overlay: boolean, props: boolean, run: any, title: string }} job
 */
window.hjulbenRender = ({ view, scale, maxWidth, overlay, props, run, title, unseen, step }) => {
  const scene = document.createElement('canvas');
  const camera = drawScene(scene, {
    trail, ride: rideAt(step), width: view.width, height: view.height, scale,
    focus: { x: view.x + view.width / 2, y: view.y + view.height / 2 }, anchor: [0.5, 0.5],
  });
  // Device pixels per world unit in the image, scaled down to fit maxWidth.
  const k = Math.min(camera.worldToDevice, maxWidth / view.width);
  const width = Math.round(view.width * k), height = Math.round(view.height * k);
  const out = document.createElement('canvas');
  out.width = width + MARGIN.left + MARGIN.right;
  out.height = height + MARGIN.top + MARGIN.bottom;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#111c20';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingEnabled = k < camera.worldToDevice;
  ctx.drawImage(scene, (view.x - camera.x) * camera.worldToDevice, (view.y - camera.y) * camera.worldToDevice,
    view.width * camera.worldToDevice, view.height * camera.worldToDevice, MARGIN.left, MARGIN.top, width, height);
  const toX = x => MARGIN.left + (x - view.x) * k, toY = y => MARGIN.top + (y - view.y) * k;

  ruler(ctx, view, k, toX, toY, width, height, overlay);
  ctx.save();
  ctx.beginPath();
  ctx.rect(MARGIN.left, MARGIN.top, width, height);
  ctx.clip();
  if (overlay) {
    if (run && unseen) drawUnseen(ctx, run.seen, toX, toY, width, height);
    if (run) drawRun(ctx, run, toX, toY);
    drawMarkers(ctx, toX, toY);
  }
  if (props) drawProps(ctx, view, toX, toY);
  ctx.restore();
  ctx.font = FONT;
  ctx.fillStyle = '#e8e2d0';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const legend = props
    ? 'props: index in the props list, type, (front) for the front layer'
    : overlay
    ? `S start · F finish · N nisse${ride.checkpoints.length ? ' · C checkpoint' : ''} · route: blue slow → red fast, dashed = air · T turn · ! tight spot → × fails${run?.traps.length ? ' · TRAP: a miss strands the rider' : ''}${unseen && run ? ' · darker: never on screen' : ''}`
    : 'clean view: as the game draws it';
  ctx.fillText(`${title} · ${legend}`, MARGIN.left, out.height - MARGIN.bottom / 2);
  return out.toDataURL('image/png');
};

/** World coordinates along the top and left, and with overlays a faint grid. */
function ruler(ctx, view, k, toX, toY, width, height, grid) {
  const spacing = [25, 50, 100, 200, 250, 500, 1000, 2000].find(step => step * k >= 64) ?? 5000;
  ctx.font = FONT;
  ctx.fillStyle = '#e8e2d0';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  for (let x = Math.ceil(view.x / spacing) * spacing; x <= view.x + view.width; x += spacing) {
    ctx.fillText(String(x), toX(x), MARGIN.top / 2);
    if (grid) line(ctx, toX(x), MARGIN.top, toX(x), MARGIN.top + height);
  }
  ctx.textAlign = 'right';
  for (let y = Math.ceil(view.y / spacing) * spacing; y <= view.y + view.height; y += spacing) {
    ctx.fillText(String(y), MARGIN.left - 4, toY(y));
    if (grid) line(ctx, MARGIN.left, toY(y), MARGIN.left + width, toY(y));
  }
}

function line(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0 + .5, y0 + .5);
  ctx.lineTo(x1 + .5, y1 + .5);
  ctx.stroke();
}

/**
 * Darkens everything the game's camera never shows along the route, so
 * scenery no player will see, such as the top of a tall tower, stands out.
 */
function drawUnseen(ctx, seen, toX, toY, width, height) {
  const mask = document.createElement('canvas');
  mask.width = width;
  mask.height = height;
  const g = mask.getContext('2d');
  g.fillStyle = 'rgba(0, 0, 0, 0.55)';
  g.fillRect(0, 0, width, height);
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  for (const view of seen) {
    const left = toX(view.x) - MARGIN.left, top = toY(view.y) - MARGIN.top;
    g.fillRect(left, top, toX(view.x + view.width) - MARGIN.left - left, toY(view.y + view.height) - MARGIN.top - top);
  }
  ctx.drawImage(mask, MARGIN.left, MARGIN.top);
}

function drawRun(ctx, run, toX, toY) {
  ctx.lineCap = 'round';
  // A dark band under the whole route first, so it reads on any background.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  run.points.forEach(({ x, y }, index) => (index ? ctx.lineTo(toX(x), toY(y)) : ctx.moveTo(toX(x), toY(y))));
  ctx.stroke();
  ctx.lineWidth = 3;
  for (let index = 1; index < run.points.length; index++) {
    const from = run.points[index - 1], to = run.points[index];
    const fast = Math.min(1, to.speed / FAST);
    ctx.strokeStyle = `hsl(${Math.round(240 * (1 - fast))}, 90%, 58%)`;
    ctx.setLineDash(to.air ? [5, 5] : []);
    ctx.beginPath();
    ctx.moveTo(toX(from.x), toY(from.y));
    ctx.lineTo(toX(to.x), toY(to.y));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const turn of run.turns) badge(ctx, toX(turn.x), toY(turn.y), 'T', '#f1d35d', '#111c20');
  for (const spot of run.tightSpots) {
    const label = `! ${spot.reached}/${spot.trials}`;
    badge(ctx, toX(spot.from.x), toY(spot.from.y) - 18, label, '#e5484d', '#fff');
    if (!spot.failedAt) continue;
    const { x, y, cause } = spot.failedAt;
    cross(ctx, toX(x), toY(y));
    badge(ctx, toX(x), toY(y) + 14, cause, 'rgba(229, 72, 77, 0.85)', '#fff');
    // Joined to where the rerun started only when that's close by; across
    // the trail the line would only cut the picture up.
    if (Math.hypot(x - spot.from.x, y - spot.from.y) > NEAR) continue;
    ctx.strokeStyle = 'rgba(229, 72, 77, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    line(ctx, toX(spot.from.x), toY(spot.from.y) - 18, toX(x), toY(y));
    ctx.setLineDash([]);
  }
  for (const trap of run.traps) {
    cross(ctx, toX(trap.x), toY(trap.y));
    badge(ctx, toX(trap.x), toY(trap.y) + 18, 'TRAP', '#8e4ec6', '#fff');
  }
  if (run.crash) {
    cross(ctx, toX(run.crash.x), toY(run.crash.y));
    badge(ctx, toX(run.crash.x), toY(run.crash.y) + 18, `crash: ${run.crash.cause}`, '#e5484d', '#fff');
  }
}

/**
 * Each prop in view, labelled with its index in `trail.props` and its type,
 * so one that is out of place can be found in the file. A dot marks where it
 * stands; labels that would overlap are stacked upwards, joined to their dot.
 */
function drawProps(ctx, view, toX, toY) {
  ctx.font = PROP_FONT;
  const placed = [];
  const visible = trail.props
    .map((prop, index) => ({ prop, index, y: Number.isFinite(prop.y) ? prop.y : surfaceY(trail, prop.x) }))
    .filter(({ prop, y }) => y !== null && prop.x >= view.x && prop.x <= view.x + view.width && y >= view.y && y <= view.y + view.height)
    .sort((a, b) => a.prop.x - b.prop.x);
  for (const { prop, index, y } of visible) {
    const x = toX(prop.x), top = toY(y);
    const text = `${index} ${prop.type}${prop.layer === 'front' ? ' (front)' : ''}`;
    const width = ctx.measureText(text).width + 6;
    let labelY = top - 14;
    const overlaps = at => placed.some(rect => Math.abs(rect.x - x) < (rect.width + width) / 2 && Math.abs(rect.y - at) < 15);
    for (let tries = 0; tries < 12 && overlaps(labelY); tries++) labelY -= 15;
    placed.push({ x, y: labelY, width });
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1;
    line(ctx, x, top, x, labelY + 7);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 2, top - 2, 5, 5);
    ctx.fillStyle = prop.layer === 'front' ? 'rgba(120, 60, 150, 0.9)' : 'rgba(17, 28, 32, 0.85)';
    ctx.fillRect(Math.round(x - width / 2), Math.round(labelY - 7), Math.round(width), 14);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, labelY + 1);
  }
}

function drawMarkers(ctx, toX, toY) {
  ride.apples.forEach((apple, index) => {
    ring(ctx, toX(apple.x), toY(apple.y), 13, '#ff5a4f');
    badge(ctx, toX(apple.x) + 16, toY(apple.y) - 14, String(index + 1), '#ff5a4f', '#fff');
  });
  const startY = Number.isFinite(trail.start.y) ? trail.start.y : null;
  const start = { x: trail.start.x, y: startY ?? surfaceAbove(trail.start.x) };
  badge(ctx, toX(start.x), toY(start.y) - 24, trail.start.facing < 0 ? '← S' : 'S →', '#4fc46b', '#111c20');
  const finish = ride.flower;
  ring(ctx, toX(finish.x), toY(finish.y), 15, '#e86bd8');
  badge(ctx, toX(finish.x) + 18, toY(finish.y) - 16, 'F', '#e86bd8', '#111c20');
  if (ride.nisse) badge(ctx, toX(ride.nisse.x), toY(ride.nisse.y) - 30, 'N', '#d9a441', '#111c20');
  ride.checkpoints.forEach((foot, index) => badge(ctx, toX(foot.x), toY(foot.y) - 24, `C${index + 1}`, '#d63b2c', '#fff'));
}

// The bike's height where it stands at `x` on the trail's top surface.
function surfaceAbove(x) {
  const top = createRide(trail, { start: { x, y: null, facing: 1 } });
  return (top.rear.y + top.front.y) / 2;
}

function ring(ctx, x, y, radius, color) {
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  ctx.arc(x, y, radius + 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function cross(ctx, x, y) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#e5484d';
  line(ctx, x - 6, y - 6, x + 6, y + 6);
  line(ctx, x - 6, y + 6, x + 6, y - 6);
}

function badge(ctx, x, y, text, background, color) {
  ctx.font = FONT;
  const width = ctx.measureText(text).width + 8;
  ctx.fillStyle = background;
  ctx.fillRect(Math.round(x - width / 2), Math.round(y - 8), Math.round(width), 16);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
}
