// Continuous sounds: the player's engine (pitch follows simulated gears and revs), tyre screech
// while sliding, the horn, the nearest police siren (wail far, yelp close), the helicopter's
// rotor thump and the surf near the beach.
import { dist2d, clamp } from '../core/mathUtils.js';

export function createVehicleAudio(audio) {
  let nodes = null;
  let hornUntil = 0;

  function build() {
    const ctx = audio.ctx;
    const out = audio.sfx;
    const mk = (type, freq) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.start();
      return o;
    };
    // Engine: two detuned oscillators through a low-pass.
    const engA = mk('sawtooth', 60);
    const engB = mk('square', 30);
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 600;
    const engGain = ctx.createGain();
    engGain.gain.value = 0;
    engA.connect(engFilter);
    engB.connect(engFilter);
    engFilter.connect(engGain);
    engGain.connect(out);
    // Screech: band-passed noise.
    const screechSrc = audio.noiseSource(true);
    screechSrc.start();
    const screechFilter = ctx.createBiquadFilter();
    screechFilter.type = 'bandpass';
    screechFilter.frequency.value = 2400;
    screechFilter.Q.value = 6;
    const screechGain = ctx.createGain();
    screechGain.gain.value = 0;
    screechSrc.connect(screechFilter);
    screechFilter.connect(screechGain);
    screechGain.connect(out);
    // Horn: two square waves a third apart.
    const hornA = mk('square', 392);
    const hornB = mk('square', 494);
    const hornFilter = ctx.createBiquadFilter();
    hornFilter.type = 'lowpass';
    hornFilter.frequency.value = 1800;
    const hornGain = ctx.createGain();
    hornGain.gain.value = 0;
    hornA.connect(hornFilter);
    hornB.connect(hornFilter);
    hornFilter.connect(hornGain);
    hornGain.connect(out);
    // Siren.
    const siren = mk('triangle', 800);
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    const sirenPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    siren.connect(sirenGain);
    if (sirenPan) {
      sirenGain.connect(sirenPan);
      sirenPan.connect(out);
    } else sirenGain.connect(out);
    // Helicopter: noise chopped by a low-frequency square.
    const heliSrc = audio.noiseSource(true);
    heliSrc.start();
    const heliFilter = ctx.createBiquadFilter();
    heliFilter.type = 'lowpass';
    heliFilter.frequency.value = 320;
    const heliChop = ctx.createGain();
    heliChop.gain.value = 0;
    const chopLfo = mk('square', 11);
    const chopDepth = ctx.createGain();
    chopDepth.gain.value = 0.5;
    chopLfo.connect(chopDepth);
    const heliGain = ctx.createGain();
    heliGain.gain.value = 0;
    heliSrc.connect(heliFilter);
    heliFilter.connect(heliChop);
    chopDepth.connect(heliChop.gain);
    heliChop.connect(heliGain);
    heliGain.connect(out);
    // Surf.
    const surfSrc = audio.noiseSource(true);
    surfSrc.start();
    const surfFilter = ctx.createBiquadFilter();
    surfFilter.type = 'lowpass';
    surfFilter.frequency.value = 500;
    const surfGain = ctx.createGain();
    surfGain.gain.value = 0;
    surfSrc.connect(surfFilter);
    surfFilter.connect(surfGain);
    surfGain.connect(out);
    nodes = { engA, engB, engFilter, engGain, screechGain, hornGain, siren, sirenGain, sirenPan, heliChop, heliGain, surfGain, surfFilter };
  }

  function set(param, value, t, rate = 0.06) {
    param.setTargetAtTime(value, t, rate);
  }

  return {
    horn() {
      hornUntil = audio.now() + 0.12;
    },
    /** Update every continuous voice from the game state. */
    update(game, active) {
      if (!audio.ctx) return;
      if (!nodes) build();
      const t = audio.now();
      const pv = game.player.vehicle;
      // Engine with simulated gears.
      if (active && pv && !pv.destroyed && !pv.sunk) {
        const speed = Math.abs(pv.forwardSpeed);
        const top = pv.spec.maxSpeed;
        const gears = 5;
        const ratio = clamp(speed / top, 0, 1) * gears;
        const gear = Math.min(gears - 1, Math.floor(ratio));
        const rev = gear === 0 ? ratio : ratio - gear;
        const rpm = 0.25 + rev * 0.75 + Math.abs(pv.controls.throttle) * 0.1;
        const base = pv.spec.model === 'sports' || pv.spec.model === 'muscle' ? 55 : pv.spec.model === 'truck' || pv.spec.model === 'van' ? 35 : 45;
        set(nodes.engA.frequency, base + rpm * base * 2.2, t);
        set(nodes.engB.frequency, (base + rpm * base * 2.2) * 0.5, t);
        set(nodes.engFilter.frequency, 300 + rpm * 1400 + Math.abs(pv.controls.throttle) * 400, t);
        set(nodes.engGain.gain, 0.06 + Math.abs(pv.controls.throttle) * 0.06, t);
        set(nodes.screechGain.gain, pv.drifting ? clamp((Math.abs(pv.lateralSpeed) - 3) * 0.03, 0, 0.18) : 0, t, 0.04);
      } else {
        set(nodes.engGain.gain, 0, t);
        set(nodes.screechGain.gain, 0, t);
      }
      set(nodes.hornGain.gain, active && t < hornUntil ? 0.09 : 0, t, 0.01);
      // Nearest siren.
      let nearest = null;
      let nd = 140;
      for (const v of game.vehicles) {
        if (!v.sirenOn || v.destroyed) continue;
        const d = dist2d(v.position.x, v.position.z, audio.listener.x, audio.listener.z);
        if (d < nd) {
          nd = d;
          nearest = v;
        }
      }
      if (active && nearest) {
        const close = nd < 30;
        const period = close ? 0.35 : 3.2;
        const phase = (t % period) / period;
        const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
        set(nodes.siren.frequency, close ? 900 + tri * 700 : 650 + tri * 700, t, 0.02);
        set(nodes.sirenGain.gain, 0.09 * (1 - nd / 140) ** 1.3, t);
        if (nodes.sirenPan) {
          const dx = nearest.position.x - audio.listener.x;
          const dz = nearest.position.z - audio.listener.z;
          const rx = -Math.cos(audio.listener.yaw);
          const rz = Math.sin(audio.listener.yaw);
          set(nodes.sirenPan.pan, clamp(((dx * rx + dz * rz) / (nd || 1)) * 0.7, -1, 1), t);
        }
      } else {
        set(nodes.sirenGain.gain, 0, t);
      }
      // Helicopter.
      const heli = game.police.helicopter;
      if (active && heli) {
        const d = dist2d(heli.position.x, heli.position.z, audio.listener.x, audio.listener.z);
        set(nodes.heliGain.gain, 0.5 * Math.max(0, 1 - d / 250), t);
        set(nodes.heliChop.gain, 0.5, t);
      } else {
        set(nodes.heliGain.gain, 0, t);
      }
      // Surf near the beach.
      const surfD = Math.abs(audio.listener.z - 392);
      const surf = audio.listener.x < 352 ? Math.max(0, 1 - surfD / 90) : 0;
      set(nodes.surfGain.gain, active ? surf * (0.05 + 0.04 * Math.sin(t * 0.6)) : 0, t, 0.3);
    },
  };
}
