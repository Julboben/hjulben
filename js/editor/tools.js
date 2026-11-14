// Tool definitions, keyboard letters, and the per-tool settings panel.
import { store } from "../local-store.js";
import { SPIKE_RADIUS } from "../trail-schema.js";
import { terrainMaterials } from "../trails.js";
import { $, canvas } from "./dom.js";
import { renderObjects } from "./objects.js";
import { pickerSelect } from "./picker.js";
import { schedulePreviewThumbnail, stopEditingPreview } from "./preview.js";
import { segmentSelects } from "./segmented.js";
import { editor } from "./state.js";
import { refuseEdit } from "./status.js";
import { propThumbnail } from "./thumbnails.js";

/** The tools that only look around, so they work on a read-only trail too. */
export const NAVIGATION_TOOLS = new Set(["select", "pan"]);

const TOOL_SETTINGS_KEY = "hjulben-editor-tool-settings-v1";

export const propTypeOptions = () =>
  [...$("selection-prop-type").options].map((option) => [
    option.value,
    option.textContent,
  ]);

export const materialLabel = (name) => name[0].toUpperCase() + name.slice(1);

const materialOptions = () =>
  Object.keys(terrainMaterials).map((name) => [name, materialLabel(name)]);

export const BLOCK_LAYERS = [
  ["terrain", "Terrain"],
  ["back", "Back wall"],
];

const LAYER_FIELD = {
  key: "layer",
  label: "Layer",
  type: "select",
  options: () => BLOCK_LAYERS,
};

export const TOOL_INFO = {
  select: {
    title: "Select",
    hint: "Click to select, drag to move. Press ? for all shortcuts.",
  },
  pan: {
    title: "Pan",
    hint: "Drag to move the view.",
  },
  block: {
    title: "Block",
    hint: "Drag an outline to draw a block.",
    fields: [
      {
        key: "material",
        label: "Material",
        type: "select",
        options: materialOptions,
        // A list of content that may grow, so never a row of buttons.
        dropdown: true,
      },
      LAYER_FIELD,
    ],
  },
  cut: {
    title: "Cut",
    hint: "Drag an outline over a block to cut a cave or a hole.",
    fields: [LAYER_FIELD],
  },
  apple: {
    title: "Apple",
    hint: "Click to place. Riders must collect every apple to finish. The nisse is optional. Checkpoints are flags a rider can go back to after a crash, for long trails.",
    fields: [
      {
        key: "kind",
        label: "Place",
        type: "select",
        options: () => [
          ["apple", "Apple"],
          ["nisse", "Nisse"],
          ["checkpoint", "Checkpoint"],
        ],
      },
    ],
  },
  spike: {
    title: "Spike",
    hint: "Click to place a spike. Touching it kills the rider.",
    fields: [
      {
        key: "radius",
        label: "Radius",
        type: "number",
        min: SPIKE_RADIUS.min,
        max: SPIKE_RADIUS.max,
        step: 1,
      },
      {
        key: "spin",
        label: "Spin (turns/s, − for ↺)",
        type: "number",
        step: 0.1,
      },
    ],
  },
  water: {
    title: "Water",
    hint: "Drag a rectangle to add water.",
  },
  prop: {
    title: "Prop",
    hint: "Click to place scenery. Props don't collide.",
    fields: [
      {
        key: "type",
        label: "Prop",
        type: "select",
        optionsFrom: "selection-prop-type",
        picker: { title: "Prop", thumbnail: propThumbnail },
      },
      {
        key: "layer",
        label: "Position",
        type: "select",
        options: () => [
          ["back", "Behind terrain"],
          ["front", "In front of rider"],
        ],
      },
      {
        key: "flip",
        label: "Flip",
        type: "toggle",
        options: () => [
          ["false", "Normal"],
          ["true", "Flipped"],
        ],
      },
      {
        key: "rotation",
        label: "Rotation (°, clockwise)",
        type: "number",
        min: -180,
        max: 180,
        step: 1,
      },
    ],
  },
  start: {
    title: "Start",
    hint: "Click to move the start.",
    fields: [
      {
        key: "facing",
        label: "Facing",
        type: "select",
        options: () => [
          ["1", "Right"],
          ["-1", "Left"],
        ],
      },
    ],
  },
  finish: {
    title: "Finish",
    hint: "Click to place the finish, then drag it up or down.",
  },
};

const DEFAULT_TOOL_SETTINGS = {
  // The last material chosen is kept for the next block.
  block: { material: "grass", layer: "terrain" },
  cut: { layer: "terrain" },
  apple: { kind: "apple" },
  spike: { radius: SPIKE_RADIUS.default, spin: 1 },
  prop: { type: "tree", layer: "back", flip: false, rotation: 0 },
  start: { facing: "1" },
};

// Single-key tool shortcuts, used while the canvas has focus.
export const TOOL_KEYS = {
  KeyV: "select",
  KeyH: "pan",
  KeyB: "block",
  KeyC: "cut",
  KeyA: "apple",
  KeyS: "spike",
  KeyW: "water",
  KeyP: "prop",
  KeyG: "start",
  KeyF: "finish",
};

// What to print for each tool's key. The shortcuts go by physical key (code),
// so on a non-QWERTY layout the letter on the key differs: where the browser
// can say what is printed on it (navigator.keyboard), the labels follow that,
// else they show the QWERTY letter.
export const TOOL_KEY_LABELS = Object.fromEntries(
  Object.entries(TOOL_KEYS).map(([code, name]) => [name, code.slice(3)]),
);

