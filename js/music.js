// Procedural chiptune music in the voice of the sound effects: pulse-wave
// leads, a triangle bass and noise drums, played by a small step sequencer
// on the game's audio context. Each world has its own mood (key, mode,
// tempo, grooves), and each trail grows its own tune from it: the melodies
// are made from motifs seeded by the trail's name, so a trail always plays
// the same tune and no two trails quite share one. Nothing here touches the
// simulation, so it is free to use Math.

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
// The bright, exotic minor of a desert tune: a flat second over a major third.
const PHRYGIAN_DOMINANT = [0, 1, 4, 5, 7, 8, 10];

const STEPS = 16;
const BARS = 8;
// How far ahead notes are scheduled. update() runs every frame, so this only
// has to cover a few slow frames.
const LOOKAHEAD = .3;
const FADE = .5;

/**
 * A song's moods. `chords` are the scale degrees under each of a part's
 * eight bars. Bass steps name chord tones: 1 the root, 3 the third, 5 the
 * fifth, 7 the seventh, 8 the octave, '.' a rest. Drum steps are 'x' for a
 * hit. The arpeggio walks `arp`'s chord tones, one every `arpRate` steps.
 */
const MOODS = {
  // The dashboard's tune: a bright little folk dance.
  menu: {
    tempo: 112, root: 43, scale: MAJOR,
    chords: { A: [0, 4, 5, 3, 0, 4, 3, 4], B: [3, 4, 2, 5, 1, 4, 0, 0] },
    bass: '1...5.5.1...5...',
    kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.',
    arp: '1358', arpRate: 2, lead: 'pulse25'
  },
  // Orchards and farms: an oom-pah polka in the open.
  hills: {
    tempo: 120, root: 38, scale: MAJOR,
    chords: { A: [0, 3, 4, 0, 0, 3, 4, 4], B: [3, 0, 4, 5, 3, 0, 4, 0] },
    bass: '1...5...1...5...',
    kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.',
    arp: '135', arpRate: 2, lead: 'pulse25'
  },
  // The woods: a lilting shuffle in dorian, like a wooden flute.
  forest: {
    tempo: 100, root: 38, scale: DORIAN, swing: .3,
    chords: { A: [0, 3, 0, 6, 0, 3, 6, 0], B: [2, 3, 6, 0, 2, 3, 4, 4] },
    bass: '1.....1.5...8...',
    kick: 'x.....x...x.....', snare: '....x.......x...', hat: '',
    arp: '15', arpRate: 4, lead: 'pulse50', soft: true
  },
  // The desert: a darbuka beat under a snake-charmer's mode.
  desert: {
    tempo: 96, root: 40, scale: PHRYGIAN_DOMINANT,
    chords: { A: [0, 1, 0, 1, 0, 6, 1, 0], B: [3, 3, 0, 0, 6, 6, 1, 0] },
    bass: '1..1..5.1..1..5.',
    kick: 'x..x..x.....x...', snare: '....x.....x.x...', hat: '..x...x.x...x..x',
    arp: '', arpRate: 2, lead: 'pulse25', echo: true
  },
  // Lakeland: a gentle, rippling tune for rain on the water.
  lakes: {
    tempo: 88, root: 41, scale: MAJOR, swing: .2,
    chords: { A: [0, 3, 0, 3, 5, 3, 4, 4], B: [5, 3, 0, 4, 5, 3, 4, 0] },
    bass: '1.......5...3...',
    kick: 'x.......x.......', snare: '', hat: '....x.......x...',
    arp: '13581358', arpRate: 1, lead: 'triangle', echo: true, soft: true
  },
  // Underground: a slow drone in the dark, dripping echoes.
  caves: {
    tempo: 76, root: 33, scale: MINOR,
    chords: { A: [0, 0, 5, 5, 3, 3, 4, 4], B: [0, 5, 6, 4, 0, 5, 3, 4] },
    bass: '1.......1.......',
    kick: 'x...............', snare: '', hat: '',
    arp: '15', arpRate: 4, lead: 'triangle', echo: true, soft: true, sparse: true
  },
  // The city: a funky minor groove.
  city: {
    tempo: 118, root: 36, scale: DORIAN,
    chords: { A: [0, 3, 0, 3, 5, 4, 0, 4], B: [5, 6, 0, 0, 5, 6, 4, 4] },
    bass: '1..8..1.5.7.1...',
    kick: 'x..x....x.x.....', snare: '....x.......x..x', hat: 'x.x.x.x.x.x.x.x.',
    arp: '', arpRate: 2, lead: 'pulse12'
  },
  // The mountains: driving eighths for the final tests.
  mountains: {
    tempo: 124, root: 38, scale: MINOR,
    chords: { A: [0, 5, 2, 6, 0, 5, 6, 4], B: [3, 0, 6, 5, 3, 4, 0, 0] },
    bass: '1.1.1.1.1.1.5.8.',
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
    arp: '158', arpRate: 2, lead: 'pulse25'
  }
};

