// Trail editor entry point: sets up the initial state, wires the page's
// controls, and draws the first frame.
// First, so it listens for a new release while the trails load.
import { setUpdatePrompt } from "../update-prompt.js";
import { store } from "../local-store.js";
import {
  cloneTrail,
  createBlankTrail,
  normalizeTrail,
  validateTrail,
} from "../trail-schema.js";
import { devServerWritable, reportEditorFeat, terrainMaterials, trailEntries } from "../trails.js";
import { DISCORD_LINK_LENGTH, MAX_JSON_BYTES, trailShareUrl } from "../trail-link.js";
import { autosaveFailing, autosaveNow, bindAutosave } from "./autosave.js";
import { bindClipboard } from "./clipboard.js";
import { $, canvas, wrap } from "./dom.js";
import { openDraftStore, whenWritten } from "./draft-store.js";
import { pushHistory, redo, undo, updateHistoryButtons } from "./history.js";
import { bindInput } from "./input.js";
import { bindInspector, rememberedAuthor, renameTrail, syncInspector } from "./inspector.js";
import { bindMenu } from "./menu.js";
import { pickerSelect } from "./picker.js";
import { bindPlaytest, playtestOpen } from "./playtest.js";
import { GAME_ART_KEY, render } from "./render.js";
import { editor } from "./state.js";
import { refuse, refuseEdit, showStatus } from "./status.js";
import { propThumbnail } from "./thumbnails.js";
import { segmentSelects } from "./segmented.js";
import { editingPreview, resetPreview, startEditingPreview, stopEditingPreview } from "./preview.js";
import { TOOL_KEY_LABELS, materialLabel, renderToolSettings, resolveToolKeyLabels, setTab, setTool } from "./tools.js";
import {
  announceVersion,
  bindVersions,
  buildPicker,
  createCustomTrail,
  deleteTrail,
  download,
  loadTrailData,
  saveDraft,
  saveTrail,
  selectEntry,
  storedTrailIndex,
  updateTrailControls,
} from "./trails.js";
import {
  focusOnStart,
  resize,
  toggleGameArt,
  updateGameArtButton,
  updateZoom,
  zoomAtCenter,
} from "./view.js";

editor.trailIndex = storedTrailIndex();

// Drafts and autosaves are read into memory first, so opening a trail can
// pick them up at once.
await openDraftStore();
editor.trail = loadTrailData(editor.trailIndex);

editor.gameArt = (() => {
  try {
    return store().getItem(GAME_ART_KEY) === "1";
  } catch (_) {
    return false;
  }
})();

bindClipboard();

bindAutosave();

bindPlaytest();

buildPicker();

for (const name of Object.keys(terrainMaterials)) {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = materialLabel(name);
  $("selection-material").append(option);
}

// Short dropdowns are shown as button rows; this must run after the
// material dropdowns above are filled.
segmentSelects(document);

pickerSelect($("trail-picker"), { title: "Trail" });

pickerSelect($("selection-prop-type"), {
  title: "Prop",
  thumbnail: propThumbnail,
  placeholder: "Mixed",
});

document
  .querySelectorAll("[data-tool]")
  .forEach((button) =>
    button.addEventListener("click", () => setTool(button.dataset.tool)),
  );

// Hover tooltips naming each tool's shortcut.
function labelToolButtons() {
  document.querySelectorAll("[data-tool]").forEach((button) => {
    const key = TOOL_KEY_LABELS[button.dataset.tool];
    if (key) button.title = `${button.textContent.trim()} (${key})`;
  });
}
labelToolButtons();
// On a non-QWERTY keyboard the labels follow what is printed on the keys.
resolveToolKeyLabels().then((changed) => {
  if (!changed) return;
  labelToolButtons();
  renderToolSettings();
});

document
  .querySelectorAll("[data-tab]")
  .forEach((button) =>
    button.addEventListener("click", () => setTab(button.dataset.tab)),
  );

$("trail-picker").addEventListener("change", (event) =>
  selectEntry(Number(event.target.value)),
);

$("save-trail").addEventListener("click", saveTrail);

$("new-trail").addEventListener("click", () =>
  createCustomTrail(normalizeTrail({ ...createBlankTrail(), author: rememberedAuthor() })),
);

$("duplicate-trail").addEventListener("click", () => {
  const copy = cloneTrail(editor.trail);
  copy.name = `${editor.trail.name} Copy`;
  createCustomTrail(copy);
});

$("delete-trail").addEventListener("click", deleteTrail);

const renameDialog = /** @type {HTMLDialogElement} */ ($("rename-dialog"));
const renameInput = /** @type {HTMLInputElement} */ ($("rename-input"));

$("rename-trail").addEventListener("click", () => {
  if (refuseEdit()) return;
  renameInput.value = editor.trail.name;
  renameDialog.returnValue = "";
  renameDialog.showModal();
  renameInput.select();
});

