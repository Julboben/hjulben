import { bodyPose, riderSeatedPose } from './bike-lamps.js';

const HAIR_STEP = 1 / 120;
const HAIR_MAX_STEPS = 4;
// Where the hair's tail leaves the head: high on the back of the crown when
// the hair is open, and out from under the back rim of a full-face or MX shell.
const HAIR_ROOT = [-9, -46];
const HAIR_SHELL_ROOT = [-9, -40];
const HAIR_REST = [-.55, .84];
// How much the hair hangs the way HAIR_REST points in the world rather than
// on the rider's body. Upright the two agree; as the rider tips, in a
// wheelie or hanging off a cliff, the hair keeps hanging towards the ground
// as it does once they are thrown off, instead of turning with them.
const HAIR_WORLD = .9;
// The tails a hair cut can have (see lookParts().hair.tail): the lengths of
// their chain's links, from the root out. A braid is longer than a ponytail.
const HAIR_TAILS = {
  ponytail: [4, 4, 4, 4, 4],
  braid: [4, 4, 4, 4, 4, 4],
};
/** Whether a hair tail has art and a chain (see HAIR_TAILS). */
export const hasHairTail = tail => Object.hasOwn(HAIR_TAILS, tail);
// The ponytail's strands; each one's colour is the matching entry of the
// cut's `strands`.
const PONYTAIL_STRANDS = [
  { offset: -1, reach: .7, width: 2 },
  { offset: 1, reach: 1, width: 2 },
  { offset: 0, reach: .9, width: 3 }
];

// What trails behind the rider (see lookParts().accessory): where it leaves
// the body and the way it hangs, in body coordinates as HAIR_ROOT and
// HAIR_REST, its links' lengths, and its width from the root to the tip. A
// cape hangs from the shoulders and flares out; a scarf's loose end streams
// from the neck, and a ribbon from the shoulder. `gravity` scales the pull
// down: a balloon's string, below zero, floats up, with the balloon drawn
// at its end. A `tip` is the share of the length, from the end, in white,
// like a corgi's tail. A cape is drawn `behindHair`, under the hair's tail;
// the rest go over it, so the hair doesn't cut a thin one into pieces.
const ACCESSORIES = {
  cape: { root: [-9, -37], rest: [-.95, .3], lengths: [4, 4, 4, 4, 4], width: [3, 5], ragdoll: 2, gravity: .3, behindHair: true },
  scarf: { root: [-6, -38], rest: [-.9, .25], lengths: [3, 3, 3, 3, 3], width: [2, 2], ragdoll: 0 },
  ribbon: { root: [-7, -37], rest: [-.95, .15], lengths: [4, 4, 4, 4, 4, 4, 4], width: [2, 2], ragdoll: 0 },
  balloon: { root: [-10, -34], rest: [-.45, -.9], lengths: [4, 4, 4, 4], width: [1, 1], ragdoll: 0, gravity: -.6, balloon: true },
  'corgi-tail': { root: [-14, -28], rest: [-.85, -.45], lengths: [5, 5, 5, 5], width: [2, 3], ragdoll: 4, tip: .25, gravity: .35 },
};
/** Whether a trailing shape has art and a chain (see ACCESSORIES). */
export const hasTrailArt = shape => Object.hasOwn(ACCESSORIES, shape);

// The balloon's rows from the top down to its knot, as half widths in art
// pixels either side of the string's end.
const BALLOON_ROWS = [1, 2, 2, 2, 2, 1.5, 1, .5];
const BALLOON_SHINE = '#fff8e7';
const TAIL_TIP = '#fff8e7';
const STRING = '#e8e5d9';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

