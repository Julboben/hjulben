// Undo and redo, and the undo history list beside their buttons.
import { normalizeTrail } from "../trail-schema.js";
import { describeStep } from "./describe-step.js";
import { $ } from "./dom.js";
import { syncInspector } from "./inspector.js";
import { flagsSnapshot, restoreFlags } from "./locks.js";
import { render } from "./render.js";
import { editor } from "./state.js";
import { showStatus } from "./status.js";

/** How many steps undo keeps. */
const HISTORY_LIMIT = 80;
/** How many steps a toast names when several are taken at once. */
const TOAST_STEPS = 3;

/**
 * The trail, what was selected with it and what was locked and hidden, so undo
 * brings all three back. A step that swaps in a whole other trail, such as
 * opening a version, names itself with `label`, since comparing the two trails
 * would list everything that differs rather than what was done. In
 * editor.history a state's label names the step from it to the next state; in
 * editor.future, the step from the state before it.
 */
export function snapshot(label) {
  return {
    trail: JSON.stringify(editor.trail),
    selection: structuredClone(editor.selection),
    flags: flagsSnapshot(),
    label,
  };
}

export function pushHistory(state = snapshot()) {
  editor.history.push(state);
  if (editor.history.length > HISTORY_LIMIT) {
    editor.history.shift();
    editor.historyTrimmed = true;
  }
  editor.future = [];
  updateHistoryButtons();
}

/**
 * Put the trail, selection and flags back as they were in `state`, without an
 * undo step. `live` is for a drag in progress: see syncInspector.
 */
export function restore(state, { live = false } = {}) {
  editor.trail = normalizeTrail(JSON.parse(state.trail));
  editor.selection = state.selection;
  restoreFlags(state.flags);
  syncInspector({ live });
  render();
}

export const undo = () => travel(1, true);
export const redo = () => travel(1, false);

/**
 * Take back `count` steps, or do them again when `back` is false, as one
 * jump: only where it ends is put back on screen, and one toast says what the
 * steps were.
 */
function travel(count, back) {
  const [from, to] = back ? [editor.history, editor.future] : [editor.future, editor.history];
  if (!from.length) return;
  let current = snapshot();
  const said = [];
  for (let step = 0; step < count && from.length; step++) {
    const next = from.pop();
    // The label moves to the state on the other side of the step, as
    // snapshot() describes.
    current.label = next.label;
    said.push((back ? stepWords(next, current, next.label) : stepWords(current, next, next.label)) || "changed nothing");
    to.push(current);
    current = next;
  }
  restore(current);
  updateHistoryButtons();
  const verb = back ? "Undid" : "Redid";
  if (said.length === 1) {
    showStatus("info", `${verb}: ${said[0]}`);
    return;
  }
  const more = said.length - TOAST_STEPS;
  const named = more > 0 ? [...said.slice(0, TOAST_STEPS), `${more} more`] : said;
  showStatus("info", `${verb} ${said.length} steps: ${named.slice(0, -1).join(", ")} and ${named.at(-1)}`);
}

// Words already worked out for a state and the one after it, since the list
// asks again each time it opens.
const wordsCache = new WeakMap();

/** What the step from `before` to `after` did, in words; null when it changed nothing. */
function stepWords(before, after, label) {
  if (label) return label;
  const cached = wordsCache.get(before);
  if (cached?.after === after) return cached.words;
  const words = describeStep(before, after);
  wordsCache.set(before, { after, words });
  return words;
}

const capitalized = (text) => text[0].toUpperCase() + text.slice(1);

/**
 * The undo history, newest first: the steps that can be redone, the step that
 * made the trail as it is now, the steps before it, and how it was before
 * them. Each row is the trail as that step left it, `jump` steps from now:
 * forward when positive, back when negative.
 */
function historyRows() {
  const { history, future } = editor;
  const now = snapshot();
  const rows = [];
  let state = now;
  for (let index = future.length - 1, jump = 1; index >= 0; index--, jump++) {
    const next = future[index];
    rows.unshift({ text: stepWords(state, next, next.label), jump });
    state = next;
  }
  for (let index = history.length - 1; index >= 0; index--) {
    const after = history[index + 1] || now;
    rows.push({ text: stepWords(history[index], after, history[index].label), jump: index - history.length + 1 });
  }
  rows.push({
    text: editor.historyTrimmed ? "Oldest step kept" : "Start of this session",
    jump: -history.length,
    edge: true,
  });
  return rows;
}

