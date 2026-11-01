// Loading, saving, drafts and the trail picker.
import { store } from "../local-store.js";
import {
  createBlankTrail,
  normalizeTrail,
  validateTrail,
} from "../trail-schema.js";
import {
  browserTrailSaved,
  customFileFor,
  deleteBrowserTrail,
  deleteTrailFile,
  moveTrailFile,
  reportEditorFeat,
  saveBrowserTrail,
  saveTrailFile,
  trailEntries,
  uniqueCustomFile,
} from "../trails.js";
import { autosaveNow } from "./autosave.js";
import { $ } from "./dom.js";
import {
  addDraft,
  clearAutosave,
  clearDrafts,
  draftAge,
  formatDraftTime,
  hashText,
  listDrafts,
  markSaved,
  moveDrafts,
  readAutosave,
  removeDraft,
  savedAt,
  savedName,
  updateVersionChip,
} from "./drafts.js";
import { pushHistory } from "./history.js";
import { moveLocks } from "./locks.js";
import { syncInspector } from "./inspector.js";
import { render } from "./render.js";
import { editor } from "./state.js";
import { flash, refuse, refuseReadOnly, showStatus } from "./status.js";
import { NAVIGATION_TOOLS, setTool } from "./tools.js";
import { focusOnStart } from "./view.js";
import { stopEditingPreview } from "./preview.js";

const CURRENT_TRAIL_KEY = "hjulben-editor-current-v1";

export function storedTrailIndex() {
  try {
    const index = trailEntries.findIndex(
      (entry) => entry.id === store().getItem(CURRENT_TRAIL_KEY),
    );
    return Math.max(0, index);
  } catch (_) {
    return 0;
  }
}

function rememberTrail() {
  try {
    store().setItem(CURRENT_TRAIL_KEY, trailEntries[editor.trailIndex].id);
  } catch (_) {}
}

/**
 * Record the version just opened or saved. `published` is the published
 * trail's JSON, kept so Publish can tell whether there is anything new.
 */
function setVersion(kind, at, trail, published = editor.version?.published) {
  const base = JSON.stringify(trail, null, 2);
  const publishedJson = kind === "saved" ? base : published;
  editor.version = {
    kind,
    at,
    base,
    published: publishedJson,
    // Fingerprints the published trail, so drafts and autosaves made from
    // here can tell when the file has moved on without them.
    baseHash: hashText(publishedJson ?? base),
    edited: false,
    unpublished: kind === "saved" ? false : base !== published,
  };
}

function publishedJson(index) {
  const entry = trailEntries[index];
  return JSON.stringify(normalizeTrail(entry?.trail || createBlankTrail()), null, 2);
}

/**
 * The trail to open: its newest draft when that is newer than the last save,
 * otherwise the saved trail. Sets editor.version to say which it was.
 *
 * Unsaved edits autosaved since then are opened on top of that version, as if
 * the page had never been left, with one undo step back to the version itself.
 */
export function loadTrailData(index) {
  const trail = loadVersion(index);
  const entry = trailEntries[index];
  const autosave = entry ? readAutosave(entry.id) : null;
  const newest = Math.max(savedAt(entry?.id), listDrafts(entry?.id)[0]?.at ?? 0);
  if (!autosave || autosave.at <= newest) return trail;
  // Edits made on a version the file has moved past (a git pull, say) can't
  // go on top of the file; they are kept as a draft, in Versions, instead.
  if (autosave.base && autosave.base !== editor.version.baseHash) {
    // The autosave only goes once the draft is safely written; with storage
    // full it stays, and the edits open on top of the file instead so they
    // are at least on screen, with the warning saying so.
    if (addDraft(entry.id, autosave.trail, autosave.base) !== null) {
      clearAutosave(entry.id);
      editor.version.rescuedAt = autosave.at;
      return trail;
    }
    editor.version.rescueFailedAt = autosave.at;
  }
  try {
    const restored = normalizeTrail(autosave.trail);
    if (JSON.stringify(restored, null, 2) === editor.version.base) return trail;
    editor.version.restoredAt = autosave.at;
    editor.history.push({ trail: JSON.stringify(trail), selection: null });
    return restored;
  } catch (_) {
    return trail;
  }
}

