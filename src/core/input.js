// Keyboard and mouse state: held keys, keys pressed this frame, mouse look deltas (pointer lock),
// mouse buttons and the wheel. Systems read it once per step; endFrame() clears the one-shot parts.

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouseHeld = new Set();
  const mousePressed = new Set();
  const state = {
    lookX: 0,
    lookY: 0,
    wheel: 0,
    locked: false,
    enabled: true,
  };

  function onKeyDown(event) {
    if (event.code === 'Tab' || event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
    if (!held.has(event.code)) pressed.add(event.code);
    held.add(event.code);
  }
  function onKeyUp(event) {
    held.delete(event.code);
  }
  function onMouseMove(event) {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  }
  function onMouseDown(event) {
    mouseHeld.add(event.button);
    mousePressed.add(event.button);
  }
  function onMouseUp(event) {
    mouseHeld.delete(event.button);
  }
  function onWheel(event) {
    state.wheel += Math.sign(event.deltaY);
  }
  function onBlur() {
    held.clear();
    mouseHeld.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('blur', onBlur);
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
  });

  return {
    state,
    isDown(code) {
      return state.enabled && held.has(code);
    },
    wasPressed(code) {
      return state.enabled && pressed.has(code);
    },
    /** Consume a press so a second reader in the same frame does not see it too. */
    consume(code) {
      const had = pressed.has(code);
      pressed.delete(code);
      return state.enabled && had;
    },
    mouseDown(button) {
      return state.enabled && mouseHeld.has(button);
    },
    mouseClicked(button) {
      return state.enabled && mousePressed.has(button);
    },
    axis(negative, positive) {
      return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    takeWheel() {
      const w = state.wheel;
      state.wheel = 0;
      return w;
    },
    requestLock() {
      if (!state.locked && canvas.requestPointerLock) {
        try {
          const result = canvas.requestPointerLock();
          if (result && result.catch) result.catch(() => {});
        } catch {
          // Pointer lock can be refused (headless, iframes); mouse look then simply stays off.
        }
      }
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    endFrame() {
      pressed.clear();
      mousePressed.clear();
    },
    reset() {
      held.clear();
      pressed.clear();
      mouseHeld.clear();
      mousePressed.clear();
    },
  };
}