// Maps rider-local coordinates onto a bike pose the same way drawBike does.
// Without `exact`, positions snap to the pixel grid drawBike renders on.
export function riderBodyFrame({ rear, front, facing = 1, flipVisual = facing, leanVisual = 0 }, exact = false) {
  const snap = (value, step) => exact ? value : Math.round(value / step) * step;
  const mx = snap((rear.x + front.x) / 2, 1);
  const my = snap((rear.y + front.y) / 2, 1);
  const angle = Math.atan2(front.y - rear.y, front.x - rear.x);
  const suspension = bodyPose(rear, front, facing);
  const bodyDrop = snap(suspension.drop, 2);
  const bodyPitch = suspension.pitch;
  const seated = riderSeatedPose({ leanVisual, drop: suspension.drop }, exact);
  const cosPitch = Math.cos(bodyPitch), sinPitch = Math.sin(bodyPitch);
  const cosAngle = Math.cos(angle), sinAngle = Math.sin(angle);
  const rotate = (localX, localY, drop) => {
    const pitchedX = localX * cosPitch - localY * sinPitch;
    const pitchedY = localX * sinPitch + localY * cosPitch + drop;
    const flippedX = pitchedX * flipVisual;
    return { x: cosAngle * flippedX - sinAngle * pitchedY, y: sinAngle * flippedX + cosAngle * pitchedY };
  };
  return {
    point(localX, localY) {
      const offset = rotate(localX + seated.torsoDX, localY + seated.torsoDY, bodyDrop);
      return { x: mx + offset.x, y: my + offset.y };
    },
    headPoint(localX, localY) {
      const offset = rotate(localX + seated.headDX, localY + seated.headDY, bodyDrop);
      return { x: mx + offset.x, y: my + offset.y };
    },
    direction(localX, localY) {
      const direction = rotate(localX, localY, 0);
      const length = Math.hypot(direction.x, direction.y) || 1;
      return { x: direction.x / length, y: direction.y / length };
    }
  };
}

/**
 * Where the hair's tail leaves the head on a bike pose, with `forward`, the
 * unit direction the rider faces along their body, which points from the
 * root into the head however the rider is turned.
 */
export function hairRoot(pose, exact, shelled = false) {
  const [x, y] = shelled ? HAIR_SHELL_ROOT : HAIR_ROOT;
  const frame = riderBodyFrame(pose, exact);
  return { ...frame.headPoint(x, y), forward: frame.direction(1, 0) };
}

export function hairRestDirection(pose) {
  const body = riderBodyFrame(pose, true).direction(HAIR_REST[0], HAIR_REST[1]);
  const world = freeHairRestDirection(pose.flipVisual ?? pose.facing);
  const x = body.x * (1 - HAIR_WORLD) + world.x * HAIR_WORLD;
  const y = body.y * (1 - HAIR_WORLD) + world.y * HAIR_WORLD;
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

export function freeHairRestDirection(facing) {
  const length = Math.hypot(HAIR_REST[0], HAIR_REST[1]);
  return { x: HAIR_REST[0] * facing / length, y: HAIR_REST[1] / length };
}

export function hairBackSupport(pose) {
  const frame = riderBodyFrame(pose, true);
  const top = frame.point(-9, -35);
  const bottom = frame.point(-15, -25);
  const outside = frame.point(-14, -30);
  const inside = frame.point(-12, -29);
  const dx = outside.x - inside.x, dy = outside.y - inside.y;
  const length = Math.hypot(dx, dy) || 1;
  const bx = bottom.x - top.x, by = bottom.y - top.y;
  return { top, bx, by, lengthSquared: bx * bx + by * by || 1, nx: dx / length, ny: dy / length };
}

function pushOutOfBack(point, back) {
  const t = clamp(((point.x - back.top.x) * back.bx + (point.y - back.top.y) * back.by) / back.lengthSquared, 0, 1);
  const clearance = (point.x - back.top.x - back.bx * t) * back.nx + (point.y - back.top.y - back.by * t) * back.ny;
  if (clearance < 2) {
    point.x += back.nx * (2 - clearance);
    point.y += back.ny * (2 - clearance);
  }
}

function catmullRom(points, samplesPerSegment) {
  const curve = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let sample = 0; sample < samplesPerSegment; sample++) {
      const t = sample / samplesPerSegment, t2 = t * t, t3 = t2 * t;
      curve.push([0, 1].map(axis => .5 * (2 * p1[axis] + (p2[axis] - p0[axis]) * t
        + (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2
        + (3 * p1[axis] - p0[axis] - 3 * p2[axis] + p3[axis]) * t3)));
    }
  }
  curve.push(points.at(-1));
  return curve;
}

