// @ts-check
// The whole ride as a DOM-free simulation: bike, rider probes, spikes, apples,
// goal, falls and the ragdoll. The browser maps input into `stepRide` and
// reacts to the events it returns; Node tests and the replay bot drive it the
// same way.
import {
  STEP,
  RADIUS,
  WHEELBASE,
  TAU,
  SUSPENSION_REST_LENGTH,
  SUSPENSION_TOP_OUT_LENGTH,
  ENGINE,
  XPBD_THROTTLE_INPUT_RESPONSE,
  XPBD_THROTTLE_RELEASE_RESPONSE,
  XPBD_LEAN_INPUT_RESPONSE,
  clamp,
  lerp,
} from "./config.js";
import { createVehicle, stepVehicle } from "./vehicle-physics.js";
import {
  fallLine,
  terrainAt,
  terrainCollisionsAt,
  terrainSweepCollision,
} from "./terrain.js";
import { normalizeSpike, finishFlower } from "./trail-schema.js";
import { FRAME_REACH, bikeTouchesFlower } from "./finish.js";
import { playerTouchesApple } from "./apple.js";
import { NISSE_GROUND_LIFT, playerTouchesNisse } from "./nisse.js";
import { playerTouch } from "./player-shape.js";
import { spikeShape } from "./spike.js";
import { createRagdoll, stepRagdoll } from "./ragdoll.js";
import { atan2, cos, exp, hypot, sin } from "./det-math.js";
import { copyRideTerrain, rideTerrain, shatterGlass } from "./glass.js";
import {
  BIKE_WATER,
  CHASSIS_WATER_RADIUS,
  SPLASH_SPEED,
  WATER_WIPEOUT_DEPTH,
  applyWater,
  surfaceCrossing,
  waterAt,
  waterBodies,
  wheelImmersion,
} from "./water.js";

/** @typedef {import('./types.js').Trail} Trail */
/** @typedef {import('./types.js').RideInput} RideInput */
/** @typedef {import('./types.js').RideEvent} RideEvent */
/** @typedef {import('./types.js').Ride} Ride */

/**
 * Bump whenever a change makes old inputs replay differently, so stored
 * ghosts and replay fixtures from older physics are not trusted.
 */
export const RIDE_VERSION = 7;

/** @type {Array<[string, number, number, number]>} name, local x, local y, radius */
const RIDER_PROBES = [
  ["head", 3, -43, 6],
  ["shoulder", 1, -34, 5],
  ["hip", -7, -23, 5],
];
// Grace period after spawning before rider probes can crash the bike.
const SPAWN_GRACE = 0.2;
// A jump ends once both wheels are down, or one wheel has stayed down this
// long; brief touches (a wheel clipping a lip, a rear-wheel-first landing)
// keep counting the same rotation.
export const LANDING_SETTLE_STEPS = Math.round(0.15 / STEP);

/** Small deterministic PRNG (mulberry32) so crashes replay identically. */
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeWheel(trail, x, startY) {
  const y = startY ?? terrainAt(trail, x).y - RADIUS;
  return {
    x,
    y,
    ox: x,
    oy: y,
    inverseMass: 1,
    grounded: true,
    contact: null,
    material: terrainAt(trail, x, y).material,
    spin: 0,
    angularVelocity: 0,
    compression: 0,
    impactSpeed: 0,
  };
}

// A leg clunks when it is driven fast into the end of its stroke: deep into
// the bottoming zone on a big landing (about 100 px drops and up), or out into
// the top-out spring as a wheel unloads, in a stoppie or off a ledge. Ordinary
// landings and hops stay well short of both.
const BOTTOM_CLUNK_COMPRESSION = 13;
const BOTTOM_CLUNK_SPEED = 100;
const TOP_CLUNK_COMPRESSION = SUSPENSION_REST_LENGTH - SUSPENSION_TOP_OUT_LENGTH + 1;
const TOP_CLUNK_SPEED = 50;

/** @param {RideEvent[]} events */
function suspensionClunk(events, wheel, before, after) {
  const speed = (after - before) / STEP;
  if (before < BOTTOM_CLUNK_COMPRESSION && after >= BOTTOM_CLUNK_COMPRESSION && speed >= BOTTOM_CLUNK_SPEED)
    events.push({ type: "suspension", end: "bottom", wheel, speed });
  else if (before > TOP_CLUNK_COMPRESSION && after <= TOP_CLUNK_COMPRESSION && -speed >= TOP_CLUNK_SPEED)
    events.push({ type: "suspension", end: "top", wheel, speed: -speed });
}

