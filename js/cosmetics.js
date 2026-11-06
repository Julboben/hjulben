// Rider looks: who the rider is and what they wear and ride. Shared by the
// game, the editor and the server, so it stays free of the DOM.
//
// A look is one item id per slot. Gender and skin are the rider's identity:
// they are picked once, when the rider is created. Every other part is a style
// plus a colour, each its own slot, so a colour can be won on its own later.
// Item ids are stored in saves, runs and ghosts, so they are never renamed or
// reused: retire an item with `hidden: true` instead. Items are everyone's
// from the start unless js/unlocks.js has a rule that wins them, so new
// rewards don't change what a look is.
import { lookUnlock, unlockStatus } from './unlocks.js';

export const LOOK_SLOTS = /** @type {const} */ ([
  'gender', 'skin',
  'hair', 'hairColor', 'beard', 'helmet', 'helmetColor', 'outfit', 'outfitColor', 'bike', 'bikeColor',
  'faceWear', 'faceWearColor', 'trail', 'trailColor'
]);

/** Slots chosen once, when a rider is created, and kept for good. */
export const IDENTITY_SLOTS = /** @type {const} */ (['gender', 'skin']);

/**
 * The parts a rider can change in the Garage, in tab order: a style slot, its
 * colour slot, and the pixel icon (icons/pixel-icons.mjs) for its tab, which
 * is named after the style slot unless it has a `tab` of its own. An `extra`
 * slot gets a section of its own on the tab, in the part's colour unless it
 * has an `extraColor` slot too.
 */
export const LOOK_PARTS = Object.freeze([
  // A beard is picked on the hair tab, under the cut, and takes the hair colour.
  { id: 'hair', style: 'hair', color: 'hairColor', extra: 'beard', icon: 'hair', blurb: 'Cut' },
  { id: 'helmet', style: 'helmet', color: 'helmetColor', icon: 'helmet', blurb: 'Protection' },
  { id: 'outfit', style: 'outfit', color: 'outfitColor', icon: 'jacket', blurb: 'Gear' },
  { id: 'bike', style: 'bike', color: 'bikeColor', icon: 'bike', blurb: 'Machine' },
  // Something on the face, and something trailing behind, each in its own colour.
  {
    id: 'extras', style: 'faceWear', color: 'faceWearColor', extra: 'trail', extraColor: 'trailColor',
    icon: 'glasses', blurb: 'Extras', tab: 'Extras'
  },
].map(part => Object.freeze(part)));

export const SLOT_LABELS = Object.freeze({
  gender: 'Gender', skin: 'Skin tone',
  hair: 'Hair', hairColor: 'Hair colour', beard: 'Beard',
  helmet: 'Helmet', helmetColor: 'Helmet colour',
  outfit: 'Outfit', outfitColor: 'Outfit colour',
  bike: 'Bike', bikeColor: 'Bike colour',
  faceWear: 'Face', faceWearColor: 'Face colour', trail: 'Trailing', trailColor: 'Trailing colour',
});

/**
 * The art set the look is drawn with. Looks only describe roles and shapes, so
 * a new rider and bike art set can map them its own way without changing the
 * catalog or any save.
 */
export const LOOK_ART = 'pocket';

/**
 * @typedef {{
 *   gender: string, skin: string,
 *   hair: string, hairColor: string, beard: string, helmet: string, helmetColor: string,
 *   outfit: string, outfitColor: string, bike: string, bikeColor: string,
 *   faceWear: string, faceWearColor: string, trail: string, trailColor: string
 * }} Look
 * @typedef {{
 *   id: string, slot: string, name: string,
 *   hidden?: boolean, secret?: boolean, colorless?: boolean, lean?: string, blurb?: string, chip?: string[],
 *   [key: string]: any
 * }} LookItem
 */

// Skin: the face, its highlight and shadow, a plain mouth and a rosier one.
const skin = (id, name, [skin, skinLight, skinShade], mouth, lips, blurb) =>
  ({ id, slot: 'skin', name, blurb, chip: [skinLight, skin], colors: { skin, skinLight, skinShade, mouth, lips } });

// Hair colour: the cap, its highlight and shadow, and the ponytail's outline.
const hairColor = (id, name, [hair, hairLight, hairShade, hairDark], lean) =>
  ({ id, slot: 'hairColor', name, lean, chip: [hair, hairShade], colors: { hair, hairLight, hairShade, hairDark } });

// Hair cuts, as drawn by drawBareHead: `cap` covers the crown ('short' stops
// above the ear, 'long' falls to the nape, 'buzz' is the top row only, 'bald'
// has none), `ponytail` adds the swinging tail and `extra` draws more hair
// over the head ('bun', 'buns', 'mohawk', 'afro',
// 'mane' or 'mullet'; see HAIR_EXTRAS in drawing.js).
const hairStyle = (id, name, style, blurb, extra = {}) =>
  ({ id, slot: 'hair', name, blurb, style, shape: id, ...extra });

// Beards, as drawn by drawBareHead (see BEARDS in drawing.js), in the hair
// colour. Only riders whose gender item has `face.beard` can grow one.
const beard = (id, name, blurb) => ({ id, slot: 'beard', name, blurb, shape: id, lean: 'male' });

