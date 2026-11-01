// @ts-check
import { STEP, GRAVITY } from "./config.js";
import { collideFreePoint, collideWithBike } from "./vehicle-physics.js";
import { terrainCollisionsAt } from "./terrain.js";
import { atan2, cos, hypot, sin } from "./det-math.js";
import { RAGDOLL_WATER, RAGDOLL_WATER_RADIUS, applyWater } from "./water.js";
import { bodyPose } from "./bike-lamps.js";

// `grip` lets a resting body hold on slopes up to about 35 degrees. Once
// sliding, kinetic friction (`slide`) is lower, so a thrown rider skids a
// good way and keeps going down steep hills; the drag (`friction`) and the
// extra grip only come back below `settle` speed (px per step) to bring an
// all-but-stopped body to rest.
const RAGDOLL_CONTACT = {
  bounce: 0.12,
  friction: 0.16,
  grip: 0.75,
  slide: 0.62,
  settle: 0.25,
};
const SOLVER_ITERATIONS = 6;
// Share of the relative swing between linked joints lost each step, so limbs
// stop flailing once the body has landed.
const LINK_DAMPING = 0.025;
// The body sleeps once every joint has moved less than this (px per step)
// for SLEEP_STEPS steps, and wakes when the bike runs into it.
const SLEEP_SPEED = 0.02;
const SLEEP_STEPS = 60;
// Rough share of the rider's weight at each joint; the torso carries most.
const MASS = {
  head: 0.55,
  shoulder: 1.6,
  hip: 1.8,
  elbow: 0.4,
  hand: 0.3,
  knee: 0.9,
  foot: 0.5,
};
const DEGREE = Math.PI / 180;
const TURN = Math.PI * 2;
// Most a joint limit swings the body back in one solver pass, in radians.
const MAX_LIMIT_STEP = 0.08;
// How far the head tips against the spine, and the thigh swings against the
// torso, in degrees: [a, joint, b, least, most]. Angles are measured facing
// right, negative tipping forwards; seated, the hip sits at -90.
/** @type {Array<[string, string, string, number, number]>} */
const ANGLE_LIMITS = [
  ["hip", "shoulder", "head", -70, 30],
  ["shoulder", "hip", "knee", -150, 25],
];
// Knees and elbows fold at most this far: the distance between the outer
// joints never drops below this share of the two limb lengths combined.
const MIN_FOLD = 0.38;
// A knee or elbow bent backwards by less than this (px off the straight line)
// is straightened rather than mirrored.
const HINGE_STRAIGHTEN = 1.5;

const LINKS = [
  ["head", "shoulder"],
  ["shoulder", "hip"],
  ["shoulder", "elbow"],
  ["elbow", "hand"],
  ["hip", "knee"],
  ["knee", "foot"],
];
const HINGES = [
  ["shoulder", "elbow", "hand"],
  ["hip", "knee", "foot"],
];

// The helmet rides on the head until a single step's contacts, with the
// ground or the bike, change the head's velocity by more than the strap holds,
// in world units a second; hits to the rest of the body don't count. Each
// crash draws its strap strength in this range. Measured over crashes on the
// official trails, it stays on in nearly every crash at trail speed and comes
// off in about one in ten of the fast ones (above about 450 units/s), so
// losing it reads as a big hit.
export const HELMET_KNOCK_MIN = 300;
export const HELMET_KNOCK_MAX = 450;
export const HELMET_RADIUS = 6;
// The bare head is a little smaller than the helmet around it.
const BARE_HEAD_RADIUS = 4.5;
// A rider without a helmet has no strap to break.
const strap = (strength, helmeted) => (helmeted ? strength : Infinity);
const HELMET_INVERSE_MASS = 1 / 0.2;
// A hard shell: bouncier and slicker than the body. `grip` still lets it
// settle on gentle slopes instead of rolling forever.
const HELMET_CONTACT = { bounce: 0.3, friction: 0.08, grip: 0.6 };
const HELMET_WATER = { buoyancy: 2.2, drag: 2, quadratic: 0.01, spin: 0 };
// Share of the knock's velocity change the freed helmet keeps on top of the
// head's, so it pops off the surface rather than sliding with the head.
const HELMET_POP = 0.35;
// How quickly a helmet touching the ground takes up the spin of rolling, per step.
const HELMET_ROLL_GRIP = 0.35;
const HELMET_AIR_SPIN_DRAG = 0.998;

