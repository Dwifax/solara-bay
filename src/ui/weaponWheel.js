// The weapon wheel: hold Tab to slow time and show every weapon slot in a ring; move the mouse
// toward one (or press its number) and let go of Tab to equip it.
import { WEAPONS, WEAPON_ORDER } from '../data/weapons.js';
import { drawWeaponIcon } from './weaponIcons.js';

export function createWeaponWheel(game, root) {
  const wrap = document.createElement('div');
  wrap.className = 'wheel hidden';
  root.appendChild(wrap);
  const center = document.createElement('div');
  center.className = 'wheel-center';
  wrap.appendChild(center);
  const slots = WEAPON_ORDER.map((id, i) => {
    const angle = -Math.PI / 2 + (i / WEAPON_ORDER.length) * Math.PI * 2;
    const slot = document.createElement('div');
    slot.className = 'wheel-slot';
    slot.style.left = `${180 + Math.cos(angle) * 125}px`;
    slot.style.top = `${180 + Math.sin(angle) * 125}px`;
    const c = document.createElement('canvas');
    c.width = 90;
    c.height = 40;
    drawWeaponIcon(c, id);
    slot.appendChild(c);
    const label = document.createElement('div');
    slot.appendChild(label);
    wrap.appendChild(slot);
    return { id, angle, slot, label };
  });
  let open = false;
  let aimX = 0;
  let aimY = 0;
  let selected = null;

  function refresh() {
    for (const s of slots) {
      const owned = game.player.hasWeapon(s.id);
      const a = game.player.weapons[s.id];
      s.slot.classList.toggle('locked', !owned);
      s.slot.classList.toggle('sel', s.id === selected);
      s.label.textContent = owned ? (WEAPONS[s.id].clip ? `${a.mag + a.reserve}` : WEAPONS[s.id].name) : '—';
    }
    center.innerHTML = selected ? `<b>${WEAPONS[selected].name}</b>` : '';
  }

  return {
    get open() {
      return open;
    },
    /** Called each step; returns the time scale to apply (slow motion while open). */
    update() {
      const input = game.input;
      const want = input.isDown('Tab') && !game.player.vehicle && !game.player.dead;
      if (want && !open) {
        open = true;
        aimX = 0;
        aimY = 0;
        selected = game.player.current;
        wrap.classList.remove('hidden');
        refresh();
      }
      if (open) {
        const look = input.takeLook();
        aimX += look.x;
        aimY += look.y;
        const len = Math.hypot(aimX, aimY);
        if (len > 40) {
          const angle = Math.atan2(aimY, aimX);
          let best = null;
          let bestD = Infinity;
          for (const s of slots) {
            if (!game.player.hasWeapon(s.id)) continue;
            const d = Math.abs(Math.atan2(Math.sin(angle - s.angle), Math.cos(angle - s.angle)));
            if (d < bestD) {
              bestD = d;
              best = s.id;
            }
          }
          if (best) selected = best;
          if (len > 120) {
            aimX *= 120 / len;
            aimY *= 120 / len;
          }
        }
        WEAPON_ORDER.forEach((id, i) => {
          if (input.wasPressed(`Digit${i + 1}`) && game.player.hasWeapon(id)) selected = id;
        });
        refresh();
        if (!want) {
          open = false;
          wrap.classList.add('hidden');
          if (selected && selected !== game.player.current) {
            game.player.selectWeapon(selected);
            game.events.emit('weaponSwitched', { id: selected });
          }
        }
      }
      return open ? 0.25 : 1;
    },
  };
}