/**
 * @param {Trail} trail
 * @param {{ seed?: number, start?: { x: number, y?: number | null, facing: number }, helmet?: boolean }} [options]
 *   `start` places the bike somewhere other than the trail's start, for posed scenes.
 *   `helmet: false` is a rider who wears none; it only changes how a crash
 *   looks, never the run itself.
 * @returns {Ride}
 */
export function createRide(trail, { seed = 1, start = trail.start, helmet = true } = {}) {
  const { x: startX, y: startY, facing } = start;
  const terrain = rideTerrain(trail);
  const water = waterBodies(trail);
  const placeBike = () => {
    const rear = makeWheel(trail, startX - WHEELBASE / 2, startY);
    const front = makeWheel(trail, startX + WHEELBASE / 2, startY);
    return { rear, front, vehicle: createVehicle(rear, front) };
  };
  let bike = placeBike();
  if ([bike.rear, bike.front].every((wheel) => terrainCollisionsAt(trail, wheel.x, wheel.y, RADIUS + START_GROUND_REACH).length)) {
    const settled = placeBike();
    if (settleOnStart(settled.vehicle, terrain, water, facing)) bike = settled;
  }
  const { rear, front, vehicle } = bike;
  /** @type {Ride} */
  const ride = {
    trail: terrain,
    rear,
    front,
    vehicle,
    flower: finishFlower(trail),
    apples: trail.apples.map((apple) => ({
      x: apple.x,
      y: Number.isFinite(apple.y) ? apple.y : terrainAt(trail, apple.x).y - 60,
      taken: false,
    })),
    // The optional nisse, where its feet stand: on the ground under it when
    // it has no y of its own.
    nisse: trail.nisse
      ? {
          x: trail.nisse.x,
          y: Number.isFinite(trail.nisse.y) ? trail.nisse.y : terrainAt(trail, trail.nisse.x).y - NISSE_GROUND_LIFT,
          taken: false,
        }
      : null,
    spikes: (trail.spikes || []).map((spike) =>
      normalizeSpike(spike, terrainAt(trail, Number(spike?.x) || 0)?.y ?? null),
    ),
    water,
    seed,
    helmet,
    random: seededRandom(seed),
    status: "running",
    started: false,
    // The clocks are kept as step counts and turned into seconds each step,
    // so they never drift from summing an inexact STEP.
    time: 0,
    elapsed: 0,
    elapsedSteps: 0,
    spikeTime: 0,
    collected: 0,
    steps: 0,
    facing,
    throttle: 0,
    brakePressure: 0,
    leanControl: 0,
    leanVisual: 0,
    ragdoll: null,
    crashCause: null,
    airRotation: 0,
    airTurnMilestone: 0,
    previousAirAngle: 0,
    inJump: false,
    landingSteps: 0,
    lastGateNotice: -10,
    previousRiderContacts: null,
    splits: [],
    shattered: 0,
    cracked: 0,
  };
  ride.previousRiderContacts = riderCollisionPoints(ride);
  return ride;
}

// A wheel this close to the ground counts as standing on it.
const START_GROUND_REACH = 0.5;
// How long the bike is left to settle on its start, well past the half second
// its suspension takes to come to rest under the rider.
const START_SETTLE_STEPS = Math.round(1 / STEP);

/**
 * Lets a bike standing on its start sink into its suspension before the run,
 * and then stops it dead: it starts at rest, with nothing left to bounce, so
 * waiting for it to settle gains nothing. A bike set down in the air is left
 * to drop. False, with the bike to be thrown away, when glass under it cracks
 * or breaks under its weight: that bike is set down unsettled, so the glass
 * gives way in the run.
 */
