# Hjulben trail format

All trails use the same JSON schema. Shipped career trails live in `trails/official/`, shipped bonus trails in `trails/bonus/`, and locally authored standalone trails in `trails/custom/`. The editor's JSON export can be placed directly in `trails/custom/`.

`npm run dev` watches all three folders and regenerates `trails/catalog.json` (official and bonus) and the local, git-ignored `trails/custom-catalog.json` whenever a JSON file changes. The browser loads both catalogs through `js/trails.js`, so new files appear after the next page refresh. Trails saved or imported in the browser outside dev mode are kept in the browser (IndexedDB) and listed alongside the file-based custom trails.

A trail cannot declare itself official inside its JSON. The generated catalog assigns source from the containing folder: official trails participate in career progression and official best times; bonus trails are handpicked extras, often made by another rider, that keep save best times, medals and the online board but sit outside career progression; custom trails are clearly labeled, stay on the device and never alter career progress. Promoting a custom trail to a bonus trail is a matter of moving its file to `trails/bonus/`. Its times start over under the new `bonus:<file>` id, and the file name must then stay put, because the online board knows the trail by it.

The world uses Canvas coordinates:

- `x` increases to the right.
- `y` increases downward.
- A smaller `y` value therefore means higher terrain.
- Distances are expressed in world-space pixels.
- There is no height limit. `y` may go as far negative as you like, and the camera follows the rider all the way up. Downward, the camera stops a little below the fall line (see below).
- With the default start at `x = 90`, the bike's wheels begin near `x = 65` and `x = 115`.

## Complete example

```js
{
  name: 'Example Trail',
  start: { x: 90, y: null, facing: 1 },
  finish: { x: 1800, y: null },

  terrainBlocks: [
    {
      id: 'ground',
      material: 'grass',
      outer: { nodes: [
        { x: 0, y: 320 },
        { x: 180, y: 320, out: [260, 320] },
        { x: 340, y: 260, in: [280, 260], out: [400, 260], mode: 'smooth' },
        { x: 520, y: 330, in: [460, 330] },
        { x: 780, y: 280 },
        { x: 780, y: 700 },
        { x: 0, y: 700 }
      ] },
      inner: []
    },
    {
      id: 'far-side',
      material: 'grass',
      outer: { nodes: [{ x: 900, y: 290 }, { x: 1950, y: 290 }, { x: 1950, y: 700 }, { x: 900, y: 700 }] },
      inner: [
        { nodes: [{ x: 1300, y: 400 }, { x: 1600, y: 400 }, { x: 1600, y: 520 }, { x: 1300, y: 520 }] }
      ]
    },
    {
      id: 'ledge',
      material: 'brick',
      outer: { nodes: [{ x: 1050, y: 200 }, { x: 1380, y: 200 }, { x: 1360, y: 240 }, { x: 1070, y: 240 }] },
      inner: []
    }
  ],

  apples: [
    { x: 300, y: null },
    { x: 840, y: 190 },
    { x: 1200, y: null },
    { x: 1450, y: 470 },
    { x: 1700, y: null }
  ],

  props: [
    { x: 250, y: null, type: 'tree', layer: 'back' },
    { x: 650, y: null, type: 'rock', layer: 'front' }
  ],

  spikes: [
    { x: 1250, y: 150, radius: 18, spin: 1 }
  ],

  weather: {
    sun: 0.25,
    clouds: 0.9,
    fog: 0,
    rain: 0.5,
    snow: 0,
    lightning: 0.35,
    wind: 0.6,
    windDirection: 'left'
  }
}
```

The example has rolling ground, a gap between x 780 and 900, a far side with a cave in it, and a brick ledge floating above the far side.

## Terrain: `terrainBlocks`

`terrainBlocks` is the trail's terrain: a list of blocks. Each block is one connected piece of solid: a material, a closed outer boundary, and any number of caves.

```js
terrainBlocks: [
  {
    id: 'ground',
    material: 'sand',
    outer: boundary,
    inner: [cave, ...]
  }
]
```

- `id`: the block's identity, used for invalidation. Any stable string.
- `material`: one of the terrain materials. It drives the fill, strata, edge, surface and spray.
- `outer`: the boundary around the solid.
- `inner`: the caves inside it, each a boundary. Use `[]` for none.

Separate pieces of solid are separate blocks, even when they share a material. Cutting a block in two in the editor leaves two blocks.

A **boundary** is a ring of nodes. Do not repeat the first node at the end. Each node has:

- `id`, `x`, `y`.
- `mode`: `corner`, `smooth`, or `independent`. A `smooth` node keeps its two handles in line, so the surface bends through it; a `corner` keeps it angular.
- `in` and `out`: the curve handles for the edges either side, as absolute `[x, y]` world positions, or `null` for straight ones. An edge is curved when the node before it has an `out` handle or the node after it has an `in` handle.
- `edge`: `straight` or `curve`, describing the edge leaving the node. Normalization reconciles it with the handles.

Node and boundary ids only need to be unique within the trail, and hand-written coordinates are fine. Normalization fills in anything missing, so a minimal block only needs its `outer` nodes. A trail needs at least one block.

Blocks are drawn and collide in list order, and later blocks win where they overlap. Every edge collides: tops, undersides, walls, and corners, so blocks can be any shape, including overhangs, vertical faces, and loops.

Authoring guidelines:

- **Ground**: one wide block whose top edge is the route and whose bottom sits well below it. Keep the opening section relatively flat so both wheels spawn safely, and keep terrain beyond the finish.
- **Ends**: close each end with terrain that fits the setting, such as a bank, a rock wall or a rise in the fields, so the rider can't ride out. Then let the ground carry on well beyond it, further than the camera can see from anywhere the rider can reach. An edge where the terrain stops looks unfinished unless it's meant, like a cliff or a floating island.
- **Slopes**: broad curved edges ride well. Spans of `140–190` units per hill are forgiving; short spans with large height changes create abrupt geometry.
- **Few points**: use as few points as the shape needs, since every point adds to the trail's size and to its share link. A straight run, level or sloped, is just its two ends; validation warns about points on a straight line. A bend is a `smooth` point with `in` and `out` handles, not a chain of short straight pieces sampled along a curve.
- **Gaps**: a break between two blocks. The walls either side are solid, so a rider who falls in can hit the cliff face. Start around `80–100` units wide for introductory jumps; wider gaps need a clear launch ramp and a landing below the takeoff height.
- **Ledges and islands**: a separate block above the ground. Leave at least one wheel diameter between it and the ground, and more when the rider is expected to pass underneath.
- **Caves**: an `inner` boundary inside a block. The cave is open space with a solid roof and floor.
- **Loops**: a block with a cave, ridden around its inside. Leave generous room in tight bends; very tight radii are hard to ride cleanly.

### Back walls: `layer: "back"`

A block with `"layer": "back"` is a back wall. It sits in `terrainBlocks` in the same format as any other block, but it is scenery: nothing collides with it, it is drawn darkened behind the props and the terrain, it doesn't count as the trail's terrain and it doesn't change the trail's hash or medals. Back walls decide what is a cave. Air with no back wall behind it looks through to the sky at the back of the scene, so the hollow of a ring, the space under a ledge or a window in a building is lit like open air. Air in front of a back wall only gets the light that reaches in from open air, so give an enclosed cave a back wall to keep it dark:

```json
{ "id": "cave-back", "material": "concrete", "layer": "back", "outer": { "id": "cave-back-boundary", "nodes": [
  { "x": 470, "y": 205 }, { "x": 1265, "y": 205 }, { "x": 1265, "y": 325 }, { "x": 470, "y": 325 }
] }, "inner": [] }
```

Let a back wall reach into the rock around the cave, so no gap shows at its edges, and stop it short of the cave mouth for daylight to fade in. Back walls never block lights, so lanterns and the headlight light them up. A trail needs at least one block that is not a back wall.

