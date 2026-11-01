// The selection and trail panels on the right.
import { TEXT_PROPS, canRotate } from "../drawing.js";
import {
  cubicPoint,
  edgeCurve,
  isCurvedEdge,
  moveBlock,
  setBoundaryEdge,
  setNodeMode,
} from "../terrain-geometry.js";
import {
  SPIKE_RADIUS,
  normalizeAuthor,
  normalizeRotation,
  validateTrail,
} from "../trail-schema.js";
import { store } from "../local-store.js";
import { WEATHER_LEVELS, WEATHER_PRESETS, resolveWeather } from "../weather.js";
import { glareStrength } from "../lighting.js";
import { startWindsock } from "./windsock.js";
import { TIME_MARKS, clockTime, hourName, normalizeHour } from "../time-of-day.js";
import {
  blocks,
  boundariesOf,
  boundaryAt,
  fillCavesWithBackWalls,
  isBackWall,
  mergeSelectedBlocks,
  realignSmooth,
  replaceBlock,
  replaceBoundary,
  selectedBlocks,
  selectedCaves,
} from "./blocks.js";
import { $, canvas } from "./dom.js";
import { canRotateSelection, rotateSelected } from "./rotate.js";
import { pushHistory, snapshot, updateHistoryButtons } from "./history.js";
import { scheduleAutosave } from "./autosave.js";
import { updateVersionChip } from "./drafts.js";
import { closeMenu, updateValidationBadge } from "./menu.js";
import { renderObjects } from "./objects.js";
import { refuseEdit, showStatus } from "./status.js";
import {
  finishY,
  groundY,
  objectY,
  render,
  syncTerrain,
} from "./render.js";
import {
  deleteSelection,
  groupTitle,
  itemsCentre,
  moveItems,
  releaseLocked,
  revealItem,
  selectedOf,
  selectionBox,
  flippableProps,
  selectionItems,
} from "./selection.js";
import { editor, waters } from "./state.js";
import { saveToolSettings, toolSettings } from "./tools.js";
import { moveWaterTo, waterDepthHint, waterHandle, waterSize } from "./water.js";
import { NISSE_GROUND_LIFT } from "../nisse.js";
import { syncPreviewControls } from "./preview.js";

export function selectedPosition() {
  if (!editor.selection) return null;
  if (editor.selection.kind === "items") return itemsCentre(editor.selection.items);
  if (
    editor.selection.kind === "blockPoint" ||
    editor.selection.kind === "blockHandle" ||
    editor.selection.kind === "blockEdge"
  ) {
    const boundary = boundaryAt(editor.selection);
    if (!boundary) return null;
    const node = boundary.nodes[editor.selection.index];
    if (editor.selection.kind === "blockHandle") {
      const handle = node[editor.selection.side];
      return handle ? [handle[0], handle[1]] : [node.x, node.y];
    }
    if (editor.selection.kind === "blockEdge") {
      const next =
        boundary.nodes[(editor.selection.index + 1) % boundary.nodes.length];
      const [p0, c1, c2, p1] = edgeCurve(node, next);
      return cubicPoint(p0, c1, c2, p1, editor.selection.t);
    }
    return [node.x, node.y];
  }
  if (editor.selection.kind === "block" || editor.selection.kind === "blockBoundary") {
    const chosen = selectedBlocks()
      .map((index) => blocks()[index])
      .filter(Boolean);
    if (!chosen.length) return null;
    // The handle for blocks, or for one empty space, is the centre of their
    // nodes. A block covers every node it owns; a single boundary just its own.
    const nodes =
      editor.selection.kind === "blockBoundary"
        ? boundariesOf(chosen[0])[editor.selection.boundaryIndex]?.nodes || []
        : chosen.flatMap((block) =>
            boundariesOf(block).flatMap((boundary) => boundary.nodes),
          );
    if (!nodes.length) return null;
    return [
      nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length,
      nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length,
    ];
  }
  if (editor.selection.kind === "apple") {
    const apple = editor.trail.apples[editor.selection.index];
    return [apple.x, objectY(apple, 60)];
  }
  if (editor.selection.kind === "prop") {
    const prop = editor.trail.props[editor.selection.index];
    return [prop.x, objectY(prop)];
  }
  if (editor.selection.kind === "nisse")
    return editor.trail.nisse ? [editor.trail.nisse.x, objectY(editor.trail.nisse, NISSE_GROUND_LIFT)] : null;
  if (editor.selection.kind === "spike") {
    const spike = editor.trail.spikes[editor.selection.index];
    return [spike.x, spike.y];
  }
  if (editor.selection.kind === "water") {
    const body = waters()[editor.selection.index];
    return body ? waterHandle(body) : null;
  }
  if (editor.selection.kind === "start")
    return [
      editor.trail.start.x,
      Number.isFinite(editor.trail.start.y)
        ? editor.trail.start.y
        : groundY(editor.trail.start.x) - 12,
    ];
  if (editor.selection.kind === "finish") return [editor.trail.finish.x, finishY()];
  return null;
}

