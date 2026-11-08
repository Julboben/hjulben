// Named groups: blocks and props built into one thing, a house or a bridge,
// that select, move, copy, flip and lock together. A group is the `group`
// name its members carry, so it needs no list of its own: it goes when its
// last member does, and survives reordering and undo.
//
// A click selects a member's whole group; a double-click, or a member's row
// in the Objects tab, goes into the group to select that member alone, and
// Escape comes back out to the whole group.
import { normalizeGroupName } from "../terrain-geometry.js";
import { blocks } from "./blocks.js";
import { pushHistory } from "./history.js";
import { makeSelection, selectionItems } from "./selection.js";
import { editor } from "./state.js";
import { refuseEdit, showStatus } from "./status.js";

/** The kinds of thing a group can hold. */
const GROUPABLE = new Set(["block", "prop"]);

/** The thing an item, a hit or a selection is or belongs to: a block or a prop. */
function memberOf(target) {
  if (!target) return null;
  if (Number.isInteger(target.blockIndex)) return blocks()[target.blockIndex] || null;
  const type = target.type ?? target.kind;
  if (type === "block") return blocks()[target.index] || null;
  if (type === "prop") return editor.trail.props[target.index] || null;
  return null;
}

/** The group an item, a hit or a selection belongs to, or null. */
export const groupOf = (target) => memberOf(target)?.group || null;

/** Every member of a group, as selection items, blocks first. */
export function groupItems(name) {
  const items = [];
  blocks().forEach((block, index) => {
    if (block.group === name) items.push({ type: "block", index });
  });
  editor.trail.props.forEach((prop, index) => {
    if (prop.group === name) items.push({ type: "prop", index });
  });
  return items;
}

/** Every group on the trail, by name, in the order they first appear. */
export function groupNames() {
  const names = new Set();
  for (const block of blocks()) if (block.group) names.add(block.group);
  for (const prop of editor.trail.props) if (prop.group) names.add(prop.group);
  return [...names];
}

/** The groups the selection touches, and whether each is selected whole. */
function selectedGroups() {
  const items = selectionItems();
  const touched = new Map();
  for (const item of items) {
    const name = groupOf(item);
    if (name && !touched.has(name)) touched.set(name, false);
  }
  if (Number.isInteger(editor.selection?.blockIndex)) {
    const name = groupOf(editor.selection);
    if (name && !touched.has(name)) touched.set(name, false);
  }
  const whole = (name) =>
    groupItems(name).every((member) =>
      items.some((item) => item.type === member.type && item.index === member.index),
    );
  for (const name of touched.keys()) touched.set(name, whole(name));
  return touched;
}

/** The one group selected whole and alone, or null. */
export function selectedGroup() {
  const touched = selectedGroups();
  if (touched.size !== 1) return null;
  const [[name, whole]] = touched;
  if (!whole) return null;
  // Anything outside the group in the selection makes it more than the group.
  return selectionItems().every((item) => groupOf(item) === name) ? name : null;
}

/**
 * Is the author working inside a group: a member, or part of one, selected
 * on its own? Its outlines then open for editing, and a click picks members
 * rather than the whole group. A group of one is inside only once entered.
 */
export function insideGroup(name) {
  if (!name || !editor.selection) return false;
  // Edges, rings and handles aren't items, but each is part of its block.
  const items = selectionItems();
  const within = items.length
    ? items.every((item) => groupOf(item) === name)
    : groupOf(editor.selection) === name;
  if (!within) return false;
  return editor.openGroup === name || !selectedGroups().get(name);
}

/** Go into a member's group, selecting just that member. */
export function enterGroup(target) {
  const name = groupOf(target);
  if (!name) return false;
  editor.openGroup = name;
  const item = Number.isInteger(target.blockIndex)
    ? { type: "block", index: target.blockIndex }
    : { type: target.type ?? target.kind, index: target.index };
  editor.selection = makeSelection([item]);
  return true;
}

/** Come back out of a group to select all of it. Returns whether it did. */
export function leaveGroup() {
  const name = groupOf(editor.selection) || selectionItems().map(groupOf).find(Boolean);
  if (!name || !insideGroup(name)) return false;
  editor.openGroup = null;
  editor.selection = makeSelection(groupItems(name));
  return true;
}