function settleOnStart(vehicle, terrain, water, facing) {
  // On a copy of the glass, which the run never sees.
  const trail = copyRideTerrain(terrain);
  const points = vehicle.bikePoints;
  const controls = {
    facing, throttle: 0, brakePressure: 0, leanControl: 0,
    accelerating: false, braking: false, coasting: true,
  };
  for (let step = 0; step < START_SETTLE_STEPS; step++) {
    if (water.length)
      for (const point of points)
        applyWater(point, point === vehicle.rear || point === vehicle.front ? RADIUS : CHASSIS_WATER_RADIUS, water, BIKE_WATER);
    stepVehicle(vehicle, trail, controls);
    // Held where it was set down, as at a start gate, so a bike on a slope
    // settles on its start rather than rolling off it. The brakes would hold
    // it too, but they pitch it onto its fork, which rises as they let go.
    let drift = 0;
    for (const point of points) drift += point.x - point.ox;
    drift /= points.length;
    for (const point of points) point.x -= drift;
  }
  if (trail.brokenBlocks?.size || trail.glassCracks?.length) return false;
  for (const point of points) {
    point.ox = point.x;
    point.oy = point.y;
  }
  for (const wheel of [vehicle.rear, vehicle.front]) {
    wheel.angularVelocity = 0;
    wheel.impactSpeed = 0;
  }
  vehicle.engine = { rev: ENGINE.idle };
  return true;
}

/**
 * Rider collision probes, anchored to the chassis: the base sits where the
 * axles would be at rest below the suspension mounts, so the rider follows
 * chassis pitch and suspension travel instead of the wheel line.
 * @param {Ride} ride
 */
export function riderCollisionPoints(ride) {
  const { rearMount, frontMount } = ride.vehicle.chassis;
  let ax = frontMount.x - rearMount.x,
    ay = frontMount.y - rearMount.y;
  const length = hypot(ax, ay) || 1;
  ax /= length;
  ay /= length;
  const downX = -ay,
    downY = ax;
  const baseX =
    (rearMount.x + frontMount.x) / 2 + downX * SUSPENSION_REST_LENGTH;
  const baseY =
    (rearMount.y + frontMount.y) / 2 + downY * SUSPENSION_REST_LENGTH;
  const shift = ride.leanVisual * 9,
    facing = ride.facing;
  /** @type {Record<string, { x: number, y: number, radius: number }>} */
  const probes = {};
  for (const [name, lx, ly, radius] of RIDER_PROBES) {
    const along = (lx + shift) * facing;
    probes[name] = {
      x: baseX + ax * along + downX * ly,
      y: baseY + ay * along + downY * ly,
      radius,
    };
  }
  return probes;
}

// A spike kills the moment the player's hitbox touches the drawn, spinning star.
function touchedSpike(spikes, time, player) {
  for (const spike of spikes) {
    const touch = playerTouch(spikeShape(spike, time), player);
    if (touch) return touch;
  }
  return null;
}

/**
 * Whether the head hits terrain on its way from `from` to `head`. Glass that
 * breaks as the head goes into it is no obstacle.
 */
function headObstacle(trail, from, head) {
  const vx = from ? head.x - from.x : 0,
    vy = from ? head.y - from.y : 0;
  for (;;) {
    const hit =
      (from &&
        terrainSweepCollision(trail, from.x, from.y, head.x, head.y, head.radius)) ||
      terrainCollisionsAt(trail, head.x, head.y, head.radius)[0];
    if (!hit) return false;
    if (!shatterGlass(trail, hit, vx, vy)) return true;
  }
}

/** A crack or shatter event for everything that happened to glass since the last call. */
function reportGlass(ride, events) {
  const { brokenBlocks: broken, glassCracks: cracks } = ride.trail;
  if (!broken) return;
  for (; ride.cracked < cracks.length; ride.cracked++) {
    const { blockId, x, y, speed } = cracks[ride.cracked];
    if (!broken.has(blockId)) events.push({ type: "crack", blockId, x, y, speed });
  }
  if (broken.size === ride.shattered) return;
  let index = 0;
  for (const [blockId, pane] of broken)
    if (index++ >= ride.shattered) events.push({ type: "shatter", blockId, ...pane });
  ride.shattered = broken.size;
}

/**
 * Where the rider goes under: a wheel deeper than the wipe-out depth, or the
 * head under the surface. Null while the rider is above water.
 */
function wipedOut(ride, head) {
  for (const wheel of [ride.rear, ride.front])
    if (wheelImmersion(ride.water, wheel.x, wheel.y, RADIUS) > WATER_WIPEOUT_DEPTH)
      return { x: wheel.x, y: waterAt(ride.water, wheel.x, wheel.y)?.y ?? wheel.y };
  const body = waterAt(ride.water, head.x, head.y);
  return body ? { x: head.x, y: body.y } : null;
}