const BLOCK_KINDS = [
  "block",
  "blockPoint",
  "blockHandle",
  "blockEdge",
  "blockBoundary",
];

/**
 * Bring the side panel up to date with the trail. `live` is for a drag in
 * progress: the trail's JSON and validation are expensive on a big trail, so
 * they wait until the pointer pauses or is released.
 */
export function syncInspector({ live = false } = {}) {
  releaseLocked();
  syncTerrain();
  $("trail-name").value = editor.trail.name;
  $("trail-author").value = editor.trail.author || "";
  syncPreviewControls();
  // Don't overwrite notes the author is typing.
  if (document.activeElement !== $("trail-description"))
    $("trail-description").value = editor.trail.description || "";
  syncTimeOfDay();
  $("backdrop").value = editor.trail.backdrop || "hills";
  syncWeather();
  const position = selectedPosition();
  $("selection-fields").hidden = !editor.selection;
  $("selection-title").textContent = !editor.selection
    ? "NOTHING SELECTED"
    : editor.selection.kind === "items"
      ? groupTitle(editor.selection.items)
      : editor.selection.kind === "block" &&
          isBackWall(blocks()[editor.selection.blockIndex])
        ? "BACK WALL"
        : editor.selection.kind.replace(/([A-Z])/g, " $1").toUpperCase();
  $("selection-empty").hidden = Boolean(editor.selection);
  if (position) {
    $("selection-x").value = Math.round(position[0]);
    $("selection-y").value = Math.round(position[1]);
  }
  // How big the selection is, or how far apart a group's things stand. Water
  // on its own has its own Width and Depth fields.
  const box = editor.selection?.kind === "water" ? null : selectionBox();
  const size = box && [box.right - box.left, box.bottom - box.top].map(Math.round);
  $("selection-size-row").hidden = !size || !(size[0] || size[1]);
  if (size) $("selection-size").textContent = `${size[0]} × ${size[1]}`;
  // A group with blocks in it can change their material together.
  const isBlock =
    BLOCK_KINDS.includes(editor.selection?.kind) || selectedBlocks().length > 0;
  // The finish can be moved in y, so its Y row is shown. Every other object
  // with a fixed height is left as it was.
  $("selection-y-row").hidden = !editor.selection;
  // An apple, prop or finish with a height of its own can be put back on the ground.
  const lifted = groundable();
  $("selection-on-ground").hidden = !lifted || !Number.isFinite(lifted.y);
  $("selection-material-row").hidden = !isBlock;
  $("selection-block-layer-row").hidden = !isBlock;
  $("fill-back-walls").hidden = !selectedCaves().length;
  $("merge-blocks").hidden = selectedBlocks().length < 2;
  $("selection-edge-row").hidden = !["blockPoint", "blockEdge"].includes(
    editor.selection?.kind,
  );
  $("selection-node-row").hidden = !["blockPoint", "blockEdge"].includes(
    editor.selection?.kind,
  );
  $("selection-facing-row").hidden = editor.selection?.kind !== "start";
  // A group's props and spikes share their type, layer, flip, radius and spin
  // fields. Where they differ the field shows Mixed, and a new value sets them all.
  const props = selectedOf("prop").map((index) => editor.trail.props[index]);
  const flippable = flippableProps();
  $("selection-prop-type-row").hidden = !props.length;
  $("selection-layer-row").hidden = !props.length;
  $("selection-flip-row").hidden = !flippable.length;
  if (props.length) {
    $("selection-prop-type").value = shared(props.map((prop) => prop.type));
    $("selection-layer").value = shared(props.map(propLayer));
  }
  if (flippable.length)
    $("selection-flip").value = shared(flippable.map((prop) => String(Boolean(prop.flip))));
  $("selection-prop-text-row").hidden =
    editor.selection?.kind !== "prop" || !TEXT_PROPS.has(editor.trail.props[editor.selection.index]?.type);
  const selectedProp = editor.selection?.kind === "prop" ? editor.trail.props[editor.selection.index] : null;
  $("selection-rotation-row").hidden = !selectedProp || !canRotate(selectedProp.type);
  if (selectedProp && document.activeElement !== $("selection-rotation"))
    $("selection-rotation").value = selectedProp.rotation || 0;
  // A lone prop has its own Rotation field; blocks and groups turn by a quarter.
  $("selection-rotate-row").hidden = Boolean(selectedProp) || !canRotateSelection();
  const spikes = selectedOf("spike").map((index) => editor.trail.spikes[index]);
  for (const key of ["radius", "spin"]) {
    $(`selection-${key}-row`).hidden = !spikes.length;
    if (!spikes.length) continue;
    const value = shared(spikes.map((spike) => spike[key]));
    $(`selection-${key}`).value = value;
    $(`selection-${key}`).placeholder = value === "" ? "Mixed" : "";
  }
  const selectedWater =
    editor.selection?.kind === "water" ? waters()[editor.selection.index] : null;
  $("selection-water-width-row").hidden = !selectedWater;
  $("selection-water-depth-row").hidden = !selectedWater;
  $("selection-water-hint").hidden = !selectedWater;
  $("selection-nisse-hint").hidden = editor.selection?.kind !== "nisse";
  if (selectedWater) {
    $("selection-water-width").value = Math.round(selectedWater.width);
    $("selection-water-depth").value = Math.round(selectedWater.depth);
    $("selection-water-hint").textContent = waterDepthHint(selectedWater.depth);
  }
  $("delete-selection").hidden =
    !editor.selection || ["start", "finish"].includes(editor.selection.kind);
  if (isBlock) {
    const first = blocks()[selectedBlocks()[0]];
    $("selection-material").value = first?.material || "grass";
    $("selection-block-layer").value = isBackWall(first) ? "back" : "terrain";
    const boundary = boundaryAt(editor.selection);
    const node = boundary?.nodes[editor.selection.index];
    if (node && editor.selection.kind !== "blockHandle") {
      $("selection-edge").value = isCurvedEdge(
        node,
        boundary.nodes[(editor.selection.index + 1) % boundary.nodes.length],
      )
        ? "curve"
        : "straight";
      $("selection-node").value = node.mode;
    }
  }
  if (editor.selection?.kind === "start")
    $("selection-facing").value = String(editor.trail.start.facing);
  if (editor.selection?.kind === "prop") {
    $("selection-prop-text").value = editor.trail.props[editor.selection.index].text || "";
  }
  if (live) {
    clearTimeout(pendingDetails);
    pendingDetails = setTimeout(syncDetails, 200);
  } else syncDetails();
  updateHistoryButtons();
}

