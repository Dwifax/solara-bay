// Weapon definitions: damage, fire rate, magazine, spread, range, the shop price and the respect
// level that unlocks them at Bayline Arms. Slot order matches the number keys 1-5.

export const WEAPONS = {
  fists: { id: 'fists', name: 'Fists', slot: 1, melee: true, damage: 14, rate: 0.45, range: 1.9, clip: 0, price: 0, level: 1 },
  pistol: { id: 'pistol', name: 'Kestrel 9mm', slot: 2, damage: 26, rate: 0.26, clip: 12, spread: 0.012, range: 130, pellets: 1, price: 600, ammoPrice: 60, ammoPack: 36, level: 1, sound: 'pistol', recoil: 0.025 },
  smg: { id: 'smg', name: 'Wasp SMG', slot: 3, damage: 15, rate: 0.075, clip: 30, spread: 0.04, range: 95, pellets: 1, price: 1800, ammoPrice: 120, ammoPack: 90, level: 2, sound: 'smg', auto: true, recoil: 0.012 },
  shotgun: { id: 'shotgun', name: 'Breaker 12', slot: 4, damage: 13, rate: 0.85, clip: 6, spread: 0.085, range: 38, pellets: 9, price: 2600, ammoPrice: 140, ammoPack: 24, level: 3, sound: 'shotgun', recoil: 0.07 },
  rifle: { id: 'rifle', name: 'Tidewater AR', slot: 5, damage: 31, rate: 0.11, clip: 30, spread: 0.016, range: 170, pellets: 1, price: 4800, ammoPrice: 200, ammoPack: 90, level: 5, sound: 'rifle', auto: true, recoil: 0.018 },
};

export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];

export const ARMOR_PRICE = 400;
