// @ts-check
// The "turn your phone upright" screen. Phones are played upright, with the
// touch controls under the trail, so a phone or handheld turned sideways
// hides the game behind this screen until it is turned back. A controller
// lifts that: with real buttons in hand there is nothing to fit under the
// trail, so the trail fills the sideways screen instead (see the short
// landscape rule on .game in game.css).
import { $ } from "../state.js";
import { loadControllerHeld, saveControllerHeld } from "../storage.js";

/** Short touch screens held sideways: phones and handhelds, not tablets. */
const SIDEWAYS = "(orientation: landscape) and (pointer: coarse) and (max-height: 500px)";

/**
 * @param {{ onOpen: () => void, onControllerChange: () => void }} hooks
 *   onOpen: the screen came up over the game, which pauses a ride.
 *   onControllerChange: a controller was taken up or put down.
 */
export function createTurnUpright({ onOpen, onControllerChange }) {
  const dialog = /** @type {HTMLDialogElement} */ ($("turn-upright"));
  const sideways = window.matchMedia(SIDEWAYS);
  let controller = loadControllerHeld();

  // A modal dialog, so it sits on the top layer above the results and any popover.
  function sync() {
    if (sideways.matches && !controller) {
      if (!dialog.open) { dialog.showModal(); onOpen(); }
    } else if (dialog.open) dialog.close();
  }
  // Escape or a back gesture can't dismiss it: only turning the phone back,
  // or a controller, does.
  dialog.addEventListener("cancel", (event) => event.preventDefault());
  dialog.addEventListener("close", () => requestAnimationFrame(sync));
  sideways.addEventListener("change", sync);
  sync();

  return {
    /** Whether the player has a controller in hand on this device. */
    get controller() { return controller; },
    /** A controller button was pressed (true), or the touch controls were used or the controller went away (false). */
    setController(held) {
      if (held === controller) return;
      controller = held;
      saveControllerHeld(held);
      sync();
      onControllerChange();
    },
  };
}
