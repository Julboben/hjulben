// The Objects tab: everything on the trail, grouped, where groups and single
// items are locked and unlocked, and where a click finds and selects a thing.
// Cmd/Ctrl-click adds a thing to the selection or takes it out, and
// Shift-click adds every row between it and the last one clicked. Named
// groups, a house built of blocks and props, are listed first: a group's row
// selects all of it, and a member's row goes into the group to select that
// member alone.
import { blocks } from "./blocks.js";
import { $ } from "./dom.js";
import {
  LOCK_GROUPS,
  anyLocked,
  groupOf,
  isGroupLocked,
  isItemLocked,
  pruneItemLocks,
  setGroupLocked,
  setItemLocked,
} from "./locks.js";
import { syncInspector } from "./inspector.js";
import { render } from "./render.js";
import {
  itemPosition,
  makeSelection,
  revealItem,
  sameItem,
  selectionItems,
} from "./selection.js";
import { editor, waters } from "./state.js";
import { groupItems, groupNames } from "./groups.js";
import { materialLabel, propTypeOptions, setTool } from "./tools.js";
import { centerOn } from "./view.js";

// Groups start closed, since a trail can have dozens of props.
const expanded = new Set();
// The row last clicked, where a Shift-click range starts.
let anchor = null;
// What the list last showed, so a redraw that would change nothing is skipped.
let shown = null;

/** Every lockable thing on the trail, with its group and a readable name. */
function entries() {
  const propNames = new Map(propTypeOptions());
  const list = [];
  const add = (type, objects, name) =>
    objects.forEach((object, index) =>
      list.push({ type, index, group: groupOf(type, object), name: name(object, index) }),
    );
  add("block", blocks(), (block) => materialLabel(block.material || "grass"));
  add("prop", editor.trail.props, (prop) =>
    prop.type === "sign" && prop.text
      ? `Sign: ${prop.text}`
      : (prop.type === "banner" || prop.type === "pit-board") && prop.text
        ? `${propNames.get(prop.type)}: ${prop.text}`
        : propNames.get(prop.type) || materialLabel(prop.type || "prop"),
  );
  add("water", waters(), () => "Water");
  add("spike", editor.trail.spikes, () => "Spike");
  add("apple", editor.trail.apples, () => "Apple");
  add("nisse", editor.trail.nisse ? [editor.trail.nisse] : [], () => "Nisse");
  // Numbered as validation numbers them, even when there is only one.
  add("checkpoint", editor.trail.checkpoints || [], (_, index) => `Checkpoint ${index + 1}`);
  // Number repeated names within each group: Tree 1, Tree 2.
  const totals = new Map();
  for (const entry of list) {
    const key = `${entry.group}/${entry.name}`;
    totals.set(key, (totals.get(key) || 0) + 1);
  }
  const counters = new Map();
  for (const entry of list) {
    const key = `${entry.group}/${entry.name}`;
    if (totals.get(key) < 2) continue;
    counters.set(key, (counters.get(key) || 0) + 1);
    entry.name = `${entry.name} ${counters.get(key)}`;
  }
  for (const entry of list) {
    entry.locked = isItemLocked(entry.type, entry.index);
    const object = entry.type === "block" ? blocks()[entry.index] : entry.type === "prop" ? editor.trail.props[entry.index] : null;
    entry.named = object?.group || null;
  }
  return list;
}

/** Is an item selected, whole or through one of its points? */
function selectedKeys() {
  const keys = new Set();
  for (const item of selectionItems())
    keys.add(item.type === "point" ? `block:${item.blockIndex}` : `${item.type}:${item.index}`);
  if (Number.isInteger(editor.selection?.blockIndex))
    keys.add(`block:${editor.selection.blockIndex}`);
  return keys;
}

function lockButton(locked, label, onClick, disabled = false) {
  const button = document.createElement("button");
  button.className = "object-lock";
  button.type = "button";
  button.disabled = disabled;
  button.setAttribute("aria-pressed", String(locked));
  button.setAttribute("aria-label", `${locked ? "Unlock" : "Lock"} ${label}`);
  button.title = disabled ? "The whole group is locked" : `${locked ? "Unlock" : "Lock"} ${label}`;
  const icon = document.createElement("span");
  icon.dataset.icon = locked ? "lock" : "unlock";
  icon.setAttribute("aria-hidden", "true");
  button.append(icon);
  button.addEventListener("click", onClick);
  return button;
}

/** After a lock changes: let go of what it locked, and redraw. */
function select(items) {
  editor.selection = makeSelection(items);
  setTool("select");
  syncInspector();
  render();
}

/** A click on an unlocked row: select it, or with a modifier, add to the selection. */
function clickRow(event, entry, members) {
  const target = { type: entry.type, index: entry.index };
  const from = anchor
    ? members.findIndex((other) => other.type === anchor.type && other.index === anchor.index)
    : -1;
  if (event.shiftKey && from >= 0) {
    const to = members.indexOf(entry);
    const span = members
      .slice(Math.min(from, to), Math.max(from, to) + 1)
      .filter((other) => !other.locked)
      .map((other) => ({ type: other.type, index: other.index }));
    // The anchor stays put, so another Shift-click reaches from the same row.
    select([...selectionItems(), ...span]);
    return;
  }
  anchor = target;
  if (event.metaKey || event.ctrlKey || event.shiftKey) {
    const items = selectionItems();
    select(
      items.some((item) => sameItem(item, target))
        ? items.filter((item) => !sameItem(item, target))
        : [...items, target],
    );
  } else revealItem(target);
}

function changed() {
  syncInspector();
  render();
}

