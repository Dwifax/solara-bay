// Tyre marks: dark streaks laid on the road behind sliding wheels, kept in a ring buffer of
// instanced quads that slowly fade as newer marks replace them.
import * as THREE from 'three';

const CAPACITY = 600;

export function createSkidMarks(scene) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < CAPACITY; i += 1) mesh.setMatrixAt(i, hidden);
  scene.add(mesh);
  let cursor = 0;
  const last = new Map();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  return {
    /** Lay a streak from the previous point of wheel `key` to (x, z). */
    mark(key, x, y, z) {
      const prev = last.get(key);
      last.set(key, { x, z, t: performance.now() });
      if (!prev || performance.now() - prev.t > 120) return;
      const dx = x - prev.x;
      const dz = z - prev.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.05 || len > 4) return;
      q.setFromAxisAngle(up, Math.atan2(dx, dz));
      p.set((x + prev.x) / 2, y + 0.035, (z + prev.z) / 2);
      s.set(0.24, 1, len + 0.05);
      m.compose(p, q, s);
      mesh.setMatrixAt(cursor, m);
      cursor = (cursor + 1) % CAPACITY;
      mesh.instanceMatrix.needsUpdate = true;
    },
    clear() {
      for (let i = 0; i < CAPACITY; i += 1) mesh.setMatrixAt(i, hidden);
      mesh.instanceMatrix.needsUpdate = true;
      last.clear();
    },
  };
}
