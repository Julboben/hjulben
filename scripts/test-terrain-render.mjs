// The terrain renderer: block art is rasterised from the same compiled union
// that physics collides with, so these check the pixels against the physics,
// and the chunk cache against a stub canvas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDom, createContextStub, installGlobals } from './lib/editor-harness.mjs';
import { SPIRAL_NODES, polygonBlock, rectangle, blockTrail } from './lib/terrain-fixtures.mjs';

const html = readFileSync(new URL('../editor.html', import.meta.url), 'utf8');
let failures = 0;
const check = (label, condition, detail = '') => {
  if (!condition) { failures++; console.log('FAIL', label, detail); }
  else console.log('ok  ', label);
};

buildDom(html);
const dom = installGlobals();
for (const match of html.matchAll(/\bid="([^"]+)"/g)) dom.element(match[1]);
const context = createContextStub();
// What a worker sends back: the pixels last put on a canvas, closed once the
// renderer is done with them.
globalThis.OffscreenCanvas = class {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() { return context; }
  transferToImageBitmap() {
    const bitmap = { pixels: context.calls.findLast(call => call[0] === 'putImageData')[1], closed: false, close() { this.closed = true; } };
    return bitmap;
  }
};
globalThis.ImageData ??= class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } };

const { chunkPainterThread, createTerrainRenderer, rasterizeTerrainChunk } = await import('../js/terrain-render.js');
const { normalizeTrail } = await import('../js/trail-schema.js');
const { breakTerrainBlock, terrainGeometry, invalidateTerrain, terrainAt, updateTerrain } = await import('../js/terrain.js');
const { rideTerrain } = await import('../js/glass.js');
const { terrainSolidAt } = await import('../js/terrain-runtime.js');
const { terrainMaterials } = await import('../js/materials.js');
const { cutBlock } = await import('../js/terrain-geometry.js');
const { compositeColor } = await import('../js/drawing.js');

const rgb = color => compositeColor(color, '#000000').join(',');
const pixelAt = (raster, left, top, x, y) => {
  const column = Math.floor((x - left) / 2), row = Math.floor((y - top) / 2);
  const offset = (row * raster.width + column) * 4;
  return raster.data[offset + 3] ? [...raster.data.slice(offset, offset + 3)].join(',') : null;
};

// 1. The spiral from the orchard copy, which drew floating grass bars and
// rims on its undersides in the game before the rasteriser.
{
  const trail = normalizeTrail(blockTrail([polygonBlock(SPIRAL_NODES)]));
  const compiled = terrainGeometry(trail);
  const left = 200, top = -320, width = 280, height = 240;
  const raster = rasterizeTerrainChunk(compiled, left, top, width, height);
  check('the spiral rasterises', raster.opaque);

  let uncovered = 0, stray = 0;
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const x = left + column * 2 + 1, y = top + row * 2 + 1;
      const drawn = raster.data[(row * width + column) * 4 + 3] > 0;
      const solid = terrainSolidAt(compiled, x, y);
      // A pixel centre exactly on the outline is on the boundary either way.
      const onOutline = terrainSolidAt(compiled, x, y - 0.01) !== terrainSolidAt(compiled, x, y + 0.01)
        || terrainSolidAt(compiled, x - 0.01, y) !== terrainSolidAt(compiled, x + 0.01, y);
      if (solid && !drawn && !onOutline) uncovered++;
      // Art outside the solid is only the floor rim, grass tufts, and the
      // cliff lip, which stand on a floor at most a tuft's height below.
      if (drawn && !solid) {
        let near = false;
        for (let rise = 0; rise <= 12 && !near; rise += 2) near = terrainSolidAt(compiled, x, y + rise);
        // The cliff lip is a 4-pixel column drawn one pixel out in the air
        // beside a cliff top, so its own column has no floor within reach. It
        // is real art, so a floor top immediately beside it counts instead.
        // Genuine bleeding sits further from a cliff edge than this.
        if (!near) {
          for (const beside of [x - 2, x + 2]) {
            for (let offset = -4; offset <= 4; offset += 2) {
              if (!terrainSolidAt(compiled, beside, y + offset)) continue;
              // Solid beside and open above it: that is a cliff top beside us.
              if (!terrainSolidAt(compiled, beside, y + offset - 2)) near = true;
            }
          }
        }
        if (!near) stray++;
      }
    }
  }
  check('every solid pixel is drawn', uncovered === 0, `(${uncovered} solid pixels left empty)`);
  check('nothing is drawn floating in the air', stray === 0, `(${stray} pixels away from any floor)`);

  const grass = terrainMaterials.grass;
  check('the pocket under the peak is open', pixelAt(raster, left, top, 500, -90) === null);
  // The peak's underside above the pocket is a ceiling: dark edge, never grass.
  const underside = pixelAt(raster, left, top, 520, -140);
  check('a ceiling gets an edge, not a grass rim', underside !== rgb(grass.surface), `(${underside})`);
  check('the air just under a ceiling stays empty', pixelAt(raster, left, top, 520, -134) === null);
  // The pocket floor is a floor: grass on top.
  const floorY = terrainAt(trail, 500, -80).y;
  let rim = false;
  for (let y = floorY - 4; y < floorY + 4; y += 2) rim ||= pixelAt(raster, left, top, 500, y) === rgb(grass.surface);
  check('the pocket floor gets its grass rim', rim);
}

