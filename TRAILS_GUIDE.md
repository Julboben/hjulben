# Hjulben – Trails Guide

How the official career is designed: its shape, the rules every trail follows, and what building trails has taught us. For the career as it stands, trail by trail, see [TRAILS.md](TRAILS.md), generated from the trail files; for the trail file format, see [TRAIL_FORMAT.md](TRAIL_FORMAT.md); and for making the props a trail is dressed with, see [PROPS_GUIDE.md](PROPS_GUIDE.md).

---

## The shape of the career

- **Worlds of a few trails each.** Each world has its own backdrop, material, props and sky, so the player can tell they have moved on. A world has as many trails as it needs to teach what it teaches.
- **Every trail brings one new riding element.** This is something the player has to learn: a skill, a terrain shape or a hazard.
- **Every trail also brings something new to look at.** A prop, a weather type or a time of day, so even easy trails feel fresh.
- **Inside a world:** its first trail introduces the world gently, the ones after it each add an element, and its last usually brings together what the world taught. How it does that is up to the trail: a hard run, a long one, or now and then a trials event (rule 6).

Every trail is closed off at both ends, so the rider can't ride out of it, and each trail does it differently: The Orchard has an overhanging bank and shelf, Apple Valley a brick orchard wall and an overhanging grass bluff, and Windfall a rock outcrop and a stack of hay bales.

---

## Rules for each trail

1. **One new riding element per trail.** Everything else on the route should be something the player has already ridden.
2. **Meet it safely first.** The first time a hazard appears there is a way around it, a floor under it, or plenty of room. Only after that does it sit on the main route.
3. **Never make the trail harder to see and harder to ride at once.** Night, fog, heavy rain, blizzards and storms only come in on trails whose riding element is mild.
4. **Teach with the world, not with words.** Apple placement, the shape of the ground and the odd warning prop show the line: an apple floating over a gap tells the player to jump. Use signs sparingly, if at all. The player should work out what to do, and a trail that spells it out takes that away.
5. **Gold times rise through the career.** They can dip on a world's first trail, which is a breather.
6. **A trials event is a set piece, not a rule.** A trail that is a big test, often a world's last, can be staged like a motocross competition. Do it where it suits the trail and the world, not on every world's last trail, so it stays special:
   - **Spectators** (`spectators`) where the rider passes close, such as at the start, beside the hardest section and near the finish. They cheer as the rider goes by and duck from a crash.
   - **Marshals** (`marshal-start` at the start, `marshal-finish` waving the checkered flag at the finish).
   - **Course dressing** from the trials-event props: `tyre-wall`, `hay-bales`, `course-tape`, `banner`, `pit-board`, `petrol-can` and `camera-tower`, chosen to fit the world. The Woods might use hay bales and course tape, the City banners and tyre walls, and the Underground lanterns and tape.
   - The props are decoration only and never change the line, so they go on the `back` layer, clear of the route. Keep spectators for these event trails, so they mark a big test.
