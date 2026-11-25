// The ambient light field: open sky is lit, rock blocks light, caves stay dark
// at any time of day, and ground stays bright by day but darkens with depth
// at night.
import assert from 'node:assert/strict';
import { rectangle, blockTrail } from './lib/terrain-fixtures.mjs';

const { NOON_LIGHT, bakeLightField, bakeSunShafts, daylightField, lightFieldAt, lightFieldBlend, lightReach } = await import('../js/light-field.js');
const { backWallShade } = await import('../js/terrain-render.js');
const { adaptToGlare, sunVisible } = await import('../js/lighting.js');
const { glareStrength, sunRays } = await import('../js/drawing.js');

let failures = 0;
const backWall = (left, top, right, bottom) => ({ ...rectangle(left, top, right, bottom, 'concrete', `back-${left}`), layer: 'back' });
const check = (label, condition, detail = '') => {
  if (!condition) { failures++; console.log('FAIL', label, detail); }
  else console.log('ok  ', label);
};

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
const noon = bakeLightField(trail, NOON_LIGHT);
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
check('a trail without blocks has no field', bakeLightField(blockTrail([]), NOON_LIGHT) === null && lightFieldAt(null, 0, 0) === 1);

// Open air under a wide floating ledge sees most of the sky, so it stays lit
// by day instead of reading as a cave.
const ledgeTrail = blockTrail([
  rectangle(0, 300, 1400, 900, 'grass', 'ground'),
  rectangle(500, 100, 900, 140, 'stone', 'ledge'),
]);
const ledgeNoon = bakeLightField(ledgeTrail, NOON_LIGHT);
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

// Back walls are shaded by noon's daylight, whatever the hour: in a cave as
// dark and cool as ever, and where daylight reaches, lighter and keeping their
// material's own colour.
const [darkRed, darkGreen, darkBlue] = backWallShade(0);
const [litRed, litGreen, litBlue] = backWallShade(1);
check('a back wall without daylight is dark and cool', darkBlue > darkRed && darkBlue <= 0.6);
check('a back wall in daylight is lighter and neutral', litRed > darkRed && litGreen > darkGreen && litRed >= litGreen && litGreen >= litBlue && litRed - litBlue < 0.05);
const halfTrail = blockTrail([...ring, backWall(700, -180, 980, 280)]);
const daylight = daylightField(halfTrail);
const noonLight = bakeLightField(halfTrail, NOON_LIGHT).light;
check('daylight is noon\'s light, baked once', daylight.light.every((v, i) => v === noonLight[i]) && daylightField(halfTrail) === daylight);
const shadeAt = (field, x, y) => backWallShade(lightFieldBlend(field, x, y));
const closedDaylight = daylightField(blockTrail([...ring, backWall(420, -180, 980, 280)]));
check('a back wall in a closed cave keeps the dark shade', shadeAt(closedDaylight, 700, 50).every((v, i) => v === backWallShade(0)[i]));
check('a back wall lightens towards the daylight at its edge', shadeAt(daylight, 720, 50)[0] > shadeAt(daylight, 880, 50)[0], `${shadeAt(daylight, 720, 50)} ${shadeAt(daylight, 880, 50)}`);
const centre = (c, r) => [daylight.x + (c + 0.5) * daylight.unit, daylight.y + (r + 0.5) * daylight.unit];
const [cx, cy] = centre(170, 40), [nx] = centre(171, 40);
const blended = lightFieldBlend(daylight, (cx + nx) / 2, cy);
check('the blend matches the texels at their centres and lies between them', lightFieldBlend(daylight, cx, cy) === lightFieldAt(daylight, cx, cy) && blended >= Math.min(lightFieldAt(daylight, cx, cy), lightFieldAt(daylight, nx, cy)) && blended <= Math.max(lightFieldAt(daylight, cx, cy), lightFieldAt(daylight, nx, cy)));

