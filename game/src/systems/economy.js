// Money, street cred and what they buy: street cred levels unlock guns at Bayline Arms and cars at
// Coastline Motors; Sunset Customs repairs and resprays a car (and shakes a tail if nobody is
// watching); the safehouse saves the game. Shops open when the player stands at their door.
import { WEAPONS, WEAPON_ORDER, ARMOR_PRICE } from '../data/weapons.js';
import { VEHICLES, DEALER_STOCK } from '../data/vehicles.js';
import { RESPECT_LEVELS } from '../data/story.js';
import { LOCATIONS, PARKING_SPOTS } from '../data/locations.js';
import { dist2d } from '../core/mathUtils.js';

export const SHOP_POINTS = [
  { id: 'gunShop', kind: 'guns', prompt: 'browse Bayline Arms', color: '#ffb347', icon: '🔫', onFoot: true },
  { id: 'dealership', kind: 'cars', prompt: 'browse Coastline Motors', color: '#6ec6ff', icon: '🚗', onFoot: true },
  { id: 'garage', kind: 'garage', prompt: 'use Sunset Customs ($250)', color: '#c58cff', icon: '🔧', onFoot: false },
  { id: 'safehouse', kind: 'save', prompt: 'save your game', color: '#7dffb0', icon: '💾', onFoot: true },
];