7. **Hide the nisse off the line.** A trail can hide one optional nisse (see `TRAIL_FORMAT.md`). Put it where a player only goes on purpose, using a skill the career has already taught: behind the start, reached by turning around; on a ledge that takes a wheelie or a well-timed hop; above a low ceiling or under an overhang; at the end of a side branch; or past the finish, so you have to turn back for it. Never on the route itself, and never behind a skill the player hasn't met yet. Most trails don't have one: the nisse is a collectible with its own achievements, so it should stay a find. Don't add one by default. Add one only when the trail has a hiding place that is worth the detour.
8. **Make reaching the finish part of the challenge.** Don't let a trail fizzle out on easy ground after its last hard section. Now and then the flower should take some effort too: a steep climb that needs the speed you bring, a last jump, or a ledge. Then the run isn't over until it's over. The flower always floats: give the finish a `y` that lifts it clear of the ground, or puts it up in the air like an apple (see `TRAIL_FORMAT.md`), rather than `y: null`, which stands it on the ground.
9. **Hide the terrain's edges.** A trail looks unfinished if you can see where its terrain ends, at the start, the finish or the bottom. Close each end with terrain that makes sense in the setting, such as a bank, a wall of rock or a rise in the fields. The closing has to stop the rider, too, turned around and with a run-up: too steep or too tall to ride (see "What the bike can do" in `TRAIL_FORMAT.md`), or overhanging. A gentle rise in the fields lets them ride out over it. Then let the ground carry on beyond it, further than the camera can see from anywhere the rider can get to. Only show an edge, or leave an end open, when it's meant, like a cliff or a floating island. `scripts/playtest.mjs` reports an end the rider can get out of onto plain ground as an ESCAPE, and one that leads to the nisse or other things placed out there as an OPEN END: a way out to a hidden extra is a fine thing to build.
10. **Dress nature generously, set pieces sparingly.** A trail shouldn't look bare. Use as many trees, bushes, grass, flowers, rocks and stumps as the setting calls for, so a field looks like a field and a wood like a wood, as long as they stay clear of the riding line. The props to be sparing with are the ones a player remembers: landmarks such as the `farmhouse`, `mill`, `wind-turbine`, `flagpole` and `hut`, and characters such as the `scarecrow` or a `stall`. Pick a few of those that make this trail its own, rather than everything that fits the world. A landmark goes on one trail, or a few at most, or it starts to feel repetitive. Scenery doesn't have to be a prop: buildings, bridges, sheds and the like can be drawn with terrain blocks, as back walls the rider passes in front of, with windows cut out and filled with glass (see "Building scenery from terrain" in `TRAIL_FORMAT.md`). Easter eggs appear once in the whole game: Coda (`corgi`) already lives on Windmill Hill, so don't add him to other trails.
11. **Make each trail feel distinct.** Each trail should be remembered for one thing: a shape of terrain, a hazard, a view, a time of day or a landmark of its own. Don't reuse another trail's layout, set piece or dressing with the numbers changed. Before building, ask what this trail is the one with.
12. **Every miss ends in a way back or a crash.** Wherever a missed jump or a failed climb can leave the rider, they must either be able to ride back to the line, which is best (the miss costs time, not the run), or crash. Never leave a pit they can't get out of and can't crash in: the player can only stand there until they restart by hand. To end a miss, use what suits the setting: water (a canal between buildings, a river under a bridge), spikes, a drop off the bottom of the world, or something the rider's head can't get past on the way down, such as open windows, shutters or signs sticking out from both walls of a narrow gap between buildings. A crash only happens when the head hits something, so in a wide gap obstacles along the walls are missed: put the hazard where the rider lands. `scripts/playtest.mjs` reports these places as traps.
13. **Put what should be seen where the camera looks.** The camera keeps the rider about two thirds of the way down the screen, so it only shows about 400 units above them on a laptop, and less on a phone. A landmark taller than that is only ever seen from its base: a church tower's spire above a rooftop route never comes into view. Build a landmark to fit the view above the line, or take the line up past it, such as a climb over the rooftops beside the tower, so the camera rises with the rider. `scripts/render-trail.mjs --camera` shows what the player sees, and its overview darkens what they never see.
14. **Spend detail where the camera is.** A street of houses can be drawn down to the window boxes, but detail away from the route, or out of the camera's reach, is only weight: every block makes the trail larger to load, share and edit. Detail the buildings and set pieces along the line richly, and keep what lies far from it simple. `scripts/playtest.mjs` gives the trail's size next to the largest official trail; past 1 MiB of JSON it can no longer be shared as a link.

---

## Turning around

Turning around (`Space`, `B` on a gamepad, **Flip** on touch) swaps which wheel drives the bike but keeps its speed. A bike rolling backwards down a slope can therefore turn and drive with that roll, and it can turn in mid-air too. That gives four steps to teach, spread over the career:

1. **Turn to reach a point behind you (Windfall).** You start facing east, with the first apple floating high above a slope just ahead, out of reach from the ground. Ride under it, down into a bowl and partway up the long ramp beyond. Let go, and as the bike rolls back, turn and drive down. The speed carries you up a west-facing kicker that throws you up to the apple. Then the trail ends in a dead end at a stack of hay bales with the last apple. The flower hangs over a dip behind a kicker you passed on the way, so you turn once more and hop to it, which repeats the hop from Apple Valley.
2. **Turn to climb (Switchback).** The Woods finale stacks several roll-back turns, zig-zagging up between ramps to a tree house.
3. **Turn in the air (Boomerang).** Jump off a kicker, turn at the top of the jump, and land facing the other way on a ledge behind and above the takeoff.
4. **Put it all together.** Out and Back needs turns on the ground and in the air. The Shaft is a vertical climb made entirely of switchbacks. Elastic Summit needs a switchback under pressure.

What building Windfall showed, measured in the physics:

