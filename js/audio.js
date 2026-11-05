import { STEP, TAU, ENGINE, XPBD_MOTOR_ANGULAR_ACCELERATION, clamp } from './config.js';
import { createMusic, trailMood } from './music.js';

/**
 * The physics engine has one gear, so on the ground it spends most of a run
 * low in its range: held gas on the flat takes it from idle to about .6 in
 * 3 s. Heard on a curve that spreads those revs over more of the pitch.
 */
const REV_PITCH_CURVE = .7;
/** Clutch torque, as a share of the motor's peak, that sounds fully worked. */
const FULL_STRAIN_CLUTCH = .3;

/**
 * How a skidding tyre sounds on each surface: a band of scrub noise (`band`
 * Hz, `q`, `level`) and, on hard ground, the rubber's squeal, a narrow band
 * at `squealAt` Hz. Loose ground tears and hisses; hard ground screeches.
 */
const SKID_VOICES = {
  grass: { band: 420, q: .6, level: .8, squeal: 0, squealAt: 900 },
  dirt: { band: 700, q: .5, level: 1, squeal: 0, squealAt: 900 },
  sand: { band: 2200, q: .35, level: .75, squeal: 0, squealAt: 900 },
  snow: { band: 1300, q: 1.2, level: .55, squeal: .2, squealAt: 850 },
  concrete: { band: 1000, q: .8, level: .4, squeal: 1, squealAt: 1250 },
  brick: { band: 850, q: .7, level: .5, squeal: .6, squealAt: 1100 },
  stone: { band: 1500, q: 1.5, level: .6, squeal: .35, squealAt: 1600 },
  wood: { band: 320, q: 1.4, level: .7, squeal: .3, squealAt: 700 },
  glass: { band: 2600, q: 2, level: .3, squeal: 1, squealAt: 2100 },
};

/**
 * How each bike model's engine sounds, over the same revs from the physics.
 * `pulse` shapes one exhaust firing (see exhaustPulseWave); `idle` and `span`
 * set the firing note in Hz from idle to redline; the pipe resonance peaks at
 * `pipe` of the revs, sweeps from `pipeAt[0]` by `pipeAt[1]` Hz and lifts by
 * up to `pipeBoost`; `muffler` is the exhaust's cutoff in Hz; and `rasp`,
 * `lope`, `pops` and `level` scale the combustion noise, the uneven idle, the
 * chance of a backfire off the gas and the loudness. A bike without an entry
 * has no engine, like the pedalled Pocket Classic.
 */
const ENGINE_VOICES = {
  // A two-stroke single: a high, ringing note that comes on the expansion
  // chamber at the top of the revs.
  elasto: {
    pulse: { spike: .045, dip: .55, dipWidth: .1, echo: .1 },
    idle: 30, span: 153, pipe: .8, pipeAt: [280, 420], pipeBoost: 5, muffler: 1600,
    rasp: 1, lope: 1, pops: .7, level: 1,
  },
  // A four-stroke single through an open chrome pipe: it fires every other
  // turn, so it thumps lower and lopes, and barks rather than screams.
  scrambler: {
    pulse: { spike: .07, dip: .3, dipWidth: .14, echo: .2 },
    idle: 22, span: 104, pipe: .5, pipeAt: [200, 300], pipeBoost: 2.5, muffler: 1300,
    rasp: 1.3, lope: 1.7, pops: .85, level: 1.1,
  },
};

/**
 * How a tyre rolling on each surface sounds, on every bike: a band of noise
 * (`band` Hz, `q`, `level`) that rises a little with speed. Loose ground
 * crunches and hisses; hard ground hums low.
 */
const ROLL_VOICES = {
  grass: { band: 340, q: .5, level: .7 },
  dirt: { band: 520, q: .6, level: .9 },
  sand: { band: 1700, q: .4, level: .6 },
  snow: { band: 950, q: .9, level: .7 },
  concrete: { band: 230, q: 1.2, level: .55 },
  brick: { band: 380, q: .8, level: .75 },
  stone: { band: 650, q: 1, level: .65 },
  wood: { band: 260, q: 1.6, level: .85 },
  glass: { band: 1900, q: 2, level: .3 },
};
/** Ground speed, in px/s, at which the rolling is at its loudest. */
const FULL_ROLL_SPEED = 320;
/** Knobs round the tread, and how deeply each one passing throbs the rolling. */
const TREAD_KNOBS = 16, TREAD_THROB = .35;
/** Teeth on a pedalled bike's freewheel ratchet: ticks per turn of the wheel. */
const FREEWHEEL_TEETH = 18;

/**
 * A periodic wave whose one cycle is `shape(t)` for t from 0 to 1, made of
 * its first `harmonics` partials.
 */
function periodicWave(context, shape, harmonics = 40) {
  const samples = 2048;
  const real = new Float32Array(harmonics), imag = new Float32Array(harmonics);
  for (let index = 0; index < samples; index++) {
    const t = index / samples;
    const value = shape(t);
    for (let n = 1; n < harmonics; n++) {
      real[n] += value * Math.cos(TAU * n * t) * 2 / samples;
      imag[n] += value * Math.sin(TAU * n * t) * 2 / samples;
    }
  }
  return context.createPeriodicWave(real, imag);
}

/**
 * One cycle of exhaust pressure: a sharp spike as the port opens, the
 * suction dip behind it, and a small reflection back from the pipe.
 * @param {{ spike: number, dip: number, dipWidth: number, echo: number }} pulse
 */
function exhaustPulseWave(context, { spike, dip, dipWidth, echo }) {
  const bump = (t, at, width) => Math.exp(-(((t - at) / width) ** 2));
  return periodicWave(context, t => bump(t, .05, spike) - dip * bump(t, .22, dipWidth) + echo * bump(t, .48, .08));
}

function shaperCurve(shape, points = 1024) {
  const curve = new Float32Array(points);
  for (let index = 0; index < points; index++) curve[index] = shape(index / (points - 1) * 2 - 1);
  return curve;
}

/** How fast the bike is going, from both wheels' last step. */
function rideSpeed(rear, front) {
  return rear && front ? Math.abs(((rear.x - rear.ox) + (front.x - front.ox)) / (2 * STEP)) : 0;
}

/**
 * How hard a tyre is skidding, 0 to 1: braking with a wheel down, scaled by
 * speed. The skid sound and the gamepad's skid buzz both follow it.
 */
export function skidAmount({ state, rear, front, brakePressure }) {
  const speed = rideSpeed(rear, front);
  const grounded = rear && front && (rear.grounded || front.grounded);
  return state === 'running' && grounded && speed > 24 ? (brakePressure || 0) * clamp(speed / 220, 0, 1) : 0;
}

