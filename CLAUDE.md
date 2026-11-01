# Hjulben

A 2D motorcycle trials game in the browser, inspired by Elasto Mania: plain JavaScript modules and Canvas, no build step and no runtime dependencies. `README.md` describes the game, `CONTRIBUTING.md` the code.

## Commands

- `npm run dev`: dev server; it also watches `trails/` and rebuilds the trail catalogs.
- `npm test`: every check. It fails while a generated file is stale: run `npm run sw` after changing files the game loads, `npm run limits` after changing the physics, `npm run trails` after changing a trail's notes or `trails/worlds.json` (it writes `TRAILS.md`), and `npm run context` after changing `TRAIL_FORMAT.md`, `js/trail-schema.js`, `js/materials.js` or the example trails.
- `npm run check` (syntax) and `npm run typecheck` for a quick check.

## Making trails

Read `TRAIL_AUTHORING_CONTEXT.md` first: the format, the validation rules, the materials and example trails in one file. `TRAILS_GUIDE.md` has the design rules the official career follows, and `PROPS_GUIDE.md` and the prop modules in `js/*-props.js` show what can dress a trail.

- **New trails go in `trails/custom/`** (git-ignored), so the user can ride them first. Never add or change files in `trails/official/` or `trails/bonus/` unless asked.
- **Playtest while you build.** `node scripts/playtest.mjs <trail file>` solves the trail with the replay bot and reports each stretch: jumps, turns, hangs, crashes, the tight spots and the bot's time. `--probe` measures one jump or section, and `--without` proves an apple needs the skill it is meant to test. See "Playtesting from the command line" in `TRAIL_FORMAT.md`. Design near what the bike can do, measured, rather than conservatively by guesswork (start from the table in "What the bike can do" in `TRAIL_FORMAT.md`, then measure your own jumps), and don't hand over a trail the bot can't finish without saying so and where it fails. Fix every TRAP it reports (a place where a miss leaves the rider with no way back and no crash) and every ESCAPE (an end the rider can ride out of onto plain ground). An OPEN END, one that leads to the nisse or other things placed out there, is fine when it's meant.
- **Fix what validation reports, but check it first.** Every playtest starts with the errors and warnings from `validateTrail` in `js/trail-schema.js` (`--check` shows only those). Fix each one. Validation can be wrong, though: when a message doesn't match what you see in a render or a probe, check the code behind it rather than bending the trail to silence it, keep what is right, and name the suspected false alarm, with your evidence, in your handover so the check can be fixed.
- **Look at it.** `node scripts/render-trail.mjs <trail file>` draws the trail with the game's renderer to PNGs in `.playtest/renders/`: an overview marked up with the apples and the last playtest's route and tight spots, and clean sections as the game shows them. Read the images and fix what looks wrong or bare; `--props` labels every prop with its index in the file. The sections show more than a player ever sees: `--camera` renders what the game's camera shows along the route, and the overview darkens what it never shows, so check there that landmarks and set pieces are seen. See "Seeing a trail from the command line" in `TRAIL_FORMAT.md`.
- **Build scenery from terrain, too.** Buildings and other structures the rider passes in front of can be back-wall blocks, with windows cut out and filled with glass, and details built from small blocks; see "Building scenery from terrain" in `TRAIL_FORMAT.md`. Don't add new props for a trail unless asked.
- **Make it its own trail, and finish it.** Follow rules 4 and 7–14 in `TRAILS_GUIDE.md`: plenty of natural dressing but only a few distinctive set pieces (no landmark or easter egg on every trail), signs only if really needed, no nisse unless the trail has a hiding place worth the detour, a finish that takes some effort with the flower floating clear of the ground, no visible terrain edges at either end, every miss ending in a way back or a crash, landmarks where the camera can see them, and detail where the camera is.
- `TRAILS_GUIDE.md` ends with the prompts the user gives an AI to build a trail and to improve one; when a trail teaches something new about building them, suggest adding it there or to the guide's rules. Mention a gap in the tools only if it cost real time (measuring the same thing by hand over and over) or left something you couldn't check; don't go looking for one.
- Run `npm run trails` (or keep `npm run dev` running) so a new file shows up under **CUSTOM TRAILS** in the game.
- Coordinates are Canvas ones: `y` grows downward, so higher terrain has a smaller `y`.

## Conventions

- The simulation must stay deterministic: use `js/det-math.js`, never `Math.sin`, `Math.atan2`, `Math.exp` and the like, in simulation code. Replays depend on it.
- Support current browsers only; no fallbacks for old ones.
- Ask before changing the size of touch targets or the visual design.
- Don't write counts that change (the number of trails, props and so on) into the README or other docs.
- Comments explain why, in full sentences, and match the density of the code around them.
