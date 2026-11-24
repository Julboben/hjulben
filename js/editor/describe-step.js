// Words for an undo step, such as "moved 3 blocks, deleted the tree", so undo
// and redo can say what they did. The words come from comparing the two states
// rather than from each edit naming itself, so every edit is covered, including
// ones added later, and the words can't drift from what the edit really did.
import { isBackWall } from "../trail-schema.js";

/** At most this many kinds of change are named; the rest are "more". */
const MAX_PHRASES = 3;

// The lists of objects on a trail, and what one of their items is called.
const LISTS = {
  apples: () => ["apple", "apples"],
  props: (prop) => [prop.type.replaceAll("-", " "), "props"],
  spikes: () => ["spike", "spikes"],
  water: () => ["pool of water", "pools of water"],
};

// Trail settings, and what changing each is called. Anything else at the top
// of the trail counts as its settings.
const SETTINGS = {
  name: "renamed the trail",
  description: "edited the description",
  author: "changed the author",
  weather: "changed the weather",
  timeOfDay: "changed the time of day",
  backdrop: "changed the backdrop",
  medals: "changed the medal times",
  preview: "moved the preview",
};
const COMPARED = new Set(["start", "finish", "nisse", "terrainBlocks", ...Object.keys(LISTS)]);

// Lock and hide groups and single things, as js/editor/locks.js keys them; a
// prop is named from its key, which holds the prop.
const FLAG_GROUPS = {
  terrain: "terrain",
  back: "back walls",
  frontProps: "front props",
  backProps: "back props",
  water: "water",
  spikes: "spikes",
  apples: "apples",
};
const FLAG_ITEMS = {
  block: ["block", "blocks"],
  apple: ["apple", "apples"],
  nisse: ["nisse", "nisse"],
  spike: ["spike", "spikes"],
  water: ["pool of water", "pools of water"],
};
const FLAG_VERBS = { lock: ["locked", "unlocked"], hide: ["hid", "showed"] };

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What changed from the step `before` to `after`, both snapshots from
 * js/editor/history.js, in words; null when the trail, its locks and its hides
 * are all the same.
 */
export function describeStep(before, after) {
  const from = JSON.parse(before.trail);
  const to = JSON.parse(after.trail);
  const changes = new Changes();
  compareMarkers(changes, from, to);
  compareBlocks(changes, from.terrainBlocks || [], to.terrainBlocks || []);
  for (const [key, name] of Object.entries(LISTS))
    compareList(changes, key, name, from[key] || [], to[key] || []);
  compareFlags(changes, before.flags, after.flags);
  compareSettings(changes, from, to);
  return changes.words();
}

/** What each verb was done to, kept in the order the verbs first came up. */
class Changes {
  verbs = new Map();

  /** One thing, called `one` alone and counted as `many`, had `verb` done to it. */
  add(verb, one, many = one) {
    if (!this.verbs.has(verb)) this.verbs.set(verb, new Map());
    const nouns = this.verbs.get(verb);
    const noun = nouns.get(many) || { one, many, count: 0 };
    noun.count++;
    nouns.set(many, noun);
  }

  /** A change that names its own object, such as "renamed the trail". */
  say(phrase) {
    if (!this.verbs.has(phrase)) this.verbs.set(phrase, null);
  }

  words() {
    const phrases = [...this.verbs].map(([verb, nouns]) =>
      nouns ? `${verb} ${list([...nouns.values()].map((noun) => nounWords(verb, noun)))}` : verb,
    );
    if (!phrases.length) return null;
    if (phrases.length > MAX_PHRASES) return `${phrases.slice(0, MAX_PHRASES).join(", ")} and more`;
    return phrases.join(", ");
  }
}

/** "the tree", "a tree", "3 props": something new is "a", the rest "the". */
function nounWords(verb, { one, many, count }) {
  if (count > 1) return `${count} ${many}`;
  if (verb !== "added") return `the ${one}`;
  return `${/^[aeiou]/.test(one) ? "an" : "a"} ${one}`;
}

