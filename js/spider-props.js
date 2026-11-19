// @ts-check
// Spiders and their silk: an orb web with its spider, a dusty cobweb, a
// spider dangling on a thread and a silk-wrapped cocoon. All four hang from
// the rock above them (see CEILING_PROPS in drawing.js), or from their own
// anchor, under a branch say, when there is no roof. Like every prop they sit
// on the 2-unit art grid, have no outlines and are lit from the right. They
// are drawn live, from the roof at y = 0 downwards, sized to the `room`
// between the roof and the floor below it.

const SILK = { dim: "#b5bcae", base: "#e8e5d9", bright: "#fffdf4" };
// A garden spider: brown, so it shows up against dark rock, with a pale cross.
const SPIDER = { dark: "#4d3f2f", base: "#806244", light: "#aa8a60", mark: "#f4e9d1", eye: "#182321" };
const COCOON = { shade: "#b5bcae", base: "#e8e5d9", light: "#fffdf4", band: "#c9c4b4" };

const snap = (value) => Math.round(value / 2) * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * How far the rider is from a point, or Infinity when there is no rider.
 * @param {{ riderX?: number | null, riderY?: number | null }} scene
 */
function riderDistance(scene, x, y) {
  return Number.isFinite(scene.riderX) && Number.isFinite(scene.riderY)
    ? Math.hypot(scene.riderX - x, scene.riderY - y)
    : Infinity;
}

/**
 * How far a spider dares to stay out, 1 (fully) to 0 (hidden), as the rider
 * comes from `from` to within `to` of it.
 */
export function spiderDare(distance, from, to) {
  return clamp((distance - to) / (from - to), 0, 1);
}

// ------------------------------------------------------------- the spider

/**
 * A spider about 16 across, its body centred on (0, 0), seen from the front
 * with four legs either side. `step` (0 or 1) swaps its legs for scuttling.
 */
export function drawSpider({ pixelRect, drawPixelDisc }, step = 0) {
  const c = SPIDER;
  // Legs: knees up, feet out and down, alternating as it scuttles.
  for (const side of [-1, 1])
    for (let leg = 0; leg < 4; leg++) {
      const lift = (leg + step) % 2 ? 2 : 0;
      const y = -4 + leg * 2;
      pixelRect(side < 0 ? -6 : 4, y - lift, 2, 2, c.base, 2);
      pixelRect(side < 0 ? -8 : 6, y - 2 - lift, 2, 2, c.base, 2);
      pixelRect(side < 0 ? -10 : 8, y - lift, 2, 4, side < 0 ? c.dark : c.light, 2);
    }
  // Abdomen, then head, lit up and to the right.
  drawPixelDisc(0, -2, 4, c.base, 2);
  pixelRect(-4, -2, 2, 4, c.dark, 2);
  pixelRect(2, -6, 2, 2, c.light, 2);
  pixelRect(0, -4, 2, 4, c.mark, 2);
  pixelRect(-2, -2, 6, 2, c.mark, 2);
  pixelRect(-2, 2, 4, 4, c.dark, 2);
  pixelRect(-2, 4, 2, 2, c.eye, 2);
  pixelRect(0, 4, 2, 2, c.eye, 2);
}

// ---------------------------------------------------------------- orb web

/** The orb web's hub below the roof, its radius, and how far down it can reach. */
export const WEB = { hub: 40, radius: 30, spokes: 9 };
export const WEB_HANG = WEB.hub + WEB.radius + 4;
/** How close the rider must come for the web to tremble and its spider to retreat. */
export const WEB_NOTICE = { from: 220, to: 100 };

/**
 * The web's size in a space `room` tall under the roof: the hub's depth and
 * the radius, shrunk to fit a low ceiling.
 */
export function webSize(room = Infinity) {
  const scale = clamp((room - 10) / WEB_HANG, 0.45, 1);
  return { hub: snap(WEB.hub * scale), radius: snap(WEB.radius * scale) };
}

/**
 * How a web at (x, y) reacts: `tremble`, how far its threads shiver (0 when
 * still, and always at time 0), and `dare`, how far its spider stays out at
 * the hub (1) rather than up on its anchor thread (0).
 */
export function webState(scene, x, y) {
  const distance = riderDistance(scene, x, y);
  const dare = spiderDare(distance, WEB_NOTICE.from, WEB_NOTICE.to);
  const time = scene.time || 0;
  const tremble = time && dare < 1 ? Math.sin(time * 40) * (1 - dare) * 2 : 0;
  return { tremble, dare };
}