const cross = (a, b, c) =>
  (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);

/**
 * Throws the rider off the bike.
 *
 * Pass the current drawBike visual state as the fifth argument.
 * Capture it BEFORE resetting lean, suspension, facing or crash state.
 *
 * `random` must return values in [0, 1) for deterministic crashes. Each joint
 * keeps the bike's velocity at its position, spin included, so a rider thrown
 * mid-flip is flung outwards rather than dropped.
 *
 * @param {{ x: number, y: number, ox: number, oy: number, compression?: number }} rear
 * @param {{ x: number, y: number, ox: number, oy: number, compression?: number }} front
 * @param {number} facing
 * @param {() => number} random
 * @param {{
 *   mx?: number,
 *   my?: number,
 *   angle?: number,
 *   flipVisual?: number,
 *   leanVisual?: number,
 *   helmet?: boolean
 * }} [visual]  `helmet: false` throws a rider who wears none: a bare head
 *   from the start, and nothing to knock off.
 */
export function createRagdoll(rear, front, facing, random, visual = {}) {
  const helmeted = visual.helmet !== false;
  const mx = visual.mx ?? (rear.x + front.x) / 2;
  const my = visual.my ?? (rear.y + front.y) / 2;

  const angle = visual.angle ?? atan2(front.y - rear.y, front.x - rear.x);

  const c = cos(angle);
  const s = sin(angle);

  // This must match the value passed to drawBike().
  const flipVisual = visual.flipVisual ?? facing;
  const shift = Math.round((visual.leanVisual ?? 0) * 4.5) * 2;

  // Same suspension pose as drawBike().
  const suspension = bodyPose(rear, front, facing);
  const bodyDrop = Math.round(suspension.drop / 2) * 2;
  const bodyPitch = suspension.pitch;
  const pc = cos(bodyPitch);
  const ps = sin(bodyPitch);

  // Joint anchors from the first redesigned rider.
  // The head anchor is the helmet's center, not the neck.
  const pose = {
    head: [3 + shift, -46],
    shoulder: [2 + shift, -36],
    hip: [-8 + shift, -24],
    elbow: [11 + shift * 0.45, -30],
    hand: [20, -25],
    knee: [4 + shift * 0.45, -14],
    foot: [-2, -3],
  };

  const vx = (rear.x - rear.ox + (front.x - front.ox)) / 2;
  const vy = (rear.y - rear.oy + (front.y - front.oy)) / 2;
  const centerX = (rear.x + front.x) / 2,
    centerY = (rear.y + front.y) / 2;
  const axisX = front.x - rear.x,
    axisY = front.y - rear.y;
  const spin =
    (axisX * (front.y - front.oy - (rear.y - rear.oy)) -
      axisY * (front.x - front.ox - (rear.x - rear.ox))) /
    (axisX * axisX + axisY * axisY || 1);

  const points = {};

  for (const [name, [lx, ly]] of Object.entries(pose)) {
    // First apply the rider's suspension transform.
    const bodyX = lx * pc - ly * ps;
    const bodyY = lx * ps + ly * pc + bodyDrop;

    // Then apply the same mirror and rotation as the bike sprite.
    const localX = bodyX * flipVisual;
    const x = mx + c * localX - s * bodyY;
    const y = my + s * localX + c * bodyY;

    const pvx = vx - spin * (y - centerY) + (random() - 0.5) * 0.35;
    const pvy = vy + spin * (x - centerX) - 1.1 + (random() - 0.5) * 0.25;

    points[name] = {
      x,
      y,
      ox: x - pvx,
      oy: y - pvy,
      radius: name === "head" ? (helmeted ? HELMET_RADIUS : BARE_HEAD_RADIUS) : 3,
      inverseMass: 1 / MASS[name],
    };
  }

  // Visual metadata only; it does not affect the constraint solver.
  points.head.drawFacing = flipVisual < 0 ? -1 : 1;

  const links = LINKS.map(([a, b]) => ({
    a,
    b,
    length: hypot(points[b].x - points[a].x, points[b].y - points[a].y),
  }));

  const hinges = HINGES.map(([a, joint, b]) => {
    const upper = hypot(
      points[joint].x - points[a].x,
      points[joint].y - points[a].y,
    );
    const lower = hypot(
      points[b].x - points[joint].x,
      points[b].y - points[joint].y,
    );

    return {
      a,
      joint,
      b,
      side: Math.sign(cross(points[a], points[joint], points[b])) || 1,
      minSpan: (upper + lower) * MIN_FOLD,
    };
  });

  const angleLimits = ANGLE_LIMITS.map(([a, joint, b, least, most]) => ({
    a,
    joint,
    b,
    mirror: flipVisual < 0 ? -1 : 1,
    least: least * DEGREE,
    most: most * DEGREE,
  }));

  return {
    points,
    links,
    hinges,
    angleLimits,
    list: Object.values(points),
    still: 0,
    asleep: false,
    clearOfBike: false,
    // Drawn after the joints, so a thrown rider's tumble is unchanged.
    // Drawn either way, so the joints that follow get the same random numbers.
    helmetStrap: strap(
      HELMET_KNOCK_MIN + random() * (HELMET_KNOCK_MAX - HELMET_KNOCK_MIN),
      helmeted,
    ),
    // The loose helmet once it has come off, else null.
    helmet: null,
  };
}

