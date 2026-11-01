import {
  STEP,
  RADIUS,
  WHEELBASE,
  GRAVITY,
  MAX_POINT_SPEED,
  BIKE_SOLVER_ITERATIONS,
  BIKE_VELOCITY_ITERATIONS,
  XPBD_CHASSIS_COMPLIANCE,
  XPBD_CHASSIS_AREA_COMPLIANCE,
  XPBD_SUSPENSION_EXTENSION_COMPLIANCE,
  XPBD_SUSPENSION_SLIDER_COMPLIANCE,
  SUSPENSION_REST_LENGTH,
  SUSPENSION_TRAVEL,
  SUSPENSION_TOP_OUT_LENGTH,
  XPBD_SUSPENSION_TOP_OUT_COMPLIANCE,
  FORK_SUSPENSION,
  SHOCK_SUSPENSION,
  SUSPENSION_FLIP_TIME,
  WHEEL_INERTIA,
  WHEEL_SPIN_DRAG,
  WHEEL_FRICTION,
  WHEEL_SLIDE_FRICTION,
  WHEEL_DRIVE_SLIP,
  XPBD_CHASSIS_MOUNT_INVERSE_MASS,
  XPBD_CHASSIS_TOP_INVERSE_MASS,
  XPBD_MOTOR_ANGULAR_ACCELERATION,
  XPBD_TORQUE_FALLOFF_SPEED,
  ENGINE,
  XPBD_MOTOR_REACTION_SCALE,
  XPBD_RIDER_GROUND_ANGULAR_ACCELERATION,
  XPBD_RIDER_AIR_ANGULAR_ACCELERATION,
  XPBD_RIDER_LEVERAGE_FADE_START,
  XPBD_RIDER_LEVERAGE_FADE_END,
  XPBD_RIDER_MAX_AIR_SPIN,
  XPBD_RIDER_AIR_SPIN_RESPONSE,
  XPBD_RIDER_MAX_GROUND_SPIN,
  XPBD_TOUCHDOWN_SPIN_THRESHOLD,
  XPBD_TOUCHDOWN_SPIN_ABSORPTION,
  XPBD_THROTTLE_LEAN_ASSIST,
  XPBD_THROTTLE_INPUT_RESPONSE,
  XPBD_THROTTLE_RELEASE_RESPONSE,
  XPBD_LEAN_INPUT_RESPONSE,
  XPBD_UPHILL_FORWARD_LEAN_REDUCTION,
  XPBD_UPHILL_FORWARD_LEAN_FULL_TILT,
  XPBD_UPHILL_FORWARD_LEAN_SPEED,
  XPBD_BRAKE_TORQUE,
  XPBD_COAST_RESISTANCE_LOW_SPEED,
  XPBD_COAST_RESISTANCE_HIGH_SPEED,
  XPBD_COAST_SPEED_REFERENCE,
  XPBD_CONTACT_RESTITUTION_SCALE,
  CONTACT_GROUNDED_NORMAL,
  CONTACT_RESTITUTION_SPEED,
  clamp,
  lerp,
} from "./config.js";
import {
  createDistanceConstraint,
  createAreaConstraint,
  createSliderConstraint,
  createLegConstraint,
  legOffset,
  dampLegConstraint,
  signedTriangleArea,
  resetConstraintMultiplier,
  solveXpbdConstraint,
  dampingPerIteration,
  dampDistanceConstraint,
  riderTorqueMultiplier,
  riderTerrainTorqueScale,
  riderTiltTorqueScale,
  riderSpinTorqueScale,
  advanceAfterTimeOfImpact,
  solveWheelContactVelocity,
} from "./physics.js";
import {
  terrainAt,
  terrainCollisionsAt,
  terrainSweepCollision,
} from "./terrain.js";
import { passThroughGlass, shatterGlass } from "./glass.js";
import { atan2, cos, exp, hypot, pow, sin } from "./det-math.js";

const distance = (a, b) => hypot(a.x - b.x, a.y - b.y);
const CRASHED_CHASSIS_CONTACT = { bounce: 0.1, friction: 0.35 };
const CHASSIS_TOP_HEIGHT = 22;
// chassis.top is a mass point floating well above the drawn seat and bars, so
// a crashed bike collides through probes on the drawn outline instead. Each is
// [offset along the mounts, height above the mount line]; the mount line sits
// SUSPENSION_REST_LENGTH above the axles, and the seat and bars ~27 above.
const CRASHED_FRAME_PROBES = [
  [-20, 6],
  [0, 7],
  [20, 6],
];
const CRASHED_FRAME_PROBE_RADIUS = 3;

// A wheel's suspension, measured along the line the wheel travels on: the
// spring with its damper, a firmer top-out spring over the last of the
// stretch, a slider holding the wheel on its line, and the stroke limits.
// fitSuspension() aims them each step.
function suspensionLeg(wheel, mount, { rearMount, frontMount }) {
  const leg = options => createLegConstraint(wheel, mount, rearMount, frontMount, options);
  return {
    wheel,
    spring: leg({ extensionCompliance: XPBD_SUSPENSION_EXTENSION_COMPLIANCE }),
    topOut: leg({
      compliance: XPBD_SUSPENSION_TOP_OUT_COMPLIANCE,
      upper: SUSPENSION_TOP_OUT_LENGTH - SUSPENSION_REST_LENGTH,
    }),
    slider: createSliderConstraint(wheel, mount, rearMount, frontMount, {
      compliance: XPBD_SUSPENSION_SLIDER_COMPLIANCE,
    }),
    // A half-plane rather than a circle round the mount, so on a hard hit the
    // wheel cannot slip round it and come out above the frame.
    limit: leg({ lower: -SUSPENSION_TRAVEL, upper: SUSPENSION_TRAVEL }),
  };
}

// The fork goes on the leading wheel and the shock on the trailing one,
// whichever way the rider faces. Each wheel travels on a line through its
// resting place, square below its mount, tilted `rake` toward the rider: the
// fork wheel moves up and back along the fork as it compresses.
function fitSuspension({ suspension, chassis }, facing) {
  const axisX = chassis.frontMount.x - chassis.rearMount.x,
    axisY = chassis.frontMount.y - chassis.rearMount.y;
  // +1 while the frame's axis normal (-axisY, axisX) points away from the top.
  const down =
    (chassis.top.x - chassis.rearMount.x) * -axisY +
      (chassis.top.y - chassis.rearMount.y) * axisX >
    0
      ? -1
      : 1;
  for (const leg of suspension) {
    const { wheel, spring, topOut, slider, limit } = leg;
    const leading = (wheel === suspension[1].wheel) === facing > 0;
    const settings = leading ? FORK_SUSPENSION : SHOCK_SUSPENSION;
    spring.settings = settings;
    spring.damping = settings.damping;
    spring.reboundDamping = settings.reboundDamping;
    // On a flip the fork's raked line becomes the shock's square one and
    // back. Turned in one step, a compressed wheel would sit a few px off its
    // new line and the slider would snap it there, so the line turns over
    // SUSPENSION_FLIP_TIME instead.
    const rake = settings.rake * facing;
    const turn = (FORK_SUSPENSION.rake * STEP) / SUSPENSION_FLIP_TIME;
    leg.rake =
      leg.rake === undefined ? rake : clamp(rake, leg.rake - turn, leg.rake + turn);
    const square = cos(leg.rake),
      lean = sin(leg.rake);
    for (const leg of [spring, topOut, limit]) {
      leg.along = lean;
      leg.across = down * square;
      leg.rest = SUSPENSION_REST_LENGTH * square;
    }
    slider.along = square;
    slider.across = -down * lean;
    slider.target = -SUSPENSION_REST_LENGTH * lean;
  }
}