In the editor, pick **Back wall** as the **Layer** of the Block tool to draw back walls, and of the Cut tool to cut into back walls without touching the terrain. The inspector's **Layer** switches a selected block between terrain and back wall, and **Fill caves with back walls** adds a back wall in the exact shape of each cave (`inner` boundary) in the selection. Caves formed by separate blocks have no `inner` boundary, so draw their back wall with the Block tool. Back walls show with a dashed outline, and clicking a cave picks its back wall before the terrain around it.

#### Building scenery from terrain

Back walls aren't only for caves. Anything the rider should pass in front of can be a back wall: a row of apartment buildings behind a street, a barn, a bridge, a church, a factory. Back walls are drawn a little darker than the terrain, which sets them behind the riding line, and in daylight they stay lit like the open air around them. Build them like the terrain, out of blocks of the materials:

- **A building:** a `brick`, `stone` or `concrete` back wall for the facade, with a roof edge, chimneys and an upper storey as further back-wall blocks on top.
- **Windows:** cut each window out of the facade as a cave (an `inner` boundary, or the Cut tool), then fill the hole with a `glass` back wall of the same shape. The glass shows what lies behind it, the sky and the city in the backdrop, so it reads as a window. Don't lay glass over a facade without cutting the hole first, or the wall shows through the pane.
- **Details:** sills, balconies, cornices, awnings, shopfronts, doors and flower boxes are small blocks too (`wood`, `stone`, `concrete`), and props such as `flowers` can stand on them. Detail drawn this way can be as rich as the setting calls for. A detail laid over a wall shows because it is drawn after the wall in a material of its own: one in the wall's own material, a `stone` sill on a `stone` facade, is invisible, and validation says so.
- **Rideable buildings** are ordinary terrain: the rider rides on their roofs and against their walls. In this side view the whole block is the building's front, so give it windows and details the same way. A window cut into terrain and filled with `glass` terrain is solid glass the rider can land on and break (see Terrain materials).

Draw what you need with terrain rather than looking for a prop that doesn't exist, as long as it makes sense in the setting. `scripts/render-trail.mjs` shows how it looks.


Validation reports blocks that enclose no area, cross themselves, or are buried under other blocks so that they have no effect, and objects that are left over open air. A block inside others still shows where it is drawn last in a material different from the one under it, so it is only reported when it is never seen either: inside terrain of its own material, or covered by blocks drawn after it.

## Start: `start`

`start` controls the bike's initial midpoint and riding direction:

```js
start: { x: 90, y: null, facing: 1 }
```

- `x` is the horizontal midpoint between the wheels.
- `y` is the wheel-axle height. Use `null` to place both wheels automatically on the topmost surface at `x`, or a number for an explicit airborne, ledge, or cave start.
- `facing` is `1` for right and `-1` for left.

Put the start on level ground, unless the clock is meant to start at once: `y: null` on the top surface, or, on a ledge or in a cave, the floor's height minus 12 (the wheel's radius). A bike standing on the ground there settles onto its suspension before the run and starts at rest; the clock starts on the rider's first input, or as soon as the bike moves by itself. Level means the ground under both wheels, 25 units either side of `x`, is at the same height: on a slope the bike rolls away, or on a gentle one creeps off its spot, and a start even a unit above the ground drops the bike, which starts the clock at once. A start in the air, or on a steep slope, is fine when it's meant: the clock starts as the bike drops or rolls away, so it's part of everyone's time.

The editor's **Start** tool places the start where you click, and snaps it onto the ground under its wheels when you click close to it; further away, it stays in the air. Select the start marker to move it (dragging snaps the same way) or change its facing in the inspector. A trail always has one start, so it cannot be deleted.

## Finish: `finish`

```js
finish: { x: 1800, y: null }
```

Like the start, the finish is a point. It is a flower at (`x`, `y`), floating 22 units above that point; `y: null` means it stands on the surface below. The flower floats, so don't leave it sitting on the ground: give `y` a number that lifts it clear, about 40 units above the surface, so the flower hangs about 60 up like a ground-anchored apple. It can also hang higher in the air, like any apple, where reaching it is part of the challenge. Place it with the editor's **Finish** tool, or select it and drag it. The run ends when the bike or rider touches the flower, from any side, once every apple is collected. The finish may be left or right of the start.

## Terrain materials

Each block sets its own material with its `material` property. Available presets are:

| Material | Intended character                       |
| -------- | ---------------------------------------- |
| `grass`  | Green surface with soil underneath       |
| `dirt`   | Warm loose-earth trail                   |
| `sand`   | Pale warm sand, bare by default          |
| `concrete` | Grey, hard terrain                     |
| `stone`  | Cobbled stone wall with a pale capstone edge |
| `snow`   | Pale surface and cool subsurface         |
| `brick`  | Brick pattern with a green rideable edge |
| `wood`   | Staggered wooden planks with grain and knots |
| `glass`  | See-through panes that let light in; can break |

Material definitions live in `terrainMaterials` at the top of `js/materials.js`. Each preset controls fill, internal layers or pattern, edge colors, vegetation, and wheel-spray colors.
Every material collides the same way except `glass`, which is judged by the block's shape. Its thickness and span are the short and long sides of the rectangle with the same area and perimeter as the block. That's exact for a rectangle at any angle, so a flat pane, an upright wall and a tilted plank all measure the same way. A bent or curved strip measures about as thick and as long as the strip itself, and a round or square blob measures as thick as it is wide:

- **Thick** (16 units or more): never breaks, like any other terrain.
- **Thin** (thinner than 16): has a strength, the speed at which a wheel, the frame or the rider must hit it (straight into the pane) to shatter it. Strength is `280 × (thickness / 8) × √(96 / span)` units/s, so thinner and longer panes are weaker. Riding along a pane barely pushes into it, so driving across thin glass is safe; slamming the wheels down or landing from high up is what breaks it. Resting weight counts as a 40 units/s hit, so only a pane weaker than that cannot carry the bike at all.

| Pane (thickness × span) | Strength (units/s) | Breaks on a landing from about |
| --- | --- | --- |
| 12 × 96 | 420 | 230 units up |
| 8 × 96 | 280 | 100 units up |
| 8 × 200 | 194 | 50 units up |
| 8 × 300 | 158 | 33 units up |
| 4 × 96 | 140 | 26 units up |
| 4 × 200 | 97 | 12 units up |
| 2 × 400 | 34 | cannot carry the bike |

A hit that doesn't break a pane but is harder than half the strength it has left cracks it, and the pane loses half the hit's speed from its strength. So landings at under half a pane's strength leave no mark, a landing at 60 % cracks it and the third one breaks it, and a landing at 90 % leaves deep cracks and the next one breaks it. Every hit within a quarter of a second of a crack belongs to the same landing: both wheels coming down count once, by the harder hit. Resting weight never cracks glass, but a pane cracked below 40 units/s gives way under the bike. Cracks show on the pane, and they and the lost strength last until the next attempt.

The same pane always breaks at the same hit, so replays and ghosts stay exact. Upright panes work the same way: riding into an 8 × 300 wall breaks it from about 160 units/s.

A pane that breaks is gone for the rest of the attempt, and the bike loses about a third of its speed into the pane going through. Retrying puts it back. The rider's head breaks thin glass rather than crashing on it. The thresholds are `GLASS_*` in `js/config.js`.

## Apples

Each apple has a horizontal and optional vertical position:

```js
apples: [
  { x: 300, y: null },
  { x: 700, y: 190 },
];
```

A numeric `y` is the apple's center and allows it to be placed freely in the world, including over gaps, on ledges, or in caves. `y: null` anchors the apple 60 units above the topmost surface at `x`; do not put a ground-anchored apple over a gap. The editor's **Apple** tool always places an apple at the exact clicked position.

An apple is collected the moment the player's hitbox touches the apple as drawn: the wheels' tyres, the frame between the axles, or the rider's head and body. A tyre overlapping the apple by a single pixel is enough, but riding close by is not, so place an apple where the route actually touches it. A ground-anchored apple is collected by riding underneath it; anything higher needs a hop or a wheelie.


## Nisse

A trail can hide one nisse, a small Danish gnome, as an optional collectible:

```js
nisse: { x: 1840, y: null },
```