/** A splash for the fastest of these points to break the surface this step. */
function splash(ride, points, rider, events) {
  let best = null;
  for (const point of points) {
    if (point.px === undefined) continue;
    const body = surfaceCrossing(ride.water, point.px, point.py, point.x, point.y);
    const speed = (point.y - point.py) / STEP;
    if (body && speed > SPLASH_SPEED && (!best || speed > best.speed))
      best = { x: point.x, y: body.y, speed };
  }
  if (best) events.push({ type: "splash", ...best, rider });
}

function crash(ride, cause, x, y, events) {
  // Capture the rider's lean before changing the crash state.
  const visual = {
    leanVisual: ride.leanVisual ?? 0,
    helmet: ride.helmet !== false,
  };

  const ragdoll = createRagdoll(
    ride.rear,
    ride.front,
    ride.facing,
    ride.random,
    visual,
  );
  // The drawn rider reaches a little past the crash probes, more so with the
  // springs stretched, so a rider thrown as the head touches down can start
  // partly in the ground. Lift the whole body clear, keeping its shape and
  // velocity, or the first ragdoll step would count the overlap as a hit.
  for (let pass = 0; pass < 3; pass++) {
    let liftX = 0,
      liftY = 0,
      deepest = 0;
    for (const point of ragdoll.list) {
      for (const contact of terrainCollisionsAt(ride.trail, point.x, point.y, point.radius)) {
        if (contact.penetration <= deepest) continue;
        deepest = contact.penetration;
        liftX = contact.nx * deepest;
        liftY = contact.ny * deepest;
      }
    }
    if (deepest <= 0) break;
    for (const point of ragdoll.list) {
      point.x += liftX;
      point.y += liftY;
      point.ox += liftX;
      point.oy += liftY;
    }
  }

  ride.status = "crashed";
  ride.crashCause = cause;
  ride.ragdoll = ragdoll;

  events.push({ type: "crash", cause, x, y });
}

function bikeMidpoint(ride) {
  return {
    x: (ride.rear.x + ride.front.x) / 2,
    y: (ride.rear.y + ride.front.y) / 2,
  };
}

export function bikeSpeed(ride) {
  const { rear, front } = ride;
  return (rear.x - rear.ox + (front.x - front.ox)) / (2 * STEP);
}

export function trackAirRotation(ride, events) {
  const { rear, front } = ride;
  const airborne = !rear.grounded && !front.grounded;
  const bikeAngle = atan2(front.y - rear.y, front.x - rear.x);
  if (!ride.inJump) {
    if (airborne) {
      ride.inJump = true;
      ride.airRotation = 0;
      ride.airTurnMilestone = 0;
      ride.landingSteps = 0;
    }
  } else {
    ride.airRotation += atan2(
      sin(bikeAngle - ride.previousAirAngle),
      cos(bikeAngle - ride.previousAirAngle),
    );
    const milestone = Math.floor(Math.abs(ride.airRotation) / Math.PI);
    if (milestone > ride.airTurnMilestone) {
      ride.airTurnMilestone = milestone;
      if (ride.status === "running")
        events.push({ type: "airTurn", full: milestone % 2 === 0 });
    }
    ride.landingSteps = airborne ? 0 : ride.landingSteps + 1;
    if (
      (rear.grounded && front.grounded) ||
      ride.landingSteps >= LANDING_SETTLE_STEPS
    ) {
      // Landing upright already lines the bike up with the ground, so the
      // rotation is whole turns plus the slope change between takeoff and
      // landing: round to the nearest turn rather than demanding a full 360°.
      const flips = Math.round(Math.abs(ride.airRotation) / TAU);
      if (flips > 0 && ride.status === "running")
        events.push({
          type: "flip",
          count: flips,
          direction: Math.sign(ride.airRotation),
        });
      ride.inJump = false;
      ride.airRotation = 0;
      ride.airTurnMilestone = 0;
      ride.landingSteps = 0;
    }
  }
  ride.previousAirAngle = bikeAngle;
}

/**
 * Advances the ride by one fixed step.
 * @param {Ride} ride
 * @param {RideInput} [input]
 * @param {object} [hooks] physics-debug hooks passed to `stepVehicle`
 * @returns {RideEvent[]}
 */