// How far the leg is compressed along its line (negative when stretched).
function legTravel(leg) {
  return leg.rest - legOffset(leg);
}

// The suspension's length along its line: SUSPENSION_REST_LENGTH at rest.
function legLength({ spring }) {
  return SUSPENSION_REST_LENGTH - legTravel(spring);
}

// Share of the way from `start` px of compression to full travel.
function travelShare(compression, start) {
  return clamp(
    (compression - start) / (SUSPENSION_TRAVEL - start),
    0,
    1,
  );
}

// A rising-rate spring: stiffness climbs from its base past risingRateStart
// to 1 + risingRateGain times it at full travel. Set once per step from the
// predicted travel, so the XPBD solve sees a constant compliance.
function updateRisingRate(spring) {
  const { compliance, risingRateStart, risingRateGain, risingRatePower } =
    spring.settings;
  const share = travelShare(legTravel(spring), risingRateStart);
  spring.compliance =
    compliance / (1 + risingRateGain * pow(share, risingRatePower));
}

// Compression damping at the spring's travel: the base value above
// bottomingStart, rising with the square of the way through the bottoming
// zone to bottomingDamping at full travel.
function compressionDamping(spring) {
  const { settings } = spring;
  if (!settings) return spring.damping;
  const depth = travelShare(legTravel(spring), settings.bottomingStart);
  return lerp(spring.damping, settings.bottomingDamping, depth * depth);
}

export function createVehicle(rear, front) {
  const mountY = (rear.y + front.y) / 2 - SUSPENSION_REST_LENGTH;
  const makePoint = (x, y, inverseMass) => ({
    x,
    y,
    ox: x,
    oy: y,
    inverseMass,
    grounded: false,
    contact: null,
    radius: 4,
  });
  const chassis = {
    rearMount: makePoint(rear.x, mountY, XPBD_CHASSIS_MOUNT_INVERSE_MASS),
    frontMount: makePoint(front.x, mountY, XPBD_CHASSIS_MOUNT_INVERSE_MASS),
    top: makePoint(
      (rear.x + front.x) / 2,
      mountY - CHASSIS_TOP_HEIGHT,
      XPBD_CHASSIS_TOP_INVERSE_MASS,
    ),
  };
  const rearLeg = suspensionLeg(rear, chassis.rearMount, chassis);
  const frontLeg = suspensionLeg(front, chassis.frontMount, chassis);
  // As in Elasto Mania, nothing ties the wheels to each other: each hangs from
  // the chassis on its own leg, so the wheelbase gives a little on hard hits.
  const constraints = [
    createDistanceConstraint(chassis.rearMount, chassis.frontMount, WHEELBASE, {
      compliance: XPBD_CHASSIS_COMPLIANCE,
      damping: 1,
    }),
    createDistanceConstraint(
      chassis.rearMount,
      chassis.top,
      hypot(WHEELBASE / 2, 22),
      { compliance: XPBD_CHASSIS_COMPLIANCE, damping: 1 },
    ),
    createDistanceConstraint(
      chassis.frontMount,
      chassis.top,
      hypot(WHEELBASE / 2, 22),
      { compliance: XPBD_CHASSIS_COMPLIANCE, damping: 1 },
    ),
    createAreaConstraint(chassis.rearMount, chassis.frontMount, chassis.top, {
      compliance: XPBD_CHASSIS_AREA_COMPLIANCE,
    }),
    rearLeg.spring,
    frontLeg.spring,
    rearLeg.topOut,
    frontLeg.topOut,
    rearLeg.slider,
    frontLeg.slider,
    // Limits run after the compliant links so every solver iteration ends in a
    // valid travel range rather than allowing a later slider to violate it.
    rearLeg.limit,
    frontLeg.limit,
  ];
  const chassisPoints = [chassis.rearMount, chassis.frontMount, chassis.top];
  // The physical pieces between the points: suspension legs and frame edges.
  const frameLinks = [
    [rear, chassis.rearMount],
    [front, chassis.frontMount],
    [chassis.rearMount, chassis.frontMount],
    [chassis.rearMount, chassis.top],
    [chassis.frontMount, chassis.top],
  ];
  const crashedFrameProbes = CRASHED_FRAME_PROBES.map(([along, height]) =>
    createFrameProbe(chassisPoints, along, height),
  );
  const bikePoints = [rear, front, ...chassisPoints];
  const vehicle = {
    rear,
    front,
    chassis,
    constraints,
    chassisPoints,
    crashedFrameProbes,
    frameLinks,
    bikePoints,
    dampedConstraints: constraints,
    suspension: [rearLeg, frontLeg],
    wheelOrder: {
      forward: [
        [rear, "rear"],
        [front, "front"],
      ],
      backward: [
        [front, "front"],
        [rear, "rear"],
      ],
    },
    riderAccelerations: new Float64Array(bikePoints.length * 2),
    reactionAccelerations: new Float64Array(bikePoints.length * 2),
    traction: { options: {} },
    engine: { rev: ENGINE.idle },
  };
  fitSuspension(vehicle, 1);
  return vehicle;
}

function integratePoint(point, accelerationX = 0, accelerationY = GRAVITY) {
  let vx = (point.x - point.ox) * 0.9998;
  let vy = (point.y - point.oy) * 0.9998;
  const speed = hypot(vx, vy);
  if (speed > MAX_POINT_SPEED * STEP) {
    vx *= (MAX_POINT_SPEED * STEP) / speed;
    vy *= (MAX_POINT_SPEED * STEP) / speed;
  }
  point.ox = point.x;
  point.oy = point.y;
  point.x += vx + accelerationX * STEP * STEP;
  point.y += vy + accelerationY * STEP * STEP;
  point.grounded = false;
  point.contact = null;
  point.groundLoad = 0;
}

function centerOfMass(points) {
  let mass = 0,
    x = 0,
    y = 0;
  for (const point of points) {
    const pointMass = 1 / point.inverseMass;
    mass += pointMass;
    x += point.x * pointMass;
    y += point.y * pointMass;
  }
  return { x: x / mass, y: y / mass, mass };
}

// Writes interleaved [ax, ay] pairs, one per point, into `out`.
function angularAccelerations(points, angularAcceleration, out) {
  const center = centerOfMass(points);
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    out[index * 2] = -(point.y - center.y) * angularAcceleration;
    out[index * 2 + 1] = (point.x - center.x) * angularAcceleration;
  }
  return out;
}

