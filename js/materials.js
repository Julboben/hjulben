/** Whether a material lets light and the scene behind it through. */
export const isSeeThrough = (name) => terrainMaterials[name]?.alpha !== undefined;

// `roost` is what the wheels throw up off the ground, each value against
// the plain spray: a back wheel spinning or braking throws `amount` times as
// much, `lift` times as high and `reach` times as far back, `chunks` of it in
// big bits, which fall at `fall` times the usual pull and last `hang` times
// as long, and a landing knocks up `landing` times as much. Loose ground
// throws a lot, hard ground hardly anything. It is only drawn: grip is the
// same everywhere. On soft ground the tyres also press `tracks` into the
// surface: a groove, darker at each knob of the tread.
const HARD_ROOST = { amount: .1, lift: .5, reach: .7, chunks: 0, fall: 1, hang: .6, landing: .35 };

export const terrainMaterials = {
  grass: {
    fill: '#c5b496', layers: ['#d3c2a2', '#b7a687'], detail: '#ac9c806e',
    edge: '#375d4d', surface: '#6f8b59', vegetation: '#628455',
    spray: ['#6f8b59','#9c8b68','#c5b496'],
    roost: { amount: .9, lift: 1, reach: 1, chunks: .25, fall: 1, hang: 1, landing: 1 }
  },
  dirt: {
    fill: '#ad825e', layers: ['#c69a70', '#906b50'], detail: '#76543f66',
    edge: '#654735', surface: '#9c714f', vegetation: null,
    spray: ['#886044','#ad825e','#d0a47b'],
    roost: { amount: 1.4, lift: 1.2, reach: 1.2, chunks: .6, fall: 1.1, hang: 1.1, landing: 1.5 }
  },
  sand: {
    fill: '#d8c08e', layers: ['#e6d2a3', '#c2a674'], detail: '#a98e6166',
    edge: '#8f7550', surface: '#e9d8a8', vegetation: null,
    spray: ['#c9b07e','#dcc59a','#eddcb5'],
    roost: { amount: 3, lift: 1.7, reach: 1.4, chunks: .1, fall: 1, hang: 1.3, landing: 2.5 },
    tracks: { groove: '#e0cb9a', tread: '#c0ab80' }
  },
  concrete: {
    fill: '#727a78', layers: ['#89918d', '#606866'], detail: '#4d565466',
    edge: '#3f4d4b', surface: '#9aa49e', vegetation: null,
    spray: ['#626b69','#858e8a','#aeb5ad'],
    roost: HARD_ROOST
  },
  stone: {
    fill: '#8b8982', layers: ['#a7a49a', '#6b6964'], detail: '#3b3a37cc', pattern: 'stone',
    edge: '#403e3a', surface: '#b3afa3', vegetation: null,
    spray: ['#75736d','#9a978e','#bfbbb0'],
    roost: HARD_ROOST
  },
  snow: {
    fill: '#aebbc0', layers: ['#cbd5d6', '#929fa5'], detail: '#74838a55',
    edge: '#687a7e', surface: '#eef3ed', vegetation: null,
    spray: ['#d8e2df','#edf2eb','#aebcc0'],
    roost: { amount: 2.6, lift: 1.3, reach: 1.1, chunks: .5, fall: .33, hang: 2, landing: 2.5 },
    tracks: { groove: '#cbd4d4', tread: '#b2bdbb' }
  },
  brick: {
    fill: '#8d493d', layers: ['#a65a49', '#71392f'], detail: '#492b29aa', pattern: 'brick',
    edge: '#433534', surface: '#bd7961', vegetation: null,
    spray: ['#754239','#9a5748','#bd7961'],
    roost: HARD_ROOST
  },
  wood: {
    fill: '#9a6a40', layers: ['#b4824f', '#78502f'], detail: '#3e261699', pattern: 'wood',
    edge: '#4a2f1d', surface: '#c39360', vegetation: null,
    spray: ['#7c5434','#a87a4b','#d2ad7c'],
    roost: HARD_ROOST
  },
  glass: {
    fill: '#9fcfd3', layers: ['#c4e6e6', '#82b6bd'], detail: '#ffffff99', pattern: 'glass',
    edge: '#4f8790', surface: '#d9f1ee', vegetation: null,
    // See-through: the body lets this much of itself show, its rims and glints more.
    alpha: .35, rimAlpha: .85,
    spray: ['#d9f1ee','#b4dcdc','#ffffff'],
    roost: HARD_ROOST
  }
};