// 2. Chunks meet without seams: two halves rasterised apart match one whole.
{
  const trail = normalizeTrail(blockTrail([polygonBlock(SPIRAL_NODES)]));
  const compiled = terrainGeometry(trail);
  const whole = rasterizeTerrainChunk(compiled, 200, -320, 256, 240);
  const leftHalf = rasterizeTerrainChunk(compiled, 200, -320, 128, 240);
  const rightHalf = rasterizeTerrainChunk(compiled, 456, -320, 128, 240);
  let mismatched = 0;
  for (let row = 0; row < 240; row++) {
    for (let column = 0; column < 256; column++) {
      const half = column < 128 ? leftHalf : rightHalf, local = column % 128;
      for (let channel = 0; channel < 4; channel++) {
        if (whole.data[(row * 256 + column) * 4 + channel] !== half.data[(row * 128 + local) * 4 + channel]) { mismatched++; break; }
      }
    }
  }
  check('adjacent chunks match the whole exactly', mismatched === 0, `(${mismatched} pixels differ)`);
}

// 3. A cave stays open and its floor and roof are drawn.
{
  const carved = cutBlock(rectangle(0, 300, 800, 600, 'concrete'), [[300, 360], [500, 360], [500, 460], [300, 460]]);
  assert.ok(carved.changed, 'the cave cut works');
  const compiled = terrainGeometry(normalizeTrail(blockTrail([carved.blocks[0]])));
  const raster = rasterizeTerrainChunk(compiled, 256, 256, 160, 160);
  check('the middle of the cave is open', pixelAt(raster, 256, 256, 400, 410) === null);
  check('the rock around the cave is drawn', pixelAt(raster, 256, 256, 400, 480) !== null);
  check('the cave floor gets a surface rim', pixelAt(raster, 256, 256, 400, 461) === rgb(terrainMaterials.concrete.surface));
}

// 3b. Stone is drawn as stones: mortar between them, lit tops and shaded
// bottoms, and it continues across chunk edges.
{
  const compiled = terrainGeometry(normalizeTrail(blockTrail([rectangle(0, 300, 800, 700, 'stone')])));
  const whole = rasterizeTerrainChunk(compiled, 256, 320, 128, 128);
  const stone = terrainMaterials.stone;
  const colors = new Set();
  for (let offset = 0; offset < whole.data.length; offset += 4) colors.add(whole.data.slice(offset, offset + 3).join(','));
  const mortar = compositeColor(stone.detail, stone.fill).join(',');
  check('stone has mortar', colors.has(mortar));
  check('stone has lit tops and shaded bottoms', colors.has(rgb(stone.layers[0])) && colors.has(rgb(stone.layers[1])));
  const top = rasterizeTerrainChunk(compiled, 256, 320, 128, 64);
  const bottom = rasterizeTerrainChunk(compiled, 256, 448, 128, 64);
  const joined = [...top.data, ...bottom.data];
  check('stone matches across chunk edges', joined.every((value, index) => value === whole.data[index]));
}