`x` and `y` are where its feet stand; `y: null` stands it on the topmost surface at `x`. A trail without a nisse leaves the field out. The rider takes it by touching it, like an apple, but it never counts towards the apples: the finish opens without it, nothing points to it, and it doesn't change the trail's hash, so adding, moving or removing it keeps best times, ghosts and leaderboards. Finding it is remembered per trail in the rider's save, shown on the trail's card, and earns achievements. Put it off the main line, where it takes a skill the player already has to reach (see `TRAILS_GUIDE.md`). Most trails don't have one: it is a collectible with achievements, so keep it a find. Don't add one by default, only when the trail has a hiding place worth the detour. In the editor, set the Apple tool's **Place** to **Nisse**; placing it again moves it.

## Props

```js
props: [
  { x: 250, y: null, type: "tree", layer: "back" },
  { x: 650, y: 245, type: "rock", layer: "front" },
  { x: 900, y: null, type: "sign", layer: "front", text: "SLOW →" },
];
```

Available prop types are `tree`, `pine`, `sapling`, `pine-small`, `bush`, `fence`, `rock`, `boulder`, `pebbles`, `flowers`, `stump`, `cactus`, `cactus-small`, the desert props `skull`, `tumbleweed`, `car-wreck`, `water-tower`, `windmill`, `heat-haze` and `vulture`, the mountain props `cairn`, `ski-lift`, `icicles`, `snow-pine`, `hut` and `snowman`, `crystal`, `sign`, `smoke`, the woodland props `squirrel`, `tent`, `fireplace` and `grass`, `corgi` (Coda), `rabbit`, the wall props `vines`, `roots`, `moss` and `ivy`, the farm props `crates`, `apple` (a small decorative apple to hang in trees or fill crates and the wheelbarrow; it is not collected), `ladder`, `wheelbarrow`, `scarecrow`, `beehive` and `tyre`, the street props `cone`, `barrier`, `dumpster`, `lamp`, `bird`, `bench` (a Copenhagen bench) and `christiania-bike`, the building-site props `crane` and `scaffolding`, the cave props `hanging-roots`, `stalactites`, `drip`, `lantern`, `bats`, `mushrooms`, `minecart` and `beams`, the water props `lily`, `reeds`, `seaweed`, `fish`, `duck`, `frog`, `boat`, `bubbles` and `dragonfly`, the trials-event props `tyre-wall`, `hay-bales`, `course-tape`, `banner`, `spectators`, `pit-board`, `petrol-can`, `marshal-start`, `marshal-finish` and `camera-tower`, the trail hints `warning-triangle`, `warning-bang`, `warning-skull`, `arrow-sign` and `halfway-flag`, the prison props `prison-fence`, `watchtower`, `jail-cell`, `escape-tunnel`, `ball-and-chain`, `wanted-poster` and `tally-marks`, the spider props `spiderweb`, `cobweb`, `spider` and `cocoon`, the dungeon props `dungeon-bars`, `portcullis`, `torch`, `hanging-chains`, `gibbet` and `skeleton`, the Danish props `flagpole` (Dannebrog), `mill` (a windmill), `farmhouse`, `mailbox`, `stall` (a self-serve roadside stall) and `wind-turbine`, `graffiti`, and the sprayed tutorial drawings `tutorial-gas`, `tutorial-brake`, `tutorial-lean`, `tutorial-lean-forward`, `tutorial-rotate`, `tutorial-flip`, `tutorial-light`, `tutorial-restart` and `tutorial-ledge`. `y: null` anchors a prop to the topmost surface at `x`; a numeric `y` places its ground/contact origin explicitly. `layer` may be `back` or `front`: `back`-layer props are drawn behind the terrain as well as the gameplay, while `front`-layer props are drawn in front of the gameplay.

Dress nature generously and set pieces sparingly. Trees, bushes, grass, flowers and rocks can fill a trail as much as the setting calls for, so it doesn't look bare, as long as they stay clear of the riding line. Pick only a few landmarks and characters (`farmhouse`, `mill`, `wind-turbine`, `flagpole`, `hut`, `scarecrow` and the like) to make the trail its own; each belongs to one trail, or a few at most. Coda (`corgi`) is an easter egg who already has his trail. See rules 10 and 11 in `TRAILS_GUIDE.md`.

A `sign` prop carries an optional `text` string that is drawn on its board with the game's pixel font. Use signs sparingly, if at all: the player should work out what to do from the trail itself. Text wraps onto up to 4 lines of 10 characters; supported characters are `A`–`Z`, `0`–`9`, space, and `→` `←` `↑` `↓` `/` `.` `!` `+` `-` `:` `×` `'`. Lowercase is drawn as uppercase, anything else draws as `#`, and text that doesn't fit is cut off. In the editor's text field, typing `>`, `<` or `^` enters `→`, `←` or `↑`.

A `banner` and a `pit-board` take `text` too. A blank banner shows one of the made-up sponsors (Knobbly Tyres, Äpple Oil or Hjulben Racing), picked by its position; typing a sponsor's name shows that sponsor's banner, and any other text (up to 16 characters) is printed on a plain blue banner. A pit board shows its text (up to 4 characters) or, when blank, a position from `P1` to `P9`. Neither can be flipped, nor can the `halfway-flag`, so their text always reads the right way round. A `stall` takes `text` for its hand-painted sign, up to 2 lines of 9 characters with the banner's characters; blank, it reads `KARTOFLER 20 KR`. A stall can be flipped, and its sign still reads the right way round.

Some event props react to the ride. `spectators` cheer while the rider is close, duck when the rider crashes nearby and then wince until the restart. The marshals wave their flag while the rider is close: `marshal-start` a green flag, `marshal-finish` the checkered one. The `camera-tower`'s camera turns to follow the rider, and its red tally light blinks. The `course-tape` flutters in the wind, its loose end blowing downwind. A `halfway-flag` is pale until the rider rides past it, when its beacon lights up and its timing board shows the ride time it was passed at, in the same format as the timer. `arrow-sign` points right; flip it to point left or rotate it to point up or down. The tutorial drawings are painted onto the rock like `graffiti`. All of this is decoration and never changes the ride.

The prison props react too. A `watchtower`'s searchlight sweeps slowly to and fro and swings round to lock on to the rider once they are below it and close; after dark it throws a beam and a bright spot where the beam meets the ground. The prisoner in a `jail-cell` lounges on the bunk until the rider comes by, then grips the bars and rattles them, watching the rider go. In an `escape-tunnel` a prisoner peeks out and looks about, sinking back into the hole as the rider comes close. `tally-marks` are scratched into the rock like `graffiti`, and the `wanted-poster` can't be flipped, like the banner.

The dungeon props set the scene underground. `dungeon-bars` are iron bars that run from the roof down to the floor under each bar, like the support `beams`; out in the open they stand on their own with spear points. Set side by side every 60 units they make one long wall of bars, and now and then two of them are bent apart where someone squeezed through. A `portcullis` hangs from the roof down to the floor and grinds up into the roof as the rider comes, dropping again behind them. A `torch` burns on an iron stand, flickering and lighting the rock around it like a `lantern`. `hanging-chains` and a `gibbet` cage hang from the roof like the cave props, swaying in the draught and swinging after a hard landing nearby. A shackled `skeleton` turns its skull to watch the rider, and its jaw chatters after a hard landing nearby. The bars and the hanging props can't be flipped or rotated.