const helmetColor = (id, name, [helmet, helmetLight, helmetShade], stripe, visorLight, lean) =>
  ({ id, slot: 'helmetColor', name, lean, chip: [helmet, helmetShade], colors: { helmet, helmetLight, helmetShade, stripe, visor: '#234844', visorLight } });

// Outfits: what goes with the jacket, from the gloves down, drawn by the
// outfit style of the same `shape` (OUTFIT_STYLES in drawing.js). `colors`
// fills or overrides the outfit colour's keys, `match` copies one key from
// another once they are merged (trousers the colour of the jacket, say),
// and `accessory` adds a piece that trails behind the rider (a cape, a
// scarf) in the outfit colour's panel.
const outfit = (id, name, shape, blurb, colors, extra = {}) =>
  ({ id, slot: 'outfit', name, shape, blurb, colors, ...extra });

// Outfit colour: the jacket, and the panel that trims it.
const outfitColor = (id, name, [jacket, jacketLight, jacketShade], panel, lean) =>
  ({ id, slot: 'outfitColor', name, lean, chip: [jacket, panel], colors: { jacket, jacketLight, jacketShade, panel } });

// Extras. Face wear is drawn over the bare head by drawFaceWear in
// drawing.js, so a full-face helmet hides it; a trail streams behind the
// rider (ACCESSORIES in rider-hair.js), and an outfit's own cape or scarf
// wins over it. Each `shape` is drawn in its own colour slot.
const faceWear = (id, name, blurb, extra = {}) => ({ id, slot: 'faceWear', name, blurb, shape: id, ...extra });
const trail = (id, name, blurb, extra = {}) => ({ id, slot: 'trail', name, blurb, shape: id, ...extra });

// Extras' colours, the same choice for the face and the trail: a base, its
// highlight and its shadow.
const EXTRA_COLORS = [
  ['black', 'Black', ['#2c3133', '#4a5154', '#1b1f20']],
  ['brown', 'Tortoiseshell', ['#7a5034', '#9a6a48', '#5a3a26']],
  ['red', 'Red', ['#c9433a', '#ec7b62', '#8f2c26']],
  ['orange', 'Fox', ['#d9783a', '#f2a066', '#9c4f24']],
  ['gold', 'Gold', ['#e0b040', '#f7d878', '#a8822a']],
  ['white', 'White', ['#e8e5d9', '#fff8e7', '#b5bcae']],
  ['blue', 'Blue', ['#3f6fc0', '#7ea6e6', '#2a4c88'], 'male'],
  ['pink', 'Pink', ['#e07a9a', '#f7b0c6', '#a8506e'], 'female'],
  ['teal', 'Teal', ['#4f9a8c', '#86cfc0', '#336b61'], 'female'],
];
const extraColors = slot => EXTRA_COLORS.map(([id, name, [base, light, shade], lean]) =>
  ({ id, slot, name, lean, chip: [base, shade], colors: { base, light, shade } }));

// Bike colour: the plastics, their highlight and shadow, and the frame.
const bikeColor = (id, name, [base, light, dark], shade, lean) =>
  ({ id, slot: 'bikeColor', name, lean, chip: [base, dark], colors: { base, light, dark, shade } });

