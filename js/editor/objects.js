// The Objects panel on the left: everything on the trail, grouped, where groups and single
// items are hidden and shown, locked and unlocked, and where a click finds and
// selects a thing.
// Cmd/Ctrl-click adds a thing to the selection or takes it out, and
// Shift-click adds every row between it and the last one clicked. Named
// groups, a house built of blocks and props, are listed first: a group's row
// selects all of it, and a member's row goes into the group to select that
// member alone.
//
// The filter box narrows the list to the rows whose names hold what is typed,
// and opens the groups they are in.
//
// The list follows the canvas: whatever is newly selected there has its group
// opened and its row scrolled into view, and a row the pointer is over is
// outlined on the canvas.
import { blocks } from "./blocks.js";
import { $ } from "./dom.js";
import {
  LOCK_GROUPS,
  allHidden,
  allLocked,
  anyHidden,
  anyLocked,
  groupOf,
  isGroupHidden,
  isGroupLocked,
  isItemHidden,
  isItemLocked,
  isLocked,
  pruneItemFlags,
  setAllHidden,
  setAllLocked,
  setGroupHidden,
  setGroupLocked,
  setItemHidden,
  setItemLocked,
} from "./locks.js";
import { pushHistory } from "./history.js";
import { syncInspector } from "./inspector.js";
import { render, renderView } from "./render.js";
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
// What was selected when the list was last drawn, so what is new can be revealed.
let seen = new Set();
// Set while a click in the list itself selects, which needs no revealing.
let listClick = false;
// What the filter box holds, lower case; empty shows every row.
let query = "";

const matches = (entry) => entry.name.toLowerCase().includes(query);

/** Select from the list, without the list then jumping to what it selected. */
function fromList(action) {
  listClick = true;
  try {
    action();
  } finally {
    listClick = false;
  }
}