export function stepRide(ride, input = {}, hooks = {}) {
  /** @type {RideEvent[]} */
  const events = [];
  if (ride.status === "won") return events;
  if (ride.trail.brokenBlocks) ride.trail.glassClock = ride.steps;
  advanceRide(ride, input, hooks, events);
  reportGlass(ride, events);
  return events;
}

// A bike settled on its start stays well under this: it trembles at about
// 0.00003 units/s, and creeps down a gentle slope at about a tenth of a unit
// a second. One rolling away or dropping off its start passes it within a
// step or two.
const MOVING_AWAY_SPEED = 1;

/** Whether the bike has moved off its start by itself, rolling or falling. */
function movingAway(ride) {
  const { rear, front } = ride;
  const vx = (rear.x - rear.ox + (front.x - front.ox)) / (2 * STEP);
  const vy = (rear.y - rear.oy + (front.y - front.oy)) / (2 * STEP);
  return vx * vx + vy * vy > MOVING_AWAY_SPEED * MOVING_AWAY_SPEED;
}

/**
 * @param {Ride} ride
 * @param {RideInput} input
 * @param {object} hooks
 * @param {RideEvent[]} events
 */
function advanceRide(ride, input, hooks, events) {
  const { trail, rear, front } = ride;
  const running = ride.status === "running";
  if (Number(input.facing)) ride.facing = input.facing < 0 ? -1 : 1;
  const leanInput = running ? clamp(Number(input.leanInput) || 0, -1, 1) : 0;
  const accelerating = running && Boolean(input.accelerating);
  const braking = running && Boolean(input.braking);
  // The clock starts on any input, lean included: rocking the rider back and
  // forth moves the bike, so a free lean would be a free head start.
  if (running && !ride.started && (accelerating || braking || leanInput)) {
    ride.started = true;
    events.push({ type: "start" });
  }
  for (const point of ride.vehicle.bikePoints) {
    point.px = point.x;
    point.py = point.y;
  }
  for (const wheel of [ride.vehicle.rear, ride.vehicle.front])
    wheel.pcompression = wheel.compression;
  if (ride.ragdoll)
    for (const point of ragdollPoints(ride.ragdoll)) {
      point.px = point.x;
      point.py = point.y;
    }
  ride.steps++;
  ride.time = ride.steps * STEP;
  ride.spikeTime = ride.time;
  if (running && ride.started) ride.elapsed = ++ride.elapsedSteps * STEP;

  ride.leanControl = lerp(
    ride.leanControl,
    leanInput,
    1 - exp(-XPBD_LEAN_INPUT_RESPONSE * STEP),
  );
  const coasting = !accelerating && !braking;
  // The throttle opens while braking too. The rider has the clutch in then,
  // so the engine revs against the brakes, and letting them go drops the
  // clutch at high revs for a harder launch or pop.
  const throttleTarget = accelerating ? 1 : 0;
  const throttleRate =
    throttleTarget > ride.throttle
      ? XPBD_THROTTLE_INPUT_RESPONSE
      : XPBD_THROTTLE_RELEASE_RESPONSE;
  ride.throttle = lerp(
    ride.throttle,
    throttleTarget,
    1 - exp(-throttleRate * STEP),
  );
  ride.brakePressure = lerp(
    ride.brakePressure,
    braking ? 1 : 0,
    1 - exp(-(braking ? 10 : 14) * STEP),
  );

  const wasRearGrounded = rear.grounded,
    wasFrontGrounded = front.grounded;
  const rearCompressionBefore = rear.compression,
    frontCompressionBefore = front.compression;
  rear.impactSpeed = 0;
  front.impactSpeed = 0;
  if (ride.water.length)
    for (const point of ride.vehicle.bikePoints)
      applyWater(
        point,
        point === rear || point === front ? RADIUS : CHASSIS_WATER_RADIUS,
        ride.water,
        BIKE_WATER,
      );
  stepVehicle(
    ride.vehicle,
    trail,
    {
      facing: ride.facing,
      throttle: ride.throttle,
      brakePressure: ride.brakePressure,
      leanControl: ride.leanControl,
      accelerating,
      braking,
      coasting,
      crashed: !running,
    },
    hooks,
  );
  trackAirRotation(ride, events);
  // A bike that moves off by itself, rolling down a steep slope or dropping
  // from a start in the air, starts it too, timed from the step it moved in.
  if (running && !ride.started && movingAway(ride)) {
    ride.started = true;
    events.push({ type: "start" });
    ride.elapsed = ++ride.elapsedSteps * STEP;
  }

  const landingImpact = Math.max(
    !wasRearGrounded && rear.grounded ? rear.impactSpeed : 0,
    !wasFrontGrounded && front.grounded ? front.impactSpeed : 0,
  );
  if (landingImpact > 0) events.push({ type: "land", impact: landingImpact });
  if (running) {
    suspensionClunk(events, "rear", rearCompressionBefore, rear.compression);
    suspensionClunk(events, "front", frontCompressionBefore, front.compression);
  }
  if (ride.water.length) splash(ride, [rear, front], false, events);

  if (!running) {
    const knock = stepRagdoll(ride.ragdoll, trail, ride.water, ride.vehicle);
    if (knock) events.push({ type: "helmet", ...knock });
    if (ride.water.length)
      splash(ride, ragdollPoints(ride.ragdoll), true, events);
    return events;
  }

  const riderContacts = riderCollisionPoints(ride);
  const { head } = riderContacts;
  const { x: mx, y: my } = bikeMidpoint(ride);
  // Only the head crashes on terrain; the body may brush corners that poke
  // between the wheels. Spikes still hurt the whole rider below.
  const previousRiderContacts = ride.previousRiderContacts;
  const riderObstacle = headObstacle(trail, previousRiderContacts?.head, head);
  ride.previousRiderContacts = riderContacts;
  const bikeContacts = { rear, front, probes: Object.values(riderContacts) };
  const player = { ...bikeContacts, frameReach: FRAME_REACH };
  const spikeHit = touchedSpike(ride.spikes, ride.spikeTime, player);
  if (spikeHit) {
    crash(ride, "spike", spikeHit.x, spikeHit.y, events);
    return events;
  }
  const underwater = ride.water.length ? wipedOut(ride, head) : null;
  if (underwater) {
    // The rider goes under as the bike stalls, so the wipe-out is the splash.
    const speed = hypot(rear.x - rear.ox, rear.y - rear.oy) / STEP;
    events.push({ type: "splash", ...underwater, speed: Math.max(speed, SPLASH_SPEED), rider: true });
    crash(ride, "water", underwater.x, underwater.y, events);
    return events;
  }
  if (riderObstacle && ride.time > SPAWN_GRACE) {
    crash(ride, "head", head.x, head.y, events);
    return events;
  }
  if (my > fallLine(trail)) {
    crash(ride, "fall", head.x, head.y, events);
    return events;
  }

  // Like Elasto Mania, any touch of the player's hitbox takes an apple, even
  // just the edge of a wheel.
  for (const apple of ride.apples) {
    if (!apple.taken && playerTouchesApple(apple, player)) {
      apple.taken = true;
      ride.collected++;
      ride.splits.push(ride.elapsed);
      events.push({
        type: "apple",
        apple,
        collected: ride.collected,
        total: ride.apples.length,
        split: ride.elapsed,
      });
    }
  }

  // The nisse is taken the same way, but it is optional: it never counts
  // towards the apples or the finish.
  const nisse = ride.nisse;
  if (nisse && !nisse.taken && playerTouchesNisse(nisse, player)) {
    nisse.taken = true;
    events.push({ type: "nisse", x: nisse.x, y: nisse.y });
  }

  // The finish is a flower: the bike has to touch it, from either side.
  if (bikeTouchesFlower(ride.flower, bikeContacts)) {
    if (ride.collected === ride.apples.length) {
      ride.status = "won";
      // The bike reached the flower somewhere within this step. Timing the
      // run to that moment, rather than to the step's end, keeps close runs
      // from tying on whole steps.
      if (ride.started)
        ride.elapsed = (ride.elapsedSteps - 1 + touchFraction(ride.flower, bikeContacts, previousRiderContacts)) * STEP;
      events.push({ type: "win", time: ride.elapsed, x: mx, y: my });
    } else if (ride.time - ride.lastGateNotice > 5) {
      ride.lastGateNotice = ride.time;
      events.push({
        type: "goalLocked",
        missing: ride.apples.length - ride.collected,
      });
    }
  }

  // Input is in screen direction; the rider pose leans relative to facing.
  ride.leanVisual = lerp(
    ride.leanVisual,
    leanInput * ride.facing,
    1 - exp(-7 * STEP),
  );
  return events;
}

