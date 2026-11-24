// @ts-check
// Keyboard (remappable), on-screen buttons and gamepads, mapped to game actions.
import { clamp } from './config.js';
import { DEFAULT_BINDINGS } from './state.js';

/** Actions that matter while held. */
export const HOLD_ACTIONS = ['up', 'down', 'back', 'forward'];
/** Actions that fire once per press. */
export const PRESS_ACTIONS = ['flip', 'lights', 'restart', 'pause', 'fullscreen', 'interact'];

export const ACTION_LABELS = {
  up: 'Gas', down: 'Brake', back: 'Lean left', forward: 'Lean right',
  flip: 'Turn around', lights: 'Headlight', restart: 'Restart', pause: 'Pause', fullscreen: 'Fullscreen',
  interact: 'Interact'
};

// Codes a player cannot bind: Escape always opens the menu, Tab moves focus.
const RESERVED = new Set(['Escape', 'Tab']);

const KEY_SYMBOLS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'SPACE', Enter: 'ENTER', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT', Backspace: 'BKSP' };

export function keyLabel(code) {
  if (KEY_SYMBOLS[code]) return KEY_SYMBOLS[code];
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'NUM ').toUpperCase();
}

/** A key code as aria-keyshortcuts names it: the key it types, or its name, without the side. */
export function shortcutName(code) {
  return code.replace(/^(Key|Digit)/, '').replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/, '$1');
}

// Standard gamepad layout (https://w3c.github.io/gamepad/#remapping).
const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, select: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };
const STICK_DEADZONE = .25;

/** What the player is using, which prompts name: a gamepad, the keyboard, or the on-screen buttons. @typedef {'pad' | 'keys' | 'touch'} InputDevice */

/** Typing in a text field, which says nothing about how the game is played. */
const typing = target => target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable]');

/**
 * `buttons` press their `data-action`. `indicators` handle their own clicks
 * but still look pressed while their `data-shows` action is held.
 * @param {{
 *   element: HTMLElement,
 *   buttons: HTMLElement[],
 *   indicators?: HTMLElement[],
 *   isActive: () => boolean,
 *   onPress: (action: string, source: 'key' | 'pointer' | 'pad') => void,
 *   onDevice: (device: InputDevice) => void,
 * }} options
 */