// Rider lean is a weight shift, so it can tip the bike around a wheel that is
// on the ground but cannot pull that wheel off it. With one wheel down, the
// part of the spin that would lift that wheel off its contact is removed from
// every point; motion along the ground is left alone. Rear and front are the
// first two entries of `accelerations`.
// Removing that part pushes the whole bike into the ground, which a weight
// shift cannot do. The ground's answer to the push is recorded in `pinLoad`
// so tire grip can leave it out.
function keepPivotPlanted(accelerations, rear, front, mass) {
  rear.pinLoad = 0;
  front.pinLoad = 0;
  if (rear.grounded === front.grounded) return;
  const pivot = rear.grounded ? rear : front;
  if (!pivot.contact) return;
  const { nx, ny } = pivot.contact;
  const pivotIndex = pivot === rear ? 0 : 2;
  const lift =
    accelerations[pivotIndex] * nx + accelerations[pivotIndex + 1] * ny;
  if (lift <= 0) return;
  for (let index = 0; index < accelerations.length; index += 2) {
    accelerations[index] -= lift * nx;
    accelerations[index + 1] -= lift * ny;
  }
  pivot.pinLoad = lift * STEP * mass;
}

// `state` is the per-vehicle scratch filled once per step by stepVehicle.
function applyWheelTraction(point, name, drive, state, hooks) {
  if (!point.contact) return;
  const {
    drivenWheel,
    angularDrive,
    braking,
    brakePressure,
    coasting,
    throttle,
    options,
  } = state;
  const impactSpeed = Math.max(
    0,
    -(
      (point.x - point.ox) * point.contact.nx +
      (point.y - point.oy) * point.contact.ny
    ) / STEP,
  );
  const restitution =
    drive && impactSpeed > CONTACT_RESTITUTION_SPEED
      ? clamp(0.08 + impactSpeed / 1200, 0.08, 0.22) *
        XPBD_CONTACT_RESTITUTION_SCALE
      : 0;
  const pointVx = (point.x - point.ox) / STEP,
    pointVy = (point.y - point.oy) / STEP;
  const tx = -point.contact.ny,
    ty = point.contact.nx;
  const contactSpeed = pointVx * tx + pointVy * ty;
  const coastResistance =
    lerp(
      XPBD_COAST_RESISTANCE_LOW_SPEED,
      XPBD_COAST_RESISTANCE_HIGH_SPEED,
      clamp(Math.abs(contactSpeed) / XPBD_COAST_SPEED_REFERENCE, 0, 1),
    ) * (contactSpeed * point.contact.slope < 0 ? 0.18 : 1);
  options.dt = STEP;
  options.radius = RADIUS;
  options.restitution = restitution;
  options.friction = WHEEL_FRICTION;
  options.kineticFriction = WHEEL_SLIDE_FRICTION;
  options.maxDriveSlip = WHEEL_DRIVE_SLIP;
  options.angularDrive = drive && point === drivenWheel ? angularDrive : 0;
  options.angularBrake =
    drive && braking ? XPBD_BRAKE_TORQUE * brakePressure : 0;
  options.inertia = WHEEL_INERTIA;
  options.normalLoad = Math.max(
    0,
    (point.groundLoad || 0) - (point.pinLoad || 0),
  );
  options.freeRolling =
    drive && !braking && (point !== drivenWheel || throttle < 0.01);
  options.rollingResistance = drive && coasting ? coastResistance : 0;
  options.appliedImpulse = drive ? 0 : point.tractionImpulse || 0;
  // The drive pass turns the drawn wheel; the match-up pass only corrects it.
  options.advanceSpin = drive;
  const result = solveWheelContactVelocity(point, point.contact, options);
  state.brakeSpin += result.brakeSpin || 0;
  point.tractionImpulse = drive ? result.tangentImpulse : 0;
  point.brakeHold = result.held ? result.frictionLimit * STEP : 0;
  point.angularVelocity = clamp(
    point.angularVelocity,
    -MAX_POINT_SPEED / RADIUS,
    MAX_POINT_SPEED / RADIUS,
  );
  if (drive) hooks.traction?.(name, result, point);
}

function momentOfInertia(points) {
  const center = centerOfMass(points);
  return (
    points.reduce((sum, point) => {
      const dx = point.x - center.x,
        dy = point.y - center.y;
      return sum + (dx * dx + dy * dy) / point.inverseMass;
    }, 0) || 1
  );
}

function angularMomentum(points) {
  const center = centerOfMass(points);
  let momentum = 0;
  for (const point of points) {
    const vx = (point.x - point.ox) / STEP,
      vy = (point.y - point.oy) / STEP;
    momentum +=
      ((point.x - center.x) * vy - (point.y - center.y) * vx) /
      point.inverseMass;
  }
  return momentum;
}

// Rigid-body spin in rad/s, positive in the same sense as angularAccelerations.
function angularVelocity(points, inertia) {
  return angularMomentum(points) / inertia;
}

// Adds a pure rotation about the centre of mass; forward speed is kept.
function addSpin(points, spin) {
  const center = centerOfMass(points);
  const turn = spin * STEP;
  for (const point of points) {
    point.ox -= -(point.y - center.y) * turn;
    point.oy -= (point.x - center.x) * turn;
  }
}

// Only wheels touch the terrain, so a fast-spinning bike that lands on one
// wheel pivots around it and is thrown back up. The rider soaks up spin beyond
// the threshold instead; this is a pure rotation, so forward speed is kept.
function absorbTouchdownSpin(points, inertia) {
  const spin = angularVelocity(points, inertia);
  const excess =
    Math.sign(spin) *
    Math.max(0, Math.abs(spin) - XPBD_TOUCHDOWN_SPIN_THRESHOLD);
  if (!excess) return;
  addSpin(points, -excess * XPBD_TOUCHDOWN_SPIN_ABSORPTION);
}

function chassisUp(chassis) {
  const baseX = (chassis.rearMount.x + chassis.frontMount.x) / 2;
  const baseY = (chassis.rearMount.y + chassis.frontMount.y) / 2;
  const length = hypot(chassis.top.x - baseX, chassis.top.y - baseY) || 1;
  return {
    x: (chassis.top.x - baseX) / length,
    y: (chassis.top.y - baseY) / length,
  };
}

// Signed chassis tilt from the ground normal, positive when the nose is raised.
function noseUpTilt({ rear, front, chassis }, facing) {
  const contact = rear.contact || front.contact;
  if (!contact) return 0;
  const up = chassisUp(chassis);
  return (
    atan2(
      up.x * contact.ny - up.y * contact.nx,
      up.x * contact.nx + up.y * contact.ny,
    ) * facing
  );
}

// A bike hooked by one wheel over a ledge hangs below it like a pendulum. The
// rider's weight swings it freely there, as in Elasto Mania; the limits below
// are for a bike balanced above its wheel.
export function hangsBelowWheel({ rear, front, bikePoints }) {
  if (rear.grounded === front.grounded) return false;
  const pivot = rear.grounded ? rear : front;
  if (!pivot.contact) return false;
  const center = centerOfMass(bikePoints);
  return (
    (center.x - pivot.x) * pivot.contact.nx +
      (center.y - pivot.y) * pivot.contact.ny <
    0
  );
}

function riderGroundLeverage(vehicle) {
  const { rear, front, chassis } = vehicle;
  const contact = rear.contact || front.contact;
  if (!contact || hangsBelowWheel(vehicle)) return 1;
  const up = chassisUp(chassis);
  return riderTiltTorqueScale(
    up.x,
    up.y,
    contact.nx,
    contact.ny,
    XPBD_RIDER_LEVERAGE_FADE_START,
    XPBD_RIDER_LEVERAGE_FADE_END,
  );
}

