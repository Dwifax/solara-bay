// The SBPD helicopter: a primitive model with spinning rotors that flies to a point, circles it
// with a bank, and sweeps a searchlight (a real spotlight plus a visible beam at night).
import * as THREE from 'three';
import { box, cylinder, mergeGeometries } from '../render/geometryUtils.js';
import { vertexColorMaterial, createNightGlowMaterial } from '../render/cityMaterials.js';
import { damp, angleDelta } from '../core/mathUtils.js';

function helicopterGeometry() {
  return mergeGeometries([
    box(1.9, 1.7, 3.6, 0x1b2a4a, 0, 0, 0.3),
    box(1.7, 0.9, 1.4, 0x22303c, 0, 0.2, 2.1),
    box(2.0, 0.35, 2.4, 0xf2f2f2, 0, -0.6, 0.2),
    box(0.45, 0.5, 4.6, 0x1b2a4a, 0, 0.35, -3.6),
    box(0.15, 1.4, 0.8, 0x1b2a4a, 0, 0.9, -5.7),
    box(1.6, 0.12, 0.5, 0x1b2a4a, 0, 0.35, -5.4),
    box(0.12, 0.12, 3.4, 0x333333, -0.85, -1.25, 0.2),
    box(0.12, 0.12, 3.4, 0x333333, 0.85, -1.25, 0.2),
    box(0.1, 0.5, 0.1, 0x333333, -0.85, -1.0, 1.0),
    box(0.1, 0.5, 0.1, 0x333333, 0.85, -1.0, 1.0),
    box(0.1, 0.5, 0.1, 0x333333, -0.85, -1.0, -0.6),
    box(0.1, 0.5, 0.1, 0x333333, 0.85, -1.0, -0.6),
    cylinder(0.18, 0.18, 0.5, 0x333333, 0, 1.0, 0.3, 8),
  ]);
}

export class Helicopter {
  constructor(scene, x, z) {
    this.group = new THREE.Group();
    this.body = new THREE.Mesh(helicopterGeometry(), vertexColorMaterial);
    this.body.castShadow = true;
    this.group.add(this.body);
    const blade = new THREE.BoxGeometry(9.5, 0.06, 0.32);
    this.rotor = new THREE.Group();
    this.rotor.add(new THREE.Mesh(blade, vertexColorMaterial));
    const blade2 = new THREE.Mesh(blade, vertexColorMaterial);
    blade2.rotation.y = Math.PI / 2;
    this.rotor.add(blade2);
    this.rotor.position.set(0, 1.28, 0.3);
    this.group.add(this.rotor);
    this.tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.18), vertexColorMaterial);
    this.tailRotor.position.set(0.15, 0.9, -5.8);
    this.group.add(this.tailRotor);
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    this.beacon.position.set(0, -0.4, -6);
    this.group.add(this.beacon);
    // Searchlight.
    this.spot = new THREE.SpotLight(0xf4f8ff, 0, 140, 0.16, 0.5, 1.2);
    this.spot.position.set(0, -0.9, 1.6);
    this.group.add(this.spot);
    scene.add(this.spot.target);
    const beamGeo = new THREE.ConeGeometry(5, 60, 16, 1, true);
    beamGeo.translate(0, -30, 0);
    this.beam = new THREE.Mesh(beamGeo, createNightGlowMaterial(0xe8f0ff, { additive: true, opacity: 0.13 }));
    this.beam.position.set(0, -0.9, 1.6);
    this.group.add(this.beam);

    this.position = new THREE.Vector3(x, 70, z);
    this.vx = 0;
    this.vz = 0;
    this.heading = 0;
    this.orbit = Math.random() * Math.PI * 2;
    this.spotX = x;
    this.spotZ = z;
    this.health = 600;
    this.destroyed = false;
    this.time = 0;
    scene.add(this.group);
    this.scene = scene;
  }

  /** Fly toward the area around (tx, tz), circle it, and aim the light at (lx, lz). */
  update(dt, tx, tz, lx, lz, night) {
    this.time += dt;
    this.orbit += dt * 0.35;
    const r = 30;
    const gx = tx + Math.cos(this.orbit) * r;
    const gz = tz + Math.sin(this.orbit) * r;
    const dx = gx - this.position.x;
    const dz = gz - this.position.z;
    const d = Math.hypot(dx, dz);
    const speed = Math.min(30, d * 0.8);
    const wantVx = d > 0.1 ? (dx / d) * speed : 0;
    const wantVz = d > 0.1 ? (dz / d) * speed : 0;
    this.vx += (wantVx - this.vx) * damp(1.2, dt);
    this.vz += (wantVz - this.vz) * damp(1.2, dt);
    this.position.x += this.vx * dt;
    this.position.z += this.vz * dt;
    this.position.y += (38 - this.position.y) * damp(0.6, dt);
    const faceX = lx - this.position.x;
    const faceZ = lz - this.position.z;
    this.heading += angleDelta(this.heading, Math.atan2(faceX, faceZ)) * damp(1.5, dt);
    this.group.position.copy(this.position);
    this.group.rotation.set(0, this.heading, 0);
    // Bank into the turn and pitch with speed.
    const fwd = this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
    const side = this.vx * Math.cos(this.heading) - this.vz * Math.sin(this.heading);
    this.body.rotation.x = fwd * 0.012;
    this.body.rotation.z = side * 0.012;
    this.rotor.rotation.y += dt * 38;
    this.tailRotor.rotation.x += dt * 50;
    this.beacon.visible = Math.floor(this.time * 2) % 2 === 0;
    // Searchlight sweeps toward its target.
    this.spotX += (lx - this.spotX) * damp(1.6, dt);
    this.spotZ += (lz - this.spotZ) * damp(1.6, dt);
    this.spot.target.position.set(this.spotX, 0, this.spotZ);
    this.spot.intensity = night * 260;
    const bx = this.spotX - this.position.x;
    const bz = this.spotZ - this.position.z;
    const by = -this.position.y;
    const len = Math.hypot(bx, by, bz);
    this.beam.visible = night > 0.3;
    this.beam.scale.set(1, len / 60, 1);
    // Point the beam (local -y) at the spot, undoing the body's heading.
    const dir = new THREE.Vector3(bx, by, bz).normalize();
    const inv = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -this.heading, 0));
    dir.applyQuaternion(inv);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  }

  remove() {
    this.scene.remove(this.group);
    this.scene.remove(this.spot.target);
  }
}
