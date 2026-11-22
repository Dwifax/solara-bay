export const VEHICLES = [
  { name: 'Sedan', accel: 150, maxSpeed: 200, handling: 0.8, color: '#cc3344' },
  { name: 'Sports', accel: 250, maxSpeed: 280, handling: 0.9, color: '#ff0000' },
  { name: 'Pickup', accel: 120, maxSpeed: 160, handling: 0.6, color: '#00aa00' },
  { name: 'Cruiser', accel: 180, maxSpeed: 220, handling: 0.7, color: '#0000ff' },
];

export function createVehicle(x, y, type) {
  const spec = VEHICLES[type % VEHICLES.length];
  return {
    x, y,
    vx: 0, vy: 0,
    angle: 0,
    type,
    spec,
    health: 100,
    fuel: 100,
    occupied: false,
    driver: null,
    dust: [],

    update(dt, actions, city) {
      const speed = this.spec.maxSpeed;
      const accel = this.spec.accel;

      this.vx *= 0.95;
      this.vy *= 0.95;

      if (actions.forward) {
        const ax = Math.sin(this.angle) * accel;
        const ay = -Math.cos(this.angle) * accel;
        this.vx += ax * dt;
        this.vy += ay * dt;
      }
      if (actions.back) {
        const ax = -Math.sin(this.angle) * accel * 0.5;
        const ay = Math.cos(this.angle) * accel * 0.5;
        this.vx += ax * dt;
        this.vy += ay * dt;
      }
      if (actions.left) this.angle -= 3 * dt;
      if (actions.right) this.angle += 3 * dt;

      const speed_mag = Math.hypot(this.vx, this.vy);
      if (speed_mag > speed) {
        const scale = speed / speed_mag;
        this.vx *= scale;
        this.vy *= scale;
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Collision
      for (const building of city.buildings) {
        if (this.x > building.x - 20 && this.x < building.x + building.width + 20 &&
            this.y > building.y - 20 && this.y < building.y + building.height + 20) {
          this.x -= this.vx * dt;
          this.y -= this.vy * dt;
          this.vx *= -0.5;
          this.vy *= -0.5;
          this.health -= 5;
        }
      }

      // Keep in bounds
      this.x = Math.max(10, Math.min(city.width - 10, this.x));
      this.y = Math.max(10, Math.min(city.height - 10, this.y));

      this.fuel = Math.max(0, this.fuel - speed_mag * dt * 0.1);
      if (this.fuel === 0) this.vx = this.vy = 0;
    }
  };
}