const rotateAbout = (point, center, angle) => {
  const c = cos(angle),
    s = sin(angle);
  const dx = point.x - center.x,
    dy = point.y - center.y;
  point.x = center.x + dx * c - dy * s;
  point.y = center.y + dx * s + dy * c;
};

const momentum = (trio) => {
  let x = 0,
    y = 0;
  for (const p of trio) {
    x += (p.x - p.ox) / p.inverseMass;
    y += (p.y - p.oy) / p.inverseMass;
  }
  return { x, y };
};

// Joint limits only bend the body; they must not push it along. Shifting the
// three joints together by the momentum a correction added cancels it without
// undoing the bend, so two limits fighting over a tangled limb can't shuffle a
// resting body across the ground.
function keepMomentum(trio, before) {
  const after = momentum(trio);
  let mass = 0;
  for (const p of trio) mass += 1 / p.inverseMass;
  const shiftX = (before.x - after.x) / mass,
    shiftY = (before.y - after.y) / mass;
  for (const p of trio) {
    p.x += shiftX;
    p.y += shiftY;
  }
}

// Swings the outer joints back inside the allowed turn at the middle joint,
// the lighter end moving more. The turn wraps at half a circle, so a joint
// folded past it is sent back to the nearer limit, not the long way round, and
// each pass moves it a little so a tangled body unfolds over a few steps
// instead of being flung apart.
function enforceAngleLimit(points, limit) {
  const a = points[limit.a],
    joint = points[limit.joint],
    b = points[limit.b];
  const ux = joint.x - a.x,
    uy = joint.y - a.y,
    vx = b.x - joint.x,
    vy = b.y - joint.y;
  const turn = atan2(ux * vy - uy * vx, ux * vx + uy * vy) * limit.mirror;
  if (turn >= limit.least && turn <= limit.most) return;
  const pastMost = (turn - limit.most + TURN) % TURN,
    beforeLeast = (limit.least - turn + TURN) % TURN;
  const excess = pastMost <= beforeLeast ? pastMost : -beforeLeast;
  const correction =
    Math.max(-MAX_LIMIT_STEP, Math.min(MAX_LIMIT_STEP, excess)) * limit.mirror;
  const share = a.inverseMass / (a.inverseMass + b.inverseMass);
  const trio = [a, joint, b],
    before = momentum(trio);
  rotateAbout(a, joint, correction * share);
  rotateAbout(b, joint, -correction * (1 - share));
  keepMomentum(trio, before);
}

