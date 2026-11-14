// @ts-check
// Haptics: the phone's vibration motor and a gamepad's rumble motors, driven
// by the same few kinds of hit. The game says what happened (a thump, a
// jolt, a crash); this decides how each device plays it.
//
// Gamepads play `dual-rumble` effects through `vibrationActuator`, with a
// strong low-frequency motor and a weak high-frequency one. A new effect
// cuts off the one playing, so a short buzz never interrupts a bigger hit,
// and patterns are played one effect at a time.

/**
 * One rumble on a gamepad: how long, and how hard each motor runs (0 to 1).
 * @typedef {{ duration: number, strong: number, weak: number, gap?: number }} Pulse
 */

/**
 * What each kind of hit plays: a phone vibration pattern in milliseconds, and
 * gamepad pulses. `strength` (0 to 1) scales both where it is given.
 * @type {Record<string, (strength: number) => { phone: number | number[] | null, pad: Pulse[] }>}
 */
const KINDS = {
  // A small, crisp tick: a flip, a crack in the glass.
  tick: () => ({ phone: 12, pad: [{ duration: 40, strong: 0, weak: 0.45 }] }),
  // A landing or the suspension bottoming out: mostly the low motor.
  thump: strength => ({
    phone: Math.round(10 + strength * 30),
    pad: [{ duration: 70 + strength * 70, strong: 0.25 + strength * 0.75, weak: 0.1 + strength * 0.2 }]
  }),
  // A sharp hit: glass shattering, the helmet coming off.
  jolt: () => ({ phone: 30, pad: [{ duration: 90, strong: 0.7, weak: 0.9 }] }),
  // Coming off the bike: a hard hit, then a heavy rumble as the rider tumbles.
  crash: () => ({
    phone: [40, 30, 80],
    pad: [{ duration: 80, strong: 1, weak: 1, gap: 40 }, { duration: 260, strong: 0.8, weak: 0.25 }]
  }),
  // Something good: the finish, the nisse. Two light, happy pulses.
  cheer: () => ({
    phone: [20, 40, 20, 40, 60],
    pad: [{ duration: 60, strong: 0.2, weak: 0.6, gap: 60 }, { duration: 60, strong: 0.2, weak: 0.6, gap: 60 }, { duration: 140, strong: 0.4, weak: 0.7 }]
  }),
  // A gold time: the cheer, then a short and a long pulse in step with the
  // da-DAA the win jingle adds for gold.
  gold: () => ({
    phone: [20, 40, 20, 40, 60, 260, 40, 60, 200],
    pad: [
      { duration: 60, strong: 0.2, weak: 0.6, gap: 60 }, { duration: 60, strong: 0.2, weak: 0.6, gap: 60 },
      { duration: 140, strong: 0.4, weak: 0.7, gap: 60 },
      { duration: 40, strong: 0.3, weak: 0.7, gap: 60 }, { duration: 220, strong: 0.6, weak: 0.9 }
    ]
  }),
};

// A landing and the suspension bottoming out are usually the same moment, so
// thumps closer together than this play once.
const THUMP_GAP = 150;

// The skid buzz is renewed this often while the tyre skids, each pulse a
// little longer, so it runs on without gaps and stops soon after the skid.
const BUZZ_EVERY = 90;
const BUZZ_PULSE = 130;
// Below this the skid is too light to feel.
const BUZZ_THRESHOLD = 0.08;

/**
 * @param {{
 *   enabled: () => boolean,
 *   gamepad: () => Gamepad | null,
 *   now?: () => number,
 * }} options
 */
export function createHaptics({ enabled, gamepad, now = () => performance.now() }) {
  // Until then a pulse is playing that a buzz must not cut off.
  let busyUntil = 0;
  let lastThump = -Infinity;
  let lastBuzz = -Infinity;
  /** The pending steps of a pattern, cancelled when a new hit replaces it. */
  let patternTimer = 0;

  /** @returns {any} the gamepad's actuator, if it can play dual-rumble */
  function actuator() {
    if (!enabled()) return null;
    const actuator = /** @type {any} */ (gamepad())?.vibrationActuator;
    return typeof actuator?.playEffect === 'function' ? actuator : null;
  }

  /** @param {any} motors @param {Pulse} pulse */
  function rumble(motors, pulse) {
    motors.playEffect('dual-rumble', {
      startDelay: 0,
      duration: Math.round(pulse.duration),
      strongMagnitude: Math.min(1, Math.max(0, pulse.strong)),
      weakMagnitude: Math.min(1, Math.max(0, pulse.weak)),
    }).catch(() => {});
  }

  /** @param {any} motors @param {Pulse[]} pulses */
  function playPulses(motors, pulses) {
    clearTimeout(patternTimer);
    let index = 0;
    const step = () => {
      const pulse = pulses[index++];
      if (!pulse) return;
      rumble(motors, pulse);
      if (index < pulses.length) patternTimer = setTimeout(step, pulse.duration + (pulse.gap ?? 0));
    };
    step();
    busyUntil = now() + pulses.reduce((total, pulse) => total + pulse.duration + (pulse.gap ?? 0), 0);
  }

  /**
   * Plays a kind of hit on the phone and the gamepad.
   * @param {keyof typeof KINDS} kind
   * @param {{ strength?: number, phone?: boolean, phonePattern?: number | number[] }} [options]
   *   `phone: false` keeps it to the gamepad; `phonePattern` replaces the kind's phone vibration
   */
  function play(kind, { strength = 1, phone = true, phonePattern } = {}) {
    const time = now();
    if (kind === 'thump') {
      if (time - lastThump < THUMP_GAP) return;
      lastThump = time;
    }
    const effect = KINDS[kind](Math.min(1, Math.max(0, strength)));
    const pattern = phonePattern ?? effect.phone;
    if (phone && pattern !== null && enabled() && typeof navigator.vibrate === 'function')
      navigator.vibrate(pattern);
    const motors = actuator();
    if (motors) playPulses(motors, effect.pad);
  }

  /**
   * Called every frame with how hard the tyre is skidding, 0 to 1: a light,
   * high buzz on the gamepad while it lasts. Phones stay still for this.
   * @param {number} amount
   */
  function skid(amount) {
    if (amount < BUZZ_THRESHOLD) return;
    const time = now();
    if (time < busyUntil || time - lastBuzz < BUZZ_EVERY) return;
    const motors = actuator();
    if (!motors) return;
    lastBuzz = time;
    rumble(motors, { duration: BUZZ_PULSE, strong: 0, weak: 0.12 + amount * 0.3 });
  }

  /** Stops the gamepad at once, such as when the menu opens or a ride is paused. */
  function stop() {
    clearTimeout(patternTimer);
    busyUntil = 0;
    const motors = actuator();
    if (motors && typeof motors.reset === 'function') motors.reset().catch(() => {});
  }

  return { play, skid, stop };
}

/** Whether a gamepad can rumble, for showing the setting. @param {Gamepad | null | undefined} gamepad */
export function canRumble(gamepad) {
  return typeof (/** @type {any} */ (gamepad)?.vibrationActuator?.playEffect) === 'function';
}
