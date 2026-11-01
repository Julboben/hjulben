# Hjulben – Trails

The career as it stands: every official trail in its place, grouped by world, with what it teaches, what is new to look at, its description, its gold time and the replay bot's time. How the career is designed, and the rules every trail follows, are in [TRAILS_GUIDE.md](TRAILS_GUIDE.md).

Written by `scripts/generate-trails-overview.mjs` from the trail files, so don't edit it by hand: what a trail teaches, what is new in it and its world are its `lesson`, `alsoNew` and `world` (see "Other fields" in TRAIL_FORMAT.md), and each world's line is in `trails/worlds.json`. `npm run trails` and the dev server write it again when a trail changes.

## First Rides

*Grass, `hills` backdrop, the orchard and the farm around it, noon, clear skies. Teaches the controls.*

- **01. The Orchard:** Gas, lean and gentle rollers. *Also new:* Farm props, collecting apples. (gold 11 s, bot 11.8 s)

  > Learn the rhythm: build speed on gentle rollers, lean forward on climbs, and settle the bike before each landing.

- **02. Apple Valley:** Momentum. Rollers grow from small to large, then a deep dip in front of a big hill shows that a run-up carries you up. The flower hangs over the dip past a small kicker, so the trail ends with a first little hop. *Also new:* The scarecrow, beehive, ladder and tyre. (gold 14 s, bot 13.5 s)

  > Let the hills do the work: roll into each dip with speed and it carries you up the next rise. The big hill goes easily with a run-up, and slowly without one. The flower hangs over the dip past the last kicker, so arrive with speed and hop to it.

- **03. Windfall:** Turning around. Ride up, roll back, turn and drive down to reach an apple you passed. *Also new:* Windfall apples in the grass, hay bales. (gold 32 s, bot 24.9 s)

  > Turn around (Space) to go the other way. The first apple floats too high to reach from the slope below it: ride down into the bowl and up the long ramp, turn, and come back down fast enough for the kicker to throw you up to it. The last apple waits at the hay bales, and the flower hangs over the dip behind the kicker you passed, so turn once more and hop to it.

- **04. Hay Lane:** Braking. A downhill run to a fence, with a `SLOW` sign before a drop. *Also new:* Signs, tyre barriers. (gold 18 s, bot 21.9 s)

  > Brake (hold back) before the drops. The SLOW signs mark each descent and the ! marks the lip. The small step on the first hill is a warm-up with a long, flat runout. The apple waiting at the foot of each drop is only caught by rolling off it slowly, so a rider who flies off sails over it. The last descent is long and fast: brake hard before the lip, roll down onto the landing for the apple, and stop before the tyre wall at the end of the lane.

- **05. Windmill Hills:** Big air. A row of tall, thin hills: carry speed up each steep face and the peak throws you high over the crest onto its landing shoulder, with time in the air to level the bike, or to flip it. *Also new:* A farmland hillside of tall, narrow hills with a patch of nature on each, skylarks that take off from the peaks, and the mill turning on its own hill. (gold 29 s, bot 70.5 s)

  > The one with the row of tall, thin hills you fly over. Each hill is a steep face up to a narrow peak with a long landing shoulder behind it: hit the face fast and the peak throws you high over the crest, with time in the air for a flip, down onto the shoulder. The hills grow taller along the route, and every valley climbs gently back up to the field, so the trail stays level and the next hill can be taken at speed. Route and apples, in order: 1. Start field under a steep bank, then the smallest hill. Apple 1 sits just past its crest: ride over it and you touch it. Teaches that the peaks throw you. 2. Second hill: apple 2 floats above the far side of the crest. Needs speed carried up the face. 3. Third hill, with a beehive and a skylark on its shoulder: apple 3 higher still. 4. Mill hill: the mill turns on the crest, and apple 4 hangs beyond its sails. Full throttle up the face. 5. Flip hill, the tallest, a pine on the peak: apple 5 at the top of the arc. The longest air of the trail, enough for a backflip. 6. Finish: a last, smaller hill with the flower floating high above its crest. Hit it with speed to hop up to it, or roll back down the face for a longer run-up. Skill: carrying speed into a steep face (momentum). Leaning to keep the front down on a face and to level the bike in the air helps, but the bot finishes without either, so they are not required. Flips are optional: the flip hill gives about 1.9 s of air, and a backflip lands. After a miss: nothing on the trail ends a run except a bad landing. Every valley is an open bowl. Too slow up a face, roll back and take a longer run-up. Past an apple without it, turn, ride back over the hill and up the previous landing shoulder, turn again and use the shoulder as a run-up: it costs about ten seconds, not the run. Each comeback was measured with the bot from a standstill in the valley beyond.

