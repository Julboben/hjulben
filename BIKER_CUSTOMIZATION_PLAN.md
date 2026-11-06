# Hjulben – Biker Customization Plan

Players choose their rider's **skin tone, hair, helmet, outfit and bike** when they create a rider, and can change them later from the dashboard.

The data model and UI are built so that a later phase can let players **win outfits and gear**. That reward system is **out of scope** for this phase. In this phase every item is available from the start.

---

## Goals

- [x] Customize five slots: **skin**, **hair**, **helmet**, **outfit**, **bike**.
- [x] Customize while creating a rider, replacing the current Male/Female cards.
- [x] Change the look of an existing rider at any time, from the dashboard (Garage). *The Riders-row shortcut was left out; see Status.*
- [x] Use the same look everywhere: gameplay, ragdoll, the loose helmet, hair, ghosts, menu previews, the How to Play guide and leaderboards.
- [x] Existing saves, online accounts, ghosts and leaderboard rows keep working, and keep looking the same as they do now.
- [x] Cosmetics never affect how a run plays out. Replays and `tests/replays` stay byte-identical. The only exception is **no helmet**, which changes the ragdoll *after* a crash (see §2), when the run has already ended.
- [x] Items have an unlock rule, but this phase only uses `default`. A later reward system can add rules without changing the save format or the UI.

## Non-goals (this phase)

