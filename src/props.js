// Trees, plants, rocks, the stone path, the cabin, the waterfall.
// Shapes are chunky and slightly faceted on purpose: soft, rounded, a little blocky.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { N, HALF, STEP, WATER_Y, SITE, cellX, cellIndex, FOREST, MOUNTAIN, SNOW, DESERT, SWAMP, COAST, GLSL_NOISE } from './world.js';
import { mulberry32, makeNoise2D, fbm, clamp } from './noise.js';
import { addWind } from './materials.js';

const C = (h) => new THREE.Color(h);
const nP = makeNoise2D(77), nQ = makeNoise2D(78);

// ---------- geometry helpers ----------
function prep(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  return g;
}
function colorize(g, color) {
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const p = g.attributes.position;
  const tmp = new THREE.Color();
  for (let k = 0; k < n; k++) {
    const c = typeof color === 'function' ? color(p.getX(k), p.getY(k), p.getZ(k), tmp) : color;
    arr[k * 3] = c.r; arr[k * 3 + 1] = c.g; arr[k * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
// part(geometry, colour or colour-function(localX,Y,Z), position, rotation, scale)
function part(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  const g = prep(geo);
  colorize(g, color);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scl));
  g.applyMatrix4(m);
  return g;
}
function lumpy(r, seed, detail = 1, amt = 0.14) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
    const h = Math.sin(x * 12.9898 / r + y * 78.233 / r + z * 37.719 / r + seed * 1.7) * 43758.5453;
    const f = 1 + ((h - Math.floor(h)) - 0.5) * 2 * amt;
    p.setXYZ(k, x * f, y * f, z * f);
  }
  g.computeVertexNormals();
  return g;
}
const grad = (a, b, y0, y1) => (x, y, z, out) => out.copy(a).lerp(b, clamp((y - y0) / (y1 - y0), 0, 1));
// Ragged edges for pine tiers.
function jag(geo, r) {
  const g = geo.toNonIndexed(), p = g.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
    const a = Math.atan2(z, x), d = Math.hypot(x, z);
    if (d < 1e-3) continue;
    const f = 1 + Math.sin(a * 9 + y * 3) * 0.12 + Math.sin(a * 23) * 0.06;
    p.setXYZ(k, x * f, y - (d / r) * Math.abs(Math.sin(a * 9)) * 0.12, z * f);
  }
  g.computeVertexNormals();
  return g;
}
const merge = (parts) => { const g = mergeGeometries(parts); g.computeBoundingSphere(); return g; };

// ---------- plant and rock shapes ----------
// A leafy canopy blob (Forge, look polish): soft rounded clumps instead of cubes. One smooth, lumpy
// ball with gently shaded greens (dark underneath, sunlit on top), and on bigger blobs one or two
// smaller clumps on top in a slightly different green. Smooth normals give the soft look.
// Triangles: 80 per clump, so a phone oak is about 500 (was 680) and a High oak about 1320 (was 1390).
let LEAF = 1; // leaf clump density, lower on phones
const LEAF_HI = new THREE.Color('#dfe98c');
function softClump(r, seed, amt = 0.1) {
  let g = new THREE.IcosahedronGeometry(r, 1);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const radial = new Float32Array(p.count * 3);
  for (let k = 0; k < p.count; k++) {
    let x = p.getX(k) / r, y = p.getY(k) / r, z = p.getZ(k) / r;
    radial[k * 3] = x; radial[k * 3 + 1] = y; radial[k * 3 + 2] = z;
    const f = 1 + amt * (Math.sin(x * 3.1 + seed) * Math.sin(y * 2.7 + seed * 1.3) * Math.sin(z * 3.3 + seed * 0.7) * 1.6
      + Math.sin((x + z) * 5.3 + seed * 2.1) * 0.35);
    if (y < -0.35) y = -0.35 + (y + 0.35) * 0.55;   // a softly flattened underside
    p.setXYZ(k, x * r * f, y * r * f, z * r * f);
  }
  g.computeVertexNormals();
  // mostly round (sphere) normals: the light wraps softly over each clump instead of showing facets
  const nr = g.attributes.normal, v = new THREE.Vector3();
  for (let k = 0; k < nr.count; k++) {
    v.set(nr.getX(k) * 0.3 + radial[k * 3] * 0.7, nr.getY(k) * 0.3 + radial[k * 3 + 1] * 0.7, nr.getZ(k) * 0.3 + radial[k * 3 + 2] * 0.7).normalize();
    nr.setXYZ(k, v.x, v.y, v.z);
  }
  return g;
}
function leafy(parts, [cx, cy, cz, r], seed, D, L, squash = 1) {
  const rnd = mulberry32(seed * 977 + 13);
  const shade = (base, lift) => (x, y, z, out) => {
    const up = clamp(y / r * 0.55 + 0.45, 0, 1);
    out.copy(D).lerp(L, clamp(up * up * 0.95 + lift, 0, 1)).lerp(LEAF_HI, 0.1 * up * up * up).multiplyScalar(base);
    return out;
  };
  parts.push(part(softClump(r * 0.98, seed), shade(0.88 + rnd() * 0.1, 0), [cx, cy, cz], [0, rnd() * 3, 0], [1, squash * 0.92, 1]));
  const subs = LEAF < 0.7 ? 0 : r >= 0.75 ? 2 : r >= 0.6 ? 1 : 0;   // phones: one clump per blob
  for (let k = 0; k < subs; k++) {
    const az = rnd() * Math.PI * 2 + k * 2.1, el = 0.5 + rnd() * 0.5;
    const d = r * 0.62;
    parts.push(part(softClump(r * (0.5 + rnd() * 0.12), seed * 3 + k + 1), shade(0.92 + rnd() * 0.1, 0.06 + rnd() * 0.12),
      [cx + Math.cos(az) * Math.cos(el) * d, cy + Math.sin(el) * d * squash, cz + Math.sin(az) * Math.cos(el) * d], [0, rnd() * 3, 0], [1, squash * 0.9, 1]));
  }
}