Dannebrog flies from the `flagpole`, streaming downwind and rippling in the wind. The `mill` is a Danish windmill, a whitewashed base, a gallery and a dark shingled tower under a tarred cap, whose four sails turn slowly anticlockwise, faster in a stronger wind (about a turn every four seconds in a gale); it is a different thing from the desert's `windmill` pump. The `farmhouse` is a Danish half-timbered farmhouse seen long side on, a background landmark about 256 units wide: dark timber framing, limewashed white or yellow-ochre walls (picked by its x, so the editor shows what the game will), five white windows, a green door, hollyhocks against the ends and a thick hipped thatched roof with a smoking chimney. Its plinth follows the ground, its smoke blows downwind like the hut's, and after dark lamps are lit in most of its windows, never fewer than two, the same ones every night. The `mailbox` is a Danish post-red box with a post horn on a wooden post; its yellow flag hangs down until the rider rides past it (like passing a `halfway-flag`), then flips up for the rest of the ride. The `stall` is a self-serve roadside stand under a tarred roof with potatoes and strawberries on the counter and an honesty box: when the rider is close, the interact key (as with Coda) drops a coin into the box with a clink. A `wind-turbine` stands slim and hazy as though on the horizon, best on the `back` layer, its three blades turning slowly clockwise, faster in a stronger wind; after dark the red light on its nacelle blinks, in step with every other turbine's, like a real wind farm. With reduced motion the flag is simply up once passed, no coin is seen to drop, and the blades stand still. In the woods, a tuft of `grass` sways downwind and is pushed flat as the rider brushes through it, a `tent` glows from the lantern inside it after dark, like the `hut`'s window, and a `fireplace` is a ring of stones round burning logs: its flames flicker and throw sparks, its smoke blows downwind like the hut's, and it lights the ground round it like a `lantern`. On the street, the Copenhagen `bench` and the `christiania-bike` stand still. The tutorial drawings are sprayed on the rock, each a bike and the keys to press: `tutorial-gas` a bike pulling away with speed lines behind it (↑), `tutorial-brake` a bike pitched onto its front wheel with its rear lifting, the rider leaning back against it and an arrow tipping it back (↓ + ←), `tutorial-lean` a wheelie tipping back (←), `tutorial-lean-forward` a bike nosing down a drop (→), `tutorial-rotate` a bike spinning in mid-air inside a loop (←), `tutorial-flip` a bike turned to face back the way it came beside a U-turn (Space), `tutorial-light` a headlight beam (L), `tutorial-restart` a bike flipped over onto its rider's helmet (R), and `tutorial-ledge` a bike hanging from a ledge by its front wheel, with an arrow up over the lip (↑ + →).

`smoke` is a plume on its own, rising from its anchor and blown downwind like the hut's chimney smoke. Put it on top of a chimney built from terrain blocks: with `y: null` it sits on the topmost surface at its x. It can't be rotated.

The spider props hang from the rock above them like the cave props (or from their own anchor, under a branch say, when there is no roof), and fit themselves to the room under a low roof. A `spiderweb` trembles as the rider passes and its spider scurries up its anchor thread out of the way. A `cobweb` sags from the roof, its tatters stirring in the wind. A dangling `spider` lets itself down on a thread and climbs back up as the rider comes close, and a `cocoon` sways and twitches now and then.

Use the editor's **Prop** tool to place a prop. Select it to drag it, edit its type and layer in the inspector — plus its text, for signs, banners and pit boards — or remove it with **Delete Selection**, `Delete`, or `Backspace`.

## Spikes

Spikes are spinning spiked balls, similar to the killers in Elasto Mania. Touching the spike as drawn with the player's hitbox (the tyres, the frame between the axles, or the rider's head and body) ends the run. The tips are lethal, the gaps between them are not.

```js
spikes: [
  { x: 820, y: 240, radius: 18, spin: 1 },
  { x: 1300, y: 150, radius: 30, spin: -0.5 },
];
```

- `x` and `y` are the center of the spike in world space. A missing or `null` `y` rests the spike on the topmost surface at `x`.
- `radius` is the distance from the center to the spike tips, between `8` and `64` (default `18`). The drawn star's dark outline reaches 2 units past the radius, and its valleys sit at 56% of the radius around a solid round core.
- `spin` is rotations per second. Positive values spin clockwise, negative values spin counter-clockwise, and `0` keeps the spike still. The spin is part of the hit area: a rider can pass close to a gap that a tip is about to sweep through, or not.

Spikes float freely and do not collide with terrain. Use the editor's **Spike** tool to place one at the clicked position; the inspector edits its radius and spin, and the selected spike shows the reach of its tips as a dashed circle. Leave at least one bike length of clearance around the start position.

## Water

Water bodies are rectangles of water that the bike rides through. Water fills the open air inside the rectangle; terrain inside it stays solid, so a body drawn over a pit fills the pit up to its surface.

```js
water: [
  { x: 600, y: 330, width: 400, depth: 110 }
]
```

- `x` and `y` are the top-left corner in world space, so `y` is the water's surface.
- `width` and `depth` are the size, at least `16` and `8` (defaults `240` and `32`).
- Water up to `40` deep is a ford: the bike can ride through it, but the water drags on it and slows it down. A wheel in water deeper than `40`, measured from the surface to the wheel's bottom or the body's floor, wipes the rider out, as does the rider's head going under.
- After a crash the ragdoll floats: buoyancy lifts it to rest at the surface while the water damps its motion. The bike sinks.
- Riding or falling in splashes, and moving through water leaves a wake.

Use the editor's **Water** tool (`W`): drag a rectangle, or click to drop a body of the tool's size with its surface at the click. Drag a body by the middle of its surface, or click open water to select it. The inspector edits width (keeping the body centred) and depth (keeping the surface), and says whether the body is a ford or deep. The editor warns when water covers the start, or lies entirely inside terrain.

Trails without water may leave the field out. Water is part of the trail hash only when a trail has some.

## Weather

Weather settings are independent. All but `windDirection` range from `0` to `1`:

```js
weather: {
  sun: 0.8,
  clouds: 0.25,
  fog: 0.3,
  rain: 0.4,
  snow: 0,
  lightning: 0.2,
  wind: 0.5,
  windDirection: 'left'
}
```

- `sun`: sun size and visibility. A bright, mostly clear daytime sun glares, with a halo and slow rays across the view that stay out of caves: faintly from about `sun: 0.8` with `clouds: 0.25` at `noon`, fully at `sun: 1` with clear skies. Rain, snow and lightning put the glare out, and fog dims it. Terrain or a back wall in front of the sun hides it, and its glare fades with it, so a city's buildings shade the street; glass lets it through. The editor shows the glare beside the sun's level.
- `clouds`: sky cover, `0`–`1`. Separate flat-based clouds grow from a few small puffs into wide banks up to about `0.4`. From `0.3` a cloud deck with a lumpy underside fills in from the top of the sky, pushing the banks down ahead of it. It lowers steadily as the value rises until at `1` the sky is fully overcast, with the sun only a pale glow through it.
- `fog`: mist. Each backdrop layer further back fades more into it and the sky pales. In play fog lies over the whole level and thickens as the value rises, thinning softly near the rider (a little more ahead than behind) so the ground close by can still be read; a lighter veil covers the rider too. Around `0.5` it is a light haze, and at `1` nothing more than about 5 m (roughly three bike lengths) from the bike can be seen. The editor shows only the backdrop fog.
- `rain`: how much rain falls: the number of drops, the screen tint, and the ambient rain volume. Low values are just a few drops; from about `0.6` it builds to a downpour at `1`. The wind sets its slant: straight down in a calm, about 10° at `wind: 0.25`, 45° at `0.6`, and driven nearly flat (about 72°) at `1`. Drops land on the first terrain or water they reach, splashing on the ground and rippling on water, so caves and overhangs stay dry.
- `snow`: how much snow falls. Low values are a few drifting flakes; from about `0.6` it builds to a blizzard at `1`. Flakes are light, so the wind drives them flatter than rain: a breeze tilts them a little, `wind: 0.5` about 50°, and a gale drives them nearly sideways (about 77°). Flakes sway as they fall, are nearer or further away, and settle briefly on the first terrain they reach; on water they melt. Caves and overhangs stay clear. Pair it with `clouds` for a grey winter sky, and with `wind` for a whiteout. Rain and snow can fall together for sleet, both blown by the same wind.
- `lightning`: strike frequency, flash strength, and thunder strength. Thunder follows the flash after a delay that grows with distance and comes from its side of the view: a close strike tears and bangs before rolling, a distant one is a long, muffled rumble.
- `wind`: how hard the wind blows, from still air at `0` to a gale at `1`. It sets the slant of rain and snow and moves every prop that stirs in the wind: flags (the `flagpole` and the `halfway-flag` droop in still air and stream straight out in a gale), the `course-tape`, chimney and fire smoke, the fire's flames and sparks, `grass`, `reeds`, `ivy`, the `ski-lift` chair, how fast a `windmill` turns and a `tumbleweed` rolls, and, more gently, cobwebs, cocoons, spiderwebs and hanging chains. Trees bend in it: the crowns of the `tree`, `sapling`, `pine`, `pine-small` and `snow-pine` lean and sway downwind, with gusts passing through a stand one tree after another, and a `bush` stirs half as much. In a light breeze only the treetops tip now and then; in a gale they lean and sway by up to two art pixels. Above about `0.25` the gusts also show as pale swirls of air blowing through the trail, more and faster as the wind rises. Most skim the ground and follow it over hills; the rest fly high. They only blow through open air, never through the terrain, a cave or the space under an overhang, the same places rain and snow can't reach. They are fewer and fainter in rain, which already shows the wind, and broken into whirling flakes in snow. With reduced motion the trees hold still and there are no swirls. It also sets the wind's sound. A light breeze (up to about `0.2`) is near silent; a strong wind roars, and whistles as it nears a gale.
- `windDirection`: which way the wind blows, `'left'` or `'right'`. Everything blows the same way, flipped props included: flipping a flag, a tumbleweed or a tuft of grass only mirrors its art.

