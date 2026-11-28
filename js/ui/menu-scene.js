// The menu's backdrop: the rider's next trail, drawn live by the game's own
// renderer at half the ride's zoom, with the rider waiting at the start. The
// camera rests on the rider, glides along the trail to near the finish,
// rests there and glides back, rising and falling with the ground, smoothed
// so it never bobs over bumps. Clouds, rain, water and animals move as they
// do on a ride. Over a ride left for the menu, it shows that ride as it was
// left, ghost, tracks and all, with the camera resting on the rider and the
// whole scene held still, as a paused ride is, to carry on from there. The
// menu flies the camera between the backdrop and the ride's own view as it
// opens over a ride and goes back to it (see startFlight in menu.js).
import { STEP } from '../config.js';
import { ART_PIXEL } from '../drawing.js';
import { createRenderer } from '../render.js';
import { createEffects } from '../effects.js';
import { posedRide } from '../scene-preview.js';
import { surfaceProfile } from '../trail-preview.js';
import { sameLook } from '../cosmetics.js';
import { rideFocus } from '../ride.js';

// Device pixels per art pixel on a screen of one device pixel per CSS
// pixel: half the ride's, so twice the trail is in view.
const PIXEL_SCALE = 2;
// World units a second along the trail: one device pixel a frame at 60 frames
// a second when drawn sharp, so the glide never steps unevenly.
const GLIDE_SPEED = 30;
// Seconds the glide takes to reach that speed, and to stop again.
const GLIDE_RAMP = 2;
// Seconds the camera rests at each end.
const REST = 3;
// The camera turns this far short of the finish, in view widths.
const TURN_BEFORE_FINISH = 0.2;
// How far either side of the camera the ground is averaged for its height.
const GROUND_REACH = 300;
// Where the ground sits, or the rider of a ride left for the menu, as a
// fraction of the view's height from the top.
const GROUND_LINE = 0.7;
// The spacing of the ground samples, in world units.
const GROUND_STEP = 8;

