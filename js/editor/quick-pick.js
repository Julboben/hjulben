// Cmd/Ctrl+P opens a quick pick, like VS Code's: one search over every tool,
// prop and block material, the view toggles and trail actions, so a prop is a
// few keystrokes away instead of a tool click and a trip through the prop picker.
import { terrainMaterials } from "../trails.js";
import { $ } from "./dom.js";
import { editor } from "./state.js";
import { openPicker } from "./picker.js";
import { editingPreview, startEditingPreview, stopEditingPreview } from "./preview.js";
import { render } from "./render.js";
import { syncInspector } from "./inspector.js";
import { toggleGameArt, toggleGrid } from "./view.js";
import { propThumbnail } from "./thumbnails.js";
import {
  TOOL_INFO,
  TOOL_KEY_LABELS,
  materialLabel,
  saveToolSettings,
  setTool,
  toolSettings,
} from "./tools.js";

const option = (value, text, attributes = {}) => {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = text;
  Object.assign(node.dataset, attributes);
  return node;
};

const group = (label, options) => {
  const node = document.createElement("optgroup");
  node.label = label;
  node.append(...options);
  return node;
};

// Built fresh each time, so it always lists the props in editor.html. It is
// never put in the page: the picker only reads its options and sets its value.
function quickPickSelect() {
  const select = document.createElement("select");
  select.append(
    group(
      "Tools",
      Object.entries(TOOL_INFO).map(([name, info]) =>
        option(`tool:${name}`, info.title, {
          marker: TOOL_KEY_LABELS[name] ?? "",
          icon: info.icon,
        }),
      ),
    ),
    group(
      "Blocks",
      Object.keys(terrainMaterials).map((name) =>
        option(`material:${name}`, `${materialLabel(name)} block`, { icon: "block" }),
      ),
    ),
    // Each prop group keeps its own heading; "prop" in the value lets a
    // search for "prop" list them all.
    ...[...$("selection-prop-type").querySelectorAll("optgroup")].map((source) =>
      group(
        `Props · ${source.label}`,
        [...source.querySelectorAll("option")].map((prop) =>
          option(`prop:${prop.value}`, prop.textContent.replace(/\s+/g, " ").trim()),
        ),
      ),
    ),
    group("View", [
      option("view:toggle-game-art", `${editor.gameArt ? "Hide" : "Show"} game art`, {
        marker: "Y",
        icon: "picture",
      }),
      option("view:toggle-grid", `${editor.grid ? "Hide" : "Show"} grid`, {
        marker: "⌘'",
        icon: "grid",
      }),
    ]),
    // "thumbnail" in the value lets a search for it find the preview too.
    group("Trail", [
      option("trail:edit-preview-thumbnail", `${editingPreview() ? "Finish editing" : "Edit"} trail preview`, {
        icon: "camera",
      }),
    ]),
  );
  // Nothing is chosen yet, so the search starts on the first result.
  select.value = "";
  select.addEventListener("change", () => choose(select.value));
  return select;
}

function choose(value) {
  const [kind, name] = value.split(":");
  if (kind === "view") {
    if (name === "toggle-grid") toggleGrid();
    else toggleGameArt();
    return;
  }
  if (kind === "trail") {
    // Like the trail settings' button: the frame belongs to them, so the
    // selection is let go to show them.
    if (editingPreview()) stopEditingPreview();
    else {
      editor.selection = null;
      syncInspector();
      startEditingPreview();
    }
    return;
  }
  if (kind === "prop") {
    toolSettings.prop.type = name;
    saveToolSettings();
    setTool("prop");
  } else if (kind === "material") {
    toolSettings.block.material = name;
    saveToolSettings();
    setTool("block");
  } else setTool(name);
  render();
}

export function openQuickPick() {
  openPicker(quickPickSelect(), {
    title: "item",
    heading: "QUICK PICK",
    thumbnail: (value) => (value.startsWith("prop:") ? propThumbnail(value.slice(5)) : null),
    grid: false,
    // The headings already sort the results; two dozen filter buttons would crowd them.
    filters: false,
    toggle: true,
  });
}
