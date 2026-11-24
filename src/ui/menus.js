// Menus: the title screen (Continue / New Game / Load / Controls / Settings), the pause menu
// (Resume, Map, Stats, Save, Load, Settings, Controls, Quit), save-slot pickers, the settings
// panel, the controls sheet, the stats screen and shop counters. Mouse or arrows + Enter / Esc.
import { SLOTS } from '../core/saveSystem.js';
import { saveSettings } from '../core/settings.js';
import { MISSIONS } from '../data/missions.js';
import { formatMoney } from '../core/mathUtils.js';
import { GOLDEN_SHELLS } from '../data/activities.js';

const CONTROLS = [
  ['W A S D', 'Move / drive'],
  ['Mouse', 'Look around (click the game to capture the mouse)'],
  ['Shift', 'Sprint'],
  ['Space', 'Jump · handbrake in a car'],
  ['F', 'Enter / exit / carjack a car'],
  ['Left mouse', 'Punch / shoot'],
  ['Right mouse', 'Aim (hold) · drive-by with pistol or SMG'],
  ['1 – 5 / wheel', 'Choose weapon'],
  ['R', 'Reload'],
  ['H', 'Horn'],
  ['Q / E', 'Radio station (in a car) · E: use shops on foot'],
  ['X', 'Radio on / off'],
  ['G', 'Garage service · start street race (in a car)'],
  ['Enter', 'Skip a line of dialogue'],
  ['M', 'Map'],
  ['Esc / P', 'Pause'],
];

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

