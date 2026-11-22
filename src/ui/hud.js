export function renderHUD(renderer, gameState, w, h) {
  const y = h - 100;

  // Health bar
  renderer.drawRect(10, y, 200, 20, '#333');
  renderer.drawRect(10, y, Math.max(0, (gameState.player.health / 100) * 200), 20, '#0f0');
  renderer.drawText('HEALTH', 10, y + 35, '#0f0', 12);

  // Wanted level
  renderer.drawText('WANTED: ' + gameState.wanted + '★', w - 150, y, '#ff0000', 14);

  // Money
  renderer.drawText('$' + gameState.money, 10, 30, '#0f0', 14);

  // Minimap
  const mmx = w - 210;
  const mmy = 10;
  const mmsize = 200;
  renderer.drawRect(mmx, mmy, mmsize, mmsize, '#001');

  // Draw city roads on minimap
  const scale = mmsize / gameState.city.width;
  for (const road of gameState.city.roads) {
    renderer.drawRect(mmx + road.x * scale, mmy + road.y * scale,
                     road.width * scale, road.height * scale, '#444');
  }

  // Draw player on minimap
  const px = mmx + gameState.player.x * scale;
  const py = mmy + gameState.player.y * scale;
  renderer.drawCircle(px, py, 3, '#0f0');

  // Current objective
  const activeMission = gameState.missions.find(m => m.active);
  if (activeMission) {
    renderer.drawText('MISSION: ' + activeMission.name, 10, h - 150, '#0f0', 12);
    if (activeMission.objective) {
      renderer.drawText(activeMission.objective, 10, h - 130, '#888', 11);
    }
  }

  // Screen mode specific UI
  if (gameState.screenMode === 'pause') {
    renderer.drawText('PAUSED', w / 2 - 40, h / 2, '#0f0', 24);
  }
}
