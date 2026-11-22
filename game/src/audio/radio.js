// The car radio: a step sequencer that composes endless original songs for each station from a
// seed (key, chord progression, drum pattern, bass line, chords and a melody that repeats per
// section), played by small synth instruments with a lookahead scheduler.
import { RADIO_STATIONS } from '../data/radioStations.js';
import { createRandom } from '../core/random.js';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const BARS_PER_SONG = 32;

function midiToFreq(m) {
  return 440 * 2 ** ((m - 69) / 12);
}

/** Compose a song: key, progression, melody per section, and a name. */
function composeSong(station, index) {
  const rng = createRandom(station.id.length * 7919 + index * 104729 + 17);
  const scale = station.minor ? MINOR : MAJOR;
  const root = 45 + rng.int(0, 7);
  const progression = rng.pick(station.progressions);
  const melodies = [];
  for (let section = 0; section < 2; section += 1) {
    const bars = [];
    for (let bar = 0; bar < 4; bar += 1) {
      const steps = [];
      let degree = rng.int(0, 6);
      for (let s = 0; s < 16; s += 1) {
        const onBeat = s % 4 === 0;
        const play = onBeat ? rng.chance(0.75) : rng.chance(section === 0 ? 0.28 : 0.42);
        if (play) {
          degree = Math.max(-2, Math.min(9, degree + rng.pick([-2, -1, -1, 0, 1, 1, 2, 3])));
          steps.push({ s, degree, len: rng.pick([1, 2, 2, 3, 4]) });
        }
      }
      bars.push(steps);
    }
    melodies.push(bars);
  }
  const title = `${rng.pick(station.words)} ${rng.pick(station.words)}`;
  return { root, scale, progression, melodies, artist: rng.pick(station.artists), title, swing: station.style === 'tropical' ? 0.12 : 0 };
}

function degreeToMidi(song, degree, octave = 0) {
  const n = song.scale.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return song.root + song.scale[idx] + 12 * (oct + octave);
}

/** The triad (as MIDI notes) on a scale degree. */
function chordNotes(song, degree, octave = 1) {
  return [degreeToMidi(song, degree, octave), degreeToMidi(song, degree + 2, octave), degreeToMidi(song, degree + 4, octave)];
}