// Bleeds off part of the relative velocity across each link, keeping the
// pair's shared momentum.
function dampLinks(ragdoll) {
  for (const link of ragdoll.links) {
    const a = ragdoll.points[link.a],
      b = ragdoll.points[link.b];
    const dvx = b.x - b.ox - (a.x - a.ox),
      dvy = b.y - b.oy - (a.y - a.oy);
    const total = a.inverseMass + b.inverseMass;
    const shareA = (LINK_DAMPING * a.inverseMass) / total,
      shareB = (LINK_DAMPING * b.inverseMass) / total;
    a.ox -= dvx * shareA;
    a.oy -= dvy * shareA;
    b.ox += dvx * shareB;
    b.oy += dvy * shareB;
  }
}

// A knee or elbow that bends backwards is mirrored across the line through
// its neighbours; one only slightly past straight is straightened instead, so
// a limb lying flat with its bend facing into the ground rests straight rather
// than being flipped into the ground and back every step, which would shuffle
// the whole body along. A limb folded too tightly is pushed back open.
function enforceHinge(points, hinge) {
  const a = points[hinge.a],
    joint = points[hinge.joint],
    b = points[hinge.b];
  if (cross(a, joint, b) * hinge.side < 0) {
    const trio = [a, joint, b],
      before = momentum(trio);
    const dx = b.x - a.x,
      dy = b.y - a.y,
      lengthSq = dx * dx + dy * dy || 0.001;
    const t = ((joint.x - a.x) * dx + (joint.y - a.y) * dy) / lengthSq;
    const footX = a.x + dx * t,
      footY = a.y + dy * t;
    const straighten =
      (joint.x - footX) ** 2 + (joint.y - footY) ** 2 < HINGE_STRAIGHTEN ** 2;
    const mirroredX = straighten ? footX : 2 * footX - joint.x,
      mirroredY = straighten ? footY : 2 * footY - joint.y;
    // Keep only the joint's speed along the limb; carrying its speed across
    // would drive it back through the line every step.
    const length = Math.sqrt(lengthSq);
    const alongX = dx / length,
      alongY = dy / length;
    const along = (joint.x - joint.ox) * alongX + (joint.y - joint.oy) * alongY;
    joint.x = mirroredX;
    joint.y = mirroredY;
    joint.ox = mirroredX - alongX * along;
    joint.oy = mirroredY - alongY * along;
    keepMomentum(trio, before);
  }
  const dx = b.x - a.x,
    dy = b.y - a.y,
    span = hypot(dx, dy) || 0.001;
  if (span < hinge.minSpan) {
    const push = (hinge.minSpan - span) / span / (a.inverseMass + b.inverseMass);
    a.x -= dx * push * a.inverseMass;
    a.y -= dy * push * a.inverseMass;
    b.x += dx * push * b.inverseMass;
    b.y += dy * push * b.inverseMass;
  }
}

// The rider is thrown from inside the bike (feet on the pegs, seat), so the
// body only collides with it once every joint has come clear. Clearing joint
// by joint let a free arm be caught on a tumbling bike while the hips were
// still inside it: the bike shoved the arm out every step, the links pulled it
// back in, and the bike's momentum was pumped into the body, flinging it.
function collideRagdollWithBike(ragdoll, vehicle) {
  if (!ragdoll.clearOfBike) {
    ragdoll.clearOfBike = !ragdoll.list.some((p) =>
      collideWithBike(vehicle, p, p.inverseMass, false),
    );
    return false;
  }
  let touched = false;
  for (const p of ragdoll.list)
    if (collideWithBike(vehicle, p, p.inverseMass)) touched = true;
  return touched;
}