/**
 * An orb web hanging from the roof: three anchor threads, the spokes and
 * frame, and a spiral with a few broken rungs; its spider sits at the hub,
 * or up its anchor thread out of the way. `noise(n)` (0…1) varies the
 * spokes and breaks from web to web; `sway` (-1…1) leans the whole web in
 * the wind.
 */
export function drawSpiderweb(tools, room, noise, state, sway = 0) {
  const { pixelPath, pixelRect } = tools;
  const { hub, radius } = webSize(room);
  const hx = snap(sway * 2), hy = hub;
  const shiver = (r) => state.tremble * (r / radius);
  // Spoke ends, each a little off the even spacing.
  const angles = Array.from({ length: WEB.spokes }, (_, i) =>
    ((i + (noise(i) - 0.5) * 0.3) / WEB.spokes) * Math.PI * 2);
  const at = (angle, r) => [hx + Math.cos(angle) * r + shiver(r), hy + Math.sin(angle) * r * 0.92];
  // Anchor threads up to the roof.
  for (const [ax, from] of [[-radius, Math.PI * 1.2], [radius - 4, Math.PI * 1.8], [0, Math.PI * 1.5]])
    pixelPath([[ax, 0], at(from, radius)], SILK.dim, 1, 2);
  // Frame and spokes.
  pixelPath([...angles, angles[0]].map((angle) => at(angle, radius)), SILK.dim, 1, 2);
  for (const angle of angles) pixelPath([at(angle, 4), at(angle, radius)], SILK.base, 1, 2);
  // The spiral, one rung between each pair of spokes, missing a few.
  for (let r = 8; r < radius - 2; r += 6)
    angles.forEach((angle, i) => {
      if (noise(20 + i * 7 + r) < 0.15) return;
      const next = angles[(i + 1) % angles.length] + (i === angles.length - 1 ? Math.PI * 2 : 0);
      pixelPath([at(angle, r), at(next, r + 1)], i % 4 === 1 ? SILK.base : SILK.dim, 1, 2);
    });
  // Dew catching the light on the right.
  for (const i of [1, 4]) {
    const [dx, dy] = at(angles[i], radius * 0.6);
    pixelRect(snap(dx), snap(dy), 2, 2, SILK.bright, 2);
  }
  // The spider: at the hub, or up the middle anchor thread when wary.
  const sy = snap(hy * state.dare + 6 * (1 - state.dare));
  return { spider: [snap(hx * state.dare), sy] };
}

// ---------------------------------------------------------------- cobweb

/** How wide a cobweb hangs, and how far down its tatters reach. */
export const COBWEB = { half: 32, sag: 26 };
export const COBWEB_HANG = COBWEB.sag + 18;

/**
 * Where a cobweb tatter hangs at time `time` in `wind` (0…1): how far it
 * swings sideways, blowing left; still at time 0.
 */
export function cobwebSwing(time, wind, phase) {
  if (!time) return 0;
  return -wind * 3 + Math.sin(time * 1.6 + phase * Math.PI * 2) * (1 + wind * 2);
}

/**
 * A dusty sheet of cobweb sagging from the roof, with tatters hanging off it
 * that stir in the wind. `downwind` is -1 (left) or 1 (right).
 */
export function drawCobweb(tools, room, noise, time = 0, wind = 0, downwind = -1) {
  const { pixelPath, pixelRect } = tools;
  const { half } = COBWEB;
  const sag = Math.min(COBWEB.sag, Math.max(8, room - 20));
  const curve = (fraction) => {
    const points = [];
    for (let x = -half; x <= half; x += 4) {
      const t = x / half;
      points.push([x, snap(sag * fraction * (1 - t * t))]);
    }
    return points;
  };
  // Strands fanning down from the roof, then the sagging threads across them.
  for (let x = -half + 12; x < half; x += 14) pixelPath([[x * 0.4, 0], [x, snap(sag * (1 - (x / half) ** 2))]], SILK.dim, 1, 2);
  for (const fraction of [0.35, 0.7, 1]) pixelPath(curve(fraction), fraction === 1 ? SILK.base : SILK.dim, 1, 2);
  // A haze of dust caught in the sheet.
  for (let i = 0; i < 10; i++) {
    const x = snap((noise(i) - 0.5) * half * 1.6);
    const y = snap((1 - (x / half) ** 2) * sag * (0.2 + noise(i + 30) * 0.7));
    pixelRect(x, y, 2, 2, SILK.base, 2);
  }
  // Tatters.
  for (const [tx, length, n] of [[-16, 14, 1], [6, 18, 2], [20, 10, 3]]) {
    const top = snap(sag * (1 - (tx / half) ** 2));
    const swing = cobwebSwing(time, wind, noise(40 + n)) * -downwind;
    pixelPath([[tx, top], [tx + swing * 0.5, top + length * 0.5], [tx + swing, top + length]], SILK.dim, 1, 2);
    pixelRect(snap(tx + swing), snap(top + length), 2, 2, SILK.base, 2);
  }
}

