// Rider looks: the catalog, legacy riders, how looks are cleaned, gender and
// skin staying fixed after creation, saves migrating from 'male'/'female', and
// riding without a helmet.
import assert from 'node:assert/strict';
import {
  LOOK_SLOTS, IDENTITY_SLOTS, LOOK_PARTS, SLOT_LABELS, LOOK_ITEMS, DEFAULT_LOOK, STARTER_LOOKS, lookItem, itemsForSlot,
  isDefaultItem, starterLook, legacyLook, legacyRider, normalizeLook, keepIdentity, lookOf, isCompleteLook, lookKey,
  sameLook, isColorless, partName, randomLook, lookParts, ownsWith, ownedLook, shownItemsForSlot, newlyUnlockedItems, gearCard,
  extraHiddenBy
} from '../js/cosmetics.js';
import { hasTrailArt, hairRoot } from '../js/rider-hair.js';
import { lookUnlock } from '../js/unlocks.js';
import { readFileSync } from 'node:fs';
import { BIKE_MODELS, createGameArt, drawBareHead, hasBeardArt, hasFaceWearArt, hasOutfitStyle, isHeadwear } from '../js/drawing.js';
import { BIKE_LAMPS, riderSeatedPose } from '../js/bike-lamps.js';
import { createRagdoll } from '../js/ragdoll.js';

let seed = 7;
const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// --- Catalog ---------------------------------------------------------------------