// Leaning forward shifts the rider's weight along the bike, and only the
// trail part of that shift tips it. With the nose raised by angle a the part
// is cos(a), so on a near-vertical face gravity loops the bike over however
// far the rider leans.
function forwardLeanWeightShift(vehicle, facing, leanControl) {
  if (leanControl * facing <= 0 || hangsBelowWheel(vehicle)) return 1;
  const { chassis } = vehicle;
  const up = chassisUp(chassis);
  if (up.x * facing >= 0) return 1;
  return clamp(-up.y, 0, 1);
}

// A braked wheel that gripped last step is held where it stood, within one
// step of tire friction. Pushing a wheel out of a slope moves it a little
// downhill each step, which velocity friction alone cannot undo. Only a wheel
// the bike stands on is held: a locked wheel pinned against an overhang would
// clamp a hanging bike in place instead of letting it swing.
function holdBrakedWheel(point) {
  if (
    !point.brakeHold ||
    !point.contact ||
    point.contact.ny >= CONTACT_GROUNDED_NORMAL
  )
    return;
  const tx = -point.contact.ny,
    ty = point.contact.nx;
  const drift = (point.x - point.holdX) * tx + (point.y - point.holdY) * ty;
  if (Math.abs(drift) > point.brakeHold) {
    point.brakeHold = 0;
    return;
  }
  point.x -= tx * drift;
  point.y -= ty * drift;
}

function resolveContact(point, contact, wheelName, hooks) {
  if (!contact || (contact.penetration <= 0 && !contact.swept)) return;
  const { nx, ny, penetration } = contact;
  const beforeX = point.x,
    beforeY = point.y;
  let vx = point.x - point.ox,
    vy = point.y - point.oy;
  const beforeVx = vx,
    beforeVy = vy;
  const intoSurface = vx * nx + vy * ny;
  if (intoSurface < 0) {
    const impactSpeed = -intoSurface / STEP;
    point.impactSpeed = Math.max(point.impactSpeed || 0, impactSpeed);
    const restitution =
      impactSpeed > CONTACT_RESTITUTION_SPEED
        ? clamp(0.08 + impactSpeed / 1200, 0.08, 0.22) *
          XPBD_CONTACT_RESTITUTION_SCALE
        : 0;
    vx -= nx * intoSurface * (1 + restitution);
    vy -= ny * intoSurface * (1 + restitution);
    // The real ground force: every bit of speed the surface stops, including
    // the chassis weight the suspension pushes into the wheel.
    point.groundLoad =
      (point.groundLoad || 0) - (intoSurface * (1 + restitution)) / STEP;
  }
  point.x += nx * penetration;
  point.y += ny * penetration;
  point.ox = point.x - vx;
  point.oy = point.y - vy;
  point.contact = contact;
  point.material = contact.material;
  if (ny < CONTACT_GROUNDED_NORMAL) point.grounded = true;
  hooks.contact?.({
    wheel: wheelName,
    contact,
    beforeX,
    beforeY,
    beforeVx,
    beforeVy,
    point,
    afterVx: vx,
    afterVy: vy,
  });
}

// Sweeps a point from where it was, again after each pane of glass it breaks
// on the way, so it still stops at whatever is behind the glass.
function sweepPoint(trail, point, radius) {
  const fromX = point.ox,
    fromY = point.oy;
  let hit = terrainSweepCollision(trail, fromX, fromY, point.x, point.y, radius);
  while (hit && passThroughGlass(trail, point, hit))
    hit = terrainSweepCollision(trail, fromX, fromY, point.x, point.y, radius);
  return hit;
}

function collideWheel(trail, point, wheelName, hooks, sweep = true) {
  if (sweep) {
    const hit = sweepPoint(trail, point, RADIUS);
    const intendedVx = point.x - point.ox,
      intendedVy = point.y - point.oy;
    if (hit) {
      point.x = hit.x + hit.nx * 0.01;
      point.y = hit.y + hit.ny * 0.01;
      point.ox = point.x - intendedVx;
      point.oy = point.y - intendedVy;
      resolveContact(point, hit, wheelName, hooks);
      advanceAfterTimeOfImpact(point, hit.time);
    }
  }
  for (const contact of terrainCollisionsAt(trail, point.x, point.y, RADIUS))
    if (!passThroughGlass(trail, point, contact))
      resolveContact(point, contact, wheelName, hooks);
}

// Collision for loose points (ragdoll joints, a crashed chassis): bounce off
// the surface and lose some tangential speed, with no rolling or traction.
// `grip` adds Coulomb friction: each contact removes sliding speed in proportion
// to how hard the point presses on the surface, so a body can rest on a slope.
// The press counted is capped near a resting body's weight (about two steps of
// gravity), so a hard landing doesn't brake a slide dead and bodies still glide.
// With `slide` set, a sliding point loses only `slide` times the press
// (kinetic friction), so it slows evenly and keeps going down slopes steeper
// than `slide` allows. Below `settle` speed (px per step) the friction rises
// back towards `grip` and the `friction` drag fades in, so a body that has all
// but stopped settles instead of creeping.
const GRIP_PRESS_LIMIT = 0.05;

function resolveFreeContact(
  point,
  contact,
  { bounce, friction, grip = 0, slide = null, settle = 0 },
) {
  if (!contact || (contact.penetration <= 0 && !contact.swept)) return;
  const { nx, ny, penetration } = contact;
  let vx = point.x - point.ox,
    vy = point.y - point.oy;
  const normal = vx * nx + vy * ny;
  if (normal < 0) {
    vx -= nx * normal * (1 + bounce);
    vy -= ny * normal * (1 + bounce);
  }
  const tangentX = -ny,
    tangentY = nx,
    tangent = vx * tangentX + vy * tangentY;
  const press = Math.min(
    Math.max(0, -normal) + Math.max(0, penetration),
    GRIP_PRESS_LIMIT,
  );
  const speed = Math.abs(tangent);
  let loss;
  if (slide === null) loss = Math.max(speed * friction, grip * press);
  else {
    const slow = Math.max(0, 1 - speed / settle);
    loss = speed * friction * slow + (slide + (grip - slide) * slow) * press;
  }
  const slip = Math.sign(tangent) * Math.min(speed, loss);
  vx -= tangentX * slip;
  vy -= tangentY * slip;
  point.x += nx * penetration;
  point.y += ny * penetration;
  point.ox = point.x - vx;
  point.oy = point.y - vy;
  point.grounded = true;
}

export function collideFreePoint(
  trail,
  point,
  sweep,
  { bounce = 0.12, friction = 0.16, grip = 0, slide = null, settle = 0 } = {},
) {
  const surface = { bounce, friction, grip, slide, settle };
  if (sweep) {
    const swept = sweepPoint(trail, point, point.radius);
    const intendedVx = point.x - point.ox,
      intendedVy = point.y - point.oy;
    if (swept) {
      point.x = swept.x + swept.nx * 0.01;
      point.y = swept.y + swept.ny * 0.01;
      point.ox = point.x - intendedVx;
      point.oy = point.y - intendedVy;
      resolveFreeContact(point, swept, surface);
      // Continue through the rest of the substep with the resolved velocity;
      // stopping at the time of impact would glue sliding points in place.
      advanceAfterTimeOfImpact(point, swept.time);
    }
  }
  for (const contact of terrainCollisionsAt(
    trail,
    point.x,
    point.y,
    point.radius,
  ))
    if (!passThroughGlass(trail, point, contact))
      resolveFreeContact(point, contact, surface);
}

