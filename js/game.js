// The game loop and state machine: loads trails, steps the ride at a fixed
// rate, turns ride events into sound, effects and UI, and saves results.
import { STEP, MAX_STEPS_PER_FRAME, clamp } from './config.js';
import { trails, officialTrailEntries, bonusTrailEntries, customTrailEntries, readPlaytestTrail, reportEditorFeat, takeEditorFeats, EDITOR_FEATS_KEY, PLAYTEST_EXIT_MESSAGE, devServerWritable } from './trails.js';
import { createAudio, skidAmount } from './audio.js';
import { createPhysicsDebugger } from './physics-debug.js';
import { createFpsMeter } from './fps-meter.js';
import { terrainAt } from './terrain.js';
import { createRide, stepRide, bikeSpeed, interpolateRide, RIDE_VERSION } from './ride.js';
import { encodeInputs, decodeInputs } from './replay-codec.js';
import { medalFor, normalizeTrail } from './trail-schema.js';
import {
  readBest, saveBest, readLeaderboard, recordLeaderboardRun, readGhost, saveGhost,
  saveProgress as persistProgress, savePreferences, clearSaveToken, renewSaveToken, recordAchievements, recordNisse,
  pruneStaleTrailData, STORAGE_FAILED_EVENT
} from './storage.js';
import { bikeBroken, createFeatTracker, editorProgress, eggAchievements, eventAchievements, finishAchievements, interactAchievements, newlyEarned, statGains } from './achievements.js';
import { createLimWatcher, installConsoleCheats } from './easter-eggs.js';
import { submitOnlineRun, fetchWorldGhost, refreshOnlineBoard, cachedOnlineBoard, queuePendingRun, dropPendingRun, flushPendingRuns } from './online-leaderboard.js';
import { queueSaveSync, SIGNED_OUT_EVENT, SESSION_RENEWED_EVENT } from './account.js';
import { createInput, keyLabel } from './input.js';
import { createHaptics } from './haptics.js';
import { createCamera } from './camera.js';
import { createEffects } from './effects.js';
import { createFireworks } from './fireworks.js';
import { offerUpdate, reloadNow, setUpdatePrompt, updatePromptOpen } from './update-prompt.js';
import { createRenderer } from './render.js';
import { createDebugHud } from './debug-hud.js';
import { riderPalette } from './drawing.js';
import { gearCard, legacyRider, lookOf, lookParts, newlyUnlockedItems } from './cosmetics.js';
import { createOverlay } from './ui/overlay.js';
import { keyChoices, keyTextNodes } from './ui/key-text.js';
import { createMenu, loadStoredState } from './ui/menu.js';
import { $, session, currentTrailEntry, trailKey, nisseKey, timeText, isRankedSource, bonusUnlock, riderLook, progressOf } from './state.js';
import { isNight } from './time-of-day.js';

const LANDING_SOUND_IMPACT = 45;
const HARD_LANDING_IMPACT = 170;
const CRASH_COLORS = { spike: '#d95832', head: '#ed8b54', fall: '#ed8b54', water: '#8fd6e8' };

/**
 * @param {{ shared?: { entry?: any, error?: Error } | null }} [options]
 *   `shared`: the trail a share link opened (see trail-link.js), or why it couldn't.
 */
