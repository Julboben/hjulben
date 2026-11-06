// The rider customizer, used when creating a rider and in the Garage: a tab
// per part (hair, helmet, outfit, bike, extras) with an icon, a live preview of the
// rider on their bike, the part's styles, and its colours in their own panel.
// Every style swatch is the real rider, drawn by
// the game's renderer with that one item swapped in, so it matches the ride.
// Gender and skin are the rider's identity: picked once, on the first step
// of creating a rider (createIdentityPicker), and never changed here.
import { trails } from '../trails.js';
import { RADIUS } from '../config.js';
import { drawFigure, posedRide } from '../scene-preview.js';
import { CODA_HAPPY, LIGHT_SWITCH, codaAt, drawGarage } from '../garage-backdrop.js';
import {
  DEFAULT_LOOK, LOOK_PARTS, SLOT_LABELS, extraHiddenBy, isColorless, isDefaultItem, itemsForSlot, lookItem, lookKey,
  normalizeLook, partName, randomLook, sameLook, shownItemsForSlot, starterLook
} from '../cosmetics.js';

// What each view frames, in world units around the bike's axles.
const SWATCH_VIEWS = {
  // The head centred. Every head swatch and avatar shares it, so tall items
  // show at the same size as the rest, their tops cropped.
  head: { dx: -2, dy: -44, width: 30, height: 30 },
  outfit: { dx: -8, dy: -30, width: 44, height: 44 },
  // The head and shoulders, for what is worn on the face.
  neck: { dx: -7, dy: -40, width: 34, height: 34 },
  // The rider's back, with room for a trail above and behind it.
  trail: { dx: -14, dy: -42, width: 52, height: 52 },
  bike: { dx: 0, dy: -22, width: 88, height: 70 },
  // The big preview: the whole rider and bike, wheels and floor included,
  // and the walls either side with what the career has put on them.
  full: { dx: 0, dy: -26, width: 220, height: 110 }
};

// Which view each part's style swatches use (a slot of SLOT_VIEWS its own),
// and what their swatches take off so the item shows: hair and face wear
// hide under a helmet, and a trail behind an outfit's own cape or scarf.
const PART_VIEWS = { hair: 'head', helmet: 'head', outfit: 'outfit', bike: 'bike', extras: 'neck' };
const SLOT_VIEWS = { trail: 'trail' };
const SWATCH_CLEAR = {
  hair: () => ({ helmet: 'none' }),
  extras: look => ({ helmet: 'none', ...(lookItem('outfit', look.outfit)?.accessory ? { outfit: 'street' } : {}) }),
};

// How often the big preview moves on, about ten frames a second, which
// suits the pixel art and costs little.
const FRAME_MS = 100;
const still = matchMedia('(prefers-reduced-motion: reduce)');

let pose = null;
/** The rider at the first trail's start, which every preview and swatch shows. */
function posed() {
  if (!pose) {
    const trail = trails[0];
    const ride = posedRide(trail);
    // The garage floor is flat, so level the bike the start's slope tipped.
    const axle = Math.max(ride.rear.y, ride.front.y);
    ride.rear.y = ride.front.y = axle;
    const x = (ride.rear.x + ride.front.x) / 2;
    const floor = axle + RADIUS;
    pose = { trail, ride, x, y: axle, backdrop: (room, time, lightsOff) => (ctx, view) => drawGarage(ctx, view, { x, floor, room, time, lightsOff }) };
  }
  return pose;
}

/**
 * Where a point on the big preview, as fractions of its width and height,
 * is in the garage: from the bike's midpoint and the floor under it.
 */
function previewSpot(fx, fy) {
  const { x, y, ride } = posed();
  const frame = SWATCH_VIEWS.full;
  return {
    dx: frame.dx * ride.facing + (fx - 0.5) * frame.width,
    dy: y + frame.dy + (fy - 0.5) * frame.height - (y + RADIUS),
  };
}

