# Making props for Hjulben

A brief for whoever draws new props, human or AI. Send it together with:

- `js/desert-props.js` or `js/mountain-props.js` as a worked example of a prop module
- `js/cave-props.js` if the props hang from rock or need to fit the terrain
- the prop ideas from `PROPS_PLAN.md`

**What to deliver:** one new module, `js/<theme>-props.js`, with the art and the logic for the props. Leave the wiring into `drawing.js`, `render.js`, the editor and the schema (see the checklist at the end) to someone with the whole project open. A module can be wired in with almost no changes if it follows this guide.

## Art style

- Pixel art on a 2-unit grid. `ART_PIXEL` is 2, every coordinate and size is a multiple of 2, and every call passes `2` as the pixel size. Snap computed positions with `Math.round(v / 2) * 2`.
- No outlines. Every prop is lit from the right, so the left side and underside are shaded and the right edge gets a highlight.
- Reuse colours from the existing palettes (`WOOD`, `STONE`, `STEEL`, `SNOW`, `SAND`, …). Use the terrain's own colours anywhere a prop meets the ground, so drifts and bases blend in.
- Each prop has a local origin at `(0, 0)`, the point where it meets the ground. Up is negative y, and the art faces right.
- Units are world units. See Scale below for how big things should be.

## Scale

**About 27 world units make a metre.**

| | Centimetres |
|---|---|
| 1 world unit | about 3.7 cm |
| 1 art pixel (2 world units) | about 7.4 cm |
| 10 art pixels (20 world units) | about 74 cm |

This comes from the people in the game: a standing spectator, marshal or prisoner is 48 tall, about 1.75 m.

Measure new props against these, which are taken from the code:

| Reference | Size in world units |
|---|---|
| Standing person (`drawPerson`, `drawPrisoner`) | 48 tall |
| Rider on the bike, ground to top of helmet | about 66 tall (`RIDER_HEAD` is 44 above the axles, the helmet reaches 10 higher, and the axles are 12 off the ground) |
| Bike | about 74 long: `WHEELBASE` 50 plus a wheel of `RADIUS` 12 at each end, so each wheel is 24 across |
| Hut | 136 tall, its door 52 |
| Street lamp | 168 tall |
| Deciduous tree, big pine | about 182 and 186 tall |
| Ski-lift pylon, watchtower | about 230 and 236 tall |
| Construction crane | about 360 tall |

To size a prop, take its real size in metres and multiply by 27, then round to a multiple of 2. For example:

| Real thing | Real size | World units |
|---|---|---|
| Door | 2 m tall | 54 |
| Park bench | 1.8 m long, seat 0.45 m, back 0.85 m | 48 long, seat 12, back 24 |
| Kitchen table | 0.75 m tall | 20 |
| Two-person tent | 1.1 m tall | 30 |
| Garden flagpole | 6 to 8 m | 162 to 216 |

- Tall structures are not drawn at true scale, or they would not fit on screen: only about 340–450 units of height are in view, with the rider two-thirds of the way down. Draw them tall enough not to look like toys next to the rider, like the pylon, watchtower and crane above, and keep the parts people use (doors, cabins, windows, chairs) at true scale, so a taller structure gets longer legs, posts or masts rather than bigger details.
- Small props may be drawn up to about a quarter bigger than true scale, so their pixel detail still reads. Don't go further than that, or they'll look too big next to the rider.
- A prop's size is its sprite `bounds` or its `PROP_EXTENTS` entry: the top is how tall it stands, and right minus left is how wide it is. Check these numbers against the tables above before handing a prop over.

## Drawing tools

Drawing functions receive tools, never a raw `ctx`:

```js
pixelRect(x, y, width, height, color, 2)
pixelPath([[x, y], …], color, thickness, 2)
drawPixelDisc(cx, cy, radius, color, 2)
drawPixelText(text, cx, y, color)      // only in drawing.js, see Flipping
```

Write functions as `export function drawThing({ pixelRect, pixelPath }, …)` and destructure only the tools you use.

## Split static from live