function loadVersion(index) {
  const entry = trailEntries[index];
  const stored = entry?.trail;
  const fallback = () => normalizeTrail(stored || createBlankTrail());
  const draft = entry ? listDrafts(entry.id)[0] : null;
  if (draft && draft.at > savedAt(entry.id)) {
    const published = publishedJson(index);
    // A draft made on an older published trail (the file changed under it,
    // through git, say) must not shadow the file, and publishing it would
    // overwrite the file's changes. The file opens; the draft stays in Versions.
    if (draft.base && draft.base !== hashText(published)) {
      const trail = fallback();
      setVersion("saved", null, trail);
      editor.version.shadowedDraftAt = draft.at;
      return trail;
    }
    try {
      const trail = normalizeTrail(draft.trail);
      setVersion("draft", draft.at, trail, published);
      return trail;
    } catch (_) {}
  }
  const trail = fallback();
  setVersion("saved", null, trail);
  return trail;
}

/** Tell the author when a trail opened on a draft or autosave rather than the saved trail. */
export function announceVersion() {
  if (editor.version?.shadowedDraftAt || editor.version?.rescuedAt) {
    const at = editor.version.shadowedDraftAt || editor.version.rescuedAt;
    showStatus(
      "warning",
      `${savedName(currentEntry())} has changed since your ${editor.version.shadowedDraftAt ? "draft" : "unsaved edits"} (${formatDraftTime(at)}), so it opened instead. The ${editor.version.shadowedDraftAt ? "draft is" : "edits are kept as a draft"} in Versions.`,
    );
    return;
  }
  if (editor.version?.rescueFailedAt) {
    showStatus(
      "error",
      `${savedName(currentEntry())} has changed since your unsaved edits (${formatDraftTime(editor.version.rescueFailedAt)}), and browser storage is too full to keep them as a draft. They are opened on top of the new file: check them, then save a draft or export.`,
    );
    return;
  }
  if (editor.version?.restoredAt) {
    showStatus(
      "info",
      `Restored your unsaved changes (${formatDraftTime(editor.version.restoredAt)}). Undo to go back to the saved version.`,
    );
    return;
  }
  if (editor.version?.kind !== "draft") {
    if (editor.readOnly) refuseReadOnly();
    return;
  }
  showStatus(
    "info",
    `Opened your draft (${formatDraftTime(editor.version.at)}). Switch versions from the label at the top.`,
  );
}

export function saveDraft() {
  if (editor.readOnly || !canSave()) {
    refuseReadOnly();
    return;
  }
  if (!editor.version?.edited) {
    showStatus("info", "No changes since this version, so there is nothing new to save.");
    return;
  }
  const entry = currentEntry();
  const at = addDraft(entry.id, editor.trail, editor.version.baseHash);
  if (!at) {
    showStatus("error", "Could not save the draft: browser storage is full or blocked.");
    return;
  }
  setVersion("draft", at, editor.trail);
  autosaveNow();
  updateVersionChip();
  flash($("save-draft"), "SAVED");
  if ($("versions").open) renderVersions();
  showStatus("info", `Draft saved · ${formatDraftTime(at)}`);
}

function openVersion(kind, at, data) {
  /** @type {HTMLDialogElement} */ ($("versions")).close();
  pushHistory();
  editor.trail = normalizeTrail(JSON.parse(JSON.stringify(data)));
  setVersion(kind, at, editor.trail);
  editor.selection = null;
  syncInspector();
  render();
  showStatus(
    "info",
    `Opened ${kind === "draft" ? `draft (${formatDraftTime(at)})` : savedName(currentEntry()).toLowerCase()}. Undo to go back.`,
  );
}

