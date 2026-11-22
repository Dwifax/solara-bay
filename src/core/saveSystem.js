// Save games in localStorage: three manual slots and an autosave written after every story
// mission. A save holds progress (missions, money, respect, weapons, shells, cars), the player's
// place and the time of day, and the stats.
import { MISSIONS } from '../data/missions.js';

const PREFIX = 'solarabay.save.';
export const SLOTS = ['auto', '1', '2', '3'];

function storage() {
  try {
    const s = window.localStorage;
    s.setItem('solarabay.probe', '1');
    s.removeItem('solarabay.probe');
    return s;
  } catch {
    return null;
  }
}

export function createSaveSystem(game) {
  function snapshot() {
    const p = game.player;
    const pos = p.vehicle ? p.vehicle.position : p.position;
    return {
      version: 1,
      savedAt: Date.now(),
      hour: game.tod.state.hour,
      player: { x: pos.x, z: pos.z, health: p.health, armor: p.armor, weapons: p.weapons, current: p.current },
      economy: { money: game.economy.state.money, respect: game.economy.state.respect, ownedCars: game.economy.state.ownedCars },
      missions: { completed: game.missions.progress.completed.slice() },
      activities: { shellsFound: game.activities.state.shellsFound.slice(), raceIndex: game.activities.state.raceIndex, jobsDone: game.activities.state.jobsDone, racesWon: game.activities.state.racesWon },
      stats: { ...game.stats },
    };
  }

  function write(slot) {
    const s = storage();
    if (!s) {
      game.ui?.notify('Saving is unavailable in this browser.');
      return false;
    }
    s.setItem(PREFIX + slot, JSON.stringify(snapshot()));
    return true;
  }

  function read(slot) {
    const s = storage();
    if (!s) return null;
    try {
      const raw = s.getItem(PREFIX + slot);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** A one-line description of each slot for the menus. */
  function describe(slot) {
    const data = read(slot);
    if (!data) return null;
    const done = data.missions?.completed?.length ?? 0;
    const date = new Date(data.savedAt);
    const next = MISSIONS.find((m) => !data.missions.completed.includes(m.id));
    return {
      slot,
      title: slot === 'auto' ? 'Autosave' : `Slot ${slot}`,
      detail: `${done}/${MISSIONS.length} missions · $${Math.round(data.economy.money).toLocaleString('en-US')} · ${next ? `Next: ${next.title}` : 'Story complete'}`,
      when: `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      percent: Math.round((done / MISSIONS.length) * 100),
    };
  }

  function latest() {
    let best = null;
    for (const slot of SLOTS) {
      const data = read(slot);
      if (data && (!best || data.savedAt > best.data.savedAt)) best = { slot, data };
    }
    return best;
  }

  return {
    save(slot) {
      const ok = write(slot);
      if (ok) game.ui?.notify(slot === 'auto' ? 'Autosaved.' : `Game saved to slot ${slot}.`);
      return ok;
    },
    autosave() {
      write('auto');
      game.ui?.notify('Autosaved.');
    },
    read,
    describe,
    latest,
    hasAny() {
      return !!latest();
    },
  };
}