The defaults are a sunny day with a few clouds and a light breeze blowing left: `sun: 1`, `clouds: 0.2`, `wind: 0.25`, `windDirection: 'left'` and everything else `0`. Any setting may be omitted and takes its default, but trails should spell out all of them, as the editor does. Unknown settings are dropped. Weather is decoration only: it never changes the ride, and it is not part of the trail hash.

The editor groups the settings into **Sky**, **Precipitation** and **Wind**, after **Time of day** (an hour slider with **Morning**, **Noon**, **Evening** and **Night** buttons for the classic times) and **Scenery** (the backdrop), with a windsock beside the wind's direction that shows how hard it blows. The **Weather** presets (Clear, Breezy, Overcast, Drizzle, Storm, Sleet, Blizzard and Gale) set every setting except the wind's direction at once, as a starting point to adjust.

## Time of day and backdrop

```js
timeOfDay: 19,
backdrop: 'desert'
```

Both are optional, and each is independent of the other.

`timeOfDay` is the hour of the day, a whole number from `0` (midnight) to `23`, and sets the sky, sun, hill and light colours, and how the scene is lit. No value means noon (`12`); other numbers are rounded and wrapped round the clock, and anything else is noon. The day is blended from a few looks on the clock, and every hour between two is a mix of them:

| Hour | Look |
| --- | --- |
| `0`–`4`, `22`–`23` | Night: a dark blue sky with the moon and stars |
| `6` | Dawn: a pink horizon, the sun low, the last stars going out |
| `7` | Morning: soft, warm light, the sun still low |
| `10`–`16` | Noon: full daylight, the sun high |
| `19` | Evening: a golden sky and a large, low, orange sun |
| `20` | Dusk: the blue hour, the sun's last glow on the horizon and the first stars |

So `5` is halfway from night to dawn, `8` and `9` warm into noon, `17` and `18` turn golden, and at `21` the moon rises. The classic times are `7` (morning), `12` (noon), `19` (evening) and `0` (night), the editor's help points. From about dusk until after dawn (`18` to `6`), the finish, the city windows, lamps and crane lights are lit. The *Night Rider* and *Night Owl* achievements count `21` to `4` as night.

Lighting comes from the terrain and its back walls (see below). Air open to the sky, above the terrain or with no back wall behind it, gets the time of day's light, which fades in through cave mouths and in from the edges of back walls, so a cave closed off by a back wall is dark at any time of day. Air in front of a back wall that sees enough of the sky, such as under a wide overhang, stays lit, with only a soft shade right beneath it. Rock takes the light at its surface and darkens with depth: hardly at all at noon, a little in the morning, more in the evening, and quickly at night. Thin slits under ledges, and small sealed hollows in front of a back wall, are lit like the rock around them. Lanterns, glowing mushrooms, lamps and crane lights and the bike's headlight and tail light cast light of their own, which only reaches the surface of the rock. Apples, spikes and the finish get no light of their own, so in the dark they are only seen where some light reaches them; it is up to the trail to light what the rider should see. Rain softens the light, and lightning lights up the whole scene.

`backdrop` picks the shapes of the two parallax layers behind the terrain. Valid values are `hills`, `mountains`, `forest`, `desert` and `city`; anything else, or no value, means `hills`, and `hills` is not stored.

The theme sets the shapes and the time of day sets the colours, so all combinations work.

## Props: `flip`, `rotation` and wall props

Props sit under `props`, alongside the `terrainBlocks` terrain.

Every prop may carry `flip: true`, which mirrors it left to right. It is omitted when the prop is not flipped. Signs cannot be flipped, because their text would come out mirrored.

A prop may also carry `rotation`, in degrees clockwise about its anchor, from -180 to 180 (other values wrap into that range, and it is rounded to 0.1°). It is omitted when the prop is not rotated. Unrotated props tilt with the slope they stand on and sink a little into it; a rotated prop does neither, so its `rotation` is its whole angle. It turns after any `flip`. Wall props (`vines`, `roots` and `moss`) still find their wall and then turn about their anchor, and `graffiti` turns about its anchor before it is clipped to the rock. Props that move about, hang from a ceiling or sit in water ignore it: `tumbleweed`, `heat-haze`, `vulture`, `ski-lift`, `squirrel`, `corgi`, `bird`, `hanging-roots`, `stalactites`, `drip`, `icicles`, `lantern`, `bats`, `minecart`, `beams`, `lily`, `reeds`, `seaweed`, `fish` and `duck`. Rotation is decoration only and does not change the trail's hash.

```js
{ x: 640, y: 300, type: "rock", layer: "front", rotation: 30 }
```

Four props attach to a wall rather than standing on the ground, and grow toward the open air:

| Prop | Place it | It draws |
| --- | --- | --- |
| `vines` | Just past the top corner of a cliff | Leafy strands hanging down the face, as far as the drop to the floor below allows |
| `roots` | On a wall face | Twisted roots growing out of the rock and drooping down |
| `moss` | On any surface: a wall face, a slope, a top or the underside of an overhang | Cushions of moss lying along the surface whichever way it faces, lit from the upper right, with spore capsules standing up off it and drips hanging under it where there's room. It finds its own angle, so it can't be rotated |
| `ivy` | At the foot of a wall, or on its face | A mat of ivy climbing the face from its anchor, as high as the face goes (up to 120), its outer leaves stirring in the wind |

They find the rock by sampling up to 22 units either side, so they can be clicked slightly into the rock or slightly into the air. They are decoration only — nothing collides with them.

The farm props are decoration as well. The `ladder` leans to the right, so put it just left of a tree trunk, or flip it to lean the other way. The `scarecrow` turns its head to watch the rider go past, and the bees around the `beehive` buzz in place; both are visual only and stay still with reduced motion. The `tyre` is half-buried and sits a little below its anchor, so its dirt blends into the ground.

The desert props are decoration as well. A `tumbleweed` is blown along the ground downwind, faster the stronger the `wind`, bouncing a little and fading out after up to 360 units or where it reaches a wall or a drop, then rolls in again; where it has no room, or in still air (`wind` under `0.1`), it just rocks where it lies. The `windmill` pump's blades barely turn in still air and spin to a blur in a gale. `heat-haze` makes the scene shimmer for about 80 units each way and 44 units up from its anchor; on the `front` layer it shimmers the rider too. It is left out with reduced motion and with simple scenery. A `vulture` circles its anchor, or 170 units above the ground with `y: null`. When the rider crashes within about 640 units of it, with no terrain in between, it glides down a moment later and lands on the ground beside them, where it stands watching until the next attempt. The `car-wreck` is half-buried and sits a little below its anchor, so its sand drifts blend into the ground. With reduced motion, the tumbleweed, windmill and vulture stay still, and the vulture does not come down. All of them are visual only.

