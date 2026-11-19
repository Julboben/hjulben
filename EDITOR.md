# Trail editor

Open the visual editor from **Trail Editor** on the game's dashboard, or go straight to `editor.html`. Press `?` (or **Keyboard shortcuts** in the **⋯** menu) for every shortcut. The trail file format is in [`TRAIL_FORMAT.md`](./TRAIL_FORMAT.md), and the rules the official career follows are in [`TRAILS_GUIDE.md`](./TRAILS_GUIDE.md).

## Layout

The left column has two tabs:

- **Tools**: tools grouped into Navigate, Terrain, Objects, and Course. Picking a tool shows its settings (for example block material, spike radius and spin, or prop type) before anything is placed. New objects use those settings, which are remembered between sessions. `V` or `Escape` selects, and `H` pans.
- **Trail**: trail name, finish and fall positions, and weather.

The inspector on the right edits the current selection, and is hidden until something is selected.

## Terrain

- Draw terrain blocks and cut caves, entrances, and gaps into them, freehand or, holding `Alt`, as rectangles and, holding `Cmd`/`Ctrl`, as circles; `Shift` snaps to the grid.
- Draw and cut back walls: the Block and Cut tools have a **Layer** picker (Terrain or Back wall), the inspector switches a selected block between layers, and **Fill caves with back walls** closes off the selected block's caves.
- Drag block points and curve handles, switch edges between straight and curved, and double-click an edge to insert a point. Holding `Shift` snaps a point or curve handle to 15° steps and the grid.
- Reshaping only happens on purpose: an edge can only be dragged once its block is selected (before that, a press on it takes the whole block), a point of an unselected block only from its dot, the point or edge a press would grab is highlighted under the pointer, and `Esc` mid-drag puts everything back.
- Scale selected blocks with the handles around them: corners keep the proportions, so a circle stays a circle, sides stretch one way, `Alt` scales from the centre and `Shift` snaps to the grid.
- Pick the base material and a material per block.

## Objects

- Place apples, the start (and the way it faces), props and the finish anywhere. Props can change type and move between the foreground and background layers.
- Place spinning spike hazards and set their radius and spin speed.
- Draw water with the **Water** tool (`W`) by dragging a rectangle. Drag a body by the middle of its surface, resize it with the scale handles, and set its width and depth in the inspector, which says whether it is a rideable ford or deep enough to wipe the rider out.

## Selecting and moving

- Once selected, a block drags from anywhere inside it. Holding `Shift` keeps a move straight across, up and down or at 45°.
- Snapping works as in Figma: anything dragged lines up with the edges, middles and points of other things in view, and with the grid, once it comes within a few pixels, with a guide showing what it lined up with. Hold `Cmd`/`Ctrl` mid-drag to move freely, and press `N` to turn snapping off or on.
- Box-select picks up whole blocks along with points and objects. `Shift`-click adds or removes one (for example a prop inside a selected block), `Cmd`/`Ctrl` + `A` selects everything, and `Cmd`/`Ctrl` + `D` or `Esc` selects nothing.
- Clicking again where points and objects overlap selects the next one there.
- Copy, cut and paste (`Cmd`/`Ctrl` + `C`, `X`, `V`) work for blocks, apples, props, spikes and water. The copy goes to the system clipboard, so it can be pasted into another trail or tab; it lands under the cursor, or in the middle of the view.
- Undo and redo, which restore the selection too.

## Navigating

- Trackpad: two-finger scrolling pans, and pinching zooms around the pointer.
- Mouse: the wheel pans, `Ctrl`/`Cmd` + wheel zooms, and the middle button or `Space`-drag pans.
- Zoom runs from 10% up to 600%, with a finer snap grid when zoomed in.

## Time of day and weather

Set the time of day by the hour, with Morning, Noon, Evening and Night help points, and pick the backdrop. Sun, cloud, fog, rain, snow, lightning, and wind strength and direction can come from a weather preset or be set one by one, with a windsock showing the wind.

## Testing

Play test in place with `Cmd`/`Ctrl` + `Enter`; add `Shift` to start the bike where the mouse is, without moving the trail's start. The trail is validated as you edit: the **⋯** menu lists what it finds and shows a badge when there are errors or warnings.

## Drafts and autosave

- **Save draft** (`Cmd`/`Ctrl` + `S`) keeps up to 12 timestamped drafts per trail in the browser. The editor opens the newest draft unless the trail was saved after it.
- The label next to the trail picker shows which version is open (original, published, or a draft) and whether it has edits since. Click it to open **Versions**, where you can open any draft, delete drafts, or revert to the published trail (undoable).
- **Save draft** is greyed out until the trail changes from the open version, and **Publish** until it differs from the published trail.
- Unsaved edits are autosaved in the browser a second after each change, and when the tab is closed, hidden or switched to another trail. Reopening the trail restores them on top of the version they were made to, with one undo step back to that version. The autosave is a single slot per trail, separate from the drafts, and is cleared when you save a draft or publish.

Drafts and autosaves are kept compressed in the browser's IndexedDB, so even very large trails fit. They never overwrite trail files.

## Publishing

**New** (+) and **Duplicate** sit next to the trail picker; **Publish** (`Cmd`/`Ctrl` + `Shift` + `S`) and **Delete** are in the **⋯** menu. Where **Publish** writes depends on how the editor is served:

- Under `npm run dev`, official, bonus and file-based custom trails are written directly to their JSON file, and new trails are created in `trails/custom/`. For an official or bonus trail the menu item reads **Overwrite official file…** or **Overwrite bonus file…** and asks for confirmation first.
- On any other server, official and file-based trails are read-only. **New** and **Duplicate** create custom trails stored in the browser, which then appear under **Custom Trails** in the game. Players can also add trails with **Import trail** in the game's trail menu.

Official trails live in `trails/official/`, bonus trails in `trails/bonus/`, and locally authored trails in `trails/custom/`. Whether a trail is official, bonus or custom comes from its folder, not from anything inside the file.

Best times, leaderboards and ghosts are keyed by a hash of what decides a run: terrain, start, finish, apples, spikes and water. Changing any of those starts them fresh, online and local, while renaming a trail or changing its props, weather or time of day keeps them.

## Import, export and sharing

- **Import / export** in the **⋯** menu imports JSON and exports JSON or a JavaScript module, and warns when validation errors would block an export.
- **Copy share link** in the **⋯** menu copies a link that opens the trail in the game. The whole trail is packed into the link's hash (`index.html#trail=1.<data>`: the trail JSON, deflated and base64url-encoded, see `js/trail-link.js`), so it needs no server and works on any deployment. Opening the link rides the trail straight away and saves it under **Custom Trails** (opening it again reuses that copy). Small trails make links of a few hundred characters, but bigger ones run to several thousand, and the editor warns when a link is too long for a Discord message. Because the hash never reaches the server, chat apps can't show the trail's name or a picture in their link preview.