export function createEconomy(game) {
  const { events } = game;
  const state = { money: 500, streetCred: 0, ownedCars: [] };
  let nearShop = null;

  function level() {
    let lvl = 1;
    RESPECT_LEVELS.forEach((l, i) => {
      if (state.streetCred >= l.xp) lvl = i + 1;
    });
    return lvl;
  }

  function levelInfo() {
    const lvl = level();
    const cur = RESPECT_LEVELS[lvl - 1];
    const next = RESPECT_LEVELS[lvl] ?? null;
    return { level: lvl, title: cur.title, xp: state.streetCred, nextXp: next ? next.xp : cur.xp, progress: next ? (state.streetCred - cur.xp) / (next.xp - cur.xp) : 1 };
  }

  function addMoney(amount) {
    state.money += amount;
    if (amount > 0) events.emit('cash', { amount });
    game.ui?.moneyPopup(amount);
  }

  function spend(amount) {
    if (state.money < amount) {
      game.ui?.notify("You can't afford that.");
      return false;
    }
    state.money -= amount;
    game.ui?.moneyPopup(-amount);
    events.emit('cash', { amount: -amount });
    return true;
  }

  function addStreetCred(xp) {
    const before = level();
    state.streetCred += xp;
    const after = level();
    if (after > before) {
      const info = levelInfo();
      game.ui?.banner(`RESPECT LEVEL ${after}`, info.title.toUpperCase(), 3.5, 'level');
      events.emit('levelUp', { level: after });
    }
  }

  function buyWeapon(id) {
    const def = WEAPONS[id];
    const player = game.player;
    if (!player.hasWeapon(id) && level() < def.level) return game.ui?.notify(`Requires street cred level ${def.level}.`);
    if (player.hasWeapon(id)) {
      if (!spend(def.ammoPrice)) return;
      player.weapons[id].reserve += def.ammoPack;
      game.ui?.notify(`Bought ${def.ammoPack} rounds for the ${def.name}.`);
    } else {
      if (!spend(def.price)) return;
      player.giveWeapon(id, def.ammoPack);
      player.selectWeapon(id);
      game.ui?.notify(`Bought the ${def.name}.`);
    }
  }

  function buyArmor() {
    if (game.player.armor >= 100) return game.ui?.notify('Armor is already full.');
    if (!spend(ARMOR_PRICE)) return;
    game.player.armor = 100;
    game.ui?.notify('Body armor equipped.');
  }

  function buyCar(id) {
    const spec = VEHICLES[id];
    if (level() < spec.level) return game.ui?.notify(`Requires street cred level ${spec.level}.`);
    if (!spend(spec.price)) return;
    const color = spec.colors[Math.floor(game.rng.next() * spec.colors.length)];
    state.ownedCars.push({ id, color });
    const spot = PARKING_SPOTS[1];
    const v = game.vehicleSystem.spawn(id, spot.x, spot.z, spot.heading, color);
    v.persistent = true;
    v.owned = true;
    game.ui?.notify(`Your new ${spec.name} is parked outside.`);
    game.stats.carsBought = (game.stats.carsBought ?? 0) + 1;
  }

  function useGarage() {
    const v = game.player.vehicle;
    if (!v) return game.ui?.notify('Drive a car in for service.');
    if (!spend(250)) return;
    v.health = v.maxHealth;
    v.fireTimer = 0;
    const spec = v.spec;
    const color = spec.colors[(spec.colors.indexOf(v.color) + 1) % spec.colors.length];
    const replacement = game.vehicleSystem.spawn(spec.id, v.position.x, v.position.z, v.heading, color);
    replacement.persistent = true;
    replacement.owned = v.owned;
    game.player.vehicle = null;
    game.vehicleSystem.remove(v);
    replacement.driver = 'player';
    game.player.vehicle = replacement;
    if (game.wanted.level > 0 && !game.wanted.state.seen) {
      game.wanted.clear();
      game.ui?.notify('Fresh paint. The cops lost your description.');
    } else game.ui?.notify('Repaired and resprayed.');
  }

  function catalog(kind) {
    const lvl = level();
    if (kind === 'guns') {
      const items = WEAPON_ORDER.filter((id) => id !== 'fists').map((id) => {
        const d = WEAPONS[id];
        const owned = game.player.hasWeapon(id);
        return { id, label: owned ? `${d.name} ammo ×${d.ammoPack}` : d.name, price: owned ? d.ammoPrice : d.price, locked: !owned && lvl < d.level, need: d.level, action: () => buyWeapon(id) };
      });
      items.push({ id: 'armor', label: 'Body armor', price: ARMOR_PRICE, locked: false, action: buyArmor });
      return items;
    }
    if (kind === 'cars') {
      return DEALER_STOCK.map((id) => {
        const s = VEHICLES[id];
        return { id, label: `${s.name} (top ${Math.round(s.maxSpeed * 3.6)} km/h)`, price: s.price, locked: lvl < s.level, need: s.level, action: () => buyCar(id) };
      });
    }
    return [];
  }

  /** Which shop door the player stands at, if any; E opens it. */
  function update() {
    const p = game.player;
    nearShop = null;
    for (const shop of SHOP_POINTS) {
      const loc = LOCATIONS[shop.id];
      const pos = p.vehicle ? p.vehicle.position : p.position;
      const range = shop.onFoot ? 2.4 : 7;
      if (shop.onFoot && p.vehicle) continue;
      if (!shop.onFoot && !p.vehicle) continue;
      if (dist2d(pos.x, pos.z, loc.x, loc.z) < range) nearShop = shop;
    }
    if (nearShop && !game.missions.active) {
      const key = nearShop.onFoot ? 'E' : 'G';
      game.ui?.setPrompt(`Press <b>${key}</b> to ${nearShop.prompt}`);
      if (game.input.wasPressed(`Key${key}`)) {
        if (nearShop.kind === 'garage') useGarage();
        else if (nearShop.kind === 'save') game.ui?.openSaveMenu();
        else game.ui?.openShop(nearShop.kind);
      }
    } else game.ui?.setPrompt(null);
  }

  function addShopMarkers() {
    for (const shop of SHOP_POINTS) {
      const loc = LOCATIONS[shop.id];
      game.markers.add({ x: loc.x, z: loc.z, radius: shop.onFoot ? 1.1 : 3.5, color: shop.color, height: 1.6 });
    }
  }

  return {
    state,
    level,
    levelInfo,
    addMoney,
    spend,
    addStreetCred,
    catalog,
    update,
    addShopMarkers,
    get money() {
      return state.money;
    },
    load(data) {
      state.money = data?.money ?? 500;
      state.streetCred = data?.streetCred ?? 0;
      state.ownedCars = data?.ownedCars ?? [];
    },
  };
}