function oakGeo(seed, light = '#749c3f', dark = '#284b20') {
  const parts = [part(new THREE.CylinderGeometry(0.15, 0.24, 1.8, 6), C('#6b4a2f'), [0, 0.9, 0])];
  parts.push(part(new THREE.CylinderGeometry(0.06, 0.1, 0.9, 5), C('#6b4a2f'), [0.3, 1.6, 0.1], [0, 0, -0.7]));
  const blobs = [[0, 2.3, 0, 1.08], [0.66, 2.0, 0.25, 0.78], [-0.62, 2.08, -0.2, 0.82], [0.05, 2.95, -0.05, 0.76],
    [-0.22, 1.9, 0.64, 0.66], [0.32, 2.25, -0.62, 0.72]];
  const L = C(light), D = C(dark);
  blobs.forEach((b, k) => leafy(parts, b, seed * 10 + k, D, L));
  return merge(parts);
}
function pineGeo(snow) {
  const parts = [part(new THREE.CylinderGeometry(0.1, 0.17, 1.2, 6), C('#5e4029'), [0, 0.6, 0])];
  const tiers = [[1.2, 1.4, 1.55], [0.95, 1.25, 2.3], [0.68, 1.1, 2.95], [0.4, 0.85, 3.5]];
  const D = C('#1d4a2f'), L = C('#3f8247'), W = C('#f4f8fc');
  tiers.forEach(([r, h, y]) => {
    parts.push(part(jag(new THREE.ConeGeometry(r, h, 9, 2), r), (x, yy, z, out) => {
      out.copy(D).lerp(L, clamp((yy + h / 2) / h, 0, 1) * 0.8);
      if (snow && yy > -h * 0.12) out.lerp(W, 0.92);
      return out;
    }, [0, y, 0], [0, y * 1.7, 0]));
  });
  return merge(parts);
}
function palmGeo() {
  const parts = [];
  let x = 0, y = 0, a = 0;
  for (let k = 0; k < 7; k++) {
    const len = 0.55;
    a += 0.06;
    parts.push(part(new THREE.CylinderGeometry(0.12 - k * 0.008, 0.14 - k * 0.008, len, 6),
      C(k % 2 ? '#8a6a45' : '#9c7a52'), [x + Math.sin(a) * len / 2, y + Math.cos(a) * len / 2, 0], [0, 0, -a]));
    x += Math.sin(a) * len; y += Math.cos(a) * len;
  }
  for (let f = 0; f < 8; f++) {
    const ang = (f / 8) * Math.PI * 2;
    const leaf = new THREE.BoxGeometry(0.32, 0.05, 1.7, 1, 1, 4);
    const p = leaf.attributes.position;
    for (let k = 0; k < p.count; k++) { const z = p.getZ(k) + 0.85; p.setY(k, p.getY(k) - z * z * 0.22); p.setX(k, p.getX(k) * (1 - z / 2.2)); p.setZ(k, z); }
    leaf.computeVertexNormals();
    parts.push(part(leaf, grad(C('#3d8a3a'), C('#6fb84c'), -0.6, 0), [x, y + 0.05, 0], [0.25, ang, 0]));
  }
  for (let c = 0; c < 3; c++) parts.push(part(new THREE.IcosahedronGeometry(0.11, 0), C('#6a4a26'), [x + Math.cos(c * 2.1) * 0.15, y - 0.12, Math.sin(c * 2.1) * 0.15]));
  return merge(parts);
}
function cactusGeo() {
  const G = C('#5b9a4c'), L = C('#79b65e');
  const parts = [
    part(new THREE.CylinderGeometry(0.26, 0.3, 1.9, 8), grad(G, L, -0.9, 0.9), [0, 0.95, 0]),
    part(new THREE.SphereGeometry(0.26, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), L, [0, 1.9, 0]),
    part(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 7), G, [0.38, 0.95, 0], [0, 0, Math.PI / 2]),
    part(new THREE.CylinderGeometry(0.14, 0.15, 0.7, 7), grad(G, L, -0.3, 0.3), [0.6, 1.25, 0]),
    part(new THREE.SphereGeometry(0.14, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), L, [0.6, 1.6, 0]),
    part(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 7), G, [-0.32, 1.3, 0], [0, 0, Math.PI / 2]),
    part(new THREE.CylinderGeometry(0.12, 0.13, 0.5, 7), G, [-0.5, 1.52, 0]),
    part(new THREE.IcosahedronGeometry(0.09, 0), C('#ff7aa8'), [0.05, 2.15, 0.05]),
  ];
  return merge(parts);
}
function swampTreeGeo(seed) {
  const T = C('#4a3a28');
  const parts = [
    part(new THREE.CylinderGeometry(0.17, 0.34, 2.0, 6), T, [0, 1.0, 0], [0.12, 0, 0.1]),
    part(new THREE.CylinderGeometry(0.05, 0.12, 0.9, 5), T, [0.35, 0.25, 0.1], [0, 0, -1.1]),
    part(new THREE.CylinderGeometry(0.05, 0.12, 0.9, 5), T, [-0.3, 0.25, -0.2], [0.6, 0, 1.0]),
  ];
  const D = C('#3c4f22'), L = C('#6e8538');
  [[0, 2.3, 0, 1.2], [0.9, 2.1, 0.3, 0.9], [-0.9, 2.15, -0.25, 0.9], [0.1, 2.15, -0.9, 0.85]].forEach(([x, y, z, r], k) => {
    leafy(parts, [x, y, z, r], seed * 10 + k, D, L, 0.62);
  });
  const M = C('#8f9c6e');
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4, r = 1.1 + (k % 3) * 0.25;
    parts.push(part(new THREE.BoxGeometry(0.06, 0.9 + (k % 2) * 0.4, 0.06), M, [Math.cos(a) * r, 1.55 - (k % 2) * 0.2, Math.sin(a) * r]));
  }
  return merge(parts);
}
function bushGeo(seed, berries) {
  const D = C('#2c5224'), L = C('#74a043');
  const parts = [];
  [[0, 0.4, 0, 0.5], [0.42, 0.32, 0.12, 0.38], [-0.36, 0.34, -0.1, 0.4]].forEach((b, k) => leafy(parts, b, seed * 10 + k, D, L));
  if (berries) for (let k = 0; k < 7; k++) {
    const a = k * 2.2;
    parts.push(part(new THREE.IcosahedronGeometry(0.06, 0), C('#d23a4a'), [Math.cos(a) * 0.45, 0.45 + (k % 3) * 0.12, Math.sin(a) * 0.45]));
  }
  return merge(parts);
}
function deadTreeGeo() {
  const T = C('#8c7560');
  return merge([
    part(new THREE.CylinderGeometry(0.08, 0.18, 1.8, 5), T, [0, 0.9, 0]),
    part(new THREE.CylinderGeometry(0.04, 0.08, 0.9, 5), T, [0.3, 1.5, 0], [0, 0, -0.8]),
    part(new THREE.CylinderGeometry(0.04, 0.07, 0.7, 5), T, [-0.25, 1.3, 0.1], [0.3, 0, 0.9]),
    part(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 5), T, [0.05, 1.95, -0.15], [-0.5, 0, 0]),
  ]);
}
function stumpGeo() {
  const B = C('#6b4a2f'), T = C('#c9a06a');
  return merge([
    part(new THREE.CylinderGeometry(0.3, 0.38, 0.45, 8), (x, y, z, out) => out.copy(y > 0.2 ? T : B), [0, 0.22, 0]),
    part(new THREE.CylinderGeometry(0.06, 0.1, 0.4, 5), B, [0.34, 0.08, 0.05], [0, 0, -1.2]),
    part(new THREE.CylinderGeometry(0.05, 0.09, 0.35, 5), B, [-0.25, 0.07, -0.25], [0.9, 0, 0.8]),
  ]);
}
function logGeo() {
  const B = C('#6f4d30'), T = C('#c9a06a'), M = C('#5f8f3a');
  return merge([
    part(new THREE.CylinderGeometry(0.22, 0.24, 1.8, 8), (x, y, z, out) => out.copy(Math.abs(y) > 0.88 ? T : (x > 0.12 ? M : B)), [0, 0.2, 0], [0, 0, Math.PI / 2]),
    part(new THREE.CylinderGeometry(0.04, 0.06, 0.4, 5), B, [0.3, 0.45, 0], [0.3, 0, 0.4]),
  ]);
}
function mushroomGeo() {
  const parts = [];
  [[0, 0, 1], [0.22, 0.1, 0.7], [-0.15, 0.2, 0.55]].forEach(([x, z, s]) => {
    parts.push(part(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.26 * s, 6), C('#f1e8d6'), [x, 0.13 * s, z]));
    parts.push(part(new THREE.SphereGeometry(0.17 * s, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), C('#d9483a'), [x, 0.24 * s, z]));
  });
  return merge(parts);
}
function rockGeo(seed, mossy, tint = '#8e8b84') {
  const R = C(tint), M = C('#6f9a3d');
  return merge([part(lumpy(0.5, seed, 0, 0.25), (x, y, z, out) => {
    out.copy(R).multiplyScalar(0.8 + clamp(y + 0.3, 0, 0.8) * 0.3);
    if (mossy && y > 0.12) out.lerp(M, 0.75);
    return out;
  }, [0, 0.18, 0], [0, 0, 0], [1, 0.7, 1])]);
}
// A rock with rusty iron streaks, found in the mountains
function oreRockGeo(seed) {
  const R = C('#857f78'), O = C('#c8692e'), Y = C('#e0a24a');
  return merge([part(lumpy(0.5, seed, 1, 0.22), (x, y, z, out) => {
    out.copy(R).multiplyScalar(0.8 + clamp(y + 0.3, 0, 0.8) * 0.3);
    const h = Math.sin(x * 41.3 + y * 17.1 + z * 29.7) * 43758.5;
    const f = h - Math.floor(h);
    if (f > 0.8) out.copy(f > 0.93 ? Y : O);
    return out;
  }, [0, 0.2, 0], [0, 0, 0], [1, 0.75, 1])]);
}
function grassTuftGeo(seed, blades = 9, height = 0.5) {
  const rnd = mulberry32(seed);
  const pos = [], col = [], nor = [];
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2, r = rnd() * 0.22;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const w = 0.06 + rnd() * 0.045, h = height * (0.55 + rnd() * 0.6);
    const fa = rnd() * Math.PI;
    const dx = Math.cos(fa) * w, dz = Math.sin(fa) * w;
    const lean = (rnd() - 0.5) * 0.25;
    // both windings, so neither side is lit from below
    pos.push(bx - dx, 0, bz - dz, bx + dx, 0, bz + dz, bx + lean, h, bz + lean * 0.5);
    pos.push(bx + dx, 0, bz + dz, bx - dx, 0, bz - dz, bx + lean, h, bz + lean * 0.5);
    for (let s = 0; s < 2; s++) {
      col.push(0.74, 0.74, 0.7, 0.74, 0.74, 0.7, 1.12, 1.12, 1.06);
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
function reedGeo() {
  const g = grassTuftGeo(5, 6, 1.1);
  const head = part(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 5), C('#6b4528'), [0.05, 1.0, 0.02]);
  const head2 = part(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 5), C('#6b4528'), [-0.1, 0.85, -0.06]);
  [head, head2].forEach((h) => { const n = h.attributes.normal; for (let k = 0; k < n.count; k++) n.setXYZ(k, 0, 1, 0); });
  return merge([g, head, head2]);
}
function flowerGeo() {
  const stem = part(new THREE.BoxGeometry(0.025, 0.26, 0.025), C('#4f8a35'), [0, 0.13, 0]);
  const head = part(new THREE.IcosahedronGeometry(0.075, 0), C('#ffffff'), [0, 0.28, 0], [0, 0, 0], [1, 0.55, 1]);
  const mid = part(new THREE.IcosahedronGeometry(0.03, 0), C('#ffe27a'), [0, 0.31, 0]);
  return merge([stem, head, mid]);
}

