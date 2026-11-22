// The WebAudio core: one context started on the first user gesture, master / sound / music buses
// through a compressor, a shared noise buffer, and helpers to place a sound in the world
// (distance fall-off and stereo pan relative to the camera).

export function createAudioEngine(settings) {
  let ctx = null;
  let master = null;
  let sfx = null;
  let music = null;
  let noise = null;
  const listener = { x: 0, z: 0, yaw: 0 };

  function start() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.connect(comp);
    comp.connect(ctx.destination);
    sfx = ctx.createGain();
    music = ctx.createGain();
    sfx.connect(master);
    music.connect(master);
    applyVolumes();
    const len = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    return ctx;
  }

  function applyVolumes() {
    if (!ctx) return;
    master.gain.value = settings.masterVolume;
    sfx.gain.value = settings.sfxVolume;
    music.gain.value = settings.musicVolume;
  }

  /** A looping or one-shot white-noise source. */
  function noiseSource(loop = false) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = loop;
    if (!loop) src.loopStart = 0;
    return src;
  }

  /** Gain node + stereo panner for a sound at world (x, z); returns null when too far to hear. */
  function spatial(x, z, range = 120, bus = null) {
    if (!ctx) return null;
    const dx = x - listener.x;
    const dz = z - listener.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return null;
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, 1 - d / range) ** 1.6;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) {
      // Right of the camera view direction is (-cos yaw, sin yaw).
      const rx = -Math.cos(listener.yaw);
      const rz = Math.sin(listener.yaw);
      pan.pan.value = d > 0.5 ? Math.max(-1, Math.min(1, ((dx * rx + dz * rz) / d) * 0.8)) : 0;
      gain.connect(pan);
      pan.connect(bus ?? sfx);
    } else {
      gain.connect(bus ?? sfx);
    }
    return gain;
  }

  return {
    start,
    applyVolumes,
    noiseSource,
    spatial,
    listener,
    get ctx() {
      return ctx;
    },
    get sfx() {
      return sfx;
    },
    get music() {
      return music;
    },
    get ready() {
      return !!ctx && ctx.state === 'running';
    },
    now() {
      return ctx ? ctx.currentTime : 0;
    },
  };
}
