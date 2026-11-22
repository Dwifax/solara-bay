// The on-screen HUD: radar with health and armour, wanted stars, money, weapon and ammo, the
// mission objective, help prompts, notifications, big banners (mission passed / failed, wasted,
// busted, level up), district names, the speedometer, radio station, race standings, timers,
// crosshair and a damage vignette.
import { WEAPONS } from '../data/weapons.js';
import { DISTRICTS } from '../data/districts.js';
import { formatMoney } from '../core/mathUtils.js';
import { createMinimap } from './minimap.js';
import { createDialogue } from './dialogue.js';
import { drawWeaponIcon } from './weaponIcons.js';

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

/** Objective text with ~highlighted~ words. */
export function highlight(text) {
  return text.replace(/~([^~]+)~/g, '<span class="hl">$1</span>');
}

export function createHud(game, root, baseMap) {
  const hud = el('div', 'hud hidden', root);
  // Radar block.
  const radar = el('div', 'radar', hud);
  const radarCanvas = el('canvas', 'radar-canvas', radar);
  radarCanvas.width = 220;
  radarCanvas.height = 220;
  const bars = el('div', 'radar-bars', radar);
  const healthBar = el('div', 'bar health', bars, '<i></i>');
  const armorBar = el('div', 'bar armor', bars, '<i></i>');
  const minimap = createMinimap(game, radarCanvas, baseMap);

  // Top right: stars, money, weapon.
  const topRight = el('div', 'top-right', hud);
  const stars = el('div', 'stars', topRight);
  const starEls = [];
  for (let i = 0; i < 5; i += 1) starEls.push(el('span', 'star', stars, '★'));
  const money = el('div', 'money', topRight, '$0');
  const moneyPop = el('div', 'money-pop', topRight);
  const weapon = el('div', 'weapon', topRight);
  const weaponIcon = el('canvas', 'weapon-icon', weapon);
  weaponIcon.width = 90;
  weaponIcon.height = 40;
  let shownWeapon = null;
  const weaponName = el('span', 'weapon-name', weapon);
  const ammo = el('div', 'ammo', topRight);
  const timer = el('div', 'timer hidden', topRight);

  // Objective (top centre).
  const objective = el('div', 'objective hidden', hud);
  const objTitle = el('div', 'obj-title', objective);
  const objText = el('div', 'obj-text', objective);
  const objExtra = el('div', 'obj-extra', objective);
  const targetBar = el('div', 'target-bar hidden', objective, '<label></label><div><i></i></div>');
  const progressBar = el('div', 'progress-bar hidden', objective, '<label></label><div><i></i></div>');
  const radioBox = el('div', 'radio hidden', hud);

  // Help, prompt and notifications (top left).
  const help = el('div', 'help hidden', hud);
  const prompt = el('div', 'prompt hidden', hud);

  // Banners.
  const banner = el('div', 'banner hidden', hud);
  const bannerTitle = el('div', 'banner-title', banner);
  const bannerSub = el('div', 'banner-sub', banner);

  // Bottom right: district and speedometer.
  const district = el('div', 'district hidden', hud);
  const speedo = el('div', 'speedo hidden', hud, '<b>0</b><small>KM/H</small><div class="gear"><i></i></div><em></em>');
  const race = el('div', 'race hidden', hud);

  const crosshair = el('div', 'crosshair hidden', hud, '<i></i><i></i><i></i><i></i>');
  const vignette = el('div', 'vignette', root);
  const dialogue = createDialogue(game, el('div', 'subtitles', hud));

  let notifyTimer = 0;
  let bannerTimer = 0;
  let districtTimer = 0;
  let radioTimer = 0;
  let moneyPopTimer = 0;
  let lastDistrict = null;
  let shownMoney = 0;
  let lastHealth = 100;
  let hurt = 0;
  let objectiveTitle = '';

  const api = {
    root: hud,
    dialogue,
    show(visible) {
      hud.classList.toggle('hidden', !visible);
    },
    setObjective(text) {
      if (!text) {
        objective.classList.add('hidden');
        return;
      }
      objective.classList.remove('hidden');
      const run = game.missions.active;
      objectiveTitle = run ? run.mission.title : '';
      objTitle.textContent = objectiveTitle ? objectiveTitle.toUpperCase() : '';
      const html = highlight(text);
      if (objText.innerHTML !== html) objText.innerHTML = html;
    },
    setCounter(text) {
      objExtra.textContent = text ?? '';
    },
    setTargetHealth(frac, label = 'Target') {
      if (frac === null || frac === undefined) {
        targetBar.classList.add('hidden');
        return;
      }
      targetBar.classList.remove('hidden');
      targetBar.querySelector('label').textContent = label;
      targetBar.querySelector('i').style.width = `${Math.max(0, frac) * 100}%`;
    },
    setProgress(frac, label = '') {
      if (frac === null || frac === undefined) {
        progressBar.classList.add('hidden');
        return;
      }
      progressBar.classList.remove('hidden');
      progressBar.querySelector('label').textContent = label;
      progressBar.querySelector('i').style.width = `${Math.min(1, frac) * 100}%`;
    },
    setTimer(seconds) {
      if (seconds === null || seconds === undefined) {
        timer.classList.add('hidden');
        return;
      }
      timer.classList.remove('hidden');
      const s = Math.max(0, Math.ceil(seconds));
      timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      timer.classList.toggle('urgent', s <= 10);
    },
    setRaceInfo(info) {
      if (!info) {
        race.classList.add('hidden');
        return;
      }
      race.classList.remove('hidden');
      const t = info.time;
      race.innerHTML = `<div><small>POS</small><b>${info.position}</b><span>/${info.total}</span></div><div><small>CHECKPOINT</small><b>${info.checkpoint}</b><span>/${info.checkpoints}</span></div><div><small>TIME</small><b>${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}</b></div>`;
    },
    setPrompt(html) {
      if (!html) {
        prompt.classList.add('hidden');
        return;
      }
      prompt.classList.remove('hidden');
      if (prompt.innerHTML !== html) prompt.innerHTML = html;
    },
    notify(text, seconds = 4) {
      help.innerHTML = text;
      help.classList.remove('hidden');
      notifyTimer = seconds;
    },
    banner(title, sub = '', seconds = 3, style = 'mission') {
      bannerTitle.textContent = title;
      bannerSub.innerHTML = sub;
      banner.className = `banner ${style}`;
      bannerTimer = seconds;
    },
    missionPassed(title, cash, respect, label = 'MISSION PASSED') {
      api.banner(label, `${title}<br><span class="cash">+${formatMoney(cash)}</span> <span class="resp">+${respect} RESPECT</span>`, 5, 'passed');
    },
    missionFailed(reason) {
      api.banner('MISSION FAILED', reason, 4.5, 'failed');
    },
    showRadio(info) {
      radioBox.classList.remove('hidden');
      radioBox.innerHTML = info.on ? `<b>📻 ${info.station}</b><span>${info.artist} — “${info.title}”</span>` : '<b>📻 Radio off</b>';
      radioTimer = 4;
    },
    moneyPopup(amount) {
      moneyPop.textContent = `${amount >= 0 ? '+' : '-'}${formatMoney(Math.abs(amount))}`;
      moneyPop.className = `money-pop ${amount >= 0 ? 'gain' : 'loss'}`;
      moneyPopTimer = 2.5;
    },
    flashDistrict() {
      lastDistrict = null;
    },
    clearMessages() {
      banner.classList.add('hidden');
      help.classList.add('hidden');
      bannerTimer = 0;
      notifyTimer = 0;
    },
    update(dt) {
      const p = game.player;
      // Stars.
      const w = game.wanted.state;
      const blink = w.level > 0 && !w.seen && Math.floor(game.worldTime * 2.5) % 2 === 0;
      starEls.forEach((s, i) => {
        s.classList.toggle('on', i < w.level);
        s.classList.toggle('blink', i < w.level && blink);
      });
      stars.classList.toggle('active', w.level > 0);
      // Money rolls toward the real value.
      const target = game.economy.state.money;
      shownMoney += (target - shownMoney) * Math.min(1, dt * 6);
      if (Math.abs(target - shownMoney) < 1) shownMoney = target;
      money.textContent = formatMoney(shownMoney);
      if (moneyPopTimer > 0) {
        moneyPopTimer -= dt;
        if (moneyPopTimer <= 0) moneyPop.className = 'money-pop';
      }
      // Weapon.
      const def = WEAPONS[p.current];
      if (shownWeapon !== p.current) {
        shownWeapon = p.current;
        drawWeaponIcon(weaponIcon, p.current);
      }
      weaponName.textContent = def.name;
      if (def.clip) {
        const a = p.weapons[p.current];
        ammo.innerHTML = p.reloadTimer > 0 ? '<span class="reload">RELOADING</span>' : `<b>${a.mag}</b> / ${a.reserve}`;
      } else ammo.textContent = '';
      // Health and armour.
      healthBar.querySelector('i').style.width = `${(p.health / p.maxHealth) * 100}%`;
      healthBar.classList.toggle('low', p.health < 30);
      armorBar.querySelector('i').style.width = `${p.armor}%`;
      if (p.health < lastHealth) hurt = Math.min(1, hurt + (lastHealth - p.health) / 25);
      lastHealth = p.health;
      hurt = Math.max(0, hurt - dt * 1.2);
      const low = p.health < 30 && !p.dead ? 0.35 + 0.15 * Math.sin(game.worldTime * 6) : 0;
      vignette.style.opacity = String(Math.max(hurt * 0.8, low));
      // Crosshair.
      const armed = !p.vehicle && p.current !== 'fists' && !p.dead;
      crosshair.classList.toggle('hidden', !(armed || (p.vehicle && p.aiming)));
      crosshair.classList.toggle('aim', p.aiming);
      // District popup.
      const d = game.district;
      if (d && d !== lastDistrict) {
        lastDistrict = d;
        district.textContent = DISTRICTS[d].name;
        district.classList.remove('hidden');
        districtTimer = 4;
      }
      if (districtTimer > 0) {
        districtTimer -= dt;
        if (districtTimer <= 0) district.classList.add('hidden');
      }
      // Speedometer.
      const v = p.vehicle;
      if (v) {
        speedo.classList.remove('hidden');
        speedo.querySelector('b').textContent = String(Math.round(v.speedKmh));
        speedo.querySelector('.gear i').style.width = `${Math.min(100, (v.speed / v.spec.maxSpeed) * 100)}%`;
        speedo.querySelector('em').textContent = v.spec.name;
        speedo.classList.toggle('damaged', v.health < v.maxHealth * 0.3);
      } else speedo.classList.add('hidden');
      if (notifyTimer > 0) {
        notifyTimer -= dt;
        if (notifyTimer <= 0) help.classList.add('hidden');
      }
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) banner.classList.add('hidden');
      }
      if (radioTimer > 0) {
        radioTimer -= dt;
        if (radioTimer <= 0) radioBox.classList.add('hidden');
      }
      dialogue.update(dt);
      minimap.draw(dt);
    },
  };
  return api;
}
