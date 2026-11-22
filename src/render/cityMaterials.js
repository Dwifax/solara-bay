// Shared materials for the city. Building facades get their windows from a shader patch keyed to
// world position, so one instanced box mesh shows thousands of windows that reflect the sky by
// day and light up at random at night. Lamp glows fade in with the `night` factor.
import * as THREE from 'three';

/** Uniforms every night-aware material reads; updated once a frame by updateCityMaterials. */
export const cityUniforms = {
  uNight: { value: 0 },
  uSkyTint: { value: new THREE.Color(0xffc890) },
  uTime: { value: 0 },
};

const glowMaterials = [];

/**
 * A facade material. `cell` is the window grid size in metres (horizontal, vertical), `frame` the
 * wall margin around each pane (0..0.5), `glass` how much of each pane shows sky reflection.
 */
export function createFacadeMaterial({ cell = [3.2, 3.6], frame = [0.18, 0.22], glass = 0.6, glassColor = 0x5f7f99, litColor = 0xffc27a, litShare = 0.4, ground = 4, roughness = 0.75, metalness = 0.05 }) {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness });
  const local = {
    uCell: { value: new THREE.Vector2(cell[0], cell[1]) },
    uFrame: { value: new THREE.Vector2(frame[0], frame[1]) },
    uGlassAmt: { value: glass },
    uGlass: { value: new THREE.Color(glassColor) },
    uLit: { value: new THREE.Color(litColor) },
    uLitShare: { value: litShare },
    uGround: { value: ground },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, local, cityUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBWorld;\nvarying vec3 vBNormal;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 bWorld = vec4(transformed, 1.0);
        vec3 bn = objectNormal;
        #ifdef USE_INSTANCING
          bWorld = instanceMatrix * bWorld;
          bn = mat3(instanceMatrix) * bn;
        #endif
        bWorld = modelMatrix * bWorld;
        vBWorld = bWorld.xyz;
        vBNormal = normalize(mat3(modelMatrix) * bn);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vBWorld;
        varying vec3 vBNormal;
        uniform vec2 uCell; uniform vec2 uFrame; uniform float uGlassAmt; uniform vec3 uGlass;
        uniform vec3 uLit; uniform float uLitShare; uniform float uGround; uniform float uNight; uniform vec3 uSkyTint;
        float bHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float bSide = 1.0 - step(0.5, abs(vBNormal.y));
        float bU = abs(vBNormal.x) > 0.5 ? vBWorld.z : vBWorld.x;
        vec2 bG = vec2(bU / uCell.x, (vBWorld.y - uGround) / uCell.y);
        vec2 bF = fract(bG);
        vec2 bId = floor(bG);
        float bWin = step(uFrame.x, bF.x) * step(bF.x, 1.0 - uFrame.x) * step(uFrame.y, bF.y) * step(bF.y, 1.0 - uFrame.y);
        bWin *= bSide * step(uGround, vBWorld.y);
        float bShop = bSide * step(0.7, vBWorld.y) * step(vBWorld.y, uGround - 0.9) * step(0.1, fract(bU / 6.0));
        vec3 bRound = floor(vBNormal + 0.5);
        float bPlane = floor(dot(vBWorld, abs(bRound)) * 0.5 + 0.25);
        float bRnd = bHash(bId + vec2(bRound.x * 17.0 + bPlane * 0.37, bRound.z * 31.0 - bPlane * 0.11));
        vec3 bView = normalize(cameraPosition - vBWorld);
        float bFres = pow(1.0 - max(dot(bView, vBNormal), 0.0), 2.5);
        vec3 bGlassCol = mix(uGlass, uSkyTint, 0.15 + 0.55 * bFres) * (1.0 - 0.75 * uNight);
        float bPane = max(bWin * uGlassAmt, bShop * 0.9);
        diffuseColor.rgb = mix(diffuseColor.rgb, bGlassCol, bPane);
        diffuseColor.rgb *= mix(1.0, 0.82, step(0.5, vBNormal.y));
        float bLit = (bWin * step(bRnd, uLitShare) + bShop) * uNight;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += uLit * bLit * (0.32 + 0.4 * bRnd);`,
      );
  };
  return material;
}

/** A material that glows only at night (lamp bulbs, neon, light pools). */
export function createNightGlowMaterial(color, { additive = false, opacity = 1, dayLevel = 0.05 } = {}) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: additive || opacity < 1,
    opacity,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !additive,
    fog: true,
  });
  material.userData.baseColor = new THREE.Color(color);
  material.userData.dayLevel = dayLevel;
  material.userData.baseOpacity = opacity;
  material.userData.additive = additive;
  glowMaterials.push(material);
  return material;
}

/** Fade any additive material (points, sprites) in with the night. */
export function registerNightMaterial(material, opacity) {
  material.userData.additive = true;
  material.userData.baseOpacity = opacity;
  material.userData.dayLevel = 0;
  material.userData.baseColor = material.color.clone();
  glowMaterials.push(material);
  return material;
}

/** Push the current night factor and sky colour into every city material. */
export function updateCityMaterials(night, horizonHex, dt) {
  cityUniforms.uNight.value = night;
  cityUniforms.uSkyTint.value.set(horizonHex);
  cityUniforms.uTime.value += dt;
  for (const m of glowMaterials) {
    const level = m.userData.dayLevel + (1 - m.userData.dayLevel) * night;
    if (m.userData.additive) {
      m.opacity = m.userData.baseOpacity * night;
      m.visible = night > 0.03;
    } else {
      m.color.copy(m.userData.baseColor).multiplyScalar(level);
    }
  }
}

/** Plain lit materials keyed by colour, so props of one colour share a material. */
const standardCache = new Map();
export function standardMaterial(color, roughness = 0.8, metalness = 0) {
  const key = `${color}-${roughness}-${metalness}`;
  if (!standardCache.has(key)) standardCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  return standardCache.get(key);
}

/** A white material that shows a geometry's vertex colours. */
export const vertexColorMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