// ---------- instancing helper ----------
let HEIGHT = () => 0; // ground height lookup, set by buildProps
class Batch {
  constructor() { this.m = []; this.c = []; }
  add(x, y, z, rotY, s, color) {
    if (y === null) y = HEIGHT(x, z) - 0.03;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    this.m.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s)));
    this.c.push(color || new THREE.Color(1, 1, 1));
    return this.m.length - 1;
  }
  build(geo, mat, { cast = true, receive = true } = {}) {
    if (!this.m.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, this.m.length);
    this.m.forEach((m, k) => { mesh.setMatrixAt(k, m); mesh.setColorAt(k, this.c[k]); });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = cast; mesh.receiveShadow = receive;
    mesh.computeBoundingSphere();
    this.mesh = mesh;
    return mesh;
  }
}

// ---------- the stone path ----------
export function planPath() {
  const routes = [
    [[-4, -2.9], [-3, -1.4], [-0.5, 0.2], [1.5, 1.6], [5, 1.4], [8.4, 0.2], [9.6, -0.6]],
    [[-2.4, -1.0], [-0.6, -3.5], [-0.4, -7], [0, -11]],
  ];
  const pts = [];
  for (const r of routes) {
    const curve = new THREE.CatmullRomCurve3(r.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const len = curve.getLength();
    for (let d = 0; d < len; d += 0.62) {
      const p = curve.getPointAt(d / len), t = curve.getTangentAt(d / len);
      pts.push({ x: p.x, z: p.z, tx: t.x, tz: t.z });
    }
  }
  const cells = new Set();
  for (const p of pts) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = p.x + dx * 0.6, z = p.z + dz * 0.6;
      const i = cellIndex(x), j = cellIndex(z);
      if (Math.hypot(cellX(i) - p.x, cellX(j) - p.z) < 0.9) cells.add(j * N + i);
    }
  }
  return { pts, cells };
}

