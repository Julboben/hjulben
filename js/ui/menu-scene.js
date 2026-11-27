// The menu's backdrop: the rider's next trail, drawn live by the game's own
// renderer at half the ride's zoom, with the rider waiting at the start. The
// camera starts on the rider, glides along the trail to near the finish and
// back, and rises and falls with the ground, smoothed so it never bobs over
// bumps. Clouds, rain, water and animals move as they do on a ride.
import { STEP } from '../config.js';
import { createRenderer } from '../render.js';
import { createEffects } from '../effects.js';
import { posedRide } from '../scene-preview.js';
import { surfaceProfile } from '../trail-preview.js';
import { sameLook } from '../cosmetics.js';

// Device pixels per art pixel on a screen of one device pixel per CSS
// pixel: half the ride's, so twice the trail is in view.
const PIXEL_SCALE = 2;
// World units a second along the trail: one device pixel a frame at 60 frames
// a second on a sharp screen, so the glide never steps unevenly.
const GLIDE_SPEED = 30;
// The camera turns this far short of the finish, in view widths.
const TURN_BEFORE_FINISH = 0.2;
// How far either side of the camera the ground is averaged for its height.
const GROUND_REACH = 300;
// Where the ground sits, as a fraction of the view's height from the top.
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
     * Shows `trail` with the rider in `look` at its start. Calls with the
     * same trail and look keep the camera where it is.
     */
    show(trail, look, headlights) {
      if (scene?.trail === trail && sameLook(scene.look, look) && scene.headlights === headlights) return;
      const ride = posedRide(trail);
      scene = { trail, ride, look, headlights, ground: smoothedGround(trail), riderX: (ride.rear.x + ride.front.x) / 2 };
      renderer.reset(trail, ride.facing);
      renderer.setHeadlights(headlights);
      renderer.settleHair(ride, look);
      effects.reset(trail);
      time = 0;
      weatherTime = 0;
    },

    /**
     * Draws the scene `dt` seconds on, `viewWidth` × `viewHeight` CSS pixels,
     * with the camera's point `focus` of the way across: the middle of the
     * part of the menu the trail is seen in.
     */
    draw({ viewWidth, viewHeight, dt, focus, full }) {
      if (!scene || !viewWidth || !viewHeight) return;
      // Drawn at the screen's own resolution, so the camera moves by device
      // pixels, as on a ride, rather than in steps of several.
      const deviceScale = Math.max(1, Math.round(PIXEL_SCALE * Math.min(window.devicePixelRatio || 1, 2.5)));
      if (viewWidth !== width || viewHeight !== height || deviceScale !== scale) {
        width = viewWidth;
        height = viewHeight;
        scale = deviceScale;
        renderer.setViewport(width, height, scale);
      }
      time += dt;
      for (weatherTime += dt; weatherTime >= STEP; weatherTime -= STEP) effects.stepWeather();
      effects.update(dt);
      const { trail, ride, riderX } = scene;
      const direction = Math.sign(trail.finish.x - trail.start.x) || 1;
      const turn = trail.finish.x - direction * renderer.width * TURN_BEFORE_FINISH;
      // Short trails, whose turn comes before the rider, keep still on the rider.
      const span = (turn - riderX) * direction > 0 ? turn - riderX : 0;
      let x = riderX;
      if (span) {
        // Out and back, easing at both ends.
        const period = 2 * Math.abs(span) / GLIDE_SPEED;
        const phase = (time % period) / period;
        const there = phase < 0.5 ? phase * 2 : 2 - phase * 2;
        x += span * there * there * (3 - 2 * there);
      }
      view.x = x - renderer.width * focus;
      view.y = groundAt(x) - renderer.height * GROUND_LINE;
      renderer.draw({ ride, ghost: null, camera, effects, look: scene.look, state: 'ready', full, dt, debug: false });
    }
  };
}
