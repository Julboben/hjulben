// Keeps the trail being edited in browser storage, so a refresh, a closed tab
// or switching trails doesn't lose work. Loading picks it up again; see
// loadTrailData.
import { trailEntries } from "../trails.js";
import { onStoreFailure } from "./draft-store.js";
import { clearAutosave, writeAutosave } from "./drafts.js";
import { detailsWaiting, flushInspector } from "./inspector.js";
import { editor } from "./state.js";
import { showStatus } from "./status.js";

const AUTOSAVE_DELAY = 1000;
let timer = null;
// What the autosave slot holds (trail id and JSON), so an unchanged trail is
// not written again; null once the slot is empty or the last write failed.
let written = null;
// The last write failed, so the edits exist only in this tab until one works.
let failing = false;
// The trail as JSON from the inspector, which builds it on every change
// anyway, and the trail it was made from: building it again here would cost
// as much as the inspector's on a large trail.
let latest = { trail: null, json: "" };

/**
 * Store the trail now if it differs from the version opened, else forget it.
 * `urgent` as the page is hidden or closed: see draft-store.js.
 */
export function autosaveNow(urgent = false) {
  clearTimeout(timer);
  timer = null;
  const entry = trailEntries[editor.trailIndex];
  if (!entry || !editor.trail || !editor.version) return;
  // A drag still held waits: letting go brings the inspector up to date and
  // schedules another autosave. Only the page going stops it from waiting.
  if (!urgent && detailsWaiting()) return;
  flushInspector();
  const json = latest.trail === editor.trail ? latest.json : JSON.stringify(editor.trail, null, 2);
  // A write as the page goes always runs: an earlier one with the same text
  // may still be compressing, and is lost if the page goes first.
  if (!urgent && written?.id === entry.id && written.json === json) return;
  if (json === editor.version.base) {
    clearAutosave(entry.id);
    written = null;
    failing = false;
    return;
  }
  if (writeAutosave(entry.id, editor.trail, editor.version.baseHash, urgent)) {
    written = { id: entry.id, json };
    failing = false;
    return;
  }
  autosaveFailed();
}

function autosaveFailed() {
  written = null;
  // Said every time it fails, not just the first: storage that fills up
  // later would otherwise lose edits in silence.
  failing = true;
  showStatus(
    "error",
    "Autosave failed: browser storage is full or blocked. Save a draft or export to keep your changes.",
  );
}

/** Are there edits that autosave could not keep? */
export const autosaveFailing = () => failing && Boolean(editor.version?.edited);

/** Autosave once editing pauses; `json` is the trail as the inspector shows it. */
export function scheduleAutosave(json) {
  latest = { trail: editor.trail, json };
  clearTimeout(timer);
  timer = setTimeout(autosaveNow, AUTOSAVE_DELAY);
}

export function bindAutosave() {
  // Writes reach the database after the editor has moved on, so a failure is
  // reported when it happens.
  onStoreFailure((key) => {
    if (key.startsWith("hjulben-editor-autosave-")) autosaveFailed();
    else showStatus("error", "Could not save the draft: browser storage is full or blocked. Export the trail to keep it.");
  });
  // pagehide fires on refresh and close; visibilitychange covers mobile, where
  // a backgrounded tab can be killed without either.
  window.addEventListener("pagehide", () => autosaveNow(true));
  // Edits the browser could not keep would be lost with the tab, so leaving
  // asks first.
  window.addEventListener("beforeunload", (event) => {
    autosaveNow(true);
    if (autosaveFailing()) event.preventDefault();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") autosaveNow(true);
  });
}
