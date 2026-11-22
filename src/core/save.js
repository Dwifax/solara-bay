export function saveGame(gameState) {
  try {
    const saveData = {
      playerPos: { x: gameState.player.x, y: gameState.player.y },
      money: gameState.money,
      health: gameState.player.health,
      armor: gameState.armor,
      wanted: gameState.wanted,
      respect: gameState.respect,
      missions: gameState.missions.map(m => ({ id: m.id, completed: m.completed })),
      time: gameState.time
    };
    localStorage.setItem('solara_bay_save', JSON.stringify(saveData));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const data = localStorage.getItem('solara_bay_save');
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem('solara_bay_save');
  } catch {}
}