let pendingDetails = null;

const propLayer = (prop) => (prop.layer === "front" ? "front" : "back");

/** The value every one of `values` has, or "" when they differ. */
const shared = (values) => (new Set(values).size === 1 ? values[0] : "");

function syncDetails() {
  clearTimeout(pendingDetails);
  pendingDetails = null;
  const json = JSON.stringify(editor.trail, null, 2);
  // Filling the box is slow on a large trail (a 5 MB one takes over 0.1 s,
  // hidden or not), so it is only kept up to date while its dialog is open.
  if (/** @type {HTMLDialogElement} */ ($("data-dialog")).open) $("trail-json").value = json;
  updateVersionChip(json);
  renderObjects();
  scheduleAutosave(json);
  const messages = validateTrail(editor.trail);
  $("validation-list").replaceChildren(
    ...messages.map((message) => {
      const item = document.createElement("li");
      item.className = message.type;
      if (!message.target) {
        item.textContent = message.text;
        return item;
      }
      // A message about one item takes the author to it.
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = message.text;
      button.title = "Select it and show it on the canvas";
      button.addEventListener("click", () => {
        closeMenu();
        revealItem(message.target);
      });
      item.append(button);
      return item;
    }),
  );
  updateValidationBadge(messages);
  syncSelectionIssues(messages);
}

