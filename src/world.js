// The land: biomes, terraced terrain, water. Everything is generated from one seed,
// so the world is the same every time.
import * as THREE from 'three';
import { makeNoise2D, fbm, ridged, mulberry32, clamp, lerp, smoothstep } from './noise.js';

export const N = 224;            // cells per side (1 cell = 1 metre)
export const HALF = N / 2;
export const STEP = 0.5;         // height of one terrace step
export const WATER_Y = 0.32;     // sea and pond surface
export const MIN_LEVEL = -8;

export const BIOMES = [
  { key: 'forest',   name: 'Mossvale Woods',    line: 'Home sweet moss',            centers: [[0, 0], [-48, 58], [44, -30]], scale: 0.78 },
  { key: 'mountain', name: 'Greycrag Peaks',    line: 'Bring a pick for ore',       centers: [[-10, -62], [62, -66]],         scale: 1.0 },
  { key: 'snow',     name: 'Frostmere Heights', line: 'Brrr! Stay near a fire',     centers: [[8, -100], [-58, -94]],         scale: 1.0 },
  { key: 'desert',   name: 'Sunscar Dunes',     line: 'Thirsty work. Drink often',  centers: [[84, 12], [74, 74]],            scale: 0.95 },
  { key: 'swamp',    name: 'Murkfen Marsh',     line: 'Mind the squelch',           centers: [[4, 84], [-30, 96]],            scale: 0.95 },
  { key: 'coast',    name: 'Saltwind Coast',    line: 'Smell that sea air',         centers: [[-88, 8], [-80, -44]],          scale: 0.95 },
];
export const FOREST = 0, MOUNTAIN = 1, SNOW = 2, DESERT = 3, SWAMP = 4, COAST = 5;

// Hand-placed features around the starting area.
export const SITE = {
  cabin: { x: -4, z: -7 },
  pond: { x: 15, z: -3.2, rx: 5.2, rz: 5.0 },
  plateau: { x0: 6, x1: 27, z0: -27, z1: -8 },
  stream: { x0: 14.5, x1: 17.5, z0: -16, z1: -8 },
  stairsZ: [-12, -10],
  spawn: { x: 1.5, z: 1.5 },
  plot: { a: 5, b: 6 },   // Forge: the first cabin's 4 x 4 m clearing (2 m grid cells a..a+1, b..b+1), kept free of plants
};

const nWarpA = makeNoise2D(11), nWarpB = makeNoise2D(12);
const nA = makeNoise2D(21), nB = makeNoise2D(22), nC = makeNoise2D(23), nD = makeNoise2D(24), nE = makeNoise2D(25);

export const cellX = (i) => i - HALF + 0.5;    // centre of cell
export const cellIndex = (x) => Math.floor(x + HALF);

function biomeWeights(x, z, out) {
  const wx = x + nWarpA(x * 0.018, z * 0.018) * 20;
  const wz = z + nWarpB(x * 0.018, z * 0.018) * 20;
  let dmin = 1e9;
  const d = [];
  for (let b = 0; b < BIOMES.length; b++) {
    let best = 1e9;
    for (const c of BIOMES[b].centers) {
      const dx = wx - c[0], dz = wz - c[1];
      best = Math.min(best, Math.sqrt(dx * dx + dz * dz));
    }
    d[b] = best * BIOMES[b].scale;
    dmin = Math.min(dmin, d[b]);
  }
  let sum = 0;
  for (let b = 0; b < BIOMES.length; b++) { out[b] = Math.exp(-(d[b] - dmin) / 5.5); sum += out[b]; }
  for (let b = 0; b < BIOMES.length; b++) out[b] /= sum;
  return out;
}

