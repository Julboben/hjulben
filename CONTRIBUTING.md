# Contributing to Hjulben

Notes for working on the game: setting up, testing, the code layout, conventions, the online backend and releasing. What the game is and how to play it are in the [README](README.md).

## Setup

Development needs Node.js 24 (the version CI uses) and npm. The game itself has no build step; npm packages are only used by the scripts and the Netlify functions. Run `npm ci`, then `npm run dev` to play and edit trails locally (see [Play](README.md#play)).

## Project structure

```text
.
├── index.html          # Game markup and module entry point
├── css/
│   ├── tokens.css      # Shared design tokens and the pixel font
│   ├── game.css        # Game and dashboard presentation
│   ├── editor.css      # Visual trail editor presentation
│   └── icons.css       # Generated pixel icons (from icons/pixel-icons.mjs)
├── icons/
│   └── pixel-icons.mjs # Every UI icon and the logo, drawn as ASCII pixel art
├── design/             # Design drafts and the README screenshot (not cached by the game)
├── trails/
│   ├── official/       # Shipped career trails
│   ├── bonus/          # Shipped extra trails outside the career, unlocked by progress
│   ├── custom/         # Locally authored standalone trails (git-ignored)
│   ├── catalog.json    # Generated index of official and bonus trails
│   └── custom-catalog.json # Generated local index of custom trails (git-ignored)
├── netlify/            # Serverless API: passkey accounts, cloud saves, verified leaderboard
├── scripts/            # Catalog generator, dev server, tests, and replay recorder
├── tests/replays/      # One recorded replay per official trail, named by its id (regression fixtures)
│   └── human/          # Human runs for trails the bot can't finish by itself
├── js/
│   ├── main.js         # Entry point and service worker registration
│   ├── game.js         # State machine, fixed-step loop, and event handling
│   ├── ride.js         # DOM-free ride simulation: rider probes, spikes, apples, goal, crash
│   ├── ragdoll.js      # Jointed post-crash rider ragdoll
│   ├── det-math.js     # Deterministic sin/cos/atan2/exp/log, identical in every JS engine
│   ├── render.js       # Canvas rendering of the world, bike, ghost, and effects
│   ├── lighting.js     # Light map: baked ambient light plus moving lights, multiplied over the scene
│   ├── light-field.js  # DOM-free ambient light bake from the terrain
│   ├── camera.js       # Camera follow and screen shake
│   ├── effects.js      # Particles, skid marks, and weather
│   ├── fps-meter.js    # Frame-rate readout for ?debug=1
│   ├── debug-hud.js    # On-screen ride readout for ?debug=1
│   ├── input.js        # Keyboard, touch, and gamepad input with remapping
│   ├── state.js        # Shared session state and preferences
│   ├── unlocks.js      # Every unlock rule for bonus trails and rider items (a rule can ask for an achievement)
│   ├── easter-eggs.js  # Easter eggs for riders who open their dev tools (spoilers)
│   ├── ui/             # Dashboard menu and in-game overlay/results
│   ├── vehicle-physics.js # Wheel, suspension, and chassis simulation
│   ├── physics.js      # Reusable bike-constraint physics helpers
│   ├── physics-debug.js # Opt-in physics tracing and console export
│   ├── editor/         # Trail editor modules (main.js is the entry, state.js the shared state)
│   ├── trail-schema.js # Trail defaults, normalization, and validation
│   ├── audio.js        # Procedural Web Audio effects
│   ├── config.js       # Shared constants and math helpers
│   ├── drawing.js      # Shared canvas primitives and reusable game-art renderers
│   ├── trails.js       # Terrain materials and generated-catalog loader
│   ├── storage.js      # Preferences, progression, and best times
│   ├── cosmetics.js    # DOM-free catalog of rider looks (gender, skin, hair, helmet, outfit, bike, and their colours)
│   ├── account.js      # Passkey sign-up/login and cloud save sync
│   ├── online-leaderboard.js # World leaderboard client
│   └── terrain.js      # Heightfield and collision sampling
├── editor.html         # Standalone visual trail editor
├── CHANGELOG.md        # Player-facing release notes (What's new screen and GitHub Releases)
├── TRAIL_FORMAT.md     # trail schema and authoring guide
├── PHYSICS.md          # Physics status, validation and profiling notes
├── CONTRIBUTING.md     # Development, conventions and releasing (this file)
└── README.md           # The game, how to play it, and the technical overview
```

The game itself intentionally has no runtime dependencies. Only the Netlify functions use npm packages.

## Development notes

The game's most important asset is its handling, tuned over many iterations: throttle response, braking, rider lean, suspension, momentum, and camera feel. Treat changes to it with care (see the checklist at the end of this section).

`sw.js`'s file list, `js/version.js`, `js/changelog.js` (from `CHANGELOG.md`), `css/icons.css`, the app icons and `TRAILS.md` (the career's overview, from the trail files and `trails/worlds.json`, written by `npm run trails` and the dev server), `TRAIL_AUTHORING_CONTEXT.md` (the trail spec, schema, materials and example trails bundled for trail authors) are generated: run `npm run sw`, `npm run icons` and `npm run context` after changing their sources. `npm test` fails while any of them is out of date.

To test as a brand-new player on `localhost`, open the game or editor with `?sandbox`. All data then lives in that tab's `sessionStorage`: your real saves are never read or changed, online submits are skipped, and a SANDBOX badge shows at the bottom. The sandbox survives reloads, the editor, and playtests. Use `?sandbox=reset` to start fresh again and `?sandbox=off` to go back to your real data.

To check performance or investigate physics, open the game with `?debug=1`. It also opens every official trail, so any of them can be tried while the career is being put together; nothing counts as finished. Open the editor with it and its play test gets it too. Debug mode shows a frame-rate meter (frames per second, the average time each frame's work takes, and the slowest frame gap, refreshed twice a second) and a readout of the ride: speed, pitch, the controls and how much of the lean reaches the bike, the engine's revs and clutch, each wheel's surface, compression, load and spin, and how far the rider's head, shoulder and hip probes are from the ground. The overlay shows particles, constraints, contact normals, center of mass, and the crash probes, red when the head touches. `hjulbenGame.dumpRun()` copies the whole attempt (trail, seed and inputs) so it can be replayed outside the browser, and `hjulbenGame.celebrate()` sets off the fireworks for a new world record, which the dev server's empty board never sets off. `hjulbenPhysicsDebug.dump()` or `copy()` gives the last 120 steps in detail; the traces include wheel velocities, angular/contact state, torque components, suspension lengths, chassis area, constraints, traction, and collision responses.

`npm test` also runs the DOM-independent vehicle harness in `scripts/test-vehicle-physics.mjs`. It exercises flat acceleration, braking versus coasting, stationary wheel lift, air rotation, mirrored hills, valley settling, and one-wheel landing through the exact `js/vehicle-physics.js` code used by the game.

`scripts/test-replays.mjs` replays one recorded run per official trail through `js/ride.js` and checks that the finish time, apples, and crash outcome are unchanged, with no NaN values and no terrain tunnelling. After an intentional handling change, re-record the fixtures with `npm run replays`. It keeps every replay that still finishes and records the rest, several trails at once (`REPLAY_JOBS` sets how many, `REPLAY_MAX_MINUTES` the search time per trail, default 20). The search time is wall-clock time, so keep the machine awake while it runs (`caffeinate -i npm run replays` on macOS). The bot lives in `scripts/lib/replay-bot.mjs`:

- A greedy search drives easy trails.
- When that doesn't finish, an explorer takes over (`npm run replays -- --explore` skips straight to it). It strings together moves that human runs are made of: short held inputs, gas held for seconds while pumping the lean, coasting to a stop and turning around, and turning around in mid-air with a brake tap to flip. It favours places closest to the next apple through open space.
- A replay that used to finish but broke after a physics or trail change is repaired where it breaks rather than re-recorded from scratch. The recorder plays it until it crashes, searches a few seconds before that for a patch that takes the next apple, and carries on with the rest of the run. `--force` skips this and records from scratch.

For a trail the bot can't finish, add a human run. With the game running from `npm run dev`, finish the trail, or a play test of it in the editor, and press **Bot Reference** on the results screen. The dev server replays the run against every saved official trail and stores it as `tests/replays/human/<trail name>.json` (the trail's file name without its number, so the run stays with the trail when it moves) for the one it finishes, replacing any earlier run. A play test of unsaved edits finishes none, so save the trail first. Without the dev server, copy your ghost from the browser console (`copy(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('hjulben-ghost-v1:official:the-shaft'))))` for The Shaft) and save it there yourself. A human run that finishes becomes the replay as it is. One that stopped finishing is repaired like an old replay. To see which part of a trail the bot struggles with, `node scripts/probe-replay-bot.mjs the-shaft` plays the human run up to each apple and gives the bot a few minutes to reach the next one from there. To try a trail while building it, `node scripts/playtest.mjs <trail file>` has the bot solve it one apple at a time and reports the jumps, turns, hangs, tight spots and time of each stretch; see [Playtesting from the command line](TRAIL_FORMAT.md#playtesting-from-the-command-line). `node scripts/render-trail.mjs <trail file>` draws it to PNG images with the game's renderer in headless Chrome (see [Seeing a trail from the command line](TRAIL_FORMAT.md#seeing-a-trail-from-the-command-line)). `node scripts/measure-limits.mjs` (`npm run limits`) measures what the bike can do, how far kickers throw it, how steep it climbs and how tall a step it gets up, on small test pieces of terrain, and writes the table in "What the bike can do" in `TRAIL_FORMAT.md`; `npm test` fails while that table is out of date, so run it after changing the physics. `scripts/test-playtest.mjs` (part of `npm test`) runs both on a small inline trail, so a change that breaks them is caught; its render half needs Chrome and is skipped without it. The simulation only uses `js/det-math.js` for transcendental functions, so a replay recorded in Node plays back bit-for-bit in the browser. Don't use `Math.sin`, `Math.atan2`, `Math.exp`, and similar functions in simulation code, because their last-digit results differ between JavaScript engines.

Run `npm run check` (syntax), `npm run typecheck` (JSDoc types in `// @ts-check` files), and `npm test` before pushing. After `npm ci`, `npm run test:online` tests the online API against an in-memory Postgres (PGlite) using a software passkey. It covers sign-up, unique names, login, cloud saves, and rejection of tampered runs. CI runs all of these.

`scripts/test-console.mjs` (part of `npm test`) opens the game and the editor in headless Chrome, served like static hosting, and fails on any failed request, uncaught exception, or console warning or error from the page or its service worker: in production the console should show nothing but the easter-egg hints. The pages load from a non-local hostname, so the service worker caches as it does in production, and the test checks that a return visit is served from that cache. It needs Chrome (`CHROME_PATH` if it is somewhere unusual) and is skipped without one; CI has it. The dev server marks what it serves with the header in `js/dev-server.js`, which is how the game and the editor know they may ask for the custom trail catalog and save trail files; a request that only the dev server can answer must be behind that mark, or this test fails.

The editor's drafts and autosaves (`js/editor/draft-store.js`) and the trails saved in the browser (`js/trails.js`) are kept in IndexedDB, gzip-compressed, through `js/text-store.js`: localStorage holds only about 5 MB per site, which one large trail with a few drafts fills. They are read into memory when the page opens, so reading them stays synchronous, and written in the background. `scripts/test-editor-storage.mjs` (part of `npm test`, skipped without Chrome) checks this in headless Chrome, along with the move of older drafts and trails from localStorage and the play test, which takes its trail from the editor's window rather than from storage.

When changing physics values, validate at least these cases:

1. Starting from rest on a moderate hill
2. Building enough speed to clear a crest
3. Countering an uphill wheelie by leaning forward
4. Braking hard on flat and downhill terrain
5. Landing on one wheel and then both wheels
6. Reversing direction and riding back through a trail
7. Crossing the gap in Skybound

A change to how the bike rides needs `RIDE_VERSION` in `js/ride.js` bumped, which starts fresh leaderboards, ghosts and best times on every trail, and every replay re-recorded. So changes that need one wait here, to go in together with the next one that does:

- **A stronger mid-range.** The bike pulls like a real motocross bike for its first second and then fades early; the measurements and the plan are under "Speed and acceleration" and "Next steps" in `PHYSICS.md`. Try it on a branch of its own first.

## Stylesheets

The CSS is plain CSS served as written, with no preprocessor or build step. Each page loads three stylesheets in this order:

| Page          | Stylesheets                                           |
| ------------- | ----------------------------------------------------- |
| `index.html`  | `css/tokens.css`, `css/icons.css`, `css/game.css`     |
| `editor.html` | `css/tokens.css`, `css/icons.css`, `css/editor.css`   |

`tokens.css` holds the design tokens (see [Design tokens](#design-tokens)), `icons.css` is generated from the pixel icons, and the page stylesheet holds everything else. The service worker caches the stylesheets, so run `npm run sw` after changing one (`npm test` fails until you do).

### How `game.css` is organised

The file runs top to bottom in roughly the order the screen is built:

1. Base: box sizing, the global `[hidden]` rule, `html`/`body`, buttons, focus rings
2. Game shell: `.game` (including its loading, fullscreen and menu-open states), the viewport, HUD, scene labels, toasts
3. Dialogs and results: `.overlay`/`.menu-confirm`, pause screen, `.modal`, `.primary`/`.secondary` buttons, the results card
4. Settings controls: ranges, key bindings, setting groups and options
5. The handheld controls: `.control-area`, `.controls`, then each pad button and switch
6. Menu: screen and hero, saves and riders, menu actions, trails, leaderboard, Garage, How to Play, changelog, achievements
7. Cross-cutting rules: `.pixel-ui`, reduced motion, account login, and the dev sandbox badge

### Nesting conventions

`game.css` uses native CSS nesting, so each component keeps its states, pseudo-elements, children and responsive overrides in one block:

```css
.toast {
    opacity: 0;
    transition: opacity 0.2s;
    &.visible {
        opacity: 1;
    }
    @media (max-width: 760px) {
        overflow-wrap: anywhere;
        line-height: 1.35;
    }
}
```

Keep these rules when editing it:

- **Start every nested selector with `&`** (`& strong`, `&:hover`, `& > div`). Safari before 17.2 ignores nested selectors that start with a letter.
- **Put declarations before nested rules** in a block. Browsers released before late 2024 move declarations that follow a nested rule up above it, which changes their order.
- **Only nest selectors that extend the parent** (`.results-time strong`, `.toast.visible`). Don't nest a separate component like `.results-time` inside `.results`: that turns it into `.results .results-time` and raises its specificity.
- **Only nest under a selector list whose selectors have the same specificity**, such as `.overlay, .menu-confirm` or the pad button ids. A nested rule takes the highest specificity in its parent list.
- **Watch the order when moving a rule.** A later rule beats an earlier one of equal specificity, so a few responsive overrides stay outside their component, after the rules they must beat, with a comment saying so. Examples are the phone heights for `.menu-action` and its modifiers, and the phone grid for `.look-options`, which also has to override `.look-skins`.

Don't add `.foo[hidden] { display: none; }` rules. The global `[hidden] { display: none !important; }` near the top already hides any element with the `hidden` attribute, even when its component sets `display: flex` or `grid`.

`editor.css` is a separate, flat stylesheet and doesn't use nesting.

### Breakpoints

| Media query                                   | Used for                                                          |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `(max-width: 760px)`                          | Tablets and phones: stacked handheld controls, full-width shell   |
| `(max-width: 520px)`                          | Phones: edge-to-edge game, single-column menus, controls fill the space below the game |
| `(max-width: 370px)`                          | Narrow phones: the round pad buttons go back to the small shape   |
| `(max-width: 350px)`                          | Smallest phones: tighter modal padding and headings               |
| `(max-width: 520px) and (min-height: 600px)`  | Portrait phones: home buttons pinned to the bottom of the menu    |
| `(max-height: 500px)`                         | Short landscape phones: shorter menu rows                         |
| `(hover: none)`, `(hover: none) and (pointer: coarse)` | Touch screens: no selection ring or keyboard hints        |

### Handheld controls

The pad buttons are cut to pixel shapes with `clip-path` polygons on the 3px grid of their icons. `.controls` defines the small shapes as `--shape-round-small` and `--shape-flip-small`; its nested `@media (max-width: 760px)` swaps in the larger phone shapes, and `@media (max-width: 370px)` points back to the small ones. Each button's `::before` is its shadow and `::after` its face, both clipped to that shape.

## Design tokens

Shared interface colors, spacing, corner radii, typography, and pixel-shadow values are defined as CSS custom properties in `css/tokens.css`, shared by the game and the editor. Page stylesheets use `var()` references instead of new literals: `npm run tokens:check` (part of `npm test`) fails when a colour, font size or weight is written out although a token has that value, when a `var()` has no definition, or when a token is unused. One-off values with no token are fine; give them a token once they repeat. Trail-specific canvas colors live under `trails/official/` and `trails/custom/`, shared terrain materials and catalog loading live in `js/trails.js`, and simulation constants live in `js/config.js`.

UI icons are drawn as ASCII grids in `icons/pixel-icons.mjs` (`#` takes the text colour; other letters map to the icon's own palette). Run `npm run icons` to regenerate `css/icons.css`, then use one with `<span data-icon="clock"></span>`, or add one to a label with `data-icon-before`/`data-icon-after`. Set `--px` to scale it (keep it a whole number). The `logo` icon also generates the favicon and app icons (`icons/icon.svg`, `icons/icon-maskable.svg`, `icons/apple-touch-icon.png`).

## Online backend

How online riders and the world leaderboard work for players is in the [README](README.md#online-riders-and-the-world-leaderboard).

Server code lives in `netlify/functions/` (`account.mjs`, `leaderboard.mjs`) and `netlify/lib/`. It uses Neon Postgres and keeps no server-side sessions: logins and passkey challenges are HMAC-signed tokens. `_headers` sets the content security policy and the other security headers for every page.

Setup on Netlify:

- `DATABASE_URL`: the Neon connection string.
- `AUTH_SECRET`: a random secret of at least 32 characters, e.g. `openssl rand -base64 48`. Changing it signs everyone out, but they can log back in with their passkey.
- `RP_ID` (optional, default `julben.dk`): the domain passkeys belong to. They work on that domain and every subdomain, such as `h.julben.dk`. Changing it makes existing passkeys unusable.

Tables are created automatically on first use. A rider without a passkey (for example, one imported by hand from an older board) is unclaimed: the first person to create an online rider with that name takes it over, times included. Runs without a replay show on the board but can't be a ghost. Passkeys don't work on `*.netlify.app` deploy previews of the production domain (each preview host has its own), nor in `npm run dev`, which has no functions.

If the game outgrows the free Netlify and Neon plans, the function calls run out first: a player makes a few hundred an hour, mostly cloud saves, then board fetches and posted runs. Past the limit the game keeps working offline, and finished runs wait to be posted. Before that, cut calls per player rather than paying for more:

- Let Netlify's cache answer board fetches: every player on a trail gets the same top 10, so a `Netlify-CDN-Cache-Control` header of a few seconds on the `GET` in `leaderboard.mjs` makes the function run a few times a minute per trail, however many people ride it. Check in Netlify's docs that cached answers don't count as calls.
- Upload the save less often: after a new best or a finished trail, and when the tab is hidden, rather than shortly after every change (`SAVE_SYNC_DELAY_MS` in `js/account.js`).

The game also loads every trail file before the menu shows (`loadTrailEntries` in `js/trails.js`), because the menu needs each trail's name, medals, author, nisse and hash, and best times and the board are keyed by the hash. A trail built from thousands of blocks, like Copenhagen Rooftops, makes every player download and parse it at startup. If startup gets slow, on phones especially, let the generated catalog carry what the menu needs and fetch a trail's file only when it is ridden, edited or previewed, with the service worker fetching the rest after the menu is up so offline play keeps working. `npm test` must then check the catalog against the files: a stale hash would file times under the wrong key.

## Releasing

All work goes to `main` through pull requests. Only merging a release PR deploys: other merges to `main` don't change the version, so nothing happens. Netlify skips its own builds of `main` (see `netlify.toml`), and pull requests still get deploy previews.

1. **Actions → Prepare release → Run workflow**, choosing `patch`, `minor` or `major`. It bumps the version, writes player-facing notes for everything since the last `v*` tag into `CHANGELOG.md`, regenerates `js/version.js`, `js/changelog.js` and `sw.js`, runs every check, and opens (or updates) a **Release vX.Y.Z** pull request from `release/next`.
2. Read the notes in the PR and edit `CHANGELOG.md` on that branch if needed. If something fails, push a fix to the branch, or fix it on `main` and run Prepare release again (this rebuilds the branch from `main`).
3. Merge the PR. The **Release** workflow (`release.yml`) sees a version with no tag yet, runs the checks again, deploys that commit to Netlify (`deploy.yml`), and then publishes the GitHub Release `vX.Y.Z` (creating the tag). If the deploy fails, nothing is published: fix it and re-run the failed jobs. To redeploy or roll back, run **Actions → Deploy** with any release tag.
4. `git pull` to get the version bump locally.

The release PR is opened by GitHub Actions, so its CI run waits for a maintainer's approval. That's optional: Prepare release already ran every check.

The notes are written by Copilot CLI from the merged pull requests and commits. To pin the wording yourself, add lines to a PR description (or commit message); they are used as written and the PR's commits are not summarised:

```text
Changelog: Added a desert trail.
Changelog: fixed: The camera no longer jumps at the start.
Changelog: heads up: The leaderboard has been reset.
Changelog: none
```

`none` leaves the PR out of the notes. Preview the notes for the next release locally with `npm run release:notes` (uses your Copilot CLI login).

In the game, clicking the version number (`v0.1.2 · CHANGELOG`) under the logo opens **What's new**, which lists every release from `CHANGELOG.md`. After an update, returning players see a NEW badge next to it until they open it.

One-time setup:

- Repository secrets (Settings → Secrets and variables → Actions → Secrets): `NETLIFY_AUTH_TOKEN` (Netlify → User settings → Applications → Personal access tokens) and `COPILOT_GITHUB_TOKEN` (a fine-grained personal access token with the **Copilot Requests** permission). Without the Copilot token, the release PR lists the raw commit subjects instead, for you to rewrite.
- Repository variable (same page → Variables): `NETLIFY_SITE_ID` (Netlify → Project configuration → General → Project ID).
- Settings → Actions → General → **Allow GitHub Actions to create and approve pull requests**.