/** The errors and warnings about the selected items, shown above their fields. */
function syncSelectionIssues(messages) {
  // A point, edge or handle of a block shares its block's problems.
  const targets = selectionItems().map((item) =>
    item.type === "point" ? { type: "block", index: item.blockIndex } : item,
  );
  if (Number.isInteger(editor.selection?.blockIndex))
    targets.push({ type: "block", index: editor.selection.blockIndex });
  const issues = messages.filter(
    ({ target }) =>
      target &&
      targets.some((item) => item.type === target.type && item.index === target.index),
  );
  $("selection-issues").hidden = !issues.length;
  $("selection-issues").replaceChildren(
    ...issues.map((message) => {
      const item = document.createElement("li");
      item.className = message.type;
      item.textContent = message.text;
      return item;
    }),
  );
}

/** Fill the import and export box with the trail, as its dialog opens. */
export function fillTrailJson() {
  flushInspector();
  $("trail-json").value = JSON.stringify(editor.trail, null, 2);
}

/** Finish any JSON and validation a live drag left waiting. */
export function flushInspector() {
  if (pendingDetails !== null) syncDetails();
}

export function updateSelectedPosition(x, y) {
  if (!editor.selection) return;
  const kind = editor.selection.kind;
  if (kind === "items") {
    moveItems(x, y);
    return;
  }
  if (kind === "blockPoint" || kind === "blockHandle") {
    const boundary = boundaryAt(editor.selection);
    if (!boundary) return;
    const node = boundary.nodes[editor.selection.index];
    if (!node) return;
    if (kind === "blockHandle") node[editor.selection.side] = [x, y];
    else {
      const dx = x - node.x,
        dy = y - node.y;
      node.x = x;
      node.y = y;
      // Handles are absolute points, so they have to travel with their point
      // or the curve changes shape as the point is dragged.
      if (node.in) node.in = [node.in[0] + dx, node.in[1] + dy];
      if (node.out) node.out = [node.out[0] + dx, node.out[1] + dy];
    }
    if (node.mode === "smooth") realignSmooth(boundary, editor.selection.index);
  } else if (kind === "blockEdge") {
    // Dragging an edge stretches it: the handles follow so the curve keeps its
    // shape rather than collapsing into its chord.
    const boundary = boundaryAt(editor.selection);
    if (!boundary) return;
    const node = boundary.nodes[editor.selection.index];
    const next = boundary.nodes[(editor.selection.index + 1) % boundary.nodes.length];
    const before = selectedPosition();
    const dx = x - before[0],
      dy = y - before[1];
    if (isCurvedEdge(node, next)) {
      node.out = [node.out[0] + dx, node.out[1] + dy];
      next.in = [next.in[0] + dx, next.in[1] + dy];
    } else {
      // A straight edge moves as a whole, carrying any handles of its ends.
      for (const end of [node, next]) {
        end.x += dx;
        end.y += dy;
        if (end.in) end.in = [end.in[0] + dx, end.in[1] + dy];
        if (end.out) end.out = [end.out[0] + dx, end.out[1] + dy];
      }
    }
  } else if (kind === "block") {
    const current = selectedPosition();
    if (!current) return;
    for (const index of selectedBlocks()) {
      if (blocks()[index])
        replaceBlock(
          index,
          moveBlock(blocks()[index], x - current[0], y - current[1]),
        );
    }
  } else if (kind === "blockBoundary") {
    // Dragging a whole ring moves just that ring. For a cave, its old place
    // fills in and its new place opens up; for an outer boundary, the solid
    // moves while its caves stay where they are.
    const current = selectedPosition();
    const boundary = boundaryAt(editor.selection);
    if (!current || !boundary) return;
    const dx = x - current[0],
      dy = y - current[1];
    replaceBoundary(editor.selection.blockIndex, editor.selection.boundaryIndex, {
      ...boundary,
      nodes: boundary.nodes.map((node) => ({
        ...node,
        x: node.x + dx,
        y: node.y + dy,
        in: node.in ? [node.in[0] + dx, node.in[1] + dy] : null,
        out: node.out ? [node.out[0] + dx, node.out[1] + dy] : null,
      })),
    });
  } else if (kind === "apple") {
    editor.trail.apples[editor.selection.index].x = x;
    editor.trail.apples[editor.selection.index].y = y;
  } else if (kind === "nisse") {
    if (editor.trail.nisse) Object.assign(editor.trail.nisse, { x, y });
  } else if (kind === "prop") {
    editor.trail.props[editor.selection.index].x = x;
    editor.trail.props[editor.selection.index].y = y;
  } else if (kind === "spike") {
    editor.trail.spikes[editor.selection.index].x = x;
    editor.trail.spikes[editor.selection.index].y = y;
  } else if (kind === "water") {
    const body = waters()[editor.selection.index];
    if (body) moveWaterTo(body, x, y);
  } else if (kind === "start") {
    editor.trail.start.x = x;
    editor.trail.start.y = y;
  } else if (kind === "finish") {
    // The finish is a point: it can be moved in y as well as x, so a flag can
    // stand on a floating block or hang above a cave instead of being pinned to the
    // surface. Dragging it sets an explicit height; the inspector's "On the
    // ground" button (putOnGround) sends it back to the surface below.
    editor.trail.finish.x = x;
    editor.trail.finish.y = y;
  }
}