// 3c. Wood is drawn as planks: seams between them, lit tops and shaded
// bottoms, grain, and it continues across chunk edges.
{
  const compiled = terrainGeometry(normalizeTrail(blockTrail([rectangle(0, 300, 800, 700, 'wood')])));
  const whole = rasterizeTerrainChunk(compiled, 256, 320, 128, 128);
  const wood = terrainMaterials.wood;
  const colors = new Set();
  for (let offset = 0; offset < whole.data.length; offset += 4) colors.add(whole.data.slice(offset, offset + 3).join(','));
  check('wood has seams', colors.has(compositeColor(wood.detail, wood.fill).join(',')));
  check('wood has lit tops and shaded bottoms', colors.has(rgb(wood.layers[0])) && colors.has(rgb(wood.layers[1])));
  const top = rasterizeTerrainChunk(compiled, 256, 320, 128, 64);
  const bottom = rasterizeTerrainChunk(compiled, 256, 448, 128, 64);
  const joined = [...top.data, ...bottom.data];
  check('wood matches across chunk edges', joined.every((value, index) => value === whole.data[index]));
}

// 4. Where two blocks overlap, the later block's material shows.
{
  const compiled = terrainGeometry(normalizeTrail(blockTrail([
    rectangle(0, 300, 500, 700, 'grass', 'a'), rectangle(300, 300, 800, 700, 'brick', 'b'),
  ])));
  const raster = rasterizeTerrainChunk(compiled, 0, 256, 400, 256);
  const brick = terrainMaterials.brick;
  const inOverlap = pixelAt(raster, 0, 256, 401, 403);
  check('the later block wins the overlap', [rgb(brick.fill), brick.pattern && compositeColor('#4e2e2a99', brick.fill).join(',')].includes(inOverlap), `(${inOverlap})`);
  check('the earlier block shows outside it', pixelAt(raster, 0, 256, 150, 403) !== inOverlap);
  // No wall is drawn along the buried seam at x 300.
  const seam = pixelAt(raster, 0, 256, 301, 451);
  check('no edge is drawn along a buried seam', seam !== rgb(brick.edge) && seam !== rgb(terrainMaterials.grass.edge), `(${seam})`);
}

// 5. The chunk cache: block trails blit rasterised chunks, and sky costs nothing.
const drawCalls = (renderer, trail, x, y, w, h) => {
  context.calls.length = 0;
  renderer.draw(context, trail, x, y, w, h);
  return context.calls.map(call => call[0]);
};
{
  const renderer = createTerrainRenderer();
  const trail = normalizeTrail(blockTrail([rectangle(0, 300, 800, 600)]));
  const names = drawCalls(renderer, trail, 0, 0, 900, 600);
  check('a block trail puts rasterised pixels', names.includes('putImageData'));
  check('and blits its chunks', names.includes('drawImage'));
  check('without tracing canvas paths', !names.includes('bezierCurveTo') && !names.includes('fill'));
  check('its start sign is drawn live', names.includes('fillRect'));

  const again = drawCalls(renderer, trail, 0, 0, 900, 600);
  check('a second frame reuses every chunk', !again.includes('putImageData'));

  // An edit in one place rebuilds only the chunks in the columns it touched.
  trail.terrainBlocks.push(rectangle(1600, 200, 1700, 600, 'concrete', 'far'));
  invalidateTerrain(trail);
  drawCalls(renderer, trail, 0, 0, 900, 600);
  const rebuilt = drawCalls(renderer, trail, 0, 0, 900, 600).filter(name => name === 'putImageData').length;
  check('an edit far away leaves visible chunks cached', rebuilt === 0, `(${rebuilt} rebuilt)`);
  for (const node of trail.terrainBlocks[0].outer.nodes) node.y -= 40;
  invalidateTerrain(trail);
  const moved = drawCalls(renderer, trail, 0, 0, 900, 600).filter(name => name === 'putImageData').length;
  check('an edit in view rebuilds its chunks', moved > 0);

  // The same, for edits rebuilt in place as the editor makes them (updateTerrain).
  drawCalls(renderer, trail, 0, 0, 900, 600);
  for (const node of trail.terrainBlocks[1].outer.nodes) node.x += 30;
  updateTerrain(trail, new Set([trail.terrainBlocks[1]]));
  const farInPlace = drawCalls(renderer, trail, 0, 0, 900, 600).filter(name => name === 'putImageData').length;
  check('an edit far away, rebuilt in place, leaves visible chunks cached', farInPlace === 0, `(${farInPlace} rebuilt)`);
  for (const node of trail.terrainBlocks[0].outer.nodes) node.y += 40;
  updateTerrain(trail, new Set([trail.terrainBlocks[0]]));
  const nearInPlace = drawCalls(renderer, trail, 0, 0, 900, 600).filter(name => name === 'putImageData').length;
  check('an edit in view, rebuilt in place, rebuilds its chunks', nearInPlace > 0);
}
{
  const blocks = normalizeTrail(blockTrail([rectangle(0, 300, 800, 600)]));
  check('an empty sky chunk costs no blit', !drawCalls(createTerrainRenderer(), blocks, 0, -4000, 600, 600).includes('drawImage'));
  check('a trail with no terrain at all still draws', Array.isArray(drawCalls(createTerrainRenderer(), normalizeTrail(blockTrail([])), 0, 0, 600, 600)));
}