function versionRow({ title, detail, current, onOpen, onDelete, openLabel }) {
  const item = document.createElement("li");
  item.className = current ? "current" : "";
  const text = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = title;
  const note = document.createElement("span");
  note.textContent = detail;
  text.append(name, note);
  item.append(text);
  if (current) {
    const tag = document.createElement("em");
    tag.textContent = "OPEN NOW";
    item.append(tag);
  } else {
    const open = document.createElement("button");
    open.textContent = openLabel || "OPEN";
    open.addEventListener("click", onOpen);
    item.append(open);
  }
  if (onDelete) {
    const remove = document.createElement("button");
    remove.className = "danger-inline";
    remove.textContent = "×";
    remove.title = "Delete this draft";
    remove.setAttribute("aria-label", `Delete draft from ${title}`);
    remove.addEventListener("click", onDelete);
    item.append(remove);
  }
  return item;
}

/** Fill the versions dialog: the saved trail, then every draft, newest first. */
export function renderVersions() {
  const entry = currentEntry();
  const json = JSON.stringify(editor.trail, null, 2);
  const matches = (data) => {
    try {
      return JSON.stringify(normalizeTrail(JSON.parse(JSON.stringify(data))), null, 2) === json;
    } catch (_) {
      return false;
    }
  };
  $("versions-title").textContent = `VERSIONS · ${editor.trail.name.toUpperCase()}`;
  $("versions-where").textContent = saveStatusText(entry);
  const drafts = listDrafts(entry.id);
  const saved = entry.trail || createBlankTrail();
  const rows = [
    versionRow({
      title: savedName(entry),
      detail: entry.storage === "browser" ? "Saved in this browser" : entry.file ? `trails/${entry.file}` : "Built in",
      current: matches(saved),
      openLabel: "REVERT",
      onOpen: () => openVersion("saved", null, saved),
    }),
    ...drafts.map((draft) =>
      versionRow({
        title: `Draft · ${formatDraftTime(draft.at)}`,
        detail: draftAge(draft.at),
        current: matches(draft.trail),
        onOpen: () => openVersion("draft", draft.at, draft.trail),
        onDelete: () => {
          removeDraft(entry.id, draft.at);
          renderVersions();
        },
      }),
    ),
  ];
  $("versions-list").replaceChildren(...rows);
  $("versions-empty").hidden = drafts.length > 0;
  const unsaved = !rows.some((row) => row.classList.contains("current"));
  $("versions-unsaved").hidden = !unsaved;
}

export function openVersions() {
  renderVersions();
  /** @type {HTMLDialogElement} */ ($("versions")).showModal();
}

