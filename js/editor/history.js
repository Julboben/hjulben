// Undo and redo.
import { normalizeTrail } from "../trail-schema.js";
import { $ } from "./dom.js";
import { syncInspector } from "./inspector.js";
import { render } from "./render.js";
import { editor } from "./state.js";

/** The trail and what was selected with it, so undo brings both back. */
export function snapshot() {
  return { trail: JSON.stringify(editor.trail), selection: structuredClone(editor.selection) };
}

export function pushHistory(state = snapshot()) {
  editor.history.push(state);
  if (editor.history.length > 80) editor.history.shift();
  editor.future = [];
  updateHistoryButtons();
}

/**
 * Put the trail and selection back as they were in `state`, without an undo
 * step. `live` is for a drag in progress: see syncInspector.
 */
export function restore(state, { live = false } = {}) {
  editor.trail = normalizeTrail(JSON.parse(state.trail));
  editor.selection = state.selection;
  syncInspector({ live });
  render();
}

export function undo() {
  if (!editor.history.length) return;
  editor.future.push(snapshot());
  restore(editor.history.pop());
  updateHistoryButtons();
}

export function redo() {
  if (!editor.future.length) return;
  editor.history.push(snapshot());
  restore(editor.future.pop());
  updateHistoryButtons();
}

export function updateHistoryButtons() {
  $("undo").disabled = editor.history.length === 0;
  $("redo").disabled = editor.future.length === 0;
}