// --------------------------------------------------------- dangling spider

/** How far a dangling spider lets itself down, and when it climbs back up. */
export const SPIDER_DROP = 110;
export const SPIDER_NOTICE = { from: 200, to: 80 };

/**
 * How far down its thread a dangling spider at (x, y), under a roof `room`
 * above the floor, hangs: lowering itself when the coast is clear, bobbing
 * gently, and climbing back up as the rider comes close. `step` alternates
 * its legs while it climbs.
 */
export function danglingSpider(scene, x, y, room = Infinity, phase = 0) {
  const longest = clamp(Math.min(SPIDER_DROP, room - 24), 12, SPIDER_DROP);
  const time = scene.time || 0;
  const dare = spiderDare(riderDistance(scene, x, y + longest), SPIDER_NOTICE.from, SPIDER_NOTICE.to);
  const bob = time ? Math.sin(time * 1.3 + phase * Math.PI * 2) * 3 : 0;
  const length = snap(clamp(8 + (longest - 8) * dare + bob * dare, 8, longest));
  const sway = time ? snap(Math.sin(time * 0.8 + phase * 5) * 2 * (length / SPIDER_DROP)) : 0;
  const climbing = dare > 0 && dare < 1;
  return { length, sway, step: climbing && time ? Math.floor(time * 12) % 2 : 0 };
}

/** The spider's thread from the roof, and the spider at its end. */
export function drawDanglingSpider(tools, hang) {
  const { pixelPath } = tools;
  pixelPath([[0, 0], [hang.sway, hang.length - 6]], SILK.base, 1, 2);
  return { spider: [hang.sway, hang.length] };
}

// ---------------------------------------------------------------- cocoon

/** How far below the roof the cocoon hangs, and its length. */
export const COCOON_THREAD = 28;
export const COCOON_LENGTH = 26;
export const COCOON_HANG = COCOON_THREAD + COCOON_LENGTH + 4;

/**
 * How the cocoon moves: a slow `swing` sideways in the wind, and now and then
 * a `twitch` (0 or ±2) from whatever is inside. Still at time 0.
 */
export function cocoonMotion(time, wind, phase) {
  if (!time) return { swing: 0, twitch: 0 };
  const swing = Math.sin(time * 0.7 + phase * Math.PI * 2) * (1 + wind * 3);
  const cycle = (time + phase * 5) % 5;
  const twitch = cycle < 0.5 ? (Math.floor(cycle * 16) % 2 ? 2 : -2) : 0;
  return { swing, twitch };
}

/** A silk-wrapped cocoon on a short thread, wound in bands, lit from the right. */
export function drawCocoon({ pixelRect, pixelPath }, room, motion) {
  const thread = Math.min(COCOON_THREAD, Math.max(4, room - COCOON_LENGTH - 16));
  const cx = snap(motion.swing), top = snap(thread);
  pixelPath([[0, 0], [cx, top]], SILK.base, 1, 2);
  const widths = [4, 8, 10, 12, 12, 12, 12, 10, 10, 8, 6, 4, 2];
  widths.forEach((width, row) => {
    const y = top + row * 2;
    const x = cx + motion.twitch * (row > 3 && row < 9 ? 1 : 0) - width / 2;
    pixelRect(x, y, width, 2, row % 3 === 1 ? COCOON.band : COCOON.base, 2);
    pixelRect(x, y, 2, 2, COCOON.shade, 2);
    if (width > 4) pixelRect(x + width - 2, y, 2, 2, COCOON.light, 2);
  });
  // Loose strands wound round it.
  pixelPath([[cx - 6, top + 8], [cx + 6, top + 12]], COCOON.shade, 1, 2);
  pixelPath([[cx - 5, top + 16], [cx + 5, top + 20]], COCOON.shade, 1, 2);
}
