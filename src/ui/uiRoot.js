// Assembles the interface (HUD, menus, map screen, weapon wheel) and exposes the small API the
// game systems call: objectives, dialogue, banners, notifications, prompts, shops and saving.
import { createHud } from './hud.js';
import { createMenus } from './menus.js';
import { createMapScreen } from './mapScreen.js';
import { createWeaponWheel } from './weaponWheel.js';
import { renderBaseMap } from './mapRenderer.js';

export function createUi(game, root, flow) {
  const baseMap = renderBaseMap(game.city);
  const hud = createHud(game, root, baseMap);
  const wheel = createWeaponWheel(game, hud.root);
  const map = createMapScreen(game, root, baseMap);
  const menus = createMenus(game, root, {
    newGame: () => flow.newGame(),
    loadSlot: (slot) => flow.loadSlot(slot),
    resume: () => flow.resume(),
    openMap: () => flow.openMap(),
    quitToTitle: () => flow.quitToTitle(),
    closeOverlay: () => flow.resume(),
    escapeTop: (kind) => {
      if (kind !== 'title') flow.resume();
    },
  });

  return {
    hud,
    menus,
    map,
    wheel,
    baseMap,
    dialogue: hud.dialogue,
    setObjective: hud.setObjective,
    setCounter: hud.setCounter,
    setTargetHealth: hud.setTargetHealth,
    setProgress: hud.setProgress,
    setTimer: hud.setTimer,
    setRaceInfo: hud.setRaceInfo,
    setPrompt: hud.setPrompt,
    notify: hud.notify,
    banner: hud.banner,
    missionPassed: hud.missionPassed,
    missionFailed: hud.missionFailed,
    showRadio: hud.showRadio,
    moneyPopup: hud.moneyPopup,
    openShop(kind) {
      flow.openOverlay(() => menus.showShop(kind));
    },
    openSaveMenu() {
      flow.openOverlay(() => menus.showSaves());
    },
  };
}
