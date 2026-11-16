// The ambient light field: open sky is lit, rock blocks light, caves stay dark
// at any time of day, and ground stays bright by day but darkens with depth
// at night.
import assert from 'node:assert/strict';
import { rectangle, blockTrail } from './lib/terrain-fixtures.mjs';

const { bakeLightField, lightFieldAt, lightReach } = await import('../js/light-field.js');
const { adaptToGlare, sunVisible } = await import('../js/lighting.js');
const { glareStrength } = await import('../js/drawing.js');

let failures = 0;
const backWall = (left, top, right, bottom) => ({ ...rectangle(left, top, right, bottom, 'concrete', `back-${left}`), layer: 'back' });
const check = (label, condition, detail = '') => {
  if (!condition) { failures++; console.log('FAIL', label, detail); }
  else console.log('ok  ', label);
};

const NOON = { soak: 1400, reach: 190, open: 0.3 };
const NIGHT = { soak: 100, reach: 130, open: 0.45 };

// Ground from y 300 down to 900; a roof over it from x 600 to 1000, closed on
// the right and with a back wall behind it, makes a cave open to the left. A
// box at x 1100 holds a small sealed hollow.
const blocks = [
  rectangle(0, 300, 1400, 900, 'grass', 'ground'),
  rectangle(600, 100, 1000, 200, 'stone', 'roof'),
  rectangle(980, 200, 1000, 300, 'stone', 'wall'),
  rectangle(1100, 150, 1200, 200, 'stone', 'box-top'),
  rectangle(1100, 240, 1200, 300, 'stone', 'box-bottom'),
  rectangle(1100, 200, 1130, 240, 'stone', 'box-left'),
  rectangle(1170, 200, 1200, 240, 'stone', 'box-right'),
];
const trail = blockTrail([backWall(650, 150, 1000, 300), ...blocks]);
const noon = bakeLightField(trail, NOON);
const night = bakeLightField(trail, NIGHT);
assert.ok(noon && night, 'a trail with blocks bakes a field');

const at = (field, x, y) => lightFieldAt(field, x, y);
const cover = (field, x, y) => {
  const c = Math.floor((x - field.x) / field.unit), r = Math.floor((y - field.y) / field.unit);
  return field.cover[r * field.width + c];
};

check('open sky is fully lit', at(noon, 200, 200) === 1 && at(night, 200, 200) === 1);
check('outside the field is open sky', at(noon, -5000, 0) === 1 && at(noon, 200, -5000) === 1);
check('the cave mouth is lit', at(noon, 590, 260) > 0.9, at(noon, 590, 260));
check('deep in the cave is dark at noon', at(noon, 950, 260) < 0.15, at(noon, 950, 260));
check('deep in the cave is dark at night', at(night, 950, 260) < 0.15, at(night, 950, 260));
check('the roof blocks the sky', at(noon, 800, 80) === 1 && at(noon, 800, 240) < 0.6, at(noon, 800, 240));
check('ground surface is lit', at(noon, 200, 304) > 0.95 && at(night, 200, 304) > 0.95);
check('deep ground stays bright at noon', at(noon, 200, 800) > 0.6, at(noon, 200, 800));
check('deep ground is dark at night', at(night, 200, 600) < 0.05, at(night, 200, 600));
check('ground darkens with depth at night', at(night, 200, 320) > at(night, 200, 360) && at(night, 200, 360) > at(night, 200, 420));
check('a small sealed hollow is lit like the rock around it', at(noon, 1150, 220) > 0.8, at(noon, 1150, 220));
check('the field is all 0…1', noon.light.every((v) => v >= 0 && v <= 1) && night.light.every((v) => v >= 0 && v <= 1));
check('air never hides lights', cover(noon, 200, 200) === 0 && cover(noon, 800, 260) === 0);
check('rock hides lights below its skin', cover(noon, 200, 400) === 1 && cover(noon, 200, 302) < 0.5);
check('below the terrain is dark at night', at(night, 200, 1000) < 0.05, at(night, 200, 1000));
check('a trail without blocks has no field', bakeLightField(blockTrail([]), NOON) === null && lightFieldAt(null, 0, 0) === 1);

// Open air under a wide floating ledge sees most of the sky, so it stays lit
// by day instead of reading as a cave.
const ledgeTrail = blockTrail([
  rectangle(0, 300, 1400, 900, 'grass', 'ground'),
  rectangle(500, 100, 900, 140, 'stone', 'ledge'),
]);
const ledgeNoon = bakeLightField(ledgeTrail, NOON);
check('air under a floating ledge is lit at noon', at(ledgeNoon, 700, 250) > 0.9 && at(ledgeNoon, 700, 160) > 0.45, `${at(ledgeNoon, 700, 250)} ${at(ledgeNoon, 700, 160)}`);
check('ground under a floating ledge is lit at noon', at(ledgeNoon, 700, 304) > 0.6, at(ledgeNoon, 700, 304));