/** Every item, in the order the customizer lists them. */
export const LOOK_ITEMS = /** @type {LookItem[]} */ ([
  { id: 'female', slot: 'gender', name: 'Female', face: { lips: true, beard: false } },
  { id: 'male', slot: 'gender', name: 'Male', face: { lips: false, beard: true } },

  skin('fair', 'Fair', ['#e8b48f', '#f7d1b0', '#c48f6c'], '#b0505e', '#c94f68', 'Burns before the first checkpoint.'),
  skin('light', 'Light', ['#d99a72', '#f0bb93', '#b47454'], '#a24c4c', '#bf4e62', 'Fresh out of the garage.'),
  skin('tan', 'Tan', ['#bd7954', '#dfa078', '#9a5c40'], '#87483a', '#b0505e', 'A summer of dusty trails.'),
  skin('brown', 'Brown', ['#8f5638', '#b0714c', '#6d3f28'], '#4f2519', '#7a3040', 'Just right for the big rides.'),
  skin('deep', 'Deep', ['#5e3726', '#7e4c35', '#45271b'], '#2c140c', '#5a2232', 'Rides from dawn to dusk.'),

  hairStyle('short', 'Short', { cap: 'short', ponytail: false }, 'Neat under any helmet.', { lean: 'male' }),
  hairStyle('ponytail', 'Ponytail', { cap: 'long', ponytail: true }, 'Long hair. More wind.', { lean: 'female' }),
  hairStyle('bob', 'Bob', { cap: 'long', ponytail: false }, 'Swings on every landing.', { lean: 'female' }),
  hairStyle('buzz', 'Buzz cut', { cap: 'buzz', ponytail: false }, 'Low drag, no fuss.', { lean: 'male' }),
  hairStyle('bald', 'Bald', { cap: 'bald', ponytail: false }, 'Nothing to mess up.', { colorless: true }),
  hairStyle('man-bun', 'Man bun', { cap: 'short', ponytail: false, extra: 'bun' }, 'Tied up and out of the way.', { lean: 'male' }),
  hairStyle('space-buns', 'Space buns', { cap: 'long', ponytail: false, extra: 'buns' }, 'Two buns, twice the style.', { lean: 'female' }),
  hairStyle('mohawk', 'Mohawk', { cap: 'bald', ponytail: false, extra: 'mohawk' }, 'Built for headwinds.'),
  hairStyle('afro', 'Afro', { cap: 'bald', ponytail: false, extra: 'afro' }, 'Big hair, soft landings.'),
  hairStyle('big-curls', 'Total Eclipse', { cap: 'long', ponytail: false, extra: 'mane' }, 'Turn around, bright eyes.', { lean: 'female' }),
  hairStyle('mullet', 'Mullet', { cap: 'short', ponytail: false, extra: 'mullet' }, 'Business up front, trails out back.', { lean: 'male' }),

  beard('none', 'Clean shaven', 'Smooth as fresh tarmac.'),
  beard('stubble', 'Stubble', 'Three days on the trail.'),
  beard('moustache', 'Moustache', 'Combed for the podium.'),
  beard('goatee', 'Goatee', 'Pointy. Like a good apex.'),
  beard('full', 'Full beard', 'Catches the dust so you don\u2019t.'),
  beard('lumberjack', 'Lumberjack', 'Grown in the deep forest.'),

  hairColor('brown', 'Brown', ['#3d2a24', '#5e4334', '#2e1d19', '#1f1411'], 'male'),
  hairColor('auburn', 'Auburn', ['#684438', '#8c5d48', '#54362d', '#2e1d19'], 'female'),
  hairColor('black', 'Black', ['#2a2321', '#463c39', '#1b1615', '#0e0b0b']),
  hairColor('blonde', 'Blonde', ['#d3a347', '#f0cd7c', '#a67a30', '#5e4319'], 'female'),
  hairColor('red', 'Red', ['#b04a26', '#d8713f', '#83341a', '#4d1d0e'], 'female'),
  hairColor('grey', 'Grey', ['#9b9a95', '#c9c8c1', '#727169', '#45443f']),
  hairColor('pink', 'Pink', ['#d97a9c', '#f2a6c0', '#ab5576', '#5e2a3d'], 'female'),

  { id: 'mx', slot: 'helmet', name: 'Motocross', shape: 'mx', blurb: 'Long peak, goggles, chin bar out front.' },
  { id: 'classic', slot: 'helmet', name: 'Full face', shape: 'classic', blurb: 'Tinted visor, stripe on top.' },
  // No helmet: the bare head shows while riding, and a crash has none to knock off.
  { id: 'none', slot: 'helmet', name: 'No helmet', bare: true, colorless: true, blurb: 'Wind in your hair. Mind the rocks.' },
  // Headwear over the bare head: the face shows, and it still comes off in a crash.
  { id: 'cap', slot: 'helmet', name: 'Cap', shape: 'cap', showsHead: true, blurb: 'Peak forward, eyes on the trail.' },
  { id: 'cap-back', slot: 'helmet', name: 'Backwards cap', shape: 'cap-back', showsHead: true, blurb: 'Peak back. Maximum attitude.' },
  { id: 'beanie', slot: 'helmet', name: 'Beanie', shape: 'beanie', showsHead: true, blurb: 'Warm ears on the snowy trails.' },
  { id: 'bandana', slot: 'helmet', name: 'Bandana', shape: 'bandana', showsHead: true, blurb: 'Knotted at the back, spots up front.' },
  { id: 'cowboy', slot: 'helmet', name: 'Cowboy hat', shape: 'cowboy', showsHead: true, blurb: 'Rides out of the desert at sundown.' },
  { id: 'bike', slot: 'helmet', name: 'Bike helmet', shape: 'bike', showsHead: true, blurb: 'Vented, for the Pocket Classic.' },
  { id: 'open-face', slot: 'helmet', name: 'Open face', shape: 'open-face', showsHead: true, blurb: 'Goggles up, chin in the wind.' },
  {
    id: 'viking', slot: 'helmet', name: 'Viking', shape: 'viking', showsHead: true, colorless: true,
    blurb: 'Steel and horn. Raid every trail.'
  },
  // A paper cone over the bare head, for riders caught asking for cheats. Secret:
  // the Garage only lists it once it is won.
  {
    id: 'dunce', slot: 'helmet', name: 'Dunce cap', shape: 'dunce', showsHead: true, colorless: true, secret: true,
    blurb: 'Go sit in the corner.'
  },

  helmetColor('orange', 'Orange', ['#f4a442', '#ffd078', '#bd7034'], '#fff8e7', '#83bcb6', 'male'),
  helmetColor('teal', 'Teal', ['#63aa98', '#a8dfcf', '#3c786e'], '#fff8e7', '#b0dfd4', 'female'),
  helmetColor('red', 'Red', ['#d64a3a', '#f2836a', '#9c2f26'], '#fff8e7', '#83bcb6'),
  helmetColor('blue', 'Blue', ['#3f6fc0', '#7ea6e6', '#2a4c88'], '#f4a442', '#b0dfd4', 'male'),
  helmetColor('yellow', 'Yellow', ['#f2cf3c', '#fff08a', '#b8942a'], '#263b36', '#83bcb6'),
  helmetColor('white', 'White', ['#e8e5d9', '#fff8e7', '#b5bcae'], '#3f6fc0', '#83bcb6'),
  helmetColor('black', 'Black', ['#3a4144', '#646d70', '#252a2c'], '#d64a3a', '#83bcb6', 'male'),
  helmetColor('pink', 'Pink', ['#e07a9a', '#f7b0c6', '#a8506e'], '#fff8e7', '#b0dfd4', 'female'),
  helmetColor('purple', 'Purple', ['#7b5cc0', '#a98be6', '#53398a'], '#fff8e7', '#b0dfd4', 'female'),

  outfit('street', 'Street jacket', 'jacket', 'Dark jeans, sturdy boots.',
    { trousers: '#29464e', trousersLight: '#42616a', gloves: '#304a42', boots: '#263b36', sole: '#657a70' }),
  outfit('hoodie', 'Hoodie', 'hoodie', 'Hood up at the back, joggers, trainers.',
    { trousers: '#3d4448', trousersLight: '#5d666a', gloves: '#304a42', boots: '#e8e5d9', sole: '#9aa39a' }),
  outfit('mx', 'MX kit', 'mx', 'Race jersey, panelled pants, tall boots.',
    { trousers: '#e8e5d9', trousersLight: '#fff8e7', boots: '#e8e5d9', sole: '#3a4144', buckle: '#9aa39a' },
    { match: { gloves: 'panel' } }),
  outfit('tracksuit', 'Tracksuit', 'tracksuit', 'Zipped up, stripes down the side.',
    { gloves: '#304a42', boots: '#fff8e7', sole: '#b5bcae' },
    { match: { trousers: 'jacket', trousersLight: 'jacketLight' } }),
  outfit('dungarees', 'Dungarees', 'dungarees', 'Denim bib over a work shirt, and wellies.',
    { trousers: '#4a6f9a', trousersLight: '#6f93bd', denim: '#4a6f9a', denimLight: '#6f93bd', denimShade: '#344f70',
      gloves: '#304a42', boots: '#3f6b3a', sole: '#2c4a29' }),
  outfit('flannel', 'Flannel', 'flannel', 'Checked shirt, cargo shorts, long socks.',
    { trousers: '#8a7a52', trousersLight: '#a8976a', socks: '#e8e5d9', gloves: '#6b4a32', boots: '#6b4a32', sole: '#3a2a1e' }),
  outfit('western', 'Western', 'western', 'Fringed jacket, leather chaps, heeled boots.',
    { trousers: '#7a5034', trousersLight: '#9a6a48', gloves: '#7a5034', boots: '#6b4128', sole: '#3a2418' }),
  outfit('wetsuit', 'Wetsuit', 'wetsuit', 'Zipped at the back. Ready for the jetty.',
    { rubber: '#2c3133', rubberLight: '#4a5154', trousers: '#2c3133', trousersLight: '#4a5154',
      gloves: '#2c3133', boots: '#2c3133', sole: '#1b1f20' }),
  outfit('coveralls', 'Coveralls', 'coveralls', 'One piece, reflective bands, steel toes.',
    { reflect: '#dfe6e0', gloves: '#c9a24a', boots: '#3a2e26', sole: '#1f1915' },
    { match: { trousers: 'jacket', trousersLight: 'jacketLight' } }),
  outfit('leathers', 'Racing leathers', 'leathers', 'One-piece suit, back hump, knee sliders.',
    { gloves: '#2c3133', boots: '#2c3133', sole: '#646d70' },
    { match: { trousers: 'jacket', trousersLight: 'jacketLight' } }),
  outfit('puffer', 'Puffer', 'puffer', 'Quilted jacket, snow boots, a long scarf.',
    { trousers: '#3a4144', trousersLight: '#5d6468', gloves: '#3a4144', boots: '#6b4a32', fur: '#e8e5d9', sole: '#2c3133' },
    { accessory: 'scarf' }),
  outfit('superhero', 'Superhero', 'superhero', 'Emblem on the chest, cape in the wind.',
    { sole: '#263b36' },
    { match: { trousers: 'jacket', trousersLight: 'jacketLight', gloves: 'panel', boots: 'panel' }, accessory: 'cape' }),
  outfit('dummy', 'Crash test dummy', 'dummy', 'Built to take the hits.',
    { jacket: '#f2cf3c', jacketLight: '#fff08a', jacketShade: '#b8942a', panel: '#263b36',
      trousers: '#f2cf3c', trousersLight: '#fff08a', gloves: '#263b36', boots: '#263b36', sole: '#3a4144' },
    { colorless: true }),
  outfit('tuxedo', 'Tuxedo', 'tuxedo', 'Dressed for the podium.',
    { jacket: '#2c3034', jacketLight: '#4a5056', jacketShade: '#1d2023', panel: '#fff8e7', bow: '#1d2023',
      trousers: '#2c3034', trousersLight: '#4a5056', gloves: '#fff8e7', boots: '#1d2023', sole: '#4a5056' },
    { colorless: true }),
  outfit('prisoner', 'Prison stripes', 'prisoner', 'Doing time on every trail.',
    { jacket: '#e8e5d9', jacketLight: '#fff8e7', jacketShade: '#b5bcae', panel: '#2c3133',
      trousers: '#e8e5d9', trousersLight: '#fff8e7', gloves: '#b5bcae', boots: '#2c3133', sole: '#646d70' },
    { colorless: true, secret: true }),
  outfit('nisse', 'Nisse suit', 'nisse', 'Red wool, white trim, and a belt for the porridge.',
    { jacket: '#c9433a', jacketLight: '#ec7b62', jacketShade: '#8f2c26', panel: '#fff8e7', belt: '#263b36', buckle: '#f2cf3c',
      trousers: '#c9433a', trousersLight: '#ec7b62', gloves: '#263b36', boots: '#263b36', sole: '#3a4144' },
    { colorless: true }),
  outfit('viking', 'Viking furs', 'viking', 'Fur collar, wrapped legs. Raid in comfort.',
    { jacket: '#7a5a3a', jacketLight: '#9a7a52', jacketShade: '#5a4029', panel: '#d9c8a5', furShade: '#a8956d',
      trousers: '#5d6450', trousersLight: '#7a826a', wrap: '#8a6a48', belt: '#3a2a1e', buckle: '#b5bcae',
      gloves: '#5a4029', boots: '#a8956d', sole: '#5a4029' },
    { colorless: true }),

  outfitColor('white', 'White', ['#e8e5d9', '#fff8e7', '#b5bcae'], '#29464e', 'male'),
  outfitColor('pink', 'Pink', ['#d86f82', '#ef9aa8', '#a94f69'], '#59415c', 'female'),
  outfitColor('green', 'Green', ['#4f9a48', '#8fd16e', '#33692f'], '#263b36'),
  outfitColor('red', 'Red', ['#c9433a', '#ec7b62', '#8f2c26'], '#f4e9d0'),
  outfitColor('blue', 'Blue', ['#4b6fa5', '#7d9fd0', '#334e78'], '#f2b24a', 'male'),
  outfitColor('black', 'Black', ['#35393c', '#5d6468', '#202325'], '#c9433a', 'male'),
  outfitColor('yellow', 'Hi-vis', ['#f2cf3c', '#fff08a', '#b8942a'], '#3d4a4f'),
  outfitColor('orange', 'Orange', ['#e8823a', '#f7ae6a', '#b45a24'], '#263b36'),
  outfitColor('purple', 'Purple', ['#7b5cc0', '#a98be6', '#53398a'], '#f4e9d0', 'female'),
  outfitColor('teal', 'Teal', ['#4f9a8c', '#86cfc0', '#336b61'], '#f4e9d0', 'female'),

  // Bikes only change the art: every model shares the seat, pegs and bars.
  { id: 'elasto', slot: 'bike', name: 'Elasto', model: 'elasto', shape: 'elasto', blurb: 'Long-travel trials bike.' },
  { id: 'classic', slot: 'bike', name: 'Pocket Classic', model: 'classic', shape: 'classic', blurb: 'The original. Still rides.' },
  { id: 'scrambler', slot: 'bike', name: 'Scrambler', model: 'scrambler', shape: 'scrambler', blurb: 'Gold clutch, chrome pipe, ducktail seat.' },

  bikeColor('green', 'Green', ['#3aa63c', '#8fdc6e', '#1f6b2c'], '#2e8a34'),
  bikeColor('orange', 'Orange', ['#ee6f3f', '#f39a63', '#a8461f'], '#d95832'),
  bikeColor('red', 'Red', ['#d63b2c', '#f0705c', '#8f2219'], '#b52f22', 'male'),
  bikeColor('blue', 'Blue', ['#3f6fc0', '#7ea6e6', '#2a4c88'], '#335da6', 'male'),
  bikeColor('yellow', 'Yellow', ['#f2cf3c', '#fff08a', '#b8942a'], '#d9b030'),
  bikeColor('white', 'White', ['#e8e5d9', '#fff8e7', '#9aa39a'], '#c8c9bd'),
  bikeColor('black', 'Black', ['#3a4144', '#646d70', '#1b2124'], '#2c3234', 'male'),
  bikeColor('pink', 'Pink', ['#e07a9a', '#f7b0c6', '#a8506e'], '#c8607f', 'female'),
  bikeColor('purple', 'Purple', ['#7b5cc0', '#a98be6', '#53398a'], '#674aa6', 'female'),

  faceWear('none', 'Nothing', 'Just your face.', { colorless: true }),
  faceWear('glasses', 'Glasses', 'See every rock coming.'),
  faceWear('sunglasses', 'Sunglasses', 'Too cool for the desert glare.'),
  faceWear('ski-goggles', 'Ski goggles', 'Orange lenses for the white-out.'),
  faceWear('bandana', 'Bandana mask', 'Keeps the dust out. Looks like trouble.'),
  faceWear('monocle', 'Monocle', 'On a chain, naturally.'),
  faceWear('3d-glasses', '3D glasses', 'The jumps really pop.', { colorless: true }),
  faceWear('headphones', 'Headphones', 'Your own soundtrack.'),
  faceWear('snorkel', 'Snorkel', 'For the deep end.'),
  faceWear('clown-nose', 'Clown nose', 'Honk.', { colorless: true }),
  faceWear('eyepatch', 'Eye patch', 'Arr. Half the view, twice the nerve.', { secret: true }),
  ...extraColors('faceWearColor'),

  trail('none', 'Nothing', 'Nothing streaming behind.', { colorless: true }),
  trail('scarf', 'Scarf', 'Streams out behind you on the fast bits.'),
  trail('ribbon', 'Ribbon', 'A long streamer from the shoulder.'),
  trail('balloon', 'Balloon', 'Tied to your back. It wants to go up.'),
  trail('corgi-tail', 'Corgi tail', "Bushy, with a white tip, just like Coda's."),
  ...extraColors('trailColor'),
].map(item => Object.freeze(item)));