/** Where a point in the garage is on the big preview, as fractions of its width and height (see previewSpot). */
function previewPlace(dx, dy) {
  const { ride } = posed();
  const frame = SWATCH_VIEWS.full;
  return {
    fx: 0.5 + (dx - frame.dx * ride.facing) / frame.width,
    fy: 0.5 + (dy + RADIUS - frame.dy) / frame.height,
  };
}

/**
 * Paints `look`'s rider in the garage into `target`, framed by `view`:
 * 'head', 'outfit', 'bike' or 'full' (the big preview). `dark` turns the
 * garage lights off, to show the bike's lights, `room` is what the
 * rider's career has put in the garage (see garageRoom in state.js), and
 * `time` brings it to life at that moment (see drawGarage).
 * @param {HTMLCanvasElement} target
 * @param {any} look
 * @param {string} [view]
 * @param {{
 *   dark?: boolean, room?: import('../garage-backdrop.js').GarageRoom | null,
 *   time?: import('../garage-backdrop.js').GarageTime | null
 * }} [options]
 */
export function drawLook(target, look, view = 'full', { dark = false, room = null, time = null } = {}) {
  const { ride, x, y, backdrop } = posed();
  const frame = SWATCH_VIEWS[view] ?? SWATCH_VIEWS.full;
  return drawFigure(target, {
    ride, look, backdrop: backdrop(room, time, dark), dark,
    width: frame.width, height: frame.height,
    focus: { x: x + frame.dx * ride.facing, y: y + frame.dy }, anchor: [0.5, 0.5]
  });
}