/**
 * The selection a press on `hit` makes: the whole group for a member of a
 * group the author isn't inside, or else the hit itself.
 */
export function selectionForHit(hit) {
  const name = groupOf(hit);
  if (!name || insideGroup(name)) return hit;
  editor.openGroup = null;
  return makeSelection(groupItems(name));
}

/** Items with every member of their groups added, except a group the author is inside. */
export function withWholeGroups(items) {
  const names = new Set(items.map(groupOf).filter((name) => name && !insideGroup(name)));
  return [...items, ...[...names].flatMap(groupItems)];
}

/** A name no group on the trail has yet: `base`, or `base 2`, `base 3`… */
export function freshGroupName(base = "Group") {
  const taken = new Set(groupNames());
  if (base !== "Group" && !taken.has(base)) return base;
  for (let number = base === "Group" ? 1 : 2; ; number++)
    if (!taken.has(`${base} ${number}`)) return `${base} ${number}`;
}

const setGroup = (item, name) => {
  const member = memberOf(item);
  if (!member) return;
  if (name) member.group = name;
  else delete member.group;
};

/** The blocks and props selected, which a group can hold. */
const groupable = () => selectionItems().filter((item) => GROUPABLE.has(item.type) && memberOf(item));

export const canGroupSelection = () => groupable().length > 0 && !selectedGroup();
export const canUngroupSelection = () => [...selectedGroups().values()].some(Boolean);

/** Put the selected blocks and props in a new group of their own (Cmd+G). */
export function groupSelection() {
  const items = groupable();
  if (!items.length || selectedGroup() || refuseEdit()) return false;
  pushHistory();
  const name = freshGroupName();
  for (const item of items) setGroup(item, name);
  editor.openGroup = null;
  editor.selection = makeSelection(items);
  showStatus("info", `Grouped as ${name}. Double-click a part to select it on its own.`);
  return true;
}

/** Break up every group selected whole (Cmd+Shift+G), keeping its members selected. */
export function ungroupSelection() {
  const names = [...selectedGroups()].filter(([, whole]) => whole).map(([name]) => name);
  if (!names.length || refuseEdit()) return false;
  pushHistory();
  for (const name of names) for (const item of groupItems(name)) setGroup(item, null);
  editor.openGroup = null;
  return true;
}

/** Rename the selected group. Returns false, saying why, when it can't. */
export function renameSelectedGroup(text) {
  const from = selectedGroup();
  const to = normalizeGroupName(text);
  if (!from || !to || to === from) return false;
  if (refuseEdit()) return false;
  if (groupNames().includes(to)) {
    showStatus("warning", `There is already a group called ${to}.`);
    return false;
  }
  pushHistory();
  for (const item of groupItems(from)) setGroup(item, to);
  return true;
}

/**
 * Give copies of whole groups groups of their own, so a copied house is a
 * second house rather than more of the first. `originals` are the items the
 * copies were made from, in the same order. A copy of part of a group stays
 * in that group, as a copied window stays part of its house.
 */
export function regroupCopies(originals, copies) {
  const same = (a) => (b) => a.type === b.type && a.index === b.index;
  const whole = new Map();
  // The copies carry their originals' group already, so they don't count.
  for (const name of new Set(originals.map(groupOf).filter(Boolean)))
    whole.set(
      name,
      groupItems(name)
        .filter((member) => !copies.some(same(member)))
        .every((member) => originals.some(same(member))),
    );
  const renamed = new Map();
  copies.forEach((copy, index) => {
    const name = groupOf(originals[index]);
    if (!name || !whole.get(name)) return;
    if (!renamed.has(name)) renamed.set(name, freshGroupName(baseName(name)));
    setGroup(copy, renamed.get(name));
  });
}

/**
 * Give pasted blocks and props fresh group names wherever a group of that
 * name is already on the trail, so a paste is always a group of its own.
 * `names` are the trail's groups from before the paste.
 */
export function regroupPasted(items, names) {
  const taken = new Set(names);
  const renamed = new Map();
  for (const item of items) {
    const name = groupOf(item);
    if (!name || !taken.has(name)) continue;
    if (!renamed.has(name)) renamed.set(name, freshGroupName(baseName(name)));
    setGroup(item, renamed.get(name));
  }
}

/** A group's name without the number a copy adds: House 2 is a House. */
const baseName = (name) => name.replace(/ \d+$/, "") || name;