const ITEMS_BY_ID = new Map(LOOK_ITEMS.map(item => [`${item.slot}:${item.id}`, item]));

/** @returns {LookItem | null} */
export const lookItem = (slot, id) => ITEMS_BY_ID.get(`${slot}:${id}`) ?? null;

/** The items the customizer offers for `slot`, in order. */
export const itemsForSlot = slot => LOOK_ITEMS.filter(item => item.slot === slot && !item.hidden);

/** The items the customizer shows for `slot`: secret ones only once the rider `owns` them. */
export const shownItemsForSlot = (slot, owns) =>
  itemsForSlot(slot).filter(item => !item.secret || owns(slot, item.id));

/** Whether every rider has this item from the start. */
export const isDefaultItem = (slot, id) => Boolean(lookItem(slot, id)) && !lookUnlock(slot, id);

/**
 * The `owns` check for a career with `progress`: the items it has unlocked.
 * Without a career (null), only default items are open.
 * @param {import('./unlocks.js').UnlockProgress | null} progress
 */
export const ownsWith = progress => (slot, id) =>
  Boolean(lookItem(slot, id)) && unlockStatus(lookUnlock(slot, id), progress).open;

/**
 * The items a career has won between two snapshots of its progress (see
 * progressOf in state.js): what a finished trail or an achievement unlocked.
 * @param {import('./unlocks.js').UnlockProgress} before
 * @param {import('./unlocks.js').UnlockProgress} after
 */
