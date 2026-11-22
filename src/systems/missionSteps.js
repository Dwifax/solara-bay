// What each kind of mission step does. Every handler has start(ctx, step, s) and
// update(ctx, step, s, dt), which returns 'done', { fail: reason } or nothing while in progress.
// `ctx` is the mission system's toolkit (spawning, markers, objective text, GPS, dialogue).
import { LaneDriver } from './laneDriver.js';
import { RaceDriver } from './raceDriver.js';
import { HunterDriver } from './hunterDriver.js';
import { findRoute } from './roadNavigation.js';
import { nearestRoadPoint } from '../world/cityLayout.js';
import { OUTFITS } from '../entities/pedestrian.js';
import { dist2d } from '../core/mathUtils.js';

function playerPos(game) {
  return game.player.vehicle ? game.player.vehicle.position : game.player.position;
}

function spawnStepEnemies(ctx, step) {
  for (const def of step.enemies ?? []) ctx.spawnEnemy(def);
}

export const STEP_HANDLERS = {
  dialogue: {
    start(ctx, step, s) {
      s.done = false;
      ctx.objective(step.objective ?? null);
      ctx.dialogue(step.lines, () => {
        s.done = true;
      });
    },
    update(ctx, step, s) {
      return s.done ? 'done' : null;
    },
  },

  goto: {
    start(ctx, step, s) {
      s.marker = ctx.marker({ x: step.x, z: step.z, radius: Math.min(step.radius, 6), color: '#ffd23f', height: 4 });
      ctx.gps(step.x, step.z);
      ctx.objective(step.text);
      ctx.destination(step.x, step.z);
      spawnStepEnemies(ctx, step);
    },
    update(ctx, step, s) {
      const game = ctx.game;
      if (step.vehicle && !game.player.vehicle) {
        ctx.objective('Get back in a ~vehicle~.');
        return null;
      }
      ctx.objective(step.text);
      const p = playerPos(game);
      if (dist2d(p.x, p.z, step.x, step.z) < step.radius) return 'done';
      return null;
    },
  },

  enterVehicle: {
    start(ctx, step, s) {
      s.vehicle = ctx.spawnVehicle(step.spawn);
      s.marker = ctx.marker({ x: step.spawn.x, z: step.spawn.z, radius: 0.1, color: '#4fb3ff', height: 2.5, icon: '▼', kind: 'icon' });
      ctx.blip(s.vehicle, 'target-car');
      ctx.objective(step.text);
    },
    update(ctx, step, s) {
      const v = s.vehicle;
      if (v.destroyed || v.sunk) return { fail: 'The vehicle was wrecked.' };
      s.marker.setPosition(v.position.x, v.position.z);
      s.marker.group.position.y = v.position.y + (v.model.roofY ?? 1.5);
      ctx.gps(v.position.x, v.position.z);
      if (ctx.game.player.vehicle === v) return 'done';
      return null;
    },
  },

  getVehicle: {
    start(ctx, step) {
      ctx.objective(step.text);
      ctx.clearGps();
    },
    update(ctx) {
      const v = ctx.game.player.vehicle;
      return v && !v.destroyed ? 'done' : null;
    },
  },

  pickup: {
    start(ctx, step, s) {
      const d = step.ped;
      s.ped = ctx.spawnAlly(d);
      s.marker = ctx.marker({ x: d.x, z: d.z, radius: 0.1, color: '#4fb3ff', height: 2.6, icon: '▼', kind: 'icon' });
      ctx.blip(s.ped, 'friend');
      ctx.gps(d.x, d.z);
      ctx.objective(step.text);
      s.boarding = 0;
    },
    update(ctx, step, s, dt) {
      const game = ctx.game;
      const ped = s.ped;
      if (ped.dead) return { fail: `${step.ped.id === 'kiko' ? 'Kiko' : 'Your friend'} died.` };
      s.marker.setPosition(ped.position.x, ped.position.z);
      const v = game.player.vehicle;
      if (!v) {
        ctx.objective(dist2d(game.player.position.x, game.player.position.z, ped.position.x, ped.position.z) < 20 ? 'Get a ~car~ to pick them up.' : step.text);
        return null;
      }
      ctx.objective(step.text);
      const d = dist2d(v.position.x, v.position.z, ped.position.x, ped.position.z);
      if (d < step.radius && v.speed < 4) {
        const fx = -v.forward().z;
        const fz = v.forward().x;
        const sx = v.position.x + fx * (v.spec.width / 2 + 0.6);
        const sz = v.position.z + fz * (v.spec.width / 2 + 0.6);
        ped.ai.post = { x: sx, z: sz };
        const left = ped.moveToward(sx, sz, 4.5, dt, game.city.collision);
        s.boarding += dt;
        if (left < 1.2 || s.boarding > 6) {
          ped.inVehicle = v;
          ped.group.visible = false;
          v.passenger = ped;
          ctx.run.passenger = ped;
          game.events.emit('uiSelect', {});
          return 'done';
        }
      } else {
        ped.speed = 0;
        s.boarding = 0;
      }
      return null;
    },
  },

  dropoff: {
    start(ctx, step, s) {
      const ped = ctx.run.passenger;
      const v = ctx.game.player.vehicle;
      if (ped && v) {
        const f = v.forward();
        ped.position.set(v.position.x - f.z * (v.spec.width / 2 + 0.8), 0, v.position.z + f.x * (v.spec.width / 2 + 0.8));
        ped.inVehicle = null;
        ped.group.visible = true;
        v.passenger = null;
        ped.ai.post = { x: ped.position.x + 6, z: ped.position.z - 6 };
      }
      s.done = true;
    },
    update() {
      return 'done';
    },
  },

  deliver: {
    start(ctx, step, s) {
      s.vehicle = ctx.run.tags.get(step.tag);
      s.marker = ctx.marker({ x: step.x, z: step.z, radius: Math.min(step.radius, 6), color: '#ffd23f', height: 4 });
      ctx.destination(step.x, step.z);
    },
    update(ctx, step, s) {
      const game = ctx.game;
      const v = s.vehicle;
      if (!v || v.destroyed || v.sunk) return { fail: 'The vehicle was wrecked.' };
      if (game.player.vehicle !== v) {
        ctx.objective('Get back in the ~vehicle~.');
        ctx.gps(v.position.x, v.position.z);
        s.marker.setVisible(false);
        return null;
      }
      if (step.requireNoWanted && game.wanted.level > 0) {
        ctx.objective(step.wantedText ?? 'Lose the ~cops~.');
        ctx.clearGps();
        s.marker.setVisible(false);
        return null;
      }
      s.marker.setVisible(true);
      ctx.objective(step.text);
      ctx.gps(step.x, step.z);
      if (dist2d(v.position.x, v.position.z, step.x, step.z) < step.radius) {
        v.controls.brake = true;
        return 'done';
      }
      return null;
    },
  },

  race: {
    start(ctx, step, s) {
      const game = ctx.game;
      if (step.grid && game.player.vehicle) {
        const pv = game.player.vehicle;
        pv.position.set(step.grid.x, pv.position.y, step.grid.z);
        pv.heading = step.grid.heading;
        pv.vx = 0;
        pv.vz = 0;
        game.cameraCtl.snapBehind(step.grid.heading);
      }
      s.rivals = step.rivals.map((r) => {
        const v = ctx.spawnVehicle({ car: r.car, color: r.color, x: r.x, z: r.z, heading: step.heading ?? Math.PI / 2, tag: null });
        v.driver = new RaceDriver(v, step.checkpoints, r.skill);
        ctx.blip(v, 'rival');
        return v.driver;
      });
      s.index = 0;
      s.countdown = step.countdown ?? 3;
      s.time = 0;
      s.cpMarkers = [];
      s.lastShown = -1;
      s.finished = false;
      ctx.objective(step.text);
      game.ui?.banner(`${Math.ceil(s.countdown)}`, '', 0.9, 'count');
      showCheckpoints(ctx, step, s);
    },
    update(ctx, step, s, dt) {
      const game = ctx.game;
      const v = game.player.vehicle;
      if (s.countdown > 0) {
        s.countdown -= dt;
        if (v) {
          v.controls.throttle = Math.min(v.controls.throttle, 0);
          v.controls.brake = true;
        }
        const shown = Math.ceil(s.countdown);
        if (shown !== s.lastShown && shown > 0) {
          s.lastShown = shown;
          game.ui?.banner(`${shown}`, '', 0.9, 'count');
          game.events.emit('uiMove', {});
        }
        if (s.countdown <= 0) {
          game.ui?.banner('GO!', '', 1, 'count');
          game.events.emit('checkpoint', {});
          for (const r of s.rivals) r.started = true;
        }
        return null;
      }
      s.time += dt;
      const playerProgress = s.index * 1000 - (v ? dist2d(v.position.x, v.position.z, step.checkpoints[Math.min(s.index, step.checkpoints.length - 1)][0], step.checkpoints[Math.min(s.index, step.checkpoints.length - 1)][1]) : 0);
      for (const r of s.rivals) {
        if (r.vehicle.destroyed) continue;
        r.update(dt, game, playerProgress, s.time);
      }
      if (!v) {
        s.outOfCar = (s.outOfCar ?? 0) + dt;
        ctx.objective('Get back in a ~car~!');
        if (s.outOfCar > 15) return { fail: 'You abandoned the race.' };
        return null;
      }
      s.outOfCar = 0;
      ctx.objective(step.text);
      const cp = step.checkpoints[s.index];
      if (dist2d(v.position.x, v.position.z, cp[0], cp[1]) < 12) {
        s.index += 1;
        game.events.emit('checkpoint', {});
        if (s.index >= step.checkpoints.length) {
          const ahead = s.rivals.filter((r) => r.finished).length;
          s.position = ahead + 1;
          ctx.clearRaceHud();
          if (s.position === 1) return 'done';
          return { fail: `You finished ${ordinal(s.position)}.` };
        }
        showCheckpoints(ctx, step, s);
      }
      const position = 1 + s.rivals.filter((r) => r.progress() > playerProgress).length;
      ctx.raceHud({ position, total: s.rivals.length + 1, checkpoint: s.index, checkpoints: step.checkpoints.length, time: s.time });
      return null;
    },
  },

  chase: {
    start(ctx, step, s) {
      const game = ctx.game;
      const t = step.target;
      const v = ctx.spawnVehicle({ car: t.car, color: t.color, x: t.x, z: t.z, heading: t.heading, tag: t.tag });
      const road = nearestRoadPoint(game.city.network, t.x, t.z);
      const e = road.edge;
      const forward = Math.cos(t.heading) * e.dirZ + Math.sin(t.heading) * e.dirX > 0;
      v.driver = new LaneDriver(v, forward ? e.a : e.b, forward ? e.b : e.a, { kind: 'chase', lane: 1.9, cruise: t.cruise ?? 20, obeySignals: false, rng: game.rng, outfit: OUTFITS.gang(game.rng) });
      v.driver.panic = 1e9;
      v.driver.cruise = (t.cruise ?? 20) / 1.7;
      s.target = v;
      s.hunters = [];
      for (let i = 0; i < (step.hunters ?? 0); i += 1) {
        const h = ctx.spawnVehicle({ car: 'marlin', color: 0x101010, x: t.x - Math.sin(t.heading) * (10 + i * 8), z: t.z - Math.cos(t.heading) * (10 + i * 8), heading: t.heading, tag: null });
        h.driver = new HunterDriver(h, game);
        ctx.blip(h, 'enemy-car');
        s.hunters.push(h);
      }
      ctx.blip(v, 'target-car');
      s.marker = ctx.marker({ x: t.x, z: t.z, radius: 0.1, color: '#ff4a4a', height: 2.6, icon: '▼', kind: 'icon' });
      ctx.objective(step.text);
    },
    update(ctx, step, s) {
      const game = ctx.game;
      const v = s.target;
      s.marker.setPosition(v.position.x, v.position.z);
      s.marker.group.position.y = v.position.y + (v.model.roofY ?? 1.5);
      ctx.gps(v.position.x, v.position.z);
      const p = playerPos(game);
      const gap = dist2d(p.x, p.z, v.position.x, v.position.z);
      if (gap < step.loseDistance * 0.6) s.engaged = true;
      if (!s.engaged) {
        // The target waits until the player is close enough to give chase.
        v.driver.cruise = gap > step.loseDistance * 0.8 ? 0 : (step.target.cruise ?? 20) / 1.7;
      } else if (gap > step.loseDistance) return { fail: 'The target got away.' };
      const disabled = v.destroyed || v.sunk || v.health < v.maxHealth * 0.45;
      ctx.targetHealth(v.health / v.maxHealth);
      if (disabled) {
        ctx.run.lastTarget = { x: v.position.x, z: v.position.z };
        if (v.driver && v.driver !== 'player' && v.driver.kind === 'chase') {
          const driver = v.driver;
          v.driver = null;
          v.controls.throttle = 0;
          v.controls.brake = true;
          if (!v.destroyed) game.traffic.ejectDriver(v, driver, game.player.position);
        }
        for (const h of s.hunters) if (h.driver) h.driver = null;
        ctx.targetHealth(null);
        return 'done';
      }
      return null;
    },
  },

  collect: {
    start(ctx, step, s) {
      const pos = step.at ? ctx.run.lastTarget ?? ctx.tagPosition(step.at) : { x: step.x, z: step.z };
      s.x = pos.x;
      s.z = pos.z;
      s.marker = ctx.marker({ x: s.x, z: s.z, radius: 0.8, color: step.item === 'cash' ? '#5dff8a' : '#ffd23f', kind: 'pickup' });
      ctx.gps(s.x, s.z);
      ctx.destination(s.x, s.z);
      ctx.objective(step.text);
    },
    update(ctx, step, s) {
      const game = ctx.game;
      const p = playerPos(game);
      const reach = game.player.vehicle ? 4.5 : 2.2;
      if (dist2d(p.x, p.z, s.x, s.z) < reach) {
        game.events.emit('pickup', {});
        return 'done';
      }
      return null;
    },
  },

  kill: {
    start(ctx, step, s) {
      for (const def of step.spawnOnStart ?? []) ctx.spawnEnemy(def);
      if (step.say) ctx.say(step.say);
      ctx.objective(step.text);
      ctx.clearGps();
    },
    update(ctx, step) {
      const group = ctx.group(step.group);
      const alive = group.filter((p) => !p.dead);
      if (alive.length === 0) return 'done';
      // Point the GPS at the closest one.
      const p = playerPos(ctx.game);
      let best = null;
      let bestD = Infinity;
      for (const e of alive) {
        const d = dist2d(p.x, p.z, e.position.x, e.position.z);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (best && bestD > 40) ctx.gps(best.position.x, best.position.z);
      else ctx.clearGps();
      ctx.counter(`${alive.length} left`);
      return null;
    },
  },

  escort: {
    start(ctx, step, s) {
      const game = ctx.game;
      const net = game.city.network;
      const route = findRoute(net, net.nodes.get(step.from), net.nodes.get(step.to));
      const v = ctx.spawnVehicle(step.vehicle);
      v.driver = new LaneDriver(v, route[0], route[1], { kind: 'escort', lane: 1.9, cruise: 11, obeySignals: false, route: route.slice(2), rng: game.rng });
      s.van = v;
      s.route = route;
      s.total = route.length;
      s.ambushes = step.ambushes.slice();
      s.ambushGroups = [];
      ctx.blip(v, 'friend-car');
      s.marker = ctx.marker({ x: v.position.x, z: v.position.z, radius: 0.1, color: '#4fb3ff', height: 2.6, icon: '▼', kind: 'icon' });
      s.goal = route[route.length - 1];
      ctx.destination(s.goal.x, s.goal.z);
      ctx.objective(step.text);
    },
    update(ctx, step, s, dt) {
      const game = ctx.game;
      const v = s.van;
      if (v.destroyed || v.sunk) return { fail: "Dez's van was destroyed." };
      s.marker.setPosition(v.position.x, v.position.z);
      s.marker.group.position.y = v.position.y + 2.6;
      const p = playerPos(game);
      const d = dist2d(p.x, p.z, v.position.x, v.position.z);
      if (d < 60) s.engaged = true;
      if (s.engaged && d > 220) return { fail: 'You abandoned Dez.' };
      ctx.targetHealth(v.health / v.maxHealth, 'Van');
      const driver = v.driver;
      const progress = 1 - ((driver.route ? driver.route.length : 0) + 1) / s.total;
      if (s.ambushes.length && progress >= s.ambushes[0]) {
        s.ambushes.shift();
        const f = v.forward();
        const group = [];
        for (let i = 0; i < 3; i += 1) {
          const ax = v.position.x + f.x * (28 + i * 6) + -f.z * (i % 2 ? 10 : -10);
          const az = v.position.z + f.z * (28 + i * 6) + f.x * (i % 2 ? 10 : -10);
          group.push(ctx.spawnEnemy({ id: `ambush${s.ambushGroups.length}`, role: 'gang', weapon: i === 0 ? 'smg' : 'pistol', x: ax, z: az, hostile: true }));
        }
        s.ambushGroups.push(group);
        ctx.say([{ who: 'dez', text: 'Gulls! Up ahead! I am NOT built for this, Sol!' }]);
      }
      const threat = s.ambushGroups.flat().filter((e) => !e.dead && dist2d(e.position.x, e.position.z, v.position.x, v.position.z) < 60);
      if (threat.length) {
        driver.cruise = 0;
        v.damage(dt * 14, null, null);
        ctx.objective('Clear the ~ambush~!');
        ctx.counter(`${threat.length} left`);
      } else {
        driver.cruise = d > 70 ? (s.engaged ? 3 : 0) : 11;
        ctx.objective(d > 70 ? 'Catch up with ~Dez~.' : step.text);
        if (d > 70) ctx.gps(v.position.x, v.position.z);
        else ctx.clearGps();
        ctx.counter(null);
      }
      if (driver.finished || dist2d(v.position.x, v.position.z, s.goal.x, s.goal.z) < 12) {
        v.controls.brake = true;
        v.controls.throttle = 0;
        ctx.targetHealth(null);
        ctx.counter(null);
        return 'done';
      }
      return null;
    },
  },

  hold: {
    start(ctx, step, s) {
      s.time = 0;
      s.marker = ctx.marker({ x: step.x, z: step.z, radius: Math.min(step.radius, 7), color: '#ff7a3a', height: 2 });
      if (step.wanted) ctx.game.wanted.setLevel(step.wanted, step.x, step.z);
      spawnStepEnemies(ctx, step);
      if (step.say) ctx.say(step.say);
      ctx.objective(step.text);
    },
    update(ctx, step, s, dt) {
      const p = playerPos(ctx.game);
      const inside = dist2d(p.x, p.z, step.x, step.z) < step.radius;
      if (inside) s.time += dt;
      ctx.objective(inside ? step.text : 'Get back to the ~lobby~!');
      ctx.progress(s.time / step.time, 'Vault');
      if (s.time >= step.time) {
        ctx.progress(null);
        return 'done';
      }
      return null;
    },
  },

  loseWanted: {
    start(ctx, step) {
      ctx.objective(step.text);
      ctx.clearGps();
    },
    update(ctx) {
      return ctx.game.wanted.level === 0 ? 'done' : null;
    },
  },
};

function showCheckpoints(ctx, step, s) {
  for (const m of s.cpMarkers) m.remove();
  s.cpMarkers = [];
  const cp = step.checkpoints[s.index];
  const last = s.index === step.checkpoints.length - 1;
  s.cpMarkers.push(ctx.marker({ x: cp[0], z: cp[1], radius: 7, color: last ? '#ffffff' : '#ffd23f', kind: 'checkpoint', icon: last ? '🏁' : `${s.index + 1}` }));
  const next = step.checkpoints[s.index + 1];
  if (next) s.cpMarkers.push(ctx.marker({ x: next[0], z: next[1], radius: 4, color: '#a08020', kind: 'checkpoint' }));
  ctx.gps(cp[0], cp[1]);
  ctx.checkpoints(step.checkpoints.slice(s.index));
}

function ordinal(n) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}