The mountain props are decoration too. `icicles` hang from the rock above them like the cave's ceiling props, up to 40 units long and shorter where the floor is close, and meltwater drips off the longest one. A `ski-lift` pylon carries a stretch of rope with a chair riding slowly along it, swinging further and pushed downwind in a stronger wind. The rope runs 160 units each way and climbs to the right (to the left when flipped), so the pylon can stand at the foot of or on a hill. A `snow-pine` is a big pine under snow; a hard landing within 180 units of it shakes its crown and knocks puffs of snow off its boughs. The `hut`'s chimney smoke blows downwind, like the snow and rain, and leans further in stronger wind; after dark its window glows with firelight. The `snowman` watches the rider go by, like the `scarecrow`, and glances up or down at them. With reduced motion, the chair, smoke and drips stay still and landings do not shake the pines. All of them are visual only.

The `squirrel` is woodland decoration. It sits on the ground nibbling a nut until the rider comes close, then runs along the ground to the nearest `tree`, `pine`, `sapling` or `pine-small` within 240 units, climbs the trunk and hides in the crown. It only runs to a tree standing on the ground it can run along, without walls or drops in the way; with no such tree it dashes off away from the rider and fades out. With reduced motion it simply disappears. Put it in the same `layer` as its tree, so it climbs up the front of the trunk.

The `corgi` is Coda, a tri-colour Pembroke Welsh Corgi. He potters about within 80 units of his anchor, sitting, sniffing the ground, standing about and woofing now and then. When the rider comes within 160 units (and 90 above or below), he woofs, runs over and stops a little short of them, wagging and woofing, until they are 300 units away; then he trots home. He only goes along the ground either side of his anchor, up to 220 units, and stops at walls and drops. His woof can be heard when he is on screen. When the rider is close to him (within 64 units either side and 72 above or below), the interact key (`E` by default, shown over his head; d-pad down on a gamepad; a tap on touch screens) tells him to sit: he sits and pants with a wagging tail for 12 seconds, or until the rider leaves. The key only shows, and only works, while the rider is that close. `flip` sets which way he first faces. With reduced motion he sits still at his anchor.

The `rabbit` is a grey-brown wild rabbit, or a mountain hare in its white winter coat when it stands on `snow`. It hops about within 60 units of its anchor, a few short hops at a time, and between hops sits, nibbles the grass or sits up to look about. When the rider comes within 130 units (and 110 above or below), it freezes for a moment, then bounds away from them in long leaps along the ground, up to 200 units from its anchor, stopping at walls and drops, and fades out. `flip` sets which way it first faces. With reduced motion it sits still at its anchor, and simply disappears when startled. It is visual only.

The street and building-site props are decoration too. A `lamp` comes on from dusk until after dawn (from `18` to `6`) and wherever else it is dark, such as in a cave, shining a beam down from its head, and a `crane` shows blinking warning lights at the same times. A `bird` takes off and flies away when the rider comes close; with reduced motion it simply disappears. The `crane` is tall and meant for the `back` layer, and `scaffolding` is meant for the `front` layer, where the rider shows through it as a silhouette.

The cave props are decoration as well. `hanging-roots`, `stalactites`, `drip`, `lantern` and `bats` hang from a cave ceiling: each looks up to 160 units above its anchor for the nearest roof, so place it anywhere under the ceiling (with `y: null` it uses the roof of the first cave below the surface). A `drip` lets a drop swell, fall one pixel at a time and splash into a puddle on the floor below. A `lantern` hangs on a chain from the roof down to its anchor, or stands on the ground where there is no roof above it; it always glows and lights up the cave around it. `mushrooms` stand on the floor and glow too. `bats` scatter away from the rider when the rider comes close; with reduced motion they simply disappear. `beams` are a timber support set that reaches from the floor up to the roof, packed with boards where the roof is uneven, and a `minecart` sits on rails that run along the floor until they reach a wall or a drop, up to 120 units each way. The ceiling props and `beams` cannot be flipped.