// Back walls: a hollow ring with nothing behind it sees the sky through the
// back of the scene and is lit; the same ring closed off behind is a cave.
const ring = [
  rectangle(0, 300, 1400, 900, 'grass', 'ground'),
  rectangle(400, -200, 1000, -100, 'stone', 'ring-top'),
  rectangle(400, 200, 1000, 300, 'stone', 'ring-bottom'),
  rectangle(400, -100, 500, 200, 'stone', 'ring-left'),
  rectangle(900, -100, 1000, 200, 'stone', 'ring-right'),
];
const openRing = bakeLightField(blockTrail(ring), NIGHT);
const closedRing = bakeLightField(blockTrail([...ring, backWall(420, -180, 980, 280)]), NIGHT);
check('a hollow ring with no back wall is lit inside', at(openRing, 700, 50) > 0.95, at(openRing, 700, 50));
check('the rock lining an open ring is lit', at(openRing, 700, 204) > 0.9, at(openRing, 700, 204));
check('the same ring with a back wall is dark inside', at(closedRing, 700, 50) < 0.15, at(closedRing, 700, 50));
const halfWall = bakeLightField(blockTrail([...ring, backWall(700, -180, 980, 280)]), NIGHT);
check('light fades in from the edge of a back wall', at(halfWall, 600, 50) > 0.95 && at(halfWall, 720, 50) > at(halfWall, 880, 50) && at(halfWall, 880, 50) < 0.5, `${at(halfWall, 720, 50)} ${at(halfWall, 880, 50)}`);
check('back walls never block lights', lightReach(closedRing, 700, 50, 1, 0, 150, 12) === 150);

const sky = (timeOfDay, weather) => glareStrength({ timeOfDay, weather });
check('a bright clear noon sun glares', sky(12, { sun: 1, clouds: 0.15 }) > 0.9);
check('a cloudy or weak sun does not glare', sky(12, { sun: 0.7, clouds: 0.35 }) === 0 && sky(12, { sun: 1, clouds: 1 }) === 0);
check('rain puts the glare out', sky(12, { sun: 1, clouds: 0.15, rain: 1 }) === 0);
check('the moon never glares', [21, 22, 0, 3, 4].every((hour) => sky(hour, { sun: 1, clouds: 0 }) === 0));
const clear = (hour) => sky(hour, { sun: 1, clouds: 0 });
check('the glare fades in after dawn and out by dusk', clear(5) === 0 && clear(6) < clear(7) && clear(7) <= clear(12) && clear(19) < clear(12) && clear(20) === 0);

// The sky and its sun are drawn behind everything, so terrain or a back wall
// in front of the sun hides it, and its glare fades with how much is hidden.
// Glass lets it through.
{
  const city = blockTrail([
    rectangle(0, 300, 2000, 900, 'grass', 'ground'),
    rectangle(0, -200, 300, 300, 'brick', 'tower'),
    backWall(600, -200, 900, 300),
    { ...rectangle(1200, -200, 1500, 300, 'glass', 'window'), layer: 'back' },
  ]);
  check('a sun in open sky is seen whole', sunVisible(city, 1800, 0, 36) === 1);
  check('a sun behind terrain is hidden', sunVisible(city, 150, 0, 36) === 0);
  check('and behind a back wall', sunVisible(city, 750, 0, 36) === 0);
  const edge = sunVisible(city, 300, 0, 36);
  check('a sun half behind a wall is partly seen', edge > 0.3 && edge < 0.7, edge);
  check('a sun behind glass is seen', sunVisible(city, 1350, 0, 36) === 1);
  const low = sunVisible(city, 340, 0, 45);
  check('a bigger, lower sun is still partly hidden where a smaller one is clear', sunVisible(city, 340, 0, 36) === 1 && low < 1, low);
}

// The eyes get used to the sun's glare: a sun that comes out dazzles for about
// a second, one that rises slowly hardly does, and one that ducks behind a
// pillar for a moment dazzles a little when it comes back.
{
  const watch = (glareAt, seconds, adapted = 0) => {
    let peak = 0;
    for (let time = 0; time < seconds; time += 1 / 60) {
      adapted = adaptToGlare(adapted, glareAt(time), 1 / 60);
      peak = Math.max(peak, glareAt(time) - adapted);
    }
    return { adapted, peak };
  };
  check('a steady sun never dazzles', watch(() => 1, 3, 1).peak === 0);
  const out = watch(() => 1, 3);
  check('a sun coming out dazzles', out.peak > 0.9, out.peak);
  check('and the dazzle settles within about a second', 1 - watch(() => 1, 1).adapted < 0.05 && out.adapted > 0.999);
  const slow = watch((time) => Math.min(1, time / 4), 5);
  check('a slowly rising glare hardly dazzles', slow.peak < 0.1, slow.peak);
  const blink = watch((time) => (time < 0.2 ? 0 : 1), 1, 1);
  check('a sun hidden for a moment dazzles a little', blink.peak > 0.1 && blink.peak < 0.35, blink.peak);
}

// Lights stop at the terrain: a ray into the ground goes only skin deep,
// one through open air goes its full length, and a light set slightly into
// rock still shines out.
check('light stops at the ground', Math.abs(lightReach(noon, 200, 250, 0, 1, 200, 12) - 62) < 3, lightReach(noon, 200, 250, 0, 1, 200, 12));
check('light through open air goes its full length', lightReach(noon, 200, 250, 0, -1, 200, 12) === 200);
check('light is blocked by a wall', lightReach(noon, 900, 260, 1, 0, 300, 12) < 120, lightReach(noon, 900, 260, 1, 0, 300, 12));
check('a light just inside rock still shines out', lightReach(noon, 200, 306, 0, -1, 100, 12) === 100);

// A huge trail is baked coarser rather than with ever more texels.
const wide = bakeLightField(blockTrail([rectangle(0, 300, 60000, 3000, 'grass', 'wide')]), NIGHT);
check('huge trails are baked coarser', wide.unit > 4 && wide.width * wide.height <= 2_500_000, `${wide.unit} ${wide.width}x${wide.height}`);

if (failures) {
  console.log(`\n${failures} lighting check(s) failed`);
  process.exit(1);
}
console.log('\nAll lighting checks passed.');