const WORLD_MOODS = {
  'First Rides': 'hills', 'The Woods': 'forest', 'The Desert': 'desert', 'Lakeland': 'lakes',
  'Underground': 'caves', 'The City': 'city', 'The Mountains': 'mountains'
};
const BACKDROP_MOODS = { hills: 'hills', forest: 'forest', desert: 'desert', city: 'city', mountains: 'mountains' };

// A song goes groove, tune, second tune, tune again with a new ending, then
// a quiet break before it loops, so the lead isn't on all the time.
const FORM = [
  { part: 'A', lead: false },
  { part: 'A', lead: true },
  { part: 'B', lead: true },
  { part: 'A', lead: true, variant: true },
  { part: 'B', lead: false, drums: false }
];

// Lead rhythms: 'x' starts a note, '-' holds it, '.' rests.
const RHYTHMS = [
  'x-x-x-x-x---x-x-', 'x---x-x-x-----..', 'x-xxx-x-x---x...', 'x--x--x-x-x-x---',
  'x-------x-x-x---', 'x---x---x---x---', 'x-x-x---x-x-x---', '..x-x-x-x---x-x-'
];
const SPARSE_RHYTHMS = ['x-------....x---', 'x-----------....', '....x-------x---'];
const CADENCES = ['x---x---x-------', 'x-x-x-----------', 'x-------x-------'];

/**
 * Which mood plays on a trail: its world's, or for a trail outside the
 * career its backdrop's.
 * @param {{ name?: string, world?: string, backdrop?: string, timeOfDay?: number } | undefined} trail
 */
export function trailMood(trail) {
  const mood = WORLD_MOODS[trail?.world] || BACKDROP_MOODS[trail?.backdrop] || 'hills';
  const hour = ((Number(trail?.timeOfDay ?? 12) % 24) + 24) % 24;
  return { mood, night: hour >= 21 || hour < 5, seed: `${mood}:${trail?.name ?? ''}` };
}

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/** A small seeded generator (mulberry32), so a trail's tune never changes. */
function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The pitch of a scale degree above the song's root; degrees run past the octave. */
function degreeToMidi(song, degree) {
  const octave = Math.floor(degree / 7);
  return song.root + song.scale[degree - octave * 7] + octave * 12;
}

/** The scale degree of a bass or arpeggio chord tone ('1', '3', '5', '7', '8'). */
function chordTone(chord, tone) {
  return chord + ({ 1: 0, 3: 2, 5: 4, 7: 6, 8: 7 })[tone];
}

/**
 * The lead line for a part: a motif, an answer, the motif again over the
 * new chords, and a cadence, twice, the second time ending home. Strong
 * beats land on chord tones; the notes between walk the scale.
 */
function composePart(song, chords, random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const rhythms = song.sparse ? SPARSE_RHYTHMS : RHYTHMS;
  const motif = () => {
    const rhythm = pick(rhythms);
    const moves = [...rhythm].map(() => pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]));
    return { rhythm, moves, anchor: pick([0, 2, 4]) };
  };
  const call = motif(), answer = motif(), turn = motif();
  let previous = 9;
  const realize = (shape, chord, last = false) => {
    const notes = [];
    let degree = chord + 7 + shape.anchor;
    // Start near the last note, an octave either way, so the line flows.
    while (degree - previous > 4) degree -= 7;
    while (previous - degree > 4) degree += 7;
    for (let step = 0; step < STEPS; step++) {
      if (shape.rhythm[step] !== 'x') continue;
      if (notes.length) degree += shape.moves[step];
      if (step % 4 === 0) {
        // Snap strong beats to the nearest chord tone.
        const tones = [0, 2, 4, 7, 9, 11, 14].map(offset => chord + offset);
        degree = tones.reduce((best, tone) => (Math.abs(tone - degree) < Math.abs(best - degree) ? tone : best));
      }
      if (degree < 4) degree += 7;
      if (degree > 16) degree -= 7;
      let length = 1;
      while (step + length < STEPS && shape.rhythm[step + length] === '-') length++;
      notes.push({ step, length, degree });
    }
    // A phrase that ends home ends on the chord's root.
    if (last && notes.length) {
      const final = notes[notes.length - 1];
      final.degree = chord + (final.degree > chord + 10 ? 14 : 7);
    }
    if (notes.length) previous = notes[notes.length - 1].degree;
    return notes;
  };
  const cadence = (chord, home) => realize({ rhythm: pick(CADENCES), moves: [...'0000000000000000'].map(() => pick([-1, 1, 2])), anchor: home ? 0 : 4 }, chord, home);
  return [
    realize(call, chords[0]), realize(answer, chords[1]), realize(call, chords[2]), cadence(chords[3], false),
    realize(call, chords[4]), realize(answer, chords[5]), realize(turn, chords[6]), cadence(chords[7], true)
  ];
}