- **06. Sky Ladder:** Floating islands. Hop up from one island onto the next, and drop onto lower ones, climbing into the sky over a meadow that catches every miss. *Also new:* Floating meadows stacked into the sky with roots hanging beneath them, and a potato stall on the highest island. (gold 22 s, bot 43.3 s)

  > SKY LADDER. The one with the islands stacked into the sky: a short, easy climb from the meadow to the highest island, hopping from island to island, then turning back and hopping on up above the islands you came by. The career's first floating islands, with the meadow under every one of them. ROUTE AND APPLES: 1) A grassy kicker on the meadow throws you up onto island 0; apple 1 hangs over its near edge. 2) Island 0's curved lip throws you up onto island 1, and island 1's lip over the lip of the hill island. 3) The hill island: a ramp up to a crest with an apple tree, and behind the crest a hollow you can't see from below. Apple 2 floats in it: the one you go looking for. The rim beyond is steep: ride up it, roll back, turn (Space) and ride back over the crest. 4) Down the ramp at speed, the hill island's lip throws you high and back west, up onto the first upper island above island 1; apple 3 floats over its edge. 5) Two more hops up, each lip throwing you onto the next island's landing shoulder; apple 4 floats over the top island's edge by the potato stall. 6) The finish: a steep bank up to the summit, with the flower floating by the old apple tree and the rock. SKILLS: momentum (every lip wants a run-up, and the ramp gives the big hop its speed), small hops off kickers, turning around (once, on the hill island), big air (level the bike before each landing). New: taking off from one island and landing on another, higher or lower. No turning in the air. RECOVERY: there is ground under every island. Miss on the lower row and you land on the meadow: ride back to the start kicker, or to the west-facing kicker under the hill island, which throws you back onto island 1. Miss on the upper row and you drop onto a lower island and ride up again. Fly off the rim and you land on the meadow. The summit rock stops a rider who reaches the top still short of an apple. ENDS: the bank behind the start, the overhanging bank in the east, and the summit rock.

- **07. Windmill Hill:** Steep climbs. Lean forward to keep the front down, and if you stall, roll back, turn and try again with a run-up. Combines momentum, turning and braking. *Also new:* Morning light, more clouds, the farmhouse. (gold 34 s, bot 57.8 s)

  > The steep hill has to be climbed three times. Lean forward so the front wheel stays down, and if you stall, roll back for a longer run-up. Beyond it, take the apple in the valley, turn (Space) and ride back over: the bump at the foot of the hill throws you up onto the ledge for the high apple. Turn once more and climb it again, then splash through the pond to the gate.

