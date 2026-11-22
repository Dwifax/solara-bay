export function createAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  function playTone(freq, duration, type = 'sine') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = freq;
    osc.type = type;
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  return {
    engineSound(pitch) {
      playTone(100 + pitch * 2, 0.05, 'square');
    },
    gunshot() {
      playTone(150, 0.1, 'triangle');
    },
    impact() {
      playTone(80, 0.05);
    },
    menu() {
      playTone(400, 0.1);
    }
  };
}