/** Where an accessory leaves the body on a bike pose; see hairRoot. */
export function accessoryRoot(pose, shape, exact) {
  const [x, y] = ACCESSORIES[shape].root;
  return riderBodyFrame(pose, exact).point(x, y);
}

/** The way an accessory hangs at rest on a bike pose; see hairRestDirection. */
export function accessoryRestDirection(pose, shape) {
  const [x, y] = ACCESSORIES[shape].rest;
  return riderBodyFrame(pose, true).direction(x, y);
}

/** Where an accessory leaves the thrown rider, behind their shoulder. */
export function freeAccessoryRoot(shoulder, facing, shape) {
  return { x: shoulder.x - facing * ACCESSORIES[shape].ragdoll, y: shoulder.y };
}

/** The way an accessory hangs from the thrown rider. */
export function freeAccessoryRestDirection(facing, shape) {
  const [x, y] = ACCESSORIES[shape].rest;
  const length = Math.hypot(x, y);
  return { x: x * facing / length, y: y / length };
}

/**
 * A chain of links trailing from `root`, swinging with the rider, pulled by
 * gravity and blown back by their speed, and kept off their back and the
 * ground: the simulation under the hair's tail and the accessories.
 */
function createChain(root, rest, lengths, pull = 1) {
  let { x, y } = root;
  const hair = {
    accumulator: 0,
    root: { ...root },
    points: lengths.map(length => {
      x += rest.x * length;
      y += rest.y * length + length * .3 * pull;
      return { x, y, px: x, py: y };
    })
  };

  function step(h, from, to, blend, rest, back, groundAt) {
    const anchor = { x: lerp(from.x, to.x, blend), y: lerp(from.y, to.y, blend) };
    const anchorVX = anchor.x - hair.root.x, anchorVY = anchor.y - hair.root.y;
    hair.root = anchor;
    const follow = 1 - Math.exp(-12 * h);
    const wind = 3.5 * h;
    const gravity = 620 * h * h * pull;
    const points = hair.points;
    let parent = anchor, parentDirection = rest;
    points.forEach((point, index) => {
      const along = index / (points.length - 1);
      let vx = point.x - point.px, vy = point.y - point.py;
      vx = clamp(vx + (anchorVX - vx) * follow - anchorVX * wind, -5, 5);
      vy = clamp(vy + (anchorVY - vy) * follow - anchorVY * wind, -5, 5);
      point.px = point.x; point.py = point.y;
      point.x += vx;
      point.y += vy + gravity;
      let targetX = rest.x, targetY = rest.y;
      if (index > 0) {
        targetX = parentDirection.x * .85 + rest.x * .15;
        targetY = parentDirection.y * .85 + rest.y * .15;
        const targetLength = Math.hypot(targetX, targetY) || 1;
        targetX /= targetLength; targetY /= targetLength;
      }
      const stiffness = lerp(.045, .008, along);
      point.x += (parent.x + targetX * lengths[index] - point.x) * stiffness;
      point.y += (parent.y + targetY * lengths[index] - point.y) * stiffness;
      const dx = point.x - parent.x, dy = point.y - parent.y;
      const distance = Math.hypot(dx, dy) || 1;
      parentDirection = { x: dx / distance, y: dy / distance };
      parent = point;
    });
    for (let iteration = 0; iteration < 3; iteration++) {
      let chainParent = anchor;
      points.forEach((point, index) => {
        const dx = point.x - chainParent.x, dy = point.y - chainParent.y;
        const distance = Math.hypot(dx, dy) || 1;
        point.x = chainParent.x + dx / distance * lengths[index];
        point.y = chainParent.y + dy / distance * lengths[index];
        if (back) pushOutOfBack(point, back);
        chainParent = point;
      });
    }
    if (!groundAt) return;
    for (const point of points) {
      const ground = groundAt(point.x, point.y);
      if (!ground.solid || point.y <= ground.y - 2) continue;
      // Moving the point alone leaves its previous position behind, and the next
      // step reads that gap as velocity. On ground that steps by hundreds of
      // units between neighbouring points, that flings the hair into a streak,
      // so the previous position travels with the point.
      const from = point.y;
      point.y = ground.y - 2;
      point.py = lerp(point.py, from, .5);
      point.px = lerp(point.px, point.x, .5);
    }
  }

  return {
    get root() { return hair.root; },
    get points() { return hair.points; },
    update(dt, { root, rest, back = null, groundAt = null }) {
      if (dt <= 0) return;
      const steps = Math.min(HAIR_MAX_STEPS, Math.floor((hair.accumulator + dt) / HAIR_STEP));
      hair.accumulator = steps === HAIR_MAX_STEPS ? 0 : hair.accumulator + dt - steps * HAIR_STEP;
      if (!steps) return;
      const from = hair.root;
      for (let index = 1; index <= steps; index++) step(HAIR_STEP, from, root, index / steps, rest, back, groundAt);
    },
    // Runs the simulation with the rider held still, for posed illustrations.
    settle(seconds, state) {
      for (let elapsed = 0; elapsed < seconds; elapsed += HAIR_STEP) step(HAIR_STEP, hair.root, state.root, 1, state.rest, state.back, state.groundAt);
    },
    /** The chain's spine as drawn from `drawnRoot`, smoothed, the links nearest it pinned to it. */
    spine(drawnRoot) {
      const offsetX = drawnRoot.x - hair.root.x, offsetY = drawnRoot.y - hair.root.y;
      const controls = [[drawnRoot.x, drawnRoot.y], ...hair.points.map((point, index) => {
        const pinned = 1 - (index + 1) / hair.points.length;
        return [point.x + offsetX * pinned, point.y + offsetY * pinned];
      })];
      return catmullRom(controls, 2);
    }
  };
}