- **A steep face doesn't force a turn.** With careful forward lean, the bike wheelies up a 60° face from a standstill, which is how the replay bot first solved it. At 65° it stops standstill climbs, but most riders coming back with speed crash on the face. Don't rely on steepness alone.
- **A floating apple does force it.** Riding straight up Windfall's kicker from the bottom of the bowl lifts the wheels at most about 50 units above the lip. Turning on the ramp and coming back down launches them 80–120 units, further west. With the apple 90 units above the lip, no run tested without a turn reaches it, while about 7 in 12 scripted turn-around runs do. The failures turned too low on the ramp, which teaches the player to go higher first.
- **Land on a downslope.** A long jump onto flat ground lands nose-up and crashes. The slope behind Windfall's kicker falls away at about 25°, and no scripted run crashed after getting the apple.
- **The greedy replay bot can't plan a turn.** It always faces the nearest apple, so it parks under one it can't reach. Windfall's replay was first recorded with a scripted opening (ride up, roll back, turn, launch). When the greedy bot can't finish a trail, `scripts/record-replays.mjs` now hands it to an explorer that finds turn-around, roll-back and launch routes by itself, so later turn trails need no scripted opening.

---

## When each element comes in

| Element | Meet | On the route | Tested |
| --- | --- | --- | --- |
| Momentum | Apple Valley | Windfall | Long Way Up |
| Small hops | Apple Valley | Windfall | Dune Hopper |
| Turning around | Windfall | Windmill Hill | Out and Back |
| Switchbacks (turning to climb behind you) | Windfall | Switchback | The Shaft, Elastic Summit |
| Braking | Hay Lane | Stoppie Slope | Brake Point |
| Climbing for height | Windmill Hill | High Orchard | Long Way Up |
| Floating islands | Sky Ladder | Floating Fields | High Orchard |
| Steep climbs | Windmill Hill | Kickback | Long Way Up |
| Wheelies | Kickback | Switchback | The Shaft |
| Drops and step-downs | Stump Drops | Switchback | Sinkhole |
| Air control | Dune Hopper | Kicker Canyon | Big Air |
| Pits with a floor | Sandpit | Mirage | Sinkhole |
| Open gaps | Mind the Gap | Mirage | Rooftops, Big Air |
| Fords | Wet Feet | Deep End | Out and Back |
| Deep water | Deep End | Jetty Jump | Elastic Summit |
| Turning in the air | Boomerang | Out and Back | Big Air |
| Low ceilings | Low Bridge | Sinkhole | Spin Cycle |
| Step-ups | Kerbside | Rooftops | Elastic Summit |
| Darkness | Lantern Mine | Sinkhole | Night Shift, Thunderhead |
| Loops | The Ring | Elastic Summit | — |
| Spikes | Killer Street | Spin Cycle | Rooftops |
| Fog | Whiteout | Elastic Summit | — |

## Difficulty by world

What a world's trails aim for. Which trails are in each world, in order, is in [TRAILS.md](TRAILS.md). A world's last trail may run past these, as its big test.

| World | Length | Widest open gap | Apples | Spikes | Gold |
| --- | --- | --- | --- | --- | --- |
| First Rides | 2000–3800 | None | 3–4, one floating | 0 | 11–32 (out-and-back trails run longer) |
| The Woods | 2800–3400 | None | 4–5 | 0 | 15–21 |
| The Desert | 3000–3600 | 100 | 4–6, some in the air | 0 | 16–23 |
| Lakeland | 3000–3800 | 100 | 4–6, some behind you | 0 | 18–26 |
| Underground | 2400–3600 | 100 | 5–6 | 0 | 18–28 |
| The City | 3200–4000 | 120 | 5–7 | 2–6 | 20–30 |
| The Mountains | 3500–5000 | 160 | 5–8 | 2–8 | 24–40 |

---

## Elements that need engine work

The trails use only what the game supports today, so new riding elements run out at some point. These would open up further worlds:

- [ ] **Checkpoints:** restart from the halfway flag. Needed for long trails of 5000+ units.
- [ ] **Moving platforms and see-saws:** terrain that moves along a fixed path. It must stay deterministic for replays.
- [ ] **Gates and switches:** touch a switch to open a wall elsewhere.
- [x] **Optional collectibles:** a hidden nisse in each trail, for replay value without blocking the finish.

---

## Building a trail