- **08. Floating Fields:** Floating islands, tested: launch up to one off a kicker, drop from one onto the next, turn for a run-up to a high one, and keep your height down under a sod roof. A miss lands in the valley and costs a loop, not the run. *Also new:* Fields floating high above the farm, a crow's nest and an island with a sod roof. (gold 55 s, bot 99.2 s)

  > FLOATING FIELDS. A morning ride out over the farm's floating fields and home again. Medium-hard. ROUTE: farmyard start -> kicker A up to Island A (orchard) -> drop onto lower Island B (beehives) -> over kicker 2, up the mesa ramp, turn, roll back and launch west onto high Island C -> keep the speed across C, off its lip into the crow's nest -> turn, drop onto C and climb to the mesa -> mesa kicker onto Island D, under its sod roof -> kicker 4 and three rising islands -> far hill, turn, ride home under every island -> up the steep wall behind the start to the flower floating over the hilltop. Banks with fields beyond close both ends. APPLES (order 1,2,3,5,4,6,7): 1 on A: kicker launch to a higher island. 2 over B: drop from one island onto the next. 3 on C: turn around and use the ramp as a run-up (unreachable without turning). 5 in the nest: the hidden, Elasto-style apple. 4 under D's roof: height control, since a too-high line hits the roof. 6 past the last chain island: three hops, taken in the air as you ride off. 7 low between A and B: picked up on the ride home. The finish wall needs the speed you bring home. RECOVERY: miss A or B and you're in the valley; climb back over kicker A and go again. Miss C or the nest and the mesa ramp is your run-up again. Miss D and you land on the slope below it; ride back up. Miss a chain island and you ride back west for another run at kicker 4. Fall off the finish wall and you take another run across the farmyard. A miss costs a loop, never the run. NISSE: on D's roof. Only a full-speed run from behind kicker 2 lands on it, and then you have to come back round for apple 4.

- **09. High Orchard:** Climbing for height. Five slopes, each taller and steeper than the last, from the cider barn up to a crag above the orchard. Stall, roll back and come down with speed for a longer run-up. *Also new:* A harvest trials day with a crowd, a marshal and a camera tower, on a terraced hillside. (gold 17.5 s, bot 17.4 s)

  > The Orchard finale, staged as a harvest trials day on a terraced hillside: the one where you climb. Five slopes, each taller and steeper than the last, take you from the cider barn up to the crag high above the orchard. 1) The barn yard and a long flat run-up to the first slope (15°, 70 up). Apple 1 on the first terrace among the harvest. 2) The second slope (22°, 100 up). Apple 2 on the second terrace. 3) The third slope (28°, 150 up) to the crowd and the camera tower. 4) The bank drops into a hollow (apple 3) at the foot of the big slope (34°, 290 up). Come down the bank with speed and lean forward, and it goes. Creep into the hollow and gas from a standstill, and the front comes up and the bike goes over. The lesson: roll back, up the bank, and come down it with speed. 5) The meadow at the top: the finish flower at its edge, the marshal and the crowd, the orchard below. 6) The crag (40°, 210 up, in rock) takes the meadow as its run-up. Apple 4 hangs by the lookout on top, the highest point of the trail, and only the climb reaches it. The tor behind it overhangs, so turn around (Space) or roll back, brake down the crag and ride back to the flower. Overshoot it and you roll down the big slope and climb it again. Recovery: a stall on any slope rolls the rider back to the terrace or hollow below, and nothing strands them; a bike that goes over backwards crashes. Skills: climbing (new), momentum and run-ups, turning around, braking. Ends: the cider barn behind the start, the overhanging tor at the top.

## The Woods

*Dirt, `forest` backdrop, cut wood, morning to evening. Teaches balance.*

- **10. Splinter Ridge:** Steeper rollers and sharper crests. Ease off over the top, and lean forward when the front wheel gets light. *Also new:* Dirt, the forest backdrop, pines, cut stumps, roots and moss. (gold 16.5 s, bot 30.3 s)

  > Momentum is your friend. Carry speed through valleys, ease over crests, and lean forward when the front wheel gets light.

- **11. Kickback:** Wheelies. Steep faces lift the front wheel, and leaning controls it. *Also new:* Evening light. (gold 17 s, bot 27.9 s)

  > Steep faces kick the front wheel up. Lean forward to keep it down, or ease off and let it rise into a wheelie and ride it up. The faces get steeper as the evening draws in: 47°, then 52°, a two-step at 50° and 58°, and the last at 60°. If you stall, roll back, take a longer run-up and try again.

- **12. Stoppie Slope:** Steep descents of 45° or more, leaning back so you don't go over the bars. *Also new:* Vines over cliffs. (gold 16 s, bot 7.8 s)

  > Every drop-in is steeper than the last: 40°, 45°, 50° and a long 55° chute. Roll in slowly, lean back (hold the brake and lean away from the slope) so the rear wheel stays planted and you don't go over the bars, then ride it out at the bottom. Speed is the enemy here; the apples at the foot of each slope wait for a rider who arrives in one piece.