// ---------- scatter everything ----------
export function buildProps(world, path, quality) {
  LEAF = quality.leaf || 1;
  HEIGHT = world.heightAt;
  const group = new THREE.Group();
  const rnd = mulberry32(2026);
  world.obstacles = new Map();
  world.things = [];
  const addObstacle = (x, z, r) => {
    const k = cellIndex(z) * N + cellIndex(x);
    if (!world.obstacles.has(k)) world.obstacles.set(k, []);
    const ob = { x, z, r };
    world.obstacles.get(k).push(ob);
    return ob;
  };

  const plantMat = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), { start: 1.0, amount: 0.035, key: 'tree' });
  const bushMat = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), { start: 0.2, amount: 0.05, key: 'bush' });
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const grassMat = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), { start: 0.0, amount: 0.22, key: 'grass' });
  const flowerMat = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), { start: 0.05, amount: 0.25, key: 'flower' });

  const kinds = {
    oak: [oakGeo(1), oakGeo(9, '#86a443', '#30522a'), oakGeo(17, '#979f44', '#425b28')],
    pine: [pineGeo(false)], snowpine: [pineGeo(true)], palm: [palmGeo()], cactus: [cactusGeo()],
    swamp: [swampTreeGeo(3), swampTreeGeo(8)], bush: [bushGeo(2, false), bushGeo(5, true)],
    dead: [deadTreeGeo()], mush: [mushroomGeo()], stump: [stumpGeo()], log: [logGeo()],
    rock: [rockGeo(1, false), rockGeo(4, false, '#9a968e')], mossrock: [rockGeo(2, true), rockGeo(6, true)],
    sandrock: [rockGeo(3, false, '#c99a63')], snowrock: [rockGeo(7, true, '#9aa2ad')], orerock: [oreRockGeo(11), oreRockGeo(12)],
  };
  const batches = {};
  // grouped by map section, so sections off screen are skipped when drawing
  const B = (kind, v, x, z) => {
    const ch = Math.floor((x + HALF) / 32) * 10 + Math.floor((z + HALF) / 32);
    const key = kind + v + '_' + ch;
    if (!batches[key]) batches[key] = { kind, v, b: new Batch() };
    return batches[key].b;
  };
  const tint = (base = 1, hue = 0.04) => new THREE.Color().setHSL(0, 0, 1).multiplyScalar(base * (0.86 + rnd() * 0.24))
    .offsetHSL(0, 0, 0).lerp(new THREE.Color().setHSL(0.15 + (rnd() - 0.5) * hue, 0.6, 0.6), 0.12);

  const density = quality.trees;
  for (let j = 2; j < N - 2; j++) for (let i = 2; i < N - 2; i++) {
    const k = j * N + i;
    const L = world.levels[k];
    if (L <= 0 || world.reserved[k] || path.cells.has(k)) continue;
    const x = cellX(i) + (rnd() - 0.5) * 0.7, z = cellX(j) + (rnd() - 0.5) * 0.7;
    const y = null;
    const steepCell = world.steepness(i, j) > 0.75;
    const b = world.primary[k], g = world.ground[k];
    const cluster = fbm(nP, x * 0.05, z * 0.05, 3) * 0.5 + 0.5; // groves and meadows
    const r = rnd() / density, rot = rnd() * Math.PI * 2, s = 0.8 + rnd() * 0.45;
    const put = (kind, rad, variants = kinds[kind].length, scale = s) => {
      if (steepCell && !kind.includes('rock')) return;
      const variant = Math.floor(rnd() * variants);
      const batch = B(kind, variant, x, z);
      const index = batch.add(x, y, z, rot, scale, tint());
      const ob = rad ? addObstacle(x, z, rad * scale) : null;
      // remembered so the game can chop trees and pick berries
      world.things.push({ kind, variant, batch, index, x, z, rot, scale, ob });
    };
    if (steepCell && b !== DESERT && r < 0.22) { put(rnd() < 0.5 ? 'mossrock' : 'rock', 0.35, 2, 0.6 + rnd() * 0.9); continue; }  // boulders on cliffs
    if (b === FOREST) {
      const p = cluster > 0.55 ? 0.24 : cluster > 0.42 ? 0.07 : 0.012;
      if (r < p) put(rnd() < 0.85 ? 'oak' : 'pine', 0.32);
      else if (r < p + 0.035) put('bush', 0);
      else if (r < p + 0.045 && cluster > 0.5) put('mush', 0, 1, 0.8 + rnd() * 0.6);
      else if (r < p + 0.055) put(rnd() < 0.6 ? 'mossrock' : 'rock', 0.35, 2, 0.5 + rnd() * 0.9);
      else if (r < p + 0.06) put('stump', 0.3, 1, 0.8 + rnd() * 0.4);
      else if (r < p + 0.064) put('log', 0.4, 1, 0.8 + rnd() * 0.3);
    } else if (b === MOUNTAIN) {
      if (g === 3 || L > 12) { if (r < 0.05) put('rock', 0.4, 2, 0.7 + rnd() * 1.4); }
      else if (r < 0.04 + cluster * 0.12) put('pine', 0.3);
      else if (r < 0.2) put(rnd() < 0.3 ? 'orerock' : 'rock', 0.4, 2, 0.7 + rnd() * 1.0);
    } else if (b === SNOW) {
      if (r < 0.03 + cluster * 0.1) put('snowpine', 0.3);
      else if (r < 0.16) { const k = rnd() < 0.2 ? 'orerock' : 'snowrock'; put(k, 0.4, kinds[k].length, 0.7 + rnd() * 1.0); }
    } else if (b === DESERT) {
      if (r < 0.012) put('cactus', 0.3);
      else if (r < 0.016) put('dead', 0.15);
      else if (r < 0.03) put('sandrock', 0.4, 1, 0.5 + rnd() * 1.4);
    } else if (b === SWAMP) {
      if (r < 0.03 + cluster * 0.1) put('swamp', 0.35);
      else if (r < 0.16) put('bush', 0);
      else if (r < 0.2) put('mush', 0, 1, 0.9 + rnd() * 0.7);
    } else if (b === COAST) {
      if (g === 1 && r < 0.035) put('palm', 0.22);
      else if (g === 0 && r < 0.02 + cluster * 0.08) put(rnd() < 0.6 ? 'oak' : 'bush', 0.32);
      else if (r < 0.15 && rnd() < 0.15) put('rock', 0.35, 2, 0.5 + rnd());
    }
  }

  // Hand-placed: rocks around the pond and the foot of the waterfall, lily pads.
  const p = SITE.pond;
  for (let a = 0; a < Math.PI * 2; a += 0.33) {
    if (rnd() < 0.35) continue;
    const rr = 1.08 + rnd() * 0.12;
    const x = p.x + Math.cos(a) * p.rx * rr, z = p.z + Math.sin(a) * p.rz * rr;
    if (z < -7.6) continue;
    B('mossrock', a > 3 ? 1 : 0, x, z).add(x, world.heightAt(x, z), z, rnd() * 6, 0.45 + rnd() * 0.5, tint());
  }
  [[14.6, -7.3, 0.7], [17.6, -7.2, 0.8], [13.6, -6.6, 0.5]].forEach(([x, z, s]) => B('mossrock', 0, x, z).add(x, WATER_Y - 0.15, z, rnd() * 6, s, tint()));

  for (const key in batches) {
    const { kind, v, b } = batches[key];
    const geo = kinds[kind][v];
    const mat = kind.includes('rock') ? rockMat : (kind === 'bush' || kind === 'mush') ? bushMat : plantMat;
    const mesh = b.build(geo, mat, { cast: kind !== 'mush' });
    if (mesh) { mesh.name = kind; group.add(mesh); }
  }
  world.kinds = kinds;
  world.mats = { plantMat, bushMat, rockMat, flowerMat, grassMat };

  // Grass, flowers and reeds, in chunks so off-screen chunks are skipped.
  const tufts = [grassTuftGeo(1), grassTuftGeo(2, 8, 0.42), grassTuftGeo(3, 6, 0.6)];
  const reeds = reedGeo(), flower = flowerGeo();
  const CH = 28;
  const flowerColors = ['#ff8fb4', '#ffd84a', '#ffffff', '#b890ff', '#7fb3ff', '#ff7a52', '#ffffff'].map(C);
  const gc = new THREE.Color();
  for (let cj = 0; cj < N; cj += CH) for (let ci = 0; ci < N; ci += CH) {
    const gb = [new Batch(), new Batch(), new Batch()], fb = new Batch(), rb = new Batch();
    for (let j = cj; j < cj + CH; j++) for (let i = ci; i < ci + CH; i++) {
      const k = j * N + i, L = world.levels[k];
      const b = world.primary[k], g = world.ground[k];
      const y = null;
      if (world.steepness(i, j) > 0.9) continue;
      const swampW = world.weights[k * 6 + SWAMP];
      // reeds at the water's edge in the marsh and around the pond
      if ((L === 0 || L === 1) && (swampW > 0.4 || (b === FOREST && g === 1)) && rnd() < (swampW > 0.4 ? 0.35 : 0.25)) {
        rb.add(cellX(i) + (rnd() - 0.5) * 0.8, y, cellX(j) + (rnd() - 0.5) * 0.8, rnd() * 6, 0.8 + rnd() * 0.5, gc.setRGB(0.55, 0.72, 0.36).clone());
      }
      if (L <= 0 || world.reserved[k] && Math.hypot(cellX(i) - SITE.cabin.x, cellX(j) - SITE.cabin.z) < 4.5) continue;
      if (path.cells.has(k) && rnd() < 0.8) continue;
      let dens = 0;
      if (g === 0) dens = b === FOREST ? 1 : b === COAST ? 0.7 : b === SWAMP ? 0.8 : b === MOUNTAIN ? 0.45 : 0.3;
      else if (g === 1 && b === DESERT) dens = 0.025;
      const count = dens * quality.grass;
      const n = Math.floor(count) + (rnd() < count % 1 ? 1 : 0);
      const tc = world.topColors;
      for (let t = 0; t < n; t++) {
        const x = cellX(i) + (rnd() - 0.5) * 0.95, z = cellX(j) + (rnd() - 0.5) * 0.95;
        gc.setRGB(tc[k * 3], tc[k * 3 + 1], tc[k * 3 + 2]).multiplyScalar(1.12 + rnd() * 0.2);
        if (rnd() < 0.28) gc.multiplyScalar(0.6);   // darker strands, like long grass in shade
        if (b === DESERT) gc.setRGB(0.75, 0.65, 0.35);
        gb[Math.floor(rnd() * 3)].add(x, y, z, rnd() * 6, 0.8 + rnd() * 0.6, gc.clone());
      }
      // flower meadows in the woods and on the coast
      if (g === 0 && (b === FOREST || b === COAST || b === MOUNTAIN)) {
        const meadow = fbm(nQ, cellX(i) * 0.08, cellX(j) * 0.08, 2);
        const near = Math.hypot(cellX(i) - SITE.cabin.x, cellX(j) - SITE.cabin.z) < 14 ? 0.25 : 0;
        if (meadow + near > 0.28) {
          const fc = flowerColors[Math.floor((fbm(nP, cellX(i) * 0.15, cellX(j) * 0.15, 1) * 0.5 + 0.5) * 6.99)];
          const nf = Math.floor(rnd() * 4 * quality.flowers);
          for (let t = 0; t < nf; t++) {
            fb.add(cellX(i) + (rnd() - 0.5) * 0.9, y, cellX(j) + (rnd() - 0.5) * 0.9, rnd() * 6, 0.8 + rnd() * 0.5,
              (rnd() < 0.8 ? fc : flowerColors[Math.floor(rnd() * 7)]).clone().multiplyScalar(1.1));
          }
        }
      }
    }
    gb.forEach((bb, v) => { const m = bb.build(tufts[v], grassMat, { cast: false }); if (m) group.add(m); });
    const fm = fb.build(flower, flowerMat, { cast: false }); if (fm) group.add(fm);
    const rm = rb.build(reeds, grassMat, { cast: false }); if (rm) group.add(rm);
  }

  // Stone path slabs
  const slabGeo = merge([part(new THREE.CylinderGeometry(0.33, 0.36, 0.1, 7), (x, y, z, out) => out.copy(C('#b5ad9c')).multiplyScalar(y > 0 ? 1 : 0.7))]);
  const sb = new Batch();
  for (const pt of path.pts) {
    const nx = -pt.tz, nz = pt.tx;
    const offsets = rnd() < 0.5 ? [-0.36, 0.36] : [(rnd() - 0.5) * 0.3];
    for (const o of offsets) {
      const x = pt.x + nx * o + (rnd() - 0.5) * 0.15, z = pt.z + nz * o + (rnd() - 0.5) * 0.15;
      sb.add(x, world.heightAt(x, z) + 0.02, z, rnd() * 6, 0.75 + rnd() * 0.45, new THREE.Color().setScalar(0.85 + rnd() * 0.25));
    }
  }
  group.add(sb.build(slabGeo, rockMat, { cast: false }));

  // Stone stairs up the slope to the plateau: chunky blocks, each one a step higher
  const stairGeo = merge([part(new THREE.BoxGeometry(0.72, 0.8, 2.3), (x, y, z, out) => out.copy(C('#a8a293')).multiplyScalar(y > 0.35 ? 1 : 0.72))]);
  const st = new Batch();
  for (let k = 0; k < 8; k++) {
    const x = -0.1 + k * 0.72 + 0.36, z = -11;
    const top = world.heightAt(x + 0.36, z) + 0.06;
    st.add(x, top - 0.4, z, (rnd() - 0.5) * 0.05, 1, new THREE.Color().setScalar(0.88 + rnd() * 0.18));
  }
  group.add(st.build(stairGeo, rockMat));

  // Lily pads on the pond
  const padGeo = merge([
    part(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 9, 1, false, 0.3, Math.PI * 2 - 0.6), C('#4f9a3c')),
  ]);
  const lily = new Batch(), lilyFlower = new Batch();
  for (let k = 0; k < 14; k++) {
    const a = rnd() * Math.PI * 2, rr = 0.25 + rnd() * 0.6;
    const x = p.x + Math.cos(a) * p.rx * rr, z = p.z + 1 + Math.sin(a) * (p.rz - 1.5) * rr;
    lily.add(x, WATER_Y + 0.02, z, rnd() * 6, 0.7 + rnd() * 0.6, new THREE.Color().setScalar(0.85 + rnd() * 0.3));
    if (rnd() < 0.35) lilyFlower.add(x + 0.05, WATER_Y + 0.02, z, rnd() * 6, 0.9, C('#ffa6c9'));
  }
  group.add(lily.build(padGeo, rockMat, { cast: false }));
  group.add(lilyFlower.build(flowerGeo(), flowerMat, { cast: false }));

  return group;
}