1. **Build in world order.** Finish each world before starting the next, so the difficulty is tuned against what the player has already ridden.
2. **Best times reset when the riding changes, not when a trail moves.** Best times and leaderboards are keyed by trail id plus a hash of the trail's gameplay (`trailKey` in `js/state.js`), so a rebuilt trail starts from zero. The id is the file name without its number (`05-windmill-hill.json` is `official:windmill-hill`), and the number only sets the order, so renumbering a file to move a trail keeps its leaderboard, best times, nisse finds, unlocks and replay. The trails a player has open are worked out from the trails they finished, so a trail added before others never locks anyone out of one they have ridden. Two files that differ only in their number would share an id, so the catalog skips the second and says so.
3. **Replays and medals.** Every official trail needs a replay from `node scripts/record-replays.mjs` and a passing `npm test`. Set gold times from the replay bot's times.
4. **Playtest from the command line while building.** `node scripts/playtest.mjs <trail>` solves the trail with the replay bot and shows where it is tight; `--without` checks that the trail's new element is really needed. See [Playtesting from the command line](TRAIL_FORMAT.md#playtesting-from-the-command-line).
5. **Playtest with new players.** Note where a first-time player crashes most. If more than one crash point is something the career hasn't taught yet, the trail brings in too much.

---

## Asking an AI to build a trail

An AI that can run commands in this repository (Claude Code, for example) can build a trail, playtest it with `scripts/playtest.mjs` and look at it with `scripts/render-trail.mjs` as it goes. Start a fresh session, fill in the idea in the prompt below, and ride the result before doing anything else with it. The prompt is written from what earlier attempts got wrong: a nisse on every trail, signs explaining the route, the same landmarks everywhere, a finish standing on easy ground, visible terrain edges, a design brief cut off at the length limit, jumps kept timid because they weren't measured, a landmark no player could see, a missed jump that left the rider stuck with no way out, and a skill the brief asked for that the trail never needed.

```
Build a new custom trail for Hjulben: [THE IDEA, e.g. "a farmland trail with floating islands you have to jump to"].

[THE SETTING AND RIDING: the world it belongs to, the riding elements to use, how hard it is and roughly how long a good run takes, e.g. "Farmland, medium-hard, about 1–2 minutes for a good rider. Several floating islands at different heights: a kicker launch up to one, a drop from one island onto the next, one you reach by turning around for a run-up, and an island transfer where you have to control your height. At least one apple in the Elasto Mania spirit: tricky to get to, and meant to be found rather than ridden past."]

[ITS PLACE: "It will become official trail N, between X and Y" or "a custom trail, outside the career". For a place in the career, add: "Read X, Y and the trails before them in TRAILS.md. Use only what the player has learned by then, and don't repeat what X or Y teach."]

Save it only as a custom trail in trails/custom/, with a fitting file name. Don't touch official or bonus trails: I'll ride it myself first.

How to work:
1. Read CLAUDE.md, TRAIL_AUTHORING_CONTEXT.md and TRAILS_GUIDE.md first, and follow the rules for each trail.
2. Before any geometry, decide what this trail is the one with, and write a short design brief: the route as sections, each apple's place and the skill it tests, the intended apple order, and how a player recovers after a miss. Missing a jump should cost time, not the run, where that suits the trail. Put the brief in the trail's "description", within its 2000 characters, and say what the trail teaches in "lesson" and what is new to look at in "alsoNew" (see "Other fields" in TRAIL_FORMAT.md).
3. Build it section by section. Start from the table in "What the bike can do" in TRAIL_FORMAT.md (how far kickers throw the bike, how steep it climbs, how tall a step it gets up; for a ledge to hang from, "A ledge to hang from"), then measure every jump with `scripts/playtest.mjs --probe ... --script` while you shape it, so takeoff speed, distance and landing come from measurements, not guesses, and dare to go close to what the bike can do.
4. Playtest the whole trail with `--order` set to your intended apple order, and iterate until the bot finishes. Most stretches should be forgiving (above about 60%); a hard stretch should be hard on purpose, not by accident. Use `--without` to check that each apple meant to need a skill really needs it. Fix every TRAP the playtest reports, where a miss leaves the rider with no way back and no crash: give it a way back, or make the miss end the run (rule 12).
5. Look at it. Render it with `scripts/render-trail.mjs` and read the images: the overview with the bot's route and tight spots, and each section as the game draws it. Fix what looks wrong, unclear or bare, and render again; `--props` labels each prop with its index in the file, to find the one to move. Then render it with `--camera` to see it as the player does: the sections show more than the game's camera ever does, and the overview darkens what it never shows. Make sure your landmarks and set pieces are seen (rule 13).
6. Make reaching the finish take some effort, and float the flower clear of the ground. Close both ends with terrain that fits the setting and that the rider can't get over, with ground carrying on beyond so no edge shows. Fix every ESCAPE the playtest reports; an OPEN END to something hidden out there is fine.
7. Dress it last: plenty of natural props for the setting, buildings and other structures drawn with terrain where no prop fits (back walls with glass windows, see "Building scenery from terrain" in TRAIL_FORMAT.md), only a few landmarks or characters that make this trail its own, signs only if really needed, and no nisse unless there is a hiding place worth the detour. Spend detail where the camera is, along the line, and keep what lies far from it simple (rule 14). Keep the riding line clear, then validate, playtest and render once more, and look at every section. Fix every error and warning validation reports, but treat it as a tool that can be wrong: if a message doesn't match what the render or a probe shows, check the code behind it (`validateTrail` in js/trail-schema.js) instead of changing the trail to silence it.
8. Set medals from the bot's time: gold at most 5% above it (the bot doesn't take the fastest line, so a good rider beats it), silver about 1.3× gold, bronze about 1.75× gold. Then run `npm run trails` so it appears in the game.
9. Check it against your brief and the rules before handing it over: for each skill the brief asks for, whether `--without` proved the trail needs it; and for rules 4 and 7–14 in TRAILS_GUIDE.md, whether the trail keeps them. Fix what you can, and rate the trail out of 10.

When you're done, tell me: the file name, what the trail is the one with, the final playtest summary (the time, and each stretch's forgiveness and tight spots), anything the bot couldn't do or you're unsure of, each skill from the brief the trail doesn't need after all, your rating and what keeps it from a 10, any validation warning you left and why (a suspected false alarm with your evidence, so the check can be fixed), and what I should look out for when I ride it. If you learned something about building trails that the docs should say, suggest it. If a gap in the tools cost you real time, something you measured by hand over and over or couldn't check at all, describe it and what you did instead; most trails won't have one, and "none" is a fine answer.
```

