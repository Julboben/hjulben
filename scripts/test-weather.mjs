// Weather: the settings and their defaults, the presets, the wind that props,
// rain, snow and the wind's sound all share, and rain soaking the rider. Every
// trail file spells out all of its weather.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeTrail, validateTrail } from '../js/trail-schema.js';
import { RADIUS, STEP } from '../js/config.js';
import { createEffects } from '../js/effects.js';
import { createRide, stepRide } from '../js/ride.js';
import { rectangle } from './lib/terrain-fixtures.mjs';
import {
  WEATHER_DEFAULTS, WEATHER_KEYS, WEATHER_LEVELS, WEATHER_PRESETS, WIND_DIRECTIONS,
  rainSlant, resolveWeather, snowDrift, windSign,
} from '../js/weather.js';

// Left out, unreadable or out of range, a setting falls back or is clamped;
// unknown settings are dropped.
{
  assert.deepEqual(resolveWeather(), { ...WEATHER_DEFAULTS });
  assert.deepEqual(resolveWeather(null), { ...WEATHER_DEFAULTS });
  const weather = resolveWeather({ rain: 2, snow: -1, fog: 'thick', wind: 0.7, windDirection: 'up', thunder: 1 });
  assert.equal(weather.rain, 1);
  assert.equal(weather.snow, 0);
  assert.equal(weather.fog, WEATHER_DEFAULTS.fog);
  assert.equal(weather.wind, 0.7);
  assert.equal(weather.windDirection, 'left');
  assert.ok(!('thunder' in weather));
  assert.deepEqual(Object.keys(weather).sort(), [...WEATHER_KEYS].sort());
  assert.equal(resolveWeather({ windDirection: 'right' }).windDirection, 'right');
  assert.equal(windSign(resolveWeather({ windDirection: 'right' })), 1);
  assert.equal(windSign(resolveWeather()), -1);
}

// A loaded trail has every setting, and a bad direction is an error.
{
  const trail = normalizeTrail({ name: 'test', weather: { rain: 0.4, thunder: 0.8 } });
  assert.deepEqual(Object.keys(trail.weather).sort(), [...WEATHER_KEYS].sort());
  assert.equal(trail.weather.rain, 0.4);
  trail.weather.windDirection = 'up';
  assert.ok(validateTrail(trail).some((m) => m.type === 'error' && /windDirection/.test(m.text)));
}

// Rain falls straight down in a calm, slants more as the wind gets up, and
// is driven nearly flat in a gale; snow, being lighter, flatter still.
{
  const degrees = (drift) => (Math.atan(drift) * 180) / Math.PI;
  assert.equal(rainSlant(0), 0);
  assert.equal(snowDrift(0), 0);
  for (let wind = 0.1; wind <= 1; wind += 0.1) {
    assert.ok(rainSlant(wind) > rainSlant(wind - 0.1), `rain slants more at ${wind}`);
    assert.ok(snowDrift(wind) > rainSlant(wind), `snow drifts more than rain at ${wind}`);
  }
  assert.ok(degrees(rainSlant(0.25)) < 15, 'a breeze barely tilts the rain');
  assert.ok(degrees(rainSlant(1)) > 70 && degrees(snowDrift(1)) > 75, 'a gale lays them nearly flat');
}

// Each preset sets every level, within 0…1, and leaves the direction alone.
{
  const ids = new Set();
  for (const preset of WEATHER_PRESETS) {
    assert.ok(!ids.has(preset.id), `${preset.id} is unique`);
    ids.add(preset.id);
    assert.deepEqual(Object.keys(preset.weather).sort(), [...WEATHER_LEVELS].sort(), preset.id);
    for (const value of Object.values(preset.weather)) assert.ok(value >= 0 && value <= 1, preset.id);
  }
}

// Every trail file spells out all of its weather, and nothing else.
{
  const root = join(import.meta.dirname, '..', 'trails');
  let count = 0;
  for (const folder of ['official', 'bonus', 'custom']) {
    for (const file of readdirSync(join(root, folder)).filter((name) => name.endsWith('.json'))) {
      const { weather } = JSON.parse(readFileSync(join(root, folder, file), 'utf8'));
      assert.deepEqual(Object.keys(weather || {}).sort(), [...WEATHER_KEYS].sort(), `${folder}/${file}`);
      assert.deepEqual(resolveWeather(weather), weather, `${folder}/${file} is in range`);
      count++;
    }
  }
  assert.ok(count > 30);
}

// Rain soaks a rider standing out in it slowly and from the top down, never
// through, while a roof keeps one dry.
{
  const rainy = (rain, blocks = []) => normalizeTrail({
    // Set on the ground, under any roof, rather than on the topmost surface.
    name: 'Rain', start: { x: 120, y: 320 - RADIUS, facing: 1 }, finish: { x: 1400, y: null }, apples: [], spikes: [],
    terrainBlocks: [rectangle(0, 320, 1600, 620, 'grass', 'ground'), ...blocks],
    weather: { rain, wind: 0 },
  });
  const standFor = (trail, seconds) => {
    const ride = createRide(trail), effects = createEffects();
    effects.reset(trail);
    for (let step = 0; step < Math.round(seconds / STEP); step++) {
      stepRide(ride, { braking: true });
      effects.riderWetness(ride);
    }
    return { ...effects.riderWet };
  };
  const storm = standFor(rainy(0.9), 30);
  assert.ok(storm.head > 0.7 && storm.head < 0.8, `a storm soaks the head as far as it will (${storm.head})`);
  assert.ok(storm.head > storm.body && storm.body > storm.legs && storm.legs > storm.boots && storm.boots > 0.3, 'from the top down');
  const early = standFor(rainy(0.9), 5);
  assert.ok(early.head > 0.1 && early.head < 0.3, `and slowly (${early.head})`);
  const drizzle = standFor(rainy(0.25), 30);
  assert.ok(drizzle.head > 0.15 && drizzle.head < 0.25, `a drizzle only dampens (${drizzle.head})`);
  // A roof well over the rider's head, reaching past them on both sides.
  const sheltered = standFor(rainy(0.9, [rectangle(0, 200, 400, 230, 'stone', 'roof')]), 10);
  assert.deepEqual(sheltered, { boots: 0, legs: 0, body: 0, head: 0 }, 'a roof keeps the rider dry');
  assert.deepEqual(standFor(rainy(0), 10), { boots: 0, legs: 0, body: 0, head: 0 }, 'no rain, no wet');
}

console.log('Weather tests passed.');