/**
 * @param {any} ragdoll
 * @param {any} trail
 * @param {import('./types.js').Water[]} [water] normalized water bodies, which buoy the rider up
 * @param {import('./types.js').Vehicle} [vehicle] the crashed bike, which the rider bumps into
 * @returns {{ x: number, y: number, speed: number } | null} where the helmet
 *   was knocked off this step, with the hit's speed in world units a second
 */
export function stepRagdoll(ragdoll, trail, water = [], vehicle = null) {
  if (ragdoll.helmet) stepHelmet(ragdoll.helmet, trail, water, vehicle);
  return stepBody(ragdoll, trail, water, vehicle);
}

function stepBody(ragdoll, trail, water, vehicle) {
  if (ragdoll.asleep) {
    if (!vehicle || !collideRagdollWithBike(ragdoll, vehicle)) {
      for (const p of ragdoll.list) {
        p.ox = p.x;
        p.oy = p.y;
      }
      return null;
    }
    ragdoll.asleep = false;
    ragdoll.still = 0;
  }
  let floating = false;
  if (water.length)
    for (const p of ragdoll.list)
      if (
        applyWater(p, Math.max(p.radius, RAGDOLL_WATER_RADIUS), water, RAGDOLL_WATER)
      )
        floating = true;
  for (const p of ragdoll.list) {
    const vx = (p.x - p.ox) * 0.996,
      vy = (p.y - p.oy) * 0.996;
    p.ox = p.x;
    p.oy = p.y;
    p.x += vx;
    p.y += vy + GRAVITY * STEP * STEP;
  }
  // The hardest single change the contacts make to the head's velocity this
  // step, per step: the hit the helmet takes. Links pulling on the neck, and
  // the body settling onto the head over the later passes, do not add to it.
  const head = ragdoll.points.head;
  let kickX = 0,
    kickY = 0;
  for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration++) {
    for (const link of ragdoll.links) {
      const a = ragdoll.points[link.a],
        b = ragdoll.points[link.b];
      const dx = b.x - a.x,
        dy = b.y - a.y,
        d = hypot(dx, dy) || 0.001;
      const correction =
        (d - link.length) / d / (a.inverseMass + b.inverseMass);
      a.x += dx * correction * a.inverseMass;
      a.y += dy * correction * a.inverseMass;
      b.x -= dx * correction * b.inverseMass;
      b.y -= dy * correction * b.inverseMass;
    }
    for (const hinge of ragdoll.hinges) enforceHinge(ragdoll.points, hinge);
    for (const limit of ragdoll.angleLimits)
      enforceAngleLimit(ragdoll.points, limit);
    const headVX = head.x - head.ox,
      headVY = head.y - head.oy;
    if (vehicle) collideRagdollWithBike(ragdoll, vehicle);
    for (const p of ragdoll.list)
      collideFreePoint(trail, p, iteration === 0, RAGDOLL_CONTACT);
    const passX = head.x - head.ox - headVX,
      passY = head.y - head.oy - headVY;
    if (passX * passX + passY * passY > kickX * kickX + kickY * kickY) {
      kickX = passX;
      kickY = passY;
    }
  }
  dampLinks(ragdoll);
  let knock = null;
  const hit = hypot(kickX, kickY) / STEP;
  if (!ragdoll.helmet && hit > ragdoll.helmetStrap) {
    loosenHelmet(ragdoll, kickX, kickY);
    knock = { x: head.x, y: head.y, speed: hit };
  }
  const moving = ragdoll.list.some(
    (p) =>
      Math.abs(p.x - p.ox) > SLEEP_SPEED || Math.abs(p.y - p.oy) > SLEEP_SPEED,
  );
  ragdoll.still = moving || floating ? 0 : ragdoll.still + 1;
  if (ragdoll.still >= SLEEP_STEPS) ragdoll.asleep = true;
  return knock;
}

