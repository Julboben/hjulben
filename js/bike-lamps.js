// The bike's headlight and tail light. Each bike model lists its lamps as
// pixel art on the frame: drawn facing right with the rear axle at (-half, 0)
// and the front axle at (half, 0), -y up, on the 2-unit art grid. Lamps sit on
// the sprung body, so they pitch and drop with the suspension.
//
// drawing.js draws the lamps, and lighting.js shines the headlight and tail
// light from their lens pixels, so the glow always lands on the lamp. A new
// bike model only needs an entry in BIKE_LAMPS (test-cosmetics checks that
// every model has one).
//
// `x, y` are the top left of the lamp's rows (pieces on the body snap to the
// art grid when drawn); `rows` is pixel art: K housing, G / L / D the bike's
// paint (base, light, dark), h headlight lens, t tail-light lens, T its hot
// spot, which turns white-hot under hard braking.

import { WHEELBASE, clamp } from "./config.js";
import { cos, hypot, sin } from "./det-math.js";

export const BIKE_LAMPS = {
  // A motocross number plate on the forks with a small lamp low in it, and
  // the brake light at the tip of the rear fender.
  elasto: {
    head: {
      x: 16,
      y: -26,
      rows: [
        "LL ",
        "GGK",
        "GKh",
        "GKh",
        "DD ",
      ],
    },
    tail: { x: -36, y: -26, rows: ["T"] },
  },
  // A round lamp on the fork crown, and a block light on the rear rack.
  classic: {
    head: {
      x: 14,
      y: -24,
      rows: [
        "KK ",
        "Khh",
        "Khh",
        "KK ",
      ],
    },
    tail: { x: -23, y: -24, rows: ["Tt", "tt"] },
  },
  // A round lamp on the fork crown, and a block light on the ducktail.
  scrambler: {
    head: {
      x: 14,
      y: -24,
      rows: [
        "KK ",
        "Khh",
        "Khh",
        "KK ",
      ],
    },
    tail: { x: -23, y: -24, rows: ["Tt", "tt"] },
  },
};

const BLACK = "#1b2124";
const HEAD_LENS = { off: "#8f9a92", on: "#fff1c4" };
const TAIL_LENS = { off: "#713c35", on: "#b8392c", brake: "#ff6045", hot: "#ffd0a2" };

/**
 * The colours a lamp's rows use, for the bike's paint, whether the lights are
 * on and how hard the brake is held. The brake light works with the lights off.
 */
export function lampColors(paint, { lights = false, brakePressure = 0 } = {}) {
  const braking = brakePressure > 0.08;
  const tail = braking ? TAIL_LENS.brake : lights ? TAIL_LENS.on : TAIL_LENS.off;
  return {
    K: BLACK,
    G: paint.base,
    L: paint.light,
    D: paint.dark,
    h: lights ? HEAD_LENS.on : HEAD_LENS.off,
    t: tail,
    T: brakePressure > 0.6 ? TAIL_LENS.hot : tail,
  };
}

const lensCache = new WeakMap();

/** The centre of a lamp's lens pixels (any of `keys`), in frame units. */
function lensCentre(lamp, keys) {
  let x = 0,
    y = 0,
    count = 0;
  lamp.rows.forEach((row, r) => {
    [...row].forEach((key, c) => {
      if (!keys.includes(key)) return;
      x += lamp.x + c * 2 + 1;
      y += lamp.y + r * 2 + 1;
      count++;
    });
  });
  return count ? [x / count, y / count] : [lamp.x, lamp.y];
}

/** Where a model's headlight and tail light shine from, in frame units, before the suspension moves them. */
export function lampLenses(lamps) {
  let lenses = lensCache.get(lamps);
  if (!lenses) {
    lenses = { head: lensCentre(lamps.head, "h"), tail: lensCentre(lamps.tail, "tT") };
    lensCache.set(lamps, lenses);
  }
  return lenses;
}

/**
 * How the sprung body sits on its suspension, matching the simulated chassis:
 * its mounts ride straight above the axles, WHEELBASE apart, so the body drops
 * by the mean compression (negative when the springs are stretched and it lifts
 * away from the wheels, as a bike hanging from one wheel does) and pitches
 * nose-down by the difference over the wheelbase. `facing` picks which wheel
 * is at the back.
 */