export function bindVersions() {
  const dialog = /** @type {HTMLDialogElement} */ ($("versions"));
  $("version-chip").addEventListener("click", openVersions);
  $("show-versions").addEventListener("click", openVersions);
  $("versions-save-draft").addEventListener("click", saveDraft);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

export function download(filename, content, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

// The trail picker groups its options natively: official trails first, then
// bonus trails, then custom ones split by where they are stored. The group heading says which is
// which, so each option needs only its name and its number, the same one the
// game shows: 01, B01 or C01, counted within its source. Option values stay
// the entry's index in trailEntries, which is what selectEntry() expects.
export function buildPicker() {
  const picker = $("trail-picker");
  const prefix = { official: "", bonus: "B", custom: "C" };
  const counts = {};
  const entries = trailEntries.map((entry, index) => {
    counts[entry.source] = (counts[entry.source] ?? 0) + 1;
    const marker = `${prefix[entry.source] ?? ""}${String(counts[entry.source]).padStart(2, "0")}`;
    return { entry, index, marker };
  });
  const groups = [
    ["OFFICIAL", (entry) => entry.source === "official"],
    ["BONUS", (entry) => entry.source === "bonus"],
    ["CUSTOM · FILE", (entry) => entry.source === "custom" && entry.storage !== "browser"],
    ["CUSTOM · BROWSER", (entry) => entry.source === "custom" && entry.storage === "browser"],
  ];
  picker.replaceChildren(
    ...groups
      .map(([label, matches]) => [
        label,
        entries.filter(({ entry }) => matches(entry)),
      ])
      .filter(([, items]) => items.length)
      .map(([label, items]) => {
        const group = document.createElement("optgroup");
        group.label = label;
        for (const { entry, index, marker } of items) {
          const option = document.createElement("option");
          option.value = index;
          option.dataset.marker = marker;
          option.textContent = entry.trail.name;
          group.append(option);
        }
        return group;
      }),
  );
  picker.value = String(editor.trailIndex);
}

export function currentEntry() {
  return trailEntries[editor.trailIndex];
}

export function canSave(entry = currentEntry()) {
  return entry?.storage === "browser" || (editor.devServer && Boolean(entry?.file));
}

const isShipped = (entry) => entry?.source === "official" || entry?.source === "bonus";

/** Only a custom trail this editor can write to can be deleted. */
function canDelete(entry = currentEntry()) {
  return entry?.source === "custom" && canSave(entry);
}

export function updateTrailControls() {
  const entry = currentEntry();
  $("save-trail").hidden = !canSave(entry);
  // Publishing over an official or bonus trail rewrites a shipped file, so it
  // is named for what it does and asks first.
  const shipped = isShipped(entry);
  $("save-trail-label").textContent = shipped ? `Overwrite ${entry.source} file…` : "Publish";
  $("save-trail").classList.toggle("danger-item", shipped);
  $("save-trail").title =
    entry?.storage === "browser"
      ? "Save to this browser's trail library, where the game plays it (Cmd/Ctrl+Shift+S)"
      : `Write trails/${entry?.file} (Cmd/Ctrl+Shift+S)`;
  $("delete-trail").hidden = !canDelete(entry);
  // Official and bonus trails come with the game, so only custom ones are shared.
  $("share-trail").hidden = shipped;
  // A trail that can't be saved can't be edited either: it can be looked at,
  // played, duplicated and exported. The fields stay visible but disabled, so
  // its settings can still be read.
  const readOnly = !canSave(entry);
  editor.readOnly = readOnly;
  for (const id of ["rename-trail", "save-draft", "versions-save-draft"]) $(id).hidden = readOnly;
  for (const tool of document.querySelectorAll("[data-tool]"))
    tool.disabled = readOnly && !NAVIGATION_TOOLS.has(tool.dataset.tool);
  // A disabled fieldset disables every control inside it, including the
  // segmented and picker buttons built from its selects.
  for (const id of ["selection-fieldset", "trail-fields"]) $(id).disabled = readOnly;
  $("trail-json").readOnly = readOnly;
  $("import-json").disabled = readOnly;
  if (readOnly && !NAVIGATION_TOOLS.has(editor.tool)) setTool("select");
  $("save-status").textContent = saveStatusText(entry);
  updateVersionChip();
}

function saveStatusText(entry) {
  return entry?.storage === "browser"
    ? "Saved in this browser"
    : editor.devServer
      ? `Dev server · trails/${entry?.file}`
      : "Read-only here · duplicate to edit";
}

export function selectEntry(index) {
  // Keep unsaved edits to the trail being left; they come back when it is reopened.
  autosaveNow();
  stopEditingPreview();
  editor.trailIndex = index;
  editor.history = [];
  editor.future = [];
  editor.trail = loadTrailData(editor.trailIndex);
  editor.selection = null;
  editor.focusPending = true;
  focusOnStart();
  rememberTrail();
  buildPicker();
  updateTrailControls();
  syncInspector();
  render();
  announceVersion();
}

function confirmOverwrite(entry) {
  const dialog = /** @type {HTMLDialogElement} */ ($("publish-confirm"));
  $("publish-kind").textContent = entry.source.toUpperCase();
  $("publish-file").textContent = `trails/${entry.file}`;
  dialog.returnValue = "";
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "overwrite"), {
      once: true,
    });
    dialog.showModal();
  });
}

/** Throws when the browser couldn't keep the last trail saved in it. */
async function browserSaved() {
  if (!(await browserTrailSaved())) throw new Error("browser storage is full or blocked");
}

