# Physics implementation status

The staged physics roadmap is implemented in `js/vehicle-physics.js`: a physical chassis, XPBD suspension, swept collision, angular traction, motor/brake reaction torque, and rider-applied chassis torque. The original two-wheel distance-constraint solver has been removed. Physics traces remain available in debug mode, `?debug=1`.

## Implemented foundation

- Fixed 120 Hz simulation
- Circle-versus-polygon edge and corner collision against compiled terrain blocks
- Swept circle-versus-segment collision before static overlap correction for wheels and ragdoll points, plus swept rider crash probes
- Inverse-mass XPBD constraints whose multipliers reset once per substep
- Separate constraint compliance and velocity damping
- A physical non-collinear chassis triangle with rigid links
- Independent suspension legs with compliance, damping, and travel limits, all measured along the line each wheel travels on rather than straight from its mount, so a raked fork's spring, damper and stops stay true to its travel
- No wheel-to-wheel link: as in Elasto Mania, each wheel hangs from the chassis on its own leg, so the wheelbase gives a few pixels on hard landings
- A front fork and a rear shock that differ as on a motocross bike, each with a rising-rate spring in place of a stiff bump stop, and a bottoming cone (`FORK_SUSPENSION` and `SHOCK_SUSPENSION` in `js/config.js`):
  - The fork is on the leading wheel and the shock on the trailing one, whichever way the rider faces
  - On a flip they swap wheels, and each wheel's line of travel turns to its new rake over 0.15 s (`SUSPENSION_FLIP_TIME`), about as long as the drawn bike takes to turn around. Turned in one step, a compressed wheel sat up to about 6 px off its new line and the slider snapped it there: flipping at rest jolted the chassis by 49 px/s, and at the bottom of a 60 px landing by 143 px/s against 18 px/s unflipped. Eased, the jolts are 3 px/s and no more than the landing's own. The jolt lasted one step, so it moved the body by under a quarter pixel: this tidies the solve rather than changing the feel
  - The fork is raked back 23°, as the drawn fork is, so its wheel travels up and back as it compresses. A step face or square edge pushes the wheel up into the fork instead of stopping it dead and pitching the bike over the bars: of 72 simple attempts at a single step, 44 instead of 28 get up a 14 px step and 20 instead of 7 an 18 px one. The rear wheel travels square to the frame
  - The fork is linear until its air spring ramps up over the last 7 px of travel. Its lighter damping (0.22 compression, 0.38 rebound) lets it recover quickly for the next bump. It sags 3.4 px at rest
  - The shock's linkage makes it progressive over the whole stroke, from a soft start: it sags 5 px at rest, about a third of its travel as race sag is set, which leaves it droop to keep the tire on the ground as the weight comes off it. Firmer damping (0.28 compression, 0.55 rebound) keeps it from kicking the bike over the bars
  - From 9 px of compression each end's compression damping climbs with the square of the way into the zone, to 0.95 at full travel
  - With no bump stop to store the end of a landing and hand it back, a 200 px flat drop throws the chassis back up at about 31 px/s and a 350 px one at 33 px/s, where the stiff bump stop gave 42 and 66. Landing hard on one wheel, 200 px at 35°, no longer bucks the bike over the other wheel, and of 600 test drops with no rider input, 65 crash within 3 s instead of 163. With gas held the gain is small (309 instead of 335), as most of those crashes are throttle wheelies looping over after a clean landing. The cost is honest bottoming on the biggest flat drops: from 200 px (about 6 m at the bike's scale) the soft-started shock touches the travel limit for a few steps
- Elasto Mania-style suspension stretch: springs are softer pulled than pushed, with a top-out spring, so a bike hooked on a ledge by one wheel hangs visibly stretched from it and bobs before settling
- The drawn front fender rides on the sprung body, as one bolted to the lower triple clamp does, so the tire rises toward it as the fork compresses
- The drawn Elasto fork's lower leg keeps its length, so the stanchion above it shows the fork's travel, from about 17 px topped out to 2–4 px bottomed
- The drawn tyres flatten against the ground under load, from 3 times their load at rest (hard braking, any real landing), and from 18 times (about a 60 px drop) their sidewalls bulge too (`squishTyres` in `js/effects.js`)
- A leg driven fast into the end of its stroke clunks: past 13 px of compression at 100 px/s or more (from about 100 px drops), or out into the top-out spring at 50 px/s or more, as a hooked wheel takes the bike's weight (`suspension` events from `js/ride.js`). Skids sound like the ground under the tyre: loose ground tears and hisses, hard ground squeals (`SKID_VOICES` in `js/audio.js`)
- The drawn body, lamps, rider and hair sit exactly on the simulated chassis, with suspension travel interpolated between steps for high-refresh displays
- Tire grip is Coulomb friction on the real ground force: each wheel's normal impulse is summed from every contact correction in a step (including chassis weight passed through the suspension and landings), with static grip for a gripping tire and lower kinetic grip for a slipping one. Drive and re-traction passes share that budget, so a slow crawl tops out at about 57° with no slope-specific grip rules. The push that keeps a lone grounded wheel planted under rider lean is not weight and gives no grip
- The motor spins the tread at most a small slip ahead of the ground, and engine torque only tapers while the wheel turns forward, so the throttle hooks up to stop a bike sliding back down a hill
- Wheel angular velocity driven by throttle and braking
- An engine between the throttle and the rear wheel (`ENGINE` in `js/config.js`), with a light flywheel and a centrifugal clutch that grips harder as the revs rise. The clutch always slips a little under load, so the engine runs above the wheel's speed and its drive comes in soft. The throttle opens about as fast as a twist grip, most of the way in a tenth of a second, so a blip counts, and springs shut when let go. The rider pulls the clutch in to brake, so gas held on the brakes revs the engine against them, to the limiter in about a quarter of a second, and letting the brakes go drops the clutch at high revs. From a standstill the bike then reaches 300 px 0.08 s sooner and lifts its front to about 8° rather than 3°, but the rev costs more of the clock than it saves, so it is a pop rather than a faster start
  - The engine sound (`js/audio.js`) plays this engine: its pitch follows the revs, and how hard it barks follows the clutch's pull on the wheel. So you hear the clutch slip pulling away, the bog on a climb, the drop to idle off the gas and the spin-up to the limiter in the air. There are no gear shifts, as the engine has one gear
  - Held gas with no lean lifts the front about 3° on the flat and lets it settle within a second, and runs to 472 px/s in 3 s. Over a small bump it lifts about 15° and settles; on a 5° climb about 6°. On a 10° climb it loops the bike unless the rider leans forward, as it did before the engine. A wheelie on held gas is unstable, so a lift clearly visible on the flat would loop on gentle slopes: from flywheel .29 a 10° climb loops, from .31 a 5° one
  - A 45° hill is climbed from all seven test run-ups, against five before, but more slowly: 25° and 35° hills take about 4.8 s instead of 4.2–4.4 and 3.8–4.0, and 45° about 6–8 s instead of 4–4.7
- Rider lean, as in Elasto Mania, is a turning push on the bike, and it follows the input most of the way in a quarter second (10/s), quick enough to time a pop onto a step. Held too long it loops the bike, which is part of the challenge. Of 864 simple attempts at a single step, 254 instead of 202 get up a 14 px one, 40 instead of 30 a 22 px one and 12 instead of none a 30 px one
  - Moving up a climb or on the gas, forward lean is cut by up to 90% with the slope (`XPBD_UPHILL_FORWARD_LEAN_REDUCTION`), as a real rider's weight, far behind the front tyre on a climb, cannot lever the rear up; holding forward lean climbs. Lean is a push, not a weight shift, so without the cut full lean acts like moving the centre of mass about 49 px forward, almost a wheelbase. Standing still off the gas the cut fades out below 40 px/s (`XPBD_UPHILL_FORWARD_LEAN_SPEED`), so on the brake forward lean lifts the rear as far as gravity lets it: 50 px on a 20° climb, about 40 px on 33° and 38°, where it could not before. Hill starts and climbs with forward lean held are as before. Nothing sets an upper limit but the physics: from about 40° the braked bike cannot stand still at all and slides back down the hill (155 px on 38°, 433 px on 42°), so there is nothing to lift from on very steep hills, such as the 54° one in the Hill Climb test
- Braking works through the tires: each brake takes spin out of its wheel up to its strength, and grip decides whether the tire holds or skids. The brakes push back on the frame exactly as hard as they hold the wheels, which with the tires slowing the bike at the ground is the dive; there is no separate dive push. Braked flat out from 300 px/s the bike pitches over the bars; leaning back keeps it down, locks and skids the rear wheel, and stops it at about 1.4 g. Rolling back down a hill it is the other way round: braked on 30° or steeper the bike tips over backward unless the rider leans forward
- In the air the wheels' spin and the bike's keep their total, as on a real bike: gas spins the rear wheel and the engine's flywheel up and lifts the nose, about 38° over a second from flying at 250 px/s, until they reach the rev limiter; braking a spinning wheel drops the nose. A wheel in the air keeps its spin but for the engine and the brakes, so it lands with whatever spin the rider left it: land on an open throttle and the bike lurches forward. Rider lean stays the main air control, about five times stronger
- Contact-point slip converted into coupled linear/angular friction impulses
- Block terrain for loops, caves, and overhangs, with one compiled geometry shared by rendering, collision, validation, and the editor
- Debug mode with `?debug=1`, also in the editor's play test: physics traces and console tools, a frame-rate meter, an on-screen readout of the bike, engine, wheels and the rider's crash probes, and the probes drawn on the rider

## Terrain format

Terrain is a list of `terrainBlocks`. Each block has one or more solid regions, each with an outer boundary and optional cave boundaries, built from straight or curved edges. That supports overhangs, vertical faces, movement back along x, and closed loops.

See [`TRAIL_FORMAT.md`](./TRAIL_FORMAT.md) for the complete schema and editor workflow.

## Validation completed

The automated suite covers:

- Gap openings and cliff walls
- Floating block tops, sides, corners, and undersides
- Steep polygon contacts
- Fast circle sweeps into blocks
- Caves, nested blocks, and overhangs
- Predicted-position XPBD correction
- Inverse-mass XPBD correction
- Center-of-mass preservation in the distance velocity projection
- Angular-to-linear traction transfer
- Full-vehicle flat acceleration and braking-versus-coasting runs
- Stationary wheel lift and airborne rotation
- Mirrored left/right hill climbing
- Flipping at rest and at the bottom of a landing without a suspension pop
- Valley settling
- One-wheel landing and second-wheel recovery
- Hard landings: a gentle rebound from big flat drops with only brief bottoming, and no buck over the other wheel after landing hard on one
- Hanging from a ledge by one wheel
- Steep hills: 45° climbable from most of seven run-ups by a rider who keeps the front down, 58° and 60° never, 78° walls never
- A recorded gas-and-forward-lean attempt at a 64.5° hill stays at its foot
- Braking a bike sliding back down a 35° hill to a stop, leaning forward, then recovering on the throttle
- Braked rolling back, the bike tips over backward on a 35° hill without lean and stops on a 25° one

- One recorded replay per official trail (`tests/replays/`), replayed through the DOM-free `js/ride.js` to check finish time, apples, crash outcome, NaN values, and tunnelling
- Seeded ragdoll determinism, elbow/knee hinge limits, neck/hip angle limits, ragdoll sleep, and the crashed chassis resting on the ground
- Chassis-anchored rider probes that follow chassis pitch; only the head crashes on terrain, while spikes hurt the head, shoulders and hips

The game and deterministic scenarios execute the same DOM-independent `js/ride.js` and `js/vehicle-physics.js` step functions. Run the complete suite with `npm test`.

## Cross-engine determinism

V8 in Chrome and V8 in Node return different last-digit results for `Math.sin`, `cos`, `atan2`, `exp`, `log`, and related functions. A one-ULP difference compounds into a different run within a few hundred steps. Simulation code therefore imports these functions from `js/det-math.js`, which implements them with only `+ − × ÷` and `sqrt` (both exactly rounded by IEEE 754), ported from fdlibm/musl. `scripts/test-det-math.mjs` checks their accuracy against `Math`. Keep `Math.*` transcendentals out of `ride.js`, `ragdoll.js`, `vehicle-physics.js`, `physics.js`, and `terrain.js`. They are fine in rendering code.

## Manual handling pass still required

Physics constants are centralized in `js/config.js`, but feel tuning requires browser play-testing. Ride every official trail in both directions and verify:

- Sharp crests and valleys
- Both sides of every gap
- Floating block tops, corners, sides, and undersides
- Low-speed approaches and maximum-speed impacts
- Rider/head, chassis, and ragdoll contacts
- Full loops with enough approach speed and appropriately broad radii

Tune restitution, friction, suspension compliance/damping, and the grounded-normal threshold only after this matrix is reliable.

## Damper coupling

The suspension damper is a velocity pass after the contact and traction solve, and it is coupled to the tires correctly: its force reaches the ground through the wheel on the next contact solve, as a real damper pushes on the wheel and the wheel on the ground. Measured over 40–300 px drops, the ground force the tires record (`groundLoad`, which tire grip uses) matches the force the ground really gave the bike, from its change in momentum, within 0.1% on every step, with or without the bottoming cone. Stronger damping therefore does not take grip away. When a tuning change seems to, look at timing first: a locked bike rocks on its springs for a moment as it stops, which is why the 35° hill brake check looks for a stop held over a window rather than at one step.

## Concave corners

Measured in 2026-10, with no change needed. Terrain contact returns only the nearest piece of each block, so a wheel in an inside corner is pushed out of one face at a time. Wheel collision runs once with the sweep and again in each of the 7 solver iterations, though, so a wedged wheel is pushed out of each face in turn and ends every step clear of both. In V notches small enough for one wheel to touch both faces (±30–60°, 6–10 px deep) it never ends a step overlapping the ground, settles at rest with at most 1.8 px/s of creep, and rises at most 57 px/s rolling through at 350 px/s (54–59 for the same notch rounded) and 25 px/s landing in from 80 px (15–20 rounded). Against a vertical wall it stops dead without bouncing back. A sharp kink into a ramp gives a bigger one-step jolt than a rounded one (82 against 14 px/s into a 50° ramp at 150 px/s), as the wheel turns at once instead of along the curve. That is the corner's shape, not the solver, and it never bounces the bike higher than the rounded kink. Look again only if a ride shows sudden bounces at a specific corner.

## Speed and acceleration

Measured in 2026-10 on a long flat strip, gas held from a standstill with no lean. A unit is about 3 cm at the bike's scale (its 50-unit wheelbase is about 1.5 m on a real motocross bike), so 100 units/s is about 11 km/h. The motocross column is rough figures for a 250–450 cc bike on dirt, not measurements.

| | Hjulben | Typical motocross bike |
| --- | --- | --- |
| 0–20 km/h (200 units/s) | 0.9 s | about 0.6–0.8 s |
| 0–32 km/h (300 units/s) | 1.5 s | about 1 s |
| 0–53 km/h (500 units/s) | 3.3 s | about 1.8–2.5 s |
| 0–85 km/h (800 units/s) | 8.5 s | about 3.5–4.5 s |
| Top speed | 89 km/h (839 units/s) | about 120–150 km/h |

The first second is true to a real bike: about 0.7 g, which is what one manages before the rear spins or the front lifts. After that the pull fades, to 0.4 g in the second second, 0.3 g in the third and 0.2 g after, because the engine's torque tapers from `XPBD_TORQUE_FALLOFF_SPEED` (340 units/s, about 36 km/h). A real bike keeps pulling hard to well past 50 km/h, so from about 35 km/h ours rides more like a 125 than a 450. The top speed is set by the engine's redline and `MAX_POINT_SPEED`, both at 860 units/s; the cap on how fast any point may move probably keeps the bike from passing through thin terrain or glass in one step, which hasn't been checked.

The trails are ridden well below that. Over the official trails' replays the bike averages 150–350 units/s; Windmill Hills, Lantern Mine and Big Air spend much of their time above 400, and only Windmill Hills and Switchback ever pass 600. So the top speed hardly matters, and the range a change would be felt in is 35–55 km/h, where the jumps are.

## Next steps

1. Replace the bot-recorded fixtures with hand-ridden replays once handling tuning settles, since bot lines avoid some of the riskier features.
2. Maybe an automatic gearbox, as other bike games have, for feel rather than handling: revs that climb and drop at each shift (good for engine sound) and a small surge as each gear bites. It would not change the held-gas wheelie, which happens at pull-away in first gear, where an automatic starts too. The torque curve already fades with speed as a gearbox with endless gears would. A shift is a sudden change of torque, so one at the wrong moment, mid-climb or with the front light, could lift the front or bog the bike down without the rider asking.
3. A stronger mid-range, to pull like a real motocross bike between about 35 and 55 km/h (see "Speed and acceleration"). Try it on a branch of its own: raise `XPBD_TORQUE_FALLOFF_SPEED` modestly (340 to about 420), keep the launch and the top speed as they are, and run the playtest over every official trail before deciding. Every jump with a run-up goes further, so trails like Windmill Hills, Big Air and Mind the Gap may overshoot their landings, and the jump table in "What the bike can do" in `TRAIL_FORMAT.md` needs measuring again. It needs a `RIDE_VERSION` bump.
4. Rev against the brakes, the first step of which is in: the throttle opens while braking. Next, ride it and decide whether it needs more: a How to Play hint, a cap on the revs it can build if a rev launch becomes a trick every fast run needs, or a heavier hit for popping onto steps. Measure the pop against a plain blip on the step tests in `scripts/test-vehicle-physics.mjs` first.

## Tried and rejected

- A throttle that opens over about two seconds (1.1/s), standing in for a rider rolling it on. It made a short blip useless, for popping the front onto a step or turning the bike in the air.
- A heavy flywheel (1.5 times the rear wheel's inertia). Spinning it up with a fast throttle kicked the frame nose-up, which helped pop the front onto steps but looped the bike on held gas on the flat. Nothing between .30 and .35 both popped and stayed down.
- The rider as their own mass on the bike, moving forward and back with lean, held by springy legs and arms, in place of the turning push on the ground. Lean moved the bike's centre of mass by only 2 to 3 px, and the push of throwing weight back is undone by the stop at its end, so with both wheels down lean did almost nothing: no wheelie, stoppie or pop. The real pop is mostly up and down, pulling on the bars and pushing on the pegs, which a forward and back lean cannot express. It also made the bike feel heavy.
- A brake dive pushed on the frame in proportion to the bike's speed and capped, whatever the brakes were doing, and switched off while rolling backward. It flipped the bike over the bars at about 0.6 g. The brakes' real push-back replaced it.
- More realistic tire grip for braking. Down from 2.1 to 1.4, leaning back to brake still stops the bike at 1.2 g against about 1 g on real dirt, but from 1.6 the 45° climb from a standstill fails half the time, and from 1.4 the hill restarts fail. Grip stays at 2.1 for now.
- Respecting the balance point on one wheel: within the last 12 px of the level distance from that wheel's contact to the centre of mass, a held lean steered the bike's spin to stop at the balance point, so held lean back settled into a wheelie at about 51° and held lean forward a stoppie at about −46°, instead of looping. It worked and helped steps, but holding a lean too long and looping over is part of the game's challenge, so taking that away was hand-holding.
- Fading the lean's push near the balance point without steering the spin. The bike comes up spinning at up to 3 rad/s and its momentum carried it over anyway. Steering the spin from the moment a wheel lifts stopped that but made wheelies and pops slow to start, and tall steps harder.
- Removing the 12% boost lean back gets while on the gas (`XPBD_THROTTLE_LEAN_ASSIST`). With the balance point respected it no longer feeds loops, and without it tall steps got slightly harder.
- A rider's throttle hand that rolled off automatically when the front rose without the rider leaning back. It kept the bike down and the speed up, but it felt like the game riding the bike, so it went.
- A clutch that passes the engine's full torque when it grips. Steep climbs got faster than ever (35° in about 3.2 s), but held gas looped the bike on the flat. Holding the low-speed torque down far enough to stop that, to 40% of the peak as a taller first gear would, left the bike unable to pull away up a 35° hill from a stop.
- A shorter first gear (more torque at a standstill, fading sooner). With the slipping clutch the engine runs well above the wheel's speed, where a faster fade takes torque away, so the front lifted less, not more.
- No uphill cut on forward lean at all, leaving gravity alone to limit it. Standing, the rear lifts the same everywhere, but keyboard and touch lean is all or nothing, so holding forward on any climb from 25° tipped the bike over its front wheel, and the hills of the Hill Climb test could not be climbed. A cut fading with speed alone broke hill starts: from a standstill with forward lean held it tipped the bike over on 20° and slid it back on 33°, so the cut also stays while on the gas. A cut fading off the gas alone, whatever the speed, was considered and not used: letting off the gas mid-climb with forward lean held would drop the cut while the bike is still moving up the hill. What we settled on keeps the cut moving or on the gas, and fades it only standing still off the gas
- Anti-squat from chain pull: the chain's tension on the driven wheel pushed it away from the frame along the shock's line, in proportion to the clutch torque, scaled so 1 cancels the squat from the drive's weight transfer (real motocross bikes run about 1–1.3). At 0.5 the rear's squat on pulling away halved (4.2 to 2.3 px) and every test passed, but there was nothing to feel: the slipping clutch passes about 0.45 of peak torque pulling away and 0.17 at speed, so the chain pull is small. Steps barely changed (16 to 18 of 72 attempts at 22 px), the front lifted 9% more on held gas on the flat, and the forward-lean climb was 10% slower. From 1 held gas looped the bike on a 35° climb, and at 1.3 a held-gas climb got 220 px instead of 476. On a 54° hill the front skips on and off the ground with or without it

## Profiling (2026-10)

The official replays run at about 30 µs per step in Node on an M-series laptop, which is roughly 0.4% of one core at 120 Hz. Self time is spread out. `stepVehicle` takes about 19%, the constraint solvers together about 20%, and terrain contact and sweep queries about 20%. The rest is GC and ride bookkeeping.

- Solver passes: 5 position / 2 velocity passes pass the whole suite with almost the same metrics. They save only about 13% of step time, but frame flex on hard drops nearly doubles (0.3 → 0.53 px). 7 / 3 stays.
- `nearestLiveInBody` was the biggest single hotspot (12%). It now runs without allocations and skips the square root for pieces that are no closer. Results are bit-identical, and it costs about half as much.
- Physics is not where weak phones spend their frame budget. Profile rendering next.
