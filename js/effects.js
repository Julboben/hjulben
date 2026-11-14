// @ts-check
// Cosmetic effects: particles, skid marks, terrain spray and weather timing.
// None of this feeds back into the simulation, so it may use Math.random.
import { STEP, RADIUS, TAU, GRAVITY, clamp, lerp } from './config.js';
import { terrainMaterials } from './materials.js';
import { terrainAt } from './terrain.js';
import { inGlass } from './glass.js';
import { ringArea } from './terrain-geometry.js';
import { WATER_COLORS, submergedFraction, waterAt } from './water.js';

const MAX_PARTICLES = 400;
const MAX_SKID_MARKS = 120;
const MAX_CLUMPS = 6;
/** How readily each loose surface sticks to a tyre; the rest wipe it clean. */
const DIRT_PICKUP = { dirt: 1, grass: .7, sand: .6, snow: .8 };
/** Spin (rad/s) above which clumps start to fly off the tyre. */
const FLING_SPIN = 40;
/** How fast particles fall (px/s²), unless they set their own gravity. */
const PARTICLE_GRAVITY = 210;

// Tyre load, against the load at rest, from which a tyre is drawn flat or
// bulging, and how long (s) each level is held; see squishTyres.
const TYRE_FLAT_LOAD = 3, TYRE_BULGE_LOAD = 18, TYRE_SQUISH_HOLD = .1;

// Compacts live entries to the front in place, keeping draw order, and drops
// the oldest entries beyond `limit`.
function removeExpired(list, limit) {
  let kept = 0;
  const overflow = Math.max(0, list.length - limit);
  for (let index = overflow; index < list.length; index++) {
    if (list[index].life > 0) list[kept++] = list[index];
  }
  list.length = kept;
}