// Halvings of the step that find when the bike reached the flower: ten time
// it to under a hundredth of a millisecond.
const TOUCH_BISECTIONS = 10;

/**
 * How far through the latest step (0 … 1) the bike first touched the flower,
 * with every part of it moving in a straight line over the step. A bike that
 * was touching it already, when the last apple opens it, finishes at the
 * step's end.
 */
function touchFraction(flower, bike, previousProbes) {
  const before = previousProbes ? Object.values(previousProbes) : bike.probes;
  const at = (amount) => {
    const wheel = (point) => ({ px: point.px, py: point.py, x: point.px + (point.x - point.px) * amount, y: point.py + (point.y - point.py) * amount });
    return {
      rear: wheel(bike.rear),
      front: wheel(bike.front),
      probes: bike.probes.map((probe, index) => ({
        x: before[index].x + (probe.x - before[index].x) * amount,
        y: before[index].y + (probe.y - before[index].y) * amount,
        radius: probe.radius,
      })),
    };
  };
  if (bikeTouchesFlower(flower, at(0))) return 1;
  let low = 0, high = 1;
  for (let halving = 0; halving < TOUCH_BISECTIONS; halving++) {
    const middle = (low + high) / 2;
    if (bikeTouchesFlower(flower, at(middle))) high = middle;
    else low = middle;
  }
  return high;
}