/** Every lockable thing on the trail, with its group and a readable name. */
function names() {
  const propNames = new Map(propTypeOptions());
  const list = [];
  const add = (type, objects, name) =>
    objects.forEach((object, index) =>
      list.push({ type, index, group: groupOf(type, object), name: name(object) }),
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
  return list;
}

/** The name the Objects panel lists a block or object under, such as "Tree 3". */
export function objectName(type, index) {
  return names().find((entry) => entry.type === type && entry.index === index)?.name || null;
}

/**
 * Every lockable thing, named, with whether it is locked or hidden on its own,
 * whether it can be picked at all, and its named group.
 */
function entries() {
  const list = names();
  for (const entry of list) {
    entry.locked = isItemLocked(entry.type, entry.index);
    entry.hidden = isItemHidden(entry.type, entry.index);
    entry.blocked = isLocked(entry.type, entry.index);
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

// The words and icons of the hide and lock buttons, off and on.
// What each flag's button says and shows. Hiding is the editor's alone: the
// trail and its play tests are unchanged, so its tooltip says so.
const FLAGS = {
  hide: { off: ["Hide", "eye"], on: ["Show", "eye-closed"], group: "hidden", note: " in the editor only" },
  lock: { off: ["Lock", "unlock"], on: ["Unlock", "lock"], group: "locked", note: "" },
};

/**
 * A row's hide or lock button: on, off, or for a group with only some of what
 * is in it hidden or locked, "mixed", drawn half lit, which a click turns on
 * for all of it. A thing whose whole group is flagged can't be on its own.
 */
function flagButton(kind, state, label, onClick, disabled = false) {
  const mixed = state === "mixed";
  const verb = FLAGS[kind][state === true ? "on" : "off"][0];
  const button = document.createElement("button");
  button.className = "object-lock";
  button.type = "button";
  button.disabled = disabled;
  button.setAttribute("aria-pressed", String(state));
  button.setAttribute("aria-label", `${verb} ${label}`);
  button.title = disabled
    ? `The whole group is ${FLAGS[kind].group}`
    : mixed
      ? `Some of these are ${FLAGS[kind].group}: ${verb.toLowerCase()} ${label}${FLAGS[kind].note}`
      : `${verb} ${label}${state === true ? "" : FLAGS[kind].note}`;
  const icon = document.createElement("span");
  icon.dataset.icon = FLAGS[kind][state === false ? "off" : "on"][1];
  icon.setAttribute("aria-hidden", "true");
  button.append(icon);
  button.addEventListener("click", () => {
    pushHistory();
    onClick();
  });
  return button;
}

/** After a lock changes: let go of what it locked, and redraw. */
function select(items) {
  fromList(() => {
    editor.selection = makeSelection(items);
    setTool("select");
    syncInspector();
  });
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
      .filter((other) => !other.blocked)
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
  } else fromList(() => revealItem(target));
}

/** Outline a row's thing on the canvas while the pointer is over the row. */
function hoverable(button, entry) {
  const item = { type: entry.type, index: entry.index };
  button.addEventListener("pointerenter", () => {
    editor.listHover = item;
    renderView();
  });
  button.addEventListener("pointerleave", () => {
    if (editor.listHover !== item) return;
    editor.listHover = null;
    renderView();
  });
}

/** A row in a group's list, known by what it shows so a reveal can find it. */
function itemRow(entry, locked, selected) {
  const row = document.createElement("li");
  row.className = "object-row";
  row.dataset.key = `${entry.type}:${entry.index}`;
  row.classList.toggle("locked", locked);
  row.classList.toggle("selected", selected.has(row.dataset.key));
  return row;
}

/**
 * Open the group of everything newly selected, so the list shows it, and say
 * which row to scroll to. A selection made in the list is already in view.
 */
function revealNew(list, selected) {
  const added = [...selected].filter((key) => !seen.has(key));
  seen = selected;
  if (listClick || !added.length) return null;
  for (const key of added) {
    const entry = list.find((other) => `${other.type}:${other.index}` === key);
    if (entry) expanded.add(entry.named ? `named:${entry.named}` : entry.group);
  }
  return added[0];
}

function changed() {
  syncInspector();
  render();
}

/** A group's caret, name and count. */
function groupLabel(open, name, count) {
  const caret = document.createElement("span");
  caret.dataset.icon = open ? "caret-down" : "caret-right";
  caret.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = name;
  const counter = document.createElement("span");
  counter.className = "object-count";
  counter.textContent = String(count);
  return [caret, label, counter];
}

/** A group's flag: on when all of it is, "mixed" when only some is. */
const groupState = (all, some) => (all ? true : some ? "mixed" : false);

/** Open every group in the list, or with a filter, every group it shows. */
function openAll() {
  for (const entry of entries().filter(matches)) {
    expanded.add(entry.group);
    if (entry.named) expanded.add(`named:${entry.named}`);
  }
  for (const name of groupNames())
    if (name.toLowerCase().includes(query)) expanded.add(`named:${name}`);
}

/** One named group's row, and its members' rows when it is open. */
function namedGroup(name, list, selected) {
  const key = `named:${name}`;
  const members = list.filter((entry) => entry.named === name);
  // A group whose own name matches shows all of its members.
  const rows = !query || name.toLowerCase().includes(query) ? members : members.filter(matches);
  if (!rows.length) return null;
  const byCategory = (kind, entry) => (kind === "lock" ? isGroupLocked : isGroupHidden)(groupOf(entry.type, objectOf(entry)));
  const flagged = (kind) => {
    const count = members.filter((entry) => entry[kind === "lock" ? "locked" : "hidden"] || byCategory(kind, entry)).length;
    return groupState(count === members.length, count > 0);
  };
  const lockState = flagged("lock");
  const hideState = flagged("hide");
  // Members flagged with their whole category can't be let go of here, as
  // in the category's own list.
  const inherited = (kind) => members.every((entry) => byCategory(kind, entry));
  const blocked = members.every((entry) => entry.blocked);
  const open = expanded.has(key);
  const item = document.createElement("li");
  item.className = "object-group";

  const head = document.createElement("div");
  head.className = "object-row object-group-row";
  head.classList.toggle("locked", blocked);
  head.classList.toggle("selected", members.some((entry) => selected.has(`${entry.type}:${entry.index}`)));
  const toggle = document.createElement("button");
  toggle.className = "object-name";
  toggle.type = "button";
  toggle.title = `Select ${name}`;
  toggle.setAttribute("aria-expanded", String(open));
  toggle.append(
    ...groupLabel(open, name, rows.length),
  );
  // A click selects the whole group and opens or closes its list.
  toggle.addEventListener("click", () => {
    if (open) expanded.delete(key);
    else expanded.add(key);
    editor.openGroup = null;
    if (!blocked) select(groupItems(name).filter((member) => !isLocked(member.type, member.index)));
    else renderObjects();
  });
  head.append(
    toggle,
    flagButton(
      "hide",
      hideState,
      name,
      () => {
        for (const entry of members) setItemHidden(entry.type, entry.index, hideState !== true);
        changed();
      },
      inherited("hide"),
    ),
    flagButton(
      "lock",
      lockState,
      name,
      () => {
        for (const entry of members) setItemLocked(entry.type, entry.index, lockState !== true);
        changed();
      },
      inherited("lock"),
    ),
  );
  item.append(head);

  if (open) {
    const memberList = document.createElement("ul");
    memberList.className = "object-items";
    for (const entry of rows) {
      const row = itemRow(entry, entry.blocked, selected);
      const button = document.createElement("button");
      button.className = "object-name";
      button.type = "button";
      button.textContent = entry.name;
      button.title = entry.blocked
        ? `${entry.name} is ${entry.hidden ? "hidden" : "locked"}`
        : `Select ${entry.name} on its own`;
      button.disabled = entry.blocked;
      button.addEventListener("click", () => {
        editor.openGroup = name;
        fromList(() => revealItem({ type: entry.type, index: entry.index }));
      });
      hoverable(button, entry);
      row.append(button);
      memberList.append(row);
    }
    item.append(memberList);
  }
  return item;
}

const objectOf = (entry) =>
  entry.type === "block" ? blocks()[entry.index] : editor.trail.props[entry.index];

/**
 * The buttons that hide and lock everything, half lit while only some of it
 * is. Like a group's, a half-lit one flags everything.
 */
function syncLockedState() {
  const hidden = groupState(allHidden(), anyHidden());
  const locked = groupState(allLocked(), anyLocked());
  $("flag-everything").replaceChildren(
    flagButton("hide", hidden, "everything", () => {
      setAllHidden(hidden !== true);
      changed();
    }),
    flagButton("lock", locked, "everything", () => {
      setAllLocked(locked !== true);
      changed();
    }),
  );
}

export function bindObjects() {
  $("collapse-all").addEventListener("click", () => {
    expanded.clear();
    renderObjects();
  });
  $("open-all").addEventListener("click", () => {
    openAll();
    renderObjects();
  });
  $("objects-filter").addEventListener("input", (event) => {
    query = event.target.value.trim().toLowerCase();
    if (query) openAll();
    renderObjects();
  });
}

/** Redraw the list, if anything in it changed. */
export function renderObjects() {
  syncLockedState();
  const list = entries();
  const selected = selectedKeys();
  const reveal = revealNew(list, selected);
  const signature = JSON.stringify([
    query,
    list,
    [...selected],
    [...expanded],
    LOCK_GROUPS.map((group) => [isGroupLocked(group.key), isGroupHidden(group.key)]),
  ]);
  if (signature === shown) return;
  shown = signature;
  pruneItemFlags();
  // The rows are about to be replaced, and the new ones only learn of the
  // pointer when it next moves, so an outline would be left behind.
  if (editor.listHover) {
    editor.listHover = null;
    renderView();
  }

  const names = groupNames();
  const named = names.map((name) => namedGroup(name, list, selected)).filter(Boolean);
  $("named-groups-section").hidden = !named.length;
  $("named-groups").replaceChildren(...named);

  const groups = LOCK_GROUPS.map((group) => {
    const members = list.filter((entry) => entry.group === group.key && matches(entry));
    if (query && !members.length) return null;
    const groupLocked = isGroupLocked(group.key);
    const groupHidden = isGroupHidden(group.key);
    const all = list.filter((entry) => entry.group === group.key);
    const open = expanded.has(group.key) && members.length > 0;
    const item = document.createElement("li");
    item.className = "object-group";

    const head = document.createElement("div");
    head.className = "object-row object-group-row";
    head.classList.toggle("locked", groupLocked || groupHidden);
    // A group shows what is selected inside it, open or closed.
    head.classList.toggle(
      "selected",
      members.some((entry) => selected.has(`${entry.type}:${entry.index}`)),
    );
    const toggle = document.createElement("button");
    toggle.className = "object-name";
    toggle.type = "button";
    toggle.disabled = !members.length;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.append(
      ...groupLabel(open, group.label, members.length),
    );
    toggle.addEventListener("click", () => {
      if (expanded.has(group.key)) expanded.delete(group.key);
      else expanded.add(group.key);
      renderObjects();
    });
    const label = `all ${group.label.toLowerCase()}`;
    head.append(
      toggle,
      // A click on a half-lit button flags the whole group, and the next lets
      // all of it go, what was flagged on its own included.
      flagButton("hide", groupState(groupHidden, all.some((entry) => entry.hidden)), label, () => {
        setGroupHidden(group.key, !groupHidden);
        changed();
      }),
      flagButton("lock", groupState(groupLocked, all.some((entry) => entry.locked)), label, () => {
        setGroupLocked(group.key, !groupLocked);
        changed();
      }),
    );
    item.append(head);

    if (open) {
      const rows = document.createElement("ul");
      rows.className = "object-items";
      for (const entry of members) {
        const blocked = entry.blocked;
        const row = itemRow(entry, blocked, selected);
        const name = document.createElement("button");
        name.className = "object-name";
        name.type = "button";
        name.textContent = entry.name;
        name.title = blocked
          ? `${entry.name} is ${groupHidden || entry.hidden ? "hidden" : "locked"}: click to bring it into view`
          : `Select ${entry.name}; Cmd/Ctrl-click to add or remove it, Shift-click to add a range`;
        name.addEventListener("click", (event) => {
          // A locked or hidden thing can't be selected, but it can still be found.
          if (!blocked) clickRow(event, entry, members);
          else {
            const position = itemPosition({ type: entry.type, index: entry.index });
            if (position) centerOn(...position);
            render();
          }
        });
        hoverable(name, entry);
        row.append(
          name,
          flagButton(
            "hide",
            groupHidden || entry.hidden,
            entry.name,
            () => {
              setItemHidden(entry.type, entry.index, !entry.hidden);
              changed();
            },
            groupHidden,
          ),
          flagButton(
            "lock",
            groupLocked || entry.locked,
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
  const shownGroups = groups.filter(Boolean);
  $("object-groups").replaceChildren(...shownGroups);
  $("objects-no-match").hidden = Boolean(named.length || shownGroups.length);
  // Each button is greyed out while it has nothing to do. A group with nothing
  // in it can't be opened.
  const toggles = [...named, ...shownGroups].map((group) => group.firstChild.firstChild);
  $("collapse-all").disabled = !toggles.some((toggle) => toggle.getAttribute("aria-expanded") === "true");
  $("open-all").disabled = !toggles.some(
    (toggle) => toggle.getAttribute("aria-expanded") === "false" && !toggle.disabled,
  );
  if (reveal)
    $("objects-panel").querySelector(`[data-key="${reveal}"]`)?.scrollIntoView({ block: "nearest" });
}