/**
 * The rider's hair tail: a ponytail or a braid.
 * @param {string} tail  a key of HAIR_TAILS
 * @param {{ strands: string[], outline: string, shine: string }} colors
 *   the tail's colours, as in lookParts().hair
 */
export function createRiderHair(root, rest, tail, colors) {
  const chain = createChain(root, rest, HAIR_TAILS[tail]);
  return {
    get root() { return chain.root; },
    update: chain.update,
    settle: chain.settle,
    draw(pixelPath, drawnRoot) {
      const spine = chain.spine(drawnRoot);
      if (tail === 'braid') drawBraid(pixelPath, spine, colors, drawnRoot.forward);
      else drawPonytail(pixelPath, spine, colors);
    }
  };
}

/** The point `amount` units to one side of `points[index]`, square to the line through it. */
function sideOf(points, index, amount) {
  const last = points.length - 1;
  const previous = points[Math.max(0, index - 1)], next = points[Math.min(last, index + 1)];
  const tx = next[0] - previous[0], ty = next[1] - previous[1];
  const length = Math.hypot(tx, ty) || 1;
  return [points[index][0] - ty / length * amount, points[index][1] + tx / length * amount];
}

function drawPonytail(pixelPath, spine, colors) {
  const last = spine.length - 1;
  const strands = PONYTAIL_STRANDS.map(({ offset, reach, width }) => {
    const count = Math.max(2, Math.round(last * reach) + 1);
    return spine.slice(0, count).map((point, index) => {
      const along = index / (count - 1);
      const [x, y] = sideOf(spine, index, offset * (1 + 1.5 * Math.sin(Math.PI * along)));
      return { x, y, width: Math.max(1, Math.round(width * (1 - along * .7))) };
    });
  });
  for (const pass of ['outline', 'fill']) strands.forEach((strand, strandIndex) => {
    for (let i = 1; i < strand.length; i++) {
      const a = strand[i - 1], b = strand[i];
      if (pass === 'outline') pixelPath([[a.x, a.y], [b.x, b.y]], colors.outline, a.width + 1, 2);
      else pixelPath([[a.x, a.y], [b.x, b.y]], colors.strands[strandIndex], a.width, 2);
    }
  });
  const shine = strands[2];
  pixelPath(shine.slice(0, Math.ceil(shine.length * .35)).map(point => [point.x, point.y]), colors.shine, 1, 2);
}