- **Static art goes in a sprite.** Draw everything that never changes into a function `drawThing(tools)` that draws down to y = 0 (or to its body's bottom). `drawing.js` caches it once, so export its bounds as `[left, top, right, bottom]`.
- **Ground contact is drawn live.** Feet, footings and drifts follow the slope through `groundOffset(localX)`, which gives the ground's y at a local x, relative to the anchor. Put these in a separate `drawThingFoot(tools, groundOffset)`.
- **Moving parts are drawn live** from pure functions of time. For example, `liftChair(time, phase)` returns `{ x, y, alpha }` and `drawChair(tools, swing)` draws it.
- **Logic goes in pure, exported functions.** Positions, timing and whether something reacts should be pure functions, so they can be unit-tested without a canvas.

## Time and motion

- `time` is in seconds. **`time === 0` means still**: reduced motion, the editor and thumbnails. Every animation must look right and hold still at time 0.
- Stagger identical props with a fixed per-prop `phase` from 0 to 1, which `drawing.js` derives from the prop's x. Never use `Math.random()`, because props must look the same on every frame and every replay.
- Props are decoration only. They never change physics or gameplay.

## What a prop can react to

`drawing.js` passes these scene values. Use them, and ask for anything else rather than assuming it exists:

| Field | Meaning |
|---|---|
| `time` | Seconds; 0 means hold still |
| `riderX`, `riderY` | The rider (or ragdoll) position, or `null` |
| `weather` | The trail's weather, resolved (see `js/weather.js`); read the wind on a prop with `propWind` |
| `landing` | The last hard landing `{ x, y, time, strength }`, or `null` |
| `flight` | A startled animal's `{ age, dir }` (birds, bats, fish, squirrels) |
| `corgi` | Coda's state from `corgiStep`, kept per prop by render.js |
| `swoop` | A vulture's pose while it comes down to a crash |

**The wind blows either way**, set by the trail's `windDirection`. `propWind(scene, mirrored)` in drawing.js gives a prop's `wind` (0 to 1) and `downwind` (-1 or 1 in the prop's own frame, already flipped for a mirrored prop). Anything wind-blown (smoke, flags, grass) should lean or drift `downwind`.

## Reuse before writing new code

| Need | Use |
|---|---|
| Something that turns to watch the rider | `riderGaze(scene, x, y, mirrored, eye)` in drawing.js: sideways and up or down from `eye` (spectators, marshals, camera crew, scarecrow, snowman) |
| Water dripping from a point | `drawDrip` in cave-props.js (cave drip, icicles) |
| Hanging from the rock above | Add the prop to `CEILING_PROPS`; `propWallFit` gives the roof and the drop to the floor |
| Pine boughs | `PINE_TIERS` and `drawPineTiers` |
| A flickering warm light | `lanternFlicker` and the lantern light in lighting.js |
| Fire, for anything that burns | `fireTongues`, `fireFrame` and `drawFire` in fire.js, sized to the prop: the torch and the fireplace both use them |
| Wind on a prop | `propWind` in drawing.js |
| Animals that flee from the rider | The `STARTLE` table in render.js |

## Flipping and rotation

- A flipped prop is drawn mirrored around its anchor, so art that faces right will face left.
- **Text and numbers would show mirrored.** Leave them out of the sprite and export their position, e.g. `PYLON_NUMBER`, so `drawing.js` can draw them the right way round.
- Anything world-directional (wind, smoke, sloped cables) needs a `downwind` or `dir` argument rather than a hard-coded direction.
- Props whose parts must hang plumb or follow the world, like a chair on a rope or icicles, should not rotate. Say so in the module so they can go in `UNROTATABLE_PROPS`.

## Interactions

A prop the rider can use (like telling Coda to sit) works through `js/interactions.js`. The interact key (E by default, d-pad down, a tap on touch screens) acts on the nearest ready one within reach (`INTERACT_REACH`, 64 units either side and 72 above or below, unless the prop sets its own), and its key is shown over it only while the rider is that close. In the draft, describe what the interaction does and draw any pose it needs; the wiring is a `find(prop)` / `act(prop)` entry in render.js's `INTERACTIONS`, where `act` returns `{ sound, announce }`. Interactions are decoration and must never change the ride.

## Lights

Anything that glows at night needs the glowing part drawn on its own, e.g. `drawHutWindowGlass(tools, flicker)`, plus a light point such as `HUT_WINDOW_CENTRE`. The renderer handles when it turns on.

## Making props feel alive

1. **Reactions keep the levels lively.**
   Bending grass, a flipping mailbox flag, birds flying off and falling snow make the bike feel like part of the world.
   > ⚠️ Keep these reactions out of the physics simulation so replays still play back exactly the same.

2. **Tie props to existing systems.**
   - **Time of day:** lamps, windows, lanterns
   - **Weather:** puddles and dripping roofs in rain, bright flashes in lightning
   - **Materials:** snowy and sandy versions of the same prop

3. **Use variants instead of new props.**
   One fence with 3 colour palettes and 2 levels of wear gives a lot of variety for little work.

4. **Anchor props to the ground.**
   With the new block terrain, wall props (icicles, graffiti, roots) can attach to the nearest edge and follow its angle. That way they stay in place when you edit the terrain.

## Module checklist

- [ ] `// @ts-check` and a header comment saying what the module holds
- [ ] All coordinates are multiples of 2, the art is lit from the right and faces right
- [ ] It is sized against the Scale tables, about 27 units to the metre
- [ ] The static sprite, its bounds, the live ground contact and the live moving parts are separate functions
- [ ] Every animation holds still at `time` 0, and nothing uses `Math.random()`
- [ ] Only the scene fields listed above are used
- [ ] Existing helpers are reused rather than copied
- [ ] Every export has a JSDoc comment explaining its units and coordinates

## Wiring checklist (done in the project)

For each new prop type, follow the desert commit (`9dd7708`) and the mountain props as examples:

- `drawing.js`
  - imports
  - a `drawProp` branch
  - `CANOPY_SPRITES` and `PROP_EXTENTS`
  - `CEILING_PROPS`, `UNROTATABLE_PROPS` or `canFlip` if needed
  - `propSpan` for props that move or hang
  - `drawPropGlow` for lights
- `render.js`
  - `PROP_RISE`, `PROP_REACH` and `PROP_HANG` for culling
  - `SCENERY_SHADOWS`
  - `GLOW_REACH` and the glow head point
  - any new `propScene` fields
- `lighting.js`
  - `propLights` for props that cast light
- The editor
  - an `<option>` in `editor.html`
  - `GLOWING_PROPS` in `js/editor/render.js`
- `js/trail-schema.js`
  - the list of known prop types
- Docs
  - `TRAIL_FORMAT.md` (the prop list and a behaviour paragraph)
  - tick off the items in `PROPS_PLAN.md`
- Tests
  - `scripts/test-<theme>.mjs`, added to `npm test`
  - `scripts/test-terrain.mjs` if a prop can't rotate
- Generated files
  - run `npm run sw` and `npm run context`