export function startGame({ shared = null } = {}) {
  const game = $('game');
  const renderer = createRenderer(/** @type {HTMLCanvasElement} */ ($('canvas')));
  const camera = createCamera();
  const effects = createEffects();
  // Looked up when a rocket goes up, as the sounds are made further down.
  const fireworks = createFireworks({ onLaunch: (x, flight) => sounds.fireworkLaunch(x, flight), onBurst: x => sounds.fireworkBurst(x) });
  // Results closed by the browser (a second Escape, a phone's back gesture)
  // go to the menu, where the ride can be picked up again.
  const overlay = createOverlay({ onDismiss: () => { if (session.state === 'won' && !menu.isOpen()) showMainMenu(); } });
  // The rider's hand on the grip, ahead of the physics' smoothed throttle.
  let gasHeld = false;
  const sounds = createAudio(() => {
    const ride = session.ride;
    return {
      state: session.state, rear: ride?.rear, front: ride?.front, engine: ride?.vehicle.engine, gas: gasHeld && session.state === 'running', started: ride?.started ?? false,
      brakePressure: ride?.brakePressure ?? 0, weather: session.trail?.weather,
    };
  });
  const input = createInput({
    element: game,
    buttons: [...document.querySelectorAll('[data-action]')],
    indicators: [...document.querySelectorAll('[data-shows]')],
    isActive: () => session.state === 'running' && !menu.isOpen(),
    onPress: handlePress
  });
  const menu = createMenu({
    sounds, input,
    onStartTrail: index => startSelectedTrail(() => loadTrail(index)),
    onStartBonus: index => startSelectedTrail(() => loadBonusTrail(index), false),
    onStartCustom: index => startSelectedTrail(() => loadCustomTrail(index), false),
    onClose: closeMainMenu,
    // The back gesture mid-ride: the menu, which pauses the ride, as Escape does.
    onBack: () => { sounds.escape(); showMainMenu(); },
    riderOnScreen: () => renderer.riderOnScreen(),
    onWatchReplay: watchReplay,
    onPreferences: applyPreferences,
    // Editor achievements wait for a rider, so a new or newly picked one gets
    // them, and a rider just logged in sends the runs that waited for them.
    onRiderChange: () => { claimEditorFeats(); flushPendingRuns(tokenFor); }
  });

  const params = new URLSearchParams(window.location.search);
  // ?debug=1 turns on every debugging aid: the frame-rate meter, the readout
  // of the ride, the physics overlay and traces, and the console tools.
  const debugEnabled = params.get('debug') === '1';
  const viewport = /** @type {Element} */ (document.querySelector('.viewport'));
  const fpsMeter = debugEnabled ? createFpsMeter(viewport) : null;
  const debugHud = debugEnabled ? createDebugHud(viewport) : null;
  /** The latest step's dynamics, for the debug readout. */
  let lastDynamics = null;
  const physicsDebug = createPhysicsDebugger({
    enabled: debugEnabled,
    step: STEP,
    inspectPoint(point, round) {
      const ground = terrainAt(session.trail, point.x, point.y);
      return {
        groundY: round(ground.y),
        slope: round(ground.slope)
      };
    }
  });
  const debugHooks = debugEnabled ? {
    dynamics: values => { lastDynamics = values; physicsDebug.recordDynamics(values); },
    afterIntegration: () => physicsDebug.capture('afterIntegration', session.ride.rear, session.ride.front),
    iteration: value => physicsDebug.setIteration(value),
    constraint: correction => physicsDebug.recordConstraint(correction, session.ride.rear, session.ride.front),
    contact: value => physicsDebug.recordContact(value),
    contactsResolved: () => physicsDebug.recordContactsResolved(session.ride.rear, session.ride.front),
    traction: (wheelName, result, point) => physicsDebug.recordTraction(wheelName, result, point)
  } : undefined;

  if (debugEnabled) {
    // Reaching in from the console is an easter egg (see achievements.js).
    window.hjulbenGame = {
      get ride() { egg('debug-console'); return session.ride; },
      get ghost() { egg('debug-console'); return ghost; },
      get state() { return session.state; },
      // Copies the current attempt (trail, seed and every step's input) so it
      // can be replayed exactly outside the browser.
      dumpRun() {
        const ride = session.ride;
        const run = JSON.stringify({ physics: RIDE_VERSION, seed: ride?.seed, trail: session.trail, inputs: encodeInputs(recorded) });
        console.log('[Hjulben] Run JSON:\n' + run);
        navigator.clipboard?.writeText(run).then(() => console.log('[Hjulben] Copied the run.'), () => {});
        return run;
      },
      // The fireworks for a new world record, which the dev server's empty
      // board never sets off.
      celebrate() { celebrateRecord(); }
    };
    // In the editor's play test, the same tools also answer from the editor
    // page's console, so there is no frame to pick.
    if (window.parent !== window) {
      try {
        Object.assign(window.parent, { hjulbenGame: window.hjulbenGame, hjulbenPhysicsDebug: globalThis.hjulbenPhysicsDebug });
      } catch {}
    }
  }

  let lastTime = 0, accumulator = 0, landingSoundCooldown = 0, splashSoundCooldown = 0, suspensionSoundCooldown = 0;
  // A paused scene is still, as is the scene behind the results once it has
  // settled, so it is only redrawn when something changes it.
  let redraw = true;
  /** Inputs of the current attempt, one per step, for saving a ghost. */
  let recorded = [], startStep = 0, flips = 0;
  /** Whether the current attempt's physics has come apart, for Here Be Kraken. */
  let broken = false;
  // Attempts that got going since the trail was opened from the menu or Next
  // Trail, for achievements such as First Try.
  let attempts = 0, openingTrail = false;
  // How much of the attempt was simulated against the time that passed. A
  // device too slow for the fixed step drops time (see frame()), which plays
  // in slow motion: more time to react per simulated second, so such a run
  // is kept on the device but not posted to the world board.
  let simulatedTime = 0, passedTime = 0;
  const SLOW_MOTION_RATIO = .9;
  /** Time in the air and on one wheel during the current attempt, for achievements. */
  const feats = createFeatTracker(STEP);
  /** @type {{ ride: any, inputs: any[], index: number, data: any } | null} */
  let ghost = null;
  /**
   * A recorded run being played back instead of the player's input: its
   * trail, inputs and rider. Nothing a replay does is saved or earned.
   * @type {{ source: string, index: number, data: any, inputs: any[], step: number, look: any, name: string } | null}
   */
  let replay = null;
  /** The last finished run, for Watch Replay on the results. */
  let lastRun = null;
  // Set when this run ended the career, until its results' Roll Credits button is used.
  let creditsAfterResults = false;
  let wakeLock = null;
  const playtestData = readPlaytestTrail();
  const playtestTrail = playtestData ? normalizeTrail(playtestData) : null;
  /** Best play-test run; kept in memory so edited trails never reach saved ghosts or leaderboards. */
  let playtestBest = null;

  // --- Device features -----------------------------------------------------

  // Phones and tablets without a mouse, where prompts name the on-screen buttons.
  const touchScreen = window.matchMedia('(hover: none) and (pointer: coarse)');

  /**
   * The keys prompts name, for what the player is using: the gamepad's
   * buttons, their own key bindings, or none on a touch screen. `pause` lists
   * every key that resumes, as Esc does too on a keyboard.
   */
  function promptKeys() {
    if (input.activeGamepad()) return { confirm: 'A', restart: 'Y', pause: ['Start'] };
    if (touchScreen.matches) return { confirm: '', restart: '', pause: [] };
    const { bindings } = session.preferences;
    return {
      confirm: 'Enter',
      restart: keyLabel(bindings.restart[0] || 'KeyR'),
      pause: [...bindings.pause.slice(0, 1).map(keyLabel), 'Esc'],
    };
  }

  /** How to leave the pause screen. A tap anywhere on it works everywhere. */
  function pauseHint() {
    const { pause } = promptKeys();
    return pause.length ? ['Press ', ...keyChoices(pause), ' to resume'] : 'Tap to resume';
  }

  // Phone vibration and gamepad rumble. Watching a replay is not riding, so it stays still.
  const haptics = createHaptics({
    phoneEnabled: () => !replay && session.preferences.haptics === 'on',
    padEnabled: () => !replay && session.preferences.rumble === 'on',
    gamepad: () => input.activeGamepad(),
  });

  async function holdWakeLock(wanted) {
    if (!('wakeLock' in navigator)) return;
    if (wanted && !wakeLock && document.visibilityState === 'visible') {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } catch (_) { wakeLock = null; }
    } else if (!wanted && wakeLock) {
      const lock = wakeLock;
      wakeLock = null;
      lock.release().catch(() => {});
    }
  }

  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

  // A phone turned sideways shows the "turn your phone upright" screen over
  // the game (see .turn-upright), so a ride pauses until it is turned back.
  const sideways = window.matchMedia('(orientation: landscape) and (pointer: coarse) and (max-height: 500px)');
  sideways.addEventListener('change', () => { if (sideways.matches) pauseGame(); });

  // True only while an in-game action (F, Settings) is turning fullscreen off.
  let fullscreenExitRequested = false;

  function toggleFullscreen() {
    if (!menu.isOpen()) sounds.menuSelect();
    const leaving = Boolean(fullscreenElement());
    const action = leaving
      ? (document.exitFullscreen?.bind(document) || document.webkitExitFullscreen?.bind(document))
      : (game.requestFullscreen?.bind(game) || game.webkitRequestFullscreen?.bind(game));
    if (!action) return;
    fullscreenExitRequested = leaving;
    const result = action();
    if (result?.catch) result.catch(() => { fullscreenExitRequested = false; });
  }

  function syncFullscreenSetting() {
    const on = Boolean(fullscreenElement());
    document.querySelectorAll('[data-fullscreen]').forEach(button => {
      button.setAttribute('aria-pressed', String((button.dataset.fullscreen === 'on') === on));
    });
  }

  function setEscapeLock(on) {
    // Keyboard Lock API (Chromium only). Without it, Esc always exits fullscreen.
    const keyboard = /** @type {any} */ (navigator).keyboard;
    if (!keyboard?.lock) return;
    if (on) keyboard.lock(['Escape']).catch(() => {});
    else keyboard.unlock();
  }

  function handleFullscreenChange() {
    const on = Boolean(fullscreenElement());
    syncFullscreenSetting();
    setEscapeLock(on);
    if (!on) {
      const requested = fullscreenExitRequested;
      fullscreenExitRequested = false;
      // Esc (or the browser's own UI) left fullscreen: treat it like Esc in-game.
      if (!requested && !menu.isOpen() && session.gameLoopStarted) {
        // A playtest ride only pauses; showMainMenu() would exit to the editor.
        if (session.trailSource === 'playtest') pauseGame();
        else { sounds.escape(); showMainMenu(); }
      }
    }
    // Phones are played upright, so the touch controls fit under the trail;
    // locking only works while fullscreen.
    if (coarsePointer && screen.orientation) {
      try {
        if (on) screen.orientation.lock?.('portrait').catch(() => {});
        else screen.orientation.unlock?.();
      } catch (_) {}
    }
    requestAnimationFrame(() => { resize(); menu.drawBackground(); });
  }

  // --- Preferences and progress --------------------------------------------

  function applyPreferences() {
    const { preferences } = session;
    session.look = riderLook();
    $('control-area').hidden = preferences.controls === 'hide';
    sounds.setVolume(preferences.volume / 100);
    syncSound();
    input.setBindings(preferences.bindings);
    renderer.setInteractKey(preferences.bindings.interact?.[0] ? keyLabel(preferences.bindings.interact[0]) : '');
    if (preferences.ghost === 'off') ghost = null;
    syncHeadlight();
  }

  function syncHeadlight() {
    const on = session.preferences.headlight !== 'off';
    redraw = true;
    renderer.setHeadlights(on);
    $('headlight').setAttribute('aria-pressed', String(on));
  }

  /** Uses whatever the rider is close enough to interact with (see interactions.js). */
  function interact() {
    const result = renderer.interact();
    if (!result) return;
    if (result.sound) sounds[result.sound]?.();
    if (result.announce) overlay.announce(result.announce);
    if (result.type) earn(interactAchievements(result.type));
  }

  /** Achievements from an easter egg (see easter-eggs.js). */
  function egg(name) {
    earn(eggAchievements(name));
  }

  /**
   * Gives the active rider the Trail Maker achievements for what the editor
   * did since. They wait for a rider, and play-tests leave them for the game.
   */
  function claimEditorFeats() {
    if (!session.saveGame || playtestTrail) return;
    const { ids, gains } = editorProgress(takeEditorFeats());
    earn(ids, gains);
  }

  /** Lifetime stats and achievements from a ride event or feat. */
  function trackAchievements(event) {
    const gains = statGains(event), ids = eventAchievements(event);
    if (gains || ids.length) earn(ids, gains ?? {});
  }

  /**
   * Gives the active save the achievements in `ids` and adds `gains` to its
   * lifetime stats, then announces every achievement that is new since
   * `before`, including career and stat ones the change completed, and the
   * gear the run or those achievements won. Without a
   * save nothing is kept: achievements belong to a rider. Editor play-tests
   * never count, like their times.
   * @param {string[]} ids
   * @param {Record<string, number>} [gains]
   */
  function earn(ids, gains = {}, before = progressOf(session.saveGame)) {
    const { saveGame } = session;
    if (!saveGame || !before || session.trailSource === 'playtest' || replay) return;
    const fresh = ids.filter(id => !before.has(id));
    if (fresh.length || Object.keys(gains).length) {
      const updated = recordAchievements(session.activeSaveSlot, trails.length, fresh, gains);
      if (updated) Object.assign(saveGame, updated);
    }
    const after = progressOf(saveGame);
    const earned = newlyEarned(before, after);
    for (const achievement of earned) overlay.achievement(achievement);
    // The gear the run or those achievements won (see unlocks.js), for the Garage.
    const won = newlyUnlockedItems(before, after);
    for (const item of won) overlay.gear(gearCard(item));
    // Earned in the menu: its "earned" count is on screen.
    if ((earned.length || won.length) && menu.isOpen()) menu.updateDashboard();
    if (fresh.length || Object.keys(gains).length || earned.length) queueSaveSync(saveGame);
  }

  /**
   * Remembers that the rider found this trail's nisse, then gives them any
   * career achievement that completes (finding every official one). Like
   * achievements it belongs to a rider, and play-tests and replays don't count.
   */
  /** Whether the active rider has already found this trail's nisse. A playtest always shows it. */
  function nisseFound() {
    if (session.trailSource === 'playtest') return false;
    const entry = currentTrailEntry();
    return Boolean(entry && session.saveGame?.nisse?.[nisseKey(entry)]);
  }

  function findNisse() {
    const { saveGame } = session;
    if (!saveGame || session.trailSource === 'playtest' || replay) return;
    const entry = currentTrailEntry();
    if (!entry) return;
    const before = progressOf(saveGame);
    const key = nisseKey(entry);
    if (!recordNisse(session.activeSaveSlot, trails.length, key)) return;
    saveGame.nisse = { ...saveGame.nisse, [key]: Date.now() };
    earn([], {}, before);
    queueSaveSync(saveGame);
  }

  /**
   * The achievements a run that just reached the finish earns, given the best
   * time on the trail before it and the world-best time.
   */
  function finishedRunAchievements(ride, previousBest, worldBest) {
    const { medals, weather, timeOfDay } = session.trail;
    return finishAchievements({
      flips, time: ride.elapsed, medal: medalFor(medals, ride.elapsed), gold: medals?.gold ?? null,
      helmet: lookParts(session.look).helmet, bike: session.look.bike,
      night: isNight(timeOfDay), rain: (weather?.rain ?? 0) > 0, snow: (weather?.snow ?? 0) > 0,
      attempts, previousBest, worldBest, custom: session.trailSource === 'custom',
      shared: session.trailSource === 'custom' && currentTrailEntry()?.shared === true
    });
  }

  function syncSound() {
    const on = session.preferences.sound === 'on';
    sounds.setEnabled(on);
    $('sound-control').setAttribute('aria-pressed', String(on));
  }

  function toggleSound() {
    session.preferences.sound = session.preferences.sound === 'on' ? 'off' : 'on';
    savePreferences(session.preferences);
    syncSound();
  }

  function toggleHeadlight() {
    const on = session.preferences.headlight === 'off';
    session.preferences.headlight = on ? 'on' : 'off';
    savePreferences(session.preferences);
    syncHeadlight();
    sounds.headlight(on);
  }

  function saveProgress() {
    const { saveGame } = session;
    if (!saveGame || session.trailSource !== 'official') return;
    session.savedTrail = session.trailIndex;
    saveGame.trail = session.trailIndex;
    // The open trails are worked out from the finished ones (unlockedOf in
    // state.js); the place is still saved for a client from before that.
    saveGame.unlocked = session.unlockedTrail;
    session.saveSlots[session.activeSaveSlot] = saveGame;
    persistProgress(session.activeSaveSlot, session.trailIndex, session.unlockedTrail, trails.length);
    queueSaveSync(saveGame);
  }

  // --- Trails ----------------------------------------------------------------

  /** 'on' races your own best run; 'world' the fastest of that and the world's best. */
  function loadGhost(trail) {
    ghost = null;
    const mode = session.preferences.ghost;
    if (mode === 'off') return;
    useGhost(trail, session.trailSource === 'playtest' ? playtestBest : readGhost(trailKey(currentTrailEntry())));
    if (mode !== 'world' || !isRankedSource(session.trailSource)) return;
    const ride = session.ride;
    fetchWorldGhost(trailKey(currentTrailEntry())).then(world => {
      // The player may have restarted, switched trail or changed the setting meanwhile.
      if (!world || session.ride !== ride || session.preferences.ghost !== 'world') return;
      if (ghost && ghost.data.time <= world.time) return;
      // Steps the ghost would already have taken alongside the player.
      useGhost(trail, world, ride.started ? recorded.length - startStep : 0);
    });
  }

  function useGhost(trail, data, catchUp = 0) {
    if (!data || data.physics !== RIDE_VERSION) return;
    const inputs = decodeInputs(data.inputs);
    // Ghosts from before looks existed were always drawn as the player.
    const look = data.look || data.rider ? lookOf(data) : session.look;
    const ride = createRide(trail, { seed: data.seed, helmet: lookParts(look).helmet });
    // Play the idle lead-in now so the ghost sets off with the player.
    const lead = Math.min(data.startStep + catchUp, inputs.length);
    for (let index = 0; index < lead; index++) stepRide(ride, inputs[index]);
    ghost = { ride, inputs, index: lead, data, look };
  }

  function initializeTrail(trail, marker) {
    if (openingTrail) attempts = 0;
    openingTrail = false;
    feats.reset();
    session.trail = trail;
    const seed = replay ? replay.data.seed : (Math.random() * 2 ** 31) >>> 0;
    const ride = createRide(trail, { seed, helmet: lookParts(replay?.look ?? session.look).helmet });
    // Once found, the nisse is gone from the trail for this rider, on every
    // ride after. Replays still show the run as it was ridden.
    if (!replay && nisseFound()) ride.nisse = null;
    session.ride = ride;
    recorded = []; startStep = 0; flips = 0; broken = false; simulatedTime = 0; passedTime = 0;
    accumulator = 0; landingSoundCooldown = 0; splashSoundCooldown = 0; suspensionSoundCooldown = 0;
    effects.reset(trail);
    renderer.reset(trail, ride.facing);
    camera.reset();
    if (replay) ghost = null;
    else loadGhost(trail);
    // The world board's best time, ready for Ghostbuster when the run finishes.
    if (isRankedSource(session.trailSource)) refreshOnlineBoard(trailKey(currentTrailEntry()));
    // Keys and buttons still held carry over, so gas held through a restart
    // sets off at once, and restart held keeps the bike on the line.
    input.paint();
    overlay.setDirection(ride.facing);
    overlay.setTrail(trail.name, marker, ride.apples.length, trail.medals);
    overlay.setReplay(replay?.name ?? null);
    overlay.setTimer(0);
  }

  function loadTrail(index) {
    index = clamp(index, 0, session.unlockedTrail);
    session.trailSource = 'official'; session.bonusTrailIndex = -1; session.customTrailIndex = -1; session.trailIndex = index;
    initializeTrail(trails[index], String(index + 1).padStart(2, '0'));
    saveProgress();
  }

  function loadBonusTrail(index) {
    const entry = bonusTrailEntries[index];
    // A locked bonus trail stays shut, even if the menu was bypassed.
    if (!entry || !bonusUnlock(entry).open) return;
    session.trailSource = 'bonus'; session.bonusTrailIndex = index; session.customTrailIndex = -1;
    initializeTrail(entry.trail, `B${String(index + 1).padStart(2, '0')}`);
  }

  function loadCustomTrail(index) {
    const entry = customTrailEntries[index];
    if (!entry) return;
    session.trailSource = 'custom'; session.bonusTrailIndex = -1; session.customTrailIndex = index;
    initializeTrail(entry.trail, `C${String(index + 1).padStart(2, '0')}`);
  }

  // --- Replays --------------------------------------------------------------

  /**
   * Plays back a recorded run (inputs, seed and lead-in, as saved for a ghost)
   * on one of the trails. `entry` is the trail's catalog entry; without one,
   * the trail being ridden now.
   */
  function watchReplay({ entry = null, data, name }) {
    if (!data || data.physics !== RIDE_VERSION) return;
    const source = entry ? entry.source : session.trailSource;
    const index = !entry ? currentIndex()
      : source === 'official' ? officialTrailEntries.indexOf(entry)
        : source === 'bonus' ? bonusTrailEntries.indexOf(entry)
          : customTrailEntries.indexOf(entry);
    if (index < 0 && source !== 'playtest') return;
    // Ghosts from before looks existed were always drawn as the player.
    const look = data.look || data.rider ? lookOf(data) : session.look;
    replay = { source, index, data, inputs: decodeInputs(data.inputs), step: 0, look, name: name || 'Replay' };
    menu.close();
    setMenuOpen(false);
    session.rideSaveId = session.saveGame?.createdAt ?? null;
    session.gameLoopStarted = true;
    restartReplay();
  }

  function currentIndex() {
    return session.trailSource === 'bonus' ? session.bonusTrailIndex
      : session.trailSource === 'custom' ? session.customTrailIndex
        : session.trailSource === 'playtest' ? 0 : session.trailIndex;
  }

  function restartReplay() {
    const { source, index } = replay;
    session.trailSource = source;
    session.bonusTrailIndex = source === 'bonus' ? index : -1;
    session.customTrailIndex = source === 'custom' ? index : -1;
    if (source === 'official') session.trailIndex = index;
    const trail = source === 'official' ? trails[index]
      : source === 'bonus' ? bonusTrailEntries[index].trail
        : source === 'custom' ? customTrailEntries[index].trail : playtestTrail;
    const marker = source === 'playtest' ? 'TEST'
      : (source === 'bonus' ? 'B' : source === 'custom' ? 'C' : '') + String(index + 1).padStart(2, '0');
    initializeTrail(trail, marker);
    // Skip the wait before the rider set off.
    replay.step = 0;
    const lead = Math.min(replay.data.startStep || 0, replay.inputs.length);
    while (replay.step < lead) stepRide(session.ride, replay.inputs[replay.step++]);
    setState('running');
    focusGame();
  }

  function endReplay() {
    replay = null;
    overlay.setReplay(null);
  }

  function finishReplay() {
    setState('won');
    $('crash-retry').hidden = false;
    // Focused, so Enter rides the trail, as it continues from the results.
    $('crash-retry').focus({ preventScroll: true });
    const { restart } = promptKeys();
    overlay.toast(restart ? ['Replay finished · Press ', { key: restart }, ' to ride this trail'] : 'Replay finished', Infinity);
    overlay.announce('Replay finished. ' + (restart ? 'Press ' + restart + ' or select' : 'Select') + ' Ride This Trail to ride it yourself.');
  }

  /**
   * Leaves a replay for a ride of your own on its trail. It counts as more
   * attempts on the trail, not a fresh opening, so watching a replay doesn't
   * hand out First Try.
   */
  function rideAfterReplay() {
    const { source, index } = replay;
    endReplay();
    // An official trail still needs a rider who has got that far.
    if (source === 'official' && (!session.saveGame || index > session.unlockedTrail)) {
      showMainMenu();
      overlay.toast(session.saveGame ? 'That trail is still locked · Finish the ones before it first' : 'Pick a rider to ride the trails', 5000);
      return;
    }
    startFresh();
  }

  function loadPlaytestTrail() {
    session.trailSource = 'playtest'; session.bonusTrailIndex = -1; session.customTrailIndex = -1;
    initializeTrail(playtestTrail, 'TEST');
  }

  function exitPlaytest() {
    input.clear();
    pauseGame();
    if (window.parent !== window) window.parent.postMessage({ type: PLAYTEST_EXIT_MESSAGE }, window.location.origin);
    else window.location.href = './editor.html';
  }

  // --- State machine ---------------------------------------------------------

  function setState(next) {
    session.state = next;
    redraw = true;
    // Held controls stay held through a restart or a crash; only leaving the
    // ride (the menu, losing focus) lets go of them, so a key released while
    // the game wasn't listening can't stay stuck.
    input.paint();
    if (next !== 'won') { overlay.hide(); fireworks.stop(); }
    $('crash-retry').hidden = next !== 'ragdoll';
    $('crash-retry').textContent = replay ? 'Ride This Trail' : 'Retry';
    overlay.showPause(next === 'paused', pauseHint());
    holdWakeLock(next === 'running' || next === 'ragdoll');
  }

  const focusGame = () => game.focus({ preventScroll: true });

  function startFresh() {
    // Retry means riding: during or after a replay it starts the rider's own run.
    if (replay) { rideAfterReplay(); return; }
    if (session.trailSource === 'playtest') loadPlaytestTrail();
    else if (session.trailSource === 'bonus') loadBonusTrail(session.bonusTrailIndex);
    else if (session.trailSource === 'custom') loadCustomTrail(session.customTrailIndex);
    else loadTrail(session.trailIndex);
    setState('running'); focusGame();
  }

  function pauseGame() { if (session.state === 'running') { setState('paused'); haptics.stop(); } }
  function resumeGame() {
    if (session.state !== 'paused') return;
    setState('running'); focusGame();
  }
  function togglePause() { session.state === 'paused' ? resumeGame() : pauseGame(); }

  function flipDirection() {
    const ride = session.ride;
    const airborne = !ride.rear.grounded && !ride.front.grounded;
    ride.facing *= -1;
    overlay.setDirection(ride.facing);
    sounds.flip(airborne);
  }

  function showMainMenu() {
    if (session.trailSource === 'playtest') { exitPlaytest(); return; }
    if (session.state !== 'menu') session.stateBeforeMenu = session.state;
    session.state = 'menu';
    input.clear();
    haptics.stop();
    overlay.hide();
    fireworks.stop();
    $('crash-retry').hidden = true;
    holdWakeLock(false);
    setMenuOpen(true);
    menu.open();
    offerUpdate();
    // A good moment to send runs that couldn't be posted when they were ridden.
    flushPendingRuns(tokenFor).then(sent => { if (sent) overlay.toast(sent === 1 ? 'Posted a waiting run to the world board' : `Posted ${sent} waiting runs to the world board`, 4000); });
  }

  /** The session token of a rider on this device, for posting their runs. */
  function tokenFor(playerId) {
    return session.saveSlots.find(save => save?.playerId === playerId)?.token ?? null;
  }

  function setMenuOpen(open) {
    game.classList.toggle('menu-open', open);
  }

  function closeMainMenu() {
    if (!menu.canResume()) return;
    menu.close();
    setMenuOpen(false);
    focusGame();
    const previous = session.stateBeforeMenu;
    if (previous === 'ragdoll') setState('ragdoll');
    else if (previous === 'won') {
      // Reopen the results as they were; finishing again would save the run twice.
      setState('won');
      if (!replay) overlay.reopen();
    } else setState(previous === 'paused' ? 'paused' : 'running');
  }

  function startSelectedTrail(load, requiresSave = true) {
    if (requiresSave && !session.saveGame) return;
    endReplay();
    menu.close();
    setMenuOpen(false);
    menu.markRideStarted();
    openingTrail = true;
    load();
    setState('running');
    focusGame();
    session.gameLoopStarted = true;
  }

  function handlePress(action) {
    // A new release waits for its reload; a pad can only confirm it.
    if (updatePromptOpen()) {
      if (action === 'confirm') reloadNow();
      return;
    }
    if (menu.isOpen()) {
      if (action === 'menu' || action === 'pause') closeMainMenu();
      else menu.handlePad(action);
      return;
    }
    const { state } = session;
    if (action === 'restart') startFresh();
    else if (action === 'pause') { if (state === 'running' || state === 'paused') togglePause(); }
    else if (action === 'menu') { sounds.menuBack(); showMainMenu(); }
    else if (action === 'flip') { if (state === 'running' && !replay) flipDirection(); }
    // The rider is off the bike after a crash, so the lamp and interacting only work mid-ride.
    else if (action === 'lights') { if (state === 'running') toggleHeadlight(); }
    else if (action === 'fullscreen') toggleFullscreen();
    else if (action === 'interact') { if (state === 'running') interact(); }
    else if (action === 'confirm' || action === 'cancel') {
      if (state === 'paused') resumeGame();
      else if (state === 'won' && action === 'confirm') { if (replay) startFresh(); else $('primary').click(); }
      else if (state === 'ragdoll' && action === 'confirm') startFresh();
    }
  }

  // --- Simulation ------------------------------------------------------------

  // The replay bot's reference runs live in the repo (tests/replays/human), so
  // only the dev server can save them. It works out which official trail the
  // run finishes, which also covers play tests.
  function showSaveReference() {
    const button = $('save-reference');
    // Run from the local dev server, finished runs can be saved for the replay bot.
    button.hidden = !devServerWritable || !lastRun ||!['official', 'playtest'].includes(session.trailSource);
    button.disabled = false;
  }

  async function saveReferenceRun() {
    const button = $('save-reference');
    if (session.state !== 'won' || !lastRun || button.disabled) return;
    button.disabled = true;
    try {
      const response = await fetch(new URL('../api/reference-runs', import.meta.url), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lastRun)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `The dev server answered ${response.status}.`);
      overlay.toast(`Bot reference saved for ${result.name}${result.replaced ? ' · replaced the old one' : ''}`, 4000);
    } catch (error) {
      button.disabled = false;
      overlay.toast(error instanceof Error ? error.message : String(error), 5000);
    }
  }

  function finishPlaytestRun(ride) {
    const time = ride.elapsed;
    const previousBest = playtestBest?.time ?? null;
    lastRun = { time, startStep, seed: ride.seed, inputs: encodeInputs(recorded), physics: RIDE_VERSION, look: session.look };
    if (previousBest === null || time < previousBest) {
      playtestBest = { ...lastRun, splits: ride.splits.slice() };
    }
    const medals = session.trail.medals;
    overlay.showResults({
      official: false, time, previousBest, rank: null, medals, medal: medalFor(medals, time),
      apples: ride.apples.length, author: session.trail.author,
      primaryLabel: 'Play Again',
      keys: promptKeys()
    });
    // Test Pilot: given to the rider back in the game, as play-tests don't count as riding.
    if (!replay) reportEditorFeat('playtest');
    showSaveReference();
    $('overlay-badge').textContent = 'PLAY TEST COMPLETED';
    $('overlay-description').replaceChildren(...keyTextNodes(['Play-test runs are not saved. Press ', { key: 'Esc' }, ' to return to the editor.']));
    $('overlay-description').hidden = false;
    setState('won');
  }

  function finishRun(ride) {
    if (session.trailSource === 'playtest') { finishPlaytestRun(ride); return; }
    const entry = currentTrailEntry();
    const key = trailKey(entry);
    const time = ride.elapsed;
    const official = session.trailSource === 'official';
    // Official and bonus times are save bests and go online; only official ones progress the career.
    const ranked = isRankedSource(session.trailSource);
    const { saveGame } = session;
    // Taken before this run counts, so career achievements it completes are announced.
    const before = progressOf(saveGame);
    const worldBest = ranked ? cachedOnlineBoard(key)?.[0]?.time ?? null : null;
    const previousBest = official
      ? (saveGame ? readBest(session.activeSaveSlot, key, trails.length) : null)
      : ranked && saveGame
        ? readBest(session.activeSaveSlot, key, trails.length)
        // An open bonus trail can be ridden without a save, like a custom one.
        : readLeaderboard(key)[0]?.time ?? null;
    const rank = recordLeaderboardRun(key, {
      time, look: session.look, rider: legacyRider(session.look), name: saveGame?.name,
      slot: saveGame ? session.activeSaveSlot : null, saveId: saveGame?.createdAt
    });
    if (official) {
      session.unlockedTrail = Math.max(session.unlockedTrail, Math.min(session.trailIndex + 1, trails.length - 1));
      saveProgress();
    }
    if (ranked) {
      if (saveGame && (previousBest === null || time < previousBest)) {
        saveBest(session.activeSaveSlot, key, time, trails.length);
        saveGame.bestTimes[key] = time;
        queueSaveSync(saveGame);
      }
    }
    const storedGhost = readGhost(key);
    const inputs = encodeInputs(recorded);
    // A device too slow for the fixed step drops time (see frame()), which
    // plays in slow motion: more time to react per simulated second. Such a
    // run counts here, but is never posted to the world board, now or later.
    const slowMotion = passedTime > 0 && simulatedTime / passedTime < SLOW_MOTION_RATIO;
    lastRun = { time, startStep, seed: ride.seed, inputs, physics: RIDE_VERSION, look: session.look };
    if (!storedGhost || storedGhost.physics !== RIDE_VERSION || time < storedGhost.time) {
      saveGhost(key, { time, splits: ride.splits.slice(), startStep, seed: ride.seed, inputs, physics: RIDE_VERSION, look: session.look, ...(slowMotion ? { slow: true } : {}) });
    }
    earn(finishedRunAchievements(ride, previousBest, worldBest), {}, before);
    const medals = session.trail.medals;
    const last = session.trailIndex === trails.length - 1;
    // Beating the last official trail for the first time ends the career: the
    // results' main button rolls the credits.
    creditsAfterResults = official && last && Boolean(saveGame) && previousBest === null;
    // Only a run the player actually rode, at full speed, is sent to the
    // world board. Offline saves stay local-only. The server replays the
    // inputs to time the run. The run is kept as waiting before it is sent,
    // so closing the tab mid-upload, or a refused session, doesn't lose it;
    // the server's answer settles it.
    const run = { inputs, seed: ride.seed, physics: RIDE_VERSION };
    const eligible = ranked && session.state === 'running' && Boolean(saveGame?.token) && !slowMotion;
    const queued = eligible ? queuePendingRun(key, { look: session.look, playerId: saveGame.playerId, run, time }) : null;
    const submission = eligible
      ? submitOnlineRun(key, { look: session.look, token: saveGame.token, playerId: saveGame.playerId, run })
      : null;
    if (ranked && saveGame?.token && slowMotion) {
      overlay.toast('Not posted to the world board: the game ran in slow motion · Try Reduced scenery in Settings', 6000);
    }
    overlay.showResults({
      official, bonus: session.trailSource === 'bonus', time, previousBest, rank, worldPending: !!submission,
      medals, medal: medalFor(medals, time),
      apples: ride.apples.length, author: session.trail.author,
      primaryLabel: official && !last ? 'Next Trail' : creditsAfterResults ? 'Roll Credits' : 'Play Again',
      keys: promptKeys()
    });
    showSaveReference();
    if (submission) {
      const slot = session.activeSaveSlot;
      const shown = overlay.currentResults();
      submission.then(result => {
        // Settled, one way or the other; a signed-out rider's run waits for their login.
        const settled = result && ('rank' in result || 'rejected' in result);
        if (settled && queued?.at) dropPendingRun(key, saveGame.playerId, queued.at);
        if (result && 'signedOut' in result) {
          signOut(saveGame.playerId);
        } else if (result && 'rejected' in result) {
          // The server replayed the inputs and they didn't finish: that's the egg.
          if (result.reason === 'run does not finish') egg('rejected-run');
          else overlay.toast(result.reason === 'bad inputs' ? 'Too long for the world board · Runs over ten minutes stay on this device' : 'The world board didn’t take the run · Reload to get the latest version', 6000);
        } else if (result && 'failed' in result) {
          // Offline or a server hiccup: the waiting run goes when the server can be reached.
          overlay.toast(queued ? 'Couldn’t reach the world board · Run saved to post later'
            : 'Couldn’t reach the world board, and browser storage is too full to keep the run', 6000);
        }
        const standing = result && 'rank' in result ? result : null;
        // Riders who have already moved on still hear how the run placed.
        const onResults = overlay.showWorldStanding(shown, standing);
        if (!onResults && standing) {
          overlay.toast(`WORLD RANK #${standing.rank} OF ${standing.total}`, 4000);
        }
        // A new world record gets a show, but only over its own results,
        // not over the next ride.
        if (onResults && standing?.rank === 1 && standing.improved) celebrateRecord();
      });
    }
    setState('won');
    haptics.play('cheer');
  }

  /** Fireworks over the trail, for a run the world board has just put first. */
  function celebrateRecord() {
    fireworks.play();
    // The scene stops being drawn once the finish has settled; this wakes it.
    redraw = true;
  }

  function handleEvent(ride, event) {
    // How long the rider waited at the start, for Patience.
    if (!replay) trackAchievements(event.type === 'start' ? { ...event, wait: ride.time } : event);
    switch (event.type) {
      case 'start':
        startStep = recorded.length - 1;
        attempts++;
        break;
      case 'airTurn':
        sounds.airTurn(event.full);
        break;
      case 'flip': {
        flips += event.count;
        const mx = (ride.rear.x + ride.front.x) / 2, my = (ride.rear.y + ride.front.y) / 2;
        renderer.popup('+' + event.count + (event.count === 1 ? ' FLIP' : ' FLIPS'), mx, my - 70);
        overlay.announce(event.count + (event.count === 1 ? ' flip.' : ' flips.'));
        haptics.play('tick', { phonePattern: 25 });
        break;
      }
      case 'land':
        if (ride.status !== 'running' || event.impact <= LANDING_SOUND_IMPACT || landingSoundCooldown > 0) break;
        sounds.land(event.impact);
        landingSoundCooldown = .12;
        for (const wheel of [ride.rear, ride.front]) if (wheel.grounded && wheel.impactSpeed > LANDING_SOUND_IMPACT) effects.dustPuff(wheel, wheel.impactSpeed);
        if (event.impact > HARD_LANDING_IMPACT) {
          haptics.play('thump', {
            strength: clamp((event.impact - HARD_LANDING_IMPACT) / 400, 0, 1),
            phonePattern: Math.round(clamp(event.impact / 12, 10, 40)),
          });
          // Shakes the snow off nearby snowy pines.
          renderer.land((ride.rear.x + ride.front.x) / 2, (ride.rear.y + ride.front.y) / 2, clamp(.4 + (event.impact - HARD_LANDING_IMPACT) / 380, .4, 1));
        }
        break;
      case 'suspension':
        if (ride.status !== 'running') break;
        // Bottoming out thumps the gamepad, as hard as the clunk sounds; a
        // landing that bottoms out thumps once.
        if (event.end === 'bottom') haptics.play('thump', { strength: clamp((event.speed - 100) / 300, 0, 1), phone: false });
        if (suspensionSoundCooldown > 0) break;
        sounds.suspension(event.end, event.speed);
        suspensionSoundCooldown = .06;
        break;
      case 'splash':
        effects.splash(event.x, event.y, event.speed);
        if (splashSoundCooldown <= 0) {
          sounds.splash(event.speed);
          splashSoundCooldown = .15;
        }
        break;
      case 'shatter':
        effects.shatter(event);
        sounds.shatter(event.speed);
        if (session.preferences.shake === 'on') camera.kick(3);
        haptics.play('jolt');
        break;
      case 'crack':
        effects.crack(event);
        sounds.crack(event.speed);
        haptics.play('tick');
        break;
      case 'crash': {
        effects.burst(event.x, event.y, CRASH_COLORS[event.cause], event.cause === 'spike' ? 18 : 15);
        sounds.crash();
        if (session.preferences.shake === 'on') camera.kick(6);
        haptics.play('crash');
        setState('ragdoll');
        const { restart } = promptKeys();
        overlay.announce('Rider down. ' + (restart ? 'Press ' + restart + ' or select' : 'Select') + ' Retry to try again.');
        overlay.toast(restart ? ['Rider down · Press ', { key: restart }, ' to retry'] : 'Rider down', Infinity);
        break;
      }
      case 'helmet':
        effects.burst(event.x, event.y, riderPalette(replay?.look ?? session.look).helmet, 8);
        sounds.helmet(event.speed);
        haptics.play('jolt', { phonePattern: 25 });
        overlay.announce('The helmet came off.');
        break;
      case 'apple': {
        effects.burst(event.apple.x, event.apple.y, '#ef8150');
        sounds.apple();
        overlay.setApples(event.collected, event.total);
        overlay.announce(event.collected + ' of ' + event.total + ' apples collected.');
        const ghostSplit = ghost?.data.splits?.[event.collected - 1];
        if (Number.isFinite(ghostSplit)) overlay.split(event.split - ghostSplit);
        if (event.collected === event.total) overlay.toast('All apples collected! Finish gate unlocked', undefined, 'flag');
        break;
      }
      case 'nisse':
        // Optional and hidden: a puff of red, a jingle, and a note in the save.
        effects.burst(event.x, event.y - 12, '#d63b2c', 14);
        sounds.nisse();
        haptics.play('cheer', { phonePattern: 30 });
        overlay.toast('You found the nisse!', 3200, 'nisse');
        overlay.announce('You found the nisse.');
        findNisse();
        break;
      case 'goalLocked':
        // Only at the finish do the missing apples get pointed out, so
        // finding them along the way stays part of the trail.
        overlay.toast(event.missing + (event.missing === 1 ? ' apple left to collect!' : ' apples left to collect!'), 4000);
        renderer.pointToApples(4);
        break;
      case 'win': {
        const mx = (ride.rear.x + ride.front.x) / 2, my = (ride.rear.y + ride.front.y) / 2;
        effects.burst(mx, my - 55, '#e8964f', 25);
        sounds.win();
        if (replay) finishReplay();
        else finishRun(ride);
        break;
      }
    }
  }

  function physicsStep() {
    const ride = session.ride;
    const thunder = effects.stepWeather();
    if (thunder) sounds.thunder(thunder.intensity, thunder.distance, thunder.x);
    landingSoundCooldown = Math.max(0, landingSoundCooldown - STEP);
    splashSoundCooldown = Math.max(0, splashSoundCooldown - STEP);
    suspensionSoundCooldown = Math.max(0, suspensionSoundCooldown - STEP);
    physicsDebug.begin({ state: session.state, time: ride.elapsed, trail: session.trail.name, source: session.trailSource, facing: ride.facing, throttle: ride.throttle }, ride.rear, ride.front);

    // Holding restart keeps the bike on the start line with the clock stopped.
    const holding = input.held('restart');
    const stepInput = replay ? {
      facing: ride.facing, leanInput: 0, accelerating: false, braking: false,
      ...replay.inputs[replay.step++]
    } : {
      facing: ride.facing,
      // Rounded like the replay codec, so the recorded run is exactly the run
      // that was simulated and replays (ghost, server check) match it.
      leanInput: holding ? 0 : Math.round(input.leanInput() * 100) / 100,
      accelerating: !holding && input.held('up'),
      braking: !holding && input.held('down')
    };
    const running = ride.status === 'running';
    gasHeld = running && stepInput.accelerating;
    physicsDebug.recordInput({ ...stepInput, accelerating: running && stepInput.accelerating, braking: running && stepInput.braking });
    if (running && !replay) recorded.push(stepInput);
    const speed = bikeSpeed(ride);
    const facingBefore = ride.facing;
    const events = stepRide(ride, stepInput, debugHooks);
    if (ride.facing !== facingBefore) overlay.setDirection(ride.facing);
    physicsDebug.capture('afterVelocityConstraint', ride.rear, ride.front);
    physicsDebug.setIteration(-1);
    physicsDebug.finish(ride.rear, ride.front);

    if (ghost && ride.started && ghost.index < ghost.inputs.length) stepRide(ghost.ride, ghost.inputs[ghost.index++]);
    else if (ghost && ghost.index >= ghost.inputs.length && ghost.ride.status === 'crashed') stepRide(ghost.ride, {});

    effects.terrainSpray(ride, speed, stepInput.braking);
    effects.waterWake(ride, speed);
    effects.brakeMarks(ride, speed, stepInput.braking);
    effects.wheelGrime(ride, stepInput.braking);
    effects.squishTyres(ride);
    // A crash throws away the feat in progress; reaching the finish completes it.
    if (replay) feats.reset();
    else if (ride.status === 'running') feats.step(ride.rear.grounded, ride.front.grounded).forEach(trackAchievements);
    else if (ride.status === 'won') feats.finish().forEach(trackAchievements);
    else feats.reset();
    for (const event of events) handleEvent(ride, event);
    if (!broken && !replay && ride.status === 'running' && bikeBroken(ride.rear, ride.front)) {
      broken = true;
      egg('kraken');
    }
  }

  // --- Frame loop ----------------------------------------------------------

  function frame(now) {
    fpsMeter?.frame(now);
    const elapsed = lastTime ? (now - lastTime) / 1000 : 1 / 60;
    const dt = Math.min(elapsed, .05);
    lastTime = now;
    input.pollGamepad();
    // Toasts time out in the menu too, where achievements can still be earned.
    overlay.tick(now);
    const ride = session.ride;
    if (ride && !menu.isOpen()) {
      const { state } = session;
      if (state === 'running' || state === 'ragdoll') {
        accumulator += dt;
        let steps = 0;
        while (accumulator >= STEP) {
          physicsStep(); accumulator -= STEP;
          if (session.state !== 'running' && session.state !== 'ragdoll') { accumulator = 0; break; }
          // Drop time a slow frame cannot catch up on instead of spiralling.
          if (++steps >= MAX_STEPS_PER_FRAME) { accumulator = Math.min(accumulator, STEP); break; }
        }
        // Measured from the rider setting off, as waiting at the line is free.
        if (ride.started && state === 'running') { simulatedTime += steps * STEP; passedTime += elapsed; }
      } else accumulator = 0;
      const stepping = session.state === 'running' || session.state === 'ragdoll';
      const alpha = stepping ? accumulator / STEP : 1;
      overlay.setTimer(ride.elapsed);
      const still = session.state === 'paused' || (session.state === 'won' && renderer.settled() && !fireworks.active());
      if (!still || redraw) {
        redraw = false;
        const restore = interpolateRide(ride, alpha);
        const ghostRide = ghost?.ride;
        // A finished ghost is no longer stepped: hold it where it stopped.
        const restoreGhost = ghostRide ? interpolateRide(ghostRide, ghostRide.status === 'won' ? 1 : alpha) : null;
        renderer.draw({
          ride, ghost: ghostRide, camera, effects, look: replay?.look ?? session.look, ghostLook: ghost?.look, state: session.state,
          full: session.preferences.scenery === 'full', dt, debug: debugEnabled, fireworks
        });
        restoreGhost?.();
        restore();
        if (renderer.takeWoofs()) sounds.woof();
      }
    }
    fpsMeter?.drawn(now);
    debugHud?.update({ ride: session.ride, state: session.state, trailName: session.trail?.name, dynamics: lastDynamics }, now);
    sounds.update();
    // A light buzz while the tyre skids under braking, like the skid sound.
    const current = session.ride;
    if (current) haptics.skid(skidAmount({ state: session.state, rear: current.rear, front: current.front, brakePressure: current.brakePressure ?? 0 }));
    requestAnimationFrame(frame);
  }

  // --- Wiring ----------------------------------------------------------------

  game.addEventListener('keydown', event => {
    if (input.capturing) { input.keyDown(event); return; }
    if (event.code === 'Escape') {
      event.preventDefault();
      // With the keyboard lock held, Esc can repeat; one press must be one action.
      if (event.repeat) return;
      sounds.escape();
      if (menu.isOpen()) { if (!menu.back()) closeMainMenu(); }
      else if (session.state === 'paused') resumeGame();
      else showMainMenu();
      return;
    }
    if (menu.isOpen()) return;
    input.keyDown(event);
  });
  // Auto-pause fires when focus leaves the game, so resuming must not need it.
  document.addEventListener('keydown', event => {
    if (event.repeat) return;
    if (game.contains(/** @type {Node} */ (event.target)) || session.state !== 'paused') return;
    if (session.preferences.bindings.pause.includes(event.code) || event.code === 'Escape') { event.preventDefault(); resumeGame(); }
  });
  window.addEventListener('keyup', event => input.keyUp(event));
  game.addEventListener('focusout', event => {
    if (!game.contains(/** @type {Node} */ (event.relatedTarget))) { input.clear(); pauseGame(); }
  });
  $('canvas').addEventListener('pointerdown', focusGame);
  // On touch screens, tapping the game tells a nearby Coda to sit.
  $('canvas').addEventListener('pointerdown', () => { if (!menu.isOpen()) handlePress('interact'); });
  window.addEventListener('blur', () => { input.clear(); pauseGame(); });
  document.addEventListener('visibilitychange', () => {
    // The frame loop stops with the tab, so the sound is stopped here: the
    // pause alone would leave the engine or the rain running in the background.
    if (document.hidden) { input.clear(); pauseGame(); sounds.suspend(); }
    else {
      holdWakeLock(session.state === 'running' || session.state === 'ragdoll');
      // Another device may have changed the rider while this tab was away.
      if (menu.isOpen()) menu.refreshCloudSave();
    }
    lastTime = 0; accumulator = 0;
  });
  // Back online: runs finished while away can go up now.
  window.addEventListener('online', () => { flushPendingRuns(tokenFor); });

  /** The server no longer accepts a rider's session; they log in again for a new one. */
  function signOut(playerId) {
    const slot = session.saveSlots.findIndex(save => save?.playerId === playerId && save.token);
    if (slot < 0) return;
    clearSaveToken(slot, trails.length);
    Object.assign(session.saveSlots[slot], { token: null, online: true });
    overlay.toast('Signed out · Log in from the menu to keep posting world times and backing up', 6000);
    if (menu.isOpen()) menu.updateDashboard();
  }
  window.addEventListener(SIGNED_OUT_EVENT, event => signOut(/** @type {CustomEvent} */ (event).detail.playerId));
  // A session about to expire was renewed by the server; the rider stays signed in.
  window.addEventListener(SESSION_RENEWED_EVENT, event => {
    const { playerId, token } = /** @type {CustomEvent} */ (event).detail;
    const slot = renewSaveToken(playerId, token, trails.length);
    if (slot >= 0 && session.saveSlots[slot]) session.saveSlots[slot].token = token;
  });
  // Storage is full: the game carries on, but the player should know that a reload loses progress.
  let storageWarned = false;
  window.addEventListener(STORAGE_FAILED_EVENT, () => {
    if (storageWarned) return;
    storageWarned = true;
    overlay.toast('Couldn’t save: browser storage is full · Progress will be lost on reload until space is freed', Infinity);
  });

  $('primary').addEventListener('click', () => {
    if (session.state === 'won' && creditsAfterResults) {
      creditsAfterResults = false;
      sounds.menuConfirm();
      showMainMenu();
      menu.showCredits('home');
      return;
    }
    // On the last trail the button reads Play Again, so it falls through to a retry.
    if (session.state === 'won' && session.trailSource === 'official' && session.trailIndex < trails.length - 1) {
      openingTrail = true;
      loadTrail(session.trailIndex + 1);
      setState('running'); focusGame();
    } else startFresh();
  });
  $('secondary').addEventListener('click', startFresh);
  $('save-reference').addEventListener('click', saveReferenceRun);
  $('watch-replay').addEventListener('click', () => {
    if (session.state === 'won' && lastRun) watchReplay({ data: lastRun, name: session.saveGame?.name || 'Your run' });
  });
  // Focus the game first: hiding the focused button would blur it and auto-pause.
  $('pause-overlay').addEventListener('click', resumeGame);
  $('crash-retry').addEventListener('click', () => { focusGame(); startFresh(); });
  $('headlight').addEventListener('click', () => { handlePress('lights'); focusGame(); });
  $('sound-control').addEventListener('click', () => { toggleSound(); focusGame(); });
  // A click rather than a data-action: the touch buttons only work mid-ride,
  // and restart is wanted most after a crash.
  $('restart-control').addEventListener('click', () => handlePress('restart'));
  $('menu').addEventListener('click', () => { sounds.menuBack(); showMainMenu(); });
  document.querySelectorAll('[data-fullscreen]').forEach(button => button.addEventListener('click', () => {
    const wantOn = button.dataset.fullscreen === 'on';
    if (wantOn !== Boolean(fullscreenElement())) toggleFullscreen();
  }));
  const fullscreenSupported = Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled || game.webkitRequestFullscreen);
  $('setting-fullscreen-group').hidden = !fullscreenSupported;
  syncFullscreenSetting();
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  function resize() {
    renderer.resize();
    redraw = true;
  }
  window.addEventListener('resize', () => { resize(); menu.drawBackground(); });
  // A window dragged to a screen of another pixel density keeps its size, so
  // only the renderer notices; the dashboard backdrop is redrawn for it too.
  renderer.onPixelRatioChange(() => { redraw = true; menu.drawBackground(); });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe($('canvas'));
  window.addEventListener('gamepadconnected', () => { if (menu.isOpen()) sounds.menuMove(); });

  // Browsers only let sound start from a gesture, and iOS may not count the
  // first one (or stops the sound again for a call), so every gesture asks
  // until the context is actually running, then they stop listening.
  const unlockEvents = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
  const unlockAudio = () => {
    sounds.init();
    if (sounds.isRunning()) for (const type of unlockEvents) window.removeEventListener(type, unlockAudio, { capture: true });
  };
  for (const type of unlockEvents) window.addEventListener(type, unlockAudio, { capture: true });
  const lim = createLimWatcher();
  window.addEventListener('keydown', event => {
    if (event.repeat || !lim.down(event.code)) return;
    console.info('[Hjulben] You now have 100% Health, 99 Ammo and both Keys! Note that you have basically eliminated your chances of getting a high score!');
    egg('lim');
  }, { capture: true });
  window.addEventListener('keyup', event => lim.up(event.code), { capture: true });
  window.addEventListener('blur', () => lim.clear());
  installConsoleCheats(() => egg('cheat'));
  // In the menu, the card is a shortcut to the achievements or the Garage. It
  // ignores clicks on the ride (see the CSS), so it can't interrupt a run.
  $('achievement-popover').addEventListener('click', () => {
    if (!menu.isOpen() || !session.saveGame) return;
    const popover = $('achievement-popover');
    popover.hidePopover();
    $(popover.dataset.opens === 'garage' ? 'menu-garage' : 'menu-achievements').click();
  });
  // Back from the editor: a reload, a page restored from the back-forward
  // cache, or the editor open in another tab.
  window.addEventListener('pageshow', event => { if (event.persisted) claimEditorFeats(); });
  window.addEventListener('storage', event => { if (event.key === EDITOR_FEATS_KEY) claimEditorFeats(); });

  loadStoredState();
  // Ghosts and local boards of trail versions that are gone only take up room.
  pruneStaleTrailData([...officialTrailEntries, ...bonusTrailEntries].map(trailKey));
  applyPreferences();
  handleFullscreenChange();
  resize();
  // A new release asks for its reload on the menu only, never mid-ride.
  setUpdatePrompt({ canShow: () => menu.isOpen() });
  if (playtestTrail) {
    $('menu').setAttribute('aria-label', 'Back to the editor');
    startSelectedTrail(loadPlaytestTrail, false);
  } else if (shared?.entry) {
    startSelectedTrail(() => loadCustomTrail(customTrailEntries.indexOf(shared.entry)), false);
    overlay.toast(`Shared trail “${shared.entry.name}” · Saved under Custom Trails`, 5000);
  } else {
    showMainMenu();
    claimEditorFeats();
    if (shared?.error) menu.showTrailsStatus(`Could not open the shared trail: ${shared.error.message}`, true);
  }
  requestAnimationFrame(frame);
  // Queued after the first frame, so the reveal shows a fully drawn screen.
  requestAnimationFrame(() => game.removeAttribute('data-booting'));
}