function biomeHeight(b, x, z) {
  switch (b) {
    case FOREST: return 3.0 + fbm(nA, x * 0.025, z * 0.025, 4) * 3.4;
    case MOUNTAIN: return 4.5 + ridged(nB, x * 0.032, z * 0.032, 4) * 11.5;
    case SNOW: return 7.5 + ridged(nB, x * 0.026 + 7, z * 0.026, 4) * 10.5;
    case DESERT: {
      let h = 2.0 + fbm(nC, x * 0.018, z * 0.05, 3) * 1.3;
      const m = fbm(nD, x * 0.028, z * 0.028, 2);
      if (m > 0.32) h += 3 + (m > 0.5 ? 2 : 0); // stepped mesas
      return h;
    }
    case SWAMP: return 1.05 + fbm(nA, x * 0.07 + 30, z * 0.07, 3) * 1.5;
    case COAST: return 1.7 + fbm(nA, x * 0.04, z * 0.04 - 20, 3) * 1.3;
  }
  return 0;
}

// Height in terrace units at any point (one unit = STEP metres).
function rawHeight(x, z, tmp) {
  biomeWeights(x, z, tmp);
  let h = 0;
  for (let b = 0; b < 6; b++) if (tmp[b] > 0.01) h += biomeHeight(b, x, z) * tmp[b];
  // island edge: the land drops into the sea near the border
  const r = Math.max(Math.abs(x), Math.abs(z)) / HALF + nE(x * 0.03, z * 0.03) * 0.05;
  h -= smoothstep(0.8, 0.98, r) * 14;
  // the coast slopes into the sea on the west side
  h -= tmp[COAST] * clamp((-x - 72) / 12, 0, 1) * 5;
  return applySite(x, z, h);
}