/** The song for a mood and seed: its mood with the lead lines composed. */
function composeSong(mood, seed, night) {
  const base = MOODS[mood] || MOODS.hills;
  const random = seededRandom(hashString(seed));
  const song = { ...base, night, tempo: base.tempo * (night ? .88 : 1) };
  song.lines = {
    A: composePart(song, base.chords.A, random),
    B: composePart(song, base.chords.B, random),
    // The variant keeps the first half and finds a new way home.
    Avariant: null
  };
  const variant = composePart(song, base.chords.A, random);
  song.lines.Avariant = [...song.lines.A.slice(0, 4), ...variant.slice(4)];
  return song;
}

/** A pulse wave's harmonics, kept few enough to stay soft and unaliased. */
function pulseWave(context, duty) {
  const harmonics = 24;
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  return context.createPeriodicWave(real, imag);
}

/**
 * The music player on a context. Each frame, update() is told which song
 * should be playing and how loud; it fades between songs and schedules the
 * notes a little ahead of time.
 * @param {AudioContext} context
 * @param {AudioNode} destination
 * @param {AudioBuffer} noiseBuffer
 */
export function createMusic(context, destination, noiseBuffer) {
  const bus = context.createGain();
  bus.gain.value = 0;
  const tone = context.createBiquadFilter();
  tone.type = 'lowpass'; tone.frequency.value = 6000; tone.Q.value = .5;
  bus.connect(tone); tone.connect(destination);
  // A feedback echo for the lead and arpeggio of the moods that want space.
  const echo = context.createDelay(1);
  const echoFeedback = context.createGain();
  const echoTone = context.createBiquadFilter();
  const echoSend = context.createGain();
  echoFeedback.gain.value = .38;
  echoTone.type = 'lowpass'; echoTone.frequency.value = 1800;
  echoSend.gain.value = 0;
  echoSend.connect(echo); echo.connect(echoTone); echoTone.connect(echoFeedback); echoFeedback.connect(echo);
  echoTone.connect(bus);

  const waves = { pulse12: pulseWave(context, .125), pulse25: pulseWave(context, .25), pulse50: pulseWave(context, .5) };
  const player = { key: '', song: null, section: 0, bar: 0, step: 0, nextTime: 0, switchAt: 0, pending: null, level: 0 };

  const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

  function voice(type, midi, at, length, volume, { send = 0, slide = 0 } = {}) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    if (waves[type]) oscillator.setPeriodicWave(waves[type]);
    else oscillator.type = /** @type {OscillatorType} */ (type);
    oscillator.frequency.setValueAtTime(frequency(midi + slide), at);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(frequency(midi), at + .04);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + .008);
    gain.gain.setValueAtTime(volume, at + length * .6);
    gain.gain.exponentialRampToValueAtTime(.0001, at + length);
    oscillator.connect(gain); gain.connect(bus);
    if (send) {
      const sendGain = context.createGain();
      sendGain.gain.value = send;
      gain.connect(sendGain); sendGain.connect(echoSend);
    }
    oscillator.start(at); oscillator.stop(at + length + .02);
  }

  function drum(kind, at, volume) {
    if (kind === 'kick') {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(150, at);
      oscillator.frequency.exponentialRampToValueAtTime(42, at + .12);
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + .005);
      gain.gain.exponentialRampToValueAtTime(.0001, at + .16);
      oscillator.connect(gain); gain.connect(bus);
      oscillator.start(at); oscillator.stop(at + .18);
      return;
    }
    const snare = kind === 'snare';
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = snare ? 'bandpass' : 'highpass';
    filter.frequency.value = snare ? 1800 : 7000;
    const length = snare ? .12 : .035;
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + .003);
    gain.gain.exponentialRampToValueAtTime(.0001, at + length);
    source.connect(filter); filter.connect(gain); gain.connect(bus);
    source.start(at, Math.random() * .8); source.stop(at + length + .02);
    if (snare) voice('triangle', 52, at, .07, volume * .5);
  }

  /** Every note that starts on one step of the song. */
  function playStep(song, at, stepLength) {
    const section = FORM[player.section];
    const { bar, step } = player;
    const chord = song.chords[section.part][bar];
    const night = song.night;
    const drums = section.drums !== false;
    const quiet = night ? .5 : 1;

    const bassTone = song.bass[step];
    if (bassTone && bassTone !== '.') {
      let length = 1;
      while (step + length < STEPS && song.bass[step + length] === '.' && length < 4) length++;
      // A bass below the low notes small speakers can play goes up an octave.
      const lift = song.root < 36 ? 12 : 0;
      voice('triangle', degreeToMidi(song, chordTone(chord, bassTone)) + lift, at, length * stepLength * .9, .07);
    }
    if (drums) {
      if (song.kick[step] === 'x') drum('kick', at, .09 * quiet);
      if (song.snare[step] === 'x' && !night) drum('snare', at, .03);
      if (song.hat[step] === 'x' && !night) drum('hat', at, step % 4 === 0 ? .014 : .009);
    }
    // The break swaps the drums for the arpeggio, so it always has a pulse.
    const arp = song.arp || (drums ? '' : '135');
    const arpRate = song.arp ? song.arpRate : 2;
    if (arp && step % arpRate === 0) {
      const tone = arp[(step / arpRate) % arp.length];
      voice('pulse12', degreeToMidi(song, chordTone(chord, tone)) + 24, at, stepLength * arpRate * .8, song.soft ? .012 : .014,
        { send: song.echo || night ? .7 : 0 });
    }
    if (section.lead) {
      const lines = song.lines[section.variant ? 'Avariant' : section.part];
      const note = lines[bar].find(candidate => candidate.step === step);
      if (note) {
        const type = song.lead;
        const volume = (type === 'triangle' ? .06 : song.soft ? .028 : .032) * (night ? .8 : 1);
        voice(type, degreeToMidi(song, note.degree) + 12, at, note.length * stepLength * .92, volume,
          { send: song.echo || night ? .5 : .12, slide: song.mood === 'desert' && note.length > 2 ? -1 : 0 });
      }
    }
  }

  function advance() {
    player.step++;
    if (player.step < STEPS) return;
    player.step = 0;
    player.bar++;
    if (player.bar < BARS) return;
    player.bar = 0;
    player.section = (player.section + 1) % FORM.length;
  }

  function start(target) {
    player.key = target.key;
    player.song = composeSong(target.mood, target.seed, target.night);
    player.song.mood = target.mood;
    // The level is set afresh, as the fade left the bus silent.
    Object.assign(player, { section: 0, bar: 0, step: 0, nextTime: context.currentTime + .05, level: -1 });
    const dark = target.night || target.mood === 'caves';
    tone.frequency.setTargetAtTime(dark ? 2400 : player.song.soft ? 4200 : 6000, context.currentTime, .05);
    echo.delayTime.setValueAtTime(60 / player.song.tempo * .75, context.currentTime);
    echoSend.gain.setValueAtTime(1, context.currentTime);
  }

  /**
   * @param {{ key: string, mood: string, seed: string, night: boolean, level: number } | null} target
   * the song that should play and how loud, or null for silence
   */
  function update(target) {
    const now = context.currentTime;
    const level = target ? target.level : 0;
    if (target && target.key !== player.key) {
      // Fade the old song out, then start the new one from the top.
      if (!player.pending || player.pending.key !== target.key) {
        player.pending = target;
        player.switchAt = player.song ? now + FADE : now;
        bus.gain.setTargetAtTime(0, now, FADE / 4);
      }
      if (now >= player.switchAt) {
        start(target);
        player.pending = null;
      } else return schedule(now, false);
    }
    if (level !== player.level) {
      player.level = level;
      bus.gain.setTargetAtTime(level, now, level > 0 ? .4 : FADE / 4);
    }
    schedule(now, level > 0);
  }

  function schedule(now, playing) {
    const song = player.song;
    if (!song) return;
    // While silent the song holds its place, so it carries on where it was.
    if (!playing) { player.nextTime = Math.max(player.nextTime, now + .05); return; }
    const stepLength = 60 / song.tempo / 4;
    // After a long stall the song skips ahead rather than playing catch-up.
    if (player.nextTime < now - .1) player.nextTime = now + .02;
    while (player.nextTime < now + LOOKAHEAD) {
      // Swing delays the off-beat eighths, for a shuffle.
      const swing = song.swing && player.step % 4 === 2 ? song.swing * 2 * stepLength : 0;
      playStep(song, player.nextTime + swing, stepLength);
      advance();
      player.nextTime += stepLength;
    }
  }

  return { update };
}
