import * as THREE from 'three';

// Uniforms shared by every swaying thing (grass, leaves, reeds).
export const shared = {
  uTime: { value: 0 },
  uWind: { value: 0.4 },
};

// Adds wind sway to an instanced material. Bend grows with height above `start`.
// The wind is applied in world space, so rotated instances all lean the same way.
export function addWind(mat, { start = 0.8, amount = 0.1, key = 'w' } = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWind = shared.uWind;
    shader.vertexShader =
      'uniform float uTime;\nuniform float uWind;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 wIp = instanceMatrix[3].xz;
          float wHh = max(position.y - ${start.toFixed(3)}, 0.0);
          float wGust = sin(uTime * 0.9 + wIp.x * 0.07 + wIp.y * 0.05) * 0.5 + 0.5;
          float wSway = sin(uTime * 2.2 + wIp.x * 0.55 + wIp.y * 0.35) * (0.35 + wGust)
                     + sin(uTime * 3.7 + wIp.x * 1.3) * 0.15;
          vec3 wW = vec3(0.9, 0.0, 0.45) * (wSway + uWind * 0.6) * uWind * ${amount.toFixed(4)} * wHh;
          mat3 wIm = mat3(instanceMatrix);
          float wS2 = dot(wIm[0], wIm[0]);
          transformed += transpose(wIm) * wW / wS2;
        #endif`
      );
  };
  mat.customProgramCacheKey = () => 'wind-' + key;
  return mat;
}

export function lambert(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, ...opts });
}