/** The thrown rider's joints, and the helmet once it has come off. */
function ragdollPoints(ragdoll) {
  return ragdoll.helmet ? [...ragdoll.list, ragdoll.helmet] : ragdoll.list;
}

/** All simulated points. */
export function ridePoints(ride) {
  const points = ride.vehicle.bikePoints.slice();
  if (ride.ragdoll) points.push(...ragdollPoints(ride.ragdoll));
  return points;
}

/**
 * Moves every point `alpha` of the way from its position before the latest
 * step to its current one, for drawing between fixed steps. Call the
 * returned function to put the simulation state back.
 * @param {Ride} ride
 * @param {number} alpha 0 … 1
 */
export function interpolateRide(ride, alpha) {
  const points = ridePoints(ride);
  const saved = new Float64Array(points.length * 3);
  const wheels = [ride.vehicle.rear, ride.vehicle.front];
  const compressions = wheels.map((wheel) => wheel.compression);
  if (alpha < 1)
    for (const wheel of wheels)
      if (wheel.pcompression !== undefined)
        wheel.compression = wheel.pcompression + (wheel.compression - wheel.pcompression) * alpha;
  points.forEach((point, index) => {
    saved[index * 3] = point.x;
    saved[index * 3 + 1] = point.y;
    saved[index * 3 + 2] = point.spin ?? NaN;
    if (alpha < 1 && point.px !== undefined) {
      point.x = point.px + (point.x - point.px) * alpha;
      point.y = point.py + (point.y - point.py) * alpha;
    }
    // Wheels turn by their spin each step; wind it back to match.
    if (alpha < 1 && point.spin !== undefined)
      point.spin -= (point.angularVelocity || 0) * STEP * (1 - alpha);
  });
  return () => {
    points.forEach((point, index) => {
      point.x = saved[index * 3];
      point.y = saved[index * 3 + 1];
      if (point.spin !== undefined) point.spin = saved[index * 3 + 2];
    });
    wheels.forEach((wheel, index) => (wheel.compression = compressions[index]));
  };
}

/**
 * Runs recorded inputs to completion and reports the outcome.
 * @param {Trail} trail
 * @param {RideInput[]} inputs
 */
export function simulateRun(trail, inputs, { seed = 1, settleSteps = 0 } = {}) {
  const ride = createRide(trail, { seed });
  const events = [];
  let maxSpeed = 0,
    finite = true;
  for (const input of inputs) {
    for (const event of stepRide(ride, input))
      events.push({ ...event, step: ride.steps });
    maxSpeed = Math.max(maxSpeed, Math.abs(bikeSpeed(ride)));
    if (
      !Number.isFinite(ride.rear.x + ride.rear.y + ride.front.x + ride.front.y)
    ) {
      finite = false;
      break;
    }
    if (ride.status !== "running") break;
  }
  for (let step = 0; step < settleSteps && ride.status === "crashed"; step++)
    stepRide(ride, {});
  return { ride, events, maxSpeed, finite };
}