/** The selected object whose height can be a number or "on the ground", if any. */
function groundable() {
  const kind = editor.selection?.kind;
  if (kind === "apple") return editor.trail.apples[editor.selection.index];
  if (kind === "prop") return editor.trail.props[editor.selection.index];
  if (kind === "nisse") return editor.trail.nisse;
  if (kind === "finish") return editor.trail.finish;
  return null;
}

/**
 * Forget the selected object's height, so it stands on whatever surface is
 * under it again, and follows the ground when the terrain changes.
 */
function putOnGround() {
  const object = groundable();
  if (!object || !Number.isFinite(object.y)) return;
  if (refuseEdit()) return;
  pushHistory();
  object.y = null;
  syncInspector();
  render();
}

function showWeatherValue(key) {
  const value = Number($(`weather-${key}`).value) || 0;
  $(`weather-${key}-value`).textContent = `${Math.round(value * 100)}%`;
  showSunGlare();
}

/**
 * Beside the sun's level, the glare the game gives it: a strong sun glares
 * and casts rays, which the level alone doesn't tell, as clouds, fog, rain
 * and the time of day all temper it.
 */
function showSunGlare() {
  const sun = Number($("weather-sun").value) || 0;
  const glare = glareStrength({ timeOfDay: editor.trail.timeOfDay, weather: resolveWeather(editor.trail.weather) });
  const word = glare >= 0.9 ? "full glare" : glare >= 0.5 ? "strong glare" : glare > 0.05 ? "some glare" : "no glare";
  $("weather-sun-value").textContent = `${Math.round(sun * 100)}% · ${word}`;
}

/**
 * The weather controls: each slider, which way the wind blows, and the preset
 * the weather matches, if any.
 */