async function persist(entry, data) {
  if (entry.storage === "browser") {
    const saved = saveBrowserTrail(data, entry.key);
    await browserSaved();
    return saved;
  }
  // A renamed custom trail moves to a file named after it. Official and bonus
  // files keep their names: the online leaderboard knows them by it.
  const file = entry.source === "custom" ? customFileFor(entry, data.name) : entry.file;
  if (file === entry.file) return saveTrailFile(entry.file, data);
  const oldId = entry.id;
  const oldFile = entry.file;
  await moveTrailFile(entry, file, data);
  moveDrafts(oldId, entry.id);
  moveLocks(oldId, entry.id);
  rememberTrail();
  return { ...entry, movedFrom: oldFile };
}

// Custom trails published before, by id, so Trail Network counts each trail once.
const PUBLISHED_KEY = "hjulben-published-trails-v1";

/**
 * Remembers a published trail by its ids (a renamed trail file gets a new
 * one) and returns whether it is the first time any of them was published.
 */
function notePublished(ids) {
  let known = [];
  try {
    known = JSON.parse(store().getItem(PUBLISHED_KEY) || "[]");
  } catch (_) {}
  const published = new Set(Array.isArray(known) ? known : []);
  const first = !ids.some((id) => published.has(id));
  for (const id of ids) published.add(id);
  try {
    store().setItem(PUBLISHED_KEY, JSON.stringify([...published]));
  } catch (_) {}
  return first;
}

export async function saveTrail() {
  const entry = currentEntry();
  if (!canSave(entry)) return;
  if (editor.version && !editor.version.unpublished) {
    showStatus("info", "Nothing to publish: the trail matches the published version.");
    return;
  }
  const errors = validateTrail(editor.trail).filter(
    (message) => message.type === "error",
  );
  if (errors.length && !refuse("publishing", errors)) return;
  if (isShipped(entry) && !(await confirmOverwrite(entry))) return;
  try {
    const firstId = entry.id;
    const saved = await persist(entry, editor.trail);
    markSaved(entry.id);
    if (entry.source === "custom") {
      reportEditorFeat("publish");
      if (notePublished([firstId, entry.id])) reportEditorFeat("new-trail");
    }
    setVersion("saved", null, editor.trail);
    autosaveNow();
    buildPicker();
    updateTrailControls();
    const published =
      entry.storage === "browser"
        ? "Published to this browser's trail library."
        : saved?.movedFrom
          ? `Published to trails/${entry.file} (renamed from ${saved.movedFrom.replace(/^custom\//, "")}).`
          : `Published to trails/${entry.file}.`;
    // The file was written, but the dev server could not rebuild the catalog
    // (another trail file may be broken), so the game may not list it yet.
    const warning = saved?.warning;
    if (warning) {
      delete saved.warning;
      showStatus("warning", `${published} ${warning}`);
    } else showStatus("info", published);
  } catch (error) {
    showStatus("error", `Could not publish: ${error.message}`);
  }
}

// Dev creates a file in trails/custom; otherwise the trail is stored in this browser.
export async function createCustomTrail(data) {
  try {
    const entry = editor.devServer
      ? await saveTrailFile(uniqueCustomFile(data.name), data)
      : saveBrowserTrail(data);
    if (!editor.devServer) await browserSaved();
    selectEntry(trailEntries.indexOf(entry));
  } catch (error) {
    showStatus("error", `Could not create the trail: ${error.message}`);
  }
}

export async function deleteTrail() {
  const entry = currentEntry();
  if (
    !canDelete(entry) ||
    !window.confirm(`Delete “${entry.trail.name}”? This cannot be undone.`)
  )
    return;
  try {
    if (entry.storage === "browser") {
      deleteBrowserTrail(entry.key);
      await browserSaved();
    } else await deleteTrailFile(entry.file);
    clearDrafts(entry.id);
    // The trail is gone, so there is nothing to autosave on the way out.
    editor.version = null;
    selectEntry(0);
  } catch (error) {
    showStatus("error", `Could not delete: ${error.message}`);
  }
}