/** @param {HTMLCanvasElement} canvas */
export function createMenuScene(canvas) {
  const renderer = createRenderer(canvas);
  const effects = createEffects();
  const view = { x: 0, y: 0 };
  const camera = { follow() {}, view: () => view };
  let scene = null;
  let width = 0, height = 0, scale = 0;
  let time = 0;
  // Weather steps with the physics on a ride; here it keeps the same pace.
  let weatherTime = 0;

  /** The ground's height along the route, averaged over GROUND_REACH either side, by x. */
  function smoothedGround(trail) {
    const points = surfaceProfile(trail, GROUND_STEP).filter(point => point.y !== null);
    return points.map(point => {
      let sum = 0, count = 0;
      for (const other of points) {
        if (Math.abs(other.x - point.x) <= GROUND_REACH) { sum += other.y; count++; }
      }
      return { x: point.x, y: sum / count };
    }).sort((a, b) => a.x - b.x);
  }

  /**
   * The view's top left, `width` × `height` world units, resting on the
   * rider of a ride left for the menu, `focus` of the way across.
   */
  const restOn = (held, width, height, focus) => ({ x: held.x - width * focus, y: held.y - height * GROUND_LINE });

  /** Where the glide has the camera, by x: resting on the rider, gliding or resting near the finish. */
  function glideX() {
    const { trail, riderX } = scene;
    const direction = Math.sign(trail.finish.x - trail.start.x) || 1;
    const turn = trail.finish.x - direction * renderer.width * TURN_BEFORE_FINISH;
    // Short trails, whose turn comes before the rider, keep still on the rider.
    const span = (turn - riderX) * direction > 0 ? turn - riderX : 0;
    if (!span) return riderX;
    // Rest, glide out, rest, glide back.
    const glide = glideTime(Math.abs(span));
    const t = time % (2 * (REST + glide));
    const out = t - REST, back = t - 2 * REST - glide;
    if (out >= 0 && out < glide) return riderX + Math.sign(span) * glided(out, Math.abs(span));
    if (out >= glide && back < 0) return riderX + span;
    if (back >= 0) return riderX + span - Math.sign(span) * glided(back, Math.abs(span));
    return riderX;
  }

  /** The smoothed ground's height at `x`, between the samples either side. */
  function groundAt(x) {
    const { ground, ride } = scene;
    if (!ground.length) return (ride.rear.y + ride.front.y) / 2;
    const after = ground.findIndex(point => point.x >= x);
    if (after <= 0) return ground[after < 0 ? ground.length - 1 : 0].y;
    const a = ground[after - 1], b = ground[after];
    return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x || 1);
  }

  return {
    /**
     * Shows `trail` with the rider in `look` at its start, or `left`, a ride
     * left for the menu, as it was: its `ride`, `ghost` and `ghostLook`, the
     * `effects` it was drawn with, which carry on here, and the `trails` behind
     * its riders (see the renderer's), held as they were. Calls with the same
     * trail, look and ride keep the camera where it is.
     */
    show(trail, look, headlights, left = null) {
      if (scene?.trail === trail && sameLook(scene.look, look) && scene.headlights === headlights && scene.left?.ride === left?.ride) return;
      const ride = left?.ride ?? posedRide(trail);
      scene = {
        trail, ride, look, headlights, left, effects: left?.effects ?? effects,
        // The camera rests on a ride left for the menu, at the point the
        // ride's own camera follows, and glides along the ground otherwise.
        held: left ? rideFocus(ride) : null,
        ground: left ? null : smoothedGround(trail), riderX: (ride.rear.x + ride.front.x) / 2,
      };
      renderer.reset(trail, ride.facing);
      renderer.setHeadlights(headlights);
      if (left) renderer.trails = left.trails;
      else {
        renderer.settleHair(ride, look);
        effects.reset(trail);
      }
      time = 0;
      weatherTime = 0;
    },

    /**
     * Forgets a ride left for the menu, which moves on once the menu closes,
     * so it is shown afresh, where it is then, the next time.
     */
    forgetRide() {
      if (scene?.left) scene = null;
    },

    /** The trail shown, or null before the first. */
    get trail() {
      return scene?.trail ?? null;
    },

    /** The last frame's view (see the renderer's lastView). */
    lastView: () => renderer.lastView(),

    /** The scene's clock and weather clock, for a ride to carry on from. */
    clocks: () => ({ scene: renderer.clock, weather: scene.effects.weather.time }),

    /** Sets the scene's clock (see clocks), to carry on from a ride's. */
    setClock(ms) {
      renderer.clock = ms;
    },

    /**
     * The view a left ride's backdrop rests in, drawn `viewWidth` ×
     * `viewHeight` CSS pixels with the camera's point `focus` of the way
     * across (see draw): its top left and size, in world units.
     */
    restingView(viewWidth, viewHeight, focus) {
      const width = Math.ceil(viewWidth / ART_PIXEL) * ART_PIXEL, height = Math.ceil(viewHeight / ART_PIXEL) * ART_PIXEL;
      return { ...restOn(scene.held, width, height, focus), width, height };
    },

    /**
     * Draws the scene `dt` seconds on, or as it is for a ride left for the
     * menu, `viewWidth` × `viewHeight` CSS pixels, with the camera's point
     * `focus` of the way across: the middle of the part of the menu the trail
     * is seen in. `sharp` draws it at the screen's own resolution, for when it
     * is the view itself rather than a backdrop behind a veil; `pace` speeds
     * the camera up or slows it down. `at`, the view's top left in world
     * units, holds the camera there instead.
     */
    draw({ viewWidth, viewHeight, dt, focus, full, sharp, pace, at = null }) {
      if (!scene || !viewWidth || !viewHeight) return;
      // Sharp, the camera moves by device pixels, as on a ride, rather than
      // in steps of several; behind a veil, a quarter of the pixels will do.
      const pixelRatio = sharp ? Math.min(window.devicePixelRatio || 1, 2.5) : 1;
      const deviceScale = Math.max(1, Math.round(PIXEL_SCALE * pixelRatio));
      if (viewWidth !== width || viewHeight !== height || deviceScale !== scale) {
        width = viewWidth;
        height = viewHeight;
        scale = deviceScale;
        renderer.setViewport(width, height, scale);
      }
      const { ride, held, left } = scene;
      const step = left ? 0 : dt;
      time += step * pace;
      for (weatherTime += step; weatherTime >= STEP; weatherTime -= STEP) scene.effects.stepWeather();
      scene.effects.update(step);
      if (at) Object.assign(view, at);
      else if (held) Object.assign(view, restOn(held, renderer.width, renderer.height, focus));
      else {
        const x = glideX();
        Object.assign(view, { x: x - renderer.width * focus, y: groundAt(x) - renderer.height * GROUND_LINE });
      }
      renderer.draw({
        ride, ghost: left?.ghost ?? null, ghostLook: left?.ghostLook, camera, effects: scene.effects, look: scene.look,
        state: 'ready', full, dt: step, debug: false
      });
    }
  };
}

// A glide of `distance` gathers speed over GLIDE_RAMP seconds, holds it and
// slows to a stop over GLIDE_RAMP again; a short one never reaches full speed.
const glideSpeed = distance => Math.min(GLIDE_SPEED, distance / GLIDE_RAMP);
/** The seconds a glide of `distance` takes. */
const glideTime = distance => distance / glideSpeed(distance) + GLIDE_RAMP;
/** How far a glide of `distance` has gone after `t` seconds. */
function glided(t, distance) {
  const speed = glideSpeed(distance), total = glideTime(distance), rate = speed / GLIDE_RAMP;
  if (t < GLIDE_RAMP) return rate * t * t / 2;
  if (t > total - GLIDE_RAMP) return distance - rate * (total - t) ** 2 / 2;
  return speed * (t - GLIDE_RAMP / 2);
}