/** The list's buttons, one in each row but the rule. */
function historyItems() {
  return [...$("history-list").children].map((item) => item.firstElementChild).filter(Boolean);
}

const historyOpen = () => !$("history-menu").hidden;

/** One row of the list: the trail as a step left it, `jump` steps from now. */
function historyRow({ text, jump, edge }) {
  const item = document.createElement("li");
  item.className = [jump > 0 && "redoable", jump === 0 && "now", edge && "edge"].filter(Boolean).join(" ");
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("role", "menuitem");
  const mark = document.createElement("span");
  mark.className = "history-mark";
  const words = document.createElement("span");
  words.textContent = capitalized(text || "changed nothing");
  button.append(mark, words);
  if (jump === 0) {
    const check = document.createElement("span");
    check.dataset.icon = "check";
    check.setAttribute("aria-hidden", "true");
    mark.append(check);
    const tag = document.createElement("strong");
    tag.textContent = "NOW";
    button.append(tag);
    button.setAttribute("aria-current", "step");
  }
  button.addEventListener("click", () => {
    closeHistory();
    if (jump) travel(Math.abs(jump), jump < 0);
  });
  item.append(button);
  return item;
}

function openHistory({ focus = false } = {}) {
  const rows = historyRows().map(historyRow);
  // A rule sets how the trail was before every step apart from the steps.
  const rule = document.createElement("li");
  rule.className = "tool-menu-rule";
  rule.setAttribute("role", "separator");
  rows.splice(-1, 0, rule);
  $("history-list").replaceChildren(...rows);
  $("history-menu").hidden = false;
  $("history-toggle").setAttribute("aria-expanded", "true");
  if (focus) historyItems().find((item) => item.getAttribute("aria-current"))?.focus();
}

function closeHistory({ restoreFocus = false } = {}) {
  if (!historyOpen()) return;
  $("history-menu").hidden = true;
  $("history-toggle").setAttribute("aria-expanded", "false");
  if (restoreFocus) $("history-toggle").focus();
}

/**
 * Undo, redo and the undo history list. Each button names the step it would
 * take back or do again in its tooltip, worked out when the pointer or focus
 * arrives rather than on every edit, because an edit's undo step is taken
 * before the edit is made.
 */
export function bindHistoryButtons() {
  const buttons = [
    ["undo", undo, "Undo", "Cmd/Ctrl+Z", () => editor.history.at(-1) && stepWords(editor.history.at(-1), snapshot(), editor.history.at(-1).label)],
    ["redo", redo, "Redo", "Cmd/Ctrl+Shift+Z", () => editor.future.at(-1) && stepWords(snapshot(), editor.future.at(-1), editor.future.at(-1).label)],
  ];
  for (const [id, action, verb, keys, words] of buttons) {
    const button = $(id);
    const name = () => {
      const said = words();
      button.title = `${said ? `${verb}: ${said}` : verb} (${keys})`;
    };
    button.addEventListener("click", action);
    button.addEventListener("pointerenter", name);
    button.addEventListener("focus", name);
  }

  $("history-toggle").addEventListener("click", (event) => {
    if (historyOpen()) closeHistory();
    else openHistory({ focus: event.detail === 0 });
  });
  $("history-menu").addEventListener("keydown", (event) => {
    const items = historyItems();
    const index = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeHistory({ restoreFocus: true });
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (historyOpen() && !$("history").contains?.(event.target)) closeHistory();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && historyOpen()) closeHistory();
  });
}

export function updateHistoryButtons() {
  $("undo").disabled = editor.history.length === 0;
  $("redo").disabled = editor.future.length === 0;
  $("history-toggle").disabled = editor.history.length === 0 && editor.future.length === 0;
  // A list left open would show steps that are no longer the ones there.
  closeHistory();
}