// ---------- the cabin ----------
export function buildCabin(world, lights) {
  const c = SITE.cabin;
  const y0 = world.heightAt(c.x, c.z);
  const group = new THREE.Group();
  group.position.set(c.x, y0, c.z);
  const parts = [];
  const W1 = C('#8b5a35'), W2 = C('#7a4c2c'), STONE = C('#8f8a7f'), PLANK = C('#9c6c42'), DARK = C('#4a2e1c');
  const ROOF1 = C('#b4502e'), ROOF2 = C('#9e4428'), METAL = C('#d8d4cc');

  // stone foundation
  parts.push(part(lumpy(1, 3, 1, 0.05), STONE, [0, 0.22, 0], [0, 0, 0], [2.85, 0.28, 2.35]));
  parts.push(part(new THREE.BoxGeometry(5.5, 0.42, 4.5), STONE, [0, 0.21, 0]));
  // log walls
  for (let k = 0; k < 7; k++) {
    const y = 0.6 + k * 0.36;
    const col = k % 2 ? W1 : W2;
    parts.push(part(new THREE.CylinderGeometry(0.2, 0.2, 5.4, 8), col, [0, y, 2.0], [0, 0, Math.PI / 2]));
    parts.push(part(new THREE.CylinderGeometry(0.2, 0.2, 5.4, 8), col, [0, y, -2.0], [0, 0, Math.PI / 2]));
    parts.push(part(new THREE.CylinderGeometry(0.2, 0.2, 4.5, 8), col.clone().multiplyScalar(0.95), [2.5, y + 0.18, 0], [Math.PI / 2, 0, 0]));
    parts.push(part(new THREE.CylinderGeometry(0.2, 0.2, 4.5, 8), col.clone().multiplyScalar(0.95), [-2.5, y + 0.18, 0], [Math.PI / 2, 0, 0]));
  }
  const wallTop = 0.6 + 6 * 0.36 + 0.2;
  // gables (triangles under the roof)
  const tri = new THREE.Shape([new THREE.Vector2(-2.2, 0), new THREE.Vector2(2.2, 0), new THREE.Vector2(0, 1.55)]);
  const gable = new THREE.ExtrudeGeometry(tri, { depth: 0.3, bevelEnabled: false });
  parts.push(part(gable.clone(), PLANK, [2.35, wallTop, 0], [0, Math.PI / 2, 0]));
  parts.push(part(gable.clone(), PLANK, [-2.65, wallTop, 0], [0, Math.PI / 2, 0]));
  // roof: rows of shingles on two slopes
  const a = 0.62, span = 3.0;
  for (const side of [1, -1]) {
    for (let r = 0; r < 5; r++) {
      const t = (r + 0.5) / 5;               // 0 at ridge, 1 at eave
      const d = t * span;
      const z = side * Math.cos(a) * d, y = wallTop + 1.55 + 0.1 - Math.sin(a) * d;
      parts.push(part(new THREE.BoxGeometry(6.1, 0.14, span / 5 + 0.08), r % 2 ? ROOF1 : ROOF2,
        [0, y + 0.04 * (r % 2), z], [side * a, 0, 0]));
    }
  }
  parts.push(part(new THREE.BoxGeometry(6.2, 0.2, 0.22), DARK, [0, wallTop + 1.7, 0]));
  // gutter and downspout along the front eave
  const eaveZ = Math.cos(a) * span + 0.06, eaveY = wallTop + 1.65 - Math.sin(a) * span;
  parts.push(part(new THREE.CylinderGeometry(0.08, 0.08, 6.1, 6, 1, false, 0, Math.PI), METAL, [0, eaveY - 0.05, eaveZ], [0, 0, Math.PI / 2]));
  parts.push(part(new THREE.BoxGeometry(0.1, eaveY - 0.3, 0.1), METAL, [2.95, (eaveY - 0.3) / 2 + 0.3, eaveZ]));
  // chimney
  for (let k = 0; k < 9; k++) {
    parts.push(part(new THREE.BoxGeometry(0.78, 0.42, 0.78), STONE.clone().multiplyScalar(0.85 + (k % 3) * 0.08), [-1.7, 2.3 + k * 0.4, -0.9]));
  }
  // door and window frames
  parts.push(part(new THREE.BoxGeometry(1.1, 1.95, 0.16), DARK, [-0.9, 0.42 + 0.98, 2.22]));
  parts.push(part(new THREE.BoxGeometry(0.9, 1.8, 0.12), C('#6a4128'), [-0.9, 0.42 + 0.92, 2.3]));
  parts.push(part(new THREE.IcosahedronGeometry(0.06, 0), C('#d9b45a'), [-0.6, 1.3, 2.4]));
  const windows = [[1.3, 1.5, 2.2, 0], [2.68, 1.5, 0.6, Math.PI / 2], [-2.68, 1.5, 0.6, -Math.PI / 2]];
  for (const [x, y, z, r] of windows) {
    parts.push(part(new THREE.BoxGeometry(1.05, 0.95, 0.16), DARK, [x, y, z], [0, r, 0]));
    parts.push(part(new THREE.BoxGeometry(1.15, 0.1, 0.3), PLANK, [x + Math.sin(r) * 0.08, y - 0.5, z + Math.cos(r) * 0.08], [0, r, 0]));
  }
  // flower box under the front window
  parts.push(part(new THREE.BoxGeometry(1.0, 0.22, 0.28), C('#7a4a2a'), [1.3, 0.9, 2.42]));
  for (let k = 0; k < 5; k++) parts.push(part(new THREE.IcosahedronGeometry(0.09, 0), C(['#ff8fb4', '#ffd84a', '#ffffff', '#ff8fb4', '#b890ff'][k]), [0.95 + k * 0.18, 1.08, 2.45]));
  // porch deck
  for (let k = 0; k < 8; k++) parts.push(part(new THREE.BoxGeometry(0.66, 0.1, 1.5), k % 2 ? PLANK : PLANK.clone().multiplyScalar(0.9), [-2.45 + k * 0.7, 0.38, 3.0]));
  for (const x of [-2.75, 2.75]) {
    parts.push(part(new THREE.CylinderGeometry(0.08, 0.09, 2.5, 6), W2, [x, 1.6, 3.65]));
    parts.push(part(new THREE.BoxGeometry(0.08, 0.08, 1.4), W1, [x, 1.0, 3.0]));
  }
  parts.push(part(new THREE.BoxGeometry(5.7, 0.12, 0.12), W2, [0, 2.85, 3.65]));
  // woodpile and barrel
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) {
    parts.push(part(new THREE.CylinderGeometry(0.14, 0.14, 1.0, 7), (x, y, z, out) => out.copy(Math.abs(y) > 0.45 ? C('#d9b07a') : W1),
      [-3.25, 0.15 + r * 0.25, -1.2 + k * 0.3 + r * 0.15], [Math.PI / 2, 0, 0]));
  }
  parts.push(part(new THREE.CylinderGeometry(0.3, 0.27, 0.75, 10), (x, y, z, out) => out.copy(Math.abs(y) > 0.25 && Math.abs(y) < 0.3 ? DARK : W1), [3.3, 0.38, 2.4]));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const body = new THREE.Mesh(merge(parts), mat);
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  // glowing glass
  const glassMat = new THREE.MeshStandardMaterial({ color: '#1f2430', emissive: '#ffb45e', emissiveIntensity: 0.1, roughness: 0.3 });
  const glassParts = windows.map(([x, y, z, r]) => part(new THREE.BoxGeometry(0.82, 0.72, 0.18), C('#ffffff'), [x, y, z], [0, r, 0]));
  const glass = new THREE.Mesh(merge(glassParts), glassMat);
  group.add(glass);
  const mullions = windows.flatMap(([x, y, z, r]) => [
    part(new THREE.BoxGeometry(0.06, 0.74, 0.22), DARK, [x, y, z], [0, r, 0]),
    part(new THREE.BoxGeometry(0.84, 0.06, 0.22), DARK, [x, y, z], [0, r, 0]),
  ]);
  group.add(new THREE.Mesh(merge(mullions), mat));

  // warm light spilling from the front window and the door
  const winLight = new THREE.PointLight('#ffb35a', 0, 9, 1.6);
  winLight.position.set(0.4, 1.5, 3.1);
  group.add(winLight);
  lights.push({ light: winLight, base: 9, glass: glassMat });

  // block the cabin footprint for walking
  for (let z = c.z - 2.4; z <= c.z + 3.8; z += 0.5) for (let x = c.x - 3.6; x <= c.x + 3.0; x += 0.5) {
    world.blocked[cellIndex(z) * N + cellIndex(x)] = 1;
  }
  return { group, chimneyTop: new THREE.Vector3(c.x - 1.7, y0 + 2.3 + 8 * 0.4 + 0.4, c.z - 0.9), glassMat };
}