// A probe is an affine blend of the chassis points; contact corrections are
// spread over them by inverse mass, like an XPBD positional constraint.
function frameWeights(along, height) {
  const topWeight = height / CHASSIS_TOP_HEIGHT;
  const mountWeight = (1 - topWeight) / 2;
  return [
    mountWeight - along / WHEELBASE,
    mountWeight + along / WHEELBASE,
    topWeight,
  ];
}

function createFrameProbe(points, along, height) {
  const weights = frameWeights(along, height);
  const denominator = points.reduce(
    (sum, point, index) => sum + weights[index] * weights[index] * point.inverseMass,
    0,
  );
  return {
    points,
    weights,
    shares: points.map(
      (point, index) => (weights[index] * point.inverseMass) / denominator,
    ),
  };
}

function blendProbe({ points, weights }, xKey, yKey) {
  let x = 0,
    y = 0;
  for (let index = 0; index < points.length; index++) {
    x += points[index][xKey] * weights[index];
    y += points[index][yKey] * weights[index];
  }
  return { x, y };
}

function resolveFrameProbeContact(probe, contact, bounce, friction) {
  const { x, y } = blendProbe(probe, "x", "y");
  const old = blendProbe(probe, "ox", "oy");
  const { nx, ny } = contact;
  const penetration = contact.swept
    ? (contact.x - x) * nx + (contact.y - y) * ny + 0.01
    : contact.penetration;
  if (penetration <= 0) return;
  const vx = x - old.x,
    vy = y - old.y;
  let dvx = 0,
    dvy = 0;
  const normal = vx * nx + vy * ny;
  if (normal < 0) {
    dvx -= nx * normal * (1 + bounce);
    dvy -= ny * normal * (1 + bounce);
  }
  const tangentX = -ny,
    tangentY = nx,
    tangent = (vx + dvx) * tangentX + (vy + dvy) * tangentY;
  dvx -= tangentX * tangent * friction;
  dvy -= tangentY * tangent * friction;
  const dx = nx * penetration,
    dy = ny * penetration;
  for (let index = 0; index < probe.points.length; index++) {
    const point = probe.points[index],
      share = probe.shares[index];
    if (!share) continue;
    point.x += dx * share;
    point.y += dy * share;
    point.ox += (dx - dvx) * share;
    point.oy += (dy - dvy) * share;
    point.grounded = true;
  }
}

function probeBreaksGlass(trail, probe, contact) {
  const from = blendProbe(probe, "ox", "oy");
  const to = blendProbe(probe, "x", "y");
  return shatterGlass(trail, contact, to.x - from.x, to.y - from.y);
}

function collideFrameProbe(trail, probe, sweep, { bounce, friction }) {
  if (sweep) {
    const from = blendProbe(probe, "ox", "oy");
    const to = blendProbe(probe, "x", "y");
    const sweepProbe = () =>
      terrainSweepCollision(
        trail,
        from.x,
        from.y,
        to.x,
        to.y,
        CRASHED_FRAME_PROBE_RADIUS,
      );
    let swept = sweepProbe();
    while (swept && probeBreaksGlass(trail, probe, swept)) swept = sweepProbe();
    if (swept) resolveFrameProbeContact(probe, swept, bounce, friction);
  }
  const { x, y } = blendProbe(probe, "x", "y");
  for (const contact of terrainCollisionsAt(
    trail,
    x,
    y,
    CRASHED_FRAME_PROBE_RADIUS,
  ))
    if (!probeBreaksGlass(trail, probe, contact))
      resolveFrameProbeContact(probe, contact, bounce, friction);
}

function collideCrashedChassis(vehicle, trail, sweep) {
  if (vehicle.framePassThrough) return;
  const { rearMount, frontMount } = vehicle.chassis;
  for (const point of [rearMount, frontMount])
    collideFreePoint(trail, point, sweep, CRASHED_CHASSIS_CONTACT);
  for (const probe of vehicle.crashedFrameProbes)
    collideFrameProbe(trail, probe, sweep, CRASHED_CHASSIS_CONTACT);
}

// The crashed bike as the thrown rider feels it: both wheels, plus capsules
// along the seat, the frame between the mounts, and the engine. Capsule ends
// are [offset along the mounts, height above the mount line], like the probes.
const BIKE_BODY_CAPSULES = [
  { from: frameWeights(-22, 6), to: frameWeights(22, 6), radius: 3 },
  { from: frameWeights(-25, 0), to: frameWeights(25, 0), radius: 4 },
  { from: frameWeights(-5, -12), to: frameWeights(3, -12), radius: 6 },
];

function nearestOnCapsule(chassisPoints, capsule, x, y) {
  let ax = 0,
    ay = 0,
    bx = 0,
    by = 0;
  for (let index = 0; index < 3; index++) {
    const point = chassisPoints[index];
    ax += point.x * capsule.from[index];
    ay += point.y * capsule.from[index];
    bx += point.x * capsule.to[index];
    by += point.y * capsule.to[index];
  }
  const dx = bx - ax,
    dy = by - ay,
    lengthSq = dx * dx + dy * dy || 1;
  const t = Math.max(
    0,
    Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq),
  );
  return {
    x: ax + dx * t,
    y: ay + dy * t,
    weights: capsule.from.map(
      (weight, index) => weight + (capsule.to[index] - weight) * t,
    ),
  };
}

/**
 * Pushes a loose point (a ragdoll joint) out of the crashed bike and the bike
 * back from it, shared by inverse mass. With `apply` false it only reports
 * whether the point overlaps the bike.
 *
 * The overlap is undone without changing either body's speed, and only their
 * closing speed is then cancelled, as a dead hit. A joint caught between the
 * bike and the ground is pushed both ways every iteration, so turning those
 * pushes into speed would fire the rider or the bike into the air.
 * @returns {boolean} whether the point overlapped the bike
 */
export function collideWithBike(vehicle, point, inverseMass, apply = true) {
  const { rear, front, chassisPoints } = vehicle;
  let touched = false;
  const move = (target, x, y) => {
    target.x += x;
    target.y += y;
    target.ox += x;
    target.oy += y;
  };
  const push = (cx, cy, reach, bikePoints, weights) => {
    const dx = point.x - cx,
      dy = point.y - cy,
      distanceSq = dx * dx + dy * dy;
    if (distanceSq >= reach * reach) return;
    touched = true;
    if (!apply) return;
    const length = hypot(dx, dy);
    const nx = length > 1e-6 ? dx / length : 0,
      ny = length > 1e-6 ? dy / length : -1;
    let denominator = inverseMass;
    for (let index = 0; index < bikePoints.length; index++)
      denominator += weights[index] * weights[index] * bikePoints[index].inverseMass;
    const lambda = (reach - length) / denominator;
    move(point, nx * lambda * inverseMass, ny * lambda * inverseMass);
    let closing = (point.x - point.ox) * nx + (point.y - point.oy) * ny;
    for (let index = 0; index < bikePoints.length; index++) {
      const bikePoint = bikePoints[index],
        share = lambda * weights[index] * bikePoint.inverseMass;
      move(bikePoint, -nx * share, -ny * share);
      closing -=
        weights[index] *
        ((bikePoint.x - bikePoint.ox) * nx + (bikePoint.y - bikePoint.oy) * ny);
    }
    if (closing >= 0) return;
    const impulse = -closing / denominator;
    point.ox -= nx * impulse * inverseMass;
    point.oy -= ny * impulse * inverseMass;
    for (let index = 0; index < bikePoints.length; index++) {
      const share = impulse * weights[index] * bikePoints[index].inverseMass;
      bikePoints[index].ox += nx * share;
      bikePoints[index].oy += ny * share;
    }
  };
  for (const wheel of [rear, front])
    push(wheel.x, wheel.y, RADIUS + point.radius, [wheel], [1]);
  if (!vehicle.framePassThrough)
    for (const capsule of BIKE_BODY_CAPSULES) {
      const nearest = nearestOnCapsule(chassisPoints, capsule, point.x, point.y);
      push(
        nearest.x,
        nearest.y,
        capsule.radius + point.radius,
        chassisPoints,
        nearest.weights,
      );
    }
  return touched;
}