/**
 * Frees the helmet from the head. It leaves with the head's velocity plus a
 * share of the knock, so it pops off the surface it hit, and keeps the spin
 * of the head swinging on the neck. Its angle starts at the drawn head's.
 */
function loosenHelmet(ragdoll, kickX, kickY) {
  const { head, shoulder } = ragdoll.points;
  const facing = head.drawFacing ?? 1;
  const vx = head.x - head.ox + kickX * HELMET_POP,
    vy = head.y - head.oy + kickY * HELMET_POP;
  const rx = head.x - shoulder.x,
    ry = head.y - shoulder.y;
  const swingX = head.x - head.ox - (shoulder.x - shoulder.ox),
    swingY = head.y - head.oy - (shoulder.y - shoulder.oy);
  const swing = (rx * swingY - ry * swingX) / (rx * rx + ry * ry || 1);
  ragdoll.helmet = {
    x: head.x,
    y: head.y,
    ox: head.x - vx,
    oy: head.y - vy,
    radius: HELMET_RADIUS,
    inverseMass: HELMET_INVERSE_MASS,
    facing,
    spin: atan2(ry, rx) - atan2(-10, facing),
    angularVelocity: Math.max(-40, Math.min(40, swing / STEP)),
    grounded: false,
    clearOfBike: false,
    still: 0,
    asleep: false,
  };
  head.radius = BARE_HEAD_RADIUS;
}

function stepHelmet(helmet, trail, water, vehicle) {
  if (helmet.asleep) {
    if (!vehicle || !collideWithBike(vehicle, helmet, helmet.inverseMass, false)) {
      helmet.ox = helmet.x;
      helmet.oy = helmet.y;
      return;
    }
    helmet.asleep = false;
    helmet.still = 0;
  }
  const floating =
    water.length > 0 && applyWater(helmet, HELMET_RADIUS, water, HELMET_WATER) > 0;
  const vx = (helmet.x - helmet.ox) * 0.996,
    vy = (helmet.y - helmet.oy) * 0.996;
  helmet.ox = helmet.x;
  helmet.oy = helmet.y;
  helmet.x += vx;
  helmet.y += vy + GRAVITY * STEP * STEP;
  helmet.grounded = false;
  for (let iteration = 0; iteration < 2; iteration++) {
    if (vehicle) {
      if (!helmet.clearOfBike)
        helmet.clearOfBike = !collideWithBike(vehicle, helmet, helmet.inverseMass, false);
      else collideWithBike(vehicle, helmet, helmet.inverseMass);
    }
    collideFreePoint(trail, helmet, iteration === 0, HELMET_CONTACT);
  }
  // On the ground the shell rolls with its speed along the surface;
  // in the air it keeps turning.
  const contact = helmet.grounded
    ? terrainCollisionsAt(trail, helmet.x, helmet.y, HELMET_RADIUS + 0.5)[0]
    : null;
  if (contact) {
    const along =
      (helmet.x - helmet.ox) * -contact.ny + (helmet.y - helmet.oy) * contact.nx;
    const rolling = along / STEP / HELMET_RADIUS;
    helmet.angularVelocity += (rolling - helmet.angularVelocity) * HELMET_ROLL_GRIP;
  } else helmet.angularVelocity *= HELMET_AIR_SPIN_DRAG;
  helmet.spin += helmet.angularVelocity * STEP;
  const moving =
    Math.abs(helmet.x - helmet.ox) > SLEEP_SPEED ||
    Math.abs(helmet.y - helmet.oy) > SLEEP_SPEED;
  helmet.still = moving || floating ? 0 : helmet.still + 1;
  if (helmet.still >= SLEEP_STEPS) {
    helmet.asleep = true;
    helmet.angularVelocity = 0;
  }
}

export function ragdollCenter(ragdoll) {
  let x = 0,
    y = 0;
  for (const p of ragdoll.list) {
    x += p.x;
    y += p.y;
  }
  return { x: x / ragdoll.list.length, y: y / ragdoll.list.length };
}
