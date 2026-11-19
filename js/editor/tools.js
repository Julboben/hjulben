// Tool definitions, keyboard letters, and what each tool places next.
import { store } from "../local-store.js";
import { SPIKE_RADIUS } from "../trail-schema.js";
import { terrainMaterials } from "../trails.js";
import { $, canvas } from "./dom.js";
import { editor } from "./state.js";
import { refuseEdit } from "./status.js";

/** The tools that only look around, so they work on a read-only trail too. */
export const NAVIGATION_TOOLS = new Set(["select", "pan"]);

const TOOL_SETTINGS_KEY = "hjulben-editor-tool-settings-v1";

export const propTypeOptions = () =>
  [...$("selection-prop-type").options].map((option) => [
    option.value,
    option.textContent,
  ]);

export const materialLabel = (name) => name[0].toUpperCase() + name.slice(1);

export const BLOCK_LAYERS = [
  ["terrain", "Terrain"],
  ["back", "Back wall"],
];

const LAYER_MENU = { key: "layer", options: BLOCK_LAYERS };

// Each tool's name, icon and what it does, shown in its button's tooltip. A
// tool with a menu (the ▾ beside it) offers the choice made before placing;
// the rest of what it places is changed afterwards in the inspector, and the
// next one copies the last change (see rememberToolSetting).
export const TOOL_INFO = {
  select: {
    icon: "cursor",
    title: "Select",
    hint: "Click to select, drag to move. Press ? for all shortcuts.",
  },
  pan: {
    icon: "pan",
    title: "Pan",
    hint: "Drag to move the view.",
  },
  block: {
    icon: "block",
    title: "Block",
    hint: "Drag an outline to draw a block.",
    menu: LAYER_MENU,
  },
  cut: {
    icon: "scissors",
    title: "Cut",
    hint: "Drag an outline over a block to cut a cave or a hole.",
    menu: LAYER_MENU,
  },
  apple: {
    icon: "apple",
    title: "Apple",
    hint: "Click to place. Riders must collect every apple to finish. The nisse is optional.",
    menu: {
      key: "kind",
      options: [
        ["apple", "Apple"],
        ["nisse", "Nisse"],
      ],
    },
  },
  spike: {
    icon: "spike",
    title: "Spike",
    hint: "Click to place a spike. Touching it kills the rider.",
  },
  water: {
    icon: "water",
    title: "Water",
    hint: "Drag a rectangle to add water.",
  },
  prop: {
    icon: "tree",
    title: "Prop",
    hint: "Click to place scenery. Props don't collide.",
  },
  start: {
    icon: "helmet",
    title: "Start",
    hint: "Click to move the start.",
  },
  finish: {
    icon: "flag",
    title: "Finish",
    hint: "Click to place the finish, then drag it up or down.",
  },
};

const DEFAULT_TOOL_SETTINGS = {
  block: { material: "grass", layer: "terrain" },
  cut: { layer: "terrain" },
  apple: { kind: "apple" },
  spike: { radius: SPIKE_RADIUS.default, spin: 1 },
  prop: { type: "tree", layer: "back", flip: false, rotation: 0 },
  start: { facing: "1" },
  // Which of the two the Start and Finish tools' shared button shows.
  marker: { tool: "start" },
};

/** The tools that share one button, which shows the one used last. */
export const MARKER_TOOLS = ["start", "finish"];

/** Which way the start can face, as the shared button's menu offers it. */
export const FACING_OPTIONS = [
  ["1", "Right"],
  ["-1", "Left"],
];

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

/** The layer a Block or Cut drag works on: "terrain" or "back". */
export function toolLayer(name) {
  return toolSettings[name]?.layer === "back" ? "back" : "terrain";
}

export function toolMaterial(name) {
  const material = toolSettings[name]?.material;
  return terrainMaterials[material] ? material : "grass";
}

/**
 * Keep a change made to the selection in the inspector for the next thing
 * the tool places, as Figma does: set a prop's rotation once, and the props
 * that follow come turned the same way.
 */
export function rememberToolSetting(tool, key, value) {
  toolSettings[tool][key] = value;
  saveToolSettings();
}

/** A tool button's tooltip: its name, its key and what it does. */
export function toolTitle(name) {
  const info = TOOL_INFO[name];
  const key = TOOL_KEY_LABELS[name];
  return `${info.title}${key ? ` (${key})` : ""}: ${info.hint}`;
}

/**
 * Give each tool button its icon and labels. The buttons are icons alone: the
 * tooltip names the tool, its key and what it does, and screen readers get
 * the name. The Start and Finish tools' shared button becomes the one used last.
 */
export function labelToolButtons() {
  $("tool-marker").dataset.tool = toolSettings.marker.tool;
  document.querySelectorAll("[data-tool]").forEach((button) => {
    const name = button.dataset.tool;
    button.firstElementChild.dataset.icon = TOOL_INFO[name].icon;
    button.title = toolTitle(name);
    button.setAttribute("aria-label", toolTitle(name).split(":")[0]);
  });
}

export function setTool(next) {
  if (!NAVIGATION_TOOLS.has(next) && refuseEdit()) next = "select";
  if (MARKER_TOOLS.includes(next) && toolSettings.marker.tool !== next) {
    toolSettings.marker.tool = next;
    saveToolSettings();
    labelToolButtons();
  }
  editor.hoverPoint = null;
  editor.tool = next;
  document.querySelectorAll("[data-tool]").forEach((button) => {
    const active = button.dataset.tool === editor.tool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  canvas.style.cursor =
    editor.tool === "pan" ? "grab" : editor.tool === "select" ? "default" : "crosshair";
}