- Earning, winning, buying or trading items, and showing reward pop-ups.
- A server-side inventory of owned items. Only the hook for it is planned (see [Future: rewards](#future-rewards-out-of-scope)).
- Bikes with different handling. `bike` only changes the art.
- Free colour pickers. Items are curated pixel-art palettes.
- New ragdoll body shapes. All looks share today's skeleton and joint positions.

---

## Current state (what we build on)

| Area | Today | File(s) |
|---|---|---|
| Rider identity | `rider: 'male' \| 'female'`, set at slot creation, *"permanently tied to this savegame"* | `js/storage.js`, `index.html` (`#menu-save-view`), `js/ui/menu.js` |
| Palettes | `RIDER_PALETTES.male/female`, a single flat colour object that mixes jacket, trousers, helmet, skin and hair | `js/drawing.js` (`riderPalette`) |
| Helmet / bare head | `drawHelmetShell`, `drawBareHead(rect, colors, rider)` with a `female` branch for bangs | `js/drawing.js` |
| Riding pose | Drawn inline in `drawBike()` from `colors.*` | `js/drawing.js` ~4700 |
| Ragdoll | `drawRagdoll(ragdoll, rider)`. Head sprites are cached **by palette object identity** | `js/drawing.js` |
| Ponytail | Physics hair, only drawn when `rider === 'female'`. Colours are hard-coded in `HAIR_STRANDS` | `js/rider-hair.js`, `js/render.js` (`updateHair`) |
| Bike | `BIKE_MODELS = ['elasto', 'classic']`. `drawBike({ bike })` exists, but no caller passes it | `js/drawing.js` |
| Session | `session.rider` | `js/state.js`, `js/game.js`, `js/ui/menu.js` |
| Menu previews | Cache key includes `session.rider` | `js/ui/menu.js` (`previewKey`) |
| Server | `players.rider`, `runs.rider` are text, limited to `male`/`female`. `sanitizeSave` keeps only known fields | `netlify/lib/db.mjs`, `netlify/functions/account.mjs`, `leaderboard.mjs` |
| Leaderboard / ghost | `rider` per row and per ghost. The avatar is a male/female icon | `js/online-leaderboard.js`, `js/ui/menu.js` (`riderSymbolMarkup`) |
| Editor | Draws `rider: "male"` | `js/editor/render.js` |

---

## Design

### 1. Data model: a `look` per rider

```js
// Stored on the save, sent to the server, and attached to runs and ghosts.
look = {
  skin:   'tan',          // item id
  hair:   'short-brown',
  helmet: 'orange-stripe',
  outfit: 'white-jacket',
  bike:   'elasto'
}
```

- Each slot holds **one item id**. A missing or unknown id falls back to that slot's default, so old clients, old saves and future removed items never break rendering.
- `rider: 'male' | 'female'` is kept **read-only for migration**, and is still written for older servers and clients in the transition period (see §6). New code reads `look`.
- Migration from `rider`:

  | Legacy | skin | hair | helmet | outfit | bike |
  |---|---|---|---|---|---|
  | `male` | `tan` | `short-brown` | `orange-stripe` | `white-jacket` | `elasto` |
  | `female` | `tan` | `ponytail-auburn` | `teal-stripe` | `pink-jacket` | `elasto` |

  These items reproduce today's two palettes pixel-for-pixel. That keeps old ghosts and screenshots looking the same.

### 2. Cosmetics catalog: `js/cosmetics.js` (new, DOM-free)

One shared module, like `js/rider-name.js`. It is imported by the game, the editor and the Netlify functions (`netlify/lib/` already imports `../../js/rider-name.js`).

```js
export const SLOTS = ['skin', 'hair', 'helmet', 'outfit', 'bike'];

export const ITEMS = {
  'tan':           { slot: 'skin',   name: 'Tan',     unlock: { type: 'default' }, colors: { skin, skinLight, skinShade } },
  'ponytail-auburn': { slot: 'hair', name: 'Auburn ponytail', unlock: { type: 'default' },
                       style: { cap: 'long', bangs: true, ponytail: true, brow: false },
                       colors: { hair, hairLight, hairShade, strands: [...] } },
  'orange-stripe': { slot: 'helmet', ..., colors: { helmet, helmetLight, helmetShade, stripe, visor, visorLight } },
  'white-jacket':  { slot: 'outfit', ..., colors: { jacket*, panel, trousers*, gloves, boots, sole } },
  'elasto':        { slot: 'bike',   ..., model: 'elasto' },
  // ...
};

export const DEFAULT_LOOK = { ... };
export function lookFromLegacyRider(rider) { ... }
export function normalizeLook(raw, owns = isDefaultItem) { ... } // per-slot fallback
export function lookKey(look) { ... }       // stable string for caches
export function isDefaultItem(id) { ... }
export function itemsForSlot(slot) { ... }  // catalog order = UI order
```

- **Item ids are permanent.** Saves, runs and future inventories refer to them, so they are never renamed or reused. Retired items stay in the catalog with `hidden: true`.
- **`unlock` is data, not code.** This phase only uses `{ type: 'default' }`. The reward phase adds types such as `{ type: 'medal', trail, medal: 'gold' }` or `{ type: 'event', id }` without changing the shape of `look`.
- **`owns` is injected into `normalizeLook`.** For now it is `isDefaultItem`. Later it becomes "default, or in the player's inventory". That one seam is all the reward phase needs from the rendering and save code.
- Each slot owns **only its own palette keys**. Slots never set the same key, so palettes compose without conflicts.

#### Starter content (all `default`)

| Slot | Items (initial set; final art is a design task) |
|---|---|
| Skin | 4–6 tones, from light to deep, each a `skin/skinLight/skinShade` triple tuned to the pixel palette |
| Hair | Short (brown, black, blonde, red, grey), Ponytail (auburn, black, blonde), Shaved, Long loose |
| Helmet | **None**, Orange stripe, Teal stripe, plus 3–4 more shell/stripe/visor combos |
| Outfit | White jacket, Pink jacket, plus 3–4 more jacket/trousers/gloves/boots sets |
| Bike | Elasto (default), Pocket Classic. Both are already drawn |

Hair colour is part of the hair item, not a separate slot, so the five slots in the brief stay as they are. A separate colour slot can be added later if needed.

#### No helmet (`helmet: 'none'`)

The helmet slot has a **None** item (`{ slot: 'helmet', bare: true }`). The rider then rides bare-headed:

- **Riding pose**: draw the bare head (`drawBareHead`) where the helmet shell normally goes. A ponytail shows and swings as it does after a knock-off. Every hair style must look right while riding, not only after a crash.
- **Crash detection is unchanged.** The rider's head probe in `js/ride.js` (`RIDER_PROBES`) keeps the helmet's size, so riding without a helmet gives no gameplay advantage and verified runs are unaffected.
- **Ragdoll**: `createRide(trail, { helmet: false })` passes the flag on to `createRagdoll`. The thrown rider starts with the bare head radius, and there is no helmet to knock off (`helmetStrap = Infinity`). It still calls `random()` the same number of times so the ride's random sequence stays in step. As a result there's no `helmet` event: no knock sound, burst or "The helmet came off" announcement.
- Ghosts use their own look's helmet flag, not the player's.
- Crash text: *"Your helmet hit the ground"* becomes *"You hit your head"* when the rider has no helmet.

### 3. Rendering

**Composed, memoised palettes**

- Add `lookPalette(look)` in `js/drawing.js`. It merges the skin, hair, helmet and outfit colours with the fixed keys (`eye`, `mouth`, outline) into one flat object with the same keys `RIDER_PALETTES` has now. The riding, ragdoll and head code then needs no changes beyond its inputs.
- Memoise by `lookKey(look)`. This matters: `ragdollHeadSprite` caches sprites by **palette object identity**, so a new object every frame would leak canvases. Cap the memo, for example with an LRU of 32 entries, because ghosts and leaderboard rows bring in other riders' looks.
- Keep `riderPalette(rider)` as a thin wrapper, `lookPalette(lookFromLegacyRider(rider))`, until every caller has moved over, then delete `RIDER_PALETTES`.

**Hair**

- `drawBareHead(rect, colors, rider)` becomes `drawBareHead(rect, colors, hairStyle)`. The `female` checks become style flags: `bangs`, a `long` cap, `brow`, and the nape pixel. A shaved style draws the cap in a skin shade.
- `js/rider-hair.js`: `HAIR_STRANDS` colours come from the hair item (`createRiderHair(root, rest, strands)`) instead of constants. The physics constants stay the same.
- `js/render.js` `updateHair`: replace `rider !== "female"` with `!hairStyle(look).ponytail`. Rebuild the simulation when the hair item changes, which can happen while the menu preview is open.
- Under the helmet, only ponytail styles show hair. Other styles are hidden by the shell, as they are today.

**Helmet and outfit**: these only change colours in this phase. `drawHelmetShell` and the riding pose already read `colors.*`. A future item that needs a different *shape* (for example an open-face helmet or a cap) gets an optional `shape` field in its catalog entry, which `drawHelmetShell` switches on. Plan for the field now, but ship only the current shape.

**Bike**: pass `bike: ITEMS[look.bike].model` into every `drawBike` call (`js/render.js` for the player, ghost and x-ray, `js/scene-preview.js`, `js/editor/render.js`). The comment in `drawing.js` already guarantees that every model shares the seat, peg and handlebar positions.

**API change**: everywhere that takes `rider: string` (`drawBike`, `drawRagdoll`, `renderer.render`, `settleHair`, `drawScene`) takes `look` instead. The x-ray, ghost and preview paths all go through the same functions, so this is a mechanical rename. Update the JSDoc in `js/types.js` and the `render.js` param docs.

**Effects**: in `js/game.js`, the helmet-knock burst colour becomes `lookPalette(session.look).helmet`.

### 4. State and storage

- `js/state.js`: replace `session.rider` with `session.look`, defaulting to `DEFAULT_LOOK`.
- `js/storage.js`:
  - `normalizeSave`: stop rejecting saves without `rider`. Build `look` from `save.look`, falling back to `lookFromLegacyRider(save.rider)`, then `normalizeLook`. Keep writing `rider` (derived from `hair.ponytail`) for one release, so a rolled-back client still loads the save.
  - `createSave(slot, look, …)` replaces the `rider` argument.
  - New `saveLook(slotIndex, trailCount, look)` that uses `updateSave`.
  - `normalizeRun` / local leaderboard: store `look` with `rider` as a fallback.
- Ghosts (`saveGhost` / `readGhost`): add an optional `look` so a local ghost shows the look that rider had when they set the time. Old ghosts fall back to the current save's look.
- `menu.js` `previewKey`: use `lookKey(session.look)` instead of `session.rider`.

### 5. UI

**Shared component `js/ui/customizer.js` (new)**

- A **live preview canvas** that uses the game renderer (`scene-preview.js` `parkedRide` plus `settleHair`) on a small neutral ground strip. It redraws when anything changes, and a toggle shows the bare head and helmet side by side.
- **Slot tabs**: Skin · Hair · Helmet · Outfit · Bike. Each tab is a grid of swatch buttons (`aria-pressed`, 44 px touch targets), drawn with the same palette art: a skin chip, hair head sprite, helmet sprite, outfit torso chip, bike thumbnail.
- **Randomize** and **Reset to default** buttons.
- Keyboard, touch and **gamepad** support, using the menu's existing `handlePad` focus model.
- Each swatch can show a **locked** state (padlock, plus a "How to unlock" hint from the item's `unlock`). This phase never uses it because every item is `default`, but the CSS and markup hooks exist so the reward phase doesn't need a UI redesign.
- Returns `{ mount(container, look, onChange), getLook() }`, so both entry points use the same component.

**Entry point A: rider creation** (`#menu-save-view`)

- Replace the Male/Female `rider-grid` with the customizer, above the name field. Default selection: `DEFAULT_LOOK`, or a random look.
- Change the warning *"Your rider is permanently tied to this savegame"* to explain that the look can be changed later. The **name** is still fixed.
- `create-save` and `createOnlineSave` pass `look`.

**Entry point B: change later** (new `#menu-look-view`, "Garage")

- Opened from a **Customize** button on the dashboard next to Continue, and a **Customize** action on each rider card in the Riders view.
- Has **Save** and **Cancel** buttons. Unsaved changes are discarded by Back or Cancel.
- Saving calls `saveLook`, updates `session.look`, clears the preview cache entries for the old look, and pushes to the cloud for online riders (see §6).
- Can't be opened during a paused ride, only from the dashboard. Changing the bike or hair halfway through a ride would reset the hair simulation and confuse ghost and split comparisons. The look is read when a trail starts.

**Avatars**: `riderSymbolMarkup` (save cards, leaderboard rows) changes from a male/female icon to a small **head sprite**: the helmet in the rider's colours, drawn to a cached `<canvas>`/data URL per `lookKey`. Rows without a `look` fall back to the legacy look.

**Copy**: update the README feature list ("Two rider styles…" → "Customizable rider: skin, hair, helmet, outfit and bike"), the Savegames paragraph (§145, "permanently tied"), the rendering section (BIKE_MODELS, now chosen through the look), and the How to Play text if it mentions rider styles.

### 6. Online / server

- `netlify/lib/db.mjs` (an idempotent migration in the existing `do $$` block):
  ```sql
  alter table players add column if not exists look jsonb;
  alter table runs    add column if not exists look jsonb;
  ```
  Keep `rider` columns, written from the look, so older clients and rows keep working.
- New `netlify/lib/looks.mjs`: wraps `normalizeLook` from `../../js/cosmetics.js`, with `owns = isDefaultItem` for now.
- `account.mjs`:
  - `register` accepts `look` and stores both columns.
  - `login` returns `player.look`, or the legacy look when it is null.
  - `sanitizeSave` keeps `look`. `putSave` writes `players.look`.
- `leaderboard.mjs` `submit`: store `look` with the run, using the same "only when faster" `case` as `rider`. `top`/ghost responses include `look`.
- Client `js/account.js`: send `look` when registering. Push the save after a look change through the existing `PUT /api/account/save`. `restoreOnlineSave` uses `player.look`.
- `js/online-leaderboard.js`: read `look` from rows and ghosts, with `rider` as the fallback.
- The server only accepts known item ids that the player owns. In this phase "owns" means `default`. Unknown ids fall back to that slot's default instead of failing the request.

### 7. Service worker, tooling and tests

- Add `js/cosmetics.js`, `js/ui/customizer.js` (and any new icon) to the core list: run `npm run sw`, and `npm run sw:check` must pass.
- Add `scripts/test-cosmetics.mjs` to `npm test`. It checks that:
  - Every item has a valid slot, a unique id, an `unlock` and all colour keys for its slot. Every slot has a default.
  - No two slots set the same palette key.
  - `lookFromLegacyRider('male' | 'female')` + `lookPalette` deep-equal the current `RIDER_PALETTES` (proves visual backward compatibility).
  - `normalizeLook` falls back per slot for missing, unknown and not-owned ids, and ignores extra keys.
  - `lookKey` is stable and order-independent.
- Extend `scripts/test-online.mjs`: register with a look, log in and get it back, a save PUT round-trips it, a run stores it, a bad id is replaced by the default, and legacy rows without a look still work.
- Storage tests (in the new test file or a small `test-storage.mjs`): old `rider`-only saves migrate, and new saves keep their look.
- `scripts/test-replays.mjs` (part of `npm test`) must pass without re-recording `tests/replays`. This is the guard that cosmetics never touch physics.
- `npm run typecheck`, `npm run check`.
- Manual QA: every slot at mobile and desktop sizes, gamepad navigation, night lighting (skin and outfit should stay readable in the dark), ghost with a different look than the player, helmet knock-off with each hair style, ragdoll in water, the classic bike in flips and loops, and the editor playtest.

---

## Implementation phases

1. **Catalog and palette composition**: add `js/cosmetics.js`, `lookPalette`, and the legacy mapping, with tests proving pixel parity. No visible change yet.
2. **Rendering through `look`**: move `drawBike`, `drawRagdoll`, the head sprites, hair and bike model selection over to `look`. Nothing changes visually for existing riders.
3. **Save and session**: `session.look`, the storage migration, `saveLook`, preview cache keys, and ghosts that carry their look.
4. **Customizer component + creation flow**: replace the Male/Female cards.
5. **Garage view**: change the look later from the dashboard and the Riders view.
6. **Server**: the `look` columns, register/login/save/run handling, and leaderboard and ghost looks. Clients that don't send a look keep working.
7. **Content and polish**: the full starter set of items, head-sprite avatars, README and copy updates, and the QA pass.

Phases 1–3 can ship on their own as a refactor. Phase 6 can be deployed before phase 4 is released.

---

## Status (phase 1–7 implemented)

All phases have landed. `npm test` (now including `scripts/test-cosmetics.mjs`) and `npm run test:online` pass; replays are unchanged. Where the build differs from the plan above:

- **Garage entry point:** a **GARAGE** button on the dashboard edits the active rider. There is no extra action on Riders rows, since those already carry Go Online / Log In and delete.
- **New riders start on the default look.** The customizer has **Random** and **Reset** buttons.
- **Swatches and avatars** are crops drawn by the game's own renderer (`drawLook` in `js/ui/customizer.js`, through the menu's preview cache), not separate head sprites, so the ponytail and lighting match the ride. Skin and hair swatches show the head without a helmet.
- **Legacy female mouth:** the mouth colour now comes from the skin item, so the old female rider's mouth changes from `#b0505e` to the tan skin's `#87483a`. Every other palette key is pinned by the parity test.
- **No-helmet crash copy:** the "Your helmet hit the ground" text in `index.html` is a static default that is never shown, so it needed no change. The "The helmet came off." announcement can't fire without a helmet (`helmetStrap = Infinity`).
- **Ghosts** keep the look they were ridden in. Ghosts saved before looks existed (and play-test ghosts) are drawn as the current rider, as before.
- **Server:** `netlify/lib/looks.mjs` reuses the client catalog, the same way `names.mjs` reuses `rider-name.js`. Unknown items fall back per slot. `rider` is still written, derived from the look (ponytail → `female`), for older clients.
- **Rider name** stays fixed (open question 2).

---

## Revision 2: customizer redesign (implemented)

Feedback after phase 7: give colour its own panel, add icons, take layout cues from the Garage mockup, and treat gender and skin as identity that is chosen once.

### Decisions

1. **Identity is chosen once.** `gender` (`female` | `male`) and `skin` are chosen only when a rider is created, next to the name. The Garage shows them in the summary, read-only. New riders default to **Light** skin.
2. **Gender has visible effects, with no restrictions.** It sets:
   - **Face details:** female riders get a lash pixel and a rosier mouth tint; male riders get the brow.
   - **The suggested starting look.** Female: auburn ponytail, teal helmet, pink jacket. Male: short brown hair, orange helmet, white jacket.
   - **Random Rider weighting.** For female riders, longer cuts and warmer or pastel colours come up more often.
   
   Every style and colour can still be picked by either gender.
3. **Style and colour are separate items.** A look becomes:
   ```js
   { v: 2, gender, skin,
     hair: 'ponytail',   hairColor: 'auburn',
     helmet: 'classic',  helmetColor: 'teal',   // helmet 'none' disables helmetColor
     outfit: 'jacket',   outfitColor: 'pink',
     bike: 'elasto',     bikeColor: 'orange' }
   ```
   - Every style and colour is a catalog item with its own `unlock` rule, so rewards can grant a colour on its own.
   - Bald and No helmet keep their colour value, but the Colour panel is disabled for them.
4. **Bike colours are in this round.** The frame, tank, fenders and plate move off the shared `c.*` constants onto a bike palette taken from `bikeColor`. Wheels, chrome and black parts stay shared. The default `orange` must reproduce today's bikes pixel for pixel.

### Migration (look v1 → v2)

- `normalizeLook` accepts v1 looks and turns them into v2:
  - Hair is split, so `ponytail-auburn` becomes `ponytail` + `auburn`.
  - The helmet colour id becomes `classic` + that colour.
  - Outfit ids map to a style plus a colour (`pink-jacket` → `jacket` + `pink`, `green-motocross` → `motocross` + `green`, and so on).
  - The bike colour becomes `orange`.
- `gender` comes from `rider` if it is set. Otherwise a ponytail means female, and anything else means male.
- Existing riders keep `tan` skin. **Light** is only the default for new riders.
- `rider` (the legacy field) is now derived from `gender` instead of the hair.
- The server's `sanitizeSave` and `leaderboard.submit` also accept v1 looks. A Garage save can never change `gender` or `skin`: the server keeps the stored values.
- The parity tests are extended so that every v1 look renders exactly as it did in phase 7.

### Prepare for a new rider and bike art style

The mockup has a chunkier rider, a motocross bike with a number plate, and jersey details. The art itself is not part of this round. This round adds the seams it would plug into:

- **Art registry.** Rider and bike drawing go through `RIDER_ART[artId]` and `BIKE_ART[artId]`, each a `{ head, body, limbs, ragdollSprites }` / `{ frame, wheel, palette }` set. `lookParts()` returns *semantic* colour roles instead of today's exact pixel keys:
  - skin: base, light, shade
  - hair
  - helmet: shell, stripe, visor
  - outfit: jersey, sleeve, panel, pants, gloves, boots
  - bike: frame, plastics, seat, plate, plateText
  
  The current art maps those roles to its own pixels, and a new art set can map them differently without touching the catalog or saves.
- **Shapes are descriptors.** Styles carry a `shape` key (helmet `classic` / `moto`, outfit `jacket` / `jersey` / `suit`, bike `elasto` / `classic` / `mx`). An art set that lacks a shape falls back to its closest one, so the catalog can get ahead of the art.
- **Room for later slots.** `LOOK_SLOTS` is the single source of truth for tabs, the summary and validation. A future `extras` (goggles, sunglasses) or `plate` (number or letter) slot only needs catalog entries and art.
- **Fixed rendering geometry.** The ragdoll skeleton, hair roots and `SWATCH_VIEWS` framing get one constant per art set. A bigger rider then only means retuning those numbers.

### Customizer layout (Garage and creator)

- **Header:** GARAGE, the rider name and Back.
- **Left: a column of category tabs, each with a pixel icon.**
  - Hair, Helmet, Outfit and Bike.
  - The selected tab is orange and shows the item name as a subtitle.
  - On mobile it becomes a horizontal tab strip.
- **Centre: a large live preview** (the posed ride), with ◀ ▶ buttons that step through styles in the active tab.
- **Right: a "Current look" card.**
  - A head portrait plus a list: gender, skin, hair, helmet, outfit and bike, each with its colour.
  - Gender and skin show a small lock icon in the Garage.
- **Bottom panel:**
  - **Style:** a grid of rendered crops with a check badge on the chosen one and a `n / total` count. A detail card shows the selected item's name and a one-line description.
  - **Colour, its own container:** two-tone chips (base plus shade) with a check badge, labelled "Hair colour", "Helmet colour" and so on. It is disabled when the style has no colour.
  - **Actions:** **RANDOM RIDER** (dice icon) on the left and the primary **SAVE LOOK** on the right, disabled when nothing changed. Random never changes gender or skin.
- **Creator:** the first step is **"Who are you?"**: name, Online/Offline, two gender cards using the existing `male` and `female` icons, and skin chips (Light preselected). The second step is the same customizer, prefilled with that gender's starting look.
  - Changing gender in step 1 resets step 2 to that gender's starting look, but only while step 2 hasn't been touched.
- **Not adopted from the mockup:** rotate/zoom, view angles, the animation picker and Extras. Extras is a candidate for the reward phase.

### Icons

These are added to `icons/pixel-icons.mjs` and regenerated with `npm run icons`:
- `helmet`, `hair`, `jacket`, `bike`
- `palette` for the Colour heading
- `dice` for Random
- `check` for the selected badge
- `lock` for identity, and for locked rewards later
- `garage` for the dashboard button

### Work order

1. **Catalog v2 and migration.** Split styles and colours, add gender and the semantic roles. Parity tests cover v1 → v2, and replays stay unchanged.
2. **Art registry refactor.** Current art only, with no visual change. Add the bike palette and bike colours, then face details per gender.
3. **Icons.**
4. **Customizer v2 component.** Tabs, preview, style grid, Colour panel, summary card, and Random/Save.
5. **Creator step 1 (identity), and the read-only identity in the Garage.**
6. **Server:** accept v2 looks, accept v1 looks, and lock gender and skin on save. `test-online` gets matching assertions.
7. **Docs, `npm run sw`, then a QA pass** at mobile and desktop sizes.

### As built (deviations from the plan above)

- **No v1 → v2 migration.** The v1 look ids (such as `ponytail-auburn`) were never released, so there is no v1 data to convert. Only the released `rider: 'male' | 'female'` field is migrated, through `legacyLook`. A stray local v1 look falls back slot by slot. Looks carry no `v` field.
- **Bike colours.** `bikeColor` ships with `green` (Elasto stock) and `orange` (Classic stock), plus seven more. Elasto in green is exact. Classic in orange is exact except the crank, which moves one shade (`#ed7842` → `#ee6f3f`).
- **Helmet styles.** `classic` ("Full face"), `mx` ("Motocross": long peak, goggles and a jutting chin bar, drawn by `drawMxHelmet` from pixel rows via `drawPixelRows`, on the same centre as the full face) and `none`. `parts.shapes.helmet` picks the shell both while riding and in the ragdoll head sprite, which is 24×20 units so the chin bar fits. There is one outfit for now, `street` ("Street jacket"), which every rider wears; only its colour changes. The Outfit tab still shows its style panel with that one item. The colour panel has no icon.
- **Art seams.** `lookParts()` returns `art` (`LOOK_ART = 'pocket'`), semantic `roles`, `shapes`, `face` and `bikeColors`, next to the current pixel `palette`. A full `RIDER_ART`/`BIKE_ART` registry is left for when a second art set exists.
- **Layout.** The tabs (with the item name as a subtitle) sit beside the preview. Below them come the style grid, the Colour panel and the actions, each on its own dark panel. The Current look summary was dropped, since the preview already shows the look. Random Rider was replaced by **Revert** (undo icon), which goes back to the look the screen opened with; the `dice` icon was removed, though `randomLook()` stays in the catalog.
- **Garage scene.** Previews and swatches draw only the bike and rider (`renderer.drawFigure`, `drawFigure` in `js/scene-preview.js`) over a simple pixel garage (`js/garage-backdrop.js`: roller door, pegboard, tyres, concrete floor), instead of the first trail. The big preview frames 176×88 world units, so the wheels and floor are always visible. On narrow screens, the tabs become a four-column strip without subtitles.
- **Creator.** The creator has two steps: *Who are you?* (name, gender, skin, online/offline) and *Pick your style*. Back on step 2 returns to step 1.
- **Server.** `playerLook()` in `netlify/lib/looks.mjs` keeps the stored gender and skin on every cloud save and leaderboard run.

---

## Future: rewards (out of scope)

The current phase leaves these extension points:

| Hook | Now | Reward phase |
|---|---|---|
| `item.unlock` | always `{ type: 'default' }` | `medal`, `trail-complete`, `all-apples`, `event`, `bonus-trail`… |
| `normalizeLook(look, owns)` | `owns = isDefaultItem` | `owns = id => isDefaultItem(id) \|\| inventory.has(id)` |
| Save shape | `look` only | adds `inventory: string[]` (client cache) |
| Server | validates against defaults | `players.inventory` (authoritative). Rewards are granted **server-side** when `leaderboard.submit` verifies a run that meets an unlock rule, so offline clients can't forge them |
| Customizer | no locked items | shows the padlock state that already exists, with the unlock hint from `item.unlock` |
| Item shapes | colours only (+ optional `shape` field) | new helmet and outfit silhouettes, bike colourways, decals |

Questions to settle at the start of the reward phase:

- Do offline riders earn items locally, and are those items trusted when the rider goes online?
- Should a run's ghost show items the viewer doesn't own? (Recommended: yes, since items are cosmetic.)
- Are rewards per rider (save) or per account?

---

## Future: Garage ideas (not planned yet)

Ideas to make the Garage room feel more lived-in, in `js/garage-backdrop.js`:

- **Oil stain** on the floor near the bike: one dark patch.
- **Helmet hook** by the door, showing the rider's helmet when they ride without one, so the room reacts to the look.
- **Hanging work lamp** in a top corner: a cable and a shade with a soft cone of light, which could stay faintly lit as a night light when the switch is off.
- **Small workbench** under the pegboard, with a vice and an oil can. Keep it low, so it doesn't crowd Coda's corner.
- **A second quiet animation** next to the dust, such as a dripping tap. Only if it stays subtle: a wall clock was tried and didn't fit.
- **Rolling door:** turning the lights off rolls the door down over a few frames before the room goes dark, and back up when they come on.
- **More wall rewards:** the left wall has room for another career reward, such as a poster or a framed photo.

---

## Open questions for this phase

1. Exact starter item list and pixel palettes. This needs a design pass; the tables above are placeholders apart from the two legacy looks.
2. Should the rider name also become editable in the Garage? It is currently fixed and unique online. Proposed answer: no, keep it out of scope.
3. Should a new rider start with a random look or the default? Proposed answer: random, with a Reset button.
4. Should leaderboard avatars be drawn as head sprites (proposed), or keep the two icons, tinted by helmet colour, as a cheaper option?