export function createRadio(audio) {
  let stationIndex = 0;
  let on = false;
  let out = null;
  let nextStepTime = 0;
  let step = 0;
  const songIndex = RADIO_STATIONS.map(() => 0);
  let song = composeSong(RADIO_STATIONS[0], 0);
  let listeners = [];

  function ensureOut() {
    if (out || !audio.ctx) return;
    const ctx = audio.ctx;
    out = ctx.createGain();
    out.gain.value = 0;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 60;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 9000;
    out.connect(hp);
    hp.connect(lp);
    lp.connect(audio.music);
  }

  // Instruments.
  function env(t, attack, decay, level) {
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(out);
    return g;
  }
  function osc(type, freq, t, dur, dest) {
    const o = audio.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }
  function kick(t, level = 0.9) {
    const g = env(t, 0.003, 0.28, level);
    const o = osc('sine', 150, t, 0.3, g);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.15);
  }
  function snare(t, level = 0.35) {
    const g = env(t, 0.002, 0.16, level);
    const f = audio.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.connect(g);
    const n = audio.noiseSource();
    n.connect(f);
    n.start(t, Math.random());
    n.stop(t + 0.2);
    osc('triangle', 190, t, 0.08, env(t, 0.002, 0.07, level * 0.6));
  }
  function hat(t, open = false, level = 0.1) {
    const g = env(t, 0.001, open ? 0.14 : 0.035, level);
    const f = audio.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    f.connect(g);
    const n = audio.noiseSource();
    n.connect(f);
    n.start(t, Math.random());
    n.stop(t + 0.2);
  }
  function bass(t, midi, dur, type = 'sawtooth', level = 0.22, cutoff = 600) {
    const g = env(t, 0.005, dur, level);
    const f = audio.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff * 2, t);
    f.frequency.exponentialRampToValueAtTime(cutoff * 0.5, t + dur);
    f.connect(g);
    osc(type, midiToFreq(midi), t, dur, f);
  }
  function sub808(t, midi, dur) {
    const g = env(t, 0.004, dur, 0.4);
    const o = osc('sine', midiToFreq(midi + 12), t, dur, g);
    o.frequency.exponentialRampToValueAtTime(midiToFreq(midi), t + 0.08);
  }
  function pad(t, notes, dur, level = 0.045) {
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = audio.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1600;
    f.connect(g);
    g.connect(out);
    for (const m of notes) {
      osc('sawtooth', midiToFreq(m) * 1.003, t, dur, f);
      osc('sawtooth', midiToFreq(m) * 0.997, t, dur, f);
    }
  }
  function pluck(t, midi, level = 0.12, dur = 0.35) {
    const g = env(t, 0.002, dur, level);
    osc('sine', midiToFreq(midi), t, dur, g);
    osc('sine', midiToFreq(midi) * 4.01, t, dur * 0.3, env(t, 0.002, dur * 0.25, level * 0.25));
  }
  function lead(t, midi, dur, type = 'square', level = 0.06) {
    const g = env(t, 0.01, dur, level);
    const f = audio.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2600;
    f.connect(g);
    const o = osc(type, midiToFreq(midi), t, dur, f);
    const vib = audio.ctx.createOscillator();
    vib.frequency.value = 5.5;
    const depth = audio.ctx.createGain();
    depth.gain.value = midiToFreq(midi) * 0.006;
    vib.connect(depth);
    depth.connect(o.frequency);
    vib.start(t);
    vib.stop(t + dur + 0.05);
  }
  function stab(t, notes, level = 0.05) {
    const g = env(t, 0.003, 0.18, level);
    for (const m of notes) osc('sawtooth', midiToFreq(m), t, 0.2, g);
  }

  /** Schedule one sixteenth-note step of the current station at time t. */
  function playStep(t, stepIndex) {
    const station = RADIO_STATIONS[stationIndex];
    const s = stepIndex % 16;
    const bar = Math.floor(stepIndex / 16);
    const songBar = bar % BARS_PER_SONG;
    const chordDegree = song.progression[songBar % 4];
    const section = Math.floor(songBar / 8) % 2;
    const intro = songBar < 2;
    const chord = chordNotes(song, chordDegree, 1);
    const stepDur = 60 / station.bpm / 4;
    const melodyBar = song.melodies[section][songBar % 4];
    const melodyNote = melodyBar.find((n) => n.s === s);
    if (station.style === 'synthwave') {
      if (s % 4 === 0) kick(t);
      if (s === 4 || s === 12) snare(t, 0.32);
      if (s % 2 === 0) hat(t, s % 4 === 2, 0.07);
      if (s % 2 === 0) bass(t, degreeToMidi(song, chordDegree, -1) + (s % 4 === 2 ? 12 : 0), stepDur * 1.6, 'sawtooth', 0.16, 700);
      if (s === 0) pad(t, chord, stepDur * 16);
      if (!intro) pluck(t, chord[(s >> 0) % 3] + 12, 0.035, 0.18);
      if (melodyNote && section === 1) lead(t, degreeToMidi(song, melodyNote.degree, 1) + 12, stepDur * melodyNote.len, 'square', 0.045);
    } else if (station.style === 'tropical') {
      if (s % 4 === 0) kick(t, 0.6);
      if (s === 4 || s === 12) snare(t, 0.16);
      if (s % 2 === 1) hat(t, false, 0.045);
      if (s === 0 || s === 6 || s === 10) bass(t, degreeToMidi(song, chordDegree, -1), stepDur * 2.5, 'triangle', 0.3, 500);
      if (s % 4 === 2) for (const m of chord) pluck(t, m + 12, 0.05, 0.3);
      if (melodyNote && !intro) pluck(t, degreeToMidi(song, melodyNote.degree, 2), 0.09, 0.45);
    } else {
      if (s % 4 === 0) kick(t, 0.85);
      if (s === 3 || s === 6 || s === 11 || s === 14) snare(t, 0.26);
      if (s % 2 === 0) hat(t, false, 0.05);
      if (s === 0 || s === 8) sub808(t, degreeToMidi(song, chordDegree, -1), stepDur * 6);
      if (s === 0 || s === 7 || s === 10) stab(t, chord, 0.035);
      if (melodyNote && section === 1 && !intro) lead(t, degreeToMidi(song, melodyNote.degree, 1), stepDur * melodyNote.len, 'sawtooth', 0.035);
    }
    // Next song after the last bar.
    if (songBar === BARS_PER_SONG - 1 && s === 15) {
      songIndex[stationIndex] += 1;
      song = composeSong(station, songIndex[stationIndex]);
      for (const fn of listeners) fn(nowPlaying());
    }
  }

  function nowPlaying() {
    const station = RADIO_STATIONS[stationIndex];
    return { station: station.name, tagline: station.tagline, artist: song.artist, title: song.title, on };
  }

  return {
    stations: RADIO_STATIONS,
    get on() {
      return on;
    },
    get stationIndex() {
      return stationIndex;
    },
    nowPlaying,
    onSongChange(fn) {
      listeners.push(fn);
    },
    setOn(value) {
      if (!audio.ctx) return;
      ensureOut();
      if (value === on) return;
      on = value;
      const t = audio.now();
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(on ? 0.9 : 0, t, 0.15);
      if (on) {
        nextStepTime = t + 0.05;
        step = 0;
      }
    },
    /** Change station by +1/-1 (wrapping through "off" at the end). */
    tune(delta) {
      stationIndex = (stationIndex + delta + RADIO_STATIONS.length) % RADIO_STATIONS.length;
      song = composeSong(RADIO_STATIONS[stationIndex], songIndex[stationIndex]);
      step = 0;
      if (audio.ctx) nextStepTime = audio.now() + 0.08;
      return nowPlaying();
    },
    /** Schedule ahead; call often (every frame). */
    pump() {
      if (!on || !audio.ctx || !out) return;
      const ctx = audio.ctx;
      const station = RADIO_STATIONS[stationIndex];
      const stepDur = 60 / station.bpm / 4;
      if (nextStepTime < ctx.currentTime - 0.2) nextStepTime = ctx.currentTime + 0.02;
      while (nextStepTime < ctx.currentTime + 0.15) {
        const swing = step % 2 === 1 ? song.swing * stepDur : 0;
        playStep(nextStepTime + swing, step);
        nextStepTime += stepDur;
        step += 1;
      }
    },
  };
}
