// The floating toolbar's ▾ menus, as in Figma: the few choices a tool needs
// before it places anything, such as a block's layer or the Apple tool's nisse.
// Prop's ▾ opens the prop picker instead, and Block's menu leads to the
// material picker. Start and Finish share a button, whose menu picks between
// them and sets which way the start faces. Everything else is set in the
// inspector after placing.
import { terrainMaterials } from "../trails.js";
import { $ } from "./dom.js";
import { openPicker } from "./picker.js";
import { render } from "./render.js";
import { propThumbnail } from "./thumbnails.js";
import {
  FACING_OPTIONS,
  MARKER_TOOLS,
  TOOL_INFO,
  TOOL_KEY_LABELS,
  materialLabel,
  saveToolSettings,
  setTool,
  toolSettings,
} from "./tools.js";

// The menu that is open, if any: a tool's name, or "marker" for the menu
// Start and Finish share.
let openFor = null;

const items = () =>
  [...$("tool-menu").children].filter((node) => node.getAttribute("role")?.startsWith("menuitem"));

export const toolMenuOpen = () => openFor !== null;

/** Choose a setting for `tool`, and take the tool up, ready to place. */
function choose(tool, key, value) {
  toolSettings[tool][key] = value;
  saveToolSettings();
  closeToolMenu();
  setTool(tool);
  render();
}

/** A menu item: a check, then its icon, if any, the label and the tool's key. */
function menuItem(text, { checked = null, icon = null, key = "", onChoose }) {
  const item = document.createElement("button");
  item.type = "button";
  item.setAttribute("role", checked === null ? "menuitem" : "menuitemradio");
  if (checked !== null) item.setAttribute("aria-checked", String(checked));
  const mark = document.createElement("span");
  mark.className = "tool-menu-check";
  mark.setAttribute("aria-hidden", "true");
  if (checked) {
    const tick = document.createElement("span");
    tick.dataset.icon = "check";
    mark.append(tick);
  }
  item.append(mark);
  if (icon) {
    const symbol = document.createElement("span");
    symbol.setAttribute("aria-hidden", "true");
    symbol.dataset.icon = icon;
    item.append(symbol);
  }
  const label = document.createElement("span");
  label.textContent = text;
  item.append(label);
  if (key) {
    const shortcut = document.createElement("kbd");
    shortcut.textContent = key;
    item.append(shortcut);
  }
  item.addEventListener("click", onChoose);
  return item;
}

function heading(text) {
  const node = document.createElement("div");
  node.className = "tool-menu-heading";
  node.textContent = text;
  return node;
}

/** What a tool's own menu holds: its heading, its choices and, for Block, the material. */
function toolMenu(tool) {
  const info = TOOL_INFO[tool];
  const key = TOOL_KEY_LABELS[tool];
  const { key: setting, options } = info.menu;
  const current = String(toolSettings[tool][setting]);
  const entries = options.map(([value, text]) =>
    menuItem(text, {
      checked: value === current,
      onChoose: () => choose(tool, setting, value),
    }),
  );
  if (tool === "block")
    entries.push(
      menuItem(`Material: ${materialLabel(toolSettings.block.material)}…`, {
        onChoose: chooseMaterial,
      }),
    );
  return { label: `${info.title} options`, nodes: [heading(`${info.title}${key ? ` · ${key}` : ""}`), ...entries] };
}

/** The menu Start and Finish share: either tool, then which way the start faces. */
function markerMenu() {
  const tools = MARKER_TOOLS.map((tool) =>
    menuItem(TOOL_INFO[tool].title, {
      checked: toolSettings.marker.tool === tool,
      key: TOOL_KEY_LABELS[tool],
      onChoose: () => {
        closeToolMenu();
        setTool(tool);
        render();
      },
    }),
  );
  const rule = document.createElement("div");
  rule.className = "tool-menu-rule";
  const facing = FACING_OPTIONS.map(([value, text, icon]) =>
    menuItem(text, {
      checked: toolSettings.start.facing === value,
      icon,
      onChoose: () => choose("start", "facing", value),
    }),
  );
  return { label: "Start and finish", nodes: [...tools, rule, heading("Start faces"), ...facing] };
}

/** A select of every option, for the picker to read and set. */
function optionsSelect(options, value) {
  const select = document.createElement("select");
  for (const [optionValue, text] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = text;
    select.append(option);
  }
  select.value = value;
  return select;
}

// The pickers below are told every choice, the one already set included, so
// choosing always takes the tool up; closing them leaves the tool as it is.

function chooseMaterial() {
  closeToolMenu();
  const options = Object.keys(terrainMaterials).map((name) => [name, materialLabel(name)]);
  openPicker(optionsSelect(options, toolSettings.block.material), {
    title: "Material",
    onChoose: (material) => choose("block", "material", material),
  });
}

/** The prop picker, for the Prop tool's next prop. */
export function chooseProp() {
  closeToolMenu();
  const select = document.createElement("select");
  // A copy of the inspector's list, groups and all.
  select.append(...[...$("selection-prop-type").children].map((node) => node.cloneNode(true)));
  select.value = toolSettings.prop.type;
  openPicker(select, {
    title: "Prop",
    thumbnail: propThumbnail,
    onChoose: (type) => choose("prop", "type", type),
  });
}

function openToolMenu(name, { focus = false } = {}) {
  const { label, nodes } = name === "marker" ? markerMenu() : toolMenu(name);
  const menu = $("tool-menu");
  menu.replaceChildren(...nodes);
  menu.setAttribute("aria-label", label);
  menu.hidden = false;
  openFor = name;
  const toggle = $(`tool-menu-${name}`);
  toggle.setAttribute("aria-expanded", "true");
  // Above the tool's own button, kept inside the canvas. The toolbar wraps
  // onto a second row on a narrow screen, so its top is measured.
  const button =
    name === "marker" ? $("tool-marker") : document.querySelector(`.toolbar [data-tool="${name}"]`) || toggle;
  const area = $("canvas-wrap").getBoundingClientRect();
  const left = button.getBoundingClientRect().left - area.left;
  menu.style.left = `${Math.max(8, Math.min(left, area.width - menu.offsetWidth - 8))}px`;
  menu.style.bottom = `${area.top + area.height - $("toolbar").getBoundingClientRect().top + 8}px`;
  if (focus) items()[0]?.focus();
}

export function closeToolMenu({ restoreFocus = false } = {}) {
  if (openFor === null) return;
  const toggle = $(`tool-menu-${openFor}`);
  toggle.setAttribute("aria-expanded", "false");
  $("tool-menu").hidden = true;
  openFor = null;
  if (restoreFocus) toggle.focus();
}

export function bindToolbar() {
  const menus = [...Object.keys(TOOL_INFO).filter((tool) => TOOL_INFO[tool].menu), "marker"];
  $("tool-menu-prop").addEventListener("click", chooseProp);
  for (const name of menus)
    $(`tool-menu-${name}`).addEventListener("click", (event) => {
      if (openFor === name) closeToolMenu();
      else {
        closeToolMenu();
        openToolMenu(name, { focus: event.detail === 0 });
      }
    });
  const menu = $("tool-menu");
  menu.addEventListener("keydown", (event) => {
    const list = items();
    const index = list.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      list[(index + step + list.length) % list.length]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeToolMenu({ restoreFocus: true });
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (openFor === null) return;
    const target = event.target;
    if (menu.contains?.(target) || $(`tool-menu-${openFor}`).contains?.(target)) return;
    closeToolMenu();
  });
}