// A link passes through terrain when a ray along it enters a surface from both
// ends; one end merely resting inside a surface does not count.
function linkCrossesTerrain(trail, a, b) {
  return (
    terrainSweepCollision(trail, a.x, a.y, b.x, b.y, 0) !== null &&
    terrainSweepCollision(trail, b.x, b.y, a.x, a.y, 0) !== null
  );
}

const overlapsTerrain = (trail, x, y, radius) =>
  terrainCollisionsAt(trail, x, y, radius).some(
    (contact) => contact.penetration > 0,
  );

function frameOverlapsTerrain(vehicle, trail) {
  const { rearMount, frontMount } = vehicle.chassis;
  return (
    [rearMount, frontMount].some((point) =>
      overlapsTerrain(trail, point.x, point.y, point.radius),
    ) ||
    vehicle.crashedFrameProbes.some((probe) => {
      const { x, y } = blendProbe(probe, "x", "y");
      return overlapsTerrain(trail, x, y, CRASHED_FRAME_PROBE_RADIUS);
    })
  );
}

// While riding only the wheels touch terrain, so the bike can hang with a
// wheel over a thin ledge and the frame under it. Once crashed the frame
// collides too and would hook the ledge, so while any link passes through
// terrain the frame keeps passing through it, as it does while riding, and the
// wheels keep rolling on the edge. The frame collides again once the bike is
// clear of the ledge and the frame is out of the ground.
function updateCrashedPassThrough(vehicle, trail) {
  const straddling = vehicle.frameLinks.some(([a, b]) =>
    linkCrossesTerrain(trail, a, b),
  );
  if (straddling) vehicle.framePassThrough = true;
  else if (vehicle.framePassThrough)
    vehicle.framePassThrough = frameOverlapsTerrain(vehicle, trail);
}

// `controls.crashed` hands the bike to physics alone: the chassis collides with
// the terrain so a riderless bike tips over and tumbles instead of sinking.
// Engine torque at `rev`: full up to standstill and tapering linearly to 28%
// at XPBD_TORQUE_FALLOFF_SPEED, then thinning out without ever cutting off.
function torqueAt(rev) {
  const ratio = Math.max(0, rev) * RADIUS / XPBD_TORQUE_FALLOFF_SPEED;
  return (
    XPBD_MOTOR_ANGULAR_ACCELERATION *
    (ratio >= 1 ? 0.28 / ratio : 0.28 + 0.72 * (1 - ratio))
  );
}

// One step of the engine. `wheelSpin` is the driven wheel's forward spin.
// The clutch passes torque to the wheel only while the engine turns faster
// than it, in proportion to the gap and up to what its grip at these revs
// allows, so it always slips a little under load; the rest of the engine's
// torque spins the flywheel up. Braking, the rider pulls the clutch in.
// Returns the clutch's torque and the flywheel's, in rear-wheel terms.
function runEngine(engine, throttle, wheelSpin, braking, crashed) {
  const { inertia, idle, engage, clutch, drag, redline } = ENGINE;
  const engineTorque = crashed ? 0 : throttle * torqueAt(engine.rev);
  const grip = braking
    ? 0
    : clutch * XPBD_MOTOR_ANGULAR_ACCELERATION * clamp((engine.rev - idle) / engage, 0, 1);
  // The torque that would bring engine and wheel to one speed this step.
  const lockUp = ((engine.rev - wheelSpin) / STEP) * (inertia / (inertia + 1));
  const clutchTorque = clamp(lockUp, 0, grip);
  const revBefore = engine.rev;
  engine.rev += ((engineTorque - clutchTorque) * STEP) / inertia;
  engine.rev += (idle - engine.rev) * (1 - throttle) * (1 - exp(-drag * STEP));
  engine.rev = clamp(engine.rev, idle, redline);
  // The flywheel's change of spin, as a torque in rear-wheel terms.
  const crankTorque = ((engine.rev - revBefore) / STEP) * inertia;
  // Kept for the engine sound: how hard the clutch pulls on the wheel.
  engine.clutchTorque = clutchTorque;
  return { engineTorque, clutchTorque, crankTorque };
}