const sky = (timeOfDay, weather) => glareStrength({ timeOfDay, weather });
check('a bright clear noon sun glares', sky(12, { sun: 1, clouds: 0.15 }) > 0.9);
check('a weak sun does not glare', sky(12, { sun: 0.6, clouds: 0 }) === 0);
check('clouds alone do not dim the sun, only one passing in front', sky(12, { sun: 1, clouds: 1 }) === sky(12, { sun: 1, clouds: 0 }));
check('rain puts the glare out', sky(12, { sun: 1, clouds: 0.15, rain: 1 }) === 0);
check('the moon never glares', [21, 22, 0, 3, 4].every((hour) => sky(hour, { sun: 1, clouds: 0 }) === 0));
const clear = (hour) => sky(hour, { sun: 1, clouds: 0 });
check('the glare fades in after dawn and out by dusk', clear(5) === 0 && clear(6) < clear(7) && clear(7) <= clear(12) && clear(19) < clear(12) && clear(20) === 0);

// Sunbeams show best with a low sun and in light haze, and thick fog, storms
// and the moon put them out.
{
  const rays = (timeOfDay, weather) => sunRays({ timeOfDay, weather: { sun: 1, clouds: 0, ...weather } });
  const noon = rays(12), evening = rays(19), haze = rays(12, { fog: 0.25 });
  check('a clear noon has full rays', noon.strength === 1 && noon.longer === 1 && noon.warmth === 0);
  check('a low sun keeps its rays longer and warmer than its glare', evening.strength > clear(19) && evening.longer > 1 && evening.warmth > 0, JSON.stringify(evening));
  check('light haze shows the rays best', haze.strength > noon.strength && haze.longer > noon.longer, JSON.stringify(haze));
  check('thick fog hides them', rays(12, { fog: 0.8 }).strength === 0 && rays(12, { fog: 0.55 }).strength < haze.strength);
  check('rain and the moon put them out', rays(12, { rain: 1 }).strength === 0 && rays(0).strength === 0);
}

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

// Sunbeams: the sun shines down its slant through a gap in a cave's roof in
// a beam that stops at the floor. A gap too narrow for the roof's thickness
// lets none through, a wide opening lights the cave too much for a strong
// beam, and open ground has none.
{
  const cave = (roof) => blockTrail([
    rectangle(-400, 300, 600, 1000, 'grass', 'left'), ...roof, rectangle(1700, 300, 2400, 1000, 'grass', 'right'),
    rectangle(600, 600, 1700, 1000, 'stone', 'floor'), backWall(600, 380, 1700, 600),
  ]);
  const beams = (trail) => {
    const field = bakeLightField(trail, NOON_LIGHT);
    const values = bakeSunShafts(field, 0.5);
    return (x, y) => {
      const c = Math.floor((x - field.x) / field.unit),
        r = Math.floor((y - field.y) / field.unit);
      return values && c >= 0 && r >= 0 && c < field.width && r < field.height ? values[r * field.width + c] : 0;
    };
  };
  const strongest = (beam) => {
    let most = 0;
    for (let x = 600; x < 1700; x += 4) for (let y = 384; y < 600; y += 4) most = Math.max(most, beam(x, y));
    return most;
  };
  // Holes 30 and 60 wide in a roof 80 thick; a beam through the second
  // slants down to the left, half as far across as it falls. Its edges are
  // soft, so faint light (under FAINT) spills a little beside it.
  const FAINT = 0.05;
  const holes = beams(cave([rectangle(600, 300, 1000, 380, 'stone', 'a'), rectangle(1030, 300, 1300, 380, 'stone', 'b'), rectangle(1360, 300, 1700, 380, 'stone', 'c')]));
  check('the sun shines through a hole in a cave roof', holes(1250, 500) > 0.15, holes(1250, 500));
  check('in a slanting beam, and nowhere else', holes(1330, 500) < FAINT && holes(900, 500) < FAINT && holes(1200, 592) > 0.15);
  check('not through a hole too narrow for the roof', strongest((x, y) => (x < 1100 ? holes(x, y) : 0)) < FAINT);
  check('nor inside the rock', holes(1100, 340) === 0 && holes(1250, 640) === 0);
  const wide = beams(cave([rectangle(600, 300, 1000, 380, 'stone', 'a')]));
  check('a wide opening gives only a faint beam', strongest(wide) < strongest(holes) / 2, `${strongest(wide)} ${strongest(holes)}`);
  const open = beams(blockTrail([rectangle(0, 300, 2000, 900, 'grass', 'ground')]));
  let most = 0;
  for (let x = 0; x < 2000; x += 8) for (let y = 0; y < 300; y += 8) most = Math.max(most, open(x, y));
  check('open ground has no beams', most === 0, most);
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
