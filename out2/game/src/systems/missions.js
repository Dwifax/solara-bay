export function updateMissions(gameState, player, dt) {
  // Simple mission system - detect proximity to mission markers
  for (const mission of gameState.missions) {
    if (mission.completed || mission.active) continue;

    const dist = Math.hypot(mission.x - player.x, mission.y - player.y);
    if (dist < 50) {
      mission.active = true;
    }
  }

  // Activate first mission
  if (!gameState.missions.some(m => m.active)) {
    gameState.missions[0].active = true;
  }
}