// 6. In the game, a worker paints the chunks around the view before the
// camera reaches them. The stand-in worker here runs the worker's own code
// when told to, so these check what the renderer asks of it and what it does
// with the replies.
const workers = [];
globalThis.Worker = class {
  constructor() { this.thread = chunkPainterThread(); this.inbox = []; workers.push(this); }
  postMessage(message) { this.inbox.push(structuredClone(message)); }
  /** Handles every message posted so far, and posts back the replies. */
  run() {
    for (const message of this.inbox.splice(0)) {
      const reply = this.thread(message);
      if (reply) this.onmessage({ data: reply });
    }
  }
};
{
  const trail = normalizeTrail(blockTrail([rectangle(0, 300, 3000, 800), rectangle(600, 200, 700, 300, 'glass', 'pane')]));
  const ride = rideTerrain(trail);
  const renderer = createTerrainRenderer({ worker: true });
  const worker = workers.at(-1);
  const frame = x => drawCalls(renderer, ride, x, 0, 900, 600);
  const painted = calls => calls.filter(name => name === 'putImageData').length;

  check('the chunks in view are drawn at once', painted(frame(0)) > 0);
  const [terrain, ...asked] = worker.inbox;
  check('the worker gets the trail\'s blocks', terrain.blocks?.length === 2 && terrain.broken.length === 0);
  check('and is asked for two chunks around the view at a time', asked.length === 2 && asked.every(message => message.column !== undefined));
  for (let i = 0; i < 20 && worker.inbox.length; i++) { worker.run(); frame(0); }
  check('until every chunk around the view is painted', !worker.inbox.length);
  const moved = frame(512);
  check('a chunk it painted ahead is drawn without painting it here', painted(moved) === 0 && moved.includes('drawImage'));

  const same = (column, row) => {
    const reply = worker.thread({ version: terrain.version, key: '', column, row });
    return reply && [...reply.image.pixels.data].join() === [...rasterizeTerrainChunk(terrainGeometry(ride), column * 512, row * 512, 256, 256).data].join();
  };
  check('the worker paints the same pixels', same(1, 0));

  // A pane breaks while chunks are being painted for the terrain before; they
  // arrive after it broke.
  frame(1024);
  const late = worker.inbox.splice(0).map(message => worker.thread(message)).filter(reply => reply?.image);
  breakTerrainBlock(ride, 'pane', {});
  frame(0);
  const update = worker.inbox.find(message => message.broken);
  check('a broken pane sends the worker only which panes are broken', update && !update.blocks && update.broken.join() === 'pane');
  for (const data of late) worker.onmessage({ data });
  check('chunks painted before it broke are thrown away', late.length > 0 && late.every(reply => reply.image.closed));
  worker.run();
  const reply = worker.thread({ version: update.version, key: '', column: 1, row: 0 });
  check('and the worker paints the terrain without it', [...reply.image.pixels.data].join() === [...rasterizeTerrainChunk(terrainGeometry(ride), 512, 0, 256, 256).data].join());
}

// Props must survive a trail that has no ground line at all.
{
  const { propAlignmentSlope, propGroundOffset } = await import('../js/drawing.js');
  const carved = cutBlock(rectangle(0, 300, 1200, 800), [[400, 340], [700, 340], [700, 460], [400, 460]]);
  const trail = normalizeTrail(blockTrail([carved.blocks[0]]));
  assert.equal(trail.points, undefined, 'the trail really has no ground line');
  for (const prop of [
    { x: 550, y: null, type: 'fence' },
    { x: 550, y: 460, type: 'fence' },
    { x: 550, y: 460, type: 'tree' },
    { x: 550, y: 460, type: 'rock' },
    { x: 550, y: 100, type: 'bush' },
  ]) {
    let slope, offset;
    assert.doesNotThrow(() => { slope = propAlignmentSlope(trail, prop); }, `slope for ${prop.type}`);
    assert.doesNotThrow(() => { offset = propGroundOffset(trail, prop); }, `offset for ${prop.type}`);
    assert.ok(Number.isFinite(slope), `slope is a number for ${prop.type}`);
    assert.ok(Math.abs(offset(0)) < 1e-6, `a planted prop meets its ground for ${prop.type}`);
  }
  const onFloor = { x: 550, y: 460, type: 'fence' };
  const base = propGroundOffset(trail, onFloor);
  assert.ok(Math.abs(base(-33) - base(33)) < 40, 'a fence on a flat cave floor has a trail base');
  check('a prop on a block is not tilted by a surface far above it', Math.abs(propAlignmentSlope(trail, onFloor)) < 0.5);
}

