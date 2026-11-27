// @ts-check
// Restarting a ride with the hands off the controls plays it back to the
// start first, fast: the bike retraces its line, a thrown rider flies back
// onto it and apples come back, while the world around it carries on (see the
// rewind in game.js). With a hand on them, for the quick retries trials are
// made of, the run starts again at once under a flourish of the same tape
// look. The run is kept as every step's input and a copy of the ride every
// so often, and each moment the rewind shows is ridden again from the copy
// before it, as a replay is: exactly as it was, and cheaply however long the
// run.
import { cloneRide, seededRandom, stepRide } from './ride.js';

/** Seconds a rewind takes, however long the run was. */
export const REWIND_SECONDS = 0.45;
/** Seconds the tape look's flourish over a run started again at once lasts. */
export const FLOURISH_SECONDS = 0.3;
/** Seconds of riding a run needs to be rewound (its time, from setting off); a shorter one starts again at once. */
export const SHORTEST_REWIND = 1;
// Steps between copies at first: half a second. Once a run has MOST_COPIES,
// every other one goes and the steps between them double, so a long run
// keeps no more (some 14 KB each), and a moment costs no more than the steps
// between two copies to reach: a few milliseconds even ten minutes in.
const FIRST_SPACING = 60;
const MOST_COPIES = 256;

/**
 * Keeps a run to rewind: `start` it with each new ride, and `note` every
 * step's input once the ride has taken it.
 */
export function createRewindRecorder() {
  /** @type {{ step: number, ride: any }[]} */
  let copies = [];
  /** @type {any[]} */
  let inputs = [];
  let spacing = FIRST_SPACING;
  let seed = 0;
  // The step the bike set off at: the rewind goes back to there, not
  // through the wait at the line.
  let setOff = null;

  return {
    /** Starts keeping `ride`, just created from `rideSeed`. */
    start(ride, rideSeed) {
      seed = rideSeed;
      copies = [{ step: 0, ride: cloneRide(ride) }];
      inputs = [];
      spacing = FIRST_SPACING;
      setOff = null;
    },

    /** Keeps nothing: a replay isn't the rider's to rewind. */
    clear() {
      copies = [];
      inputs = [];
      setOff = null;
    },

    /** Notes the input `ride` has just been stepped with. */
    note(ride, input) {
      inputs.push(input);
      if (setOff === null && ride.started) setOff = inputs.length - 1;
      if (inputs.length % spacing) return;
      copies.push({ step: inputs.length, ride: cloneRide(ride) });
      if (copies.length <= MOST_COPIES) return;
      copies = copies.filter((_, index) => index % 2 === 0);
      spacing *= 2;
    },

    /** The steps kept, so far. */
    get steps() {
      return inputs.length;
    },

    /** The step the bike set off at, the start of the riding; the last step kept if it hasn't yet. */
    get setOff() {
      return setOff ?? inputs.length;
    },

    /** The copies kept, for the tests to see the run stays small. */
    get copies() {
      return copies.length;
    },

    /** The ride as it was after `step` steps. */
    at(step) {
      let index = copies.length - 1;
      while (index > 0 && copies[index].step > step) index--;
      const ride = cloneRide(copies[index].ride);
      // A copy shares the live ride's random numbers, which only a crash
      // draws: before one, the stream is as fresh as when the ride began.
      if (!ride.ragdoll) ride.random = seededRandom(seed);
      for (let at = copies[index].step; at < step; at++) stepRide(ride, inputs[at]);
      return ride;
    },
  };
}

/**
 * The step a rewind `t` of the way through (0 … 1) shows, from `last` back
 * to `first`: slow off the end of the run, fast through the middle,
 * settling where the riding began.
 */
export function rewindStep(first, last, t) {
  return Math.round(first + (last - first) * (1 + Math.cos(Math.PI * t)) / 2);
}