export function stepVehicle(vehicle, trail, controls, hooks = {}) {
  const { rear, front, chassis, constraints } = vehicle;
  const {
    facing,
    throttle,
    brakePressure,
    leanControl,
    accelerating,
    braking,
    coasting,
    crashed = false,
  } = controls;
  if (vehicle.lastFacing !== undefined && vehicle.lastFacing !== facing) {
    for (const point of [rear, front]) {
      const vx = (point.x - point.ox) / STEP;
      const vy = (point.y - point.oy) / STEP;
      if (point.contact) {
        const tx = -point.contact.ny,
          ty = point.contact.nx;
        point.angularVelocity = (vx * tx + vy * ty) / RADIUS;
      } else {
        point.angularVelocity = vx / RADIUS;
      }
    }
  }
  if (vehicle.lastFacing !== undefined && vehicle.lastFacing !== facing)
    vehicle.engine.rev = Math.max(
      ENGINE.idle,
      facing * (facing > 0 ? rear : front).angularVelocity,
    );
  vehicle.lastFacing = facing;
  fitSuspension(vehicle, facing);
  const grounded = rear.grounded || front.grounded;
  rear.impactSpeed = 0;
  front.impactSpeed = 0;
  const midpointX = (rear.x + front.x) / 2;
  const midpointY = Math.min(rear.y, front.y) - RADIUS;
  const slope = terrainAt(trail, midpointX, midpointY).slope;
  // The uphill cut on forward lean applies while the bike moves or is on the
  // gas, and fades out standing still off the gas; see
  // XPBD_UPHILL_FORWARD_LEAN_SPEED.
  const speed =
    hypot(rear.x - rear.ox + front.x - front.ox, rear.y - rear.oy + front.y - front.oy) /
    (2 * STEP);
  const uphill =
    clamp(-slope * facing, 0, 1) *
    Math.max(clamp(speed / XPBD_UPHILL_FORWARD_LEAN_SPEED, 0, 1), throttle);
  const drivenWheel = facing > 0 ? rear : front;
  const { clutchTorque, crankTorque } = runEngine(
    vehicle.engine,
    throttle,
    facing * drivenWheel.angularVelocity,
    braking,
    crashed,
  );
  // Torques here are in rear-wheel terms: the angular acceleration they give
  // the wheel alone.
  const angularDrive = facing * clutchTorque;
  // Gas held on the brakes only revs the engine, with the clutch in, so it
  // gives lean back no boost.
  const riderAssist = riderTorqueMultiplier(
    leanControl,
    facing,
    braking ? 0 : throttle,
    accelerating,
    XPBD_THROTTLE_LEAN_ASSIST,
  );
  const frontLift = grounded
    ? clamp(
        noseUpTilt(vehicle, facing) / XPBD_UPHILL_FORWARD_LEAN_FULL_TILT,
        0,
        1,
      )
    : 0;
  const riderTerrainScale = grounded
    ? riderTerrainTorqueScale(
        leanControl,
        facing,
        uphill,
        XPBD_UPHILL_FORWARD_LEAN_REDUCTION,
        frontLift,
      )
    : 1;
  const wheelMoment = WHEEL_INERTIA * RADIUS * RADIUS;
  const { chassisPoints, bikePoints } = vehicle;
  const chassisInertia = momentOfInertia(chassisPoints);
  const bikeInertia = momentOfInertia(bikePoints);
  const bikeSpin = angularVelocity(bikePoints, bikeInertia);
  const groundLeverage = riderGroundLeverage(vehicle);
  const groundLean =
    leanControl *
    XPBD_RIDER_GROUND_ANGULAR_ACCELERATION *
    riderAssist *
    riderTerrainScale *
    groundLeverage *
    forwardLeanWeightShift(vehicle, facing, leanControl);
  const airLeanLimit =
    Math.abs(leanControl) * XPBD_RIDER_AIR_ANGULAR_ACCELERATION * riderAssist;
  const airLean = clamp(
    (leanControl * XPBD_RIDER_MAX_AIR_SPIN - bikeSpin) *
      XPBD_RIDER_AIR_SPIN_RESPONSE,
    -airLeanLimit,
    airLeanLimit,
  );
  const riderAngularAcceleration = grounded
    ? groundLean *
      riderSpinTorqueScale(groundLean, bikeSpin, XPBD_RIDER_MAX_GROUND_SPIN)
    : airLean;
  // The engine pushes against the tire's grip on the ground, and that pushes
  // the front up. In the air the wheel's own spin turns the bike instead; see
  // the airborne wheels below.
  const drivenWheelAcceleration = drivenWheel.contact ? angularDrive : 0;
  // The flywheel spinning up or down turns the frame the other way, on the
  // ground and in the air alike.
  const motorReactionTorque =
    -(drivenWheelAcceleration + facing * crankTorque) *
    wheelMoment *
    XPBD_MOTOR_REACTION_SCALE;
  const reactionAlpha = motorReactionTorque / bikeInertia;
  const motorReactionAcceleration = motorReactionTorque / bikeInertia;
  // The brakes' push-back is applied after the tires, from what they did;
  // this is last step's, for the physics trace.
  const brakeReactionAcceleration = vehicle.brakeReaction || 0;
  const reactionAccelerations = angularAccelerations(
    bikePoints,
    reactionAlpha,
    vehicle.reactionAccelerations,
  );
  const riderAccelerations = angularAccelerations(
    bikePoints,
    riderAngularAcceleration,
    vehicle.riderAccelerations,
  );
  keepPivotPlanted(
    riderAccelerations,
    rear,
    front,
    centerOfMass(bikePoints).mass,
  );
  const dynamics = {
    angularDrive,
    riderAssist,
    riderTerrainScale,
    // For the debug readout: the share of ground lean that reaches the bike,
    // and whether it counts as hanging from one wheel, which keeps it whole.
    groundLeverage,
    hanging: hangsBelowWheel(vehicle) ? 1 : 0,
    riderAngularAcceleration,
    motorReactionAcceleration,
    brakeReactionAcceleration,
    chassisReactionAngularAcceleration:
      motorReactionAcceleration + brakeReactionAcceleration,
    chassisInertia,
    wheelbase: distance(rear, front),
    wheelbaseVelocity:
      ((front.x - front.ox - (rear.x - rear.ox)) * (front.x - rear.x) +
        (front.y - front.oy - (rear.y - rear.oy)) * (front.y - rear.y)) /
      (distance(rear, front) || 1) /
      STEP,
    chassisArea: signedTriangleArea(
      chassis.rearMount,
      chassis.frontMount,
      chassis.top,
    ),
    rearSuspensionLength: legLength(vehicle.suspension[0]),
    frontSuspensionLength: legLength(vehicle.suspension[1]),
  };
  hooks.dynamics?.(dynamics);

  const wasRearGrounded = rear.grounded,
    wasFrontGrounded = front.grounded;
  for (const wheel of [rear, front]) {
    if (!braking || crashed) wheel.brakeHold = 0;
    if (wheel.brakeHold) {
      wheel.holdX = wheel.x;
      wheel.holdY = wheel.y;
    }
  }
  for (let index = 0; index < bikePoints.length; index++) {
    integratePoint(
      bikePoints[index],
      riderAccelerations[index * 2] + (reactionAccelerations[index * 2] || 0),
      GRAVITY +
        riderAccelerations[index * 2 + 1] +
        (reactionAccelerations[index * 2 + 1] || 0),
    );
  }
  for (const constraint of vehicle.dampedConstraints)
    resetConstraintMultiplier(constraint);
  hooks.afterIntegration?.();
  for (const { spring } of vehicle.suspension) updateRisingRate(spring);
  const momentumBeforeSolve = crashed ? 0 : angularMomentum(bikePoints);

  const solverWheels =
    facing < 0 ? vehicle.wheelOrder.backward : vehicle.wheelOrder.forward;
  if (crashed) updateCrashedPassThrough(vehicle, trail);
  for (const [point, name] of solverWheels) {
    collideWheel(trail, point, name, hooks);
    holdBrakedWheel(point);
  }
  if (crashed) collideCrashedChassis(vehicle, trail, true);
  for (let iteration = 0; iteration < BIKE_SOLVER_ITERATIONS; iteration++) {
    hooks.iteration?.(iteration);
    for (const constraint of constraints) {
      const correction = solveXpbdConstraint(constraint, STEP);
      hooks.constraint?.(correction);
    }
    for (const [point, name] of solverWheels) {
      collideWheel(trail, point, name, hooks, false);
      holdBrakedWheel(point);
    }
    if (crashed) collideCrashedChassis(vehicle, trail, false);
    hooks.contactsResolved?.();
  }
  // In the air nothing outside the bike can speed up its spin. The wheel
  // sliders are not momentum-conserving on their own; while the bike tumbles
  // fast they would keep feeding the spin.
  if (!crashed && !rear.contact && !front.contact) {
    const drift = angularMomentum(bikePoints) - momentumBeforeSolve;
    if (drift * momentumBeforeSolve > 0)
      addSpin(bikePoints, -drift / momentOfInertia(bikePoints));
  }
  if (
    (!wasRearGrounded && rear.grounded) ||
    (!wasFrontGrounded && front.grounded)
  )
    absorbTouchdownSpin(bikePoints, bikeInertia);

  const traction = vehicle.traction;
  traction.drivenWheel = drivenWheel;
  traction.angularDrive = angularDrive;
  traction.braking = braking;
  traction.brakePressure = brakePressure;
  traction.coasting = coasting;
  traction.throttle = throttle;
  traction.brakeSpin = 0;
  for (const [point, name] of solverWheels) {
    if (!point.contact) {
      point.brakeHold = 0;
      const spinBefore = point.angularVelocity;
      // A wheel in the air keeps its spin but for the engine, which spins the
      // driven wheel up on the gas, the brakes, and the drag of its bearings,
      // which slowly runs it down. It lands with whatever spin it has, as a
      // real one does.
      if (point === drivenWheel) point.angularVelocity += angularDrive * STEP;
      point.angularVelocity *= exp(-WHEEL_SPIN_DRAG * STEP);
      if (braking) {
        const brakeLimit = XPBD_BRAKE_TORQUE * brakePressure * STEP;
        point.angularVelocity -= clamp(
          point.angularVelocity,
          -brakeLimit,
          brakeLimit,
        );
      }
      point.angularVelocity = clamp(
        point.angularVelocity,
        -MAX_POINT_SPEED / RADIUS,
        MAX_POINT_SPEED / RADIUS,
      );
      // Whatever spin the engine, brake or drag gives the wheel in the air,
      // the bike takes the other way, as angular momentum is kept: gas lifts
      // the nose and braking a spinning wheel drops it. It stops once the
      // wheel is at its top speed, as at the rev limiter.
      if (!crashed)
        addSpin(
          bikePoints,
          (-(point.angularVelocity - spinBefore) * wheelMoment) / bikeInertia,
        );
      point.spin += point.angularVelocity * STEP;
      continue;
    }
    applyWheelTraction(point, name, true, traction, hooks);
  }
  // The brakes push back on the frame as hard as they hold the wheels: that,
  // with the tires slowing the bike, is the dive under braking. Recorded for
  // the physics trace as an angular acceleration.
  vehicle.brakeReaction = crashed
    ? 0
    : (traction.brakeSpin * wheelMoment) / bikeInertia / STEP;
  if (!crashed) addSpin(bikePoints, (traction.brakeSpin * wheelMoment) / bikeInertia);
  for (let iteration = 0; iteration < BIKE_VELOCITY_ITERATIONS; iteration++) {
    for (const constraint of vehicle.dampedConstraints) {
      (constraint.type === "leg" ? dampLegConstraint : dampDistanceConstraint)(
        constraint,
        dampingPerIteration(
          compressionDamping(constraint),
          BIKE_VELOCITY_ITERATIONS,
        ),
        dampingPerIteration(
          constraint.reboundDamping ?? constraint.damping,
          BIKE_VELOCITY_ITERATIONS,
        ),
      );
    }
  }
  // Constraint damping moves the wheels after the drive impulse. While on the
  // gas, match the tire to the ground again so the wheel does not spin out.
  if (throttle > 0.01 && !braking) {
    for (const [point, name] of solverWheels)
      applyWheelTraction(point, name, false, traction, hooks);
  }
  // How far the body has come down on each wheel, square to the frame as the
  // drawn body measures it: a raked fork's travel times the cosine of its
  // rake, which the slider's `along` holds. Negative while the spring is
  // stretched, so the drawn body lifts away from a wheel it hangs from.
  for (const { wheel, spring, slider } of vehicle.suspension)
    wheel.compression = clamp(
      legTravel(spring) * slider.along,
      -SUSPENSION_TRAVEL,
      SUSPENSION_TRAVEL,
    );
  hooks.iteration?.(-1);
  return dynamics;
}