export function bodyPose(rear, front, facing) {
  const back = (facing > 0 ? rear.compression : front.compression) || 0;
  const ahead = (facing > 0 ? front.compression : rear.compression) || 0;
  return { drop: (back + ahead) / 2, pitch: (ahead - back) / WHEELBASE };
}

/**
 * A point on the sprung body moved by the suspension, as drawBike places a
 * rigid piece of art: turned by the pitch and dropped by whole art pixels.
 */
export function posedBodyPoint([x, y], { drop, pitch }) {
  const c = cos(pitch),
    s = sin(pitch);
  return [x * c - y * s, x * s + y * c + Math.round(drop / 2) * 2];
}

const RIDER_REST_HIP = [-11, -26];
const RIDER_REST_KNEE = [2, -16];
export const RIDER_PEG = [-2, -3];
export const RIDER_THIGH = hypot(
  RIDER_REST_KNEE[0] - RIDER_REST_HIP[0],
  RIDER_REST_KNEE[1] - RIDER_REST_HIP[1],
);
export const RIDER_SHIN = hypot(
  RIDER_PEG[0] - RIDER_REST_KNEE[0],
  RIDER_PEG[1] - RIDER_REST_KNEE[1],
);

/**
 * The knee of a leg from `hip` to `ankle` with the thigh and shin the given
 * lengths, bent forward. Uses only deterministic operations so ragdoll setup
 * and rendering agree everywhere.
 */
export function riderKnee(hip, ankle, thigh = RIDER_THIGH, shin = RIDER_SHIN) {
  const dx = ankle[0] - hip[0],
    dy = ankle[1] - hip[1];
  const raw = hypot(dx, dy) || 1;
  const reach = Math.min(thigh + shin - 0.05, raw);
  const along = (reach * reach + thigh * thigh - shin * shin) / (2 * reach);
  const out = Math.sqrt(Math.max(0, thigh * thigh - along * along));
  const ux = dx / raw,
    uy = dy / raw;
  return [hip[0] + ux * along + uy * out, hip[1] + uy * along - ux * out];
}

/**
 * The seated rider's joint positions and body offsets in bike-body coordinates
 * (before suspension pitch and drop), shared by drawBike, riderBodyFrame and
 * createRagdoll. Leaning forward rises off the saddle clear of the tank with
 * the arms tucked over the bars; leaning back shifts over the rear fender with
 * braced legs and taut arms; heavy landings past sag flex the hips, shoulders
 * and elbows.
 */
export function riderSeatedPose({ leanVisual = 0, drop = 0 }, exact = false) {
  const snap = (value) => (exact ? value : Math.round(value / 2) * 2);
  const fwd = Math.max(0, leanVisual),
    back = Math.max(0, -leanVisual);
  const flex = snap(clamp((drop - 5) / 10, 0, 1) * 3);
  const hipDX = snap(fwd * 6 - back * 6);
  const hipDY = snap(-fwd * 2 + back * 2) + flex;
  const torsoDX = snap(fwd * 8 - back * 6);
  const torsoDY = snap(-fwd * 2 + back * 2) + flex;
  const headDX = torsoDX + snap(fwd * 2);
  const headDY = snap(back * 2) + flex;
  const elbowDX = fwd * 3 - back * 4.5;
  const elbowDY = -fwd * 3 + back * 0.5 + flex * 0.5;
  const hip = [RIDER_REST_HIP[0] + hipDX, RIDER_REST_HIP[1] + hipDY];
  const pegKnee = riderKnee(hip, RIDER_PEG);
  return {
    hip,
    shoulder: [-4 + torsoDX, -36 + torsoDY],
    elbow: [8 + elbowDX, -32 + elbowDY],
    hipDX,
    hipDY,
    torsoDX,
    torsoDY,
    headDX,
    headDY,
    elbowDX,
    elbowDY,
    kneeDX: pegKnee[0] - RIDER_REST_KNEE[0],
    kneeDY: pegKnee[1] - RIDER_REST_KNEE[1],
  };
}
