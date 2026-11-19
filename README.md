# Hjulben

[![Play Hjulben at h.julben.dk](https://img.shields.io/badge/play-h.julben.dk-ff8952?style=for-the-badge&labelColor=111c20)](https://h.julben.dk)

**Play it in your browser at [h.julben.dk](https://h.julben.dk).**

<p align="center">
  <a href="https://h.julben.dk"><img src="design/readme-preview.png" alt="Hjulben on a phone: the rider at the start of Windfall, under an apple tree, with the on-screen controls below" width="300"></a>
</p>

Hjulben is a small side-scrolling motorcycle trials game inspired by the physics-driven handling of **Elasto Mania**. Build momentum over rolling terrain, shift the rider's weight, control wheelies and stoppies, collect every apple, and reach the finish flag without putting the rider's helmet into the ground.

It runs in the browser with no build step and no runtime dependencies, built with native JavaScript modules, Canvas rendering, and custom bike physics.

## Features

- Momentum-driven handling: throttle on the rear wheel, weight shifts, wheelies, stoppies and flips, on suspension that soaks up every landing
- Crashes with a ragdoll rider who keeps the bike's spin
- A career of trails that grow longer and harder, with gaps, caves, water and floating blocks, plus bonus trails outside it, often made by other riders
- Gold, silver and bronze medal times on every trail
- A ghost of your best run or the world's best, with split times at each apple, and the world rider just ahead of you to race
- Replays of your own runs and of the best runs on the world board
- A world leaderboard for online riders, who sign up with a passkey and get their progress back on any device
- Achievements for career milestones and stunts
- Weather and a full day cycle on every trail: sun, fog, rain, snow, lightning and wind, from dawn to night, with a headlight for dark caves
- Water to ride through: shallow fords slow the bike, deep water wipes the rider out
- Procedural sound effects, and chiptune music with a mood for each world
- A visual trail editor, with share links that open a trail straight in the game
- Keyboard, touch and gamepad controls

## Controls

| Action                           | Keyboard                                  | Touch                                        |
| -------------------------------- | ----------------------------------------- | -------------------------------------------- |
| Gas                              | `Up Arrow` or `W`                         | Gas button                                   |
| Brake                            | `Down Arrow` or `S`                       | Brake button                                 |
| Lean backward / forward          | `Left Arrow` / `Right Arrow` or `A` / `D` | Lean buttons                                 |
| Flip riding direction            | `Space`                                   | —                                            |
| Headlight on / off               | `L`                                       | Lights button in the control area            |
| Restart trail                    | `R`                                       | Retry under the crash notice, or in the menu |
| Pause / resume                   | `P`                                       | Pause button                                 |
| Open / close the main menu       | `Escape`                                  | In-game menu button                          |
| Toggle fullscreen                | `F`                                       | Fullscreen On/Off in Settings                |

Every keyboard action can be rebound under **Settings → Keys**. Holding restart freezes the bike until you let go, so you can line up a clean start.

Gamepads use the standard mapping: `RT` or `A` for gas, `LT` or `X` for brake, the left stick or d-pad to lean, `B` to turn around, d-pad up for the headlight, `Y` to restart, and `Start` to pause. In menus, the d-pad or stick moves the selection, `A` confirms, and `B` goes back.

## Trails

Every apple must be collected before the finish gate opens, and finishing a trail unlocks the next. The career starts with gentle rollers that teach throttle rhythm and balance, then builds through turning around, steep climbs, committed jumps, hard braking, caves, water and weather to long technical trails that combine everything.

- [`TRAILS.md`](./TRAILS.md): the career trail by trail, with what each one teaches
- [`TRAILS_GUIDE.md`](./TRAILS_GUIDE.md): how the career is designed, and the rules every trail follows
- [`EDITOR.md`](./EDITOR.md): building your own trails in the editor
- [`TRAIL_FORMAT.md`](./TRAIL_FORMAT.md): the trail file format

## Online riders

When creating a rider, players choose **Online** (the default) or **Offline**. Online riders sign up with a **passkey** (fingerprint, face or device PIN), with no email or password. Their name is reserved on the world leaderboard, and their progress is backed up, so logging in with the same passkey brings it back after clearing site data or on another device. Offline riders stay in the browser and can go online later.

The world board doesn't trust times sent by the browser: the server replays every run through the same simulation and uses its own time.

## Running locally

```sh
npm run dev
```

This serves the game at `http://127.0.0.1:8080` (set `PORT` to change it) and lets the editor save trail files. A server is needed because browsers block JavaScript modules and trail files on `file://`; any static server works for just playing. Development needs Node.js 26 and npm; see [`CONTRIBUTING.md`](./CONTRIBUTING.md) for setup, testing, the code layout and releasing.

## Browser support

| Browser                    | Minimum version |
| -------------------------- | --------------- |
| Safari (macOS, iOS/iPadOS) | 18.4            |
| Chrome, Edge               | 140             |
| Firefox                    | 140             |

## Inspiration

Hjulben is inspired by the momentum, balance, and risk-reward handling of **Elasto Mania**. It is an original game and is not affiliated with or endorsed by the creators of Elasto Mania.