/**
 * A braid three art pixels wide: its top row a mix of the hair colour and its
 * shade, its middle row the hair colour with a highlight every three pixels,
 * and its bottom row a mix of shade and outline, so neither edge is a solid
 * line and the strands seem to cross. A dark tie crosses it a little above
 * the end, and below it the loose end is plain hair.
 */
function drawBraid(pixelPath, spine, colors, forward) {
  // The spine again, one art pixel (two units) between points, starting two
  // pixels `forward` of the root, inside the head: the hair is drawn behind
  // the rider, so the braid comes out of the back of the head with no gap
  // however the rider is turned.
  const [x, y] = spine[0];
  const rope = [[x + forward.x * 4, y + forward.y * 4], [x + forward.x * 2, y + forward.y * 2], spine[0]];
  let carried = 0;
  for (let i = 1; i < spine.length; i++) {
    const [ax, ay] = spine[i - 1], [bx, by] = spine[i];
    const length = Math.hypot(bx - ax, by - ay);
    for (let at = 2 - carried; at <= length; at += 2) rope.push([ax + (bx - ax) * at / length, ay + (by - ay) * at / length]);
    carried = (carried + length) % 2;
  }
  const last = rope.length - 1;
  const tie = last - 2;
  const [hair, shade, light, outline] = [colors.strands[2], colors.strands[0], colors.shine, colors.outline];
  // Every art pixel the braid covers, with the row it is in (-1 the top, 0
  // the middle, 1 the bottom) and how far along the braid it is: each pixel
  // goes to the rope point and row it lies nearest.
  const cells = new Map();
  for (let i = 0; i <= last; i++) {
    const [px, py] = rope[i];
    const [nx, ny] = sideOf(rope, i, 1).map((value, axis) => value - rope[i][axis]);
    const down = ny > 0 ? 1 : -1;
    const reach = i > tie ? .4 : 1.4;
    for (let t = -reach; t <= reach + 1e-9; t += .25) {
      const wx = px + nx * down * t * 2, wy = py + ny * down * t * 2;
      const x = Math.round(wx / 2), y = Math.round(wy / 2);
      const row = Math.round(t);
      const miss = Math.abs(t - row) + Math.hypot(x * 2 - wx, y * 2 - wy) * .01;
      const key = `${x},${y}`;
      if (!cells.has(key) || cells.get(key).miss > miss) cells.set(key, { x, y, row, i, miss });
    }
  }
  for (const { x, y, row, i } of cells.values()) {
    let color;
    if (i === tie) color = outline;
    else if (i > tie) color = i === last ? shade : hair;
    else if (row < 0) color = i % 2 ? shade : hair;
    else if (row === 0) color = i % 3 === 1 ? light : hair;
    else color = i % 2 ? outline : shade;
    pixelPath([[x * 2, y * 2], [x * 2, y * 2]], color, 1, 2);
  }
}

/**
 * What trails behind the rider, as in lookParts().accessory: a cloth ribbon
 * on a chain, widening from the root to the tip, with a shaded edge, or a
 * balloon on its string.
 * @param {{ shape: string, fill: string, light: string, shade: string, outline: string }} accessory
 */