The water props are decoration that belongs with [water](#water). `lily` (lily pads with a flower) and `duck` float on the surface of the body under them: each looks up to 160 units above its anchor, or 24 below it, for a surface and rides its ripples. `seaweed` grows from the bed up to just under the surface, swaying in the current, and `reeds` stand on the bed and reach about 28 units out of the water, bent downwind and swaying harder the stronger the wind; place either anywhere in the water and it grows from the bed below (with `y: null`, from the ground at `x`). Reeds also stand on dry ground, for a bank. A `fish` swims to and fro at its anchor's depth, up to 96 units each way through open water, heading first the way it faces; with `y: null` it swims halfway down to the bed. A `fish` darts off and the `duck` takes off when the rider comes close; with reduced motion they simply disappear, and everything else stays still. A `frog` sits on its own small lily pad, riding the ripples and blinking now and then; when the rider comes close it leaps away from them into the water, leaving rings and its empty pad (with reduced motion it is simply gone from the pad). A rowing `boat` floats moored, its rope down into the water, bobbing with the ripples. `bubbles` rise now and then from the bed in a short string, wobbling, and pop at the surface; place them anywhere in the water and they rise from the bed below. A pair of `dragonfly`s hover over the surface, darting from spot to spot up to 56 units either side of the anchor and 10 to 46 above the water, on warm days only: never in rain, snow or a gale. In the `front` layer, water props are drawn under the water, so their submerged parts look wet. The editor warns about any water prop but reeds that is not in, on or over any water.

`graffiti` is painted onto the rock itself rather than placed in front of or behind it, so its `layer` doesn't matter. Place it inside a block, ideally a `brick` one: its `y` is the middle of the piece (with `y: null` it sits 40 units below the surface), and any paint that would land in the open air or on the surface lip is left off. It cannot be flipped.

Sign text wraps at word boundaries onto up to 4 lines of 10 characters, and the board grows taller to fit, staying on its post. Anything longer is cut off, and the editor warns.

## Other fields

- The fall line, where the bike is considered lost, is not set by the trail: it is worked out as 200 units below the lowest solid terrain, so it follows the trail however deep it goes. It also sets how low the camera can look.
- `description`: design notes for the trail, up to 2000 characters; anything longer is cut off when the trail loads. It is not shown during gameplay; the editor lists it as **Notes**.
- `lesson`, `alsoNew` and `world`: optional notes for the career's overview, `TRAILS.md`, which is generated from them: what the trail teaches (one or two sentences, such as "Braking. A downhill run to a fence, with a `SLOW` sign before a drop."), what is new to look at in it, and the world it belongs to, one of those in `trails/worlds.json`. Up to 400 characters each, not shown in the game and not part of the trail's hash, so changing them keeps its leaderboard.
- `author`: optional credit for whoever made the trail, up to 40 characters on one line. The trail menu, the Hall of Fame and the results screen show it as "BY …" / "TRAIL BY …". It does not change the trail's hash, so adding or editing credit keeps its times. The editor remembers the last author you typed and fills it in on new trails.
- `preview`: optional `{ x, y }`, the middle of the trail's thumbnail in the trail list, in whole world units. The thumbnail shows 576 × 192 world units around it, at the same zoom on every trail. The editor sets it with **Edit preview** in the Trail tab. Without it the game picks the trail's most eventful stretch between the start and the finish. Like `author`, it does not change the trail's hash, so framing the thumbnail keeps its times.

## Medals

```js
medals: { gold: 11, silver: 14.5, bronze: 19 }
```

These optional target times are in seconds. The results screen and trail cards award the best medal whose time the run beats or matches. Times must be positive and ordered `gold ≤ silver ≤ bronze`. Any medal can be left out, and an invalid `medals` object is dropped during normalization. The official trails' gold times are based on the replay bot's finishing times in `tests/replays/`.

## Unlocking bonus trails

What opens a locked bonus trail is not part of the trail file. Every unlock rule, for bonus trails and rider items alike, is in `js/unlocks.js`, keyed by the trail's catalog id (for example `'trail:bonus:the-bonny-tyler': { golds: 2 }`). A rule can ask for official trails finished (`trails`), gold medals won on official trails (`golds`), a finished trail (`trail`) or an earned achievement (`achievement`), and every part given must be met. A bonus trail without a rule is open to everyone, even without a savegame, while a locked one is shown with a hint such as "WIN 2 GOLD MEDALS TO UNLOCK". An `unlock` field left in an older trail file is dropped during normalization.

## Recommended authoring workflow

1. Build the base route as one ground block, with no gaps.
2. Ride it in both directions and verify every slope is recoverable.
3. Cut gaps one at a time, beginning around `80–100` units wide.
4. Add ledges, caves, and loops; test tops, undersides, walls, and corners in both directions.
5. Place apples only after the route is stable.
6. Make reaching the finish take some effort where it suits the trail, such as a climb, a last jump or a ledge, rather than ending on easy ground.
7. Add props, materials, and weather last so they do not hide gameplay problems. Dress nature generously, use only a few distinctive set pieces, and keep the terrain's edges out of sight.
8. Test at low speed, full speed, and after imperfect landings—not only with an ideal run.

Each step can be checked with the playtest script below as you go: probe a jump while you shape it, solve the trail once the apples are in, and use `--without` to prove each apple needs the skill it is meant to test. Render it as you go too, and look at the images: see [Seeing a trail from the command line](#seeing-a-trail-from-the-command-line).

## Playtesting from the command line

`scripts/playtest.mjs` (also `npm run playtest --`) rides a trail with the replay bot, so a trail can be tried without opening the game. It is how an AI writing trails can find out whether a jump clears, a ledge can be reached, or an apple needs the skill it was meant to teach, instead of guessing and keeping everything conservative. It runs the same simulation as the game, so what it finds holds in the game.

```sh
node scripts/playtest.mjs trails/custom/my-trail.json            # check, then solve the whole trail
node scripts/playtest.mjs trails/custom/my-trail.json --check    # validation and a survey only, instantly
node scripts/playtest.mjs trails/custom/my-trail.json --without turn
node scripts/playtest.mjs trails/custom/my-trail.json --probe 1200,ground,1,300 --script "gas 1; gas back 0.3; coast fwd 0.8"
node scripts/playtest.mjs trails/custom/my-trail.json --probe 1200,ground,1,0 --goal apple:3
```

A trail can also be named by part of its catalog id or file name, such as `12` or `kicker`. Progress goes to stderr and the report to stdout.

**Solving the trail.** It validates the trail (the same message about several blocks or other items is one line, listing them), gives its size in blocks and kilobytes next to the largest official or bonus trail (and says when it is too large to share as a link), lists the apples with their height above the surface below, then solves it one stretch at a time: from the start to whichever apple the bot takes first, from there to the next, and so on to the finish. For each stretch it reports:

- the time, and whether the greedy bot or the explorer (which plans turn-arounds and run-ups) solved it
- the jumps (the longest with its takeoff, landing and height), flips, turns on the ground and in the air, time spent hanging from one wheel under a ledge, top speed, time crawling, and the hardest landing
- the route, as the bike's position once a second
- **forgiveness:** the share of reruns that still reach the goal when the timing of one second of the run is off by up to 50 ms, and the tight spots, where few did and what went wrong. The bot rides with perfect timing; this shows where a person would struggle. A spot where nothing survives needs frame-perfect riding.
- **traps:** places where a miss leaves the rider with no way back to the line and no crash, so a player can only restart by hand, such as a pit between two buildings with a floor. Besides the jittered reruns, each jump's run-up is ridden again a moment before takeoff at 60% and 80% of the bot's speed, as a player who comes in too slowly would. Wherever a miss leaves the bike at rest off the line, the bot gets a short search to get back to any point of the line ridden so far, this stretch's or an earlier one's, ahead or behind (a miss that drops the rider back onto an earlier stretch costs time, but isn't a trap); where it can't, that's a trap, listed with the stretch and summed up at the end. Fix every one: give it a way back, or make the miss end the run (see "Every miss ends in a way back or a crash" in `TRAILS_GUIDE.md`).
- **escapes:** ends of the trail the rider can ride out of. From the line's outermost point at each end, facing outwards, the bot looks for a way to the last 150 units of the terrain there, past the closing: out along the ground beyond it, or up the wall that ends the terrain. The search takes up to 30 seconds an end, enough for a hard climb up a steep bank, and its answer is saved with the trail's ground: it only searches again after the terrain, start, finish or apples change. Where it gets there, the playtest looks at what lies out there. Onto plain ground and nature it reports an ESCAPE, which is probably a mistake: close that end with terrain nobody gets over. Onto the nisse, or onto other props, it reports an OPEN END instead, which is fine when it's the way to something hidden there.

The bot takes the apples nearest first. When a trail is meant to be ridden in another order, give it with `--order 2,1,3` (apples left out are taken nearest first afterwards), or the bot may ride past an apple it can't come back for. A stretch the bot can't solve is reported with the apples still to take, where the greedy bot got stuck and how close the explorer got. That means the trail may be impossible there, or need a longer search (`--minutes`, default 2 per stretch). At the end it gives the bot's total time, which is not optimised: treat it as an upper bound for gold, and set gold at most about 5% above it. The official trails' silver is about 1.3× gold and bronze about 1.75×.

The run is saved in `.playtest/` (git-ignored) and tried first next time, so after an edit only the stretches it broke are searched again; `--fresh` searches from scratch. The saved file's `inputs` can be given to `scripts/record-replays.mjs` as a human run.

**Proving a skill is needed.** `--without SKILL` solves the trail with a skill taken away: `turn` (no turning around), `air-turn` (no turning in the air), `lean-back`, `lean-forward` or `brake`, or several separated by commas. If an apple meant to teach turning around is still reached `--without turn`, the trail has a way round the lesson. Searching for a route that doesn't exist uses up the whole budget, so this takes a while.

**Probing one spot.** `--probe X,Y,FACING,SPEED` places the bike at `X`, at height `Y` (`ground` to stand on the surface), facing `1` (right) or `-1` (left), already moving at `SPEED` units per second. Then either:

- `--script "..."` rides a fixed set of inputs and prints a trace (time, position, velocity, angle, whether the bike is on the ground, in a wheelie, hanging or in the air, and events such as landings, apples and crashes) every `--every` seconds (default 0.1). Each part of the script is what to hold and for how long: `gas`, `brake` or neither (`coast`), plus a lean of `fwd` or `back` (optionally `half`) relative to the way the bike faces, then the seconds. `turn` turns around. This is the way to measure a jump: how far and high a kicker throws the bike at a given speed, whether it clears a gap, how it lands. The last line gives the highest point the bike reached and its angle there, which shows how far the lip pitched it.
- `--goal apple:N`, `--goal reach:X,Y` or `--goal finish` lets the bot find its own way there, and prints the inputs it used in the script format.

Write the output to a file, or read it straight from the terminal: piped through `sed` or similar, it is held back until the command ends, and lost if the command is stopped first. Two things worth knowing when writing scripts: lean turns the bike hard, so hold it in taps of 0.1–0.2 s as the bot does (held for most of a second it flips the bike over), and gas from a standstill lifts the front, so tap `fwd` now and then to keep it down. How fast the bike gets going on flat ground, and its top speed, are in the table below.

`--json FILE` also writes the whole report as JSON.

### What the bike can do

Measured on small test pieces with the game's own simulation by `scripts/measure-limits.mjs`, so a trail can be designed near the limits from the start; then measure each jump of your own with `--probe`. The rider holds the gas and keeps the bike in line with the ground under it (level in the air), as a steady player would; a skilled one gets a little more out of it. Distances are in world units, with `y` growing downward.

<!-- limits:start (written by scripts/measure-limits.mjs) -->
**Speed on flat ground**, from a standstill with the gas held:

| Reaches 200 | Reaches 300 | Reaches 400 | After 2 s | Top speed |
|---|---|---|---|---|
| 0.8 s | 1.5 s | 2.3 s | 368 units/s, 417 units on | 778 units/s |

**Kickers:** a 40-unit kicker, its lip at the end of flat ground that carries on level beyond it. Each cell is how far past the lip the bike lands, and how high it rises above the lip, at that approach speed:

| Kicker | 200 units/s | 300 units/s | 400 units/s | 500 units/s |
|---|---|---|---|---|
| 15° | 228 on, 0 up | 263 on, 0 up | 315 on, 1 up | 399 on, 7 up |
| 25° | 196 on, 0 up | 246 on, 5 up | 334 on, 17 up | 452 on, 33 up |
| 35° | 172 on, 5 up | 220 on, 16 up | 307 on, 36 up | 424 on, 64 up |

**Climbs:** a 300-unit-tall slope is climbed up to 45° from a standstill at its foot, and up to 50° with a run-up at 400 units/s (tried in steps of 5°). Steeper, the bike flips over backwards or stalls.

**Steps:** a sheer step is ridden up to 20 units tall from a crawl, 20 units tall at 200 units/s, 20 units tall at 400 units/s, lifting the front just before it (tried in steps of 10). Taller than that, the rider's head hits the step: give it a ramp or a kicker.
<!-- limits:end -->

Over a run of jumps, height turns into speed: where each hill, valley and the next hill end up level overall, the speed only changes with the difference in hill heights, but a run that falls overall speeds up from jump to jump until the bike runs at its top speed. Keep a row of jumps roughly level, and give each landing slope the room the flight needs: with gravity at 380, a fast jump carries the bike several hundred units before it comes down. Islands too: a jump onto a flat-topped island lands as on flat ground, so give its near edge a slope that falls away.

The bike leaves a kicker pitched about as steeply as the lip's last stretch, and further where the kicker curves tightly. With the gas held and no lean, a curved 60-unit kicker 240 units long, ending at about 28°, has the bike at about −25° (nose up) at the top of the jump; one 120 units long, ending at about 53°, throws it higher but at −80° to −100°, close to standing on its tail, which few players save. To throw the bike high and keep it landable, make the kicker taller and longer rather than shorter and steeper, and check the angle with `--probe --script`.

### A ledge to hang from

Hanging is the trick the `tutorial-ledge` prop shows: the front wheel hooks over the lip of a wall too tall to ride up or jump onto, the bike hangs below it, and gas with a lean forward pulls it up and over. It only happens where nothing easier works, so build for it:

- **A wall too tall to jump onto.** Below about 120 units a kicker throws the bike straight on top, with no hang. A sheer wall over about 20 units can't be ridden up (see the table above).
- **A kicker that brings the front wheel to the lip** at the top of its arc. As measured with the bot: a 160-unit wall with a 50-unit kicker (80 units long) 160 units before it gets a hang of about 0.4 s at the lip and then over; the same wall with a 40-unit kicker 120 before it can't be reached at all, and a 120-unit wall is jumped straight onto. Shape your own with `--probe` and the bot.
- **No way round,** or the bot (and the player) takes it.

Prove it with the playtest: the stretch reports `hanging from one wheel: N s (at X,Y)` for every hang of 0.2 s or more. A hang at the lip that the stretch can't do without means the trail asks for it; `hanging from one wheel: 0.00 s` means it doesn't, whatever the brief says.

## Seeing a trail from the command line

`scripts/render-trail.mjs` (also `npm run render --`) draws a trail to PNG images with the game's own renderer, in headless Chrome, so a trail can be looked at without opening the game. An AI that can read images can use it to judge what it has built: whether the islands read as islands, the dressing fills the scene without blocking the line, the finish stands out, and no edge of the terrain shows.

```sh
node scripts/render-trail.mjs trails/custom/my-trail.json            # an overview and the sections
node scripts/render-trail.mjs trails/custom/my-trail.json --route    # the sections marked up too
node scripts/render-trail.mjs trails/custom/my-trail.json --props    # every prop labelled
node scripts/render-trail.mjs trails/custom/my-trail.json --view 1200,100,900,500
node scripts/render-trail.mjs trails/custom/my-trail.json --camera   # what the player sees, every 3 s
```

The images go to `.playtest/renders/<trail>/` (git-ignored, `--out` to change it), and the script lists each one with the area it shows and the apples, start, finish and tight spots in it, so you can open just the one you need.

- `overview.png` is the whole trail, marked up: a coordinate ruler and grid, the apples by number, the start (`S`, with its direction), the finish (`F`) and the nisse (`N`). After `scripts/playtest.mjs`, it also shows the bot's route from the last playtest, coloured from blue (slow) to red (fast) and dashed in the air, with its turns (`T`) and tight spots: `!` where jittered reruns started, with how many of them got through, and `×` with the cause where most of them failed, and the playtest's traps (`TRAP`). Whatever the game's camera never shows along the route is darker, so scenery no player will see, such as the top of a tall tower, stands out. If the trail has changed since, so that the saved run crashes, the script says so: playtest again.
- `section-NN_xLEFT-RIGHT.png` are views of about the size the game shows on a desktop screen (880 × 500 units, taller where the route climbs), following the route from left to right, or the terrain's top before there is a playtest. They are drawn clean, as the game draws them, with only a ruler around them, so you can judge the look. `--route` marks them up like the overview.
- `--props` labels every prop in the sections with its index in the trail's `props` list and its type (purple for the front layer), so a tree in a jump's path or a bush hiding an apple can be found in the file and moved.
- `--view X,Y,WIDTH,HEIGHT` draws a single view with its top left at `X,Y`, for a close look at one spot.
- `--camera` draws what the player sees instead: `camera-NN_tSECONDSs.png`, framed by the game's own camera following the last playtest's route, every 3 seconds (`--camera-every S` to change it), for a laptop-sized window of about 1000 × 620 units, with the bike where the run has it then, its lights on as in the game. The sections show everything near the route; the game keeps the rider about two thirds of the way down the screen, so it shows only about 400 units above them (a phone in landscape about 230). Look at these to check that the landmarks and set pieces are seen as you meant.

`--scale` sets the sections' sharpness in device pixels per art pixel (default 3, which makes a section about 1300 pixels wide). The bike is only in the `--camera` frames: elsewhere dark caves and night scenes look as dark as they are without its headlight, and the camera frames show what its light reaches. It needs Chrome, at `CHROME_PATH` or where macOS or Linux installs it.

## Visual editor

Open `editor.html` or choose **Trail Editor** from the game dashboard. The **Block** tool draws a new block, and the **Cut** tool carves caves, entrances, and gaps out of existing blocks. Drag a block's points and curve handles to reshape it, or drag inside its filled body to move it whole. Double-click an edge to add a point. The inspector edits a block's material, whether an edge is straight or curved, and whether a point is a corner or smooth.

The **Apple**, **Start**, and **Prop** tools place those objects at the exact clicked world position, and the **Water** tool draws a water body as a rectangle. Select an object to move it numerically or by dragging; the inspector also changes start direction and prop type/layer. Apples and props can be removed, while the required start and finish markers can only be moved.

To rotate, drag the round handle above a selection, or press `R` to turn it 15° clockwise and `Shift+R` to turn it back; hold `Shift` while dragging to snap to 15°. Blocks have no rotation field: turning one moves its points and curve handles, so it changes the trail's hash like any other reshaping. A lone prop turns about its anchor, its handle shows its angle, and the inspector has a **Rotation** field for it; for anything else the inspector has 90° buttons. In a mixed selection, blocks, points and props turn about the middle of the selection, while apples, spikes, water and the start and finish only move around it, keeping their own shape and direction. Water alone cannot be rotated. With the **Prop** tool active, `R` and the tool's **Rotation** setting choose the angle for the next prop.

## Suggested future format improvement

Blocks already have stable ids, so objects could eventually attach to a block's surface:

```js
apples: [
  { x: 1200, surface: 'ledge', offset: 60 }
]
```

That would let apples and props follow a block automatically after its shape changes. Explicit world-space placement already works, but it intentionally remains fixed when nearby terrain is edited.