/**
 * Bring TOOL_KEY_LABELS in line with the keyboard's layout, where the browser
 * exposes it. Resolves to whether any label changed.
 */
export async function resolveToolKeyLabels() {
  const keyboard = /** @type {any} */ (globalThis.navigator)?.keyboard;
  if (typeof keyboard?.getLayoutMap !== "function") return false;
  let layout;
  try {
    layout = await keyboard.getLayoutMap();
  } catch (_) {
    return false;
  }
  let changed = false;
  for (const [code, name] of Object.entries(TOOL_KEYS)) {
    const key = layout?.get?.(code);
    if (typeof key !== "string" || key.length !== 1) continue;
    const label = key.toUpperCase();
    if (TOOL_KEY_LABELS[name] === label) continue;
    TOOL_KEY_LABELS[name] = label;
    changed = true;
  }
  return changed;
}

// Tools that place a new object where you click, and show a preview of it.
export const PLACING_TOOLS = new Set(["apple", "spike", "prop"]);

export const toolSettings = (() => {
  try {
    const stored = JSON.parse(store().getItem(TOOL_SETTINGS_KEY) || "{}");
    const settings = Object.fromEntries(
      Object.entries(DEFAULT_TOOL_SETTINGS).map(([name, defaults]) => [
        name,
        { ...defaults, ...(stored[name] || {}) },
      ]),
    );
    return settings;
  } catch (_) {
    return structuredClone(DEFAULT_TOOL_SETTINGS);
  }
})();

export function saveToolSettings() {
  try {
    store().setItem(TOOL_SETTINGS_KEY, JSON.stringify(toolSettings));
  } catch (_) {}
}

/** Whether the Apple tool is set to place the trail's nisse. */
export function placingNisse() {
  return toolSettings.apple?.kind === "nisse";
}

/** Whether the Apple tool is set to place a checkpoint. */
export function placingCheckpoint() {
  return toolSettings.apple?.kind === "checkpoint";
}

/** The layer a Block or Cut drag works on: "terrain" or "back". */
export function toolLayer(name) {
  return toolSettings[name]?.layer === "back" ? "back" : "terrain";
}

export function toolMaterial(name) {
  const material = toolSettings[name]?.material;
  return terrainMaterials[material] ? material : "grass";
}

function clampSetting(field, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return field.min ?? 0;
  return Math.max(
    field.min ?? -Infinity,
    Math.min(field.max ?? Infinity, number),
  );
}

export function renderToolSettings() {
  const info = TOOL_INFO[editor.tool];
  const key = TOOL_KEY_LABELS[editor.tool];
  $("tool-settings-title").textContent =
    info.title.toUpperCase() + (key ? ` · ${key}` : "");
  $("tool-hint").textContent = info.hint;
  $("tool-settings-fields").replaceChildren(
    ...(info.fields || []).map((field) => {
      const settings = toolSettings[editor.tool] || {};
      const label = document.createElement("label");
      label.className = field.type === "checkbox" ? "checkbox-row" : "";
      let input;
      if (field.type === "select" || field.type === "toggle") {
        input = document.createElement("select");
        if (field.dropdown) input.dataset.dropdown = "";
        // Copies another select's options, groups included.
        if (field.optionsFrom)
          input.append(
            ...[...$(field.optionsFrom).children].map((node) =>
              node.cloneNode(true),
            ),
          );
        else
          for (const [value, text] of field.options()) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            input.append(option);
          }
        input.value = String(
          field.type === "toggle"
            ? Boolean(settings[field.key])
            : settings[field.key],
        );
      } else {
        input = document.createElement("input");
        input.type = field.type;
        if (field.type === "checkbox")
          input.checked = Boolean(settings[field.key]);
        else {
          for (const attribute of ["min", "max", "step"])
            if (field[attribute] !== undefined)
              input[attribute] = field[attribute];
          input.value = settings[field.key];
        }
      }
      input.addEventListener("change", () => {
        settings[field.key] =
          field.type === "toggle"
            ? input.value === "true"
            : field.type === "checkbox"
              ? input.checked
              : field.type === "number"
                ? clampSetting(field, input.value)
                : input.value;
        if (field.type === "number") input.value = settings[field.key];
        saveToolSettings();
      });
      label.append(field.label, " ", input);
      if (field.picker) pickerSelect(input, field.picker);
      return label;
    }),
  );
  segmentSelects($("tool-settings-fields"));
}

export function setTool(next) {
  if (!NAVIGATION_TOOLS.has(next) && refuseEdit()) next = "select";
  editor.hoverPoint = null;
  editor.tool = next;
  document
    .querySelectorAll("[data-tool]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.tool === editor.tool),
    );
  canvas.style.cursor =
    editor.tool === "pan" ? "grab" : editor.tool === "select" ? "default" : "crosshair";
  renderToolSettings();
}

export function setTab(name) {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    const active = button.dataset.tab === name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $("panel-tools").hidden = name !== "tools";
  $("panel-trail").hidden = name !== "trail";
  $("panel-objects").hidden = name !== "objects";
  // The preview frame belongs to the Trail tab; its thumbnail is drawn when shown.
  if (name !== "trail") stopEditingPreview();
  else schedulePreviewThumbnail();
  renderObjects();
}