export function createAudio(getSnapshot) {
  let audio = null;
  let enabled = true, musicOn = false, volume = 1;
  const motor = { revs: 0, time: 0, liftedAt: -1, lastThrottle: 0, nextPop: 0, grip: 0, phase: 'off', startedAt: -10, stalledAt: 0 };

  /**
   * Wakes the context when something other than the pause screen stopped it:
   * the tab going hidden (see suspend), or iOS interrupting it for a call or
   * another app's sound. Browsers only let a context run after a gesture, so
   * the call may hang until one; it is made once per stop, not every frame.
   */
  function resumeContext() {
    if (!audio || audio.resuming || audio.paused || audio.hidden || audio.context.state === 'running') return;
    audio.resuming = true;
    audio.context.resume().catch(() => {}).finally(() => { if (audio) audio.resuming = false; });
  }

  /** Whether sound is actually playing: the context exists and is running. */
  function isRunning() {
    return Boolean(audio) && audio.context.state === 'running';
  }

  /**
   * Stops the context while the tab is hidden, whatever the game is doing:
   * the frame loop stops with it, so update() can't. The next update, or
   * init() from a gesture, starts it again.
   */
  function suspend() {
    if (!audio) return;
    audio.hidden = true;
    audio.context.suspend().catch(() => {});
  }

  /** Creates the context on the first gesture; later calls wake it if needed. */
  function init() {
    if (audio) {
      audio.hidden = false;
      resumeContext();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    // iOS reports 'interrupted' (and Safari 'suspended') when another app
    // takes the sound; a stop that isn't ours is undone by the next gesture
    // or visible frame.
    context.addEventListener('statechange', () => {
      if (!audio) return;
      audio.resuming = false;
      if (context.state !== 'running') resumeContext();
    });
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    master.gain.value = masterLevel();
    master.connect(compressor); compressor.connect(context.destination);

    const noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

    // Engine: a single cylinder. Each firing is an exhaust pulse, lightly
    // saturated, shaped by a resonant pipe and a muffler and roughened by
    // combustion noise that bursts with each pulse. The bike's voice in
    // ENGINE_VOICES tunes it; see setVoice.
    const engine = context.createOscillator();
    engine.frequency.value = 30;
    const engineDrive = context.createGain();
    const engineShaper = context.createWaveShaper();
    engineShaper.curve = shaperCurve((x) => Math.tanh(x));
    engineShaper.oversample = '2x';
    const engineHighpass = context.createBiquadFilter();
    engineHighpass.type = 'highpass'; engineHighpass.frequency.value = 38;
    const engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass'; engineFilter.frequency.value = 400; engineFilter.Q.value = .7;
    const enginePipe = context.createBiquadFilter();
    enginePipe.type = 'peaking'; enginePipe.frequency.value = 360; enginePipe.Q.value = 1.2; enginePipe.gain.value = 1;
    const engineMuffler = context.createBiquadFilter();
    engineMuffler.type = 'lowpass'; engineMuffler.frequency.value = 1600; engineMuffler.Q.value = .5;
    const engineWobble = context.createGain();
    const engineGain = context.createGain();
    engineGain.gain.value = 0;
    engine.connect(engineDrive); engineDrive.connect(engineShaper); engineShaper.connect(engineHighpass);
    engineHighpass.connect(engineFilter); engineFilter.connect(enginePipe); enginePipe.connect(engineWobble);
    engineWobble.connect(engineMuffler); engineMuffler.connect(engineGain); engineGain.connect(master);

    const rasp = context.createBufferSource();
    const raspFilter = context.createBiquadFilter();
    const raspPulse = context.createGain();
    const raspLevel = context.createGain();
    const pulseEnvelope = context.createWaveShaper();
    pulseEnvelope.curve = shaperCurve((x) => (x > 0 ? x * x : 0));
    rasp.buffer = noiseBuffer; rasp.loop = true;
    raspFilter.type = 'lowpass'; raspFilter.frequency.value = 600; raspFilter.Q.value = .5;
    raspPulse.gain.value = 0;
    raspLevel.gain.value = 1;
    engine.connect(pulseEnvelope); pulseEnvelope.connect(raspPulse.gain);
    rasp.connect(raspFilter); raspFilter.connect(raspPulse); raspPulse.connect(raspLevel); raspLevel.connect(engineWobble);

    // No two firings are quite alike: slow random drift in timing and
    // strength, strongest at idle where the engine lopes.
    const driftBuffer = context.createBuffer(1, context.sampleRate * 5, context.sampleRate);
    const driftData = driftBuffer.getChannelData(0);
    for (let i = 0; i < driftData.length; i++) driftData[i] = Math.random() * 2 - 1;
    const drift = context.createBufferSource();
    drift.buffer = driftBuffer; drift.loop = true;
    const pitchDriftFilter = context.createBiquadFilter();
    pitchDriftFilter.type = 'lowpass'; pitchDriftFilter.frequency.value = 8;
    const pitchDrift = context.createGain();
    pitchDrift.gain.value = 900;
    const levelDriftFilter = context.createBiquadFilter();
    levelDriftFilter.type = 'lowpass'; levelDriftFilter.frequency.value = 6;
    const levelDrift = context.createGain();
    levelDrift.gain.value = 4;
    drift.connect(pitchDriftFilter); pitchDriftFilter.connect(pitchDrift); pitchDrift.connect(engine.detune);
    drift.connect(levelDriftFilter); levelDriftFilter.connect(levelDrift); levelDrift.connect(engineWobble.gain);
    engine.start(); rasp.start(); drift.start();
    const skid = context.createBufferSource();
    const skidFilter = context.createBiquadFilter();
    const skidGain = context.createGain();
    skid.buffer = noiseBuffer; skid.loop = true;
    skidFilter.type = 'bandpass'; skidFilter.frequency.value = 520; skidFilter.Q.value = .7;
    skidGain.gain.value = 0;
    skid.connect(skidFilter); skidFilter.connect(skidGain); skidGain.connect(master); skid.start();
    const squealFilter = context.createBiquadFilter();
    const squealGain = context.createGain();
    squealFilter.type = 'bandpass'; squealFilter.frequency.value = 1250; squealFilter.Q.value = 14;
    squealGain.gain.value = 0;
    skid.connect(squealFilter); squealFilter.connect(squealGain); squealGain.connect(master);
    // Rolling: the tyres on the ground, a band of noise that sounds like the
    // surface, throbbing with the knobs of the tread as the wheel turns.
    const rollFilter = context.createBiquadFilter();
    const rollGain = context.createGain();
    const rollTread = context.createGain();
    const tread = context.createOscillator();
    const treadDepth = context.createGain();
    rollFilter.type = 'bandpass'; rollFilter.frequency.value = 500; rollFilter.Q.value = .6;
    rollGain.gain.value = 0;
    rollTread.gain.value = 1 - TREAD_THROB;
    treadDepth.gain.value = TREAD_THROB;
    tread.frequency.value = 10;
    tread.connect(treadDepth); treadDepth.connect(rollTread.gain);
    skid.connect(rollFilter); rollFilter.connect(rollGain); rollGain.connect(rollTread); rollTread.connect(master);
    tread.start();
    // A pedalled bike's freewheel: the pawls ticking over the ratchet while
    // the wheel runs on under still pedals. Each tick is a burst of bright
    // noise, gated by a pulse that fires once per tooth.
    const ratchet = context.createOscillator();
    ratchet.setPeriodicWave(periodicWave(context, t => Math.exp(-(((t - .5) / .03) ** 2)), 64));
    ratchet.frequency.value = 10;
    const ratchetShape = context.createWaveShaper();
    ratchetShape.curve = shaperCurve((x) => (x > 0 ? x ** 3 : 0));
    const tickFilter = context.createBiquadFilter();
    const tickPulse = context.createGain();
    const tickGain = context.createGain();
    tickFilter.type = 'bandpass'; tickFilter.frequency.value = 3400; tickFilter.Q.value = 1.4;
    tickPulse.gain.value = 0;
    tickGain.gain.value = 0;
    ratchet.connect(ratchetShape); ratchetShape.connect(tickPulse.gain);
    skid.connect(tickFilter); tickFilter.connect(tickPulse); tickPulse.connect(tickGain); tickGain.connect(master);
    ratchet.start();
    // Pedalling, the chain whirs softly over the sprockets instead.
    const chainFilter = context.createBiquadFilter();
    const chainGain = context.createGain();
    chainFilter.type = 'bandpass'; chainFilter.frequency.value = 1900; chainFilter.Q.value = 2.2;
    chainGain.gain.value = 0;
    skid.connect(chainFilter); chainFilter.connect(chainGain); chainGain.connect(master);

    const rainBuffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
    const rainData = rainBuffer.getChannelData(0);
    let pink0 = 0, pink1 = 0, pink2 = 0, pink3 = 0, pink4 = 0, pink5 = 0, pink6 = 0;
    for (let index = 0; index < rainData.length; index++) {
      const white = Math.random() * 2 - 1;
      pink0 = .99886 * pink0 + white * .0555179;
      pink1 = .99332 * pink1 + white * .0750759;
      pink2 = .969 * pink2 + white * .153852;
      pink3 = .8665 * pink3 + white * .3104856;
      pink4 = .55 * pink4 + white * .5329522;
      pink5 = -.7616 * pink5 - white * .016898;
      rainData[index] = (pink0 + pink1 + pink2 + pink3 + pink4 + pink5 + pink6 + white * .5362) * .11;
      pink6 = white * .115926;
    }
    const rain = context.createBufferSource();
    const rainHighpass = context.createBiquadFilter();
    const rainLowpass = context.createBiquadFilter();
    const rainGain = context.createGain();
    rain.buffer = rainBuffer; rain.loop = true;
    rainHighpass.type = 'highpass'; rainHighpass.frequency.value = 320;
    rainLowpass.type = 'lowpass'; rainLowpass.frequency.value = 2400; rainLowpass.Q.value = .35;
    rainGain.gain.value = 0;
    rain.connect(rainHighpass); rainHighpass.connect(rainLowpass); rainLowpass.connect(rainGain); rainGain.connect(master); rain.start();
    // Wind: brown noise through a band that sweeps with the gusts.
    const windBuffer = context.createBuffer(1, context.sampleRate * 6, context.sampleRate);
    const windData = windBuffer.getChannelData(0);
    let brown = 0;
    for (let index = 0; index < windData.length; index++) {
      brown = (brown + (Math.random() * 2 - 1) * .02) / 1.02;
      windData[index] = brown * 3.2;
    }
    const wind = context.createBufferSource();
    const windFilter = context.createBiquadFilter();
    const windGain = context.createGain();
    wind.buffer = windBuffer; wind.loop = true;
    windFilter.type = 'bandpass'; windFilter.frequency.value = 400; windFilter.Q.value = .8;
    windGain.gain.value = 0;
    wind.connect(windFilter); windFilter.connect(windGain); windGain.connect(master); wind.start();
    // A long, dark echo for thunder rolling off the land.
    const echo = context.createConvolver();
    const echoLength = context.sampleRate * 3.5;
    const impulse = context.createBuffer(2, echoLength, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      let smooth = 0;
      for (let index = 0; index < echoLength; index++) {
        smooth = smooth * .85 + (Math.random() * 2 - 1) * .15;
        data[index] = smooth * (1 - index / echoLength) ** 3;
      }
    }
    echo.buffer = impulse;
    echo.connect(master);
    const music = createMusic(context, master, noiseBuffer);
    audio = {
      context, master, engine, engineDrive, engineFilter, enginePipe, engineMuffler, engineGain, raspFilter, raspLevel,
      pitchDrift, levelDrift, noiseBuffer, skidFilter, skidGain, squealFilter, squealGain, rainGain,
      windFilter, windGain, brownBuffer: windBuffer, echo, music,
      rollFilter, rollGain, tread, ratchet, tickGain, chainFilter, chainGain,
      // The engine voice the oscillator and muffler are tuned to (see setVoice).
      voice: null,
      // The ignition last frame, to catch the moment the kick-start catches.
      lastIgnition: 'on',
      // Whether the context is suspended for the pause screen (see update),
      // or for a hidden tab (see suspend), and whether a resume is pending.
      paused: false,
      hidden: false,
      resuming: false,
    };
    setVoice(ENGINE_VOICES.elasto);
  }

  /**
   * Tunes the engine to a bike's voice. Only the parts that hold still through
   * a run are set here; updateEngine scales the rest every frame.
   */
  function setVoice(voice) {
    if (voice === audio.voice) return;
    audio.voice = voice;
    audio.engine.setPeriodicWave(exhaustPulseWave(audio.context, voice.pulse));
    audio.engineMuffler.frequency.value = voice.muffler;
  }

  function masterLevel() { return enabled ? .45 * volume * volume : 0; }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    if (audio) audio.master.gain.setTargetAtTime(masterLevel(), audio.context.currentTime, .015);
  }

  function setMusic(on) { musicOn = on; }

  /**
   * The song for the moment: the menu's tune on the dashboard, the trail's
   * world's while riding, quieter so the engine stays on top, and none at
   * the finish, where the jingle plays.
   */
  function musicTarget(state, trail) {
    if (!enabled || !musicOn) return null;
    if (state === 'menu') return { key: 'menu', mood: 'menu', seed: 'menu', night: false, level: 1 };
    const { mood, night, seed } = trailMood(trail);
    return { key: `${seed}:${night}`, mood, seed, night, level: state === 'won' ? 0 : .6 };
  }

  /** @param {number} level 0 … 1; squared so the slider feels even. */
  function setVolume(level) {
    volume = clamp(level, 0, 1);
    if (audio) audio.master.gain.setTargetAtTime(masterLevel(), audio.context.currentTime, .015);
  }

  function playTone(frequency, duration, type = 'square', volume = .08, delay = 0, endFrequency = frequency) {
    if (!audio || !enabled) return;
    const { context, master } = audio;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain); gain.connect(master);
    oscillator.start(start); oscillator.stop(start + duration + .02);
  }

  function playNoise(duration, volume = .1, cutoff = 900, delay = 0) {
    if (!audio || !enabled) return;
    const { context, master, noiseBuffer } = audio;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    source.buffer = noiseBuffer;
    filter.type = 'lowpass'; filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(.0001, context.currentTime);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter); filter.connect(gain); gain.connect(master);
    source.start(start); source.stop(start + duration);
  }

  function backfire(strength) {
    playNoise(.04 + Math.random() * .03, (.025 + Math.random() * .025) * strength, 500 + Math.random() * 600);
    playTone(70 + Math.random() * 40, .06, 'triangle', .03 * strength, 0, 40);
  }

  function kickStart() {
    playTone(48, .12, 'triangle', .06, 0, 30);
    playNoise(.06, .03, 500);
  }

  /**
   * A bicycle bell, rung twice with the thumb: each strike a bright dome
   * whose two near partials beat as it rings out, over a tick of the hammer.
   */
  function bell() {
    for (const delay of [0, .17]) {
      playNoise(.012, .02, 6500, delay);
      playTone(2350, .7, 'sine', .035, delay);
      playTone(2378, .7, 'sine', .022, delay);
      playTone(6480, .2, 'sine', .01, delay);
    }
  }

  /**
   * The tyres rolling on the ground, on every bike: louder with speed, in
   * the voice of the surface under them, and throbbing with the tread.
   */
  function updateRolling(state, rear, front, speed) {
    const { context, rollFilter, rollGain, tread } = audio;
    const time = context.currentTime;
    const wheel = rear?.grounded ? rear : front?.grounded ? front : null;
    const voice = ROLL_VOICES[wheel?.material] || ROLL_VOICES.dirt;
    const pace = clamp(speed / FULL_ROLL_SPEED, 0, 1);
    // The physics stops at the finish, so its last speed would roll on forever.
    const rolling = wheel && state !== 'menu' && state !== 'won';
    const level = rolling ? pace ** .7 * (rear.grounded && front.grounded ? 1 : .75) * .05 * voice.level : 0;
    rollFilter.frequency.setTargetAtTime(voice.band * (.8 + pace * .5), time, .05);
    rollFilter.Q.setTargetAtTime(voice.q, time, .05);
    rollGain.gain.setTargetAtTime(level, time, .04);
    tread.frequency.setTargetAtTime(clamp(Math.abs(wheel?.angularVelocity || 0) / TAU * TREAD_KNOBS, 1, 220), time, .03);
  }

  /**
   * A pedalled bike's own sounds, in place of the engine: the bell as the
   * rider sets off where a kick-start would catch, the chain whirring while
   * they pedal, and the freewheel ticking while the wheel runs on without them.
   */
  function updatePedals(state, rear, front, facing, gas, ignition, fresh, bike) {
    const { context, ratchet, tickGain, chainFilter, chainGain } = audio;
    const time = context.currentTime;
    const pedalled = bike !== undefined && !ENGINE_VOICES[bike];
    if (pedalled && fresh && audio.lastIgnition === 'off' && ignition === 'kicked') bell();
    audio.lastIgnition = ignition;
    // The driven wheel is the one behind the rider, the front facing left.
    const driven = facing < 0 ? front : rear;
    const turning = Math.abs(driven?.angularVelocity || 0);
    const riding = pedalled && (state === 'running' || state === 'ragdoll');
    const pedalling = riding && gas && state === 'running';
    const coasting = riding && !pedalling && turning > 1;
    ratchet.frequency.setTargetAtTime(clamp(turning / TAU * FREEWHEEL_TEETH, 1, 180), time, .03);
    // Slow ticks are distinct and carry; fast ones blur into a softer buzz.
    tickGain.gain.setTargetAtTime(coasting ? .05 * clamp(turning / 4, 0, 1) * (1 - .4 * clamp(turning / 40, 0, 1)) : 0, time, .03);
    chainFilter.frequency.setTargetAtTime(1600 + turning * 15, time, .05);
    chainGain.gain.setTargetAtTime(pedalling ? .015 * clamp(turning / 30, .3, 1) : 0, time, .05);
  }

  /**
   * The engine runs while riding. A new run starts it with a couple of
   * blips, after the rider's kick when a trail is opened; a crash stalls it
   * and the finish switches it off. It plays the physics engine: its revs
   * and how hard its clutch pulls on the wheel. A bike with no voice in
   * ENGINE_VOICES is pedalled and stays silent.
   * @param {{ rev: number, clutchTorque?: number } | undefined} bikeEngine
   * @param {boolean} fresh the run has not begun moving yet
   * @param {'on' | 'off' | 'kicked'} ignition 'off' until the kick catches
   * @param {string | undefined} bike the ridden bike's model
   */
  function updateEngine(state, bikeEngine, gas, fresh, ignition, bike) {
    const { context, engine, engineDrive, engineFilter, enginePipe, engineGain, raspFilter, raspLevel, pitchDrift, levelDrift } = audio;
    const time = context.currentTime;
    const dt = clamp(time - motor.time, 0, .1);
    motor.time = time;
    const bikeVoice = ENGINE_VOICES[bike];
    const on = state === 'running' && bikeEngine && bikeVoice && ignition !== 'off';
    if (on && motor.phase !== 'on') {
      setVoice(bikeVoice);
      if (fresh && ignition === 'kicked') kickStart();
      Object.assign(motor, { phase: 'on', startedAt: fresh ? time : -10, revs: 0, grip: 0, lastThrottle: 0, liftedAt: -1 });
    } else if (state === 'ragdoll' && motor.phase === 'on') {
      Object.assign(motor, { phase: 'stalling', stalledAt: time });
    } else if (state === 'menu' || state === 'won') motor.phase = 'off';
    const stall = motor.phase === 'stalling' ? clamp((time - motor.stalledAt) / .8, 0, 1) : 0;
    if (stall >= 1) motor.phase = 'off';
    if (!(on || motor.phase === 'stalling') || !bikeEngine || state === 'paused') {
      // The rider switches off at the finish; elsewhere the engine just cuts.
      engineGain.gain.setTargetAtTime(0, time, state === 'won' ? .12 : .045);
      return;
    }
    const { voice } = audio;
    // After the kick it catches with a sharp blip, settles and blips again.
    const sinceStart = time - motor.startedAt;
    const bump = (at, width) => Math.exp(-(((sinceStart - at) / width) ** 2));
    const startRevs = sinceStart < 1.4 ? .5 * bump(.33, .09) + .22 * bump(.95, .07) : 0;
    const caught = clamp((sinceStart - .2) / .05, 0, 1);
    // The engine answers the twist of the grip at once; the physics' throttle
    // eases in to keep traction soft, which would make the engine sluggish.
    motor.grip += ((gas && !stall ? 1 : 0) - motor.grip) * (1 - Math.exp(-dt * (gas ? 22 : 14)));
    const throttle = motor.grip;
    // The revs are the physics engine's: the slipping clutch lets them run
    // above the wheel pulling away, a climb holds them down, off the gas the
    // clutch lets go and they drop to idle, and in the air they spin up to
    // the limiter.
    const physicsRevs = clamp((bikeEngine.rev - ENGINE.idle) / (ENGINE.redline - ENGINE.idle), 0, 1);
    motor.revs = Math.max(physicsRevs ** REV_PITCH_CURVE, startRevs) * (1 - stall);
    const revs = motor.revs;
    // The clutch's pull is the work: hard pulling away and on climbs, lighter
    // at speed, and next to nothing with the wheel in the air, where the
    // engine screams thinner instead of barking.
    const strain = clamp((bikeEngine.clutchTorque || 0) / XPBD_MOTOR_ANGULAR_ACCELERATION / FULL_STRAIN_CLUTCH, 0, 1);

    // Held on the gas at the top of its range the engine taps the limiter.
    const redline = throttle * clamp((physicsRevs - .97) / .03, 0, 1);
    const cut = redline * (Math.sin(time * TAU * 9) > .7 ? .35 : 0);
    const load = Math.max(throttle * (.6 + .4 * strain), clamp(startRevs * 1.6, 0, 1)) * (1 - cut);

    // Snapping the gas shut from high revs crackles and pops in the pipe.
    const easing = throttle < motor.lastThrottle;
    if (easing && throttle < .7 && motor.lastThrottle >= .7 && revs > .45) {
      motor.liftedAt = time;
      motor.nextPop = time + .04 + Math.random() * .08;
    }
    if (easing && time - motor.liftedAt < .9 && time >= motor.nextPop) {
      if (Math.random() < voice.pops) backfire(clamp(revs * 1.3, .4, 1));
      motor.nextPop = time + .05 + Math.random() * .17;
    }
    motor.lastThrottle = throttle;

    // The pipe is tuned to one part of the rev range: there the engine comes
    // on the pipe and screams.
    const powerband = clamp(1 - Math.abs(revs - voice.pipe) / .32, 0, 1);
    // A stalling engine sputters down below idle before it dies.
    engine.frequency.setTargetAtTime((voice.idle + revs * voice.span) * (1 - stall * .55), time, .03);
    pitchDrift.gain.setTargetAtTime(900 * voice.lope * (1.2 - revs) * (1 - load * .4) * (1 + stall * 2), time, .1);
    levelDrift.gain.setTargetAtTime(4 * voice.lope * (1.1 - revs * .8), time, .1);
    engineDrive.gain.setTargetAtTime(.8 + load * .9, time, .03);
    // At idle the filter stays open enough that small speakers, which cannot
    // play the deep firing note, still carry its upper harmonics.
    engineFilter.frequency.setTargetAtTime(650 + load * (300 + revs * 650) + revs * 100, time, .04);
    enginePipe.frequency.setTargetAtTime(voice.pipeAt[0] + revs * voice.pipeAt[1], time, .05);
    enginePipe.gain.setTargetAtTime(1 + powerband * load * voice.pipeBoost, time, .05);
    raspFilter.frequency.setTargetAtTime(450 + load * revs * 650, time, .05);
    raspLevel.gain.setTargetAtTime((.5 + load * .9) * voice.rasp, time, .05);
    const level = (.06 + load * (.02 + revs * .025 + powerband * .01) + revs * .006) * voice.level;
    engineGain.gain.setTargetAtTime(level * (1 - cut * .6) * caught * (1 - stall) ** 1.5, time, cut ? .012 : .03);
  }

  function update() {
    if (!audio) return;
    const { state, rear, front, facing, engine, gas, started, ignition = 'on', brakePressure, weather, trail, bike } = getSnapshot();
    const { context, skidFilter, skidGain, squealFilter, squealGain, rainGain, windFilter, windGain } = audio;
    // Pausing freezes every sound where it is (rain, wind, a rolling thunder
    // clap, the engine) by suspending the whole context; resuming carries on.
    const paused = state === 'paused';
    if (paused !== audio.paused) {
      audio.paused = paused;
      if (paused) context.suspend().catch(() => {});
    }
    if (paused) return;
    // A frame means the tab is visible again; wake the context if the pause
    // screen, the hidden tab or an interruption left it stopped.
    audio.hidden = false;
    if (context.state !== 'running') resumeContext();
    const speed = rideSpeed(rear, front);
    updateEngine(state, engine, Boolean(gas), !started, ignition, bike);
    updatePedals(state, rear, front, facing, Boolean(gas), ignition, !started, bike);
    updateRolling(state, rear, front, speed);
    audio.music.update(musicTarget(state, trail));
    const skidLevel = skidAmount({ state, rear, front, brakePressure }) * .16;
    // The skid sounds like the ground under the tyre doing it: the rear when
    // it is down, else the front.
    const skidding = rear?.grounded ? rear : front;
    const voice = SKID_VOICES[skidding?.material] || SKID_VOICES.dirt;
    skidFilter.frequency.setTargetAtTime(voice.band, context.currentTime, .05);
    skidFilter.Q.setTargetAtTime(voice.q, context.currentTime, .05);
    squealFilter.frequency.setTargetAtTime(voice.squealAt * (.9 + clamp(speed / 300, 0, 1) * .2), context.currentTime, .05);
    skidGain.gain.setTargetAtTime(skidLevel * voice.level, context.currentTime, .025);
    // The narrow squeal band passes little of the noise, so it is boosted.
    squealGain.gain.setTargetAtTime(skidLevel * voice.squeal * 2.5, context.currentTime, .025);
    const rainIntensity = clamp(Number(weather?.rain) || 0, 0, 1);
    // At the finish the rain and wind fade out under the win jingle, which is
    // why the context is not suspended as it is for the pause screen.
    const inPlay = state !== 'menu' && state !== 'won';
    const fade = state === 'won' ? .8 : 0;
    const storm = (value) => clamp((value - .5) / .5, 0, 1) ** 1.3;
    const rainStorm = storm(rainIntensity);
    const rainLevel = inPlay && rainIntensity > 0
      ? (.012 + rainIntensity * .04 + rainStorm * .02) * (.94 + Math.sin(context.currentTime * .63) * .06)
      : 0;
    rainGain.gain.setTargetAtTime(rainLevel, context.currentTime, fade || .35);
    // The trail's wind: a light breeze is near silent, a gale roars, and it
    // whistles higher as it strengthens.
    const blow = clamp(Number(weather?.wind) || 0, 0, 1);
    const windLevel = inPlay ? clamp((blow - .15) / .85, 0, 1) ** 1.3 : 0;
    const whistle = clamp((blow - .55) / .4, 0, 1);
    const time = context.currentTime;
    // Slow, uneven swells from sines that never line up, so it never drones.
    const swell = clamp(
      .55 + Math.sin(time * .23) * .25 + Math.sin(time * .61 + 1.3) * .15 + Math.sin(time * 1.7 + 2.1) * .07,
      0, 1,
    );
    windFilter.frequency.setTargetAtTime(
      260 + whistle * 280 + swell * (300 + whistle * 500) * (.5 + blow * .5), time, .3,
    );
    windFilter.Q.setTargetAtTime(.7 + whistle * .9, time, .5);
    windGain.gain.setTargetAtTime(windLevel * (.05 + swell * .08), time, fade || .4);
  }

  return {
    init,
    suspend,
    isRunning,
    setEnabled,
    setMusic,
    setVolume,
    update,
    // The gear lever clicking into first: a short, hard metal knock.
    gearClunk() {
      playTone(170, .05, 'square', .03, 0, 110);
      playNoise(.03, .025, 2600);
    },
    splash(speed) {
      const volume = Math.min(.16, .05 + speed / 3000);
      playNoise(.28, volume, 1400);
      playNoise(.18, volume * .6, 3200, .04);
      playTone(240, .12, 'sine', volume * .25, 0, 90);
    },
    shatter(speed) {
      const volume = Math.min(.16, .07 + speed / 4000);
      playNoise(.2, volume, 6500);
      playNoise(.4, volume * .45, 4200, .05);
      [2637, 3520, 2349, 3136, 2794].forEach((note, index) => {
        playTone(note, .08, 'triangle', volume * .3, .03 + index * .04, note * .94);
      });
    },
    crack(speed) {
      const volume = Math.min(.1, .04 + speed / 6000);
      playNoise(.05, volume, 5200);
      playTone(1975, .05, 'square', volume * .35, 0, 1480);
      playTone(2960, .04, 'triangle', volume * .25, .03, 2490);
    },
    menuMove: () => playTone(420, .035, 'square', .018, 0, 470),
    menuSelect: () => playTone(520, .07, 'square', .035, 0, 680),
    menuBack: () => playTone(360, .08, 'triangle', .035, 0, 240),
    escape: () => playTone(300, .09, 'square', .04, 0, 190),
    menuConfirm() {
      playTone(440, .08, 'square', .045, 0, 660);
      playTone(660, .1, 'square', .035, .055, 880);
    },
    flip: () => playTone(180, .12, 'square', .035, 0, 260),
    headlight(on) {
      playNoise(.025, .05, 3200);
      if (on) playTone(520, .07, 'square', .03, .02, 1040);
      else playTone(700, .08, 'square', .025, .02, 300);
    },
    airTurn(fullRotation) {
      if (fullRotation) {
        playNoise(.16, .045, 1800);
        [440, 660, 880, 1320].forEach((note, index) => {
          playTone(note, .14, 'triangle', .065, index * .055, note * 1.18);
        });
        playTone(1760, .22, 'sine', .045, .2, 1320);
      } else {
        playNoise(.1, .035, 1150);
        playTone(230, .12, 'triangle', .035, 0, 340);
      }
    },
    /**
     * A suspension leg reaching the end of its stroke: a dull thud as it
     * bottoms on a big landing, or a lighter clack as it tops out. `speed`
     * is how fast the leg was moving, in px/s.
     */
    suspension(end, speed) {
      if (end === 'bottom') {
        const strength = clamp((speed - 100) / 300, 0, 1);
        playTone(78 - strength * 18, .09 + strength * .05, 'triangle', .04 + strength * .05, 0, 44);
        playNoise(.05 + strength * .03, .02 + strength * .035, 380 + strength * 200);
        playTone(310, .035, 'square', .008 + strength * .012, .004, 220);
      } else {
        const strength = clamp((speed - 50) / 200, 0, 1);
        playTone(150, .05, 'triangle', .025 + strength * .03, 0, 105);
        playNoise(.03, .012 + strength * .018, 1300);
      }
    },
    land(impactSpeed) {
      const strength = clamp((impactSpeed - 45) / 180, 0, 1);
      playNoise(.07 + strength * .08, .025 + strength * .065, 420 + strength * 260);
      playTone(105 - strength * 22, .1 + strength * .08, 'triangle', .035 + strength * .055, 0, 62);
    },
    /**
     * Coda's woof, a corgi's sharp "ruff": a breathy onset, then a voice that
     * yips up and falls away through a mouth-like band-pass that closes as
     * it ends, with a little chest underneath. A corgi is a big dog in a
     * small body: higher than a big dog, but full rather than squeaky.
     */
    woof() {
      if (!audio || !enabled) return;
      const { context, master, noiseBuffer } = audio;
      const t = context.currentTime;
      const pitch = 240 + Math.random() * 30;
      const end = t + .19;
      const gain = context.createGain();
      gain.gain.setValueAtTime(.0001, t);
      gain.gain.exponentialRampToValueAtTime(.2, t + .012);
      gain.gain.exponentialRampToValueAtTime(.08, t + .08);
      gain.gain.exponentialRampToValueAtTime(.0001, end);
      const mouth = context.createBiquadFilter();
      mouth.type = 'bandpass'; mouth.Q.value = 1.8;
      mouth.frequency.setValueAtTime(1050, t);
      mouth.frequency.exponentialRampToValueAtTime(560, end);
      // Takes the fizz off, so it is a bark and not a squeak.
      const soften = context.createBiquadFilter();
      soften.type = 'lowpass'; soften.frequency.value = 2000;
      mouth.connect(soften); soften.connect(gain); gain.connect(master);
      const voice = context.createOscillator();
      voice.type = 'sawtooth';
      voice.frequency.setValueAtTime(pitch * .85, t);
      voice.frequency.exponentialRampToValueAtTime(pitch * 1.35, t + .025);
      voice.frequency.exponentialRampToValueAtTime(pitch * .65, end);
      voice.connect(mouth);
      const chest = context.createOscillator();
      chest.type = 'triangle';
      chest.frequency.setValueAtTime(pitch * .5, t);
      chest.frequency.exponentialRampToValueAtTime(pitch * .35, end);
      const chestGain = context.createGain();
      chestGain.gain.value = .35;
      chest.connect(chestGain); chestGain.connect(gain);
      voice.start(t); voice.stop(end + .02);
      chest.start(t); chest.stop(end + .02);
      // The rough "r" of air at the start.
      const air = context.createBufferSource();
      air.buffer = noiseBuffer;
      const rasp = context.createBiquadFilter();
      rasp.type = 'bandpass'; rasp.frequency.value = 1300; rasp.Q.value = 1.2;
      const airGain = context.createGain();
      airGain.gain.setValueAtTime(.05, t);
      airGain.gain.exponentialRampToValueAtTime(.0001, t + .06);
      air.connect(rasp); rasp.connect(airGain); airGain.connect(master);
      air.start(t, Math.random() * .5); air.stop(t + .07);
    },
    /** Coda panting happily: quick breathy huffs, out a little louder than in. */
    pant() {
      if (!audio || !enabled) return;
      const { context, master, noiseBuffer } = audio;
      for (let i = 0; i < 8; i++) {
        const t = context.currentTime + i * .17;
        const out = i % 2 === 0;
        const air = context.createBufferSource();
        air.buffer = noiseBuffer;
        const throat = context.createBiquadFilter();
        throat.type = 'bandpass'; throat.Q.value = 3;
        throat.frequency.value = out ? 1250 : 900;
        const gain = context.createGain();
        gain.gain.setValueAtTime(.0001, t);
        gain.gain.exponentialRampToValueAtTime(out ? .07 : .04, t + .03);
        gain.gain.exponentialRampToValueAtTime(.0001, t + .13);
        air.connect(throat); throat.connect(gain); gain.connect(master);
        air.start(t, Math.random() * .5); air.stop(t + .14);
      }
    },
    /** A coin dropping into a stall's honesty box: a bright clink and a rattle. */
    coin() {
      playTone(2350, .05, 'triangle', .05, 0, 2200);
      playTone(3100, .08, 'sine', .035, .02, 3000);
      playTone(1900, .06, 'triangle', .03, .16, 1800);
      playNoise(.05, .02, 5200);
    },
    apple() {
      playTone(620, .1, 'square', .07, 0, 880);
      playTone(880, .13, 'square', .055, .07, 1240);
    },
    // A little sleigh-bell jingle for finding the nisse.
    nisse() {
      [988, 1319, 1175, 1568].forEach((note, index) => {
        playTone(note, .09, 'triangle', .06, index * .07, note * 1.02);
      });
      playNoise(.12, .025, 6400);
    },
    crash() {
      playNoise(.35, .18, 700);
      playTone(120, .32, 'sawtooth', .09, 0, 42);
    },
    /** A hollow knock of the helmet shell coming off, louder the harder the hit. */
    helmet(speed) {
      const strength = clamp((speed - 150) / 300, 0, 1);
      playNoise(.05, .05 + strength * .05, 2400);
      playTone(330, .09, 'triangle', .05 + strength * .04, 0, 210);
      playTone(520, .06, 'square', .02, .015, 380);
    },
    /**
     * Thunder. The sound lags the flash by the strike's distance. A close
     * strike tears with a run of sharp snaps and a heavy bang; every strike
     * then rolls in uneven swells of deep noise that echo off the land, more
     * muffled and drawn-out the further away it is. No two sound the same.
     * @param {number} x where the flash was across the view, 0 … 1
     */
    thunder(intensity = .5, distance = .5, x = .5) {
      if (!audio || !enabled) return;
      const { context, master, noiseBuffer, brownBuffer, echo } = audio;
      const strength = clamp(intensity, 0, 1);
      const proximity = 1 - clamp(distance, 0, 1);
      const random = (low, high) => low + Math.random() * (high - low);
      const start = context.currentTime + .03 + distance ** 1.2 * 2.8;

      const out = context.createGain();
      const pan = context.createStereoPanner();
      const wet = context.createGain();
      pan.pan.value = clamp((x - .5) * 1.4, -.8, .8) * (.4 + proximity * .6);
      wet.gain.value = .35 + distance * .65;
      out.connect(pan); pan.connect(master); pan.connect(wet); wet.connect(echo);

      const burst = (buffer, at, duration, peak, filters, offset = 0) => {
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        let node = source;
        for (const filter of filters) { node.connect(filter); node = filter; }
        node.connect(gain); gain.connect(out);
        gain.gain.setValueAtTime(.0001, at);
        gain.gain.exponentialRampToValueAtTime(peak, at + .003);
        gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
        source.start(at, offset); source.stop(at + duration + .02);
      };
      const filter = (type, frequency, q = .7) => {
        const node = context.createBiquadFilter();
        node.type = type; node.frequency.value = frequency; node.Q.value = q;
        return node;
      };

      if (proximity > .35) {
        // The tearing crack: a quick run of snaps, each a little lower.
        const snaps = 3 + Math.floor(Math.random() * (1 + proximity * 4));
        let at = start;
        for (let snap = 0; snap < snaps; snap++) {
          burst(
            noiseBuffer, at, random(.02, .06),
            (.08 + strength * .08) * proximity * (1 - snap / snaps * .5),
            [filter('highpass', random(900, 2600) * (1 - snap / snaps * .5))],
            Math.random() * .9,
          );
          at += random(.012, .05);
        }
        // Then the bang: broadband, closing down fast.
        const bang = context.createBufferSource();
        const bangFilter = filter('lowpass', 3200 * proximity + 400);
        const bangGain = context.createGain();
        bang.buffer = noiseBuffer;
        bangFilter.frequency.setValueAtTime(3200 * proximity + 400, at);
        bangFilter.frequency.exponentialRampToValueAtTime(160, at + .6);
        bangGain.gain.setValueAtTime(.0001, at);
        bangGain.gain.exponentialRampToValueAtTime((.12 + strength * .1) * proximity, at + .008);
        bangGain.gain.exponentialRampToValueAtTime(.0001, at + .7);
        bang.connect(bangFilter); bangFilter.connect(bangGain); bangGain.connect(out);
        bang.start(at, Math.random() * .3); bang.stop(at + .75);
        // A felt thump under it.
        const thump = context.createOscillator();
        const thumpGain = context.createGain();
        thump.frequency.setValueAtTime(52, at);
        thump.frequency.exponentialRampToValueAtTime(26, at + .8);
        thumpGain.gain.setValueAtTime(.0001, at);
        thumpGain.gain.exponentialRampToValueAtTime(.12 * proximity * (.6 + strength * .4), at + .02);
        thumpGain.gain.exponentialRampToValueAtTime(.0001, at + .9);
        thump.connect(thumpGain); thumpGain.connect(out);
        thump.start(at); thump.stop(at + 1);
      }

      // The roll: deep noise in uneven swells, fading and darkening.
      const duration = 3 + distance * 3.5 + strength * 1.5 + Math.random() * 1.5;
      const volume = (.09 + strength * .08) * (.45 + proximity * .55);
      const roll = context.createBufferSource();
      const rollHighpass = filter('highpass', 28);
      const rollLowpass = filter('lowpass', 900, .5);
      const rollGain = context.createGain();
      roll.buffer = brownBuffer; roll.loop = true;
      const bright = 160 + proximity * 900;
      rollLowpass.frequency.setValueAtTime(bright, start);
      rollLowpass.frequency.exponentialRampToValueAtTime(70 + proximity * 60, start + duration);
      rollGain.gain.setValueAtTime(.0001, start);
      let at = start + (proximity > .35 ? .05 : random(.15, .5) * (.5 + distance));
      rollGain.gain.exponentialRampToValueAtTime(.0001 + volume * .5, at);
      while (at < start + duration * .85) {
        const fade = 1 - (at - start) / duration;
        const rise = random(.12, .5);
        rollGain.gain.linearRampToValueAtTime(volume * random(.5, 1) * fade, at + rise);
        const fall = random(.2, .7);
        rollGain.gain.linearRampToValueAtTime(volume * random(.12, .4) * fade, at + rise + fall);
        at += rise + fall;
      }
      rollGain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      roll.connect(rollHighpass); rollHighpass.connect(rollLowpass); rollLowpass.connect(rollGain); rollGain.connect(out);
      roll.start(start, Math.random() * 5); roll.stop(start + duration + .1);
    },
    /** The finish jingle; a gold time adds a short da-DAA on the end. */
    win(gold = false) {
      [523, 659, 784, 1047].forEach((note, index) => playTone(note, .18, 'square', .055, index * .1, note));
      if (!gold) return;
      playTone(784, .1, 'square', .05, .44);
      playTone(1047, .42, 'square', .055, .54);
      // A softer third above the last note makes it ring like a chord.
      playTone(1319, .42, 'triangle', .04, .54);
    },
    /**
     * A firework going up: the soft puff of the lift charge, then the rush of
     * the rocket through the air for as long as it climbs, a hiss that dulls
     * and fades as it gets further away, roughened by the fizz of its fuel.
     * @param {number} x where it goes up across the view, 0 … 1
     * @param {number} flight how long (s) it climbs before it bursts
     */
    fireworkLaunch(x = .5, flight = 1.5) {
      if (!audio || !enabled) return;
      const { context, master, noiseBuffer } = audio;
      const start = context.currentTime;
      const pan = context.createStereoPanner();
      pan.pan.value = clamp((x - .5) * 1.6, -.8, .8);
      pan.connect(master);
      const grain = (at, length, peak, type, frequency) => {
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        source.buffer = noiseBuffer;
        filter.type = type; filter.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, at);
        gain.gain.exponentialRampToValueAtTime(peak, at + .003);
        gain.gain.exponentialRampToValueAtTime(.0001, at + length);
        source.connect(filter); filter.connect(gain); gain.connect(pan);
        source.start(at, Math.random() * .9); source.stop(at + length + .02);
      };
      grain(start, .1, .07, 'lowpass', 450);

      // The rush: loud and bright as it leaves, duller and fainter as it climbs.
      const rush = context.createBufferSource();
      const band = context.createBiquadFilter();
      const gain = context.createGain();
      rush.buffer = noiseBuffer; rush.loop = true;
      band.type = 'bandpass'; band.Q.value = .8;
      band.frequency.setValueAtTime(3200 + Math.random() * 800, start);
      band.frequency.exponentialRampToValueAtTime(1300, start + flight);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(.06, start + .06);
      gain.gain.exponentialRampToValueAtTime(.025, start + flight * .4);
      gain.gain.exponentialRampToValueAtTime(.0001, start + flight);
      rush.connect(band); band.connect(gain); gain.connect(pan);
      rush.start(start, Math.random() * .5); rush.stop(start + flight + .02);

      // The fizz on top: grains packed close at first, sparser and fainter later.
      for (let at = .02; at < flight * .8; at += .008 + Math.random() * .018 * (1 + at * 2)) {
        const away = 1 - at / flight;
        grain(start + at, .01 + Math.random() * .02, (.012 + Math.random() * .02) * away, 'highpass', 2500 + Math.random() * 2500);
      }
    },
    /**
     * A firework bursting: a sharp report with no note to it, bouncing back
     * off the land and the buildings as a few duller echoes, under a rolling
     * tail like far thunder, then the stars crackling as they burn out.
     * @param {number} x where it bursts across the view, 0 … 1
     */
    fireworkBurst(x = .5) {
      if (!audio || !enabled) return;
      const { context, master, noiseBuffer, brownBuffer, echo } = audio;
      const start = context.currentTime;
      const out = context.createGain();
      const pan = context.createStereoPanner();
      const wet = context.createGain();
      pan.pan.value = clamp((x - .5) * 1.6, -.8, .8);
      wet.gain.value = .9;
      out.connect(pan); pan.connect(master); pan.connect(wet); wet.connect(echo);

      // A report: broadband noise that snaps on and closes down. The echoes
      // are the same, later, quieter and darker.
      const report = (at, peak, bright, length) => {
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        source.buffer = noiseBuffer;
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(bright, at);
        filter.frequency.exponentialRampToValueAtTime(Math.max(120, bright / 12), at + length);
        gain.gain.setValueAtTime(.0001, at);
        gain.gain.exponentialRampToValueAtTime(peak, at + .002);
        gain.gain.exponentialRampToValueAtTime(peak * .25, at + .03);
        gain.gain.exponentialRampToValueAtTime(.0001, at + length);
        source.connect(filter); filter.connect(gain); gain.connect(out);
        source.start(at, Math.random() * .5); source.stop(at + length + .02);
      };
      report(start, .2 + Math.random() * .05, 5200, .35);
      let at = start;
      for (let bounce = 1; bounce <= 3; bounce++) {
        at += .09 + Math.random() * .16;
        report(at, .07 / bounce, 1800 / bounce, .3);
      }

      // The roll: deep noise dying away slowly, the air still ringing.
      const roll = context.createBufferSource();
      const rollFilter = context.createBiquadFilter();
      const rollGain = context.createGain();
      roll.buffer = brownBuffer;
      rollFilter.type = 'lowpass'; rollFilter.frequency.value = 380;
      rollGain.gain.setValueAtTime(.0001, start);
      rollGain.gain.exponentialRampToValueAtTime(.07, start + .03);
      rollGain.gain.exponentialRampToValueAtTime(.0001, start + 1.8);
      roll.connect(rollFilter); rollFilter.connect(rollGain); rollGain.connect(out);
      roll.start(start, Math.random() * 4); roll.stop(start + 1.85);

      // The crackle: tiny bright snaps, scattered as the stars fall.
      const snaps = 10 + Math.floor(Math.random() * 18);
      for (let snap = 0; snap < snaps; snap++) {
        const at = start + .35 + Math.random() * Math.random() * 1.1;
        const source = context.createBufferSource();
        const high = context.createBiquadFilter();
        const gain = context.createGain();
        source.buffer = noiseBuffer;
        high.type = 'highpass'; high.frequency.value = 2500 + Math.random() * 3000;
        gain.gain.setValueAtTime(.0001, at);
        gain.gain.exponentialRampToValueAtTime(.015 + Math.random() * .03, at + .002);
        gain.gain.exponentialRampToValueAtTime(.0001, at + .015 + Math.random() * .02);
        source.connect(high); high.connect(gain); gain.connect(out);
        source.start(at, Math.random() * .9); source.stop(at + .05);
      }
    }
  };
}