- **13. Stump Drops:** Small drops and step-downs, landing rear wheel first. *Also new:* The squirrel, stone dike props. (gold 15 s, bot 14.2 s)

  > Drops and step-downs, from a 40 unit stump ledge to a 90 unit stone dike. Come to each lip slowly, lean back as the front wheel goes over so the bike lands rear wheel first, then let the front come down and ride away down the landing. The steps in the middle are a staircase: roll them one by one. Watch the squirrel at the start.

- **14. Switchback:** Turn around again and again to climb to a tree house, zig-zagging up between ramps. Combines wheelies, steep descents, drops and turning around. *Also new:* Light rain, a tree house at the top. (gold 38 s, bot 35.5 s)

  > Drop in, then climb to the tree house the only way there is: back and forth across the hollow. Each ledge on the west wall is higher than the last, and the faces between them are too steep to climb from a standstill. Ride up the east ramp as high as you can, let the bike roll back, turn (Space) and drive down into the hollow; the speed carries you up and over the next lip. Lean forward on the faces so the wheelie doesn't flip you, and lean back when you ride down them again. Up top, ride the plank onto the tree house.

## The Desert

*Sand, `desert` backdrop, bright noon with sun glare. Teaches air.*

- **15. Dune Hopper:** First air off rounded crests, and using lean to level the bike in the air. *Also new:* Sun glare, cacti. (gold 16 s, bot 29.2 s)

  > First air. Each dune is taller than the last, and with speed its rounded crest lifts you off the ground. In the air, lean to level the bike: lean back if the nose drops, forward if it rises, and land with both wheels on the far slope. The apples float just past the crests, where the bike flies.

- **16. Kicker Canyon:** Kickers, ramps that throw you up, onto downhill landings. *Also new:* Boulders, crystals. (gold 14.5 s, bot 42.0 s)

  > Commit to the jumps. Build speed before each lip, stay calm in the air, and line both wheels up with the far-side slope.

- **17. Sandpit:** Pits with a floor. A short jump is costly but you can recover. *Also new:* Pebbles, the skull and car wreck props. (gold 17 s, bot 8.3 s)

  > Three sand pits, each wider than the last: 120, 150 and 180 units. Hit the kicker with speed and fly to the far lip. Come up short and you land in the pit, which has a floor: ride up the ramp on the far side and carry on, at the cost of time. The apples float over the pits, so only a clean jump gets them on the first try.

- **18. Mind the Gap:** The first open gaps, 80 → 90 → 100 units wide. Falling in ends the run. *Also new:* Warning signs and tyre walls before each gap. (gold 15 s, bot 30.2 s)

  > The first open gaps: 80, 90 and 100 units wide, and falling in ends the run. The tyre walls and signs mark each lip. Ride at the kicker with steady speed, keep the bike level in the air and land on the downslope beyond. Each landing sits a little lower than the takeoff, so speed is enough; don't brake on the lip.

- **19. Mirage:** Apples floating over gaps, and a floating island to jump onto and off. *Also new:* Heat haze. (gold 19 s, bot 21.6 s)

  > The desert finale. Hop the dune for the first apple, then clear the gaps: the apples float in the air above them, so jump high as well as far. The kicker throws you onto a floating island: land on its back slope, collect the apple, and ride off its far edge across a 100 unit gap. The sand pit at the end has a floor, but coming up short costs time.

## Lakeland

*Grass and dirt, `hills` and `mountains` backdrops, morning, rain. Teaches water, and turning around in the air.*

- **20. Wet Feet:** Shallow fords that drag on the bike and slow it down. *Also new:* Reeds, lilies. (gold 15 s, bot 10.9 s)

  > Shallow fords. The water drags on the wheels and slows the bike, so carry speed in and keep the throttle on all the way across. Each ford is wider than the last. If you stop in the middle, just ride on out: shallow water won't hurt you.