export function createMenus(game, root, handlers) {
  const layer = el('div', 'menus', root);
  let stack = [];
  let focus = 0;

  function clear() {
    layer.innerHTML = '';
    layer.className = 'menus';
  }

  function render() {
    clear();
    const top = stack[stack.length - 1];
    if (!top) {
      layer.classList.add('hidden');
      return;
    }
    layer.classList.remove('hidden');
    layer.classList.add(top.kind);
    top.build(layer);
    const buttons = [...layer.querySelectorAll('.btn:not(.disabled)')];
    focus = Math.min(focus, Math.max(0, buttons.length - 1));
    buttons.forEach((b, i) => {
      b.classList.toggle('focus', i === focus);
      b.addEventListener('mouseenter', () => {
        focus = i;
        buttons.forEach((o, k) => o.classList.toggle('focus', k === focus));
      });
    });
  }

  function push(menu) {
    stack.push(menu);
    focus = 0;
    render();
  }

  function pop() {
    const top = stack.pop();
    if (top && top.onClose) top.onClose();
    focus = 0;
    render();
    // Backing out of a menu opened on its own (shop, save point) returns to the game.
    if (stack.length === 0 && game.state === 'paused') handlers.resume();
  }

  function button(parent, label, action, opts = {}) {
    const b = el('button', `btn${opts.disabled ? ' disabled' : ''}${opts.cls ? ` ${opts.cls}` : ''}`, parent, label);
    b.type = 'button';
    if (!opts.disabled) {
      b.addEventListener('click', () => {
        game.events.emit('uiSelect', {});
        action();
      });
    }
    return b;
  }

  function panel(parent, title) {
    const p = el('div', 'panel', parent);
    if (title) el('h2', '', p, title);
    return p;
  }

  // ---------- Screens ----------
  function titleMenu() {
    return {
      kind: 'title',
      build(layer) {
        const wrap = el('div', 'title-wrap', layer);
        const logo = el('div', 'logo', wrap);
        el('div', 'logo-top', logo, 'SOLARA');
        el('div', 'logo-bottom', logo, 'BAY');
        el('div', 'logo-tag', logo, 'a coastal crime story');
        const menu = el('div', 'title-menu', wrap);
        const latest = game.saveSystem.latest();
        if (latest) button(menu, `Continue <small>${game.saveSystem.describe(latest.slot).detail}</small>`, () => handlers.loadSlot(latest.slot));
        button(menu, 'New Game', () => handlers.newGame());
        button(menu, 'Load Game', () => push(slotMenu('load')), { disabled: !latest });
        button(menu, 'Controls', () => push(controlsMenu()));
        button(menu, 'Settings', () => push(settingsMenu()));
        el('div', 'title-foot', layer, 'An original open-world game for make.fun · Every name, place and character is fictional · Click to start audio');
      },
    };
  }

  function pauseMenu() {
    return {
      kind: 'pause',
      build(layer) {
        const p = panel(layer, 'PAUSED');
        const run = game.missions.active;
        el('div', 'pause-sub', p, run ? `On mission: <b>${run.mission.title}</b>` : `Next mission: <b>${game.missions.nextMission()?.title ?? 'Story complete'}</b>`);
        button(p, 'Resume', () => handlers.resume());
        button(p, 'Map', () => handlers.openMap());
        button(p, 'Stats', () => push(statsMenu()));
        button(p, 'Save Game', () => push(slotMenu('save')), { disabled: !!run });
        button(p, 'Load Game', () => push(slotMenu('load')));
        button(p, 'Settings', () => push(settingsMenu()));
        button(p, 'Controls', () => push(controlsMenu()));
        button(p, 'Quit to Title', () => handlers.quitToTitle());
      },
    };
  }

  function slotMenu(mode) {
    return {
      kind: 'sub',
      build(layer) {
        const p = panel(layer, mode === 'save' ? 'SAVE GAME' : 'LOAD GAME');
        for (const slot of SLOTS) {
          if (mode === 'save' && slot === 'auto') continue;
          const info = game.saveSystem.describe(slot);
          const label = info ? `<b>${info.title}</b> <small>${info.detail}<br>${info.when}</small>` : `<b>${slot === 'auto' ? 'Autosave' : `Slot ${slot}`}</b> <small>Empty</small>`;
          button(
            p,
            label,
            () => {
              if (mode === 'save') {
                game.saveSystem.save(slot);
                render();
              } else handlers.loadSlot(slot);
            },
            { disabled: mode === 'load' && !info, cls: 'slot' },
          );
        }
        button(p, 'Back', pop, { cls: 'back' });
      },
    };
  }

  function settingsMenu() {
    return {
      kind: 'sub',
      onClose() {
        saveSettings(game.settings);
      },
      build(layer) {
        const p = panel(layer, 'SETTINGS');
        const s = game.settings;
        const slider = (label, key, min, max, step, apply) => {
          const row = el('label', 'row', p, `<span>${label}</span>`);
          const input = el('input', '', row);
          input.type = 'range';
          input.min = min;
          input.max = max;
          input.step = step;
          input.value = s[key];
          const out = el('em', '', row, `${Math.round(s[key] * 100)}%`);
          input.addEventListener('input', () => {
            s[key] = Number(input.value);
            out.textContent = `${Math.round(s[key] * 100)}%`;
            apply?.();
          });
        };
        const choice = (label, key, options, apply) => {
          const row = el('div', 'row', p, `<span>${label}</span>`);
          const group = el('div', 'choices', row);
          for (const [value, text] of options) {
            const b = el('button', `chip${s[key] === value ? ' on' : ''}`, group, text);
            b.type = 'button';
            b.addEventListener('click', () => {
              s[key] = value;
              apply?.();
              render();
            });
          }
        };
        slider('Master volume', 'masterVolume', 0, 1, 0.05, () => game.audioDirector.audio.applyVolumes());
        slider('Music & radio', 'musicVolume', 0, 1, 0.05, () => game.audioDirector.audio.applyVolumes());
        slider('Sound effects', 'sfxVolume', 0, 1, 0.05, () => game.audioDirector.audio.applyVolumes());
        slider('Mouse sensitivity', 'sensitivity', 0.3, 2.5, 0.05, () => {
          game.cameraCtl.state.sensitivity = s.sensitivity;
        });
        choice('Invert mouse Y', 'invertY', [[false, 'Off'], [true, 'On']], () => {
          game.cameraCtl.state.invertY = s.invertY;
        });
        choice('Shadows', 'shadows', [[true, 'On'], [false, 'Off']], () => game.gfx.setShadows(s.shadows));
        choice('Traffic', 'trafficDensity', [[0.5, 'Light'], [1, 'Normal'], [1.3, 'Heavy']]);
        choice('Pedestrians', 'pedDensity', [[0.5, 'Few'], [1, 'Normal'], [1.3, 'Crowded']]);
        choice('Difficulty', 'difficulty', [[0.7, 'Easy'], [1, 'Normal'], [1.35, 'Hard']]);
        button(p, 'Back', pop, { cls: 'back' });
      },
    };
  }

  function controlsMenu() {
    return {
      kind: 'sub',
      build(layer) {
        const p = panel(layer, 'CONTROLS');
        const table = el('div', 'controls', p);
        for (const [key, what] of CONTROLS) el('div', 'ctrl', table, `<kbd>${key}</kbd><span>${what}</span>`);
        button(p, 'Back', pop, { cls: 'back' });
      },
    };
  }

  function statsMenu() {
    return {
      kind: 'sub',
      build(layer) {
        const p = panel(layer, 'STATS');
        const st = game.stats;
        const info = game.economy.levelInfo();
        el('div', 'streetCred', p, `<div><b>Street cred ${info.level}</b> · ${info.title}</div><div class="xpbar"><i style="width:${Math.round(info.progress * 100)}%"></i></div><small>${info.xp} / ${info.nextXp} XP</small>`);
        const done = game.missions.progress.completed;
        const list = el('div', 'mission-list', p);
        for (const m of MISSIONS) el('div', done.includes(m.id) ? 'done' : '', list, `${done.includes(m.id) ? '✔' : '○'} ${m.title}`);
        const t = Math.floor(st.playTime);
        const rows = [
          ['Money', formatMoney(game.economy.state.money)],
          ['Time played', `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m`],
          ['Story missions', `${done.length} / ${MISSIONS.length}`],
          ['Street races won', st.racesWon ?? 0],
          ['Courier jobs', st.jobsDone ?? 0],
          ['Golden Shells', `${game.activities.state.shellsFound.length} / ${GOLDEN_SHELLS.length}`],
          ['Cars stolen', st.carsStolen],
          ['People taken down', st.kills],
          ['Officers taken down', st.copsKilled],
          ['Shots fired', st.shotsFired],
          ['Escapes from police', st.escapes ?? 0],
          ['Times flatlined / cuffed', `${st.flatlined} / ${st.cuffed}`],
          ['Distance driven', `${(st.distanceDriven / 1000).toFixed(1)} km`],
        ];
        const grid = el('div', 'stat-grid', p);
        for (const [k, v] of rows) el('div', 'stat', grid, `<span>${k}</span><b>${v}</b>`);
        button(p, 'Back', pop, { cls: 'back' });
      },
    };
  }

  function shopMenu(kind) {
    return {
      kind: 'sub',
      build(layer) {
        const p = panel(layer, kind === 'guns' ? 'BAYLINE ARMS' : 'COASTLINE MOTORS');
        el('div', 'pause-sub', p, `Cash: <b>${formatMoney(game.economy.state.money)}</b> · Street cred ${game.economy.level()}`);
        for (const item of game.economy.catalog(kind)) {
          const label = `<b>${item.label}</b> <small>${item.locked ? `Unlocks at street cred level ${item.need}` : formatMoney(item.price)}</small>`;
          button(
            p,
            label,
            () => {
              item.action();
              render();
            },
            { disabled: item.locked, cls: 'slot' },
          );
        }
        button(p, 'Leave', () => handlers.closeOverlay(), { cls: 'back' });
      },
    };
  }

  // Keyboard navigation.
  window.addEventListener('keydown', (e) => {
    if (!stack.length) return;
    const buttons = [...layer.querySelectorAll('.btn:not(.disabled)')];
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      focus = (focus + 1) % Math.max(1, buttons.length);
      game.events.emit('uiMove', {});
    } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      focus = (focus - 1 + buttons.length) % Math.max(1, buttons.length);
      game.events.emit('uiMove', {});
    } else if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      buttons[focus]?.click();
      return;
    } else if (e.code === 'Escape' || e.code === 'Backspace') {
      if (stack.length > 1) pop();
      else handlers.escapeTop(stack[0].kind);
      return;
    } else return;
    buttons.forEach((b, i) => b.classList.toggle('focus', i === focus));
  });

  return {
    showTitle() {
      stack = [titleMenu()];
      render();
    },
    showPause() {
      stack = [pauseMenu()];
      render();
    },
    showShop(kind) {
      stack = [shopMenu(kind)];
      render();
    },
    showSaves() {
      stack = [slotMenu('save')];
      render();
    },
    showStats() {
      stack = [statsMenu()];
      render();
    },
    showControls() {
      stack = [controlsMenu()];
      render();
    },
    hide() {
      stack = [];
      render();
    },
    get open() {
      return stack.length > 0;
    },
  };
}
