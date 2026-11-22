export function renderHUD(renderer, gameState, w, h) {
  const fontSize = 12;

  // Health bar (bottom left)
  const healthY = h - 85;
  renderer.drawRect(10, healthY, 200, 15, '#1a1a1a');
  renderer.drawRect(12, healthY + 2, Math.max(0, (gameState.player.health / 100) * 196), 11,
                   gameState.player.health > 50 ? '#00ff00' : '#ff6600');
  renderer.drawText('HEALTH: ' + Math.floor(gameState.player.health), 10, healthY + 25, '#0f0', fontSize);

  // Armor bar
  const armorY = healthY - 25;
  renderer.drawRect(10, armorY, 200, 15, '#1a1a1a');
  renderer.drawRect(12, armorY + 2, Math.max(0, (gameState.armor / 100) * 196), 11, '#0066ff');
  renderer.drawText('ARMOR: ' + Math.floor(gameState.armor), 10, armorY + 25, '#0f0', fontSize);

  // Money (top left)
  renderer.drawText('$ ' + gameState.money, 10, 30, '#00ff00', 14);
  renderer.drawText('RESPECT: ' + gameState.respect, 10, 52, '#ffff00', fontSize);

  // Wanted level (top right)
  const wantedX = w - 180;
  const wantedY = 20;
  renderer.drawText('WANTED:', wantedX, wantedY, '#ff0000', fontSize);
  for (let i = 0; i < 5; i++) {
    const starColor = i < gameState.wanted ? '#ff0000' : '#333333';
    renderer.drawText('★', wantedX + 70 + i * 15, wantedY, starColor, 14);
  }

  // Minimap (bottom right)
  const mmx = w - 220;
  const mmy = h - 220;
  const mmsize = 200;

  renderer.drawRect(mmx - 2, mmy - 2, mmsize + 4, mmsize + 4, '#00ff00');
  renderer.drawRect(mmx, mmy, mmsize, mmsize, '#001a1a');

  const scale = mmsize / gameState.city.width;

  // Draw roads on minimap
  for (const road of gameState.city.roads) {
    renderer.drawRect(mmx + road.x * scale, mmy + road.y * scale,
                     road.width * scale, road.height * scale, '#333333');
  }

  // Draw water
  for (const water of gameState.city.water) {
    renderer.drawRect(mmx + water.x * scale, mmy + water.y * scale,
                     water.width * scale, water.height * scale, '#0066cc');
  }

  // Draw player on minimap
  const px = mmx + gameState.player.x * scale;
  const py = mmy + gameState.player.y * scale;
  renderer.drawCircle(px, py, 3, gameState.player.inVehicle ? '#ff00ff' : '#00ff00');

  // Current objective
  const activeMission = gameState.missions.find(m => m.active);
  if (activeMission) {
    const objY = h - 50;
    renderer.drawText('MISSION: ' + activeMission.name, 10, objY, '#ffff00', 13);
    if (activeMission.objective) {
      renderer.drawText(activeMission.objective, 10, objY + 18, '#cccccc', fontSize);
    }
  }

  // Screen mode UI
  if (gameState.screenMode === 'pause') {
    const ctx = renderer.getContext();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, w, h);
    renderer.drawText('=== PAUSED ===', w / 2 - 50, h / 2 - 60, '#00ff00', 20);
    renderer.drawText('Press ESC to resume', w / 2 - 80, h / 2, '#0f0', 14);
  }

  if (gameState.screenMode === 'gameover') {
    const ctx = renderer.getContext();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, w, h);
    renderer.drawText('WASTED', w / 2 - 60, h / 2 - 40, '#ff0000', 32);
    renderer.drawText('You died. Respawning...', w / 2 - 100, h / 2 + 20, '#ff0000', 14);
  }
}
