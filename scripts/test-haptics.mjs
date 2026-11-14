// Haptics: what each kind of hit plays on a gamepad and a phone, how thumps
// and the skid buzz are spaced out, and the settings that turn them off.
import assert from 'node:assert/strict';
import { createHaptics, canRumble } from '../js/haptics.js';
import { skidAmount } from '../js/audio.js';

const STEP = 1 / 120;

/** A fake gamepad that records the effects it is asked to play. */
function fakePad() {
  const effects = [];
  let resets = 0;
  return {
    effects,
    get resets() { return resets; },
    gamepad: {
      vibrationActuator: {
        playEffect: (type, params) => { effects.push({ type, ...params }); return Promise.resolve('complete'); },
        reset: () => { resets++; return Promise.resolve('complete'); },
      },
    },
  };
}

// Node has a navigator, but no vibration motor: record phone patterns instead.
const phone = [];
Object.defineProperty(globalThis.navigator, 'vibrate', { configurable: true, value: pattern => { phone.push(pattern); return true; } });

function setup({ pad = fakePad(), on = true } = {}) {
  let time = 1000;
  phone.length = 0;
  const haptics = createHaptics({
    enabled: () => on,
    gamepad: () => pad?.gamepad ?? null,
    now: () => time,
  });
  return { haptics, pad, advance: ms => { time += ms; } };
}

// A thump is mostly the strong motor, and harder landings run it harder.
{
  const { haptics, pad, advance } = setup();
  haptics.play('thump', { strength: 0.2 });
  advance(500);
  haptics.play('thump', { strength: 1 });
  const [soft, hard] = pad.effects;
  assert.equal(soft.type, 'dual-rumble');
  assert.ok(soft.strongMagnitude > soft.weakMagnitude, 'a thump runs the low motor hardest');
  assert.ok(hard.strongMagnitude > soft.strongMagnitude && hard.duration > soft.duration, 'a harder thump is stronger and longer');
  assert.ok(hard.strongMagnitude <= 1 && hard.weakMagnitude <= 1, 'magnitudes stay within 0 to 1');
}

// A landing that bottoms out the suspension thumps once, not twice.
{
  const { haptics, pad, advance } = setup();
  haptics.play('thump', { strength: 0.5 });
  advance(40);
  haptics.play('thump', { strength: 0.5, phone: false });
  assert.equal(pad.effects.length, 1, 'thumps within the gap merge');
  advance(200);
  haptics.play('thump');
  assert.equal(pad.effects.length, 2, 'a later thump plays');
}

// The skid buzz: only the light motor, only above the threshold, renewed at a steady rate.
{
  const { haptics, pad, advance } = setup();
  haptics.skid(0.02);
  assert.equal(pad.effects.length, 0, 'a faint skid is not felt');
  haptics.skid(0.6);
  assert.equal(pad.effects.length, 1);
  assert.equal(pad.effects[0].strongMagnitude, 0, 'the buzz leaves the low motor still');
  assert.ok(pad.effects[0].weakMagnitude > 0);
  advance(30);
  haptics.skid(0.6);
  assert.equal(pad.effects.length, 1, 'renewed no faster than it needs to be');
  advance(80);
  haptics.skid(0.6);
  assert.equal(pad.effects.length, 2, 'renewed while the skid goes on');
  assert.ok(pad.effects[1].duration > 90, 'each pulse outlasts the gap to the next, so the buzz has no holes');
}

// A buzz never cuts off a bigger hit that is still playing.
{
  const { haptics, pad, advance } = setup();
  haptics.play('jolt');
  advance(20);
  haptics.skid(1);
  assert.equal(pad.effects.length, 1, 'the jolt keeps playing');
  advance(200);
  haptics.skid(1);
  assert.equal(pad.effects.length, 2, 'the buzz comes back after it');
}

// A crash is a pattern: a hard hit, then a longer rumble, one effect at a time.
{
  const { haptics, pad } = setup();
  haptics.play('crash');
  assert.equal(pad.effects.length, 1, 'the first pulse plays straight away');
  assert.equal(pad.effects[0].strongMagnitude, 1);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(pad.effects.length, 2, 'then the tumble');
  assert.ok(pad.effects[1].duration > pad.effects[0].duration);
}

// Stopping cancels what is left of a pattern and quiets the motors.
{
  const { haptics, pad } = setup();
  haptics.play('crash');
  haptics.stop();
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(pad.effects.length, 1, 'the rest of the pattern never plays');
  assert.equal(pad.resets, 1, 'the motors are reset');
}

// Settings and missing hardware.
{
  const off = setup({ on: false });
  off.haptics.play('jolt');
  off.haptics.skid(1);
  assert.equal(off.pad.effects.length, 0, 'vibration off: the gamepad stays still');
  assert.equal(phone.length, 0, 'and so does the phone');

  const none = setup({ pad: null });
  assert.doesNotThrow(() => { none.haptics.play('crash'); none.haptics.skid(1); none.haptics.stop(); }, 'no gamepad is fine');

  assert.equal(canRumble(fakePad().gamepad), true);
  assert.equal(canRumble({ vibrationActuator: null }), false);
  assert.equal(canRumble(null), false);
}

// Phones keep the patterns they had: a call can name its own.
{
  const { haptics } = setup();
  haptics.play('tick', { phonePattern: 25 });
  haptics.play('crash');
  haptics.play('thump', { phone: false });
  assert.deepEqual(phone, [25, [40, 30, 80]], 'gamepad-only thumps leave the phone alone');
}

// How hard the tyre skids, shared with the skid sound.
{
  const wheel = (x, grounded = true) => ({ x, ox: x - 150 * STEP, grounded });
  const moving = { state: 'running', rear: wheel(0), front: wheel(50), brakePressure: 1 };
  assert.ok(skidAmount(moving) > 0.6, 'hard braking at speed skids');
  assert.equal(skidAmount({ ...moving, brakePressure: 0 }), 0, 'no brake, no skid');
  assert.equal(skidAmount({ ...moving, state: 'paused' }), 0, 'only while riding');
  assert.equal(skidAmount({ ...moving, rear: wheel(0, false), front: wheel(50, false) }), 0, 'not in the air');
  const crawling = { ...moving, rear: { x: 0, ox: 0, grounded: true }, front: { x: 50, ox: 50, grounded: true } };
  assert.equal(skidAmount(crawling), 0, 'not standing still');
  assert.ok(skidAmount({ ...moving, brakePressure: 0.5 }) < skidAmount(moving), 'lighter braking skids less');
  assert.ok(skidAmount(moving) <= 1);
}

console.log('Haptics tests passed.');