{
  const ids = new Set();
  for (const item of LOOK_ITEMS) {
    assert.ok(LOOK_SLOTS.includes(item.slot), `${item.id} is in a known slot`);
    assert.match(item.id, /^[a-z0-9-]+$/, `${item.slot}:${item.id} is a plain id`);
    assert.ok(!ids.has(item.slot + ':' + item.id), `${item.slot}:${item.id} is listed once`);
    ids.add(item.slot + ':' + item.id);
    assert.ok(item.name, `${item.id} has a name`);
    assert.ok(Object.isFrozen(item), `${item.id} is frozen`);
    assert.equal(isDefaultItem(item.slot, item.id), !lookUnlock(item.slot, item.id), `${item.id} is default unless a rule wins it`);
    assert.equal(lookItem(item.slot, item.id), item);
  }
  for (const slot of LOOK_SLOTS) {
    assert.ok(itemsForSlot(slot).length >= 2, `${slot} has a choice`);
    assert.ok(SLOT_LABELS[slot], `${slot} has a label`);
    for (const look of Object.values(STARTER_LOOKS)) assert.ok(isDefaultItem(slot, look[slot]), `the starter ${slot} is everyone's`);
  }
  // Every tab is a style plus its colour (and maybe an extra style, like the
  // beard, with maybe its own colour), and together with identity they cover every slot.
  const covered = new Set(IDENTITY_SLOTS);
  for (const part of LOOK_PARTS) {
    assert.ok(LOOK_SLOTS.includes(part.style) && LOOK_SLOTS.includes(part.color), `${part.id} is made of slots`);
    covered.add(part.style).add(part.color);
    if (part.extra) assert.ok(LOOK_SLOTS.includes(part.extra), `${part.id}'s extra is a slot`), covered.add(part.extra);
    if (part.extraColor) assert.ok(LOOK_SLOTS.includes(part.extraColor), `${part.id}'s extra colour is a slot`), covered.add(part.extraColor);
  }
  assert.deepEqual([...covered].sort(), [...LOOK_SLOTS].sort());
  for (const slot of [...LOOK_PARTS.flatMap(part => [part.color, part.extraColor]).filter(Boolean), 'skin']) {
    for (const item of itemsForSlot(slot)) assert.equal(item.chip?.length, 2, `${slot}:${item.id} has a colour chip`);
  }
  assert.ok(lookItem('helmet', 'none')?.colorless, 'riding without a helmet is an option, with no colour');
  assert.ok(lookItem('hair', 'bald')?.colorless);
  assert.equal(lookItem('gender', 'female').face.lips, true);
  for (const item of itemsForSlot('bike')) assert.ok(BIKE_MODELS.includes(item.model), `bike ${item.id} has a model`);
  // Every outfit has art, and every one but the starter's is won rather than given.
  for (const item of itemsForSlot('outfit')) {
    assert.ok(hasOutfitStyle(item.shape), `outfit ${item.id} has art`);
    if (item.id !== 'mx') assert.ok(lookUnlock('outfit', item.id), `outfit ${item.id} is won`);
  }
  // Beards: everyone's, drawn, only grown where the gender allows, and in the hair colour.
  for (const item of itemsForSlot('beard')) {
    assert.ok(isDefaultItem('beard', item.id), `beard ${item.id} is everyone's`);
    assert.ok(item.id === 'none' || hasBeardArt(item.shape), `beard ${item.id} has art`);
  }
  assert.equal(lookParts({ ...STARTER_LOOKS.male, beard: 'full' }).hair.beard, 'full');
  assert.equal(lookParts({ ...STARTER_LOOKS.female, beard: 'full' }).hair.beard, null, 'no beard without face.beard');
  assert.equal(lookParts(STARTER_LOOKS.male).hair.beard, null);
  const bald = LOOK_PARTS.find(part => part.id === 'hair');
  assert.ok(isColorless({ ...STARTER_LOOKS.male, hair: 'bald' }, bald));
  assert.ok(!isColorless({ ...STARTER_LOOKS.male, hair: 'bald', beard: 'goatee' }, bald), 'a beard keeps the hair colour');
  assert.equal(partName({ ...STARTER_LOOKS.male, beard: 'goatee' }, bald), 'Brown short, goatee');
  // Outfits that match one colour to another, and accessories in the panel colour.
  const suit = lookParts({ ...STARTER_LOOKS.male, outfit: 'superhero', outfitColor: 'blue' });
  assert.equal(suit.palette.trousers, suit.palette.jacket);
  assert.equal(suit.accessory.shape, 'cape');
  assert.equal(suit.accessory.fill, suit.palette.panel);
  assert.equal(lookParts(STARTER_LOOKS.male).accessory, null);
  // Underwear is bare skin in the rider's own colour, with briefs in the outfit colour.
  const bare = lookParts({ ...STARTER_LOOKS.male, skin: 'deep', outfit: 'underwear', outfitColor: 'blue' }).palette;
  const deep = lookItem('skin', 'deep').colors, blue = lookItem('outfitColor', 'blue').colors;
  for (const key of ['jacket', 'gloves', 'boots']) assert.equal(bare[key], deep.skin, `underwear ${key} is skin`);
  assert.equal(bare.trousers, blue.jacket, 'the briefs are the trousers, in the outfit colour');
  // Every helmet has art: a shell, or headwear drawn over the bare head, which shows under it.
  for (const item of LOOK_ITEMS.filter(item => item.slot === 'helmet' && !item.bare)) {
    assert.ok(['classic', 'mx'].includes(item.shape) || isHeadwear(item.shape), `helmet ${item.id} has art`);
    assert.equal(Boolean(item.showsHead), isHeadwear(item.shape), `helmet ${item.id} shows the head only if it is headwear`);
  }
  // Every bike model has a headlight and tail light for the lights to shine from.
  for (const model of BIKE_MODELS) {
    const lamps = BIKE_LAMPS[model];
    assert.ok(lamps?.head && lamps?.tail, `bike model ${model} has lamps`);
    assert.ok(lamps.head.rows.some(row => row.includes('h')), `bike model ${model} has a headlight lens`);
    assert.ok(lamps.tail.rows.some(row => /[tT]/.test(row)), `bike model ${model} has a tail-light lens`);
  }
  assert.equal(lookItem('helmet', 'missing'), null);

  // Every colour key the rider and bike art read is set for every item.
  const base = lookParts(DEFAULT_LOOK);
  const keys = Object.keys(base.palette), bikeKeys = Object.keys(base.bikeColors);
  for (const slot of LOOK_SLOTS) {
    for (const item of itemsForSlot(slot)) {
      for (const gender of ['male', 'female']) {
        const parts = lookParts({ ...starterLook(gender), [slot]: item.id });
        for (const key of keys) assert.match(parts.palette[key], /^#[0-9a-f]{6}$/i, `${slot}:${item.id} sets ${key}`);
        for (const key of bikeKeys) assert.match(parts.bikeColors[key], /^#[0-9a-f]{6}$/i, `${slot}:${item.id} sets bike ${key}`);
        assert.equal(parts.hair.strands.length, 3);
        assert.equal(parts.art, 'pocket');
      }
    }
  }
}

// --- Legacy riders ---------------------------------------------------------------

{
  // The palettes from before looks existed: the legacy looks must draw the
  // same riders, except that both now wear the one outfit's trousers, gloves
  // and boots.
  const OLD = {
    male: {
      jacket: '#e8e5d9', jacketLight: '#fff8e7', jacketShade: '#b5bcae', panel: '#29464e', trousers: '#29464e',
      trousersLight: '#42616a', helmet: '#f4a442', helmetLight: '#ffd078', helmetShade: '#bd7034', stripe: '#fff8e7',
      skin: '#bd7954', skinLight: '#dfa078', gloves: '#304a42', boots: '#263b36', sole: '#657a70', visor: '#234844',
      visorLight: '#83bcb6', skinShade: '#9a5c40', hair: '#3d2a24', hairLight: '#5e4334', hairShade: '#2e1d19',
      eye: '#263b36', mouth: '#87483a',
    },
    female: {
      jacket: '#d86f82', jacketLight: '#ef9aa8', jacketShade: '#a94f69', panel: '#59415c', trousers: '#29464e',
      trousersLight: '#42616a', helmet: '#63aa98', helmetLight: '#a8dfcf', helmetShade: '#3c786e', stripe: '#fff8e7',
      skin: '#bd7954', skinLight: '#dfa078', gloves: '#304a42', boots: '#263b36', sole: '#657a70', visor: '#234844',
      visorLight: '#b0dfd4', skinShade: '#9a5c40', hair: '#684438', hairLight: '#8c5d48', hairShade: '#54362d',
      eye: '#263b36', mouth: '#b0505e',
    },
  };
  for (const rider of ['male', 'female']) {
    const parts = lookParts(legacyLook(rider));
    for (const [key, color] of Object.entries(OLD[rider])) assert.equal(parts.palette[key], color, `${rider} ${key}`);
    assert.equal(legacyLook(rider).gender, rider);
    assert.equal(legacyRider(legacyLook(rider)), rider);
    assert.equal(parts.helmet, true);
    assert.equal(parts.bike, 'elasto');
  }
  assert.deepEqual(lookParts(legacyLook('female')).hair.strands, ['#54362d', '#54362d', '#684438'], 'the old ponytail');
  assert.equal(lookParts(legacyLook('male')).hair.ponytail, false);
  assert.deepEqual(legacyLook('robot'), legacyLook('male'));
  // Gender is who the rider is, not what they wear.
  assert.equal(legacyRider({ ...STARTER_LOOKS.male, hair: 'ponytail' }), 'male');
  assert.equal(legacyRider({ ...STARTER_LOOKS.female, hair: 'buzz' }), 'female');
}

// --- Starter looks and identity --------------------------------------------------

{
  assert.equal(DEFAULT_LOOK.skin, 'light', 'riders start light skinned');
  assert.deepEqual(DEFAULT_LOOK, STARTER_LOOKS.male);
  assert.deepEqual(starterLook('female', 'deep'), { ...STARTER_LOOKS.female, skin: 'deep' });
  assert.deepEqual(starterLook('robot', 'green'), DEFAULT_LOOK);
  assert.notDeepEqual(STARTER_LOOKS.female.hair, STARTER_LOOKS.male.hair, 'starter looks follow gender');
  assert.equal(lookParts(STARTER_LOOKS.female).face.lips, true);
  assert.equal(lookParts(STARTER_LOOKS.male).face.lips, false);
  assert.equal(lookParts(starterLook('female', 'brown')).palette.mouth, lookItem('skin', 'brown').colors.lips);

  const current = starterLook('female', 'deep');
  const next = keepIdentity({ ...STARTER_LOOKS.male, skin: 'fair', hair: 'bob' }, current);
  assert.equal(next.gender, 'female');
  assert.equal(next.skin, 'deep');
  assert.equal(next.hair, 'bob', 'everything else can change');

  // Random riders keep gender and skin, may pick anything else, and lean
  // towards the rider's gender without being limited to it.
  const female = starterLook('female', 'tan');
  const counts = { ponytail: 0, short: 0 };
  for (let index = 0; index < 400; index++) {
    const look = randomLook(female, { random });
    assert.ok(isCompleteLook(look));
    assert.equal(look.gender, 'female');
    assert.equal(look.skin, 'tan');
    if (look.hair in counts) counts[look.hair]++;
    assert.equal(look.beard, 'none', 'random riders only grow beards where the gender allows');
  }
  assert.ok(counts.ponytail > counts.short && counts.short > 0, `random hair leans female: ${JSON.stringify(counts)}`);
  const owns = (slot, id) => !(slot === 'outfitColor' && id === 'yellow');
  for (let index = 0; index < 50; index++) assert.notEqual(randomLook(female, { random, owns }).outfitColor, 'yellow');
}

// --- Unlocks --------------------------------------------------------------------

{
  // The Pocket Classic takes Career Rider; Total Eclipse, The Bonny Tyler.
  const curlsTrail = 'bonus:the-bonny-tyler';
  assert.deepEqual(lookUnlock('bike', 'classic'), { achievement: 'career-rider' });
  assert.deepEqual(lookUnlock('hair', 'big-curls'), { trail: curlsTrail });
  assert.equal(lookUnlock('helmet', 'mx'), null, 'the motocross helmet is everyone\'s');

  const progress = (golds, finished = [], earned = []) =>
    ({ trails: 0, golds, finished: id => finished.includes(id), has: id => earned.includes(id) });
  const nobody = ownsWith(null);
  assert.ok(nobody('bike', 'elasto') && !nobody('bike', 'classic'), 'won items need a career');
  const fresh = ownsWith(progress(0));
  assert.ok(fresh('bike', 'elasto') && !fresh('bike', 'classic') && !fresh('hair', 'big-curls'));
  assert.ok(!fresh('bike', 'rocket'), 'unknown items are never owned');
  assert.ok(!ownsWith(progress(37))('bike', 'classic'), 'golds alone don\'t win the Classic');
  assert.ok(!ownsWith(progress(20))('hair', 'big-curls'));
  const veteran = ownsWith(progress(8, [curlsTrail], ['career-rider']));
  assert.ok(veteran('bike', 'classic') && veteran('helmet', 'bike') && veteran('hair', 'big-curls'));

  // Each chapter's gear comes with its last trail: the cowboy hat with the desert's.
  assert.ok(!fresh('helmet', 'cowboy'));
  assert.ok(ownsWith(progress(0, ['official:mirage']))('helmet', 'cowboy'));
  assert.ok(ownsWith(progress(0, ['official:rooftops']))('bike', 'scrambler'));

  // What a step of progress won, for the game's New Gear card.
  const won = newlyUnlockedItems(progress(0), progress(0, ['official:mirage'], ['career-rider']));
  assert.deepEqual(won.map(item => `${item.slot}:${item.id}`).sort(), ['bike:classic', 'faceWear:bandana', 'helmet:bike', 'helmet:cowboy', 'outfit:western']);
  assert.deepEqual(newlyUnlockedItems(progress(0), progress(0)), [], 'nothing new, nothing announced');
  assert.deepEqual(gearCard(lookItem('helmet', 'cowboy')), { name: 'Cowboy hat', blurb: 'Rides out of the desert at sundown.', icon: 'helmet' });
  assert.deepEqual(gearCard(lookItem('outfitColor', 'yellow')), { name: 'Hi-vis', blurb: 'New outfit colour in the Garage.', icon: 'jacket' });

  // Both starter looks are everyone's: a new rider can always keep theirs.
  for (const gender of ['female', 'male']) {
    for (const [slot, id] of Object.entries(starterLook(gender))) {
      assert.ok(fresh(slot, id), `the ${gender} starter's ${slot} ${id} is open from the start`);
    }
  }

  // The dunce cap is a secret: won by asking the console for a cheat, and not
  // listed in the Garage, even locked, until then.
  assert.deepEqual(lookUnlock('helmet', 'dunce'), { achievement: 'i-saw-that' });
  const caught = ownsWith({ ...progress(0), has: id => id === 'i-saw-that' });
  assert.ok(!veteran('helmet', 'dunce') && caught('helmet', 'dunce'));
  assert.ok(!shownItemsForSlot('helmet', veteran).some(item => item.id === 'dunce'));
  assert.ok(shownItemsForSlot('helmet', caught).some(item => item.id === 'dunce'));
  assert.ok(shownItemsForSlot('hair', fresh).some(item => item.id === 'big-curls'), 'locked items that aren\'t secret still show');
  const dunce = lookParts({ ...DEFAULT_LOOK, helmet: 'dunce' });
  assert.ok(dunce.helmet && dunce.bareHead, 'the cap can be knocked off, and the head shows under it');
}

// --- Cleaning looks --------------------------------------------------------------

{
  const look = {
    gender: 'female', skin: 'deep', hair: 'bob', hairColor: 'blonde', beard: 'none', helmet: 'none', helmetColor: 'teal',
    outfit: 'street', outfitColor: 'yellow', bike: 'classic', bikeColor: 'blue',
    faceWear: 'glasses', faceWearColor: 'red', trail: 'ribbon', trailColor: 'blue'
  };
  assert.deepEqual(normalizeLook(look), look);
  // A look from before extras wears none.
  const { faceWear: _face, faceWearColor: _faceColor, trail: _trail, trailColor: _trailColor, ...older } = look;
  assert.equal(normalizeLook(older).faceWear, 'none', 'looks from before extras wear nothing on the face');
  assert.equal(normalizeLook(older).trail, 'none', 'or behind');
  assert.ok(isCompleteLook(look));
  assert.ok(!isCompleteLook({ ...look, bike: 'rocket' }));
  assert.deepEqual(normalizeLook(null), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook('tan'), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook({ ...look, helmet: 'crown', bike: 5 }), { ...look, helmet: DEFAULT_LOOK.helmet, bike: DEFAULT_LOOK.bike }, 'bad items fall back per slot');
  assert.deepEqual(normalizeLook({ skin: 'fair' }, { fallback: legacyLook('female') }), { ...legacyLook('female'), skin: 'fair' });
  // Slots never borrow ids from each other.
  assert.equal(normalizeLook({ ...look, hairColor: 'teal' }).hairColor, DEFAULT_LOOK.hairColor);
  // Items the rider doesn't own are refused.
  const owns = (slot, id) => !(slot === 'bike' && id === 'classic');
  assert.equal(normalizeLook(look, { owns }).bike, DEFAULT_LOOK.bike);
  // A worn look keeps the rider's identity and swaps locked items for their starter ones.
  const worn = ownedLook({ ...look, hair: 'big-curls' }, isDefaultItem);
  const starter = STARTER_LOOKS.female;
  assert.deepEqual(worn, { ...look, hair: starter.hair, outfit: starter.outfit, outfitColor: starter.outfitColor, bike: starter.bike });
  assert.ok(!Object.hasOwn(normalizeLook({ ...look, extra: 1 }), 'extra'));

  // Face wear shows on a bare head or under headwear; a full-face helmet
  // hides it. A trail streams behind, unless the outfit trails its own cape.
  // Each takes its own colour, and both can be worn together.
  assert.equal(extraHiddenBy(look, 'faceWear'), null);
  assert.equal(extraHiddenBy({ ...look, helmet: 'cap' }, 'faceWear'), null);
  assert.equal(extraHiddenBy({ ...look, helmet: 'mx' }, 'faceWear')?.id, 'mx');
  assert.equal(extraHiddenBy({ ...look, helmet: 'mx' }, 'trail'), null, 'a helmet leaves the trail alone');
  assert.equal(lookParts(look).faceWear?.shape, 'glasses');
  assert.equal(lookParts(look).faceWear?.base, lookItem('faceWearColor', 'red').colors.base, 'face wear takes the face colour');
  assert.equal(lookParts(look).accessory?.shape, 'ribbon');
  assert.equal(lookParts(look).accessory?.fill, lookItem('trailColor', 'blue').colors.base, 'a trail takes the trailing colour');
  const scarf = { ...look, trail: 'scarf' };
  assert.ok(lookParts(scarf).accessory?.wrap, 'a worn scarf wraps the neck');
  assert.ok(!lookParts(look).accessory?.wrap, 'a ribbon does not');
  assert.equal(extraHiddenBy({ ...scarf, outfit: 'superhero' }, 'trail')?.id, 'superhero');
  assert.equal(lookParts({ ...scarf, outfit: 'superhero' }).accessory?.shape, 'cape', 'the outfit\'s cape wins');
  assert.equal(lookParts({ ...look, faceWear: 'none', trail: 'none' }).faceWear, null);
  assert.equal(lookParts({ ...look, faceWear: 'none', trail: 'none' }).accessory, null);
  for (const item of itemsForSlot('faceWear')) {
    if (item.id !== 'none') assert.ok(hasFaceWearArt(item.shape), `${item.id} has face art`);
  }
  for (const item of itemsForSlot('trail')) {
    if (item.id !== 'none') assert.ok(hasTrailArt(item.shape), `${item.id} has a trail`);
  }

  assert.deepEqual(lookOf({ rider: 'female' }), legacyLook('female'), 'old records keep their rider');
  assert.deepEqual(lookOf({ rider: 'female', look }), look, 'a look wins over the old rider');
  assert.deepEqual(lookOf({}), legacyLook('male'));

  assert.equal(lookKey(look), 'female.deep.bob.blonde.none.none.teal.street.yellow.classic.blue.glasses.red.ribbon.blue');
  assert.ok(sameLook(look, { ...look }));
  assert.ok(!sameLook(look, DEFAULT_LOOK));
  assert.equal(lookParts(look), lookParts({ ...look }), 'equal looks share their parts');
  assert.equal(lookParts(look).helmet, false);
  assert.equal(lookParts(look).bike, lookItem('bike', 'classic').model);
  assert.deepEqual(lookParts(look).bikeColors, lookItem('bikeColor', 'blue').colors);

  const helmetPart = LOOK_PARTS.find(part => part.style === 'helmet');
  const hairPart = LOOK_PARTS.find(part => part.style === 'hair');
  assert.ok(isColorless(look, helmetPart));
  assert.ok(!isColorless(look, hairPart));
  assert.equal(partName(look, helmetPart), lookItem('helmet', 'none').name);
  assert.equal(partName(STARTER_LOOKS.female, hairPart), 'Auburn ponytail');
}

// --- Saves -----------------------------------------------------------------------

{
  const items = new Map();
  globalThis.localStorage = /** @type {any} */ ({
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: key => items.delete(key),
  });
  const playerId = '0a1b2c3d-1111-4222-8333-444455556666';
  items.set('hjulben-saves-v2', JSON.stringify([
    { rider: 'female', createdAt: 1, trail: 0, unlocked: 0, bestTimes: {}, name: 'OLDIE', playerId },
    { rider: 'robot', createdAt: 2, trail: 0, unlocked: 0, bestTimes: {}, name: 'BROKEN', playerId },
    { look: { skin: 'deep', helmet: 'none' }, createdAt: 3, trail: 0, unlocked: 0, bestTimes: {}, name: 'NEWER', playerId },
  ]));
  const storage = await import('../js/storage.js');
  const [old, broken, newer] = storage.loadSaveSlots(9);
  assert.deepEqual(old.look, legacyLook('female'), 'old saves get their rider as a look');
  assert.equal(old.rider, 'female');
  assert.equal(broken?.name, 'BROKEN', 'a save with neither a look nor a rider is repaired, not dropped');
  assert.deepEqual(broken.look, legacyLook('male'), 'and rides in the default look');
  assert.deepEqual(newer.look, { ...legacyLook('male'), skin: 'deep', helmet: 'none' }, 'a look missing slots fills them from the old rider');

  const look = { ...starterLook('male', 'fair'), hair: 'buzz', hairColor: 'red', helmet: 'none', bike: 'classic', bikeColor: 'blue' };
  storage.deleteSave(1, 9);
  const created = storage.createSave(1, look, 9, 'NEWBIE');
  assert.deepEqual(created.look, { ...look, bike: STARTER_LOOKS.male.bike }, 'a new rider has won nothing yet');
  assert.equal(created.rider, 'male');

  const everything = () => true;
  const restyled = { ...look, hair: 'ponytail', outfitColor: 'pink' };
  assert.equal(storage.saveLook(1, 9, restyled, isDefaultItem).look.bike, STARTER_LOOKS.male.bike, 'locked items are not saved');
  const saved = storage.saveLook(1, 9, restyled, everything);
  assert.deepEqual(saved.look, restyled);
  assert.equal(saved.rider, 'male', 'a ponytail does not change who the rider is');
  assert.deepEqual(storage.saveLook(1, 9, { ...restyled, gender: 'female', skin: 'deep' }, everything).look, restyled, 'gender and skin are fixed');
  assert.deepEqual(storage.saveLook(1, 9, { ...restyled, helmet: 'crown' }, everything).look, restyled, 'a bad item keeps the current one');
  assert.deepEqual(JSON.parse(items.get('hjulben-saves-v2'))[1].look, restyled, 'looks are written to storage');
  saved.look.hair = 'bald';
  assert.equal(storage.loadSaveSlots(9)[1].look.hair, 'ponytail', 'loaded saves are copies');

  const oldRestyled = storage.saveLook(0, 9, { ...STARTER_LOOKS.male, hair: 'bob' }, everything);
  assert.equal(oldRestyled.look.gender, 'female', 'old riders keep their gender');
  assert.equal(oldRestyled.look.skin, 'tan', 'and their skin');
  assert.equal(oldRestyled.look.hair, 'bob');
}

// --- No helmet -------------------------------------------------------------------

{
  const wheel = (x, y) => ({ x, y, ox: x - 2, oy: y, compression: 0 });
  const counted = () => {
    let calls = 0, seed = 3;
    const random = () => { calls++; return ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; };
    return { random, calls: () => calls };
  };
  const helmeted = counted(), bare = counted();
  const withHelmet = createRagdoll(wheel(0, 0), wheel(50, 0), 1, helmeted.random);
  const without = createRagdoll(wheel(0, 0), wheel(50, 0), 1, bare.random, { helmet: false });
  assert.equal(bare.calls(), helmeted.calls(), 'the same random numbers are drawn either way');
  assert.equal(without.helmetStrap, Infinity, 'there is no helmet to knock off');
  assert.ok(Number.isFinite(withHelmet.helmetStrap));
  assert.ok(without.points.head.radius < withHelmet.points.head.radius, 'a bare head is smaller');
  for (const name of Object.keys(withHelmet.points)) {
    if (name === 'head') continue;
    assert.deepEqual(without.points[name], withHelmet.points[name], `${name} is thrown the same`);
  }
}

// --- Seated pose, ragdoll alignment, ponytail root and drawing ------------------

{
  const rest = riderSeatedPose({ leanVisual: 0, drop: 0 });
  assert.deepEqual(rest.hip, [-11, -26]);
  assert.deepEqual(rest.shoulder, [-4, -36]);
  assert.deepEqual(rest.elbow, [8, -32]);
  assert.equal(rest.headDX, 0);
  assert.equal(rest.headDY, 0);

  const forward = riderSeatedPose({ leanVisual: 1, drop: 0 });
  assert.ok(forward.hip[0] <= -5 && forward.hip[1] < rest.hip[1], 'leaning forward rises off the saddle clear of the tank');
  assert.ok(forward.shoulder[1] < rest.shoulder[1] && forward.elbow[1] < rest.elbow[1], 'arms tuck above the bars when leaning forward');
  assert.ok(forward.headDX > forward.torsoDX && forward.headDY === 0, 'head reaches forward over the bars');

  const back = riderSeatedPose({ leanVisual: -1, drop: 0 });
  const hand = [16, -28];
  const armLength = Math.hypot(back.elbow[0] - back.shoulder[0], back.elbow[1] - back.shoulder[1])
    + Math.hypot(hand[0] - back.elbow[0], hand[1] - back.elbow[1]);
  assert.ok(back.hip[0] < rest.hip[0] && armLength < 27, `leaning back keeps a taut arm (${armLength.toFixed(1)})`);

  const landed = riderSeatedPose({ leanVisual: 0, drop: 15 });
  assert.ok(landed.hip[1] > rest.hip[1] && landed.shoulder[1] > rest.shoulder[1], 'heavy landings flex the rider');

  // Ragdoll joints move by the exact offsets riderSeatedPose gives drawBike.
  const rear = { x: 100, y: 200, ox: 100, oy: 200, compression: 14 };
  const front = { x: 150, y: 200, ox: 150, oy: 200, compression: 14 };
  const neutralThrow = createRagdoll(
    { ...rear, compression: 0 },
    { ...front, compression: 0 },
    1,
    random,
    { leanVisual: 0 },
  );
  for (const leanVisual of [-1, 1]) {
    const expected = riderSeatedPose({ leanVisual, drop: 14 });
    const thrown = createRagdoll(rear, front, 1, random, { leanVisual });
    const bodyDrop = 14;
    assert.equal(thrown.points.head.x - neutralThrow.points.head.x, expected.headDX);
    assert.equal(thrown.points.head.y - neutralThrow.points.head.y, expected.headDY + bodyDrop);
    assert.equal(thrown.points.shoulder.x - neutralThrow.points.shoulder.x, expected.torsoDX);
    assert.equal(thrown.points.shoulder.y - neutralThrow.points.shoulder.y, expected.torsoDY + bodyDrop);
    assert.equal(thrown.points.hip.x - neutralThrow.points.hip.x, expected.hipDX);
    assert.equal(thrown.points.hip.y - neutralThrow.points.hip.y, expected.hipDY + bodyDrop);
    assert.equal(thrown.points.elbow.x - neutralThrow.points.elbow.x, expected.elbowDX);
    assert.equal(thrown.points.elbow.y - neutralThrow.points.elbow.y, expected.elbowDY + bodyDrop);
  }

  const levelPose = { rear: { x: 0, y: 0, compression: 0 }, front: { x: 50, y: 0, compression: 0 }, facing: 1, flipVisual: 1, leanVisual: 0 };
  const openRoot = hairRoot(levelPose, true, false);
  const shellRoot = hairRoot(levelPose, true, true);
  assert.equal(shellRoot.x, openRoot.x);
  assert.equal(shellRoot.y - openRoot.y, 6, 'a full-shell helmet drops the ponytail root to the nape');

  const nisse = lookParts({ ...STARTER_LOOKS.male, outfit: 'nisse' }).palette;
  assert.notEqual(nisse.glovesLight, nisse.jacketLight, 'dark gloves do not take a bright jacket highlight');

  // Every outfit, helmet (bare, headwear, full-shell and secret) and bike model
  // draws on the bike across lean and landing states, and thrown as a ragdoll.
  const styleKeys = new Set(['fillStyle', 'strokeStyle', 'globalAlpha', 'lineWidth', 'globalCompositeOperation', 'imageSmoothingEnabled']);
  const anyContext = () => new Proxy({ getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }, {
    get: (target, key) => (key in target ? target[key] : typeof key === 'string' && !styleKeys.has(key) ? () => {} : target[key]),
    set: (target, key, value) => { target[key] = value; return true; },
  });
  globalThis.OffscreenCanvas = /** @type {any} */ (class {
    constructor(width, height) { Object.assign(this, { width, height }); }
    getContext() { return anyContext(); }
  });
  const art = createGameArt(/** @type {any} */ (anyContext()));
  const helmets = LOOK_ITEMS.filter(item => item.slot === 'helmet');
  const outfits = itemsForSlot('outfit');
  const bikes = itemsForSlot('bike');
  const hairs = itemsForSlot('hair');
  const beards = itemsForSlot('beard');
  const steps = Math.max(helmets.length, outfits.length, bikes.length, hairs.length, beards.length);
  for (let index = 0; index < steps; index++) {
    const helmet = helmets[index % helmets.length];
    const outfit = outfits[index % outfits.length];
    const bike = bikes[index % bikes.length];
    const hair = hairs[index % hairs.length];
    const beard = beards[index % beards.length];
    const gender = index % 2 === 0 ? 'male' : 'female';
    const look = { ...STARTER_LOOKS[gender], hair: hair.id, beard: beard.id, helmet: helmet.id, outfit: outfit.id, bike: bike.id };
    for (const leanVisual of [-1, 0, 1]) {
      art.drawBike({
        rear: { x: 100, y: 200, spin: 0.4, compression: leanVisual === 0 ? 14 : 2 },
        front: { x: 150, y: 200, spin: 0.4, compression: leanVisual === 0 ? 14 : 2 },
        mx: 125, my: 200, angle: 0, length: 50, facing: 1, flipVisual: 1,
        leanVisual, look, state: 'running', foot: { crank: 0.8, kick: null, tap: null },
      });
    }
    const ragdoll = createRagdoll(
      { x: 100, y: 200, ox: 98, oy: 200 },
      { x: 150, y: 200, ox: 148, oy: 200 },
      1,
      random,
      { helmet: !helmet.bare },
    );
    art.drawRagdoll(ragdoll, look);
    if (!helmet.bare) {
      ragdoll.helmet = { x: 120, y: 190, spin: 0.5, facing: 1 };
      art.drawRagdoll(ragdoll, look);
    }
  }

  // Bare head art: female vs male temple highlight/brow, matte buzz vs glossy
  // short, and outlined long hair kick-out at x = -8.
  const drawnPixels = (look) => {
    const parts = lookParts(look);
    const pixels = new Map();
    drawBareHead((x, y, width, height, color) => {
      for (let px = x; px < x + width; px += 2)
        for (let py = y; py < y + height; py += 2) pixels.set(`${px},${py}`, color);
    }, parts.palette, parts.hair, parts.face);
    return pixels;
  };
  const femaleBare = drawnPixels({ ...STARTER_LOOKS.female, hair: 'bob', helmet: 'none' });
  const maleBare = drawnPixels({ ...STARTER_LOOKS.male, hair: 'short', helmet: 'none' });
  const buzzBare = drawnPixels({ ...STARTER_LOOKS.male, hair: 'buzz', helmet: 'none' });
  assert.equal(femaleBare.get('4,-4'), lookParts(STARTER_LOOKS.female).palette.skinLight, 'female temple catches skinLight');
  assert.equal(maleBare.get('4,-4'), lookParts(STARTER_LOOKS.male).palette.skinShade, 'male temple gets a soft skinShade brow');
  assert.equal(femaleBare.get('-8,0'), '#263b36', 'long hair kicks out 1px at the back with an outline');
  assert.notEqual(buzzBare.get('-2,-6'), maleBare.get('-2,-6'), 'buzz cut differs from short hair');
}

console.log('Cosmetics tests passed.');
