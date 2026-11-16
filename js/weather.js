// @ts-check
// A trail's weather: the settings, their defaults, the editor's presets, and
// the wind. Everything that blows in the wind (props, rain, snow, the wind's
// sound) reads it from here, so they all agree on how hard it blows and which
// way. Weather is decoration only: it never touches the simulation, and it is
// not part of the trail hash.

/** The weather settings that are levels from 0 to 1, in the editor's order. */
export const WEATHER_LEVELS = /** @type {const} */ ([
  "sun",
  "clouds",
  "fog",
  "rain",
  "snow",
  "lightning",
  "wind",
]);

/** Which way the wind can blow. */
export const WIND_DIRECTIONS = /** @type {const} */ (["left", "right"]);

/**
 * The weather of a new trail, and of one that leaves a setting out: a sunny
 * day with some glare, a few clouds and a light breeze from the right.
 */
export const WEATHER_DEFAULTS = Object.freeze({
  sun: 0.65,
  clouds: 0.2,
  fog: 0,
  rain: 0,
  snow: 0,
  lightning: 0,
  wind: 0.25,
  windDirection: "left",
});

/** Every setting a trail's weather may have. */
export const WEATHER_KEYS = [...WEATHER_LEVELS, "windDirection"];

/**
 * Starting points for the editor: each sets every weather setting at once,
 * and the author fine-tunes from there. The wind direction is left as it is.
 */
export const WEATHER_PRESETS = [
  { id: "clear", name: "Clear", weather: { sun: 0.8, clouds: 0.05, fog: 0, rain: 0, snow: 0, lightning: 0, wind: 0.15 } },
  { id: "breezy", name: "Breezy", weather: { sun: 0.8, clouds: 0.3, fog: 0, rain: 0, snow: 0, lightning: 0, wind: 0.45 } },
  { id: "overcast", name: "Overcast", weather: { sun: 0.3, clouds: 0.85, fog: 0.15, rain: 0, snow: 0, lightning: 0, wind: 0.3 } },
  { id: "drizzle", name: "Drizzle", weather: { sun: 0.35, clouds: 0.7, fog: 0.1, rain: 0.25, snow: 0, lightning: 0, wind: 0.25 } },
  { id: "storm", name: "Storm", weather: { sun: 0, clouds: 1, fog: 0.1, rain: 0.9, snow: 0, lightning: 0.7, wind: 0.8 } },
  { id: "sleet", name: "Sleet", weather: { sun: 0.2, clouds: 0.9, fog: 0.2, rain: 0.45, snow: 0.35, lightning: 0, wind: 0.5 } },
  { id: "blizzard", name: "Blizzard", weather: { sun: 0.1, clouds: 1, fog: 0.5, rain: 0, snow: 1, lightning: 0, wind: 0.95 } },
  { id: "gale", name: "Gale", weather: { sun: 0.6, clouds: 0.45, fog: 0, rain: 0, snow: 0, lightning: 0, wind: 1 } },
];

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/**
 * @typedef {{
 *   sun: number, clouds: number, fog: number, rain: number, snow: number,
 *   lightning: number, wind: number,
 *   windDirection: "left" | "right",
 * }} Weather
 */

/**
 * A trail's weather with every setting filled in: levels clamped to 0…1 and
 * defaults for anything left out or unreadable. Unknown settings are dropped.
 * @returns {Weather}
 */
export function resolveWeather(weather = {}) {
  const resolved = /** @type {Weather} */ ({ ...WEATHER_DEFAULTS });
  for (const key of WEATHER_LEVELS) {
    const value = Number(weather?.[key]);
    if (weather?.[key] !== undefined && weather?.[key] !== null && Number.isFinite(value))
      resolved[key] = clamp01(value);
  }
  if (WIND_DIRECTIONS.includes(weather?.windDirection)) resolved.windDirection = weather.windDirection;
  return resolved;
}

/** Which way the wind blows in the world: -1 to the left, 1 to the right. */
export function windSign(weather) {
  return weather?.windDirection === "right" ? 1 : -1;
}

/**
 * How far rain drifts sideways per unit it falls, in a wind of `strength`
 * (0…1): straight down when still, slanting more and more as the wind gets
 * up, and driven nearly flat (about 72° from upright) in a gale.
 */
export const rainSlant = (strength) => 3 * strength ** 2;

/**
 * How far snow drifts sideways per unit it falls. Flakes are lighter than
 * drops, so the same wind drives them flatter: nearly sideways (about 77°)
 * in a gale.
 */
export const snowDrift = (strength) => 4.5 * strength ** 2;
