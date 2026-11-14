// Main menu: savegames, trail select, leaderboard, achievements, settings and how-to-play.
import { clamp } from '../config.js';
import { trails, officialTrailEntries, bonusTrailEntries, customTrailEntries, saveBrowserTrail, browserTrailSaved } from '../trails.js';
import { createGameArt } from '../drawing.js';
import { drawScene, drawTrailPreview, posedRide, findClimb, findJump, finishScene } from '../scene-preview.js';
import {
  loadSaveSlots, loadActiveSlot, saveActiveSlot, createSave, deleteSave, readBest,
  readLeaderboard, LEADERBOARD_SIZE, loadPreferences, savePreferences, cleanRiderName,
  restoreOnlineSave, linkSave, readGhost, saveLook, saveGhostMode, adoptGhostSetting, loadSeenVersion, saveSeenVersion, loadSeenHowTo, saveSeenHowTo, applyCloudSave, clearSaveToken, hasNisse
} from '../storage.js';
import { DEFAULT_LOOK, itemsForSlot, keepIdentity, lookKey, lookParts, randomLook, sameLook, starterLook } from '../cosmetics.js';
import { createCustomizer, createIdentityPicker, drawLook } from './customizer.js';
import { ONLINE_LEADERBOARD_EVENT, ONLINE_STANDINGS_EVENT, boardStatus, isOnlineBoardLoading, isOnlineTrail, fetchRiderGhost, settledWorldGhost, refreshOnlineBoard, onlineBoardStanding, myStanding, refreshMyStandings, queuePendingRun, flushPendingRuns, dropPendingRuns } from '../online-leaderboard.js';
import { registerRider, loginRider, deleteRider, accountErrorText, passkeysSupported, queueSaveSync, fetchCloudSave, fetchNotifications } from '../account.js';
import { NOTIFICATIONS_EVENT, lastNoticeId, markRead, notificationsFor, notify, setLastNoticeId, unreadCount } from '../notifications.js';
import { isSandbox } from '../local-store.js';
import { NAME_HINT, disallowedNameChars } from '../rider-name.js';
import { RIDE_VERSION } from '../ride.js';
import { normalizeAuthor, normalizeTrail, validateTrail, medalFor } from '../trail-schema.js';
import { ACTION_LABELS, keyLabel } from '../input.js';
import { createGamepadDiagram } from './gamepad-diagram.js';
import { keyTextNodes } from './key-text.js';
import { canRumble } from '../haptics.js';
import { VERSION } from '../version.js';
import { RELEASES } from '../changelog.js';
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS, statProgressText } from '../achievements.js';
import {
  $, session, reducedMotion, DEFAULT_BINDINGS, DEFAULT_PREFERENCES, sanitizePreferences,
  leaderboardTrails, trailKey, nisseKey, trailMarker, runTimeText, bonusUnlock, lookOwner, riderLook, lookItemHint, progressOf, unlockedOf,
  lookItemProgress, unseenGear, markGearSeen, garageRoom, ghostMode
} from '../state.js';

// Runs made without a savegame have no name.
const runnerName = name => name || 'RIDER';

/** Loads saves and preferences into the session. */
export function loadStoredState() {
  session.preferences = sanitizePreferences(loadPreferences(DEFAULT_PREFERENCES));
  // The Ghost setting moved into saves, so it follows the rider; a choice
  // made on this device before that is kept. Synced with the next cloud check.
  adoptGhostSetting(trails.length, session.preferences.ghost, DEFAULT_PREFERENCES.ghost);
  session.saveSlots = loadSaveSlots(trails.length);
  session.activeSaveSlot = loadActiveSlot();
  session.saveGame = session.saveSlots[session.activeSaveSlot];
  if (!session.saveGame) {
    const firstOccupied = session.saveSlots.findIndex(Boolean);
    if (firstOccupied >= 0) {
      session.activeSaveSlot = firstOccupied;
      session.saveGame = session.saveSlots[firstOccupied];
      saveActiveSlot(firstOccupied);
    }
  }
  session.unlockedTrail = unlockedOf(session.saveGame);
  session.savedTrail = session.saveGame?.trail || 0;
  session.look = riderLook();
}

/**
 * @param {{
 *   sounds: any, input: any,
 *   onStartTrail: (index: number) => void,
 *   onStartBonus: (index: number) => void,
 *   onStartCustom: (index: number) => void,
 *   onClose: () => void,
 *   riderOnScreen: () => { x: number, y: number },
 *   onPreferences: () => void
 * }} hooks
 */