// A lantern on a post beside the path, and the vegetable garden.
export function buildYard(world, lights) {
  const group = new THREE.Group();
  const DARK = C('#4a2e1c'), WOOD = C('#8b5a35');
  const lx = -1.6, lz = -0.2, ly = world.heightAt(lx, lz);
  const post = merge([
    part(new THREE.BoxGeometry(0.16, 2.2, 0.16), DARK, [0, 1.1, 0]),
    part(new THREE.BoxGeometry(0.7, 0.1, 0.1), DARK, [0.3, 2.1, 0]),
    part(new THREE.BoxGeometry(0.06, 0.25, 0.06), DARK, [0.58, 1.95, 0]),
    part(new THREE.ConeGeometry(0.22, 0.18, 4), DARK, [0.58, 1.86, 0], [0, Math.PI / 4, 0]),
  ]);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const pm = new THREE.Mesh(post, mat); pm.castShadow = true; pm.position.set(lx, ly, lz); group.add(pm);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#2a2622', emissive: '#ffc070', emissiveIntensity: 0.1 });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), lampMat);
  lamp.position.set(lx + 0.58, ly + 1.62, lz); group.add(lamp);
  const L = new THREE.PointLight('#ffb866', 0, 8, 1.7);
  L.position.set(lx + 0.58, ly + 1.5, lz); group.add(L);
  lights.push({ light: L, base: 7, glass: lampMat });
  world.blocked[cellIndex(lz) * N + cellIndex(lx)] = 1;

  // garden plots with sprouts, and a low fence
  const parts = [];
  const gx = -8.6, gz = -2.6, gy = world.heightAt(gx, gz);
  for (const [ox, oz] of [[0, 0], [0, 1.9]]) {
    parts.push(part(new THREE.BoxGeometry(2.6, 0.22, 1.4), C('#5a3d27'), [ox, 0.11, oz]));
    for (let r = 0; r < 3; r++) {
      parts.push(part(new THREE.BoxGeometry(2.4, 0.08, 0.22), C('#6b4a30'), [ox, 0.24, oz - 0.42 + r * 0.42]));
      for (let k = 0; k < 6; k++) {
        parts.push(part(new THREE.ConeGeometry(0.08, 0.22, 5), C(r === 1 ? '#7cc24f' : '#5fa83e'), [ox - 1.0 + k * 0.4, 0.38, oz - 0.42 + r * 0.42]));
      }
    }
  }
  for (let k = 0; k <= 8; k++) {
    parts.push(part(new THREE.BoxGeometry(0.1, 0.7, 0.1), WOOD, [-1.7, 0.35, -1.0 + k * 0.5]));
    parts.push(part(new THREE.BoxGeometry(0.1, 0.7, 0.1), WOOD, [-1.0 + k * 0.33, 0.35, -1.1]));
  }
  parts.push(part(new THREE.BoxGeometry(0.06, 0.08, 4.1), WOOD, [-1.7, 0.5, 1.0]));
  parts.push(part(new THREE.BoxGeometry(2.7, 0.08, 0.06), WOOD, [0.35, 0.5, -1.1]));
  const garden = new THREE.Mesh(merge(parts), mat);
  garden.position.set(gx, gy, gz);
  garden.castShadow = garden.receiveShadow = true;
  group.add(garden);
  for (let z = gz - 1.1; z <= gz + 3; z += 0.5) world.blocked[cellIndex(z) * N + cellIndex(gx - 1.7)] = 1;
  return group;
}