export function createEffects() {
  /** @type {any[]} */ const particles = [];
  /** @type {any[]} */ const skidMarks = [];
  const weather = { time: 0, nextLightning: Infinity, flash: 0, x: .5, distance: .5 };
  let trail = null, sprayAccumulator = 0, skidAccumulator = 0, wakeAccumulator = 0;
  /** Clumps stuck to each tyre, at angles fixed to the tyre so they turn with it. */
  const wheelDirt = { rear: /** @type {any[]} */ ([]), front: /** @type {any[]} */ ([]) };
  const dirtAccumulator = { rear: 0, front: 0 };
  /** How flat each tyre is drawn, 0 … 2, and which way the ground is from its centre. */
  const tyreSquish = { rear: { level: 0, hold: 0, dx: 0, dy: 1 }, front: { level: 0, hold: 0, dx: 0, dy: 1 } };

  function reset(nextTrail) {
    trail = nextTrail;
    particles.length = 0; skidMarks.length = 0;
    sprayAccumulator = 0; skidAccumulator = 0; wakeAccumulator = 0;
    wheelDirt.rear.length = 0; wheelDirt.front.length = 0;
    dirtAccumulator.rear = 0; dirtAccumulator.front = 0;
    for (const squish of [tyreSquish.rear, tyreSquish.front]) { squish.level = 0; squish.hold = 0; }
    weather.time = 0; weather.flash = 0; weather.x = .5; weather.distance = .5;
    weather.nextLightning = trail.weather?.lightning ? 2.5 + Math.random() * 4 : Infinity;
  }

  function burst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = TAU * i / count;
      const speed = 25 + Math.random() * 85;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 35, life: .65, max: .65, color });
    }
  }

  /** What a landing knocks up off the ground, more on loose ground (see `roost` in materials.js). */
  function dustPuff(wheel, impactSpeed) {
    const x = wheel.contact?.pointX ?? wheel.x;
    const y = (wheel.contact?.pointY ?? wheel.y + RADIUS) - 2;
    const { spray, roost } = terrainMaterials[wheel.material] || terrainMaterials.grass;
    const count = Math.round(clamp(impactSpeed / 40, 3, 9) * roost.landing);
    for (let index = 0; index < count; index++) {
      const side = index % 2 ? 1 : -1;
      const life = (.3 + Math.random() * .25) * roost.hang;
      particles.push({
        x: x + side * (2 + Math.random() * 6), y,
        vx: side * (30 + Math.random() * 50), vy: -roost.lift * (10 + Math.random() * 30),
        life, max: life, color: spray[index % spray.length], size: Math.random() < roost.chunks ? 4 : 2, drag: 5,
        gravity: PARTICLE_GRAVITY * roost.fall
      });
    }
  }

  /**
   * The engine's cough as the kick-start catches: grey puffs out of the
   * exhaust, thrown back against `facing`, that slow, drift up, swell and
   * fade.
   */
  function exhaustPuff({ x, y }, facing) {
    const colors = ['#eceee9', '#c4c9c3', '#9aa29c'];
    for (let index = 0; index < 10; index++) {
      const life = .4 + Math.random() * .35;
      particles.push({
        x, y: y + (Math.random() - .5) * 3,
        vx: -facing * (20 + Math.random() * 50), vy: -(2 + Math.random() * 16),
        life, max: life, color: colors[index % colors.length], size: 4, grow: index % 2 ? 4 : 2, drag: 5, gravity: -24
      });
    }
  }

  function brakeMarks(ride, speed, braking) {
    const magnitude = Math.abs(speed);
    if (ride.status !== 'running' || !braking || magnitude < 24) { skidAccumulator = 0; return; }
    skidAccumulator += STEP;
    if (skidAccumulator < .045) return;
    skidAccumulator = 0;
    const direction = Math.sign(speed || ride.facing);
    for (const wheel of [ride.rear, ride.front]) {
      if (!wheel.grounded) continue;
      const ground = wheel.contact || terrainAt(trail, wheel.x, wheel.y - RADIUS);
      const length = clamp(magnitude * .035 * ride.brakePressure, 3, 10);
      skidMarks.push({
        x: ground.pointX ?? wheel.x, y: (ground.pointY ?? ground.y) - 1, slope: ground.slope,
        direction, length, life: 1.6, max: 1.6
      });
    }
  }

  function terrainSpray(ride, speed, braking) {
    if (ride.status !== 'running') return;
    const magnitude = Math.abs(speed);
    const wheel = ride.facing > 0 ? ride.rear : ride.front;
    if (!wheel.grounded || magnitude < 28 || (!braking && ride.throttle < .12)) {
      sprayAccumulator = Math.min(sprayAccumulator, .8);
      return;
    }
    // How much is thrown, how high and how far depends on the ground (see
    // `roost` in materials.js).
    const { spray, roost } = terrainMaterials[wheel.material] || terrainMaterials.grass;
    const intensity = clamp(magnitude / 210, .15, 1) * (braking ? 1.5 : .8 + ride.throttle * .7);
    sprayAccumulator += intensity * STEP * 24 * roost.amount;
    while (sprayAccumulator >= 1) {
      sprayAccumulator--;
      const direction = Math.sign(speed || ride.facing);
      const color = spray[Math.floor(Math.random() * spray.length)];
      const life = (.28 + Math.random() * .32) * roost.hang;
      particles.push({
        x: (wheel.contact?.pointX ?? wheel.x) - direction * (RADIUS - 2),
        y: (wheel.contact?.pointY ?? terrainAt(trail, wheel.x, wheel.y).y) - 2,
        vx: speed * .12 - direction * roost.reach * (35 + Math.random() * (braking ? 95 : 65)),
        vy: -roost.lift * (25 + Math.random() * (braking ? 90 : 55)),
        life, max: life, color, size: Math.random() < roost.chunks ? 4 : 2, drag: 2.5,
        gravity: PARTICLE_GRAVITY * roost.fall, splatter: true
      });
    }
  }

  /** Droplets thrown up where something hits the water, more the harder it hits. */
  function splash(x, y, speed) {
    const count = Math.round(clamp(speed / 22, 5, 18));
    for (let index = 0; index < count; index++) {
      const side = index % 2 ? 1 : -1;
      const life = .35 + Math.random() * .35;
      particles.push({
        x: x + side * Math.random() * 10, y: y - 1,
        vx: side * (15 + Math.random() * 70), vy: -(40 + Math.random() * clamp(speed * .9, 60, 260)),
        life, max: life, color: WATER_COLORS.splash[index % WATER_COLORS.splash.length],
        size: Math.random() < .6 ? 2 : 4, drag: 1.5
      });
    }
  }

  /**
   * Shards from a pane of glass breaking: spread over the pane, thrown away
   * from where it was hit, more for a bigger pane.
   */
  function shatter({ x, y, speed, left, right, top, bottom, rings }) {
    const spray = terrainMaterials.glass.spray;
    const width = right - left, height = bottom - top;
    const area = rings ? Math.abs(ringArea(rings[0])) : width * height;
    const count = Math.round(clamp(area / 60, 14, 60));
    const throwSpeed = clamp(speed * .35, 40, 160);
    for (let index = 0, tries = 0; index < count && tries < count * 20; tries++) {
      const sx = left + Math.random() * width, sy = top + Math.random() * height;
      // Only where the glass was: a tilted pane fills little of its box.
      if (rings && !inGlass(rings, sx, sy)) continue;
      index++;
      const away = Math.atan2(sy - y, sx - x) + (Math.random() - .5) * 1.2;
      const push = throwSpeed * (.4 + Math.random() * .8);
      const life = .5 + Math.random() * .5;
      particles.push({
        x: sx, y: sy,
        vx: Math.cos(away) * push, vy: Math.sin(away) * push - 20 - Math.random() * 40,
        life, max: life, color: spray[index % spray.length], size: Math.random() < .75 ? 2 : 4, drag: 1.2
      });
    }
  }

  /** A few glints flicking off where a pane cracked. */
  function crack({ x, y, speed }) {
    const spray = terrainMaterials.glass.spray;
    const count = Math.round(clamp(speed / 40, 3, 7));
    for (let index = 0; index < count; index++) {
      const side = index % 2 ? 1 : -1;
      const life = .25 + Math.random() * .2;
      particles.push({
        x: x + side * Math.random() * 4, y: y - 1,
        vx: side * (20 + Math.random() * 40), vy: -(30 + Math.random() * 50),
        life, max: life, color: spray[index % spray.length], size: 2, drag: 3
      });
    }
  }

  /** Spray from wheels pushing through the water's surface. */
  function waterWake(ride, speed) {
    const bodies = ride.water;
    if (!bodies?.length || ride.status !== 'running') return;
    const magnitude = Math.abs(speed);
    let surface = null, x = 0;
    for (const wheel of [ride.rear, ride.front]) {
      const wet = submergedFraction(bodies, wheel.x, wheel.y, RADIUS);
      if (wet <= 0 || wet >= 1) continue;
      const body = waterAt(bodies, wheel.x, wheel.y + RADIUS);
      if (body) { surface = body.y; x = wheel.x; }
    }
    if (surface === null || magnitude < 30) { wakeAccumulator = 0; return; }
    wakeAccumulator += clamp(magnitude / 200, .2, 1.4) * STEP * 30;
    const direction = Math.sign(speed || ride.facing);
    while (wakeAccumulator >= 1) {
      wakeAccumulator--;
      const life = .3 + Math.random() * .3;
      particles.push({
        x: x - direction * Math.random() * RADIUS, y: surface - 1,
        vx: speed * .25 - direction * Math.random() * 40, vy: -(30 + Math.random() * magnitude * .35),
        life, max: life, color: WATER_COLORS.splash[Math.floor(Math.random() * 3)], size: 2, drag: 2
      });
    }
  }

  /**
   * Loose ground sticks to the tyres as they roll, more when they skid under
   * the brake or spin up. Clumps dry and drop off with time, wear away on
   * hard ground, wash off in water and fly off a fast-spinning wheel.
   */
  function wheelGrime(ride, braking) {
    if (ride.status !== 'running') return;
    for (const name of /** @type {const} */ (['rear', 'front'])) {
      const wheel = ride[name], clumps = wheelDirt[name];
      const spin = wheel.angularVelocity || 0;
      const rolled = Math.abs(spin) * RADIUS * STEP;
      const wet = ride.water?.length ? submergedFraction(ride.water, wheel.x, wheel.y, RADIUS) : 0;
      const pickup = wheel.grounded && !wet ? DIRT_PICKUP[wheel.material] || 0 : 0;
      const wear = STEP + wet * STEP * 6 + (wheel.grounded && !pickup ? rolled * .008 : 0);
      for (const clump of clumps) {
        clump.life -= wear;
        if (Math.abs(spin) > FLING_SPIN && Math.random() < STEP * (Math.abs(spin) - FLING_SPIN) * .04) {
          fling(wheel, clump);
          clump.life = 0;
        }
      }
      removeExpired(clumps, MAX_CLUMPS);
      if (!pickup) continue;
      const groundSpeed = Math.hypot(wheel.x - wheel.ox, wheel.y - wheel.oy) / STEP;
      const slip = Math.abs(Math.abs(spin) * RADIUS - groundSpeed);
      const skid = braking ? ride.brakePressure * clamp(groundSpeed / 120, 0, 1) : 0;
      dirtAccumulator[name] += pickup * (rolled * .006 + slip * STEP * .02 + skid * STEP * 3);
      while (dirtAccumulator[name] >= 1) {
        dirtAccumulator[name]--;
        stick(wheel, clumps);
      }
    }
  }

  /** A clump where the tyre meets the ground, replacing the driest one when the tyre is full. */
  function stick(wheel, clumps) {
    const normal = wheel.contact;
    const down = normal ? Math.atan2(-normal.ny, -normal.nx) : TAU / 4;
    const spray = terrainMaterials[wheel.material].spray;
    const life = 7 + Math.random() * 4;
    const clump = {
      angle: down - (wheel.spin || 0), life, max: life,
      color: spray[Math.floor(Math.random() * 2)], size: Math.random() < .35 ? 2 : 1,
    };
    if (clumps.length < MAX_CLUMPS) clumps.push(clump);
    else {
      let driest = 0;
      for (let index = 1; index < clumps.length; index++) if (clumps[index].life < clumps[driest].life) driest = index;
      clumps[driest] = clump;
    }
  }

  function fling(wheel, clump) {
    const angle = (wheel.spin || 0) + clump.angle;
    const spin = wheel.angularVelocity || 0;
    const life = .35 + Math.random() * .2;
    particles.push({
      x: wheel.x + Math.cos(angle) * RADIUS, y: wheel.y + Math.sin(angle) * RADIUS,
      vx: (wheel.x - wheel.ox) / STEP - Math.sin(angle) * spin * RADIUS * .6,
      vy: (wheel.y - wheel.oy) / STEP + Math.cos(angle) * spin * RADIUS * .6 - 20,
      life, max: life, color: clump.color, size: 2, drag: 2, splatter: true
    });
  }

  /**
   * A tyre flattens where it meets the ground under load, and on a hard hit
   * its sidewalls bulge. The ground's push on each tyre comes from the
   * physics, against the share of the bike's weight it carries at rest: from
   * 3 times that (hard braking, any real landing) it is drawn flat, and from
   * 18 times (about a 60 px drop) bulging. The peaks last a step or two, so
   * each level is held a moment before the tyre springs back.
   */
  function squishTyres(ride) {
    let mass = 0;
    for (const point of ride.vehicle.bikePoints) mass += 1 / point.inverseMass;
    const restLoad = mass * GRAVITY * STEP / 2;
    for (const name of /** @type {const} */ (['rear', 'front'])) {
      const wheel = ride[name], squish = tyreSquish[name];
      const load = wheel.grounded && wheel.contact ? (wheel.groundLoad || 0) / restLoad : 0;
      const level = load >= TYRE_BULGE_LOAD ? 2 : load >= TYRE_FLAT_LOAD ? 1 : 0;
      if (!wheel.grounded || !wheel.contact) { squish.level = 0; squish.hold = 0; continue; }
      squish.dx = -wheel.contact.nx; squish.dy = -wheel.contact.ny;
      if (level >= squish.level) { squish.level = level; squish.hold = TYRE_SQUISH_HOLD; continue; }
      squish.hold -= STEP;
      if (squish.hold <= 0) { squish.level--; squish.hold = TYRE_SQUISH_HOLD; }
    }
  }

  /** Advances weather by one step; returns a thunder strike when one happens. */
  function stepWeather() {
    weather.time += STEP;
    weather.flash = Math.max(0, weather.flash - STEP * 4.5);
    const intensity = clamp(Number(trail.weather?.lightning) || 0, 0, 1);
    if (!intensity || weather.time < weather.nextLightning) return null;
    weather.distance = Math.pow(Math.random(), .75);
    const proximity = 1 - weather.distance;
    weather.flash = (.4 + intensity * .35) * (.45 + proximity * .55);
    weather.x = .15 + Math.random() * .7;
    const interval = lerp(12, 4.5, intensity);
    weather.nextLightning = weather.time + interval * (.7 + Math.random() * .65);
    return { intensity, distance: weather.distance, x: weather.x };
  }

  function update(dt) {
    for (const mark of skidMarks) mark.life -= dt;
    for (const p of particles) {
      p.life -= dt;
      if (p.drag) p.vx *= Math.exp(-p.drag * dt);
      // Particles fall unless they set their own gravity, as smoke rises.
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.gravity ?? PARTICLE_GRAVITY) * dt;
      if (p.splatter) {
        // The floor under the particle, so spray in a cave lands on the cave
        // floor instead of jumping onto the rock above it.
        const ground = terrainAt(trail, p.x, p.y - 6);
        if (ground.solid && p.y > ground.y - 1) {
          p.y = ground.y - 1;
          p.vx *= .45; p.vy = -Math.abs(p.vy) * .16;
          p.life = Math.min(p.life, .16);
        }
      }
    }
  }

  function prune() {
    removeExpired(particles, MAX_PARTICLES);
    removeExpired(skidMarks, MAX_SKID_MARKS);
  }

  return { particles, skidMarks, wheelDirt, tyreSquish, weather, reset, burst, dustPuff, exhaustPuff, brakeMarks, terrainSpray, splash, shatter, crack, waterWake, wheelGrime, squishTyres, stepWeather, update, prune };
}
