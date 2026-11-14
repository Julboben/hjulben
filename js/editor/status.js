// Button flashes and the toast over the canvas.
import { $ } from "./dom.js";
import { showValidation } from "./menu.js";
import { editor } from "./state.js";

/**
 * Swap a button's label briefly, then put it back.
 *
 * The label is remembered as text rather than as markup, so flashing a button
 * that contains a glyph does not strip it out of the header.
 */
export function flash(button, text) {
  if (!button) return;
  const original = button.dataset.label || button.textContent.trim();
  button.dataset.label = original;
  const label = button.querySelector("span");
  if (label) label.textContent = text;
  else button.textContent = text;
  setTimeout(() => {
    if (label) label.textContent = original;
    else button.textContent = original;
  }, 1400);
}

/**
 * Refuse an action, naming what has to be fixed.
 *
 * The message pops up over the canvas and is repeated on the button itself,
 * because a refusal that is only recorded at the bottom of a long sidebar reads
 * as the editor silently doing nothing. It returns false, so the caller can
 * decide not to continue.
 */
export function refuse(action, errors) {
  const reasons = errors.map((message) => message.text);
  const first = reasons[0] || "the trail does not validate";
  const extra = reasons.length > 1 ? ` (+${reasons.length - 1} more)` : "";
  const text = `Fix ${reasons.length || "the"} validation error${reasons.length === 1 ? "" : "s"} before ${action}: ${first}${extra}`;
  showStatus("error", text);
  flash(
    $("play-test"),
    `${reasons.length} ERROR${reasons.length === 1 ? "" : "S"}`,
  );
  // The full list lives in the header's more menu, so it is opened and given
  // attention rather than leaving the reasons behind a closed menu.
  showValidation();
  return false;
}

/** Tell the author why an edit or save on a read-only trail did nothing. */
export function refuseReadOnly() {
  showStatus("info", "This trail is read-only here. Duplicate it to edit it, or export it.");
}

/** Refuse an edit on a read-only trail; true when it was refused. */
export function refuseEdit() {
  if (!editor.readOnly) return false;
  refuseReadOnly();
  return true;
}

let toastTimer = null;

/** How long a toast that isn't an error stays up, in milliseconds. */
export const NOTICE_TIME = 3500;

/** A short message over the canvas: what just happened, or why it didn't. */
export function showStatus(type, text) {
  const toast = $("editor-toast");
  toast.className = `editor-toast ${type}`;
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      toast.hidden = true;
    },
    type === "error" ? 7000 : NOTICE_TIME,
  );
}