// ---------- waterfall ----------
export function buildWaterfall(lightUniforms, waterMat) {
  const S = SITE.stream;
  const group = new THREE.Group();
  const topY = 6 * STEP + 0.3;
  // the stream on the plateau uses the same water shader as the sea
  const stream = new THREE.Mesh(new THREE.PlaneGeometry(S.x1 - S.x0, S.z1 - S.z0).rotateX(-Math.PI / 2), waterMat);
  stream.position.set((S.x0 + S.x1) / 2, topY, (S.z0 + S.z1) / 2);
  stream.renderOrder = 2;
  group.add(stream);

  const h = topY - WATER_Y;
  const geo = new THREE.PlaneGeometry(S.x1 - S.x0 + 0.1, h + 0.25, 1, 12);
  // bulge the sheet outward a little so it arcs off the lip
  const p = geo.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const t = (h / 2 - p.getY(k)) / h; // 0 top, 1 bottom
    p.setZ(k, Math.sin(Math.min(t, 1) * Math.PI * 0.5) * 0.35 + (t < 0.05 ? 0 : 0.05));
  }
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: `varying vec2 vUv; varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.); vWorld = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform vec3 uSunColor, uAmbient, uSunDir; varying vec2 vUv; varying vec3 vWorld;
      #include <fog_pars_fragment>
      ${GLSL_NOISE}
      void main(){
        float streak = vnoise(vec2(vUv.x * 9.0, vUv.y * 2.5 + uTime * 2.2));
        float streak2 = vnoise(vec2(vUv.x * 23.0, vUv.y * 5.0 + uTime * 3.1));
        vec3 light = uAmbient + uSunColor * 0.5;
        vec3 col = mix(vec3(0.45, 0.78, 0.86), vec3(0.95, 0.98, 1.0), smoothstep(0.35, 0.85, streak * 0.6 + streak2 * 0.5));
        float foam = smoothstep(0.12, 0.0, vUv.y) + smoothstep(0.93, 1.0, vUv.y) * 0.5;
        col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0));
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        gl_FragColor = vec4(col * light, (0.7 + streak2 * 0.25) * edge);
        #include <fog_fragment>
      }`,
  });
  Object.assign(mat.uniforms, lightUniforms);
  const sheet = new THREE.Mesh(geo, mat);
  sheet.position.set((S.x0 + S.x1) / 2, WATER_Y + h / 2 - 0.05, S.z1 + 0.02);
  sheet.renderOrder = 3;
  group.add(sheet);
  return { group, mat, base: new THREE.Vector3((S.x0 + S.x1) / 2, WATER_Y + 0.1, S.z1 + 0.6) };
}