export function generateWorld() {
  const levels = new Int8Array(N * N);
  const weights = new Float32Array(N * N * 6);
  const primary = new Uint8Array(N * N);
  const tmp = new Float32Array(6);
  const M = N + 1;
  const hy = new Float32Array(M * M); // ground height (metres) at every grid corner

  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    hy[j * M + i] = clamp(rawHeight(i - HALF, j - HALF, tmp), MIN_LEVEL, 22) * STEP;
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = cellX(i), z = cellX(j);
      biomeWeights(x, z, tmp);
      let best = 0;
      for (let b = 0; b < 6; b++) {
        weights[(j * N + i) * 6 + b] = tmp[b];
        if (tmp[b] > tmp[best]) best = b;
      }
      primary[j * N + i] = best;
      const cy = (hy[j * M + i] + hy[j * M + i + 1] + hy[(j + 1) * M + i] + hy[(j + 1) * M + i + 1]) / 4;
      // level 0 or below means the cell is under water
      levels[j * N + i] = clamp(Math.floor((cy - WATER_Y) / STEP) + 1, MIN_LEVEL, 22);
    }
  }
  const world = { levels, weights, primary, hy };
  world.level = (i, j) => (i < 0 || j < 0 || i >= N || j >= N ? MIN_LEVEL : levels[j * N + i]);
  world.levelAt = (x, z) => world.level(cellIndex(x), cellIndex(z));
  world.corner = (i, j) => hy[clamp(j, 0, N) * M + clamp(i, 0, N)];
  world.heightAt = (x, z) => {
    const fx = clamp(x + HALF, 0, N - 0.001), fz = clamp(z + HALF, 0, N - 0.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = hy[j * M + i], b = hy[j * M + i + 1], c = hy[(j + 1) * M + i], d = hy[(j + 1) * M + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  // how steep a cell is: biggest height difference across its corners, in metres
  world.steepness = (i, j) => {
    const a = world.corner(i, j), b = world.corner(i + 1, j), c = world.corner(i, j + 1), d = world.corner(i + 1, j + 1);
    return Math.max(a, b, c, d) - Math.min(a, b, c, d);
  };
  world.weightAt = (x, z, b) => {
    const i = clamp(cellIndex(x), 0, N - 1), j = clamp(cellIndex(z), 0, N - 1);
    return weights[(j * N + i) * 6 + b];
  };
  world.biomeAt = (x, z) => {
    const i = clamp(cellIndex(x), 0, N - 1), j = clamp(cellIndex(z), 0, N - 1);
    return primary[j * N + i];
  };
  world.blocked = new Uint8Array(N * N);   // cabin, fences, big rocks
  world.reserved = new Uint8Array(N * N);  // no trees here (paths, clearings)
  markReserved(world);
  return world;
}

// Shapes the land around the start: a flat cabin clearing, a pond,
// a high plateau with a stream that falls into the pond, and stone stairs.
function applySite(x, z, h) {
  const c = SITE.cabin;
  const dc = Math.hypot(x - c.x, z - c.z);
  if (dc < 7.5) h = 3.3;
  else if (dc < 12) h = lerp(3.3, h, smoothstep(7.5, 12, dc));

  const P = SITE.plateau;
  const inPlateau = x > P.x0 && x < P.x1 && z > P.z0 && z < P.z1 &&
    Math.hypot(Math.max(0, P.x0 + 4 - x, x - (P.x1 - 4)), Math.max(0, P.z0 + 4 - z)) < 4;
  if (inPlateau) h = 7.4 + fbm(nA, x * 0.1, z * 0.1, 2) * 0.5;

  const S = SITE.stream;
  if (x > S.x0 && x < S.x1 && z > S.z0 && z < S.z1) h = 5.6;

  const p = SITE.pond;
  const dp = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz) + nE(x * 0.3, z * 0.3) * 0.08;
  if (dp < 1) h = dp < 0.6 ? -1.5 : -0.5;
  else if (dp < 1.3 && !inPlateau) h = Math.min(h, 1.4 + (dp - 1) * 4);

  // stairs from the clearing up to the plateau
  if (z >= SITE.stairsZ[0] - 0.5 && z <= SITE.stairsZ[1] + 0.5 && x >= -0.5 && x <= 6.0) {
    h = clamp(3.3 + x * 0.72, 3.3, 7.4);
  }
  return h;
}

function markReserved(world) {
  const { reserved } = world;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = cellX(i), z = cellX(j);
    const c = SITE.cabin, p = SITE.pond, S = SITE.stream;
    let r = 0;
    if (Math.hypot(x - c.x, z - c.z) < 8.5) r = 1;
    if (Math.hypot(x - SITE.spawn.x, z - SITE.spawn.z) < 3) r = 1;
    if (Math.hypot((x - p.x) / (p.rx + 1.2), (z - p.z) / (p.rz + 1.2)) < 1) r = 1;
    if (x > S.x0 - 1.5 && x < S.x1 + 1.5 && z > S.z0 - 1 && z < S.z1 + 0.5) r = 1;
    if (z > SITE.stairsZ[0] - 1 && z < SITE.stairsZ[1] + 1 && x > -1 && x < 8) r = 1;
    // Forge: tutorial (the first cabin's clearing, with a metre to spare all round, at every graphics level)
    if (x > SITE.plot.a * 2 - 1.5 && x < SITE.plot.a * 2 + 5.5 && z > SITE.plot.b * 2 - 7 && z < SITE.plot.b * 2 + 5.5) r = 1;   // includes the campfire spot by the door (north side)
    reserved[j * N + i] = r;
  }
}

// ---------- Colours ----------
const C = (h) => new THREE.Color(h);
// Forge (look polish): warmer, mossier greens instead of one flat lime
const TOP = [
  [C('#406a2a'), C('#5b7f33')],   // forest grass (two tones)
  [C('#6f8c48'), C('#8f9a7c')],   // mountain: grass to rock
  [C('#eef3f8'), C('#dfe8f2')],   // snow
  [C('#e7c487'), C('#f0d49b')],   // desert sand
  [C('#62783a'), C('#7a8a44')],   // swamp
  [C('#62953e'), C('#80a34b')],   // coast grass
];
// Extra variety on grassy ground: deep moss under the tree groves (the same noise props.js uses
// to place groves, so forest edges read darker) and warm olive patches in the open.
const nGrove = makeNoise2D(77), nWarm = makeNoise2D(31);
const DEEP_MOSS = C('#2b4c21'), OLIVE = C('#869640'), FRESH = C('#6f9e3c');
const SIDE = [C('#7b5535'), C('#76706a'), C('#8f98a3'), C('#c99a5b'), C('#4f3f2a'), C('#b99566')];
// Forge: the pond and sea bed is a darker, mossy brown (the light sand showed through and turned the pond pink)
const SAND = C('#ead8a2'), WET_SAND = C('#8e8a64'), MUD = C('#4a4630'), ROCK = C('#8a8780'), DIRT = C('#9a7550');

