export function createPoliceSystem(gameState, city, random) {
  const police = [];
  const roadSegments = city.roads;

  function createPatrolCar(x, y) {
    return {
      x, y,
      vx: 0, vy: 0,
      angle: Math.random() * Math.PI * 2,
      state: 'patrol',
      targetX: x, targetY: y,
      health: 50,
      chasingPlayer: false
    };
  }

  for (let i = 0; i < 3; i++) {
    const road = roadSegments[Math.floor(random() * roadSegments.length)];
    police.push(createPatrolCar(road.x + random() * road.width, road.y + random() * road.height));
  }

  return {
    units: police,

    update(dt, player, city) {
      for (const car of police) {
        car.vx *= 0.9;
        car.vy *= 0.9;

        const dx = player.x - car.x;
        const dy = player.y - car.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 400) {
          car.chasingPlayer = true;
          car.targetX = player.x;
          car.targetY = player.y;
        } else if (dist > 600) {
          car.chasingPlayer = false;
        }

        if (car.chasingPlayer) {
          const angle = Math.atan2(dx, -dy);
          car.angle += (angle - car.angle) * 0.05;
          car.vx += Math.sin(car.angle) * 100 * dt;
          car.vy -= Math.cos(car.angle) * 100 * dt;
        } else {
          const targetRoad = city.roads[Math.floor(Math.random() * city.roads.length)];
          const targetX = targetRoad.x + targetRoad.width / 2;
          const targetY = targetRoad.y + targetRoad.height / 2;

          const angle = Math.atan2(targetX - car.x, -(targetY - car.y));
          car.angle += (angle - car.angle) * 0.02;
          car.vx += Math.sin(car.angle) * 50 * dt;
          car.vy -= Math.cos(car.angle) * 50 * dt;
        }

        const speed = Math.hypot(car.vx, car.vy);
        if (speed > 150) {
          const scale = 150 / speed;
          car.vx *= scale;
          car.vy *= scale;
        }

        car.x += car.vx * dt;
        car.y += car.vy * dt;

        // Collision with buildings
        for (const building of city.buildings) {
          if (car.x > building.x && car.x < building.x + building.width &&
              car.y > building.y && car.y < building.y + building.height) {
            car.x -= car.vx * dt;
            car.y -= car.vy * dt;
            car.vx *= -0.5;
            car.vy *= -0.5;
          }
        }

        car.x = Math.max(0, Math.min(city.width, car.x));
        car.y = Math.max(0, Math.min(city.height, car.y));

        // Ram player
        if (dist < 30 && car.chasingPlayer) {
          gameState.player.health -= 5;
          gameState.wanted = Math.min(5, gameState.wanted + 0.5);
        }
      }

      // Add more police if wanted level is high
      if (gameState.wanted >= 3 && police.length < 5 + gameState.wanted) {
        const road = roadSegments[Math.floor(random() * roadSegments.length)];
        police.push(createPatrolCar(road.x + random() * road.width, road.y + random() * road.height));
      }
    }
  };
}