export function createInput({ element, buttons, indicators = [], isActive, onPress, onDevice }) {
  const keys = new Set();
  /** Keys down on a held action off the ride: they press its button in but do nothing. */
  const shownKeys = new Set();
  /** Pointers holding an action, which only start while the ride is on. */
  const pointers = new Map();
  /** Every pointer down on a button, so it presses in even when it does nothing. */
  const touching = new Map();
  const pad = {
    held: new Set(), lean: 0,
    // What the pad's buttons map to, held or not, so the on-screen buttons
    // press in with them even when the press does nothing.
    shown: new Set(), previous: /** @type {boolean[]} */ ([]), connected: false, stickX: 0, stickY: 0,
    // Which pad was read.
    index: -1,
  };
  // The prompts follow what the player last used: a key, a touch, or a pad
  // button (see pollGamepad). A mouse goes with either a keyboard or a pad, so
  // it never switches them. A pad lying idle after a key or a touch never rumbles.
  const touchScreen = window.matchMedia('(hover: none) and (pointer: coarse)');
  const resting = () => touchScreen.matches ? 'touch' : 'keys';
  /** @type {InputDevice} */
  let device = resting();
  function useDevice(/** @type {InputDevice} */ next) {
    if (next === device) return;
    device = next;
    onDevice(next);
  }
  window.addEventListener('keydown', event => { if (!typing(event.target)) useDevice('keys'); }, true);
  window.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') useDevice('touch'); }, true);
  /** @type {Record<string, string[]>} */
  let bindings = DEFAULT_BINDINGS;
  /** @type {Map<string, string>} */
  let codeActions = new Map();
  /** @type {((code: string | null) => void) | null} */
  let capture = null;

  function setBindings(next) {
    bindings = next;
    codeActions = new Map();
    for (const [action, codes] of Object.entries(bindings)) for (const code of codes) codeActions.set(code, action);
  }
  setBindings(DEFAULT_BINDINGS);

  function held(action) {
    for (const code of keys) if (codeActions.get(code) === action) return true;
    for (const value of pointers.values()) if (value === action) return true;
    return pad.held.has(action);
  }

  /** Lean in screen direction: −1 left … 1 right. */
  function leanInput() {
    const digital = Number(held('forward')) - Number(held('back'));
    return digital || pad.lean;
  }

  function clear() {
    keys.clear();
    shownKeys.clear();
    pointers.clear();
    touching.clear();
    paint();
  }

  function paint() {
    const touched = new Set(touching.values());
    const shownActions = new Set([...shownKeys].map(code => codeActions.get(code)));
    const down = action => held(action) || pad.shown.has(action) || shownActions.has(action);
    for (const button of buttons) button.classList.toggle('held', touched.has(button) || down(button.dataset.action || ''));
    for (const button of indicators) button.classList.toggle('held', down(button.dataset.shows || ''));
  }

  /** Routes the next key press to `callback` (used by key remapping). */
  function captureNextKey(callback) { capture = callback; }

  /** @returns {boolean} whether the event was a game action */
  function keyDown(event) {
    if (capture) {
      event.preventDefault();
      const done = capture;
      capture = null;
      done(event.code === 'Escape' || RESERVED.has(event.code) ? null : event.code);
      return true;
    }
    // On macOS a key released while Cmd is down never reports its release,
    // so Cmd lets go of everything rather than leave a key stuck.
    if (event.code === 'MetaLeft' || event.code === 'MetaRight') { keys.clear(); shownKeys.clear(); paint(); return false; }
    const action = codeActions.get(event.code);
    if (!action) return false;
    event.preventDefault();
    if (PRESS_ACTIONS.includes(action)) {
      if (!event.repeat) onPress(action, 'key');
      keys.add(event.code);
      paint();
      return true;
    }
    (isActive() ? keys : shownKeys).add(event.code);
    paint();
    return true;
  }

  function keyUp(event) {
    const wasShown = shownKeys.delete(event.code);
    if (keys.delete(event.code) || wasShown) paint();
  }

  for (const button of buttons) {
    // A button always presses in, like a real pad's, but only acts mid-ride.
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      element.focus({ preventScroll: true });
      button.setPointerCapture(event.pointerId);
      touching.set(event.pointerId, button);
      const action = button.dataset.action || '';
      if (isActive()) {
        if (PRESS_ACTIONS.includes(action)) onPress(action, 'pointer');
        else pointers.set(event.pointerId, action);
      }
      paint();
    });
    const release = event => {
      const wasDown = touching.delete(event.pointerId);
      if (pointers.delete(event.pointerId) || wasDown) paint();
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', event => event.preventDefault());
    // Safari's magnifier and double-tap zoom come with the touch, not the
    // pointer, so a quick double tap on a held control turns them off here.
    // The pointer events above still fire; these buttons need no click.
    button.addEventListener('touchstart', event => event.preventDefault(), { passive: false });
  }

  /** Reads the first gamepad; call once per animation frame. */
  function pollGamepad() {
    const gamepad = typeof navigator.getGamepads === 'function'
      ? [...navigator.getGamepads()].find(candidate => candidate?.connected) : null;
    pad.held.clear();
    pad.shown.clear();
    pad.lean = 0;
    pad.connected = Boolean(gamepad);
    if (!gamepad) {
      pad.previous = []; pad.index = -1;
      if (device === 'pad') useDevice(resting());
      return;
    }
    pad.index = gamepad.index;
    const pressed = gamepad.buttons.map(button => button.pressed || button.value > .5);
    // Only a button claims the pad: an idle stick can drift past the deadzone,
    // which must not switch the prompts over to pad buttons.
    if (pressed.some(Boolean)) useDevice('pad');
    // Compared with the last frame's buttons, kept before they're replaced.
    const previous = pad.previous;
    const edge = index => pressed[index] && !previous[index];
    pad.previous = pressed;
    const active = isActive();
    const stick = gamepad.axes[0] || 0;
    const shows = { up: [PAD.rt, PAD.a], down: [PAD.lt, PAD.x], back: [PAD.left], forward: [PAD.right], flip: [PAD.b], lights: [PAD.up], restart: [PAD.y] };
    for (const [action, indexes] of Object.entries(shows)) if (indexes.some(index => pressed[index])) pad.shown.add(action);
    if (stick < -STICK_DEADZONE) pad.shown.add('back');
    if (stick > STICK_DEADZONE) pad.shown.add('forward');
    if (active) {
      if (pressed[PAD.rt] || pressed[PAD.a]) pad.held.add('up');
      if (pressed[PAD.lt] || pressed[PAD.x]) pad.held.add('down');
      if (pressed[PAD.left]) pad.held.add('back');
      if (pressed[PAD.right]) pad.held.add('forward');
      if (Math.abs(stick) > STICK_DEADZONE) pad.lean = clamp((stick - Math.sign(stick) * STICK_DEADZONE) / (1 - STICK_DEADZONE), -1, 1);
    }
    if (pressed[PAD.y]) pad.held.add('restart');
    if (edge(PAD.b)) onPress(active ? 'flip' : 'cancel', 'pad');
    // The game decides when these do anything, the same for keys and touch.
    if (edge(PAD.up)) onPress('lights', 'pad');
    if (edge(PAD.down)) onPress('interact', 'pad');
    if (edge(PAD.y)) onPress('restart', 'pad');
    if (edge(PAD.start)) onPress('pause', 'pad');
    if (edge(PAD.select)) onPress('menu', 'pad');
    if (!active) {
      if (edge(PAD.a)) onPress('confirm', 'pad');
      // The bumpers do nothing on the bike; in menus they switch tabs.
      if (edge(PAD.lb)) onPress('tab-prev', 'pad');
      if (edge(PAD.rb)) onPress('tab-next', 'pad');
      const direction = value => Math.abs(value) > .6 ? Math.sign(value) : 0;
      const stickX = direction(gamepad.axes[0] || 0), stickY = direction(gamepad.axes[1] || 0);
      const movedX = stickX !== pad.stickX ? stickX : 0, movedY = stickY !== pad.stickY ? stickY : 0;
      if (edge(PAD.up) || movedY < 0) onPress('nav-up', 'pad');
      if (edge(PAD.down) || movedY > 0) onPress('nav-down', 'pad');
      if (edge(PAD.left) || movedX < 0) onPress('nav-left', 'pad');
      if (edge(PAD.right) || movedX > 0) onPress('nav-right', 'pad');
      pad.stickX = stickX; pad.stickY = stickY;
    } else {
      pad.stickX = 0; pad.stickY = 0;
    }
    paint();
  }

  return {
    held, leanInput, clear, paint, keyDown, keyUp, pollGamepad, setBindings, captureNextKey,
    get gamepadConnected() { return pad.connected; },
    /** What the player is using, for prompts. */
    get device() { return device; },
    /** The gamepad being played with, fresh from the browser, or null when keys or touch took over. */
    activeGamepad() {
      if (device !== 'pad' || pad.index < 0 || typeof navigator.getGamepads !== 'function') return null;
      return navigator.getGamepads()[pad.index] ?? null;
    },
    get capturing() { return capture !== null; }
  };
}