export function cellTopColor(world, i, j, out) {
  const { weights, levels } = world;
  const L = levels[j * N + i];
  const x = cellX(i), z = cellX(j);
  out.setRGB(0, 0, 0);
  const n = fbm(nC, x * 0.09, z * 0.09, 2) * 0.5 + 0.5;
  const tmp = new THREE.Color();
  for (let b = 0; b < 6; b++) {
    const w = weights[(j * N + i) * 6 + b];
    if (w < 0.01) continue;
    tmp.copy(TOP[b][0]).lerp(TOP[b][1], n);
    out.r += tmp.r * w; out.g += tmp.g * w; out.b += tmp.b * w;
  }
  const grassy = weights[(j * N + i) * 6 + FOREST] + weights[(j * N + i) * 6 + COAST] * 0.6;
  if (grassy > 0.05) {
    const grove = fbm(nGrove, x * 0.05, z * 0.05, 3) * 0.5 + 0.5;
    const warm = fbm(nWarm, x * 0.03, z * 0.03, 2);
    out.lerp(warm > 0 ? OLIVE : FRESH, Math.min(1, Math.abs(warm) * 1.6) * 0.35 * grassy);
    out.lerp(DEEP_MOSS, smoothstep(0.42, 0.66, grove) * 0.5 * grassy);
  }
  const swamp = weights[(j * N + i) * 6 + SWAMP];
  const snow = weights[(j * N + i) * 6 + SNOW];
  const mountain = weights[(j * N + i) * 6 + MOUNTAIN];
  // ground type: 0 grass, 1 sand, 2 snow, 3 rock, 4 underwater/mud
  const pb = world.primary[j * N + i];
  let g = pb === DESERT ? 1 : pb === SNOW ? 2 : 0;
  if (L <= 0) {
    out.copy(swamp > 0.4 ? MUD : (L < 0 ? WET_SAND : SAND));
    g = 4;
  } else if (L <= 1 && nearWater(world, i, j) && swamp < 0.4 && snow < 0.5) {
    out.lerp(SAND, 0.85);
    g = 1;
  }
  // steep ground in the mountains shows rock, high peaks get snow
  if (mountain > 0.3 && L > 1) {
    const steep = world.steepness(i, j) / STEP;
    if (steep >= 2) { out.lerp(ROCK, 0.6 * mountain); if (mountain > 0.6) g = 3; }
    if (L >= 13) { out.lerp(C('#eef2f6'), smoothstep(13, 15, L) * mountain); if (L >= 14) g = 2; }
  }
  if (world.steepness(i, j) > 0.9 && g === 0) g = 3;
  if (world.ground) world.ground[j * N + i] = g;
  // per-cell jitter gives the gently tiled look
  const r = hash2(i, j);
  out.multiplyScalar(0.94 + r * 0.1);
  return out;
}

function hash2(i, j) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function nearWater(world, i, j) {
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (world.level(i + di, j + dj) <= 0) return true;
  }
  return false;
}
function maxDrop(world, i, j) {
  const L = world.level(i, j);
  return Math.max(L - world.level(i + 1, j), L - world.level(i - 1, j), L - world.level(i, j + 1), L - world.level(i, j - 1),
    world.level(i + 1, j) - L, world.level(i - 1, j) - L, world.level(i, j + 1) - L, world.level(i, j - 1) - L);
}