## Asking an AI to improve a trail

Improving a trail is a different job from building one: the trail already works and has its own character, so the change has to keep both, and be shown to be better in numbers rather than just different. The prompt below asks for that. Name the trail and the kind of change, and keep to one kind at a time.

```
Improve the Hjulben trail [FILE OR NAME, e.g. "trails/custom/harbour-run.json"]: [THE CHANGE, e.g. "make it harder: the middle section is too easy and it's over in 40 seconds; I'd like about a minute, with one jump that needs real speed control" / "make it longer" / "more apples, and harder to reach" / "polish the look"].

Work on a copy in trails/custom/ with a fitting new file name, so I can ride the original and the new version side by side. Don't touch official or bonus trails.

How to work:
1. Read CLAUDE.md, TRAIL_AUTHORING_CONTEXT.md and TRAILS_GUIDE.md first, and follow the rules for each trail.
2. Measure the original before changing anything: playtest it with scripts/playtest.mjs (save the output) and render it with scripts/render-trail.mjs, sections and --camera. Write down what the trail is the one with, what works, and what holds it back for the change I asked for.
3. Plan the change as a short list of edits, each with what it should do to the numbers (time, forgiveness of a stretch, a skill it adds), and keep the trail's character and its best parts. Update the design brief in the description to match.
4. Make the edits one at a time, playtesting after each: measure new jumps with --probe, prove each new skill with --without, and fix every TRAP the playtest reports. Where you rework terrain, rebuild any bend drawn as a chain of short straight pieces with a few smooth points and handles, and delete the points validation reports on straight lines (see "Few points" in TRAIL_FORMAT.md); keep the shape, and playtest again, since the bike rides the new line a little differently.
5. Render again, sections and --camera, and compare with the original's images.
6. Set the medals again from the new bot time, as for a new trail (gold at most 5% above it), and run `npm run trails`.

When you're done, tell me: the new file name, each change and why, a before and after table (the bot's time, each stretch's forgiveness and tight spots, apples, skills proven with --without, traps), anything that got worse and why that's worth it, your rating of the old and the new version out of 10, and what I should ride first to feel the difference. If you learned something about building trails that the docs should say, suggest it. If a gap in the tools cost you real time, something you measured by hand over and over or couldn't check at all, describe it and what you did instead; most trails won't have one, and "none" is a fine answer.
```
