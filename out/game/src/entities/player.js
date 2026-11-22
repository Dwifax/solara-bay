export function createPlayer(city) {
  return {
    x: city.playerStart.x,
    y: city.playerStart.y,
    vx: 0,
    vy: 0,
    angle: 0,
    health: 100,
    armor: 0,
    money: 1000,
    inVehicle: false,
    vehicle: null,
    weapon: 'fist',
    ammo: { pistol: 30, smg: 100, shotgun: 20 },

    update(dt, actions, city) {
      const speed = actions.sprint ? 200 : 120;
      const accel = speed / 0.1;

      this.vx *= 0.9;
      this.vy *= 0.9;

      if (actions.forward) this.vy -= accel * dt;
      if (actions.back) this.vy += accel * dt;
      if (actions.left) this.vx -= accel * dt;
      if (actions.right) this.vx += accel * dt;

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Collision with buildings
      for (const building of city.buildings) {
        if (this.x > building.x && this.x < building.x + building.width &&
            this.y > building.y && this.y < building.y + building.height) {
          this.x -= this.vx * dt;
          this.y -= this.vy * dt;
        }
      }

      // Keep in bounds
      this.x = Math.max(0, Math.min(city.width, this.x));
      this.y = Math.max(0, Math.min(city.height, this.y));
    }
  };
}