export function createMenu({ sounds, input, onStartTrail, onStartBonus, onStartCustom, onClose, onBack, riderOnScreen, onPreferences, onWatchReplay, onRiderChange }) {
  /**
   * The best time shown on a trail's card or in the trail picker: the world's
   * if the board has been fetched, else this device's. Asks for the world
   * board in the background (throttled), so the lists fill in as it arrives.
   */
  function topTime(key) {
    refreshOnlineBoard(key);
    return readLeaderboard(key)[0]?.time ?? null;
  }
  let pendingSaveSlot = 0;
  $('app-version').textContent = 'v' + VERSION;
  let deleteArmedSlot = -1, deleteArmTimer = 0, leaderboardTrail = 0;
  let creatorFromRiders = false;
  // Sandbox riders are throwaway, so they never get an online account.
  const onlineAvailable = passkeysSupported() && !isSandbox();
  let saveMode = onlineAvailable ? 'online' : 'offline';
  // The ghost a new online rider races, picked under Online.
  let newSaveGhost = DEFAULT_PREFERENCES.ghost;
  /** True while a passkey prompt or account request is in flight. */
  let accountBusy = false;

  const isOpen = () => !$('menu-screen').hidden;

  // Fresh world results rebuild the board while the menu is on screen.
  window.addEventListener(ONLINE_LEADERBOARD_EVENT, () => {
    if (isOpen()) buildLeaderboard();
  });
  // The rider's places arrive after the trail picker has opened.
  window.addEventListener(ONLINE_STANDINGS_EVENT, () => {
    if (isTrailPickerOpen()) $('leaderboard-picker').querySelectorAll('.leaderboard-pick').forEach(fillPickStanding);
  });

  // Opening the board, flipping to a trail or coming back to the tab fetches
  // other riders' runs, unless the board is only seconds old.
  const BOARD_VIEW_MAX_AGE = 5_000;
  const isBoardShown = () => isOpen() && !$('menu-leaderboard-view').hidden;
  const shownBoardKey = () => trailKey(leaderboardTrails()[leaderboardTrail]);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isBoardShown()) refreshOnlineBoard(shownBoardKey(), BOARD_VIEW_MAX_AGE);
  });

  // Typing a name must not reach the game's key handlers (W/A/S/D, R, Esc).
  // Escape is left alone so it still closes the menu.
  const nameInput = $('new-save-name');
  for (const type of ['keydown', 'keyup', 'keypress']) {
    nameInput.addEventListener(type, event => { if (event.key !== 'Escape') event.stopPropagation(); });
  }
  nameInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); $('new-save-next').click(); }
  });
  // Says which characters won't be kept, instead of dropping them silently.
  nameInput.addEventListener('input', () => {
    nameInput.classList.remove('invalid');
    const bad = disallowedNameChars(nameInput.value);
    setStatus('save-status', bad.length ? `Can’t use ${bad.join(' ')} in names. ${NAME_HINT}.` : '', bad.length > 0);
    if (bad.length) nameInput.classList.add('invalid');
  });

  /** A ride is only resumable while it still belongs to the active save. */
  function canResume() {
    if (!session.gameLoopStarted) return false;
    if (session.trailSource === 'official' && !session.saveGame) return false;
    return (session.saveGame?.createdAt ?? null) === session.rideSaveId;
  }

  function startTrail(index) {
    beforeFirstRide(() => {
      session.rideSaveId = session.saveGame?.createdAt ?? null;
      onStartTrail(index);
    });
  }

  function startBonus(index) {
    beforeFirstRide(() => {
      session.rideSaveId = session.saveGame?.createdAt ?? null;
      onStartBonus(index);
    });
  }

  function startCustom(index) {
    beforeFirstRide(() => {
      session.rideSaveId = session.saveGame?.createdAt ?? null;
      onStartCustom(index);
    });
  }

  /** The ride How to play starts when its Let's ride button is pressed. */
  let rideAfterHowTo = null;

  // Riders who had already ridden before How to play showed itself have
  // played; it is only for someone's very first ride on this device.
  const hasRidden = () => session.saveSlots.some(save => save && (
    save.unlocked > 0 || Object.keys(save.bestTimes || {}).length > 0 || Object.keys(save.stats || {}).length > 0));

  /** Shows How to play before the first ride on this device, then rides. */
  function beforeFirstRide(ride) {
    if (loadSeenHowTo() || hasRidden()) { ride(); return; }
    showView('how');
    rideAfterHowTo = ride;
    $('how-ride').hidden = false;
    requestAnimationFrame(() => selectControl($('how-ride')));
  }

  // Menu art is drawn by the game's renderer from the trails themselves, a
  // frame at a time, and kept until the rider or scenery changes.
  // Room for the trail cards plus a slot's worth of look swatches and avatars.
  const PREVIEW_CACHE_SIZE = 96;
  const previewCache = new Map();
  let previewQueue = [], previewFrame = 0;

  /** A cache key for a scene that shows the active rider. */
  function previewKey(...parts) {
    return sceneKey(...parts, lookKey(session.look));
  }

  /** A cache key for a scene, with the settings that change how it looks. */
  function sceneKey(...parts) {
    const { scenery, headlight } = session.preferences;
    return [...parts, scenery, headlight].join('|');
  }

  function sceneOptions() {
    return {
      look: session.look,
      full: session.preferences.scenery === 'full',
      headlights: session.preferences.headlight !== 'off'
    };
  }

  function copyPreview(source, target) {
    target.width = source.width;
    target.height = source.height;
    const context = target.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0);
  }

  function renderPreview(key, render) {
    let image = previewCache.get(key);
    if (!image) {
      image = document.createElement('canvas');
      render(image);
      previewCache.set(key, image);
      if (previewCache.size > PREVIEW_CACHE_SIZE) previewCache.delete(previewCache.keys().next().value);
    }
    return image;
  }

  /** Paints a cached preview now, or queues it so menus open without a stall. */
  function paintPreview(target, key, render, { now = false } = {}) {
    if (now || previewCache.has(key)) { copyPreview(renderPreview(key, render), target); return; }
    previewQueue = previewQueue.filter(job => job.target !== target);
    previewQueue.push({ target, key, render });
    previewFrame ||= requestAnimationFrame(drainPreviews);
  }

  function drainPreviews() {
    previewFrame = 0;
    if (!isOpen()) { previewQueue = []; return; }
    let job;
    while ((job = previewQueue.shift()) && !job.target.isConnected);
    if (job) copyPreview(renderPreview(job.key, job.render), job.target);
    if (previewQueue.length) previewFrame = requestAnimationFrame(drainPreviews);
  }

  /** A rider's head, as a round avatar for the rider list and leaderboard. */
  function riderAvatar(look) {
    const avatar = document.createElement('span');
    avatar.className = 'save-avatar';
    const portrait = document.createElement('canvas');
    portrait.setAttribute('aria-hidden', 'true');
    paintPreview(portrait, sceneKey('avatar', lookKey(look)), image => drawLook(image, look, 'head'));
    avatar.append(portrait);
    return avatar;
  }

  // The rider's gender symbol in a small box tinted blue or pink, before or
  // after their name; the name's own text says the gender to screen readers.
  function genderBadge(gender) {
    const badge = document.createElement('span');
    badge.className = 'save-gender';
    badge.dataset.gender = gender;
    badge.setAttribute('aria-hidden', 'true');
    const symbol = document.createElement('span');
    symbol.dataset.icon = gender;
    badge.append(symbol);
    return badge;
  }

  function drawActiveSaveIllustration() {
    const canvasElement = $('active-save-bike');
    if (canResume()) { drawRideSnapshot(canvasElement); return; }
    if (!session.saveGame) {
      canvasElement.getContext('2d').clearRect(0, 0, canvasElement.width, canvasElement.height);
      return;
    }
    const entry = officialTrailEntries[session.savedTrail];
    paintPreview(canvasElement, previewKey('continue', trailKey(entry)), image => drawScene(image, {
      ...sceneOptions(), trail: entry.trail, width: 120, height: 84
    }), { now: true });
  }

  /**
   * The ride as it was when the menu opened: the game canvas still holds its
   * last frame, so one copy, cropped to the card around the rider, is all it costs.
   */
  function drawRideSnapshot(target) {
    const source = /** @type {HTMLCanvasElement} */ ($('canvas'));
    const context = target.getContext('2d');
    context.clearRect(0, 0, target.width, target.height);
    if (!source.width || !source.height) return;
    // The card's shape, 45% of the view wide, centred on the rider but kept inside the frame.
    const aspect = target.width / target.height;
    const width = Math.min(source.width * 0.45, source.height * aspect);
    const height = width / aspect;
    const rider = riderOnScreen();
    const x = clamp(rider.x * source.width - width / 2, 0, source.width - width);
    const y = clamp(rider.y * source.height - height * 0.6, 0, source.height - height);
    context.imageSmoothingEnabled = false;
    context.drawImage(source, x, y, width, height, 0, 0, target.width, target.height);
  }

  // Creating a rider takes two steps: who they are (name, gender, skin), then
  // their style. The Garage changes the active rider's style later.
  const customizerHooks = { paint: paintPreview, previewKey: sceneKey, hint: lookItemHint };
  // A new rider starts in their gender's starter gear with a random hair
  // cut, colour and beard, leaning to the gender picked. Until the style is
  // changed by hand, picking another gender rolls new hair; a new skin tone
  // keeps it.
  let creatorStart = DEFAULT_LOOK;
  let creatorTouched = false;
  const rollCreatorLook = (identity, options) => {
    const { hair, hairColor, beard } = randomLook(identity);
    creatorStart = { ...starterLook(identity.gender, identity.skin), hair, hairColor, beard };
    creator.setLook(creatorStart, options);
  };
  const identityPicker = createIdentityPicker($('new-save-identity'), {
    ...customizerHooks,
    onChange: identity => {
      if (!creatorTouched && identity.gender !== creatorStart.gender) rollCreatorLook(identity);
      else {
        const look = keepIdentity(creator.look(), identity);
        if (!creatorTouched) creatorStart = look;
        creator.setLook(look);
      }
    }
  });
  const creator = createCustomizer($('new-save-look'), {
    ...customizerHooks,
    onChange: look => { creatorTouched = !sameLook(look, creatorStart); }
  });
  // The Garage offers what the active rider has unlocked, checked when it opens,
  // with what they have won since they last looked tagged NEW for the visit.
  let garageOwns = lookOwner(null);
  let garageProgress = null;
  let garageFresh = new Set();
  // The bike the Garage shows, so a newly picked one can be heard.
  let garageBike = null;
  const garage = createCustomizer($('garage-look'), {
    ...customizerHooks, onChange: changeGarage, owns: (slot, id) => garageOwns(slot, id),
    // A locked item says how close the rider is, too.
    hint: item => [lookItemHint(item), lookItemProgress(item, garageProgress)].filter(Boolean).join(' · '),
    isNew: (slot, id) => garageFresh.has(slot + ':' + id),
    onSeen: keys => markGearSeen(session.saveGame, keys),
    room: () => garageRoom(session.saveGame),
    onPet: () => sounds.woof()
  });
  garage.actions.append($('save-look'));

  function showSaveStep(step) {
    $('new-save-identity-step').hidden = step !== 1;
    $('new-save-style-step').hidden = step !== 2;
    $('new-save-step-1').classList.toggle('active', step === 1);
    $('new-save-step-2').classList.toggle('active', step === 2);
    $('new-save-title').textContent = step === 1 ? 'Who are you?' : 'Pick your style';
    if (step === 2) creator.refresh();
  }

  /** Checks the rider name before moving on; false (and a marked field) if it won't do. */
  function checkNewSaveName() {
    const name = cleanRiderName(nameInput.value);
    if (name && !disallowedNameChars(nameInput.value).length) return name;
    showSaveStep(1);
    nameInput.classList.add('invalid');
    nameInput.focus();
    return null;
  }

  function syncGarage() {
    $('save-look').disabled = !session.saveGame || sameLook(garage.look(), session.look);
  }

  /** A change in the Garage: a different bike revs, or rings its bell. */
  function changeGarage(look) {
    if (look.bike !== garageBike) {
      garageBike = look.bike;
      sounds.revBike(lookParts(look).bike);
    }
    syncGarage();
  }

  function openGarage() {
    if (!session.saveGame) return;
    // The rider's name, then their gender, in the rider list's symbols.
    const gender = session.look.gender === 'female' ? 'female' : 'male';
    const genderMark = genderBadge(gender);
    const genderText = document.createElement('span');
    genderText.className = 'sr-only';
    genderText.textContent = ', ' + gender;
    const name = document.createElement('span');
    name.className = 'garage-rider-name';
    name.textContent = session.saveGame.name;
    $('garage-rider').replaceChildren(name, genderText, genderMark);
    garageOwns = lookOwner(session.saveGame);
    garageProgress = progressOf(session.saveGame);
    garageFresh = new Set(unseenGear(session.saveGame));
    // Opens on the tab the rider was last on.
    garage.setLook(session.look);
    garageBike = session.look.bike;
    syncGarage();
    showView('look');
  }

  /** True while the Garage shows a look that differs from the saved one. */
  function garageUnsaved() {
    return !$('menu-look-view').hidden && Boolean(session.saveGame) && !sameLook(garage.look(), session.look);
  }

  const lookConfirm = /** @type {HTMLDialogElement} */ ($('look-confirm'));
  const isLookConfirmOpen = () => lookConfirm.open;

  // Leaving the Garage with an unsaved look asks first, so Back never silently drops it.
  function setLookConfirm(open) {
    if (open && !lookConfirm.open) lookConfirm.showModal();
    else if (!open && lookConfirm.open) lookConfirm.close();
    if (open) requestAnimationFrame(() => selectControl($('look-confirm-save')));
  }

  function closeLookConfirm() {
    if (!isLookConfirmOpen()) return false;
    setLookConfirm(false);
    selectControl($('save-look'));
    return true;
  }

  function discardGarageLook() {
    setLookConfirm(false);
    updateDashboard();
    showView('home');
  }

  function saveGarageLook() {
    if (!session.saveGame) return;
    const saved = saveLook(session.activeSaveSlot, trails.length, garage.look(), garageOwns);
    setLookConfirm(false);
    if (!saved) return;
    session.saveSlots[session.activeSaveSlot] = saved;
    session.saveGame = saved;
    session.look = saved.look;
    queueSaveSync(saved);
    updateDashboard();
    showView('home');
  }

  function selectSaveSlot(index) {
    session.activeSaveSlot = clamp(index, 0, session.saveSlots.length - 1);
    saveActiveSlot(session.activeSaveSlot);
    session.saveGame = session.saveSlots[session.activeSaveSlot];
    session.unlockedTrail = unlockedOf(session.saveGame);
    session.savedTrail = session.saveGame?.trail || 0;
    session.look = riderLook();
    updateDashboard();
    onRiderChange();
    refreshNotifications();
  }

  function disarmDelete() {
    clearTimeout(deleteArmTimer);
    deleteArmedSlot = -1;
    document.querySelectorAll('.delete-save.armed').forEach(button => {
      button.classList.remove('armed');
      button.textContent = '×';
      button.setAttribute('aria-label', 'Delete save slot ' + (Number(button.dataset.slot) + 1));
    });
    document.querySelectorAll('.delete-online.armed').forEach(button => {
      button.classList.remove('armed');
      button.textContent = 'DELETE ONLINE';
      button.setAttribute('aria-label', 'Delete ' + button.dataset.name + ' from the world board, for good');
    });
  }

  /**
   * Whether `button` has been pressed twice in a row for slot `index`: the
   * first press only arms it, for three seconds, so a stray tap deletes nothing.
   */
  function armedFor(index, button, armedText, armedLabel) {
    if (deleteArmedSlot === index && button.classList.contains('armed')) return true;
    disarmDelete();
    deleteArmedSlot = index;
    button.textContent = armedText;
    button.classList.add('armed');
    button.setAttribute('aria-label', armedLabel);
    deleteArmTimer = setTimeout(disarmDelete, 3000);
    return false;
  }

  /** Frees a slot on this device and moves on to another rider if it was the active one. */
  function removeSlot(index) {
    deleteSave(index, trails.length);
    session.saveSlots[index] = null;
    if (index === session.activeSaveSlot) {
      const fallback = session.saveSlots.findIndex(Boolean);
      selectSaveSlot(fallback >= 0 ? fallback : index); // also refreshes the dashboard
    } else updateDashboard();
    requestAnimationFrame(() => selectControl($('save-slots').children[index]?.querySelector('.save-slot')));
  }

  function deleteSlot(index, button) {
    if (!armedFor(index, button, 'SURE?', 'Press again to delete save slot ' + (index + 1))) return;
    disarmDelete();
    removeSlot(index);
  }

  /**
   * Deletes an online rider for good: on the server (name, cloud save,
   * passkeys and world-board runs) and then from this device. The rider
   * confirms with their passkey; deleting the slot alone keeps the account.
   */
  async function deleteOnlineRider(index, button) {
    const save = session.saveSlots[index];
    if (!save?.token || accountBusy) return;
    if (!armedFor(index, button, 'SURE? FOR GOOD', 'Press again to delete ' + save.name + ' from the world board, for good')) return;
    disarmDelete();
    setAccountBusy(true);
    setStatus('riders-status', 'Confirm with ' + save.name + '’s passkey…');
    try {
      await deleteRider(save.token);
      dropPendingRuns(save.playerId);
      removeSlot(index);
      setStatus('riders-status', save.name + ' has been deleted from the world board. The name is free again.');
    } catch (error) {
      setStatus('riders-status', accountErrorText(error), true);
    } finally {
      setAccountBusy(false);
      buildSaveSlots();
    }
  }

  function buildSaveSlots() {
    const rows = session.saveSlots.map((save, index) => {
      const row = document.createElement('div');
      row.className = 'save-slot-row';
      const button = document.createElement('button');
      button.className = 'save-slot';
      button.setAttribute('aria-pressed', String(Boolean(save) && index === session.activeSaveSlot));
      const active = save && index === session.activeSaveSlot ? ' · ACTIVE' : '';
      const mode = save ? (save.token ? ' · ONLINE' : save.online ? ' · SIGNED OUT' : ' · OFFLINE') : '';
      const gender = save?.look.gender === 'female' ? 'female' : 'male';
      const copy = document.createElement('span');
      copy.className = 'save-slot-copy';
      const label = document.createElement('span');
      label.className = 'save-label';
      label.textContent = 'SLOT ' + (index + 1) + active + mode;
      const title = document.createElement('strong');
      const detail = document.createElement('small');
      if (save) {
        // The rider's gender before their name, in the creator's symbols.
        const nameLine = document.createElement('span');
        nameLine.className = 'save-slot-name';
        const genderMark = genderBadge(gender);
        const spoken = document.createElement('span');
        spoken.className = 'sr-only';
        spoken.textContent = ', ' + gender;
        title.append(save.name, spoken);
        nameLine.append(genderMark, title);
        detail.textContent = (unlockedOf(save) + 1) + ' / ' + trails.length + ' trails · ' + trails[save.trail].name;
        copy.append(label, nameLine, detail);
        button.append(riderAvatar(save.look), copy);
      } else {
        const avatar = document.createElement('span');
        avatar.className = 'save-avatar empty';
        const plus = document.createElement('span');
        plus.dataset.icon = 'plus';
        plus.setAttribute('aria-hidden', 'true');
        avatar.append(plus);
        title.textContent = 'NEW RIDER';
        detail.textContent = 'Start a fresh career in this slot';
        copy.append(label, title, detail);
        button.append(avatar, copy);
      }
      button.addEventListener('click', () => {
        if (save) { selectSaveSlot(index); showView('home'); return; }
        creatorFromRiders = true;
        showSaveCreator(index);
      });
      row.append(button);
      if (save && !save.token && onlineAvailable) {
        // A signed-out online rider logs back in; an offline one claims its name.
        const link = document.createElement('button');
        link.className = 'link-save';
        link.type = 'button';
        link.textContent = save.online ? 'LOG IN' : 'GO ONLINE';
        link.disabled = accountBusy;
        link.setAttribute('aria-label', (save.online ? 'Log ' + save.name + ' back in' : 'Take ' + save.name + ' online') + ' with a passkey');
        link.addEventListener('click', () => (save.online ? logIn('riders-status') : goOnline(index)));
        row.classList.add('has-link');
        row.append(link);
      }
      if (save?.token && onlineAvailable) {
        // × only frees the slot; this removes the rider from the server too.
        const erase = document.createElement('button');
        erase.className = 'link-save delete-online';
        erase.type = 'button';
        erase.textContent = 'DELETE ONLINE';
        erase.dataset.name = save.name;
        erase.disabled = accountBusy;
        erase.setAttribute('aria-label', 'Delete ' + save.name + ' from the world board, for good');
        erase.addEventListener('click', () => deleteOnlineRider(index, erase));
        row.classList.add('has-link');
        row.append(erase);
      }
      if (save) {
        const remove = document.createElement('button');
        remove.className = 'delete-save';
        remove.type = 'button';
        remove.textContent = '×';
        remove.dataset.slot = String(index);
        remove.setAttribute('aria-label', 'Delete save slot ' + (index + 1));
        remove.addEventListener('click', () => deleteSlot(index, remove));
        row.append(remove);
      }
      return row;
    });
    $('save-slots').replaceChildren(...rows);
  }

  function goBack() {
    if (closeLookConfirm()) return;
    if (garageUnsaved()) { setLookConfirm(true); return; }
    if (!$('menu-save-view').hidden && $('new-save-identity-step').hidden) { showSaveStep(1); return; }
    if (!$('menu-save-view').hidden && creatorFromRiders) { showView('riders'); return; }
    if (!$('menu-credits-view').hidden && creditsFrom === 'settings') { syncSettings(); showView('settings'); return; }
    updateDashboard();
    showView('home');
  }

  /** The guide arc on the How to play art, in the UI's colour (--color-guide in css/tokens.css). */
  const guideColor = () => getComputedStyle(document.documentElement).getPropertyValue('--color-guide').trim();

  // Each card shows its move where it really happens on the official trails.
  const HOW_TO_SCENES = {
    drive: () => {
      const trail = trails[0];
      return { trail, ride: posedRide(trail) };
    },
    lean: () => {
      const climb = findClimb(trails);
      if (!climb) return HOW_TO_SCENES.drive();
      return { trail: climb.trail, ride: posedRide(climb.trail, { x: climb.x, facing: climb.facing, lean: .8 }) };
    },
    air: () => {
      const jump = findJump(trails);
      const trail = jump?.trail ?? trails[0];
      const ride = posedRide(trail, { x: jump?.x ?? trail.start.x, facing: jump?.facing ?? trail.start.facing, air: 16, ground: jump?.lip, lean: -.2 });
      // Higher in the frame, so the lip it took off from shows below.
      return { trail, ride, arc: true, anchor: [.5, .6] };
    },
    goal: () => {
      const trail = trails[0];
      return { trail, ...finishScene(trail) };
    }
  };

  function drawHowToPlayIllustrations() {
    document.querySelectorAll('[data-how-art]').forEach(canvasElement => {
      const kind = canvasElement.dataset.howArt;
      const scene = HOW_TO_SCENES[kind];
      if (!scene) return;
      paintPreview(canvasElement, previewKey('how', kind), image => {
        const { trail, ride, focus, anchor, arc } = scene();
        const view = drawScene(image, { ...sceneOptions(), trail, ride, focus, anchor, width: 240, height: 100 });
        if (!arc) return;
        // The path through the air, as a guide drawn over the scene.
        const context = image.getContext('2d');
        const scale = view.worldToDevice;
        const x = ((ride.rear.x + ride.front.x) / 2 - view.x) * scale;
        const y = ((ride.rear.y + ride.front.y) / 2 - view.y + 12) * scale;
        context.save();
        context.strokeStyle = guideColor(); context.lineWidth = 2 * scale; context.setLineDash([5 * scale, 4 * scale]);
        context.beginPath();
        if (ride.facing > 0) context.arc(x, y, 47 * scale, Math.PI * 1.1, Math.PI * 1.82);
        else context.arc(x, y, 47 * scale, Math.PI * 1.18, Math.PI * 1.9);
        context.stroke();
        context.restore();
      });
    });
  }

  // The game art keeps sprite caches per context, so each canvas gets one
  // set for its lifetime instead of a fresh one on every redraw.
  const gameArts = new WeakMap();
  const gameArtFor = context => {
    let art = gameArts.get(context);
    if (!art) gameArts.set(context, (art = createGameArt(context)));
    return art;
  };

  function drawBackground() {
    const backgroundCanvas = $('menu-background');
    const bounds = backgroundCanvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Resizing clears and reallocates the canvas, so it is only done when the
    // size changes, not on every frame of the drifting clouds.
    const width = Math.round(bounds.width * dpr), height = Math.round(bounds.height * dpr);
    if (backgroundCanvas.width !== width) backgroundCanvas.width = width;
    if (backgroundCanvas.height !== height) backgroundCanvas.height = height;
    const backgroundContext = backgroundCanvas.getContext('2d');
    backgroundContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    backgroundContext.imageSmoothingEnabled = false;
    gameArtFor(backgroundContext).drawBackground({
      width: bounds.width, height: bounds.height,
      palette: trails[session.saveGame?.trail || 0],
      cameraX: 260, cameraY: 0,
      full: session.preferences.scenery === 'full',
      // Moves land on device pixels rather than art pixels, as in the game,
      // so the drifting clouds glide instead of stepping.
      smooth: true,
      sceneTime: reducedMotion ? 0 : performance.now() / 1000
    });
  }

  // The clouds drift in the trail's wind while the menu is open. The browser
  // holds animation frames in a hidden tab, so the loop pauses there too.
  let backgroundFrame = 0;
  function animateBackground() {
    if (backgroundFrame || reducedMotion) return;
    const step = () => {
      backgroundFrame = 0;
      if (!isOpen() || reducedMotion) return;
      drawBackground();
      backgroundFrame = requestAnimationFrame(step);
    };
    backgroundFrame = requestAnimationFrame(step);
  }

  function updateDashboard() {
    const hasSave = Boolean(session.saveGame);
    drawActiveSaveIllustration();
    // One orange card: resume the ride going on, else continue the save, else
    // Start riding takes its place. Retry is in the game's own controls.
    const resumable = canResume();
    const slot = hasSave ? 'SLOT ' + (session.activeSaveSlot + 1) : '';
    $('active-save-label').textContent = resumable ? 'RESUME RIDE' : 'CONTINUE';
    $('active-save-slot').textContent = slot;
    $('active-save-slot').hidden = !slot;
    if (resumable) {
      $('active-save-rider').textContent = session.trail?.name ?? 'Your ride';
      $('active-save-progress').textContent = [hasSave ? session.saveGame.name : '', session.stateBeforeMenu === 'paused' ? 'Paused' : 'Back to the trail']
        .filter(Boolean).join(' · ');
    } else {
      $('active-save-rider').textContent = hasSave ? session.saveGame.name : '';
      $('active-save-progress').textContent = hasSave ? (session.unlockedTrail + 1) + ' / ' + trails.length + ' trails · ' + trails[session.savedTrail].name : '';
    }
    $('menu-trails').disabled = !hasSave && customTrailEntries.length === 0
      && !bonusTrailEntries.some(entry => bonusUnlock(entry).open);
    $('menu-continue').hidden = !hasSave && !resumable;
    $('menu-first-ride').hidden = hasSave;
    $('menu-first-ride').classList.toggle('menu-action-primary', !resumable);
    $('menu-riders').hidden = !hasSave;
    $('menu-garage').hidden = !hasSave;
    $('garage-new-badge').hidden = !hasSave || !unseenGear(session.saveGame).length;
    $('menu-achievements').hidden = !hasSave;
    if (hasSave) $('menu-achievements-detail').textContent = earnedCount(progressOf(session.saveGame)) + ' / ' + ACHIEVEMENTS.length + ' earned';
    buildSaveSlots();
    drawBackground();
    drawHowToPlayIllustrations();
    buildTrailCards();
    syncBell();
  }

  function controls() {
    if (isLookConfirmOpen()) return [...$('look-confirm').querySelectorAll('button')];
    if (panel.open) return [...panel.querySelectorAll('button')];
    const visibleView = document.querySelector('.menu-view:not([hidden])');
    // Skips controls in hidden parts of the view, such as another tab's panel,
    // and ones the stylesheet hides, such as the trail editor on touch screens.
    const list = visibleView ? [...visibleView.querySelectorAll('button:not([disabled]), input:not([disabled])')]
      .filter(control => !control.closest('[hidden]') && control.getClientRects().length > 0) : [];
    // The bell sits above the home view's buttons, so up from the first reaches it.
    return $('notification-bell').hidden ? list : [$('notification-bell'), ...list];
  }

  function selectControl(control) {
    document.querySelectorAll('.menu-selected').forEach(item => item.classList.remove('menu-selected'));
    if (!control) return;
    control.classList.add('menu-selected');
    control.focus({ preventScroll: false });
  }

  function moveSelection(direction) {
    const list = controls();
    if (!list.length) return false;
    const selected = $('menu-screen').querySelector('.menu-selected');
    const current = list.indexOf(selected);
    const next = current < 0 ? 0 : (current + direction + list.length) % list.length;
    selectControl(list[next]);
    sounds.menuMove();
    return true;
  }

  /** LB / RB on a gamepad: the previous or next tab of the open view's tab bar, wrapping round. */
  function stepTab(direction) {
    if (isLookConfirmOpen()) return;
    const tablist = [...document.querySelectorAll('.menu-view:not([hidden]) [role="tablist"]')]
      .find(list => !list.closest('[hidden]'));
    if (!tablist) return;
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const current = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
    const next = /** @type {HTMLElement} */ (tabs[(current + direction + tabs.length) % tabs.length]);
    next.click();
    selectControl(next);
  }

  /** Settings tabs; the one picked stays picked for the next visit. */
  function showSettingsTab(picked) {
    document.querySelectorAll('#menu-settings-view [role="tab"]').forEach(tab => {
      tab.setAttribute('aria-selected', String(tab === picked));
      $(tab.getAttribute('aria-controls')).hidden = tab !== picked;
    });
  }

  // --- History ---------------------------------------------------------------
  // Each view, and the menu itself over a paused ride, gets a history entry,
  // so a phone's back gesture goes back a view instead of leaving the game.
  // View-to-view moves replace the entry, so at most two are ever added.
  // The URL never changes: a share link's hash was already replaced by main.js.
  let fromHistory = false;
  const historyTag = view => ({ hjulben: view });
  function pushView(view) {
    if (fromHistory || typeof history.pushState !== 'function') return;
    const current = history.state?.hjulben;
    if (current && current !== 'menu') history.replaceState(historyTag(view), '');
    else history.pushState(historyTag(view), '');
  }
  /**
   * A ride started from the dashboard gets a history entry of its own, so a
   * phone's back gesture reaches the game (which opens the menu) rather
   * than leaving the page with the ride.
   */
  function markRideStarted() {
    if (typeof history.pushState !== 'function' || history.state?.hjulben) return;
    history.pushState(historyTag('ride'), '');
  }
  function markMenuOpen() {
    if (!canResume() || typeof history.pushState !== 'function') return;
    if (history.state?.hjulben) history.replaceState(historyTag('menu'), '');
    else history.pushState(historyTag('menu'), '');
  }
  window.addEventListener('popstate', () => {
    // Mid-ride, a phone's back gesture opens the menu, as Escape does.
    if (!isOpen()) { if (session.gameLoopStarted) onBack?.(); return; }
    fromHistory = true;
    try {
      if (closeNotifications()) return;
      if (closeTrailPicker(true)) return;
      if ($('menu-home').hidden) goBack();
      else onClose();
    } finally {
      fromHistory = false;
    }
  });

  function showView(view) {
    disarmDelete();
    setTrailPicker(false);
    setLookConfirm(false);
    if (panel.open) panel.close();
    if (view !== 'home') pushView(view);
    $('menu-home').hidden = view !== 'home';
    $('menu-riders-view').hidden = view !== 'riders';
    $('menu-trail-view').hidden = view !== 'trails';
    $('menu-leaderboard-view').hidden = view !== 'leaderboard';
    $('menu-save-view').hidden = view !== 'save';
    $('menu-look-view').hidden = view !== 'look';
    $('menu-how-view').hidden = view !== 'how';
    $('menu-settings-view').hidden = view !== 'settings';
    $('menu-changelog-view').hidden = view !== 'changelog';
    $('menu-credits-view').hidden = view !== 'credits';
    if (view !== 'credits') stopCredits();
    $('menu-achievements-view').hidden = view !== 'achievements';
    // Opened by hand, How to play has no ride waiting; either way it has been seen.
    rideAfterHowTo = null;
    $('how-ride').hidden = true;
    if (view === 'how') saveSeenHowTo();
    syncBell();
    $('menu-scroll').scrollTop = 0;
    requestAnimationFrame(() => {
      const list = controls();
      // The login shortcut is for returning riders, so a new rider starts on the form.
      selectControl(list.find(button => !button.matches('[data-menu-back], #save-login-button, #notification-bell')) || list[0]);
    });
  }

  function open() {
    $('menu-screen').hidden = false;
    markMenuOpen();
    // Catches up with a cloud look that arrived while riding.
    if (session.saveGame) session.look = riderLook();
    syncWhatsNew();
    updateDashboard();
    showView('home');
    animateBackground();
    requestAnimationFrame(() => selectControl($(canResume() || session.saveGame ? 'menu-continue' : 'menu-first-ride')));
    refreshCloudSave();
    refreshNotifications();
  }

  /**
   * Pulls the active online rider's look and progress from the cloud, so a
   * change made on another device shows up here without logging in again.
   */
  async function refreshCloudSave() {
    const slot = session.activeSaveSlot;
    const token = session.saveGame?.token;
    const playerId = session.saveGame?.playerId;
    if (!token) return;
    const cloud = await fetchCloudSave(token, playerId);
    // The rider may have switched slots, signed out, or left the menu
    // meanwhile. (The token itself may have been renewed by this very fetch,
    // so it is the rider that is compared, not the token.)
    if (!cloud || session.activeSaveSlot !== slot || session.saveGame?.playerId !== playerId || !session.saveGame?.token) return;
    if ('signedOut' in cloud) {
      clearSaveToken(slot, trails.length);
      session.saveSlots = loadSaveSlots(trails.length);
      session.saveGame = session.saveSlots[slot];
      if (isOpen()) buildSaveSlots();
      return;
    }
    const result = applyCloudSave(slot, trails.length, cloud);
    if (!result) return;
    if (result.ahead) queueSaveSync(result.save);
    if (!result.changed) return;
    session.saveSlots[slot] = result.save;
    session.saveGame = result.save;
    session.unlockedTrail = unlockedOf(result.save);
    // Mid-ride the rider keeps their look until they are back in the menu.
    if (!isOpen()) return;
    session.look = riderLook();
    // An open Garage keeps the look being edited; Home and the rest redraw.
    if ($('menu-look-view').hidden) updateDashboard();
  }

  function close() {
    setLookConfirm(false);
    if (panel.open) panel.close();
    $('menu-screen').hidden = true;
  }

  // Riders from an earlier version get a NEW badge on What's new until they
  // open it. Brand-new players have nothing to catch up on.
  function syncWhatsNew() {
    let seen = loadSeenVersion();
    if (seen === null && !session.saveSlots?.some(Boolean)) {
      seen = VERSION;
      saveSeenVersion(seen);
    }
    $('whats-new-badge').hidden = seen === VERSION;
    // A new version is news for everyone on the device, once.
    const title = 'Hjulben v' + VERSION;
    if (seen !== VERSION && notificationsFor(null).find(item => item.key === 'version')?.title !== title) {
      notify({
        key: 'version', playerId: null, label: 'NEW VERSION', title,
        text: 'See what’s new in the changelog.', icon: 'update', opens: { view: 'changelog' },
      });
    }
  }

  const CHANGE_LABELS = { 'heads-up': 'HEADS UP', new: 'NEW', improved: 'IMPROVED', fixed: 'FIXED' };

  function buildChangelog() {
    const releases = RELEASES.map((release, index) => {
      const article = document.createElement('article');
      article.className = 'changelog-release';
      const head = document.createElement('header');
      const title = document.createElement('h4');
      title.textContent = 'v' + release.version;
      if (index === 0) {
        const latest = document.createElement('span');
        latest.className = 'changelog-latest';
        latest.textContent = 'LATEST';
        title.append(' ', latest);
      }
      const date = document.createElement('time');
      date.dateTime = release.date;
      date.textContent = new Date(release.date + 'T12:00:00')
        .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      head.append(title, date);
      const list = document.createElement('ul');
      for (const change of release.changes) {
        const item = document.createElement('li');
        const type = document.createElement('b');
        type.className = 'changelog-type';
        type.dataset.type = change.type;
        type.textContent = CHANGE_LABELS[change.type] || change.type.toUpperCase();
        const text = document.createElement('span');
        text.textContent = change.text;
        item.append(type, text);
        list.append(item);
      }
      article.append(head, list);
      return article;
    });
    $('changelog-list').replaceChildren(...releases);
  }

  // --- Notifications ---------------------------------------------------------
  // The bell in the home view's corner counts what the rider hasn't seen, and
  // drops down a panel with the log (see notifications.js). Opening it reads all.

  const panel = /** @type {HTMLDialogElement} */ ($('notification-panel'));
  const riderId = () => session.saveGame?.playerId ?? null;
  // What was unread when it came into the panel: still marked new while it is
  // open, though opening it has read it.
  let newInPanel = new Set();
  // In English like the rest of the game, whatever the browser's language.
  const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  function agoText(at) {
    const minutes = Math.round((at - Date.now()) / 60000);
    if (minutes > -1) return 'just now';
    if (minutes > -60) return relativeTime.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (hours > -24) return relativeTime.format(hours, 'hour');
    return relativeTime.format(Math.round(hours / 24), 'day');
  }

  function syncBell() {
    const count = unreadCount(riderId());
    $('notification-bell').hidden = !isOpen() || $('menu-home').hidden;
    $('notification-bell').setAttribute('aria-label', count ? `Notifications, ${count} unread` : 'Notifications');
    $('notification-count').hidden = !count;
    $('notification-count').textContent = count > 9 ? '9+' : String(count);
  }

  function buildNotifications() {
    const items = notificationsFor(riderId());
    for (const item of items) if (!item.read) newInPanel.add(item.key);
    $('notification-list').replaceChildren(...items.map(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'notification' + (newInPanel.has(item.key) ? ' unread' : '');
      const icon = document.createElement('span');
      icon.dataset.icon = item.icon;
      icon.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('span');
      copy.className = 'notification-copy';
      const label = document.createElement('small');
      label.textContent = item.label + ' · ' + agoText(item.at);
      const title = document.createElement('strong');
      title.textContent = item.title;
      const text = document.createElement('span');
      text.replaceChildren(...keyTextNodes(item.text));
      copy.append(label, title, text);
      button.append(icon, copy);
      button.addEventListener('click', () => openNotification(item));
      return button;
    }));
    $('notification-empty').hidden = items.length > 0;
  }

  function openNotifications() {
    newInPanel = new Set();
    buildNotifications();
    // The panel hangs from the bell, wherever the menu's frame puts it.
    const bell = $('notification-bell').getBoundingClientRect();
    panel.style.setProperty('--drop-top', `${bell.bottom + 12}px`);
    panel.style.setProperty('--drop-right', `${innerWidth - bell.right}px`);
    panel.style.setProperty('--notch-right', `${bell.width / 2 - 7}px`);
    panel.showModal();
    pushView('notifications');
    // Read once shown: the bell clears, while the list still marks what was new.
    markRead(riderId());
    requestAnimationFrame(() => selectControl(controls().find(button => button.id !== 'notification-close') ?? $('notification-close')));
  }

  function closeNotifications() {
    if (!panel.open) return false;
    panel.close();
    return true;
  }

  /** Goes where an entry points: the menu view it is about, or a trail's world board. */
  function openNotification(item) {
    const { opens } = item;
    if (opens.view === 'achievements') { buildAchievements(); showView('achievements'); }
    else if (opens.view === 'garage') { closeNotifications(); openGarage(); }
    else if (opens.view === 'trails') { buildTrailCards(); showView('trails'); }
    else if (opens.view === 'changelog') showChangelog();
    else if (opens.view === 'leaderboard') {
      // By catalog id: the board for the trail as it is now, even after a change.
      const id = opens.trail.replace(/@.*/, '');
      const index = leaderboardTrails().findIndex(entry => entry.id === id);
      if (index >= 0) leaderboardTrail = index;
      buildLeaderboard(true);
      showView('leaderboard');
    }
  }

  /**
   * A log entry for the server's news about another rider's run on one of
   * this rider's trails: one entry per kind and trail, opening its board.
   */
  function boardNotice(playerId, notice, { label, icon, text }) {
    const trail = String(notice.trail);
    const id = trail.replace(/@.*/, '');
    const rival = cleanRiderName(notice.name) || 'Another rider';
    return {
      key: `${notice.kind}:${playerId}:${id}`, playerId, at: Number(notice.at) || Date.now(), label, icon,
      title: leaderboardTrails().find(entry => entry.id === id)?.name ?? 'A trail', text: text(rival),
      opens: { view: 'leaderboard', trail },
    };
  }

  const BOARD_NOTICES = {
    'record-lost': notice => ({
      label: 'WORLD RECORD LOST', icon: 'crown',
      text: rival => `${rival} beat your world record with ${runTimeText(Number(notice.time))}, ahead of your ${runTimeText(Number(notice.was))}.`,
    }),
    'top-ten-lost': notice => ({
      label: 'OUT OF THE TOP TEN', icon: 'arrow-down',
      text: rival => `${rival} pushed you out of the top ten with ${runTimeText(Number(notice.time))}.`,
    }),
  };

  let fetchingNotifications = false;
  // Asked again while fetching, maybe for another rider: fetch once more after.
  let notificationsAskedAgain = false;

  /** Takes the active online rider's news from the server into the log. */
  async function refreshNotifications() {
    if (fetchingNotifications) { notificationsAskedAgain = true; return; }
    const save = session.saveGame;
    if (!save?.token) return;
    fetchingNotifications = true;
    try {
      let page;
      do {
        page = await fetchNotifications(save.token, save.playerId, lastNoticeId(save.playerId));
        for (const notice of page?.notices ?? []) {
          const kind = BOARD_NOTICES[notice.kind];
          if (kind) notify(boardNotice(save.playerId, notice, kind(notice)));
          setLastNoticeId(save.playerId, notice.id);
        }
      } while (page?.more);
    } finally {
      fetchingNotifications = false;
      if (notificationsAskedAgain) { notificationsAskedAgain = false; refreshNotifications(); }
    }
  }

  $('notification-bell').addEventListener('click', openNotifications);
  $('notification-close').addEventListener('click', closeNotifications);
  // A click on the menu outside the panel lands on its backdrop, and closes it.
  panel.addEventListener('click', event => { if (event.target === panel) closeNotifications(); });
  panel.addEventListener('close', () => {
    syncBell();
    if (isOpen() && !$('menu-home').hidden) selectControl($('notification-bell'));
  });
  window.addEventListener(NOTIFICATIONS_EVENT, () => {
    syncBell();
    // News that arrives while the panel is open shows there, and counts as read.
    if (panel.open && unreadCount(riderId())) { buildNotifications(); markRead(riderId()); }
  });

  // --- Credits ---------------------------------------------------------------

  /** Where the credits were opened from, so Back returns there: Settings, or home after the career. */
  let creditsFrom = 'settings';
  let creditsRoll = null;

  /** Bonus trail makers, from the trails' own author credit, so a new maker is listed automatically. */
  function bonusTrailMakers() {
    const makers = new Map();
    for (const entry of bonusTrailEntries) {
      const author = entry.trail.author?.trim();
      if (!author) continue;
      if (!makers.has(author)) makers.set(author, []);
      makers.get(author).push(entry.trail.name);
    }
    return [...makers];
  }

  /** Coda as the game draws him in the woods, for his line in the credits. */
  let codaCanvas = null;
  function codaPortrait() {
    if (codaCanvas) return codaCanvas;
    const canvasElement = document.createElement('canvas');
    canvasElement.className = 'credits-coda';
    canvasElement.width = 72;
    canvasElement.height = 44;
    canvasElement.setAttribute('aria-hidden', 'true');
    const context = canvasElement.getContext('2d');
    context.imageSmoothingEnabled = false;
    gameArtFor(context).drawProp('corgi', 36, 40);
    codaCanvas = canvasElement;
    return canvasElement;
  }

  function buildCredits() {
    const block = (role, ...lines) => {
      const section = document.createElement('section');
      section.className = 'credits-block';
      if (role) {
        const heading = document.createElement('h4');
        heading.textContent = role;
        section.append(heading);
      }
      for (const line of lines) section.append(line);
      return section;
    };
    const text = (tag, content, className = '') => {
      const node = document.createElement(tag);
      node.textContent = content;
      if (className) node.className = className;
      return node;
    };
    const logo = document.createElement('span');
    logo.className = 'credits-logo';
    logo.dataset.icon = 'logo';
    logo.setAttribute('aria-hidden', 'true');
    const makers = bonusTrailMakers();
    $('credits-roll').replaceChildren(
      block('', logo, text('strong', 'Hjulben', 'credits-title')),
      block('A GAME BY', text('strong', 'Julian Bo Bendtsen'),
        text('p', 'Design, code, physics, pixel art, sound and trails')),
      ...(makers.length ? [block('BONUS TRAILS', ...makers.flatMap(([author, names]) => [
        text('strong', author), text('p', names.join(' · '))
      ]))] : []),
      block('CHIEF MORALE OFFICER', codaPortrait(), text('strong', 'Coda the corgi'),
        text('p', 'For the company on every late night, and for riding along on the trails')),
      block('WITH LOVE AND THANKS TO', text('strong', 'Emilie'),
        text('p', 'For the patience with all the late nights and “just one more trail”')),
      block('BUILT WITH THE HELP OF', text('strong', 'AI tools'),
        text('p', 'Including Claude by Anthropic, as a coding partner')),
      block('TYPE', text('strong', 'Jersey 10'),
        text('p', 'By The Soft Type Project, under the SIL Open Font License')),
      block('', text('strong', 'Thanks for riding', 'credits-end')),
    );
  }

  /** Rolls the credits up through the frame, ending on "Thanks for riding". */
  function rollCredits() {
    stopCredits();
    const frame = $('credits');
    const roll = $('credits-roll');
    // Still motion off: the list simply scrolls.
    frame.classList.toggle('credits-still', reducedMotion);
    $('credits-hint').textContent = reducedMotion ? 'Scroll to read · Back to leave' : 'Hold to pause · Back to leave';
    if (reducedMotion || typeof roll.animate !== 'function') return;
    const height = frame.clientHeight;
    // From just below the frame to the last line resting in its middle.
    const from = height;
    const to = height / 2 - roll.scrollHeight + (roll.lastElementChild?.offsetHeight ?? 0) / 2;
    const PIXELS_PER_SECOND = 40;
    creditsRoll = roll.animate(
      [{ transform: `translateY(${from}px)` }, { transform: `translateY(${to}px)` }],
      { duration: ((from - to) / PIXELS_PER_SECOND) * 1000, easing: 'linear', fill: 'forwards' }
    );
  }

  function stopCredits() {
    creditsRoll?.cancel();
    creditsRoll = null;
  }

  /** Opens the credits: from Settings, or after the last official trail, when Back goes home. */
  function showCredits(from = 'settings') {
    creditsFrom = from;
    buildCredits();
    showView('credits');
    // After the view is laid out, so the frame has its height.
    requestAnimationFrame(rollCredits);
  }

  // Holding the pointer (or a finger) on the credits pauses them.
  const pauseCredits = () => creditsRoll?.pause();
  const playCredits = () => { if (creditsRoll?.playState === 'paused') creditsRoll.play(); };
  $('credits').addEventListener('pointerdown', pauseCredits);
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) $('credits').addEventListener(type, playCredits);

  function showChangelog() {
    buildChangelog();
    saveSeenVersion(VERSION);
    $('whats-new-badge').hidden = true;
    markRead(null, ['version']);
    showView('changelog');
  }

  const earnedCount = progress => ACHIEVEMENTS.filter(a => progress.has(a.id)).length;

  /** One achievement: earned, locked, counting towards its goal, or a secret. */
  function achievementRow(achievement, progress) {
    const earned = progress.has(achievement.id);
    const hidden = achievement.secret && !earned;
    const row = document.createElement('div');
    row.className = 'achievement' + (earned ? ' earned' : '');
    const icon = document.createElement('span');
    icon.className = 'achievement-icon';
    icon.dataset.icon = hidden ? 'lock' : achievement.icon;
    icon.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    copy.className = 'achievement-copy';
    const name = document.createElement('strong');
    name.textContent = hidden ? 'SECRET' : achievement.name.toUpperCase();
    const blurb = document.createElement('small');
    blurb.replaceChildren(...keyTextNodes(hidden ? achievement.hint ?? 'Keep riding to find out.' : achievement.blurb));
    copy.append(name, blurb);
    const state = document.createElement('span');
    state.className = 'achievement-state';
    if (earned) {
      const check = document.createElement('span');
      check.dataset.icon = 'check';
      state.append(check);
      state.setAttribute('aria-label', 'Earned');
    } else if (achievement.stat) {
      const count = Math.min(progress.stats[achievement.stat] || 0, achievement.goal);
      state.textContent = statProgressText(achievement, count);
      const bar = document.createElement('span');
      bar.className = 'achievement-bar';
      bar.style.setProperty('--progress', String(count / achievement.goal));
      copy.append(bar);
    } else {
      state.textContent = 'LOCKED';
    }
    row.append(icon, copy, state);
    return row;
  }

  function buildAchievements() {
    const progress = progressOf(session.saveGame);
    if (!progress) return;
    $('achievements-summary').textContent = session.saveGame.name + ' has earned ' + earnedCount(progress)
      + ' of ' + ACHIEVEMENTS.length + ' achievements. Each rider earns their own.';
    const items = [];
    for (const group of ACHIEVEMENT_GROUPS) {
      items.push(trailSection(group.title, group.blurb));
      for (const achievement of ACHIEVEMENTS) if (achievement.group === group.id) items.push(achievementRow(achievement, progress));
    }
    $('achievement-list').replaceChildren(...items);
  }

  // Views with only a Back button, where the arrow keys scroll instead.
  const scrollsWithArrows = () => !$('menu-changelog-view').hidden || !$('menu-achievements-view').hidden;

  function trailSection(title, description) {
    const heading = document.createElement('div');
    heading.className = 'trail-section-title';
    const strong = document.createElement('strong');
    strong.textContent = title;
    const small = document.createElement('small');
    small.textContent = description;
    heading.append(strong, small);
    return heading;
  }

  function trailCard({ trail, key, number, status, best = null, locked = false, kind = 'official', nisse = false, onSelect }) {
    const button = document.createElement('button');
    button.className = `trail-card${kind === 'official' ? '' : ` ${kind}-trail-card`}`;
    button.disabled = locked;
    const preview = document.createElement('canvas');
    preview.className = 'trail-preview';
    preview.setAttribute('aria-hidden', 'true');
    // Where the author framed it, else its most eventful stretch; zoomed
    // out, without a rider. The framing is in the key: it doesn't change the hash.
    const framing = trail.preview ? `${trail.preview.x},${trail.preview.y}` : 'auto';
    paintPreview(preview, previewKey('trail', key, framing), image => drawTrailPreview(image, trail, sceneOptions()));
    const numberLabel = document.createElement('span');
    numberLabel.className = 'trail-number';
    numberLabel.textContent = number;
    const copy = document.createElement('span');
    copy.className = 'trail-copy';
    const name = document.createElement('strong');
    name.textContent = trail.name.toUpperCase();
    const detail = document.createElement('small');
    const author = normalizeAuthor(trail.author);
    detail.textContent = author ? status + ' · BY ' + author.toUpperCase() : status;
    copy.append(name, detail);
    const bestLabel = document.createElement('span');
    bestLabel.className = 'trail-best';
    bestLabel.textContent = best === null ? '—' : runTimeText(best);
    const medal = best === null ? null : medalFor(trail.medals, best);
    if (medal) {
      bestLabel.dataset.medal = medal;
      bestLabel.dataset.iconAfter = 'medal';
      bestLabel.title = medal + ' medal';
    }
    button.append(preview, numberLabel, copy, bestLabel);
    // Which trails hide a nisse is a secret: the badge only shows once this
    // rider has found it.
    if (trail.nisse && nisse) {
      const badge = document.createElement('span');
      badge.className = 'trail-nisse';
      // The icon paints its own background, so it sits inside the badge's frame.
      const icon = document.createElement('span');
      icon.dataset.icon = 'nisse';
      icon.setAttribute('aria-hidden', 'true');
      badge.append(icon);
      badge.title = 'Nisse found';
      badge.setAttribute('aria-label', badge.title);
      button.append(badge);
    }
    if (!locked) button.addEventListener('click', onSelect);
    return button;
  }

  /** Whether the active rider has found a trail's nisse; never, without a rider. */
  const nisseFound = entry => Boolean(session.saveGame) && hasNisse(session.activeSaveSlot, nisseKey(entry), trails.length);

  function buildTrailCards() {
    const cards = [trailSection('OFFICIAL TRAILS', 'Career progression and official best times')];
    trails.forEach((trail, index) => {
      const locked = !session.saveGame || index > session.unlockedTrail;
      cards.push(trailCard({
        trail,
        key: trailKey(officialTrailEntries[index]),
        number: String(index + 1).padStart(2, '0'),
        status: locked ? 'LOCKED' : (index === session.savedTrail ? 'CURRENT TRAIL' : 'UNLOCKED'),
        best: readBest(session.activeSaveSlot, trailKey(officialTrailEntries[index]), trails.length),
        locked,
        nisse: nisseFound(officialTrailEntries[index]),
        onSelect: () => startTrail(index)
      }));
    });
    if (bonusTrailEntries.length) {
      cards.push(trailSection('BONUS TRAILS', 'Extra trails outside career progression, with best times and world boards'));
      bonusTrailEntries.forEach((entry, index) => {
        const key = trailKey(entry);
        const { open, hint } = bonusUnlock(entry);
        cards.push(trailCard({
          trail: entry.trail,
          key,
          number: `B${String(index + 1).padStart(2, '0')}`,
          status: open ? 'BONUS TRAIL' : hint,
          best: session.saveGame ? readBest(session.activeSaveSlot, key, trails.length) : topTime(key),
          locked: !open,
          kind: 'bonus',
          nisse: nisseFound(entry),
          onSelect: () => startBonus(index)
        }));
      });
    }
    if (customTrailEntries.length) {
      cards.push(trailSection('CUSTOM TRAILS', 'Local trails outside career progression'));
      customTrailEntries.forEach((entry, index) => cards.push(trailCard({
        trail: entry.trail,
        key: trailKey(entry),
        number: `C${String(index + 1).padStart(2, '0')}`,
        status: entry.storage === 'browser' ? 'CUSTOM · SAVED IN BROWSER' : 'CUSTOM TRAIL',
        best: topTime(trailKey(entry)),
        kind: 'custom',
        nisse: nisseFound(entry),
        onSelect: () => startCustom(index)
      })));
    }
    $('menu-trail-grid').replaceChildren(...cards);
  }

  const BOARD_FAILED_NOTE = 'Couldn’t reach the world board · showing runs from this device';

  /** A line under the board about what went wrong, or none. */
  function showBoardNote(text) {
    $('leaderboard-offline').textContent = text;
    $('leaderboard-offline').hidden = !text;
  }

  /** Whether the player may open a trail, and so watch runs on it. */
  function canWatch(entry) {
    if (entry.source === 'official') return Boolean(session.saveGame) && officialTrailEntries.indexOf(entry) <= session.unlockedTrail;
    if (entry.source === 'bonus') return bonusUnlock(entry).open;
    return true;
  }

  /**
   * How to get the recorded run behind a board row, or null when it can't be
   * watched: this device's best or the world's at once, or another world
   * rider's from the server when asked for.
   * @returns {(() => Promise<object | null>) | null}
   */
  function replayFor(run, key) {
    const same = replay => replay?.physics === RIDE_VERSION && Math.abs(replay.time - run.time) < .001;
    const local = readGhost(key);
    if (same(local)) return () => Promise.resolve(local);
    const world = settledWorldGhost(key);
    if (same(world) && (!run.name || run.name === world.name)) return () => Promise.resolve(world);
    if (!run.replay || !run.name) return null;
    // The rider may have gone faster since: their latest best is shown then.
    return () => fetchRiderGhost(key, run.name, run.time).then(replay => (replay?.physics === RIDE_VERSION ? replay : null));
  }

  /**
   * @param {object | undefined} run
   * @param {number} rank its rank, or its place on the board for an open row
   * @param {(() => Promise<object | null>) | null} [replay]
   */
  function leaderboardRow(run, rank, loading = false, entry = null, replay = null) {
    const row = document.createElement('li');
    row.className = 'leaderboard-row' + (rank <= 3 && run ? ' podium-' + rank : '') + (run ? '' : ' open');
    const rankLabel = document.createElement('span');
    rankLabel.className = 'leaderboard-rank';
    rankLabel.textContent = String(rank).padStart(2, '0');
    if (!run) {
      const empty = document.createElement('span');
      empty.className = 'leaderboard-open';
      empty.textContent = rank > 1 ? '— — —' : loading ? 'LOADING RUNS…' : 'NO RUNS YET · FINISH THE TRAIL TO CLAIM IT';
      row.append(rankLabel, empty);
      return row;
    }
    // This device's runs carry the save's id. World runs only carry a name,
    // which is reserved for an online rider, so it is only trusted for one.
    const mine = Boolean(session.saveGame && (
      (run.saveId && run.saveId === session.saveGame.createdAt) ||
      (run.playerId && run.playerId === session.saveGame.playerId) ||
      (run.name && session.saveGame.token && run.name === session.saveGame.name)
    ));
    row.classList.toggle('mine', mine);
    const avatar = riderAvatar(run.look);
    // The rider's gender before their name, as in the rider list.
    const gender = run.look?.gender === 'female' ? 'female' : 'male';
    const genderMark = genderBadge(gender);
    const copy = document.createElement('span');
    copy.className = 'leaderboard-copy';
    const name = document.createElement('strong');
    name.textContent = runnerName(run.name);
    const spoken = document.createElement('span');
    spoken.className = 'sr-only';
    spoken.textContent = ', ' + gender;
    name.append(spoken);
    const detail = document.createElement('small');
    const date = run.date ? new Date(run.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase() : 'CAREER BEST';
    detail.textContent = (run.name && run.slot === null ? 'ONLINE' : run.slot === null ? 'NO SAVE' : 'SLOT ' + (run.slot + 1)) + ' · ' + date;
    const nameLine = document.createElement('span');
    nameLine.className = 'save-slot-name';
    nameLine.append(genderMark, name);
    if (mine) {
      // Outside the name, so a long name is cut short and the tag stays whole.
      const you = document.createElement('span');
      you.className = 'leaderboard-you';
      you.textContent = '· YOU';
      nameLine.append(you);
    }
    copy.append(nameLine, detail);
    const time = document.createElement('span');
    time.className = 'leaderboard-time';
    time.textContent = runTimeText(run.time);
    row.append(rankLabel, avatar, copy, time);
    if (replay) {
      const watch = document.createElement('button');
      watch.type = 'button';
      watch.className = 'leaderboard-watch';
      watch.setAttribute('aria-label', 'Watch the run by ' + runnerName(run.name));
      watch.title = 'Watch replay';
      const icon = document.createElement('span');
      icon.dataset.icon = 'play';
      icon.setAttribute('aria-hidden', 'true');
      watch.append(icon);
      watch.addEventListener('click', async () => {
        watch.disabled = true;
        const data = await replay();
        watch.disabled = false;
        // The player may have left the board, or moved to another, while it loaded.
        if (!isBoardShown() || shownBoardKey() !== trailKey(entry)) return;
        if (data) onWatchReplay({ entry, data, name: runnerName(run.name) });
        else showBoardNote('Couldn’t load that run · Try again');
      });
      row.classList.add('watchable');
      row.append(watch);
    }
    return row;
  }

  /** @param {boolean} [fresh] the player brought this board up, so fetch its latest runs */
  function buildLeaderboard(fresh = false) {
    const trails = leaderboardTrails();
    leaderboardTrail = (leaderboardTrail + trails.length) % trails.length;
    const entry = trails[leaderboardTrail];
    const key = trailKey(entry);
    if (fresh) refreshOnlineBoard(key, BOARD_VIEW_MAX_AGE);
    const runs = readLeaderboard(key);
    // Wait for the online board instead of showing local times that it then replaces.
    const loading = isOnlineBoardLoading(key);
    $('leaderboard-trail-number').textContent = trailMarker(leaderboardTrail);
    $('leaderboard-trail-name').textContent = entry.name.toUpperCase();
    const author = normalizeAuthor(entry.trail?.author);
    const standing = loading ? null : onlineBoardStanding(key);
    $('leaderboard-trail-meta').textContent = entry.source.toUpperCase() + ' TRAIL'
      + (author ? ' · BY ' + author.toUpperCase() : '')
      + (standing?.total ? ' · ' + standing.total + (standing.total === 1 ? ' RIDER' : ' RIDERS') : '')
      + ' · ' + (leaderboardTrail + 1) + ' / ' + trails.length;
    const watchable = canWatch(entry);
    const row = (run, place) => leaderboardRow(run, run?.rank ?? place, loading, entry, run && watchable ? replayFor(run, key) : null);
    const rows = Array.from({ length: LEADERBOARD_SIZE }, (_, index) => row(loading ? undefined : runs[index], index + 1));
    // A rider below the top sees their own row too, between the riders either side.
    const near = standing?.near ?? [];
    if (near.length) {
      const gap = document.createElement('li');
      gap.className = 'leaderboard-gap';
      gap.setAttribute('aria-hidden', 'true');
      gap.textContent = '⋯';
      rows.push(gap, ...near.map(run => row(run, run.rank)));
    }
    $('leaderboard-list').replaceChildren(...rows);
    // An unreachable world board falls back to this device's runs, and says so.
    const failed = !loading && isOnlineTrail(key) && boardStatus(key) === 'failed';
    showBoardNote(failed ? BOARD_FAILED_NOTE : '');
  }

  function stepLeaderboard(direction) {
    closeTrailPicker();
    leaderboardTrail += direction;
    buildLeaderboard(true);
  }

  const isTrailPickerOpen = () => !$('leaderboard-picker').hidden;

  function setTrailPicker(open) {
    $('leaderboard-picker').hidden = !open;
    $('leaderboard-list').hidden = open;
    $('menu-leaderboard-view').querySelector('.leaderboard-help').hidden = open;
    $('leaderboard-offline').hidden = open || !$('leaderboard-offline').textContent;
    $('leaderboard-trail-pick').setAttribute('aria-expanded', String(open));
  }

  function closeTrailPicker(focusTrail = false) {
    if (!isTrailPickerOpen()) return false;
    setTrailPicker(false);
    if (focusTrail) selectControl($('leaderboard-trail-pick'));
    return true;
  }

  function pickerSection(source) {
    return {
      official: ['OFFICIAL TRAILS', 'Career trails'],
      bonus: ['BONUS TRAILS', 'Extra shipped trails'],
      custom: ['CUSTOM TRAILS', 'Runs on this device']
    }[source] || [source.toUpperCase() + ' TRAILS', ''];
  }

  /**
   * The active rider's own time under a trail in the picker: with their world
   * rank once the server has sent it, their place on this device's board for
   * a custom trail, or else just their best.
   */
  function fillPickStanding(button) {
    const entry = leaderboardTrails()[Number(button.dataset.index)];
    const key = trailKey(entry);
    const save = session.saveGame;
    const world = myStanding(key);
    const local = entry.source === 'custom' && save ? readLeaderboard(key).find(run => run.saveId === save.createdAt) : null;
    const best = world?.time ?? local?.time ?? (save && entry.source !== 'custom' ? readBest(session.activeSaveSlot, key, trails.length) : null);
    const place = world ? ' · #' + world.rank + ' / ' + world.total : local ? ' · #' + local.rank : '';
    const yours = button.querySelector('.leaderboard-pick-copy small');
    yours.textContent = best == null ? '' : 'YOU ' + runTimeText(best) + place;
    yours.hidden = best == null;
  }

  /** Lists every trail with a board, so one can be picked without stepping through the rest. */
  function openTrailPicker() {
    refreshMyStandings();
    const items = [];
    let section = null;
    let current = null;
    leaderboardTrails().forEach((entry, index) => {
      if (entry.source !== section) {
        section = entry.source;
        items.push(trailSection(...pickerSection(section)));
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `leaderboard-pick ${entry.source}-pick`;
      const number = document.createElement('span');
      number.className = 'trail-number';
      number.textContent = trailMarker(index);
      const copy = document.createElement('span');
      copy.className = 'leaderboard-pick-copy';
      const name = document.createElement('strong');
      name.textContent = entry.name.toUpperCase();
      const yours = document.createElement('small');
      copy.append(name, yours);
      const best = document.createElement('span');
      best.className = 'trail-best';
      const top = topTime(trailKey(entry));
      best.textContent = top == null ? '—' : runTimeText(top);
      button.dataset.index = String(index);
      button.append(number, copy, best);
      fillPickStanding(button);
      if (index === leaderboardTrail) {
        button.setAttribute('aria-current', 'true');
        current = button;
      }
      button.addEventListener('click', () => {
        leaderboardTrail = index;
        buildLeaderboard(true);
        closeTrailPicker(true);
      });
      items.push(button);
    });
    $('leaderboard-picker').replaceChildren(...items);
    setTrailPicker(true);
    requestAnimationFrame(() => selectControl(current));
  }

  function currentLeaderboardTrail() {
    if (session.trailSource === 'bonus' && session.bonusTrailIndex >= 0) return officialTrailEntries.length + session.bonusTrailIndex;
    if (session.trailSource === 'custom' && session.customTrailIndex >= 0) {
      return officialTrailEntries.length + bonusTrailEntries.length + session.customTrailIndex;
    }
    return session.gameLoopStarted ? session.trailIndex : session.savedTrail;
  }

  function showSaveCreator(slotIndex) {
    pendingSaveSlot = slotIndex;
    $('new-save-slot-label').textContent = 'SAVE SLOT ' + (slotIndex + 1);
    $('new-save-name').value = '';
    $('new-save-name').classList.remove('invalid');
    setStatus('save-status', '');
    setStatus('save-login-status', '');
    // A new rider starts online, on the world leaderboard with their progress
    // backed up; setSaveMode falls back to offline where passkeys aren't
    // available.
    setSaveMode('online');
    setNewSaveGhost(DEFAULT_PREFERENCES.ghost);
    // The skin tone starts random too; the player can pick another.
    const skins = itemsForSlot('skin');
    const identity = { gender: DEFAULT_LOOK.gender, skin: skins[Math.floor(Math.random() * skins.length)].id };
    identityPicker.setIdentity(identity);
    creatorTouched = false;
    rollCreatorLook(identity, { tab: 'hair' });
    showSaveStep(1);
    showView('save');
  }

  // --- Online riders ---------------------------------------------------------

  /** A live region, so only its text changes: hiding it would mute it (.account-status:empty hides an empty one). */
  function setStatus(id, text, isError = false) {
    const status = $(id);
    status.textContent = text;
    status.classList.toggle('error', isError);
  }

  function setAccountBusy(busy) {
    accountBusy = busy;
    for (const id of ['create-save', 'save-login-button', 'riders-login-button']) $(id).disabled = busy;
    document.querySelectorAll('.link-save, .delete-online').forEach(button => { button.disabled = busy; });
  }

  function setSaveMode(mode) {
    saveMode = onlineAvailable ? mode : 'offline';
    const online = saveMode === 'online';
    document.querySelectorAll('[data-save-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.saveMode === saveMode));
    });
    $('save-mode').hidden = !onlineAvailable;
    $('save-login').hidden = !onlineAvailable;
    // Only online riders are asked: the world's best is what they signed up to chase.
    $('save-ghost').hidden = !online;
    $('save-mode-help').textContent = online
      ? 'Your name is yours alone on the world leaderboard. Sign in with a passkey (fingerprint, face or device PIN) to back up your progress.'
      : 'Stays in this browser only: no world leaderboard, and clearing site data deletes it. You can take it online later from Riders.';
    $('create-save').textContent = online ? 'Create Passkey & Ride' : 'Create Save & Ride';
  }

  function setNewSaveGhost(mode) {
    newSaveGhost = mode;
    document.querySelectorAll('[data-save-ghost]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.saveGhost === mode));
    });
  }

  function useNewSave(index, save) {
    session.saveSlots[index] = save;
    selectSaveSlot(index);
    queueSaveSync(save);
  }

  async function createOnlineSave(name) {
    setAccountBusy(true);
    setStatus('save-status', 'Confirm with your passkey…');
    try {
      const look = creator.look();
      const { token, player } = await registerRider(name, look);
      const save = createSave(pendingSaveSlot, look, trails.length, player.name, { playerId: player.id, token }, newSaveGhost);
      if (!save) {
        // The passkey exists now, so the rider is not lost: it logs in like any other.
        showView('riders');
        setStatus('riders-status', `Rider “${player.name}” was created, but slot ${pendingSaveSlot + 1} is full. Log in with your passkey to use it.`, true);
        return;
      }
      session.unlockedTrail = 0; session.savedTrail = 0;
      useNewSave(pendingSaveSlot, save);
      startTrail(0);
    } catch (error) {
      setStatus('save-status', accountErrorText(error), true);
      if (error.message === 'name taken' || error.message === 'name not allowed' || error.message === 'invalid name') {
        showSaveStep(1);
        $('new-save-name').classList.add('invalid');
      }
    } finally {
      setAccountBusy(false);
    }
  }

  /** Signs in with a passkey and puts that rider into a slot, with their cloud save and ghosts. */
  async function logIn(statusId) {
    if (accountBusy) return;
    setAccountBusy(true);
    setStatus(statusId, 'Choose your passkey…');
    try {
      const account = await loginRider();
      const index = restoreOnlineSave(trails.length, account);
      if (index < 0) {
        setStatus(statusId, 'All rider slots are full. Delete a rider, then log in again.', true);
        return;
      }
      session.saveSlots = loadSaveSlots(trails.length);
      useNewSave(index, session.saveSlots[index]);
      showView('home');
    } catch (error) {
      setStatus(statusId, accountErrorText(error), true);
    } finally {
      setAccountBusy(false);
    }
  }

  /** Claims an offline save's name online, then sends its best runs to the world board. */
  async function goOnline(index) {
    const save = session.saveSlots[index];
    if (!save || save.token || accountBusy) return;
    setAccountBusy(true);
    setStatus('riders-status', 'Confirm with your passkey…');
    try {
      const { token, player } = await registerRider(save.name, save.look);
      const linked = linkSave(index, trails.length, { playerId: player.id, token, name: player.name });
      session.saveSlots[index] = linked;
      if (index === session.activeSaveSlot) session.saveGame = linked;
      queueSaveSync(linked);
      buildSaveSlots();
      setStatus('riders-status', `${linked.name} is online. Sending best runs…`);
      // The best runs go through the waiting queue: the server takes only so
      // many a minute, and whatever it can't take now is sent later.
      let queued = 0;
      for (const entry of [...officialTrailEntries, ...bonusTrailEntries]) {
        const key = trailKey(entry);
        const ghost = readGhost(key);
        // Ghosts are shared by every save on this device, so only send the
        // one that set this save's best time, and never one the game ran in
        // slow motion for.
        if (!ghost || ghost.physics !== RIDE_VERSION || ghost.slow || ghost.time !== linked.bestTimes[key]) continue;
        if (queuePendingRun(key, { look: linked.look, playerId: linked.playerId, time: ghost.time, run: { inputs: ghost.inputs, seed: ghost.seed, physics: ghost.physics } })) queued++;
      }
      const sent = await flushPendingRuns(id => session.saveSlots.find(save => save?.playerId === id)?.token ?? null);
      const waiting = queued - sent;
      setStatus('riders-status', `${linked.name} is online.`
        + (sent ? ` ${sent} best ${sent === 1 ? 'run is' : 'runs are'} on the world leaderboard.` : '')
        + (waiting > 0 ? ` ${waiting} more will be sent shortly.` : ''));
    } catch (error) {
      setStatus('riders-status', error.message === 'name taken'
        ? `“${save.name}” is already taken online. If it’s yours, log in below; otherwise create a new online rider.`
        : accountErrorText(error), true);
    } finally {
      setAccountBusy(false);
    }
  }

  function setImportStatus(text, isError = false) {
    $('import-trail-status').textContent = text;
    $('import-trail-status').classList.toggle('error', isError);
  }

  /** Opens the trail list with a message by Import trail, such as why a share link failed. */
  function showTrailsStatus(text, isError = false) {
    buildTrailCards();
    showView('trails');
    setImportStatus(text, isError);
  }

  /** Sets the ghost to race, for the active rider (synced to their other devices) and as this device's setting. */
  function setGhostMode(mode) {
    session.preferences.ghost = mode;
    if (!session.saveGame) return;
    const saved = saveGhostMode(session.activeSaveSlot, trails.length, mode);
    if (!saved) return;
    session.saveSlots[session.activeSaveSlot] = saved;
    session.saveGame = saved;
    queueSaveSync(saved);
  }

  function persistPreferences() {
    savePreferences(session.preferences);
    onPreferences();
    syncSettings();
  }

  function buildKeyBindings() {
    const { bindings } = session.preferences;
    const buttons = Object.entries(ACTION_LABELS).map(([action, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'key-binding';
      const name = document.createElement('span');
      name.textContent = label;
      const keys = document.createElement('kbd');
      keys.textContent = bindings[action].map(keyLabel).join(' / ') || '—';
      button.append(name, keys);
      button.setAttribute('aria-label', label + ': ' + keys.textContent + '. Select to change.');
      button.addEventListener('click', () => {
        button.classList.add('listening');
        keys.textContent = 'PRESS A KEY';
        input.captureNextKey(code => {
          if (code) {
            const next = {};
            for (const [other, codes] of Object.entries(bindings)) next[other] = codes.filter(existing => existing !== code);
            next[action] = [code];
            session.preferences.bindings = next;
            persistPreferences();
          } else buildKeyBindings();
          requestAnimationFrame(() => selectControl($('key-bindings').children[Object.keys(ACTION_LABELS).indexOf(action)]));
        });
      });
      return button;
    });
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'menu-back key-reset';
    reset.textContent = 'RESET KEYS';
    reset.dataset.iconBefore = 'undo';
    reset.addEventListener('click', () => {
      session.preferences.bindings = structuredClone(DEFAULT_BINDINGS);
      persistPreferences();
    });
    $('key-bindings').replaceChildren(...buttons, reset);
  }

  // Gamepad buttons aren't remappable, so the diagram is drawn once.
  $('gamepad-diagram').append(...createGamepadDiagram());

  /** Rumble is offered while a gamepad that can rumble is connected. */
  function syncRumbleSetting() {
    const pads = typeof navigator.getGamepads === 'function' ? [...navigator.getGamepads()] : [];
    $('setting-rumble-group').hidden = !pads.some(canRumble);
  }
  window.addEventListener('gamepadconnected', syncRumbleSetting);
  window.addEventListener('gamepaddisconnected', syncRumbleSetting);

  function syncSettings() {
    syncRumbleSetting();
    document.querySelectorAll('[data-setting]').forEach(button => {
      const value = button.dataset.setting === 'ghost' ? ghostMode() : session.preferences[button.dataset.setting];
      button.setAttribute('aria-pressed', String(value === button.dataset.value));
    });
    $('setting-volume').value = String(session.preferences.volume);
    $('setting-volume-value').textContent = String(session.preferences.volume);
    buildKeyBindings();
  }

  /** Gamepad navigation while the menu is open. */
  function handlePad(action) {
    if (scrollsWithArrows() && (action === 'nav-up' || action === 'nav-down')) {
      $('menu-scroll').scrollBy({ top: action === 'nav-up' ? -160 : 160, behavior: reducedMotion ? 'auto' : 'smooth' });
      return;
    }
    if (action === 'nav-up' || action === 'nav-left') {
      if (action === 'nav-left' && !$('menu-leaderboard-view').hidden && !isTrailPickerOpen()) { stepLeaderboard(-1); sounds.menuMove(); return; }
      moveSelection(-1);
    } else if (action === 'nav-down' || action === 'nav-right') {
      if (action === 'nav-right' && !$('menu-leaderboard-view').hidden && !isTrailPickerOpen()) { stepLeaderboard(1); sounds.menuMove(); return; }
      moveSelection(1);
    } else if (action === 'confirm') {
      const selected = $('menu-screen').querySelector('.menu-selected');
      if (selected instanceof HTMLButtonElement) selected.click();
    } else if (action === 'tab-prev' || action === 'tab-next') {
      stepTab(action === 'tab-prev' ? -1 : 1);
    } else if (action === 'cancel') {
      if (closeNotifications() || closeTrailPicker(true)) sounds.menuBack();
      else if ($('menu-home').hidden) { sounds.menuBack(); goBack(); } else onClose();
    }
  }

  // Wiring.
  $('menu-how-to').addEventListener('click', () => showView('how'));
  $('menu-whats-new').addEventListener('click', showChangelog);
  $('show-credits').addEventListener('click', () => showCredits('settings'));
  $('menu-editor').addEventListener('click', () => {
    // Leaving the page ends a paused ride, so a resumable one asks first.
    if (canResume() && !window.confirm('Leave this ride and open the trail editor? Your current run will be lost.')) return;
    window.location.href = './editor.html';
  });
  $('menu-settings').addEventListener('click', () => { syncSettings(); showView('settings'); });
  document.querySelectorAll('#menu-settings-view [role="tab"]').forEach(tab => {
    tab.addEventListener('click', () => showSettingsTab(tab));
  });
  $('menu-screen').addEventListener('keydown', event => {
    if (input.capturing) return;
    // Left and right adjust a focused slider instead of moving the selection.
    if (event.target.type === 'range' && (event.code === 'ArrowLeft' || event.code === 'ArrowRight')) return;
    const trailStep = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 }[event.code];
    if (trailStep && !$('menu-leaderboard-view').hidden && !isTrailPickerOpen()) {
      event.preventDefault();
      stepLeaderboard(trailStep);
      sounds.menuMove();
      return;
    }
    const direction = { ArrowUp: -1, ArrowLeft: -1, KeyW: -1, KeyA: -1, ArrowDown: 1, ArrowRight: 1, KeyS: 1, KeyD: 1 }[event.code];
    if (!direction) return;
    if (scrollsWithArrows() && event.code.startsWith('Arrow')) return;
    if (moveSelection(direction)) event.preventDefault();
  });
  $('menu-screen').addEventListener('focusin', event => {
    const control = event.target.closest('button, input');
    if (!control?.closest('.menu-view, .menu-confirm, .notification-panel, .notification-bell')) return;
    document.querySelectorAll('.menu-selected').forEach(item => item.classList.remove('menu-selected'));
    control.classList.add('menu-selected');
  });
  $('menu-screen').addEventListener('pointerover', event => {
    const button = event.target.closest('button');
    if (event.pointerType === 'mouse' && button && !button.contains(event.relatedTarget)) {
      if (button.closest('.menu-view, .menu-confirm, .notification-panel, .notification-bell')) selectControl(button);
      sounds.menuMove();
    }
  });
  $('menu-screen').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.matches('[data-menu-back], #look-confirm-discard, #look-confirm-cancel')) sounds.menuBack();
    else if (button.id === 'create-save' || button.id === 'save-look' || button.id === 'look-confirm-save' || button.id === 'new-save-next' || button.id === 'menu-continue' || button.id === 'menu-first-ride' || button.id === 'how-ride') sounds.menuConfirm();
    else sounds.menuSelect();
  });
  $('menu-continue').addEventListener('click', () => {
    if (canResume()) onClose();
    else startTrail(session.savedTrail);
  });
  $('how-ride').addEventListener('click', () => {
    const ride = rideAfterHowTo;
    rideAfterHowTo = null;
    ride?.();
  });
  $('menu-first-ride').addEventListener('click', () => {
    creatorFromRiders = false;
    showSaveCreator(Math.max(0, session.saveSlots.findIndex(save => !save)));
  });
  $('menu-riders').addEventListener('click', () => { buildSaveSlots(); setStatus('riders-status', ''); showView('riders'); });
  $('save-login-button').addEventListener('click', () => logIn('save-login-status'));
  $('riders-login-button').addEventListener('click', () => logIn('riders-status'));
  $('menu-garage').addEventListener('click', openGarage);
  $('menu-achievements').addEventListener('click', () => { buildAchievements(); showView('achievements'); });
  $('save-look').addEventListener('click', saveGarageLook);
  $('look-confirm-save').addEventListener('click', saveGarageLook);
  $('look-confirm-discard').addEventListener('click', discardGarageLook);
  $('look-confirm-cancel').addEventListener('click', closeLookConfirm);
  // Escape is handled by the game; other close requests (such as a phone's
  // back gesture) mean Keep Editing too.
  lookConfirm.addEventListener('cancel', event => { event.preventDefault(); closeLookConfirm(); });
  // Browsers honour that once; a second request closes the dialog anyway, so
  // the selection goes back to Save as if Keep Editing had been pressed.
  lookConfirm.addEventListener('close', () => { if (!$('menu-look-view').hidden) selectControl($('save-look')); });
  $('riders-login').hidden = !onlineAvailable;
  if (onlineAvailable) {
    $('menu-first-ride').querySelector('small').textContent = 'New rider, or log in with your passkey';
    $('menu-riders').querySelector('small').textContent = 'Switch, add or log in';
  }
  document.querySelectorAll('[data-save-mode]').forEach(button => button.addEventListener('click', () => {
    setSaveMode(button.dataset.saveMode);
    setStatus('save-status', '');
  }));
  document.querySelectorAll('[data-save-ghost]').forEach(button => button.addEventListener('click', () => setNewSaveGhost(button.dataset.saveGhost)));
  $('menu-trails').addEventListener('click', () => { buildTrailCards(); showView('trails'); });
  $('import-trail').addEventListener('click', () => $('import-trail-file').click());
  $('import-trail-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const trail = normalizeTrail(JSON.parse(await file.text()), customTrailEntries.length);
      const errors = validateTrail(trail).filter(message => message.type === 'error');
      if (errors.length) throw new Error(errors[0].text);
      saveBrowserTrail(trail);
      updateDashboard();
      showView('trails');
      const kept = await browserTrailSaved();
      setImportStatus(kept
        ? `Imported “${trail.name}”. It is saved in this browser under Custom Trails.`
        : `Imported “${trail.name}” for now, but browser storage is full or blocked, so it will be gone after a reload.`, !kept);
    } catch (error) {
      setImportStatus(`Could not import ${file.name}: ${error.message}`, true);
    }
  });
  $('menu-leaderboard').addEventListener('click', () => {
    leaderboardTrail = currentLeaderboardTrail();
    buildLeaderboard(true);
    showView('leaderboard');
  });
  $('leaderboard-prev').addEventListener('click', () => stepLeaderboard(-1));
  $('leaderboard-next').addEventListener('click', () => stepLeaderboard(1));
  $('leaderboard-trail-pick').addEventListener('click', () => {
    if (isTrailPickerOpen()) closeTrailPicker(true);
    else openTrailPicker();
  });
  document.querySelectorAll('[data-menu-back]').forEach(button => button.addEventListener('click', goBack));
  $('new-save-next').addEventListener('click', () => {
    if (!checkNewSaveName()) return;
    setStatus('save-status', '');
    showSaveStep(2);
    $('menu-save-view').scrollIntoView?.({ block: 'start' });
  });
  $('create-save').addEventListener('click', () => {
    if (accountBusy) return;
    const name = checkNewSaveName();
    if (!name) return;
    if (saveMode === 'online') { createOnlineSave(name); return; }
    const save = createSave(pendingSaveSlot, creator.look(), trails.length, name);
    if (!save) { showView('riders'); return; }
    session.saveGame = save;
    session.activeSaveSlot = pendingSaveSlot;
    saveActiveSlot(session.activeSaveSlot);
    session.saveSlots[session.activeSaveSlot] = save;
    session.look = save.look;
    session.unlockedTrail = 0; session.savedTrail = 0;
    startTrail(0);
  });
  document.querySelectorAll('[data-setting]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.setting === 'ghost') setGhostMode(button.dataset.value);
      else session.preferences[button.dataset.setting] = button.dataset.value;
      persistPreferences();
      drawBackground();
    });
  });
  $('setting-volume').addEventListener('input', event => {
    session.preferences.volume = Number(event.target.value);
    $('setting-volume-value').textContent = event.target.value;
    onPreferences();
  });
  $('setting-volume').addEventListener('change', () => { savePreferences(session.preferences); sounds.menuMove(); });
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  // Phone vibration: desktop browsers have navigator.vibrate too, but no motor to run.
  $('setting-haptics-group').hidden = !('vibrate' in navigator) || !coarsePointer.matches;

  let resetArmed = false, resetTimer = 0;
  $('reset-settings').addEventListener('click', event => {
    const button = event.currentTarget;
    if (!resetArmed) {
      resetArmed = true;
      button.textContent = coarsePointer.matches ? 'TAP AGAIN TO RESET' : 'CLICK AGAIN TO RESET';
      resetTimer = setTimeout(() => { resetArmed = false; button.textContent = 'RESET ALL SETTINGS'; }, 2500);
      return;
    }
    clearTimeout(resetTimer);
    resetArmed = false;
    button.textContent = 'RESET ALL SETTINGS';
    session.preferences = sanitizePreferences({});
    setGhostMode(session.preferences.ghost);
    persistPreferences();
    drawBackground();
  });

  const back = () => {
    if (closeNotifications()) return true;
    if (closeTrailPicker(true)) return true;
    if ($('menu-home').hidden) { goBack(); return true; }
    return false;
  };
  return { open, close, isOpen, showTrailsStatus, updateDashboard, drawBackground, syncSettings, handlePad, showView, showCredits, canResume, back, refreshCloudSave, refreshNotifications, markRideStarted };
}