// A floating prop keeps a trail base, so it reads as floating.
{
  const { propAlignmentSlope, propGroundOffset } = await import('../js/drawing.js');
  const trail = normalizeTrail(blockTrail([rectangle(0, 400, 600, 700)]));
  const floating = { x: 300, y: 200, type: 'tree' };
  assert.equal(propAlignmentSlope(trail, floating), 0, 'a floating prop is not tilted');
  const base = propGroundOffset(trail, floating);
  assert.equal(base(-16), 0, 'and its base is trail on the left');
  assert.equal(base(16), 0, 'and on the right');
}

// A finish is a point, not just an x: it can hang in the air, and the run
// still ends on its x.
{
  const { finishHeight: finishAt, validateTrail } = await import('../js/trail-schema.js');
  const bare = blockTrail([rectangle(0, 300, 2000, 600)]);
  const onGround = normalizeTrail({ ...bare, finish: { x: 1000, y: null } });
  check('a ground finish snaps to the surface', Math.abs(finishAt(onGround) - 300) < 2, `(at ${finishAt(onGround)})`);
  const inAir = normalizeTrail({ ...bare, finish: { x: 1000, y: 120 } });
  check('a finish can be placed in the air', finishAt(inAir) === 120);
  const missing = normalizeTrail({ ...bare, finish: { x: 1000 } });
  check('a missing finish y means ground, not y=0', Math.abs(finishAt(missing) - 300) < 2, `(at ${finishAt(missing)})`);
  check('a missing finish y normalizes to null', missing.finish.y === null);
  check('normalizing twice is stable', normalizeTrail(JSON.parse(JSON.stringify(missing))).finish.y === null);
  check('the editor and the game read one height', inAir.finish.y === finishAt(inAir));
  const past = normalizeTrail({ ...bare, finish: { x: 1000, y: 120 }, apples: [{ x: 1400, y: 120 }] });
  // Once the flower became the finish, the run no longer ends at the finish's
  // x, so an apple beyond it is still reachable and must not be reported.
  check('an apple past the finish x is not reported',
    !validateTrail(past).some((m) => /past the finish/.test(m.text)));
}

// The city backdrop's window hook paints in other colours; the next building
// column must still be filled with the building colour, at every time of day.
{
  const { createGameArt } = await import('../js/drawing.js');
  const fills = [];
  const recorder = () => {
    const target = { fillStyle: '#000' };
    return new Proxy(target, {
      get(object, property) {
        if (property in object) return object[property];
        if (property === 'fillRect') return (...args) => fills.push([object.fillStyle, ...args]);
        if (property === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => ({ addColorStop() {} });
        return () => {};
      },
      set(object, property, value) { object[property] = value; return true; },
    });
  };
  const Offscreen = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; this.context = recorder(); }
    getContext() { return this.context; }
  };
  const art = createGameArt(recorder());
  for (const [index, timeOfDay] of [12, 19, 0, 5, 20].entries()) {
    fills.length = 0;
    art.drawBackground({ width: 800, height: 400, palette: { backdrop: 'city', timeOfDay }, cameraX: 9000 + index * 777 });
    // Tall fills are the sky and the building bodies; windows are 4 tall.
    const bodies = fills.filter(([, , , , height]) => height > 40);
    const colours = new Set(bodies.map(([colour]) => colour));
    const lit = bodies.filter(([colour]) => colour === '#ffeaa8').length;
    check(`city buildings at ${timeOfDay}:00 are filled with building colours only`, colours.size === 3 && lit === 0 && bodies.length > 0, `(${[...colours].join(', ')})`);
  }
  globalThis.OffscreenCanvas = Offscreen;
}

