// The main loop: simulation in fixed 1/60 s steps (several in a slow frame, none in a fast one),
// rendering once per animation frame. A stalled tab drops time instead of replaying it.

export const STEP = 1 / 60;
const MAX_FRAME = 0.25;

export function startGameLoop(step, render) {
  let last = performance.now();
  let accumulator = 0;
  let running = true;
  function frame(now) {
    if (!running) return;
    const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= STEP && steps < 8) {
      step(STEP);
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === 8) accumulator = 0;
    render(elapsed);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return {
    stop() {
      running = false;
    },
  };
}