function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function icon(name) {
  const node = element('span');
  node.dataset.icon = name;
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/** A section heading: a title, and a note on the right. */
function sectionHead() {
  const head = element('div', 'look-section-head');
  const title = element('h4');
  const note = element('small');
  head.append(title, note);
  return { head, title, note };
}

/** A two-tone colour chip, as in the colour panel and the skin picker. */
function chip(item) {
  const swatch = element('span', 'look-chip-colors');
  swatch.setAttribute('aria-hidden', 'true');
  const [base, shade] = item.chip ?? ['#000', '#000'];
  swatch.style.setProperty('--chip-a', base);
  swatch.style.setProperty('--chip-b', shade);
  return swatch;
}

function radio(className, checked, label) {
  const option = element('button', className);
  option.type = 'button';
  option.setAttribute('role', 'radio');
  option.setAttribute('aria-checked', String(checked));
  option.setAttribute('aria-label', label);
  option.title = label;
  return option;
}

/**
 * @typedef {{
 *   paint: (target: HTMLCanvasElement, key: string, render: (image: HTMLCanvasElement) => void, options?: { now?: boolean }) => void,
 *   previewKey: (...parts: string[]) => string
 * }} PaintHooks  `paint` draws into a canvas through the menu's preview cache.
 */

/**
 * @param {HTMLElement} root  emptied and filled with the customizer
 * @param {PaintHooks & {
 *   onChange?: (look: any) => void,
 *   owns?: (slot: string, id: string) => boolean,
 *   hint?: (item: any) => string,
 *   isNew?: (slot: string, id: string) => boolean,
 *   onSeen?: (keys: string[]) => void,
 *   room?: () => import('../garage-backdrop.js').GarageRoom | null,
 *   onPet?: () => void
 * }} hooks  `owns` says which items the rider may wear; locked items are
 *   shown but cannot be picked, with `hint` saying what unlocks them.
 *   `isNew` marks items just won with a NEW tag, and their part's tab with a
 *   dot until it is opened; `onSeen` gets the new items ('slot:id') of each
 *   part as it is shown. `room` furnishes the garage in the big preview,
 *   and `onPet` hears Coda being petted there, to woof.
 */
export function createCustomizer(root, {
  paint, previewKey, onChange = () => {}, owns = isDefaultItem, hint = () => '', isNew = () => false, onSeen = () => {},
  room = () => null, onPet = () => {}
}) {
  let look = { ...DEFAULT_LOOK };
  // The looks to step back and forward through, since the customizer opened.
  let past = [], future = [];
  let part = LOOK_PARTS[0];
  // Whether the big preview has the garage lights off, to show the bike's lights.
  let dark = false;
  // The parts shown since the customizer opened: their tabs lose the new-item dot.
  const visited = new Set();

  root.classList.add('look-editor');

  // Tabs, one per part, over the big preview; styled like the menu's other tab bars.
  const tabs = element('div', 'menu-tabs look-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Rider look');
  const tabButtons = LOOK_PARTS.map(entry => {
    const tab = element('button', 'menu-tab look-tab');
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.dataset.lookPart = entry.id;
    const text = element('span', 'look-tab-text');
    text.append(element('b', '', (entry.tab ?? SLOT_LABELS[entry.style]).toUpperCase()));
    // Read out with the tab's name while it shows.
    const dot = element('span', 'look-tab-new');
    dot.append(element('span', 'sr-only', ', new items'));
    dot.hidden = true;
    tab.append(icon(entry.icon), text, dot);
    tab.addEventListener('click', () => { part = entry; render(); });
    return tab;
  });
  tabs.append(...tabButtons);

  const stage = element('div', 'look-stage');
  const preview = element('canvas', 'look-preview');
  preview.setAttribute('role', 'img');
  const lightSwitch = element('button', 'look-light');
  lightSwitch.type = 'button';
  lightSwitch.addEventListener('click', () => { dark = !dark; renderPreview(); });
  // Over the switch drawn on the wall, which shows whether the lights are on.
  const switchAt = previewPlace(LIGHT_SWITCH.dx, LIGHT_SWITCH.dy);
  lightSwitch.style.left = `${switchAt.fx * 100}%`;
  lightSwitch.style.top = `${switchAt.fy * 100}%`;
  stage.append(preview, lightSwitch);

  const top = element('div', 'look-top');
  top.append(tabs, stage);

  // The part's styles, with the selected one described, and its extra
  // slot's (the hair tab's beards) in a panel of their own.
  const styles = styleSection();
  const extras = styleSection();

  // The part's colours, in their own panel.
  // The part's colours, and its extra slot's when it has its own, each in a panel.
  const colors = colorSection();
  const extraColors = colorSection();

  const actions = element('div', 'look-actions');
  const shuffle = element('button', 'menu-back look-random');
  shuffle.type = 'button';
  shuffle.dataset.iconBefore = 'dice';
  shuffle.append(element('span', 'look-random-text', 'RANDOM'));
  shuffle.title = 'A random look from what you have unlocked';
  shuffle.setAttribute('aria-label', shuffle.title);
  shuffle.addEventListener('click', () => {
    // A few tries, so the button never seems to do nothing.
    let rolled = look;
    for (let tries = 0; tries < 8 && sameLook(rolled, look); tries++) rolled = randomLook(look, { owns });
    set(rolled);
  });
  const undo = historyButton('undo', 'Undo', () => step(past, future));
  const redo = historyButton('redo', 'Redo', () => step(future, past));
  actions.append(shuffle, undo, redo);
  // The usual shortcuts, while anything in the customizer has focus.
  root.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const back = event.code === 'KeyZ' && !event.shiftKey;
    const forward = (event.code === 'KeyZ' && event.shiftKey) || (event.code === 'KeyY' && !event.shiftKey);
    if (!back && !forward) return;
    event.preventDefault();
    if (back) step(past, future);
    else step(future, past);
  });

  function historyButton(name, label, onClick) {
    const button = element('button', 'menu-back look-history');
    button.type = 'button';
    button.append(icon(name));
    button.title = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', onClick);
    return button;
  }

  /** Undo or redo: the last look of `from` comes back, and the shown one goes to `to`. */
  function step(from, to) {
    if (!from.length) return;
    to.push(look);
    look = from.pop();
    render();
    onChange({ ...look });
  }

  root.replaceChildren(top, styles.section, extras.section, colors.section, extraColors.section, actions);

  function colorSection() {
    const section = element('section', 'look-section look-colors');
    const head = sectionHead();
    const chips = element('div', 'look-chips');
    chips.setAttribute('role', 'radiogroup');
    section.append(head.head, chips);
    return { section, head, chips };
  }

  function styleSection() {
    const section = element('section', 'look-section');
    const head = sectionHead();
    const detail = element('div', 'look-detail');
    const name = element('b');
    const blurb = element('small');
    detail.append(name, blurb);
    const options = element('div', 'look-options');
    options.setAttribute('role', 'radiogroup');
    section.append(head.head, detail, options);
    return { section, head, name, blurb, options };
  }

  function lockedLabel(item, locked) {
    if (!locked) return isNew(item.slot, item.id) ? `${item.name} (new)` : item.name;
    const how = hint(item);
    return how ? `${item.name} (locked: ${how.toLowerCase()})` : `${item.name} (locked)`;
  }

  /** The new items among `entry`'s styles and colours, as 'slot:id' keys. */
  function newItems(entry) {
    return [entry.style, entry.color, entry.extra, entry.extraColor].filter(Boolean)
      .flatMap(slot => itemsForSlot(slot).filter(item => isNew(slot, item.id)).map(item => slot + ':' + item.id));
  }

  function set(nextLook) {
    const next = normalizeLook(nextLook, { fallback: look, owns });
    if (sameLook(next, look)) return;
    past.push(look);
    future = [];
    look = next;
    render();
    onChange({ ...look });
  }

  function paintLook(target, shown, view) {
    paint(target, previewKey('look', view, lookKey(shown)), image => drawLook(image, shown, view));
  }

  // The big preview is drawn live rather than from the cache, so the room
  // moves (see drawGarage): a frame every FRAME_MS while it is on screen.
  // With reduced motion it is drawn still, and once more as a pat wears off.
  // `pettedAt` is when Coda was last petted.
  let furnished = null, shownAt = 0, drawnAt = -Infinity, frameRequest = 0, pettedAt = null, settleTimer = 0;

  function drawPreview(stamp) {
    drawnAt = stamp;
    const petted = pettedAt === null || stamp - pettedAt > CODA_HAPPY * 1000 ? null : still.matches ? 0 : (stamp - pettedAt) / 1000;
    const seconds = still.matches ? 0 : (stamp - shownAt) / 1000;
    drawLook(preview, look, 'full', { dark, room: furnished, time: { seconds, petted } });
  }

  function animate(stamp) {
    frameRequest = 0;
    // Hidden (another view, the creator's other step) or in a background tab: stop until shown again.
    if (document.hidden || !preview.checkVisibility()) return;
    if (stamp - drawnAt >= FRAME_MS) drawPreview(stamp);
    frameRequest = requestAnimationFrame(animate);
  }

  function startPreview() {
    if (frameRequest || still.matches) return;
    shownAt ||= performance.now();
    frameRequest = requestAnimationFrame(animate);
  }

  /** Where a pointer event is on the big preview, in the garage (see previewSpot). */
  function spotOf(event) {
    const box = preview.getBoundingClientRect();
    return previewSpot((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  }
  const onCoda = event => {
    if (!furnished?.coda) return false;
    const { dx, dy } = spotOf(event);
    return codaAt(dx, dy);
  };
  preview.addEventListener('pointermove', event => { preview.style.cursor = onCoda(event) ? 'pointer' : ''; });
  preview.addEventListener('click', event => {
    if (!onCoda(event)) return;
    pettedAt = performance.now();
    onPet();
    drawPreview(pettedAt);
    if (still.matches) {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => drawPreview(performance.now()), CODA_HAPPY * 1000 + 50);
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) startPreview(); });

  function renderPreview() {
    drawPreview(performance.now());
    startPreview();
    const label = dark ? 'Turn the garage lights on' : 'Turn the garage lights off to see the bike\'s lights';
    lightSwitch.setAttribute('aria-pressed', String(dark));
    lightSwitch.setAttribute('aria-label', label);
    lightSwitch.title = label;
  }

  /** Fills `panel` (from styleSection) with `slot`'s styles. */
  function renderStyles(panel, slot) {
    const { head, name: detailName, blurb: detailBlurb, options } = panel;
    const items = shownItemsForSlot(slot, owns);
    const selected = lookItem(slot, look[slot]);
    head.title.textContent = SLOT_LABELS[slot].toUpperCase();
    // Secret items only count once they are shown, so they stay secret.
    head.note.textContent = `${items.filter(item => owns(slot, item.id)).length} / ${items.length} unlocked`;
    detailName.textContent = selected?.name.toUpperCase() ?? '';
    detailBlurb.textContent = selected?.blurb ?? '';
    // An extra a helmet or outfit covers is still worn, but says why it doesn't show.
    const hider = extraHiddenBy(look, slot);
    if (hider) detailBlurb.textContent = `Your ${hider.name.toLowerCase()} ${SLOT_LABELS[hider.slot].toLowerCase()} hides it.`;
    options.setAttribute('aria-label', SLOT_LABELS[slot]);
    const view = SLOT_VIEWS[slot] ?? PART_VIEWS[part.id];
    options.replaceChildren(...items.map(item => {
      const locked = !owns(slot, item.id);
      const option = radio('look-option', look[slot] === item.id, lockedLabel(item, locked));
      option.setAttribute('aria-disabled', String(locked));
      option.classList.toggle('locked', locked);
      const swatch = element('canvas');
      swatch.setAttribute('aria-hidden', 'true');
      const shown = { ...look, ...SWATCH_CLEAR[part.id]?.(look), [slot]: item.id };
      paintLook(swatch, shown, view);
      option.append(swatch, element('small', '', item.name));
      if (locked) option.append(icon('lock'));
      else if (isNew(slot, item.id)) option.append(element('b', 'look-new', 'NEW'));
      // A locked style can't be worn, but tapping it says what unlocks it.
      option.addEventListener('click', () => {
        if (!locked) { set({ ...look, [slot]: item.id }); return; }
        detailName.textContent = item.name.toUpperCase();
        detailBlurb.textContent = hint(item) || 'Locked';
      });
      return option;
    }));
  }

  /** Fills `panel` (from colorSection) with `slot`'s colours, for `style`'s item; `colorless` greys them out. */
  function renderColors(panel, slot, style, colorless) {
    const { section, head, chips } = panel;
    const selected = lookItem(slot, look[slot]);
    head.title.textContent = SLOT_LABELS[slot].toUpperCase();
    head.note.textContent = colorless ? `None for ${lookItem(style, look[style])?.name.toLowerCase()}` : selected?.name ?? '';
    section.classList.toggle('disabled', colorless);
    chips.setAttribute('aria-label', SLOT_LABELS[slot]);
    chips.replaceChildren(...itemsForSlot(slot).map(item => {
      const locked = !owns(slot, item.id);
      const option = radio('look-chip', look[slot] === item.id, lockedLabel(item, locked));
      option.disabled = locked || colorless;
      option.classList.toggle('locked', locked);
      option.append(chip(item));
      if (locked) option.append(icon('lock'));
      else if (isNew(slot, item.id)) option.append(element('span', 'look-new'));
      option.addEventListener('click', () => set({ ...look, [slot]: item.id }));
      return option;
    }));
  }

  function render() {
    furnished = room();
    if (!visited.has(part.id)) {
      visited.add(part.id);
      const seen = newItems(part);
      if (seen.length) onSeen(seen);
    }
    renderPreview();
    const names = [['gender', look.gender], ['skin', look.skin]].map(([slot, id]) => lookItem(slot, id)?.name)
      .concat(LOOK_PARTS.map(entry => partName(look, entry)));
    preview.setAttribute('aria-label', 'Your rider: ' + names.join(', '));
    for (const tab of tabButtons) {
      const entry = LOOK_PARTS.find(candidate => candidate.id === tab.dataset.lookPart);
      tab.setAttribute('aria-selected', String(entry === part));
      tab.querySelector('.look-tab-new').hidden = visited.has(entry.id) || !newItems(entry).length;
    }
    renderStyles(styles, part.style);
    // Beards only for riders who can grow one.
    const extra = part.extra === 'beard' && !lookItem('gender', look.gender)?.face.beard ? null : part.extra;
    extras.section.hidden = !extra;
    if (extra) renderStyles(extras, extra);
    renderColors(colors, part.color, part.style, isColorless(look, part));
    // An extra with colours of its own has them under it, and the part's colours under the part's styles.
    extraColors.section.hidden = !part.extraColor;
    if (part.extraColor) {
      renderColors(extraColors, part.extraColor, part.extra, Boolean(lookItem(part.extra, look[part.extra])?.colorless));
      root.insertBefore(colors.section, extras.section);
    } else root.insertBefore(colors.section, extraColors.section);
    // Only there once something has changed.
    undo.hidden = redo.hidden = !past.length && !future.length;
    undo.disabled = !past.length;
    redo.disabled = !future.length;
  }

  return {
    /** Shows `nextLook` without reporting a change, e.g. when the view opens. */
    setLook(nextLook, { tab = null } = {}) {
      look = normalizeLook(nextLook, { owns });
      past = [];
      future = [];
      if (tab) part = LOOK_PARTS.find(entry => entry.id === tab) ?? part;
      visited.clear();
      render();
    },
    look: () => ({ ...look }),
    /** Where the host adds its own buttons, after Random, Undo and Redo. */
    actions,
    refresh: render
  };
}

