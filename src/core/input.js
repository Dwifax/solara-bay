export function createInput(canvas) {
  const keys = {};
  const mouse = { x: 0, y: 0, locked: false };

  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
  });

  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (mouse.locked) {
      mouse.x += e.movementX;
      mouse.y += e.movementY;
    }
  });

  canvas.addEventListener('click', () => {
    canvas.requestPointerLock?.();
  });

  document.addEventListener('pointerlockchange', () => {
    mouse.locked = document.pointerLockElement === canvas;
  });

  return {
    getActions() {
      const actions = {
        forward: keys['w'] || keys['arrowup'],
        back: keys['s'] || keys['arrowdown'],
        left: keys['a'] || keys['arrowleft'],
        right: keys['d'] || keys['arrowright'],
        sprint: keys['shift'],
        jump: keys[' '],
        fire: keys['e'],
        aim: keys['q'],
        interact: keys['f'],
        menu: keys['escape'],
        vehicles: ['1','2','3','4','5','6'].map(k => keys[k]),
        mouseX: mouse.x,
        mouseY: mouse.y,
      };
      mouse.x = 0;
      mouse.y = 0;
      return actions;
    }
  };
}