export function vehicleMetrics(vehicle) {
  const center = centerOfMass(vehicle.bikePoints);
  return {
    center,
    speedX:
      (vehicle.rear.x -
        vehicle.rear.ox +
        (vehicle.front.x - vehicle.front.ox)) /
      (2 * STEP),
    speedY:
      (vehicle.rear.y -
        vehicle.rear.oy +
        (vehicle.front.y - vehicle.front.oy)) /
      (2 * STEP),
    pitch: atan2(
      vehicle.front.y - vehicle.rear.y,
      vehicle.front.x - vehicle.rear.x,
    ),
    wheelbase: distance(vehicle.rear, vehicle.front),
    rearSuspensionLength: legLength(vehicle.suspension[0]),
    frontSuspensionLength: legLength(vehicle.suspension[1]),
    chassisArea: signedTriangleArea(
      vehicle.chassis.rearMount,
      vehicle.chassis.frontMount,
      vehicle.chassis.top,
    ),
  };
}

export function createSimulation({ vehicle, trail, facing = 1, hooks = {} }) {
  let currentFacing = facing < 0 ? -1 : 1;
  let throttle = 0;
  let brakePressure = 0;
  let leanControl = 0;

  function step({
    throttle: throttleInput = 0,
    brake = 0,
    lean = 0,
    flip = false,
  } = {}) {
    if (flip) currentFacing *= -1;

    const throttleTarget = clamp(Number(throttleInput) || 0, 0, 1);
    const brakeTarget = clamp(Number(brake) || 0, 0, 1);
    const accelerating = throttleTarget > 0 && brakeTarget === 0;
    const braking = brakeTarget > 0;
    const coasting = !accelerating && !braking;
    throttle = lerp(
      throttle,
      throttleTarget,
      1 -
        exp(
          -(throttleTarget > throttle
            ? XPBD_THROTTLE_INPUT_RESPONSE
            : XPBD_THROTTLE_RELEASE_RESPONSE) * STEP,
        ),
    );
    brakePressure = lerp(
      brakePressure,
      brakeTarget,
      1 - exp(-(braking ? 10 : 14) * STEP),
    );
    leanControl = lerp(
      leanControl,
      clamp(Number(lean) || 0, -1, 1),
      1 - exp(-XPBD_LEAN_INPUT_RESPONSE * STEP),
    );

    const contactEvents = [];
    const traction = {};
    const dynamics = stepVehicle(
      vehicle,
      trail,
      {
        facing: currentFacing,
        throttle,
        brakePressure,
        leanControl,
        accelerating,
        braking,
        coasting,
      },
      {
        ...hooks,
        contact(value) {
          contactEvents.push(value);
          hooks.contact?.(value);
        },
        traction(wheelName, result, point) {
          traction[wheelName] = result;
          hooks.traction?.(wheelName, result, point);
        },
      },
    );
    const metrics = vehicleMetrics(vehicle);

    return {
      facing: currentFacing,
      input: { throttle: throttleInput, brake, lean, flip },
      controls: { throttle, brakePressure, leanControl },
      wheels: { rear: vehicle.rear, front: vehicle.front },
      chassis: vehicle.chassis,
      suspension: {
        rearLength: metrics.rearSuspensionLength,
        frontLength: metrics.frontSuspensionLength,
        restLength: SUSPENSION_REST_LENGTH,
        travel: SUSPENSION_TRAVEL,
      },
      contacts: {
        rear: vehicle.rear.contact,
        front: vehicle.front.contact,
        events: contactEvents,
      },
      forces: { ...dynamics, traction },
      metrics,
    };
  }

  return {
    vehicle,
    trail,
    step,
    get facing() {
      return currentFacing;
    },
    get state() {
      const metrics = vehicleMetrics(vehicle);
      return {
        facing: currentFacing,
        controls: { throttle, brakePressure, leanControl },
        wheels: { rear: vehicle.rear, front: vehicle.front },
        chassis: vehicle.chassis,
        suspension: {
          rearLength: metrics.rearSuspensionLength,
          frontLength: metrics.frontSuspensionLength,
          restLength: SUSPENSION_REST_LENGTH,
          travel: SUSPENSION_TRAVEL,
        },
        contacts: { rear: vehicle.rear.contact, front: vehicle.front.contact },
        metrics,
      };
    },
  };
}