renameDialog.addEventListener("close", () => {
  if (renameDialog.returnValue === "rename" && renameTrail(renameInput.value))
    showStatus("info", `Renamed to “${editor.trail.name}”. Save a draft or publish to keep it.`);
});

// Typing a name must not trigger the editor's shortcuts, such as undo.
renameDialog.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") event.stopPropagation();
});

$("rename-cancel").addEventListener("click", () => renameDialog.close());

renameDialog.addEventListener("click", (event) => {
  if (event.target === renameDialog) renameDialog.close();
});

$("undo").addEventListener("click", undo);

$("redo").addEventListener("click", redo);

$("zoom-in").addEventListener("click", () => zoomAtCenter(1.2));

$("zoom-out").addEventListener("click", () => zoomAtCenter(1 / 1.2));

bindInput();

bindInspector();

bindMenu();

bindVersions();

updateGameArtButton();

$("edit-preview").addEventListener("click", () => {
  if (editingPreview()) stopEditingPreview();
  else startEditingPreview();
  // Hand focus back so Esc and the canvas shortcuts keep working.
  canvas.focus({ preventScroll: true });
});

$("reset-preview").addEventListener("click", () => {
  resetPreview();
  canvas.focus({ preventScroll: true });
});

$("game-art").addEventListener("click", () => {
  toggleGameArt();
  // Hand focus back so the canvas shortcuts, Y included, keep working.
  canvas.focus({ preventScroll: true });
});

$("save-draft").addEventListener("click", saveDraft);

$("export-json").addEventListener("click", () => {
  const errors = validateTrail(editor.trail).filter(
    (message) => message.type === "error",
  );
  if (errors.length && !refuse("exporting", errors)) return;
  download(
    `${editor.trail.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`,
    JSON.stringify(editor.trail, null, 2) + "\n",
    "application/json",
  );
});

// The whole trail rides in the link's hash, so sharing needs no server.
$("share-trail").addEventListener("click", async () => {
  const errors = validateTrail(editor.trail).filter(
    (message) => message.type === "error",
  );
  if (errors.length && !refuse("sharing", errors)) return;
  // The game stops unpacking a link past MAX_JSON_BYTES, so a bigger trail
  // would make a link that can't be opened.
  const bytes = new TextEncoder().encode(JSON.stringify(editor.trail)).length;
  if (bytes > MAX_JSON_BYTES) {
    showStatus(
      "error",
      `This trail is too big to share as a link (${(bytes / (1 << 20)).toFixed(1)} MiB of JSON, the limit is ${MAX_JSON_BYTES >> 20} MiB). Share the exported JSON file instead.`,
    );
    return;
  }
  let url;
  try {
    url = await trailShareUrl(editor.trail, new URL("./", window.location.href));
  } catch (error) {
    showStatus("error", `Could not make a share link: ${error.message}`);
    return;
  }
  const length = url.length.toLocaleString("en-US");
  reportEditorFeat("share");
  try {
    await navigator.clipboard.writeText(url);
  } catch (_) {
    // No clipboard access (an insecure page, or permission refused).
    window.prompt("Copy this link to share the trail:", url);
    return;
  }
  if (url.length > DISCORD_LINK_LENGTH) {
    showStatus(
      "info",
      `Share link copied · ${length} characters is too long for a Discord message, so post it somewhere else, or share the exported JSON file`,
    );
  } else showStatus("info", `Share link copied (${length} characters). Opening it plays the trail and saves it under Custom Trails.`);
});

$("import-json").addEventListener("click", () => {
  if (refuseEdit()) return;
  try {
    // Parsed and normalized before the undo step is taken, so a typo in the
    // JSON leaves the history as it was.
    const imported = normalizeTrail(JSON.parse($("trail-json").value));
    pushHistory();
    editor.trail = imported;
    editor.selection = null;
    editor.focusPending = true;
    focusOnStart();
    syncInspector();
    render();
  } catch (error) {
    const item = document.createElement("li");
    item.className = "error";
    item.textContent = `Invalid JSON: ${error.message}`;
    $("validation-list").replaceChildren(item);
    showStatus("error", item.textContent);
  }
});

new ResizeObserver(resize).observe(wrap);

setTool("select");

syncInspector();

updateHistoryButtons();

updateTrailControls();

resize();

// The save controls depend on the dev server.
editor.devServer = devServerWritable;
updateTrailControls();
render();
document.querySelector(".editor-shell").removeAttribute("data-booting");
announceVersion();

// A new release asks for its reload once any play test is over, and keeps the
// trail first. Edits the browser can't store would be lost, so then the
// reload can wait while they are exported.
setUpdatePrompt({
  canShow: () => !playtestOpen(),
  beforeReload: async () => {
    autosaveNow();
    await whenWritten();
  },
  canPostpone: autosaveFailing,
});
