// Subtitles for story dialogue: lines appear one after another with the speaker's name in their
// colour, timed by length (Enter skips a line); a finished conversation calls back the mission.
import { CHARACTERS } from '../data/story.js';

export function createDialogue(game, box) {
  let queue = [];
  let current = null;
  let timer = 0;
  let onDone = null;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Enter' && current && game.state === 'playing') timer = Math.min(timer, 0.05);
  });

  function show(line) {
    const who = CHARACTERS[line.who] ?? { name: line.who, color: '#fff' };
    box.innerHTML = `<span class="who" style="color:${who.color}">${who.name}:</span> ${line.text}`;
    box.classList.add('on');
    timer = 1.8 + line.text.length * 0.048;
  }

  function next() {
    current = queue.shift() ?? null;
    if (current) {
      show(current);
      return;
    }
    box.classList.remove('on');
    const cb = onDone;
    onDone = null;
    if (cb) cb();
  }

  return {
    play(lines, done) {
      if (onDone) {
        const cb = onDone;
        onDone = null;
        cb();
      }
      queue = lines.slice();
      onDone = done ?? null;
      next();
    },
    say(lines) {
      if (!current && !onDone) {
        queue = lines.slice();
        next();
      } else queue.push(...lines);
    },
    clear() {
      queue = [];
      current = null;
      onDone = null;
      box.classList.remove('on');
    },
    get active() {
      return !!current;
    },
    /** For screenshots: show one line and hold it. */
    hold(line) {
      queue = [];
      current = line;
      show(line);
      timer = 1e9;
    },
    update(dt) {
      if (!current) return;
      timer -= dt;
      if (timer <= 0) next();
    },
  };
}