export const newlyUnlockedItems = (before, after) => LOOK_ITEMS.filter(item => {
  const rule = lookUnlock(item.slot, item.id);
  return rule && !unlockStatus(rule, before).open && unlockStatus(rule, after).open;
});

/** How the game announces a won item: its name, a line about it and its part's icon. */
export function gearCard(item) {
  const part = LOOK_PARTS.find(entry => [entry.style, entry.color, entry.extra, entry.extraColor].includes(item.slot));
  return {
    name: item.name,
    blurb: item.blurb ?? `New ${SLOT_LABELS[item.slot].toLowerCase()} in the Garage.`,
    icon: part?.icon ?? 'garage',
  };
}

/** Any item in the catalog: for looks already worn in a save, run or ghost. */
const anyItem = (slot, id) => Boolean(lookItem(slot, id));

/** Each gender's first look: what a new rider starts from, before any change. */
export const STARTER_LOOKS = Object.freeze({
  female: Object.freeze({
    gender: 'female', skin: 'light',
    hair: 'ponytail', hairColor: 'auburn', beard: 'none', helmet: 'mx', helmetColor: 'teal',
    outfit: 'street', outfitColor: 'pink', bike: 'elasto', bikeColor: 'green',
    faceWear: 'none', faceWearColor: 'black', trail: 'none', trailColor: 'red'
  }),
  male: Object.freeze({
    gender: 'male', skin: 'light',
    hair: 'short', hairColor: 'brown', beard: 'none', helmet: 'mx', helmetColor: 'orange',
    outfit: 'street', outfitColor: 'white', bike: 'elasto', bikeColor: 'green',
    faceWear: 'none', faceWearColor: 'black', trail: 'none', trailColor: 'red'
  }),
});