/** One named group's row, and its members' rows when it is open. */
function namedGroup(name, list, selected) {
  const key = `named:${name}`;
  const members = list.filter((entry) => entry.named === name);
  const locked = members.every((entry) => entry.locked || isGroupLocked(groupOf(entry.type, objectOf(entry))));
  const open = expanded.has(key);
  const item = document.createElement("li");
  item.className = "object-group";

  const head = document.createElement("div");
  head.className = "object-row object-group-row";
  head.classList.toggle("locked", locked);
  head.classList.toggle("selected", members.every((entry) => selected.has(`${entry.type}:${entry.index}`)));
  const toggle = document.createElement("button");
  toggle.className = "object-name";
  toggle.type = "button";
  toggle.title = `Select ${name}`;
  toggle.setAttribute("aria-expanded", String(open));
  const caret = document.createElement("span");
  caret.dataset.icon = open ? "caret-down" : "caret-right";
  caret.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = name;
  const count = document.createElement("span");
  count.className = "object-count";
  count.textContent = String(members.length);
  toggle.append(caret, label, count);
  // A click selects the whole group and opens or closes its list.
  toggle.addEventListener("click", () => {
    if (open) expanded.delete(key);
    else expanded.add(key);
    editor.openGroup = null;
    if (!locked) select(groupItems(name).filter((member) => !isItemLocked(member.type, member.index)));
    else renderObjects();
  });
  head.append(
    toggle,
    lockButton(locked, name, () => {
      for (const entry of members) setItemLocked(entry.type, entry.index, !locked);
      changed();
    }),
  );
  item.append(head);

  if (open) {
    const rows = document.createElement("ul");
    rows.className = "object-items";
    for (const entry of members) {
      const row = document.createElement("li");
      row.className = "object-row";
      row.classList.toggle("locked", entry.locked);
      row.classList.toggle("selected", selected.has(`${entry.type}:${entry.index}`));
      const button = document.createElement("button");
      button.className = "object-name";
      button.type = "button";
      button.textContent = entry.name;
      button.title = entry.locked ? `${entry.name} is locked` : `Select ${entry.name} on its own`;
      button.disabled = entry.locked;
      button.addEventListener("click", () => {
        editor.openGroup = name;
        revealItem({ type: entry.type, index: entry.index });
      });
      row.append(button);
      rows.append(row);
    }
    item.append(rows);
  }
  return item;
}

const objectOf = (entry) =>
  entry.type === "block" ? blocks()[entry.index] : editor.trail.props[entry.index];

/** The tab's lock badge, shown whenever anything is locked. */
function syncTabBadge() {
  const tab = $("tab-objects");
  if (anyLocked()) tab.setAttribute("data-icon-after", "lock");
  else tab.removeAttribute("data-icon-after");
}

/** Redraw the list, if the tab is open and anything in it changed. */
export function renderObjects() {
  syncTabBadge();
  if ($("panel-objects").hidden) {
    shown = null;
    return;
  }
  const list = entries();
  const selected = selectedKeys();
  const signature = JSON.stringify([
    list,
    [...selected],
    [...expanded],
    LOCK_GROUPS.map((group) => isGroupLocked(group.key)),
  ]);
  if (signature === shown) return;
  shown = signature;
  pruneItemLocks();

  const names = groupNames();
  $("named-groups-section").hidden = !names.length;
  $("named-groups").replaceChildren(...names.map((name) => namedGroup(name, list, selected)));

  const groups = LOCK_GROUPS.map((group) => {
    const members = list.filter((entry) => entry.group === group.key);
    const groupLocked = isGroupLocked(group.key);
    const open = expanded.has(group.key) && members.length > 0;
    const item = document.createElement("li");
    item.className = "object-group";

    const head = document.createElement("div");
    head.className = "object-row object-group-row";
    head.classList.toggle("locked", groupLocked);
    const toggle = document.createElement("button");
    toggle.className = "object-name";
    toggle.type = "button";
    toggle.disabled = !members.length;
    toggle.setAttribute("aria-expanded", String(open));
    const caret = document.createElement("span");
    caret.dataset.icon = open ? "caret-down" : "caret-right";
    caret.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = group.label;
    const count = document.createElement("span");
    count.className = "object-count";
    count.textContent = String(members.length);
    toggle.append(caret, label, count);
    toggle.addEventListener("click", () => {
      if (expanded.has(group.key)) expanded.delete(group.key);
      else expanded.add(group.key);
      renderObjects();
    });
    head.append(
      toggle,
      lockButton(groupLocked, `all ${group.label.toLowerCase()}`, () => {
        setGroupLocked(group.key, !groupLocked);
        changed();
      }),
    );
    item.append(head);

    if (open) {
      const rows = document.createElement("ul");
      rows.className = "object-items";
      for (const entry of members) {
        const locked = groupLocked || entry.locked;
        const row = document.createElement("li");
        row.className = "object-row";
        row.classList.toggle("locked", locked);
        row.classList.toggle("selected", selected.has(`${entry.type}:${entry.index}`));
        const name = document.createElement("button");
        name.className = "object-name";
        name.type = "button";
        name.textContent = entry.name;
        name.title = locked
          ? `${entry.name} is locked: click to bring it into view`
          : `Select ${entry.name}; Cmd/Ctrl-click to add or remove it, Shift-click to add a range`;
        name.addEventListener("click", (event) => {
          // A locked thing can't be selected, but it can still be found.
          if (!locked) clickRow(event, entry, members);
          else {
            const position = itemPosition({ type: entry.type, index: entry.index });
            if (position) centerOn(...position);
            render();
          }
        });
        row.append(
          name,
          lockButton(
            locked,
            entry.name,
            () => {
              setItemLocked(entry.type, entry.index, !entry.locked);
              changed();
            },
            groupLocked,
          ),
        );
        rows.append(row);
      }
      item.append(rows);
    }
    return item;
  });
  $("object-groups").replaceChildren(...groups);
}