- **21. Deep End:** Deep water wipes you out. The first pool has a dry way round, and the second must be cleared with a small hop. *Also new:* Ducks, fish, the floating rider after a crash. (gold 13 s, bot 7.6 s)

  > Deep water wipes you out. The first pool has a dry way round: ride up and over the stone arch, and whatever you do, stay out of the water under it. The second pool is narrow, but it has no way round: hit the little kicker with speed and hop it.

- **22. Jetty Jump:** Jumping over wide deep water. *Also new:* Moderate rain, jetty and rowing boat props. (gold 14 s, bot 11.2 s)

  > Wide, deep water and three jetties to launch from. The open water grows from 150 to 190 and then 230 units, and each far bank sits a little lower than the jetty. Build speed on the bank, stay on the throttle to the end of the planks, and keep the bike level in the air so you land on both wheels on the far bank. Coming up short means a swim.

- **23. Boomerang:** Turning around in the air. Jump off a kicker, turn while airborne, and land facing back onto a ledge above where you took off. *Also new:* A frog on a lily pad. (gold 19.5 s, bot 21.9 s)

  > Turning around in the air, four times, up a tower of ledges. Each kicker curls past vertical, so it throws you straight up and slightly back. Hold the gas all the way in, level the bike as it rises, press turn (Space) near the top and land facing back on the ledge above the run-up. The grass kicker lands you on the dirt ledge, the dirt kicker on the boardwalk, the boardwalk kicker on the stone ledge, and the stone kicker on the summit with the finish. Apples hang in three of the throws, so a full-speed run collects them on the way. A short throw drops you back onto the run-up below.

- **24. Out and Back:** Ride out, collect, turn around, and finish behind where you started. Combines fords, deep water and turning around. *Also new:* Distant thunder. (gold 20 s, bot 23.6 s)

  > The Lakeland finale. Ride out through the ford, hop the deep pool off its lip and splash through the wide ford to the far end. Collect the apple high on the bank, turn around (Space) and ride all the way back: through the ford, over the pool from the other side and past the start to the finish behind it. Thunder rolls in the distance; keep moving.

## Underground

*Rock, back walls, darkness. Teaches tight spaces.*

- **25. Low Bridge:** Overhangs and low ceilings. Keep your head down and don't bounce. *Also new:* Hanging roots, stalactites. (gold 14 s, bot 9.3 s)

  > Into the hillside. The ceiling drops lower the further in you ride: a hanging overhang, a run of rollers under a low roof, a step down with the rock right above the landing, and a long crawl at the end. Keep your head down, don't wheelie, and don't bounce: ride smoothly and lean forward under the low parts. Hit the rock with your head and the run is over.

- **26. Lantern Mine:** The first dark cave, closed off by a back wall. Ride by the headlight and lanterns. *Also new:* The headlight, minecarts, beams, drips. (gold 13 s, bot 6.4 s)

  > The first dark cave. Past the mine mouth the back wall shuts out the daylight, and you ride by your headlight and the lanterns. Take the ramp down, roll off the ledge, ride past the minecarts and climb into the lit chamber at the end. Slow down where it's dark: you can't see what's coming.

- **27. Sinkhole:** Drop from the surface into a cave and climb out of a second exit. The trail has two levels. *Also new:* Bats, glowing mushrooms. (gold 13 s, bot 12.3 s)

  > Two levels. Ride off the edge of the sinkhole and drop into the cave below: land rear wheel first on the slope and roll away under the roof. Ride through the dark past the bats and the glowing mushrooms, then climb the long ramp up through the second opening and back into daylight. The finish is on the surface.

- **28. The Shaft:** Start at the bottom of a cave shaft and climb out by switchbacking between ledges on alternate sides, up to a finish that floats high above. *Also new:* A start below ground, a floating finish. (gold 22 s, bot 61.9 s)

  > You start at the bottom of a mine shaft, and the only way out is up. Kick off the little ramp onto the first ledge, turn around (Space) and jump to the ledge on the other side, a little higher each time. Seven ledges take you to the rim, which juts out over the shaft. Ride left along the top and fly off the last kicker: the finish floats in the air above it.