/** The look a rider gets when nothing else is known. */
export const DEFAULT_LOOK = /** @type {Look} */ (STARTER_LOOKS.male);

/** A new rider's look: their gender's starter look in their skin tone. */
export const starterLook = (gender, skin = DEFAULT_LOOK.skin) =>
  /** @type {Look} */ ({ ...(STARTER_LOOKS[gender] ?? DEFAULT_LOOK), skin: lookItem('skin', skin) ? skin : DEFAULT_LOOK.skin });

// The two riders from before looks existed, item for item.
const LEGACY_LOOKS = {
  male: Object.freeze({ ...STARTER_LOOKS.male, skin: 'tan' }),
  female: Object.freeze({ ...STARTER_LOOKS.female, skin: 'tan' }),
};

/** The look of a rider saved as 'male' or 'female' before looks existed. */
export const legacyLook = rider => LEGACY_LOOKS[rider] ?? LEGACY_LOOKS.male;

/** 'male' or 'female', for clients and rows from before looks existed. */
export const legacyRider = look => (look?.gender === 'female' ? 'female' : 'male');

/**
 * A complete, valid look. Each slot keeps its item if it exists and the rider
 * `owns` it (any catalog item, unless given), and otherwise falls back to
 * `fallback`'s item for that slot, so a bad or retired id never breaks the
 * rest of the look.
 * @param {any} raw
 * @param {{ fallback?: Look, owns?: (slot: string, id: string) => boolean }} [options]
 * @returns {Look}
 */
export function normalizeLook(raw, { fallback = DEFAULT_LOOK, owns = anyItem } = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const look = /** @type {Look} */ ({});
  for (const slot of LOOK_SLOTS) {
    const id = source[slot];
    look[slot] = typeof id === 'string' && lookItem(slot, id) && owns(slot, id) ? id : fallback[slot];
  }
  return look;
}

/**
 * `look` with only items the rider `owns`: any other slot goes back to their
 * starter item, which every rider has.
 * @returns {Look}
 */
export function ownedLook(look, owns) {
  const valid = normalizeLook(look);
  return normalizeLook(valid, { fallback: starterLook(valid.gender, valid.skin), owns });
}

