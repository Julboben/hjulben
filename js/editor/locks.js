// Locking and hiding. A locked group, or a single locked item, is still drawn
// but can't be picked, box-selected, cut or drawn onto. A hidden one isn't
// drawn in the editor either, so what is behind it can be worked on; the trail
// and the game are unchanged. Both are the author's way of working, not part
// of the trail, so they live in local storage and never in the trail file.
//
// Both belong to one trail: locking the props on one trail leaves them free on
// the next. An item is known by its block's id, or else by its content, which
// can't change while it is locked or hidden.
import { store } from "../local-store.js";
import { isBackWall } from "../trail-schema.js";
import { editor, waters } from "./state.js";
import { currentEntry } from "./trails.js";

/** The groups the Objects tab lists, in the order it lists them. */
export const LOCK_GROUPS = [
  { key: "terrain", label: "Terrain" },
  { key: "back", label: "Back walls" },
  { key: "backProps", label: "Back props" },
  { key: "frontProps", label: "Front props" },
  { key: "water", label: "Water" },
  { key: "spikes", label: "Spikes" },
  { key: "apples", label: "Apples" },
];

// Group locks used to apply to every trail, under this one key.
const OLD_GROUPS_KEY = "hjulben-editor-locked-groups";
// Where each kind of flag is stored, with the trail's id after it.
const PREFIXES = {
  lock: { groups: "hjulben-editor-locked-groups-", items: "hjulben-editor-locked-items-" },
  hide: { groups: "hjulben-editor-hidden-groups-", items: "hjulben-editor-hidden-items-" },
};

const empty = () => ({ groups: new Set(), items: new Set() });

// The flags of the trail they were read for; read again when another opens.
let flags = { id: undefined, lock: empty(), hide: empty() };