function syncWeather() {
  const weather = resolveWeather(editor.trail.weather);
  for (const key of WEATHER_LEVELS) {
    $(`weather-${key}`).value = String(weather[key]);
    showWeatherValue(key);
  }
  for (const direction of ["left", "right"]) {
    const button = $(`wind-${direction}`);
    const active = weather.windDirection === direction;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  for (const button of $("weather-presets").querySelectorAll("button")) {
    const preset = WEATHER_PRESETS.find(({ id }) => id === button.dataset.preset);
    const active = Boolean(preset) && Object.entries(preset.weather).every(([key, value]) => weather[key] === value);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

/** The time of day slider, its readout, and the help point it is on, if any. */
function syncTimeOfDay() {
  const hour = normalizeHour(editor.trail.timeOfDay);
  $("time-of-day").value = String(hour);
  showTimeOfDay(hour);
  for (const button of $("time-marks").querySelectorAll("button")) {
    const active = Number(button.dataset.hour) === hour;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function showTimeOfDay(hour) {
  $("time-of-day-value").textContent = `${clockTime(hour)} · ${hourName(hour)}`;
  showSunGlare();
}

/** Changes the trail's weather as one undoable step. */
function setWeather(changes) {
  pushHistory();
  editor.trail.weather = { ...resolveWeather(editor.trail.weather), ...changes };
  syncInspector();
  render();
}

const AUTHOR_KEY = "hjulben-editor-author";

/** The author last typed in, so new trails are credited to them too. */
export function rememberedAuthor() {
  try {
    return normalizeAuthor(store().getItem(AUTHOR_KEY) || "");
  } catch (_) {
    return "";
  }
}

function rememberAuthor(author) {
  try {
    if (author) store().setItem(AUTHOR_KEY, author);
  } catch (_) {
    // Storage can be full or blocked; the trail still keeps its author.
  }
}

/** Give the trail a new name, as one undoable edit. */
export function renameTrail(name) {
  name = String(name).trim();
  if (!name || name === editor.trail.name) return false;
  pushHistory();
  editor.trail.name = name;
  syncInspector();
  render();
  return true;
}

/**
 * A slider that changes the trail live while it is dragged (or stepped with
 * the arrow keys), as one undo step per drag. Its input events change the
 * trail as it goes, so by the change event that ends the drag the trail
 * already has the new value: the undo step is the trail from before the first
 * input instead, or undo would put back the value just set.
 */
function bindTrailSlider(id, apply, show) {
  let before = null;
  $(id).addEventListener("input", (event) => {
    before ??= snapshot();
    apply(Number(event.target.value));
    show();
    render();
  });
  $(id).addEventListener("change", (event) => {
    pushHistory(before ?? snapshot());
    before = null;
    apply(Number(event.target.value));
    syncInspector();
    render();
  });
}

function bindTrailInput(id, apply) {
  $(id).addEventListener("change", (event) => {
    pushHistory();
    apply(event.target.value);
    syncInspector();
    render();
  });
}

let propTextPending = false;
const SIGN_ARROW_KEYS = { "<": "←", ">": "→", "^": "↑" };

export function bindInspector() {
  // A blank name is refused, as the rename dialog refuses it: the field goes
  // back to the name the trail has.
  $("trail-name").addEventListener("change", (event) => {
    if (!renameTrail(event.target.value)) syncInspector();
  });

  bindTrailInput("trail-author", (value) => {
    const author = normalizeAuthor(value);
    if (author) editor.trail.author = author;
    else delete editor.trail.author;
    rememberAuthor(author);
  });

  bindTrailInput("trail-description", (value) => {
    editor.trail.description = value;
  });

  // The hour, dragged through the day, with a help point for each of the
  // classic times.
  bindTrailSlider(
    "time-of-day",
    (hour) => { editor.trail.timeOfDay = normalizeHour(hour); },
    () => showTimeOfDay(editor.trail.timeOfDay),
  );
  for (const mark of TIME_MARKS) {
    const option = document.createElement("option");
    option.value = String(mark.hour);
    option.label = mark.name;
    $("time-of-day-marks").append(option);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = mark.name;
    button.dataset.hour = String(mark.hour);
    button.title = clockTime(mark.hour);
    button.addEventListener("click", () => {
      if (normalizeHour(editor.trail.timeOfDay) === mark.hour) return;
      pushHistory();
      editor.trail.timeOfDay = mark.hour;
      syncInspector();
      render();
    });
    $("time-marks").append(button);
  }

  bindTrailInput("backdrop", (value) => {
    if (value && value !== "hills") editor.trail.backdrop = value;
    else delete editor.trail.backdrop;
  });

  for (const key of WEATHER_LEVELS)
    bindTrailSlider(
      `weather-${key}`,
      (value) => { editor.trail.weather[key] = value; },
      () => showWeatherValue(key),
    );
  for (const direction of ["left", "right"])
    $(`wind-${direction}`).addEventListener("click", () => {
      if (resolveWeather(editor.trail.weather).windDirection !== direction)
        setWeather({ windDirection: direction });
    });
  // A preset sets everything but the wind's direction, for the author to
  // fine-tune from.
  for (const preset of WEATHER_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = preset.name;
    button.dataset.preset = preset.id;
    button.addEventListener("click", () => setWeather(preset.weather));
    $("weather-presets").append(button);
  }
  startWindsock($("windsock"), () => editor.trail.weather);

  // A cleared or unreadable coordinate leaves the selection where it is:
  // Number("") is 0, which would send it to the edge of the world.
  for (const [axis, id] of [[0, "selection-x"], [1, "selection-y"]])
    $(id).addEventListener("change", (event) => {
      const position = selectedPosition();
      if (!position) return;
      const value = Number(event.target.value);
      if (event.target.value.trim() === "" || !Number.isFinite(value)) {
        syncInspector();
        return;
      }
      pushHistory();
      updateSelectedPosition(axis === 0 ? value : position[0], axis === 1 ? value : position[1]);
      syncInspector();
      render();
    });

  $("selection-on-ground").addEventListener("click", putOnGround);

  $("selection-material").addEventListener("change", (event) => {
    const material = event.target.value;
    if (BLOCK_KINDS.includes(editor.selection?.kind) || editor.selection?.kind === "items") {
      const chosen = selectedBlocks().filter((index) => blocks()[index]);
      if (!chosen.length) return;
      pushHistory();
      for (const index of chosen)
        replaceBlock(index, { ...blocks()[index], material });
      // The next block drawn uses the material last chosen.
      toolSettings.block.material = material;
      saveToolSettings();
    }
    syncInspector();
    render();
  });

  // Moving blocks between the terrain and the back walls; the next block drawn
  // goes on the layer last chosen.
  $("selection-block-layer").addEventListener("change", (event) => {
    const back = event.target.value === "back";
    const chosen = selectedBlocks().filter(
      (index) => blocks()[index] && isBackWall(blocks()[index]) !== back,
    );
    if (chosen.length) {
      pushHistory();
      for (const index of chosen) {
        const { layer, ...block } = blocks()[index];
        replaceBlock(index, back ? { ...block, layer: "back" } : block);
      }
      toolSettings.block.layer = back ? "back" : "terrain";
      saveToolSettings();
    }
    syncInspector();
    render();
  });

  $("fill-back-walls").addEventListener("click", () => {
    const added = fillCavesWithBackWalls();
    if (added)
      showStatus(
        "info",
        `Added ${added === 1 ? "a back wall" : `${added} back walls`}; ${added === 1 ? "the cave stays" : "the caves stay"} dark.`,
      );
    syncInspector();
    render();
  });

  $("merge-blocks").addEventListener("click", () => {
    mergeSelectedBlocks();
    syncInspector();
    render();
  });

  $("selection-edge").addEventListener("change", (event) => {
    if (!["blockPoint", "blockEdge"].includes(editor.selection?.kind)) return;
    const boundary = boundaryAt(editor.selection);
    if (!boundary) return;
    pushHistory();
    const updated = setBoundaryEdge(
      boundary,
      editor.selection.index,
      event.target.value === "curve",
    );
    replaceBoundary(editor.selection.blockIndex, editor.selection.boundaryIndex, {
      ...updated,
      id: boundary.id,
    });
    syncInspector();
    render();
  });

  $("selection-node").addEventListener("change", (event) => {
    if (!["blockPoint", "blockEdge"].includes(editor.selection?.kind)) return;
    const boundary = boundaryAt(editor.selection);
    if (!boundary) return;
    pushHistory();
    const updated = setNodeMode(boundary, editor.selection.index, event.target.value);
    replaceBoundary(editor.selection.blockIndex, editor.selection.boundaryIndex, {
      ...updated,
      id: boundary.id,
    });
    syncInspector();
    render();
  });

  $("selection-facing").addEventListener("change", (event) => {
    if (editor.selection?.kind !== "start") return;
    pushHistory();
    editor.trail.start.facing = Number(event.target.value) < 0 ? -1 : 1;
    syncInspector();
    render();
  });

  $("selection-flip").addEventListener("change", (event) => {
    const flip = event.target.value === "true";
    const chosen = flippableProps().filter((prop) => Boolean(prop.flip) !== flip);
    if (chosen.length) {
      pushHistory();
      for (const prop of chosen) {
        if (flip) prop.flip = true;
        else delete prop.flip;
      }
    }
    syncInspector();
    render();
  });

  $("selection-rotation").addEventListener("change", (event) => {
    if (editor.selection?.kind !== "prop") return;
    const prop = editor.trail.props[editor.selection.index];
    if (!canRotate(prop.type)) return;
    const rotation = normalizeRotation(event.target.value);
    if (rotation !== prop.rotation) {
      pushHistory();
      if (rotation === undefined) delete prop.rotation;
      else prop.rotation = rotation;
    }
    syncInspector();
    render();
  });

  for (const [id, degrees] of [["rotate-ccw", -90], ["rotate-cw", 90]])
    $(id).addEventListener("click", () => {
      rotateSelected(degrees);
      // Hand focus back so the canvas shortcuts keep working.
      canvas.focus({ preventScroll: true });
    });

  $("selection-prop-type").addEventListener("change", (event) => {
    const type = event.target.value;
    const chosen = selectedOf("prop")
      .map((index) => editor.trail.props[index])
      .filter((prop) => prop.type !== type);
    if (type && chosen.length) {
      pushHistory();
      for (const prop of chosen) {
        prop.type = type;
        if (prop.type === "sign" && typeof prop.text !== "string") prop.text = "";
      }
    }
    syncInspector();
    render();
  });

  $("selection-layer").addEventListener("change", (event) => {
    const layer = event.target.value === "front" ? "front" : "back";
    const chosen = selectedOf("prop")
      .map((index) => editor.trail.props[index])
      .filter((prop) => propLayer(prop) !== layer);
    if (chosen.length) {
      pushHistory();
      for (const prop of chosen) prop.layer = layer;
    }
    syncInspector();
    render();
  });

  $("selection-prop-text").addEventListener("focus", () => {
    if (editor.selection?.kind === "prop") propTextPending = true;
  });

  $("selection-prop-text").addEventListener("input", (event) => {
    if (editor.selection?.kind !== "prop") return;
    if (propTextPending) {
      pushHistory();
      propTextPending = false;
    }
    // The pixel font has no < > ^, so they stand in for the arrows it does have.
    const field = event.target;
    const value = field.value.replace(/[<>^]/g, (key) => SIGN_ARROW_KEYS[key]);
    if (value !== field.value) {
      const caret = field.selectionStart;
      field.value = value;
      field.setSelectionRange(caret, caret);
    }
    editor.trail.props[editor.selection.index].text = value;
    render();
  });

  $("selection-prop-text").addEventListener("change", () => syncInspector());

  // Clearing a Mixed field leaves the spikes as they were.
  $("selection-radius").addEventListener("change", (event) => {
    const spikes = selectedOf("spike").map((index) => editor.trail.spikes[index]);
    if (spikes.length && event.target.value !== "") {
      pushHistory();
      const radius = Math.max(
        SPIKE_RADIUS.min,
        Math.min(SPIKE_RADIUS.max, Number(event.target.value) || SPIKE_RADIUS.default),
      );
      for (const spike of spikes) spike.radius = radius;
    }
    syncInspector();
    render();
  });

  $("selection-spin").addEventListener("change", (event) => {
    const spikes = selectedOf("spike").map((index) => editor.trail.spikes[index]);
    if (spikes.length && event.target.value !== "") {
      pushHistory();
      const spin = Number(event.target.value);
      for (const spike of spikes) spike.spin = Number.isFinite(spin) ? spin : 0;
    }
    syncInspector();
    render();
  });

  for (const key of ["width", "depth"])
    $(`selection-water-${key}`).addEventListener("change", (event) => {
      const body =
        editor.selection?.kind === "water" ? waters()[editor.selection.index] : null;
      if (!body) return;
      pushHistory();
      // A new width keeps the body centred where it was; a new depth keeps
      // its surface and moves the bottom.
      const centre = body.x + body.width / 2;
      body[key] = waterSize(event.target.value, key);
      if (key === "width") body.x = centre - body.width / 2;
      syncInspector();
      render();
    });

  $("delete-selection").addEventListener("click", deleteSelection);
}
