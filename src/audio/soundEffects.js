// One-shot synthesized sounds: gunshots per weapon, explosions, crashes, punches, footsteps,
// screams, reloads, pickups and the menu / mission jingles. All made from oscillators and
// filtered noise, placed in the world by the audio engine.

export function createSoundEffects(audio) {
  /** A filtered noise burst with an attack/decay envelope into `out`. */
  function noiseHit(out, { type = 'lowpass', freq = 1200, q = 0.7, attack = 0.002, decay = 0.2, level = 1, endFreq = null, when = 0 }) {
    const ctx = audio.ctx;
    const t = ctx.currentTime + when;
    const src = audio.noiseSource();
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (endFreq) filter.frequency.exponentialRampToValueAtTime(endFreq, t + decay);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(filter);
    filter.connect(g);
    g.connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + decay + 0.05);
  }

  /** A pitched tone with a glide and decay. */
  function tone(out, { type = 'sine', from = 440, to = null, attack = 0.005, decay = 0.2, level = 0.5, when = 0 }) {
    const ctx = audio.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  function at(x, z, range) {
    return audio.spatial(x, z, range);
  }

  const GUNS = {
    pistol: { freq: 2600, decay: 0.16, level: 0.9, thump: 140 },
    smg: { freq: 3000, decay: 0.09, level: 0.7, thump: 170 },
    shotgun: { freq: 1500, decay: 0.38, level: 1.0, thump: 90 },
    rifle: { freq: 3400, decay: 0.14, level: 0.85, thump: 120 },
  };

  return {
    gunshot(x, z, weapon = 'pistol') {
      const out = at(x, z, 220);
      if (!out) return;
      const g = GUNS[weapon] ?? GUNS.pistol;
      noiseHit(out, { type: 'lowpass', freq: g.freq, endFreq: 400, decay: g.decay, level: g.level });
      noiseHit(out, { type: 'highpass', freq: 3500, decay: 0.04, level: 0.4 });
      tone(out, { type: 'sine', from: g.thump, to: 40, decay: g.decay * 1.2, level: 0.8 });
    },
    explosion(x, z) {
      const out = at(x, z, 400);
      if (!out) return;
      noiseHit(out, { type: 'lowpass', freq: 1800, endFreq: 120, attack: 0.01, decay: 1.8, level: 1 });
      tone(out, { type: 'sine', from: 80, to: 25, decay: 1.2, level: 1 });
      noiseHit(out, { type: 'bandpass', freq: 600, decay: 0.5, level: 0.6, when: 0.05 });
    },
    crash(x, z, impact) {
      const out = at(x, z, 120);
      if (!out) return;
      const level = Math.min(1, impact / 20);
      noiseHit(out, { type: 'lowpass', freq: 900, endFreq: 200, decay: 0.35, level });
      tone(out, { type: 'square', from: 220 + Math.random() * 120, to: 90, decay: 0.18, level: level * 0.25 });
      noiseHit(out, { type: 'bandpass', freq: 3200, q: 3, decay: 0.25, level: level * 0.3, when: 0.03 });
    },
    punch(x, z, hit) {
      const out = at(x, z, 40);
      if (!out) return;
      noiseHit(out, { type: 'lowpass', freq: hit ? 900 : 2500, decay: 0.08, level: hit ? 0.8 : 0.2 });
      if (hit) tone(out, { from: 110, to: 50, decay: 0.12, level: 0.6 });
    },
    footstep(x, z, run) {
      const out = at(x, z, 25);
      if (!out) return;
      noiseHit(out, { type: 'bandpass', freq: 900 + Math.random() * 500, q: 1.2, decay: 0.05, level: run ? 0.22 : 0.12 });
    },
    scream(x, z) {
      const out = at(x, z, 50);
      if (!out) return;
      const f = 500 + Math.random() * 400;
      tone(out, { type: 'sawtooth', from: f, to: f * 1.4, attack: 0.05, decay: 0.5, level: 0.06 });
    },
    reload() {
      if (!audio.ctx) return;
      tone(audio.sfx, { type: 'square', from: 1800, decay: 0.03, level: 0.08 });
      tone(audio.sfx, { type: 'square', from: 1200, decay: 0.03, level: 0.08, when: 0.35 });
      tone(audio.sfx, { type: 'square', from: 2200, decay: 0.03, level: 0.1, when: 0.9 });
    },
    dryFire() {
      if (!audio.ctx) return;
      tone(audio.sfx, { type: 'square', from: 2600, decay: 0.02, level: 0.08 });
    },
    door() {
      if (!audio.ctx) return;
      noiseHit(audio.sfx, { type: 'lowpass', freq: 700, decay: 0.12, level: 0.4 });
      tone(audio.sfx, { type: 'sine', from: 160, to: 90, decay: 0.1, level: 0.3 });
    },
    pickup() {
      if (!audio.ctx) return;
      tone(audio.sfx, { type: 'triangle', from: 880, decay: 0.08, level: 0.25 });
      tone(audio.sfx, { type: 'triangle', from: 1320, decay: 0.15, level: 0.25, when: 0.08 });
    },
    cash() {
      if (!audio.ctx) return;
      tone(audio.sfx, { type: 'square', from: 1568, decay: 0.06, level: 0.12 });
      tone(audio.sfx, { type: 'square', from: 2093, decay: 0.2, level: 0.12, when: 0.07 });
    },
    uiMove() {
      if (!audio.ctx) return;
      tone(audio.sfx, { type: 'sine', from: 760, decay: 0.05, level: 0.15 });
    },
    uiSelect() {
      if (!audio.ctx) return;
      tone(audio.sfx, { type: 'triangle', from: 660, decay: 0.07, level: 0.22 });
      tone(audio.sfx, { type: 'triangle', from: 990, decay: 0.12, level: 0.22, when: 0.06 });
    },
    checkpoint() {
      if (!audio.ctx) return;
      tone(audio.sfx, { type: 'triangle', from: 1046, decay: 0.12, level: 0.3 });
      tone(audio.sfx, { type: 'triangle', from: 1568, decay: 0.2, level: 0.3, when: 0.09 });
    },
    missionPassed() {
      if (!audio.ctx) return;
      const notes = [523, 659, 784, 1046, 784, 1046, 1318];
      notes.forEach((f, i) => tone(audio.sfx, { type: i % 2 ? 'triangle' : 'square', from: f, decay: i === notes.length - 1 ? 0.9 : 0.16, level: 0.14, when: i * 0.11 }));
    },
    missionFailed() {
      if (!audio.ctx) return;
      [392, 330, 262, 196].forEach((f, i) => tone(audio.sfx, { type: 'sawtooth', from: f, decay: 0.3, level: 0.1, when: i * 0.18 }));
    },
    flatlined() {
      if (!audio.ctx) return;
      tone(audio.sfx, { type: 'sawtooth', from: 220, to: 55, attack: 0.02, decay: 2.2, level: 0.18 });
      noiseHit(audio.sfx, { type: 'lowpass', freq: 400, decay: 1.5, level: 0.4 });
    },
    starUp() {
      if (!audio.ctx) return;
      tone(audio.sfx, { type: 'square', from: 988, decay: 0.08, level: 0.1 });
      tone(audio.sfx, { type: 'square', from: 740, decay: 0.12, level: 0.1, when: 0.09 });
    },
    lostCops() {
      if (!audio.ctx) return;
      [659, 784, 988].forEach((f, i) => tone(audio.sfx, { type: 'triangle', from: f, decay: 0.2, level: 0.18, when: i * 0.1 }));
    },
    splash(x, z) {
      const out = at(x, z, 80);
      if (!out) return;
      noiseHit(out, { type: 'lowpass', freq: 1500, endFreq: 300, decay: 0.7, level: 0.7 });
    },
  };
}