// ---------- Terrain mesh ----------
// One smooth grid of corners. Colour comes from the cells around each corner;
// steep slopes show earth or rock, like the bare sides of a hill.
export function buildTerrain(world, pathCells) {
  const M = N + 1;
  world.topColors = new Float32Array(N * N * 3);
  world.ground = new Uint8Array(N * N);
  const top = new THREE.Color();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    cellTopColor(world, i, j, top);
    if (pathCells && pathCells.has(j * N + i)) top.lerp(DIRT, 0.35);
    world.topColors.set([top.r, top.g, top.b], (j * N + i) * 3);
  }
  const pos = new Float32Array(M * M * 3), col = new Float32Array(M * M * 3);
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const k = j * M + i;
    pos[k * 3] = i - HALF; pos[k * 3 + 1] = world.hy[k]; pos[k * 3 + 2] = j - HALF;
  }
  const idx = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * M + i, b = a + 1, c = a + M, d = c + 1;
    // pick the diagonal that follows the ground best
    if (Math.abs(world.hy[a] - world.hy[d]) < Math.abs(world.hy[b] - world.hy[c])) idx.push(a, c, d, a, d, b);
    else idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const side = new THREE.Color(), c = new THREE.Color(), t = new THREE.Color();
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const k = j * M + i;
    c.setRGB(0, 0, 0); side.setRGB(0, 0, 0);
    let n = 0, desert = 0, mountain = 0;
    for (const [ci, cj] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
      if (ci < 0 || cj < 0 || ci >= N || cj >= N) continue;
      const q = cj * N + ci;
      c.r += world.topColors[q * 3]; c.g += world.topColors[q * 3 + 1]; c.b += world.topColors[q * 3 + 2];
      for (let b = 0; b < 6; b++) {
        const w = world.weights[q * 6 + b];
        side.r += SIDE[b].r * w; side.g += SIDE[b].g * w; side.b += SIDE[b].b * w;
      }
      desert += world.weights[q * 6 + DESERT]; mountain += world.weights[q * 6 + MOUNTAIN];
      n++;
    }
    if (!n) { c.copy(WET_SAND); side.copy(WET_SAND); n = 1; } else { c.multiplyScalar(1 / n); side.multiplyScalar(1 / n); desert /= n; mountain /= n; }
    const y = world.hy[k];
    // steep ground shows earth, very steep shows rock; desert cliffs show striped sandstone
    const steep = 1 - nor.getY(k);
    t.copy(side);
    if (desert > 0.3) t.lerp(Math.floor(y / 0.5) % 2 ? C('#d9aa68') : C('#b98450'), 0.4 * desert);
    if (steep > 0.45 || mountain > 0.5) t.lerp(ROCK, 0.25 + mountain * 0.3);
    c.lerp(t, smoothstep(0.18, 0.42, steep));
    // cliffs: layered stone, a band of lighter and darker rock every half metre
    if (steep > 0.33) {
      const band = hash2(Math.floor(y / 0.45) * 17 + 3, Math.floor((i + j) / 3));
      t.copy(ROCK).lerp(side, 0.35 + desert * 0.4).multiplyScalar(0.78 + band * 0.3);
      c.lerp(t, smoothstep(0.33, 0.5, steep));
    }
    // fine speckle so the ground reads as texture
    const sp = hash2(i * 3 + 1, j * 7 + 2);
    c.multiplyScalar(0.93 + sp * 0.12);
    // hollows and the foot of slopes are a little darker
    c.multiplyScalar(1 - smoothstep(0.3, 0.8, steep) * 0.12);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