- **29. The Ring:** The first loop. Combines ceilings, darkness and climbing. *Also new:* A large cavern lit by lanterns. (gold 17 s, bot 40.0 s)

  > The Underground finale. Crawl through the dark, low tunnel with your head down, then drop down the steep slope into the great lantern-lit cavern. Carry that speed into the loop: hold the throttle, keep the wheels on the rock and ride all the way round to collect the apple at the top. Then climb the rock steps on the far side, leaning forward on each face, and ride out through the exit tunnel.

## The City

*Brick, `city` backdrop, any time from a sunny afternoon to night. Teaches hazards.*

- **30. Kerbside:** Step-ups. Pop the front wheel up brick stairs and kerbs with near-vertical faces and crisp corners. *Also new:* Cones, barriers, graffiti. (gold 15 s, bot 45.1 s)

  > Step-ups. Every kerb and stair has a vertical face, so you can't just roll up it: just before the face, lean back and give it a burst of throttle to pop the front wheel up, then lean forward as the rear wheel hits so it climbs over. The kerbs come first, then a flight of three 24 unit stairs, a drop back to the street, and finally four 30 unit stairs up to the plaza.

- **31. Killer Street:** Spikes. First a still spike well off the route, then still spikes on the route with plenty of room. *Also new:* Dumpsters, pigeons. (gold 14 s, bot 12.8 s)

  > Spikes: touch one and the run is over. The first one hangs well above the street, out of your way, so take a look at it. Further on they sit on the route with plenty of room between them: pop the kerb, keep your speed steady, and hop or roll through the gaps. Don't rush.

- **32. Spin Cycle:** Spinning spikes, and spikes hanging under ledges, so you must control how high you go. *Also new:* Scaffolding in front of the rider. (gold 16 s, bot 13.2 s)

  > Spinning spikes and spikes hanging under ledges: this time it's how high you go that matters. Under the ledges, stay low: no wheelies and no big hops. Pop the kerbs gently. Off the ramp, the spinning spikes hang above the landing, so jump long and flat, not high. Time your run past the spinners.

- **33. Night Shift:** The first full night. Street lamps light the route, and apples can only be seen where light reaches them. *Also new:* Lit windows, crane lights. (gold 15 s, bot 27.2 s)

  > The first full night. The street lamps light the route, and between them your headlight is all you have. Apples can only be seen where light reaches them, so some are hiding in the dark between the lamps: ride slowly enough for your headlight to find them. Watch for the spike under the dark stretch after the ramp.

- **34. Brake Point:** Braking under pressure. Brake before steep drops, lean back to resist stoppies, and accelerate cleanly out of bowls. (gold 18 s, bot 37.7 s)

  > Speed alone will not solve this trail. Brake before steep drops, lean back to resist stoppies, and accelerate cleanly out of bowls.

- **35. Rooftops:** Gaps between buildings, with spikes and night. *Also new:* Sponsor banners, the halfway flag. (gold 19 s, bot 20.4 s)

  > The City finale, at night across the rooftops. Fly the gaps between buildings off the low parapets: 90, 100, 100 and 100 units across. Pop up the box on the third roof, mind the spikes and keep away from the spinner above the last gap: jump long, not high. The flag halfway along saves your progress.

