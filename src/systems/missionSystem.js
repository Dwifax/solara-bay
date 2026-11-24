// Runs the story. Shows the next mission's start marker, starts it when the player walks in,
// steps through its script (see missionSteps.js), keeps everything it spawned tagged so it can
// be cleaned up, shows objectives and GPS, and pays out or fails the mission.
import { MISSIONS } from '../data/missions.js';
import { CHARACTERS } from '../data/story.js';
import { STEP_HANDLERS } from './missionSteps.js';
import { OUTFITS } from '../entities/pedestrian.js';
import { dist2d } from '../core/mathUtils.js';

export function createMissionSystem(game) {
  const { events } = game;
  const progress = { completed: [], failedCount: 0 };
  let run = null;
  let startMarker = null;
  let giverPed = null;
  let cooldown = 0;

  const GIVER_OUTFITS = {
    benny: { skin: 0xc68a5e, hair: 0x8a8a8a, shirt: 0xf4d35e, pants: 0x6b4f3a, cap: 0x1f6f8b, hairStyle: 'short' },
    dez: { skin: 0x5a3825, hair: 0x111111, shirt: 0x80ed99, pants: 0x2b3a55, hairStyle: 'short' },
    juno: { skin: 0xf1c9a5, hair: 0xe76f9a, shirt: 0x111111, pants: 0xe9e2d0, hairStyle: 'long' },
    kiko: { skin: 0xc68a5e, hair: 0x1c1410, shirt: 0x3e92cc, pants: 0x3d3d3d, cap: 0xffc857 },
  };

  /** The mission giver waits beside their marker (Kiko only calls by phone). */
  function placeGiver(m) {
    if (giverPed) {
      game.pedSystem.remove(giverPed);
      giverPed = null;
    }
    if (!m || m.giver === 'kiko' || !GIVER_OUTFITS[m.giver]) return;
    giverPed = game.pedSystem.spawnPed('ally', m.start.x + 1.8, m.start.z + (m.start.z > 0 ? -1.2 : 1.2), GIVER_OUTFITS[m.giver]);
    giverPed.persistent = true;
    giverPed.missionTag = 'giver';
    giverPed.health = 500;
    giverPed.ai.post = { x: giverPed.position.x, z: giverPed.position.z };
    giverPed.ai.idleFace = { x: m.start.x, z: m.start.z };
  }

  function nextMission() {
    return MISSIONS.find((m) => !progress.completed.includes(m.id)) ?? null;
  }

  function refreshStartMarker() {
    if (startMarker) startMarker.remove();
    startMarker = null;
    const m = nextMission();
    if (!m || run) return;
    const who = CHARACTERS[m.giver];
    startMarker = game.markers.add({ x: m.start.x, z: m.start.z, radius: 1.6, color: who.color, icon: m.letter, height: 3.2 });
    if (!giverPed || giverPed.dead) placeGiver(m);
  }

  /** The toolkit each step handler uses. */
  function makeContext(r) {
    return {
      game,
      run: r,
      spawnVehicle(def) {
        const v = game.vehicleSystem.spawn(def.car, def.x, def.z, def.heading ?? 0, def.color);
        v.persistent = true;
        v.missionTag = def.tag ?? 'mission';
        r.vehicles.push(v);
        if (def.tag) r.tags.set(def.tag, v);
        return v;
      },
      spawnEnemy(def) {
        const outfit = def.role === 'guard' ? OUTFITS.guard(game.rng) : OUTFITS.gang(game.rng);
        const ped = game.pedSystem.spawnPed(def.role, def.x, def.z, outfit);
        ped.arm(def.weapon ?? 'pistol');
        ped.missionTag = def.id;
        ped.persistent = true;
        ped.ai.hostile = def.hostile !== false;
        ped.ai.post = { x: def.x, z: def.z };
        ped.ai.accuracy = 0.28 * game.settings.difficulty;
        ped.ai.aggroRange = 70;
        if (def.health) ped.health = def.health;
        r.peds.push(ped);
        if (!r.groups.has(def.id)) r.groups.set(def.id, []);
        r.groups.get(def.id).push(ped);
        r.blips.push({ entity: ped, type: 'enemy' });
        return ped;
      },
      spawnAlly(def) {
        const ped = game.pedSystem.spawnPed('ally', def.x, def.z, { ...OUTFITS.civilian(game.rng), ...def.outfit });
        ped.persistent = true;
        ped.missionTag = def.id;
        ped.health = 200;
        ped.ai.post = { x: def.x, z: def.z };
        r.peds.push(ped);
        return ped;
      },
      group(id) {
        return r.groups.get(id) ?? [];
      },
      tagPosition(tag) {
        const v = r.tags.get(tag);
        return v ? { x: v.position.x, z: v.position.z } : { x: 0, z: 0 };
      },
      marker(opts) {
        const m = game.markers.add(opts);
        r.markers.push(m);
        return m;
      },
      blip(entity, type) {
        r.blips.push({ entity, type });
      },
      objective(text) {
        r.objective = text;
        game.ui?.setObjective(text);
      },
      gps(x, z) {
        game.gps = { x, z };
      },
      clearGps() {
        game.gps = null;
      },
      destination(x, z) {
        r.destination = { x, z };
      },
      dialogue(lines, done) {
        if (game.ui) game.ui.dialogue.play(lines, done);
        else done();
      },
      say(lines) {
        game.ui?.dialogue.say(lines);
      },
      raceHud(info) {
        game.ui?.setRaceInfo(info);
      },
      clearRaceHud() {
        game.ui?.setRaceInfo(null);
      },
      checkpoints(list) {
        r.checkpoints = list;
      },
      progress(frac, label) {
        game.ui?.setProgress(frac, label);
      },
      counter(text) {
        game.ui?.setCounter(text);
      },
      targetHealth(frac, label = 'Target') {
        game.ui?.setTargetHealth(frac, label);
      },
    };
  }

  function start(mission) {
    if (startMarker) startMarker.remove();
    startMarker = null;
    run = { mission, stepIndex: -1, step: null, state: {}, vehicles: [], peds: [], markers: [], blips: [], tags: new Map(), groups: new Map(), passenger: null, objective: null, destination: null, checkpoints: null, lastTarget: null };
    run.ctx = makeContext(run);
    if (giverPed) {
      run.peds.push(giverPed);
      if (!game.player.vehicle) run.cutsceneWith = giverPed;
      giverPed = null;
    }
    game.ui?.banner(mission.title.toUpperCase(), mission.side ? mission.kind ?? 'SIDE JOB' : 'STORY MISSION', 3.2, 'mission');
    events.emit('missionStarted', { mission });
    advance();
  }

  function clearStepVisuals() {
    for (const m of run.markers) m.remove();
    run.markers = [];
    game.gps = null;
    run.destination = null;
    run.checkpoints = null;
    game.ui?.setProgress(null);
    game.ui?.setCounter(null);
    game.ui?.setTimer(null);
  }

  function applyOnComplete(step) {
    const oc = step.onComplete;
    if (!oc) return;
    if (oc.wanted) game.wanted.setLevel(oc.wanted);
    if (oc.hostile) for (const p of run.groups.get(oc.hostile) ?? []) p.ai.hostile = true;
    if (oc.say) game.ui?.dialogue.say(oc.say);
    if (oc.giveWeapon) {
      game.player.giveWeapon(oc.giveWeapon[0], oc.giveWeapon[1]);
      game.player.selectWeapon(oc.giveWeapon[0]);
      game.ui?.notify('Picked up a Wasp SMG.');
    }
  }

  function advance() {
    if (run.step) {
      applyOnComplete(run.step);
      clearStepVisuals();
    }
    run.stepIndex += 1;
    if (run.stepIndex >= run.mission.steps.length) {
      pass();
      return;
    }
    run.step = run.mission.steps[run.stepIndex];
    run.state = {};
    run.timeLeft = run.step.timeLimit ?? null;
    // The opening conversation plays as a short cutscene when the giver is there in person.
    game.cutscene = run.stepIndex === 0 && run.step.type === 'dialogue' && run.cutsceneWith ? { other: run.cutsceneWith, time: 0 } : null;
    STEP_HANDLERS[run.step.type].start(run.ctx, run.step, run.state);
  }

  function cleanup(keepVehicles) {
    clearStepVisuals();
    game.cutscene = null;
    for (const p of run.peds) {
      if (p.inVehicle && p.inVehicle.passenger === p) p.inVehicle.passenger = null;
      p.missionTag = null;
      p.persistent = false;
      if (p.role === 'ally') game.pedSystem.remove(p);
      else p.ai.hostile = false;
    }
    for (const v of run.vehicles) {
      v.missionTag = null;
      if (v.driver && v.driver !== 'player' && v.driver.kind !== 'traffic') v.driver = null;
      v.persistent = v === game.player.vehicle || keepVehicles;
    }
    game.ui?.setObjective(null);
    game.ui?.setRaceInfo(null);
    game.ui?.setTargetHealth(null);
    game.ui?.dialogue.clear();
  }

  function pass() {
    const m = run.mission;
    cleanup(false);
    if (m.side) {
      game.economy.addMoney(m.reward.money, 'job');
      game.economy.addStreetCred(m.reward.streetCred);
      game.ui?.missionPassed(m.title, m.reward.money, m.reward.streetCred, m.passText);
      events.emit('missionPassed', { mission: m });
      m.onPass?.();
      run = null;
      cooldown = 3;
      refreshStartMarker();
      return;
    }
    progress.completed.push(m.id);
    game.economy.addMoney(m.reward.money, 'mission');
    game.economy.addStreetCred(m.reward.streetCred);
    game.stats.missionsPassed += 1;
    game.ui?.missionPassed(m.title, m.reward.money, m.reward.streetCred);
    events.emit('missionPassed', { mission: m });
    run = null;
    cooldown = 6;
    refreshStartMarker();
    game.saveSystem?.autosave();
  }

  function fail(reason) {
    if (!run) return;
    const m = run.mission;
    cleanup(false);
    if (!m.side) progress.failedCount += 1;
    game.ui?.missionFailed(reason);
    events.emit('missionFailed', { mission: m, reason });
    run = null;
    cooldown = 5;
    refreshStartMarker();
  }

  events.on('flatlined', () => fail('You were flatlined.'));
  events.on('cuffed', () => fail('You were cuffed.'));

  function update(dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (!run) {
      const m = nextMission();
      if (!m || cooldown > 0 || game.activities?.busy()) return;
      if (!startMarker) refreshStartMarker();
      const p = game.player.vehicle ? game.player.vehicle.position : game.player.position;
      const slow = !game.player.vehicle || game.player.vehicle.speed < 6;
      if (slow && dist2d(p.x, p.z, m.start.x, m.start.z) < (game.player.vehicle ? 4 : 2)) start(m);
      return;
    }
    // Mission-owned AI cars.
    for (const v of run.vehicles) {
      const d = v.driver;
      if (d && d !== 'player' && (d.kind === 'chase' || d.kind === 'escort' || d.kind === 'hunter')) {
        if (v.destroyed || v.sunk) continue;
        d.update(dt, game);
        v.headlights = game.tod.state.night > 0.35;
      }
    }
    if (run.timeLeft !== null) {
      run.timeLeft -= dt;
      game.ui?.setTimer(run.timeLeft);
      if (run.timeLeft <= 0) {
        game.ui?.setTimer(null);
        fail('Out of time.');
        return;
      }
    }
    const result = STEP_HANDLERS[run.step.type].update(run.ctx, run.step, run.state, dt);
    if (result === 'done') advance();
    else if (result && result.fail) fail(result.fail);
  }

  return {
    update,
    progress,
    get active() {
      return run;
    },
    get list() {
      return MISSIONS;
    },
    nextMission,
    refreshStartMarker,
    suppressGunfireCrime() {
      return !!(run && run.mission.quiet && game.wanted.level === 0);
    },
    /** Map blips for the minimap and map screen. */
    blips() {
      const out = [];
      if (run) {
        for (const b of run.blips) {
          const e = b.entity;
          if (e.dead || e.destroyed) continue;
          if (e.inVehicle) continue;
          out.push({ x: e.position.x, z: e.position.z, type: b.type });
        }
        if (run.destination) out.push({ x: run.destination.x, z: run.destination.z, type: 'destination' });
        if (run.checkpoints) run.checkpoints.slice(0, 2).forEach((c, i) => out.push({ x: c[0], z: c[1], type: i === 0 ? 'checkpoint' : 'checkpoint-next' }));
      } else {
        const m = nextMission();
        if (m) out.push({ x: m.start.x, z: m.start.z, type: 'mission', label: m.letter, color: CHARACTERS[m.giver].color });
      }
      return out;
    },
    load(data) {
      progress.completed = (data?.completed ?? []).filter((id) => MISSIONS.some((m) => m.id === id));
      if (run) cleanup(false);
      run = null;
      placeGiver(null);
      refreshStartMarker();
    },
    abort() {
      if (run) cleanup(false);
      run = null;
      placeGiver(null);
      refreshStartMarker();
    },
    /** Start a side job (street race, courier run) described like a mission. */
    startSide(mission) {
      if (run) return false;
      start({ ...mission, side: true });
      return true;
    },
    forceStart(id) {
      const m = MISSIONS.find((x) => x.id === id);
      if (run) cleanup(false);
      run = null;
      if (m) start(m);
    },
    jumpToStep(index) {
      if (!run) return;
      while (run && run.stepIndex < index) advance();
    },
  };
}