/** `next`, keeping `current`'s gender and skin: identity is never changed after creation. */
export const keepIdentity = (next, current) => {
  const look = { ...next };
  for (const slot of IDENTITY_SLOTS) look[slot] = current[slot];
  return look;
};

/**
 * The look stored with a save, run or ghost: its `look`, filling any gaps from
 * its old `rider` field, so records from before looks existed keep theirs.
 */
export const lookOf = record => normalizeLook(record?.look, { fallback: legacyLook(record?.rider) });

/** Whether `raw` names a real item in every slot, before any fallback. */
export const isCompleteLook = raw => Boolean(raw && typeof raw === 'object'
  && LOOK_SLOTS.every(slot => typeof raw[slot] === 'string' && lookItem(slot, raw[slot])));

/** A short string that is the same for equal looks, for cache keys. */
export const lookKey = look => LOOK_SLOTS.map(slot => look?.[slot] ?? '').join('.');

export const sameLook = (a, b) => lookKey(a) === lookKey(b);

/** Whether `look` grows its beard: one is picked, and its gender has `face.beard`. */
export const hasBeard = look => Boolean(lookItem('gender', look?.gender)?.face.beard)
  && Boolean(look?.beard) && look.beard !== 'none' && Boolean(lookItem('beard', look.beard));

/**
 * Whether a part has no colour to pick (bald, no helmet). A bald head with a
 * beard still has one: the beard takes the hair colour.
 */
export const isColorless = (look, part) => Boolean(lookItem(part.style, look?.[part.style])?.colorless)
  && !(part.extra === 'beard' && hasBeard(look));

/**
 * The item that hides `look`'s extra in `slot`, or null when it shows: a
 * helmet over the face hides face wear, and an outfit's own cape or scarf
 * trails instead of a trail.
 * @returns {LookItem | null}
 */
export function extraHiddenBy(look, slot) {
  const worn = lookItem(slot, look?.[slot]);
  if (!worn || worn.id === 'none') return null;
  const helmet = lookItem('helmet', look?.helmet);
  if (slot === 'faceWear' && helmet && !helmet.bare && !helmet.showsHead) return helmet;
  const outfit = lookItem('outfit', look?.outfit);
  if (slot === 'trail' && outfit?.accessory) return outfit;
  return null;
}

/** How a part reads in a list: "Auburn ponytail", "Bald", "Teal motocross", "Brown short, full beard". */
export function partName(look, part) {
  const style = lookItem(part.style, look?.[part.style]);
  const color = lookItem(part.color, look?.[part.color]);
  if (!style) return '';
  const name = style.colorless || !color ? style.name : `${color.name} ${style.name.toLowerCase()}`;
  if (part.extra === 'beard' && hasBeard(look)) return `${name}, ${lookItem('beard', look.beard).name.toLowerCase()}`;
  if (part.extraColor) {
    const extra = lookItem(part.extra, look?.[part.extra]), extraColor = lookItem(part.extraColor, look?.[part.extraColor]);
    if (extra && extra.id !== 'none') return `${name}, ${(extra.colorless || !extraColor ? extra.name : `${extraColor.name} ${extra.name}`).toLowerCase()}`;
  }
  return name;
}

/**
 * A random look from the items the rider owns, keeping `identity`'s gender and
 * skin. Items that lean towards the rider's gender come up more often, but
 * any item can be picked.
 */
export function randomLook(identity = DEFAULT_LOOK, { random = Math.random, owns = isDefaultItem } = {}) {
  const look = /** @type {Look} */ ({ ...normalizeLook(identity, { owns: () => true }) });
  const face = lookItem('gender', look.gender)?.face;
  for (const part of LOOK_PARTS) {
    for (const slot of [part.style, part.color, part.extra, part.extraColor]) {
      if (!slot) continue;
      // Only riders who can grow a beard get one; anyone else stays clean shaven.
      if (slot === 'beard' && !face?.beard) { look[slot] = 'none'; continue; }
      const items = itemsForSlot(slot).filter(item => owns(slot, item.id));
      const weights = items.map(item => (item.lean === look.gender ? 3 : 1));
      let pick = random() * weights.reduce((sum, weight) => sum + weight, 0);
      const index = weights.findIndex(weight => (pick -= weight) < 0);
      if (items.length) look[slot] = items[index < 0 ? items.length - 1 : index].id;
    }
  }
  return look;
}

/**
 * @typedef {{
 *   key: string,
 *   art: string,
 *   look: Look,
 *   palette: Record<string, string>,
 *   roles: Record<string, Record<string, string> | null>,
 *   shapes: { hair: string, beard: string, helmet: string, outfit: string, accessory: string | null, bike: string },
 *   face: { lips: boolean },
 *   hair: { cap: string, ponytail: boolean, beard: string | null, strands: string[], outline: string, shine: string },
 *   accessory: { shape: string, fill: string, light: string, shade: string, outline: string, wrap?: boolean } | null,
 *   faceWear: { shape: string, base: string, light: string, shade: string } | null,
 *   helmet: boolean,
 *   bareHead: boolean,
 *   bike: string,
 *   bikeColors: Record<string, string>
 * }} LookParts
 */

const FIXED_COLORS = { eye: '#263b36' };
// The bare head under a missing helmet: there is no shell, but the goggle
// strap and visor keys are still read by shared drawing code.
const NO_HELMET_COLORS = lookItem('helmetColor', 'orange').colors;