export function createRiderAccessory(root, rest, accessory) {
  const { lengths, width: [rootWidth, tipWidth], gravity = 1, balloon = false, tip = 0 } = ACCESSORIES[accessory.shape];
  const chain = createChain(root, rest, lengths, gravity);
  return {
    behindHair: Boolean(ACCESSORIES[accessory.shape].behindHair),
    get root() { return chain.root; },
    update: chain.update,
    settle: chain.settle,
    draw(pixelPath, drawnRoot) {
      const spine = chain.spine(drawnRoot);
      const last = spine.length - 1;
      if (balloon) {
        // The string, then the balloon round its end, outlined, shaded low
        // and lit from the top right.
        pixelPath(spine, STRING, 1, 2);
        const [x, y] = spine[last];
        const top = y - BALLOON_ROWS.length * 2;
        BALLOON_ROWS.forEach((half, row) => {
          const rowY = top + row * 2;
          const span = [[x - half * 2, rowY], [x + half * 2, rowY]];
          pixelPath(span, accessory.outline, 4, 2);
        });
        BALLOON_ROWS.forEach((half, row) => {
          const rowY = top + row * 2;
          const color = row >= BALLOON_ROWS.length - 3 ? accessory.shade : accessory.fill;
          pixelPath([[x - half * 2 + 1, rowY], [x + half * 2 - 1, rowY]], color, 2, 2);
        });
        pixelPath([[x + 2, top + 4], [x + 2, top + 4]], BALLOON_SHINE, 2, 2);
        return;
      }
      const width = index => Math.round(lerp(rootWidth, tipWidth, index / last));
      const tipFrom = tip ? Math.round(last * (1 - tip)) : last + 1;
      for (const [pass, extra] of [['outline', 1], ['fill', 0]]) {
        for (let i = 1; i <= last; i++) {
          const color = pass === 'outline' ? accessory.outline : i > tipFrom ? TAIL_TIP : accessory.fill;
          pixelPath([spine[i - 1], spine[i]], color, width(i) + extra, 2);
        }
      }
      // The underside in shade along the lower edge, and a lit fold along the top.
      for (let i = 2; i <= Math.min(last, tipFrom); i++) {
        const [ax, ay] = spine[i - 1], [bx, by] = spine[i];
        const length = Math.hypot(bx - ax, by - ay) || 1;
        const side = Math.max(0, width(i) - 2) / 2;
        const nx = -(by - ay) / length * side, ny = (bx - ax) / length * side;
        const lower = ny >= 0 ? 1 : -1;
        pixelPath([[ax + nx * lower, ay + ny * lower], [bx + nx * lower, by + ny * lower]], accessory.shade, 1, 2);
        if (side) pixelPath([[ax - nx * lower, ay - ny * lower], [bx - nx * lower, by - ny * lower]], accessory.light, 1, 2);
      }
    }
  };
}

/**
 * Everything that trails behind a rider in `parts` (lookParts): their
 * hair's tail and their outfit's accessory, as one piece driven by the hair's
 * state, with `accessory` the accessory's own root and rest. Drawn from
 * the hair's drawn root, the accessory moved with it.
 */
export function createRiderTrails(state, parts) {
  const tail = parts.hair.tail ? createRiderHair(state.root, state.rest, parts.hair.tail, parts.hair) : null;
  const accessory = parts.accessory && state.accessory
    ? createRiderAccessory(state.accessory.root, state.accessory.rest, parts.accessory) : null;
  let root = { ...state.root };
  const accessoryState = next => ({ ...next, root: next.accessory.root, rest: next.accessory.rest });
  return {
    get root() { return root; },
    update(dt, next) {
      root = { ...next.root };
      tail?.update(dt, next);
      if (accessory && next.accessory) accessory.update(dt, accessoryState(next));
    },
    settle(seconds, next) {
      root = { ...next.root };
      tail?.settle(seconds, next);
      if (accessory && next.accessory) accessory.settle(seconds, accessoryState(next));
    },
    draw(pixelPath, drawnRoot) {
      const drawAccessory = () => {
        const { x, y } = accessory.root;
        accessory.draw(pixelPath, { x: x + drawnRoot.x - root.x, y: y + drawnRoot.y - root.y });
      };
      if (accessory?.behindHair) drawAccessory();
      tail?.draw(pixelPath, drawnRoot);
      if (accessory && !accessory.behindHair) drawAccessory();
    }
  };
}
