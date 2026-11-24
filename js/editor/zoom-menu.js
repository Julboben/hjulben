// The zoom level under the Objects panel opens a menu of the views the
// keyboard jumps to, each named with its key, so they can be found without
// knowing the shortcuts. A double-click on it goes straight back to 100%.
import { $ } from "./dom.js";
import { render } from "./render.js";
import { selectionBox } from "./selection.js";
import { editor } from "./state.js";
import { showStatus } from "./status.js";
import { heading, menuItem } from "./toolbar.js";
import { fitSelection, fitTrail, focusOnStart, zoomAtCenter } from "./view.js";

export const zoomToActualSize = () => zoomAtCenter(1 / editor.zoom);

export function zoomToFit() {
  fitTrail();
  render();
}

export function zoomToSelection() {
  if (fitSelection(selectionBox())) render();
  else showStatus("info", "Select something to zoom to it.");
}

export function goToStart() {
  focusOnStart();
  render();
}

const menuOpen = () => !$("zoom-menu").hidden;

const items = () => [...$("zoom-menu").children].filter((node) => node.getAttribute("role") === "menuitem");

function openZoomMenu({ focus = false } = {}) {
  const item = (text, key, action) =>
    menuItem(text, {
      key,
      onChoose: () => {
        closeZoomMenu();
        action();
      },
    });
  const selection = item("Zoom to selection", "⇧2", zoomToSelection);
  selection.disabled = !selectionBox();
  const rule = document.createElement("div");
  rule.className = "tool-menu-rule";
  $("zoom-menu").replaceChildren(
    heading("Zoom"),
    item("Zoom to 100%", "0", zoomToActualSize),
    item("Zoom to fit", "⇧Home", zoomToFit),
    selection,
    rule,
    item("Go to start", "Home", goToStart),
  );
  $("zoom-menu").hidden = false;
  $("zoom-menu-toggle").setAttribute("aria-expanded", "true");
  if (focus) items().find((node) => !node.disabled)?.focus();
}

function closeZoomMenu({ restoreFocus = false } = {}) {
  if (!menuOpen()) return;
  $("zoom-menu").hidden = true;
  $("zoom-menu-toggle").setAttribute("aria-expanded", "false");
  if (restoreFocus) $("zoom-menu-toggle").focus();
}

export function bindZoomMenu() {
  const toggle = $("zoom-menu-toggle");
  toggle.addEventListener("click", (event) => {
    if (menuOpen()) closeZoomMenu();
    else openZoomMenu({ focus: event.detail === 0 });
  });
  // The two clicks before it have opened and closed the menu again.
  toggle.addEventListener("dblclick", zoomToActualSize);
  $("zoom-menu").addEventListener("keydown", (event) => {
    const list = items().filter((node) => !node.disabled);
    const index = list.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      list[(index + step + list.length) % list.length]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeZoomMenu({ restoreFocus: true });
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (menuOpen() && !$("zoom-controls").contains?.(event.target)) closeZoomMenu();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuOpen()) closeZoomMenu();
  });
}