const OUTLINE = '#263b36';

/** `hex` moved `amount` (0 to 1) of the way to `other`, as #rrggbb. */
function mix(hex, other, amount) {
  const channel = (color, index) => parseInt(color.slice(1 + index * 2, 3 + index * 2), 16);
  return '#' + [0, 1, 2].map(index => Math.round(channel(hex, index) + (channel(other, index) - channel(hex, index)) * amount)
    .toString(16).padStart(2, '0')).join('');
}

const PARTS_CACHE_SIZE = 32;
const partsCache = new Map();

/**
 * Everything the renderer needs for a look. `roles` and `shapes` describe it
 * in art-independent terms (skin, hair, helmet shell, jersey, bike plastics),
 * for any art set. `palette` is those roles mapped onto the colour keys the
 * current rider art reads. Cached, and the same object for equal looks, so
 * sprite caches can key on it.
 * @param {any} look
 * @returns {LookParts}
 */
export function lookParts(look) {
  const key = lookKey(look);
  let parts = partsCache.get(key);
  if (parts) {
    partsCache.delete(key);
    partsCache.set(key, parts);
    return parts;
  }
  const valid = normalizeLook(look, { owns: () => true });
  const item = slot => lookItem(slot, valid[slot]);
  const face = item('gender').face;
  const skinColors = item('skin').colors;
  const hairStyleItem = item('hair'), hairColors = item('hairColor').colors;
  const helmetItem = item('helmet'), helmetColors = item('helmetColor').colors;
  const outfitItem = item('outfit');
  const outfitColors = { ...item('outfitColor').colors, ...outfitItem.colors };
  for (const [key, from] of Object.entries(outfitItem.match ?? {})) outfitColors[key] = outfitColors[from];
  const beardShape = hasBeard(valid) ? item('beard').shape : null;
  // What trails behind the rider: the outfit's own piece in its panel
  // colour, or else the look's trail in its colour.
  const trailItem = item('trail'), faceItem = item('faceWear');
  // A worn scarf also `wrap`s the neck, as an outfit's own scarf is drawn into it.
  const trailing = outfitItem.accessory ? { shape: outfitItem.accessory, fill: outfitColors.panel }
    : trailItem.id !== 'none' ? { shape: trailItem.shape, fill: item('trailColor').colors.base, wrap: trailItem.shape === 'scarf' } : null;
  const accessory = trailing ? Object.freeze({
    ...trailing, light: mix(trailing.fill, '#fff8e7', 0.3), shade: mix(trailing.fill, OUTLINE, 0.35), outline: OUTLINE
  }) : null;
  const faceWear = faceItem.id !== 'none' ? Object.freeze({ shape: faceItem.shape, ...item('faceWearColor').colors }) : null;
  const bikeColors = item('bikeColor').colors;
  const bare = Boolean(helmetItem.bare);
  const { hair, hairLight, hairShade, hairDark } = hairColors;
  parts = Object.freeze({
    key: lookKey(valid),
    art: LOOK_ART,
    look: Object.freeze(valid),
    palette: Object.freeze({
      ...FIXED_COLORS,
      ...skinColors,
      mouth: face.lips ? skinColors.lips : skinColors.mouth,
      ...hairColors,
      ...(bare ? NO_HELMET_COLORS : helmetColors),
      ...outfitColors,
    }),
    roles: Object.freeze({
      skin: { base: skinColors.skin, light: skinColors.skinLight, shade: skinColors.skinShade, mouth: face.lips ? skinColors.lips : skinColors.mouth },
      hair: { base: hair, light: hairLight, shade: hairShade, dark: hairDark },
      helmet: bare ? null : {
        shell: helmetColors.helmet, light: helmetColors.helmetLight, shade: helmetColors.helmetShade,
        stripe: helmetColors.stripe, visor: helmetColors.visor, visorLight: helmetColors.visorLight
      },
      outfit: {
        jersey: outfitColors.jacket, jerseyLight: outfitColors.jacketLight, jerseyShade: outfitColors.jacketShade,
        panel: outfitColors.panel, pants: outfitColors.trousers, pantsLight: outfitColors.trousersLight,
        gloves: outfitColors.gloves, boots: outfitColors.boots, sole: outfitColors.sole
      },
      bike: { ...bikeColors },
    }),
    shapes: Object.freeze({
      hair: hairStyleItem.shape, beard: beardShape ?? 'none', helmet: bare ? 'none' : helmetItem.shape,
      outfit: outfitItem.shape, accessory: accessory?.shape ?? null, bike: item('bike').shape
    }),
    face: Object.freeze({ ...face }),
    hair: Object.freeze({ ...hairStyleItem.style, beard: beardShape, strands: [hairShade, hairShade, hair], outline: hairDark, shine: hairLight }),
    accessory,
    faceWear,
    helmet: !bare,
    // Whether the face and hair show, with no helmet or under one that leaves them.
    bareHead: bare || Boolean(helmetItem.showsHead),
    bike: item('bike').model,
    bikeColors: Object.freeze({ ...bikeColors }),
  });
  partsCache.set(key, parts);
  if (partsCache.size > PARTS_CACHE_SIZE) partsCache.delete(partsCache.keys().next().value);
  return parts;
}