/**
 * The first step of creating a rider: gender and skin tone, picked once.
 * Skin swatches are the rider's bare head in that tone, with their gender's
 * starter hair.
 * @param {HTMLElement} root  emptied and filled with the picker
 * @param {PaintHooks & { onChange?: (identity: { gender: string, skin: string }) => void }} hooks
 */
export function createIdentityPicker(root, { paint, previewKey, onChange = () => {} }) {
  let identity = { gender: DEFAULT_LOOK.gender, skin: DEFAULT_LOOK.skin };
  root.classList.add('look-identity');

  const genderSection = element('section', 'look-section');
  const genderHead = sectionHead();
  genderHead.title.textContent = 'GENDER';
  const genders = element('div', 'look-genders');
  genders.setAttribute('role', 'radiogroup');
  genders.setAttribute('aria-label', 'Gender');
  genderSection.append(genderHead.head, genders);

  const skinSection = element('section', 'look-section');
  const skinHead = sectionHead();
  skinHead.title.textContent = 'SKIN TONE';
  const skinDetail = element('div', 'look-detail');
  const skinName = element('b');
  const skinBlurb = element('small');
  skinDetail.append(skinName, skinBlurb);
  const skins = element('div', 'look-options look-skins');
  skins.setAttribute('role', 'radiogroup');
  skins.setAttribute('aria-label', 'Skin tone');
  skinSection.append(skinHead.head, skinDetail, skins);

  root.replaceChildren(genderSection, skinSection);

  function set(next) {
    identity = { ...identity, ...next };
    render();
    onChange({ ...identity });
  }

  function render() {
    genders.replaceChildren(...itemsForSlot('gender').map(item => {
      const option = radio('look-gender', identity.gender === item.id, item.name);
      option.append(icon(item.id), element('b', '', item.name.toUpperCase()));
      option.addEventListener('click', () => set({ gender: item.id }));
      return option;
    }));
    const skin = lookItem('skin', identity.skin);
    skinHead.note.textContent = '';
    skinName.textContent = skin?.name.toUpperCase() ?? '';
    skinBlurb.textContent = skin?.blurb ?? '';
    skins.replaceChildren(...itemsForSlot('skin').map(item => {
      const option = radio('look-option', identity.skin === item.id, item.name);
      const swatch = element('canvas');
      swatch.setAttribute('aria-hidden', 'true');
      const shown = { ...starterLook(identity.gender, item.id), helmet: 'none' };
      paint(swatch, previewKey('look', 'head', lookKey(shown)), image => drawLook(image, shown, 'head'));
      option.append(swatch, element('small', '', item.name));
      option.addEventListener('click', () => set({ skin: item.id }));
      return option;
    }));
  }

  return {
    /** Shows `next` without reporting a change, e.g. when the form opens. */
    setIdentity(next) {
      identity = { gender: next.gender, skin: next.skin };
      render();
    },
    identity: () => ({ ...identity }),
    refresh: render
  };
}