function read(key) {
  try {
    const value = JSON.parse(store().getItem(key) || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch (_) {
    return new Set();
  }
}

function write(key, set) {
  try {
    if (set.size) store().setItem(key, JSON.stringify([...set]));
    else store().removeItem(key);
  } catch (_) {
    // Full or blocked storage: the flag still holds until the page reloads.
  }
}

/** The current trail's flags. A trail with no id yet keeps them until reload. */
function current() {
  const id = currentEntry()?.id ?? null;
  if (flags.id !== id) {
    const load = (kind) =>
      id === null
        ? empty()
        : { groups: read(PREFIXES[kind].groups + id), items: read(PREFIXES[kind].items + id) };
    flags = { id, lock: load("lock"), hide: load("hide") };
    try {
      store().removeItem(OLD_GROUPS_KEY);
    } catch (_) {}
  }
  return flags;
}

/** Save one kind of flag for the current trail. */
function save(kind) {
  if (flags.id === null) return;
  write(PREFIXES[kind].groups + flags.id, flags[kind].groups);
  write(PREFIXES[kind].items + flags.id, flags[kind].items);
}

/** Keep a trail's locks and hides when it moves to a new id, as a rename does. */
export function moveLocks(from, to) {
  if (from === to) return;
  try {
    for (const kind of Object.values(PREFIXES))
      for (const prefix of Object.values(kind)) {
        const value = store().getItem(prefix + from);
        if (value !== null) store().setItem(prefix + to, value);
        store().removeItem(prefix + from);
      }
  } catch (_) {}
  // Storage always holds the latest flags, so they are simply read again.
  flags = { id: undefined, lock: empty(), hide: empty() };
}

// ---- What an object is -----------------------------------------------------

const LISTS = () => ({
  apple: editor.trail.apples,
  nisse: editor.trail.nisse ? [editor.trail.nisse] : [],
  prop: editor.trail.props,
  spike: editor.trail.spikes,
  water: waters(),
});

/** The group a block, apple, prop, spike or water body belongs to. */
export function groupOf(type, object) {
  if (type === "block") return isBackWall(object) ? "back" : "terrain";
  if (type === "prop") return object.layer === "front" ? "frontProps" : "backProps";
  return { water: "water", spike: "spikes", apple: "apples", nisse: "apples" }[type] || null;
}

/** JSON with sorted keys, so the same content always reads the same. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

/**
 * What an item lock is stored under. Two identical props are told apart by
 * how many identical ones come before them in the list.
 */
function itemKey(type, index) {
  if (type === "block") {
    const block = editor.trail.terrainBlocks?.[index];
    return block ? `block:${block.id}` : null;
  }
  const list = LISTS()[type];
  if (!list?.[index]) return null;
  const content = canonical(list[index]);
  let copy = 0;
  for (let other = 0; other < index; other++)
    if (canonical(list[other]) === content) copy++;
  return `${type}:${content}#${copy}`;
}

function objectAt(type, index) {
  if (type === "block") return editor.trail.terrainBlocks?.[index] || null;
  return LISTS()[type]?.[index] || null;
}

// ---- Asking ----------------------------------------------------------------

export const isGroupLocked = (key) => current().lock.groups.has(key);
export const isGroupHidden = (key) => current().hide.groups.has(key);

/**
 * Is this one item flagged on its own, apart from its group? This runs for
 * every object on every hover and redraw, so the full key, which counts
 * lookalikes, is only worked out when the content alone already matches.
 */
function itemFlagged(kind, type, index) {
  const keys = current()[kind].items;
  if (!keys.size) return false;
  if (type === "block") {
    const block = editor.trail.terrainBlocks?.[index];
    return Boolean(block) && keys.has(`block:${block.id}`);
  }
  const object = LISTS()[type]?.[index];
  if (!object) return false;
  const prefix = `${type}:${canonical(object)}#`;
  for (const key of keys) if (key.startsWith(prefix)) return keys.has(itemKey(type, index));
  return false;
}

export const isItemLocked = (type, index) => itemFlagged("lock", type, index);
export const isItemHidden = (type, index) => itemFlagged("hide", type, index);

/** Isn't drawn in the editor: its group is hidden, or it is. */
export function isHidden(type, index) {
  const object = objectAt(type, index);
  if (!object) return false;
  return isGroupHidden(groupOf(type, object)) || isItemHidden(type, index);
}

/** Can't be picked or changed: it is locked or hidden, on its own or by its group. */
export function isLocked(type, index) {
  const object = objectAt(type, index);
  if (!object) return false;
  const group = groupOf(type, object);
  return (
    isGroupLocked(group) ||
    isGroupHidden(group) ||
    isItemLocked(type, index) ||
    isItemHidden(type, index)
  );
}

export const isBlockLocked = (blockIndex) => isLocked("block", blockIndex);

/**
 * Is a selection item ({ type, index }, or a block point) locked? The start
 * and finish never are, so there is always something to select.
 */
export function isSelectionItemLocked(item) {
  if (item.type === "point") return isBlockLocked(item.blockIndex);
  if (item.type === "start" || item.type === "finish") return false;
  return isLocked(item.type, item.index);
}

/** Is a hit locked: anything on a block by its block, objects by themselves. */
export function isHitLocked(hit) {
  if (!hit) return false;
  if (Number.isInteger(hit.blockIndex)) return isBlockLocked(hit.blockIndex);
  if (LISTS()[hit.kind]) return isLocked(hit.kind, hit.index);
  return false;
}

/** Is anything locked at all, in any group or on this trail? */
export const anyLocked = () => current().lock.groups.size > 0 || current().lock.items.size > 0;
/** Is anything hidden at all? */
export const anyHidden = () => current().hide.groups.size > 0 || current().hide.items.size > 0;

/**
 * What is hidden, as a string that changes whenever it does, so a drawing
 * made without the hidden things can be kept until then.
 */
export function hiddenSignature() {
  const { id, hide } = current();
  return `${id}|${[...hide.groups]}|${[...hide.items]}`;
}

// ---- Changing --------------------------------------------------------------

/**
 * Flag a whole group or let it go. Either way what was flagged on its own in
 * it is forgotten, so letting the group go frees all of it rather than
 * bringing back the single items.
 */
function setGroupFlag(kind, key, on) {
  const { groups, items } = current()[kind];
  if (on) groups.add(key);
  else groups.delete(key);
  const all = [["block", editor.trail.terrainBlocks || []], ...Object.entries(LISTS())];
  for (const [type, list] of all)
    list.forEach((object, index) => {
      if (groupOf(type, object) === key) items.delete(itemKey(type, index));
    });
  save(kind);
}

function setItemFlag(kind, type, index, on) {
  const key = itemKey(type, index);
  if (!key) return;
  const keys = current()[kind].items;
  if (on) keys.add(key);
  else keys.delete(key);
  pruneItemFlags();
}

export const setGroupLocked = (key, locked) => setGroupFlag("lock", key, locked);
export const setGroupHidden = (key, hidden) => setGroupFlag("hide", key, hidden);
export const setItemLocked = (type, index, locked) => setItemFlag("lock", type, index, locked);
export const setItemHidden = (type, index, hidden) => setItemFlag("hide", type, index, hidden);

/**
 * Flag every group on this trail, or with `on` false, let go of every group
 * and every single item alike.
 */
function flagEverything(kind, on) {
  const { groups, items } = current()[kind];
  if (on) for (const { key } of LOCK_GROUPS) groups.add(key);
  else {
    groups.clear();
    items.clear();
  }
  save(kind);
}

export const setAllLocked = (locked) => flagEverything("lock", locked);
export const setAllHidden = (hidden) => flagEverything("hide", hidden);
export const allLocked = () => LOCK_GROUPS.every(({ key }) => isGroupLocked(key));
export const allHidden = () => LOCK_GROUPS.every(({ key }) => isGroupHidden(key));

/**
 * Forget item locks and hides that match nothing on the trail any more, such
 * as after an undo past the moment something was locked, so a lookalike added
 * later isn't locked by surprise. Saves what is left.
 */
export function pruneItemFlags() {
  current();
  if (flags.id === null) return;
  const present = new Set();
  const all = [
    ["block", editor.trail.terrainBlocks || []],
    ...Object.entries(LISTS()),
  ];
  for (const [type, list] of all)
    list.forEach((_, index) => present.add(itemKey(type, index)));
  for (const kind of ["lock", "hide"]) {
    const keys = flags[kind].items;
    for (const key of keys) if (!present.has(key)) keys.delete(key);
    write(PREFIXES[kind].items + flags.id, keys);
  }
}

/** The group a drawing tool adds to, or null when it adds nothing lockable. */
export function toolGroup(tool, settings) {
  if (tool === "block" || tool === "cut")
    return settings[tool]?.layer === "back" ? "back" : "terrain";
  if (tool === "prop") return settings.prop?.layer === "front" ? "frontProps" : "backProps";
  return { water: "water", spike: "spikes", apple: "apples" }[tool] || null;
}

export function groupLabel(key) {
  return LOCK_GROUPS.find((group) => group.key === key)?.label || key;
}