// Height + biome data the shaders can read (water depth, fireflies on the ground).
export function buildHeightTexture(world) {
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = (j * N + i);
    const y = world.heightAt(cellX(i), cellX(j));
    data[k * 4] = Math.round(clamp((y + 4) / 14, 0, 1) * 255);
    data[k * 4 + 1] = Math.round(world.weights[k * 6 + SWAMP] * 255);
    data[k * 4 + 2] = Math.round(world.weights[k * 6 + SNOW] * 255);
    data[k * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export const GLSL_NOISE = /* glsl */`
  float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1,0)), u.x), mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), u.x), u.y);
  }
`;

// One big water sheet for sea, ponds and marsh pools. Depth comes from the height texture.
export function buildWater(heightTex, lightUniforms) {
  const geo = new THREE.PlaneGeometry(N + 400, N + 400, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uHeight: { value: null }, uTime: { value: 0 }, uRain: { value: 0 }, uN: { value: N },
    }]),
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uHeight; uniform float uTime, uRain, uN;
      uniform vec3 uSunDir, uSunColor, uAmbient, uSkyColor;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      ${GLSL_NOISE}
      void main(){
        vec2 uv = (vWorld.xz + uN * 0.5) / uN;
        vec4 ht = texture2D(uHeight, uv);
        float ground = ht.r * 14.0 - 4.0;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ground = -6.0;
        float depth = vWorld.y - ground;
        if (depth < -0.02) discard;
        vec2 p = vWorld.xz;
        float n1 = vnoise(p * 0.9 + uTime * vec2(0.22, 0.15));
        float n2 = vnoise(p * 2.3 - uTime * vec2(0.18, 0.31));
        float rr = vnoise(p * 7.0 + uTime * 4.0) * uRain;
        vec3 nrm = normalize(vec3((n1 - 0.5) * 0.5 + (rr - 0.25) * 0.6, 1.0, (n2 - 0.5) * 0.5 + (rr - 0.25) * 0.6));
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float swamp = ht.g;
        // Forge (look polish): softer, natural water at every hour. The light is mostly its
        // brightness with only a little of its colour, so the pond is no longer pink at sunset
        // or neon blue at night.
        vec3 shallow = mix(vec3(0.34, 0.60, 0.55), vec3(0.40, 0.48, 0.25), swamp);
        vec3 deep = mix(vec3(0.07, 0.24, 0.30), vec3(0.10, 0.14, 0.06), swamp);
        float d = 1.0 - exp(-max(depth, 0.0) * 2.0);
        vec3 col = mix(shallow, deep, d);
        vec3 light = uAmbient + uSunColor * max(uSunDir.y, 0.0) * 0.55;
        float lum = dot(light, vec3(0.3, 0.59, 0.11));
        vec3 soft = mix(vec3(lum), light, 0.3);
        col *= soft;
        // sky tint, stronger at grazing angles (a calm blue-grey, scaled with the light)
        float skyL = dot(uSkyColor, vec3(0.3, 0.59, 0.11));
        vec3 skyTint = mix(vec3(skyL), uSkyColor, 0.25) * vec3(0.86, 0.96, 1.04) * clamp(lum * 1.1, 0.0, 1.0);
        float fres = pow(1.0 - max(dot(viewDir, nrm), 0.0), 3.0);
        col = mix(col, skyTint * 0.85, fres * 0.4);
        // shoreline foam
        float edge = depth + (n1 - 0.5) * 0.18;
        float foam = smoothstep(0.2, 0.02, edge);
        foam += smoothstep(0.06, 0.0, abs(fract(depth * 2.2 - uTime * 0.35) - 0.5) * 0.25) * smoothstep(0.9, 0.2, depth) * 0.35;
        foam *= (1.0 - swamp * 0.7);
        col = mix(col, soft * 0.95, clamp(foam, 0.0, 1.0) * 0.6);
        float spec = pow(max(dot(reflect(-uSunDir, nrm), viewDir), 0.0), 90.0);
        col += uSunColor * spec * 0.7;
        float alpha = mix(0.7, 0.95, d);   // Forge: less of the lit sand shows through (it turned the pond pink)
        alpha = max(alpha, clamp(foam, 0.0, 1.0));
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.uHeight.value = heightTex;
  Object.assign(mat.uniforms, lightUniforms);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WATER_Y;
  mesh.renderOrder = 2;
  mesh.name = 'water';
  return mesh;
}
