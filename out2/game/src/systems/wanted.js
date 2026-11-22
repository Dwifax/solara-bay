export function updateWanted(gameState, player, city) {
  // Wanted level decays over time
  gameState.wanted *= 0.99;

  // Increase wanted if near water (illegal zone)
  for (const water of city.water) {
    if (player.x > water.x && player.x < water.x + water.width &&
        player.y > water.y && player.y < water.y + water.height) {
      gameState.wanted = Math.min(5, gameState.wanted + 0.01);
    }
  }

  gameState.wanted = Math.floor(gameState.wanted);
}