- **36. Copenhagen Rooftops:** The City, all at once: kerbs and steps, a scaffold to climb, hops and gaps across the roofs, and a glass roof that breaks under you. A long run where only the gaps between roofs end it. *Also new:* A sunny Copenhagen street drawn from terrain, the spire of Vor Frelsers Kirke and a glass courtyard roof. (gold 56 s, bot 60.8 s)

  > The one where you climb a scaffold off a sunny Copenhagen street, ride the roofs past the spire of Vor Frelsers Kirke and break through a glass courtyard roof to get back down. Route: 1 Street: the kerbs of a side street, a cafe terrace with two steps up and a ramp down. 2 Scaffold: plank ramps up a house under renovation, a pallet of bricks to hop, a missing plank to jump, a long top lift for speed and a kicker to the first roof's gutter (come up short and you hang from it by the front wheel). 3 Roofs: two chimneys to hop, the slate kicker over the gap in front of the church tower, a dormer over a tall chimney, a second dormer up to a balcony, the steep slate above it, a gap down to a roof terrace, and a tall tiled roof to climb on momentum. 4 Courtyard: roll off its gutter onto the glass roof; it breaks and drops you on the loft, and galleries step down to the yard. 5 Out through the carriage arch and up three steps to the flower above the terrace. Apples in order: 1 under the cafe awning (pop the steps). 2 over the missing plank (jump, don't drop in). 3 on the tall chimney (launch off the dormer). 4 on the balcony (a short, precise hop: too long hits the wall, too short lands back on the roof). 5 high over the terrace pergola: ride up the tiled roof, roll back, turn and launch left off the hump (needs the turn; checked with --without turn). 6 in the courtyard under the loft: only reached from above, so turn back for it once down. Recovery: a fall off the scaffold lands on the street, ride up again. Missing the balcony or apple 5 costs time on the roof, not the run. Only the gaps between roofs end it. Look: the street is back walls with glass windows cut in, shops, awnings, balconies and flower boxes; the houses you ride are terrain facades; a second row and the spire rise behind.

## The Mountains

*Snow and rock, `mountains` backdrop, worsening weather. The final tests.*

- **37. Long Way Up:** Endurance. An 800+ unit climb where you must not lose momentum. *Also new:* Light snow (`snow` ≈ 0.3), cairns. (gold 20 s, bot 28.2 s)

  > Link everything together across a long climb: preserve momentum, control wheelies, and recover your balance without losing speed.

- **38. Whiteout:** Fog limits how far ahead you can see, so signs and props mark the route. *Also new:* Heavier snow, the ski lift. (gold 19 s, bot 41.4 s)

  > The fog closes in and you can't see far ahead. Trust the markers: the ski lift pylons run along the route, cairns mark the safe line, and the signs warn of what's coming before you can see it. A drop, a gully, a kicker and a step-up are hidden in the white. Ride at a speed that lets you react.

- **39. Big Air:** Big kickers and gaps of 120–160 units. Air flips are optional, for gold times. *Also new:* A clear high-altitude sky. (gold 11 s, bot 10.0 s)

  > Big kickers and big gaps: 120, 140 and 160 units across, under a clear sky high up the mountain. Roll down the start slope to build speed, keep the throttle on up every kicker and level the bike in the air to land on the downslope. Want gold? Throw an air flip off a kicker: lean hard and come round in time to land on both wheels.

- **40. Thunderhead:** A night storm where lightning lights up the route between flashes. *Also new:* Lightning, heavy rain. (gold 16 s, bot 13.2 s)

  > A night storm on the ridge. It's pitch dark between the lightning flashes: each flash lights up the whole route for a moment, so watch what's ahead and remember it. Pop the rock step, hit the kicker over the 100 unit gap with speed, climb the ridge and roll off the ledge on the far side. The rain makes the rock slippery: go easy on the throttle on the climbs.

- **41. Elastic Summit:** The final exam, with something from every world. *Also new:* The summit flag and a full storm. (bot 34.9 s)

  > The final exam: rolling speed, precise braking, steep climbs, controlled airtime, and enough patience to finish in one piece.

## Not in a world yet

- **42. High Hopes:** Steeper faces that lift the front and throw bigger air. Shift your weight early, then match the landing slope with small leans. (gold 18.5 s, bot 36.5 s)

  > Steeper faces create wheelies and bigger airtime. Shift your weight early, then use small lean inputs to match the landing slope.

## Bonus trails

- **B01. THE BONNY TYLER:** *What it teaches isn't written yet (`lesson`).*

- **B02. The Mining Cave:** *What it teaches isn't written yet (`lesson`).*

  > Technical rock climbing