/** "a", "a and b", "a, b and c". */
function list(items) {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function compareMarkers(changes, from, to) {
  if (!same(from.start, to.start)) {
    const turned = from.start.facing !== to.start.facing;
    const moved = from.start.x !== to.start.x || from.start.y !== to.start.y;
    changes.say(turned && !moved ? "turned the start around" : "moved the start");
  }
  if (!same(from.finish, to.finish)) changes.say("moved the finish");
  if (!from.nisse && to.nisse) changes.add("added", "nisse");
  else if (from.nisse && !to.nisse) changes.add("deleted", "nisse");
  else if (!same(from.nisse, to.nisse)) changes.add("moved", "nisse");
}

const blockName = (block) => (isBackWall(block) ? ["back wall", "back walls"] : ["block", "blocks"]);

/** Blocks keep their id through every edit, so they are matched by it. */
function compareBlocks(changes, from, to) {
  const before = new Map(from.map((block) => [block.id, block]));
  const after = new Map(to.map((block) => [block.id, block]));
  for (const block of to) if (!before.has(block.id)) changes.add("added", ...blockName(block));
  for (const block of from) if (!after.has(block.id)) changes.add("deleted", ...blockName(block));
  let edited = false;
  for (const block of to) {
    const old = before.get(block.id);
    if (!old || same(old, block)) continue;
    edited = true;
    changes.add(blockVerb(old, block), ...blockName(old));
  }
  const order = (blocks, others) => blocks.filter((block) => others.has(block.id)).map((block) => block.id);
  if (!edited && !same(order(from, after), order(to, before)))
    changes.say("changed the order of the blocks");
}

function blockVerb(from, to) {
  if (from.material !== to.material) return "changed the material of";
  if (isBackWall(from) !== isBackWall(to)) return "changed the layer of";
  if (from.group !== to.group) return groupVerb(from.group, to.group);
  return shifted(from, to) ? "moved" : "reshaped";
}

/** Is `to` the block `from` slid along, with every point moved alike? */
function shifted(from, to) {
  const rings = (block) => [block.outer, ...block.inner];
  const [a, b] = [rings(from), rings(to)];
  if (a.length !== b.length) return false;
  const first = a[0].nodes[0];
  const delta = first && b[0].nodes[0] ? [b[0].nodes[0].x - first.x, b[0].nodes[0].y - first.y] : null;
  if (!delta) return false;
  return a.every(
    (ring, r) =>
      ring.nodes.length === b[r].nodes.length &&
      ring.nodes.every((node, n) => {
        const moved = b[r].nodes[n];
        return (
          Math.abs(moved.x - node.x - delta[0]) < 1e-6 &&
          Math.abs(moved.y - node.y - delta[1]) < 1e-6 &&
          same(node.in, moved.in) &&
          same(node.out, moved.out)
        );
      }),
  );
}

function groupVerb(from, to) {
  if (!from) return "grouped";
  return to ? "regrouped" : "ungrouped";
}

/**
 * Objects have no id. A list as long as before is compared item by item;
 * otherwise what is new and what is gone are counted, matched by content.
 */
function compareList(changes, key, name, from, to) {
  if (from.length !== to.length) {
    const unmatched = (items, others) => {
      const left = others.map((item) => JSON.stringify(item));
      return items.filter((item) => {
        const at = left.indexOf(JSON.stringify(item));
        if (at < 0) return true;
        left.splice(at, 1);
        return false;
      });
    };
    for (const item of unmatched(to, from)) changes.add("added", ...name(item));
    for (const item of unmatched(from, to)) changes.add("deleted", ...name(item));
    return;
  }
  const edits = from.map((item, index) => [item, to[index]]).filter(([a, b]) => !same(a, b));
  if (!edits.length) return;
  const sorted = (items) => items.map((item) => JSON.stringify(item)).sort();
  if (same(sorted(from), sorted(to))) {
    changes.say(`changed the order of the ${name(from[0])[1]}`);
    return;
  }
  for (const [a, b] of edits) changes.add(objectVerb(a, b), ...name(a));
}

/** The one word for what happened to an object, the most telling first. */
function objectVerb(from, to) {
  const differs = (key) => !same(from[key], to[key]);
  if (differs("type")) return "changed";
  if (differs("rotation")) return "turned";
  if (differs("flip")) return "flipped";
  if (differs("width") || differs("depth") || differs("radius")) return "resized";
  if (differs("text")) return "edited the text of";
  if (differs("layer")) return "changed the layer of";
  if (differs("group")) return groupVerb(from.group, to.group);
  if (differs("spin")) return "changed the spin of";
  return differs("x") || differs("y") ? "moved" : "changed";
}

/** Locks and hides, on whole groups and on single things. */
function compareFlags(changes, from, to) {
  if (!from || !to) return;
  for (const [kind, [on, off]] of Object.entries(FLAG_VERBS)) {
    for (const [verb, a, b] of [
      [on, to[kind], from[kind]],
      [off, from[kind], to[kind]],
    ]) {
      for (const group of a.groups)
        if (!b.groups.includes(group)) changes.add(verb, FLAG_GROUPS[group] || "group", "groups");
      for (const item of a.items) if (!b.items.includes(item)) changes.add(verb, ...flaggedName(item));
    }
  }
}

/** What a lock or hide key, `type:content#copy` or `block:id`, is called. */
function flaggedName(key) {
  const [type] = key.split(":", 1);
  if (type === "prop") return LISTS.props(JSON.parse(key.slice("prop:".length, key.lastIndexOf("#"))));
  return FLAG_ITEMS[type];
}

function compareSettings(changes, from, to) {
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  for (const key of keys) {
    if (COMPARED.has(key) || same(from[key], to[key])) continue;
    changes.say(SETTINGS[key] || "changed the trail settings");
  }
}
