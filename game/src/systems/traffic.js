export function createTraffic(city, random, count) {
  const traffic = [];
  const colors = ['#aa0000', '#0000aa', '#aaaa00', '#00aaaa'];

  for (let i = 0; i < count; i++) {
    const roadSegment = city.roads[Math.floor(random() * city.roads.length)];
    traffic.push({
      x: roadSegment.x + random() * roadSegment.width,
      y: roadSegment.y + random() * roadSegment.height,
      vx: (random() - 0.5) * 100,
      vy: (random() - 0.5) * 100,
      color: colors[Math.floor(random() * colors.length)]
    });
  }

  return traffic;
}

export function updateTraffic(traffic, dt, city, player) {
  for (const car of traffic) {
    car.vx *= 0.95;
    car.vy *= 0.95;

    if (car.x < player.x - 500 || car.x > player.x + 500 ||
        car.y < player.y - 500 || car.y > player.y + 500) continue;

    // Simple AI: move along roads
    const targetRoad = city.roads[Math.floor(Math.random() * city.roads.length)];
    const targetX = targetRoad.x + targetRoad.width / 2;
    const targetY = targetRoad.y + targetRoad.height / 2;

    const dx = targetX - car.x;
    const dy = targetY - car.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 10) {
      car.vx += (dx / dist) * 50 * dt;
      car.vy += (dy / dist) * 50 * dt;
    }

    car.x += car.vx * dt;
    car.y += car.vy * dt;

    // Keep in bounds
    car.x = Math.max(0, Math.min(city.width, car.x));
    car.y = Math.max(0, Math.min(city.height, car.y));
  }
}