// The clouds drift downwind on the scene's clock, as far as the wind's
// strength takes them, and stand still in still air.
{
  const { createGameArt } = await import('../js/drawing.js');
  // Each canvas keeps its own fills, as the cloud layers are cached and drawn
  // again on later frames.
  const recorder = () => {
    const target = { fillStyle: '#000', fills: [], images: [] };
    return new Proxy(target, {
      get(object, property) {
        if (property in object) return object[property];
        if (property === 'fillRect') return (...args) => object.fills.push(args);
        if (property === 'drawImage') return (...args) => object.images.push(args);
        if (property === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => ({ addColorStop() {} });
        return () => {};
      },
      set(object, property, value) { object[property] = value; return true; },
    });
  };
  const Offscreen = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; this.context = recorder(); }
    getContext() { return this.context; }
  };
  const view = recorder();
  const art = createGameArt(view);
  const cell = 4;
  // Every cloud cell on screen, as "x,y", from the one-cell-wide spans the
  // cloud layer is painted with. With no sun there is no glow over them.
  const cloudsAt = (sceneTime, wind, windDirection = 'right') => {
    view.images.length = 0;
    art.drawBackground({
      width: 800, height: 400, full: false, sceneTime,
      palette: { timeOfDay: 12, weather: { sun: 0, clouds: 0.4, wind, windDirection } },
    });
    const [[layer, left, top]] = view.images.filter(([image]) => image.context);
    const cells = new Set();
    for (const [column, row, width, height] of layer.context.fills)
      if (width === 1)
        for (let r = row; r < row + height; r++) cells.add(`${left + column * cell},${top + r * cell}`);
    return cells;
  };
  // Of the cells in the middle of the view that are cloud before or after
  // (`shift` along), the share that are cloud both times.
  const moved = (before, after, shift) => {
    let both = 0, either = 0;
    for (let x = 200; x < 600; x += cell)
      for (let y = 0; y < 400; y += cell) {
        const was = before.has(`${x},${y}`), is = after.has(`${x + shift},${y}`);
        if (was || is) either++;
        if (was && is) both++;
      }
    return either ? both / either : 1;
  };
  const still = cloudsAt(0, 1);
  check('there are clouds to drift', moved(still, new Set(), 0) === 0);
  check('a gale blows the clouds right, 24 units a second', moved(still, cloudsAt(5, 1), 120) === 1);
  check('and left when it blows the other way', moved(cloudsAt(0, 1, 'left'), cloudsAt(5, 1, 'left'), -120) === 1);
  check('a lighter wind moves them in proportion', moved(cloudsAt(0, 0.5), cloudsAt(5, 0.5), 60) === 1);
  check('the clouds stand still in still air', moved(cloudsAt(0, 0), cloudsAt(5, 0), 0) === 1);
  // The banks sit in regular slots, so some still overlap where they were.
  check('the clouds really moved', moved(still, cloudsAt(5, 1), 0) < 0.9);

  // The sky says how much of the sun the clouds hide: none in a clear sky,
  // all of it when overcast, and as broken cloud drifts past, sometimes none
  // and sometimes a good part of it.
  const cover = (clouds, sceneTime = 0) => art.drawBackground({
    width: 800, height: 400, full: false, sceneTime,
    palette: { timeOfDay: 12, weather: { sun: 1, clouds, wind: 1 } },
  });
  check('a clear sky hides none of the sun', cover(0) === 0);
  check('an overcast sky hides all of it', cover(1) === 1);
  // Far below the sky the sun is above the top of the view, and the clouds
  // move with it, so it is just as covered as it would be in sight.
  const seenFrom = (cameraY, clouds) => art.drawBackground({
    width: 800, height: 400, full: false, cameraY,
    palette: { timeOfDay: 12, weather: { sun: 1, clouds, wind: 0 } },
  });
  check('an overcast sky hides a sun above the view', seenFrom(3000, 1) === 1, seenFrom(3000, 1));
  for (const clouds of [0.32, 0.6])
    check(`a sun above the view is as covered as in sight (${clouds} cloud)`, seenFrom(3000, clouds) === seenFrom(0, clouds), `${seenFrom(3000, clouds)} ${seenFrom(0, clouds)}`);
  const passing = Array.from({ length: 120 }, (_, second) => cover(0.32, second));
  check('broken cloud passes over the sun and off it again', passing.includes(0) && Math.max(...passing) > 0.4, Math.max(...passing));
  globalThis.OffscreenCanvas = Offscreen;
}

dom.restore();
console.log(failures ? `\n${failures} failing` : '\nTerrain render tests passed.');
process.exit(failures ? 1 : 0);
