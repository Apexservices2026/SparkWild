// Snap-together building (decision 22): floors, walls, door walls, window walls, roofs, stairs and fences
// on a 2 m grid, with a see-through preview ("ghost") that turns green when it fits and red when it doesn't.
//
// Phone: the BUILD button (hammer and house, top bar) opens a build bar at the bottom. Pick a piece, drag on
// the right half of the screen to slide the ghost, then Rotate, Place or ✕. The left thumb still walks.
// Computer: B opens the bar, the mouse moves the ghost, R rotates, click places, Esc cancels.
//
// Grid: cell (a, b) covers x from 2a to 2a+2 and z from 2b to 2b+2. Floors, roofs and stairs fill a cell.
// Walls, doors, windows and fences sit on a cell edge: (a, b, 0) runs along x at z = 2b, (a, b, 1) runs
// along z at x = 2a. Pieces are drawn with one instanced mesh per kind, so a big village stays light on phones.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { N, HALF, WATER_Y, SITE, cellIndex } from './world.js';
import { icon } from './items.js';

export const G = 2;              // grid size in metres
export const FLOOR_H = 0.12;     // floor top above its base
export const WALL_H = 2.3;       // wall height (roofs sit on top)
const CAP = 320;                 // most pieces of one kind
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const KITS = { campfire: 0.6, shelter: 1.4, cabin: 2.4, farm: 1.3, forge: 1.0 };   // ground radius of the one-tap kits

// What each piece is, what it costs and where it goes ('cell' or 'edge').
export const PIECES = [
  { id: 'floor', name: 'Floor', slot: 'cell', cost: { wood: 2, stone: 1 }, desc: 'Plank floor on stone' },
  { id: 'wall', name: 'Wall', slot: 'edge', cost: { wood: 3 }, desc: 'Log wall' },
  { id: 'door', name: 'Door wall', slot: 'edge', cost: { wood: 3 }, desc: 'Wall with a door' },
  { id: 'window', name: 'Window wall', slot: 'edge', cost: { wood: 3 }, desc: 'Wall with a window' },
  { id: 'roof', name: 'Roof', slot: 'cell', cost: { wood: 2 }, desc: 'Sits on wall tops' },
  { id: 'stairs', name: 'Stairs', slot: 'cell', cost: { wood: 2 }, desc: 'Porch steps' },
  { id: 'fence', name: 'Fence', slot: 'edge', cost: { wood: 1 }, desc: 'Keeps the chickens honest' },
];
const BY_ID = Object.fromEntries(PIECES.map((p) => [p.id, p]));
const WALLISH = new Set(['wall', 'door', 'window']);
const costText = (c) => Object.entries(c).map(([id, n]) => `${n} ${id}`).join(' + ');

// ---------- build bar icons: the same hand-drawn set as the items (src/items.js) ----------
export const svgIcon = (id) => icon(id);

// ---------- piece shapes (vertex colours, merged into one geometry each) ----------
function part(geo, color, pos, rot = [0, 0, 0], scl = [1, 1, 1]) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scl)));
  // a soft shade from the bottom to the top of each part gives the logs and planks some roundness
  g.computeBoundingBox();
  const y0 = g.boundingBox.min.y, span = Math.max(1e-3, g.boundingBox.max.y - y0);
  const c = new THREE.Color(color), P = g.attributes.position, n = P.count, arr = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const shade = 0.84 + 0.16 * (P.getY(k) - y0) / span;
    arr[k * 3] = c.r * shade; arr[k * 3 + 1] = c.g * shade; arr[k * 3 + 2] = c.b * shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const LOG = ['#8b5a35', '#7a4c2c', '#94613a'];
const PLANK = ['#b07a4a', '#9c6a3f', '#a87346'];
const STONE = ['#9a958a', '#87827a'];
const ROOF = ['#a8552f', '#934a29'];
const DARK = '#4a2e1c';
const LOG_R = 0.19, LOG_GAP = 0.37;
const logY = (k) => 0.19 + k * LOG_GAP;
const log = (x0, x1, k) => part(new THREE.CylinderGeometry(LOG_R, LOG_R, x1 - x0, 7), LOG[k % 3], [(x0 + x1) / 2, logY(k), 0], [0, 0, Math.PI / 2]);
const footing = () => part(new THREE.BoxGeometry(2.0, 0.6, 0.44), STONE[1], [0, -0.3, 0]);

function shapes() {
  const S = {};
  // floor: stone footing and five planks
  const f = [part(new THREE.BoxGeometry(2.0, 0.55, 2.0), STONE[0], [0, -0.2, 0])];
  for (let k = 0; k < 5; k++) f.push(part(new THREE.BoxGeometry(0.385, 0.1, 1.96), PLANK[k % 3], [-0.8 + k * 0.4, FLOOR_H - 0.05, 0]));
  for (const [x, z] of [[-0.93, -0.93], [0.93, -0.93], [-0.93, 0.93], [0.93, 0.93]]) f.push(part(new THREE.BoxGeometry(0.2, 0.12, 0.2), STONE[1], [x, FLOOR_H - 0.02, z]));
  S.floor = f;
  // wall: six logs (they poke past the corners, like a real log cabin)
  const w = [footing()];
  for (let k = 0; k < 6; k++) w.push(log(-1.12, 1.12, k));
  S.wall = w;
  // door wall: logs either side of the doorway, one across the top, a frame and a door standing open
  const d = [footing()];
  for (let k = 0; k < 5; k++) { d.push(log(-1.12, -0.56, k)); d.push(log(0.56, 1.12, k)); }
  d.push(log(-1.12, 1.12, 5));
  d.push(part(new THREE.BoxGeometry(0.1, 1.86, 0.44), DARK, [-0.55, 0.93, 0]), part(new THREE.BoxGeometry(0.1, 1.86, 0.44), DARK, [0.55, 0.93, 0]));
  d.push(part(new THREE.BoxGeometry(0.06, 1.72, 0.92), PLANK[1], [0.5, 0.88, 0.5]));
  d.push(part(new THREE.BoxGeometry(0.08, 0.1, 0.8), DARK, [0.47, 0.45, 0.5]), part(new THREE.BoxGeometry(0.08, 0.1, 0.8), DARK, [0.47, 1.35, 0.5]));
  d.push(part(new THREE.BoxGeometry(1.0, 0.06, 0.5), PLANK[0], [0, 0.03, 0]));   // threshold
  S.door = d;
  // window wall: full logs below and above, a framed window with a warm pane and a little flower box
  const wn = [footing()];
  for (const k of [0, 1, 4, 5]) wn.push(log(-1.12, 1.12, k));
  for (const k of [2, 3]) { wn.push(log(-1.12, -0.44, k)); wn.push(log(0.44, 1.12, k)); }
  const wy = (logY(2) + logY(3)) / 2;
  wn.push(part(new THREE.BoxGeometry(0.86, 0.78, 0.06), '#ffd38a', [0, wy, 0]));
  wn.push(part(new THREE.BoxGeometry(0.06, 0.78, 0.12), DARK, [0, wy, 0]), part(new THREE.BoxGeometry(0.86, 0.06, 0.12), DARK, [0, wy, 0]));
  for (const s of [-1, 1]) wn.push(part(new THREE.BoxGeometry(0.08, 0.86, 0.46), DARK, [s * 0.45, wy, 0]), part(new THREE.BoxGeometry(0.98, 0.08, 0.46), DARK, [0, wy + s * 0.41, 0]));
  for (const s of [-1, 1]) {
    wn.push(part(new THREE.BoxGeometry(0.8, 0.14, 0.18), PLANK[1], [0, wy - 0.5, s * 0.3]));
    for (let k = 0; k < 4; k++) wn.push(part(new THREE.IcosahedronGeometry(0.07, 0), k % 2 ? '#ff8fb4' : '#ffd84a', [-0.27 + k * 0.18, wy - 0.38, s * 0.3]));
  }
  S.window = wn;
  // roof: two sloped sides of shingles from a ridge along x, with gable ends and a ridge log
  const r = [], rise = 0.95, half = 1.0, over = 0.28;
  const a = Math.atan2(rise, half), len = (half + over) / Math.cos(a);
  for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
    const t = (k + 0.5) / 4 * len;
    r.push(part(new THREE.BoxGeometry(2.16, 0.1, len / 4 + 0.06), ROOF[k % 2], [0, rise - Math.sin(a) * t + 0.05, side * Math.cos(a) * t], [side * a, 0, 0]));
  }
  const tri = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, rise)]);
  for (const x of [-1.0, 0.92]) r.push(part(new THREE.ExtrudeGeometry(tri, { depth: 0.08, bevelEnabled: false }), LOG[0], [x, 0, 0], [0, Math.PI / 2, 0]));
  r.push(part(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 6), DARK, [0, rise + 0.08, 0], [0, 0, Math.PI / 2]));
  S.roof = r;
  // stairs: three plank steps with side boards (rise towards +z)
  const st = [];
  for (let k = 0; k < 3; k++) st.push(part(new THREE.BoxGeometry(1.5, 0.12, 0.56), PLANK[k % 3], [0, 0.2 + k * 0.22, -0.6 + k * 0.6]));
  for (const s of [-1, 1]) st.push(part(new THREE.BoxGeometry(0.1, 0.72, 1.9), LOG[1], [s * 0.8, 0.3, 0], [-0.32, 0, 0]));
  S.stairs = st;
  // fence: three pointed posts and two rails
  const fe = [];
  for (const x of [-0.95, 0, 0.95]) {
    fe.push(part(new THREE.BoxGeometry(0.14, 1.0, 0.14), LOG[2], [x, 0.4, 0]));
    fe.push(part(new THREE.ConeGeometry(0.1, 0.2, 4), LOG[2], [x, 1.0, 0], [0, Math.PI / 4, 0]));
  }
  for (const y of [0.42, 0.78]) fe.push(part(new THREE.BoxGeometry(2.0, 0.1, 0.06), PLANK[0], [0, y, 0.08]));
  S.fence = fe;
  const out = {};
  for (const [k, list] of Object.entries(S)) out[k] = mergeGeometries(list);
  return out;
}

// ---------- a burst of little particles (dust when you build, confetti when you finish the tutorial) ----------
export class Burst {
  constructor(scene, { cap = 120, geo = new THREE.IcosahedronGeometry(1, 0) } = {}) {
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }), cap);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    const white = new THREE.Color(1, 1, 1);
    for (let k = 0; k < cap; k++) { this.mesh.setMatrixAt(k, ZERO); this.mesh.setColorAt(k, white); }
    this.mesh.count = 1;   // one invisible copy is drawn from the start, so the first burst does not stall
    this.ps = [];
    this.cap = cap;
    this.next = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._c = new THREE.Color();
    scene.add(this.mesh);
  }
  emit(x, y, z, { n = 10, colors = ['#cdb89a'], speed = 2, up = 1.5, gravity = 0, drag = 2.5, life = 0.7, size = 0.12, spread = 0.8, grow = 1.5, flat = false } = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      const slot = this.next; this.next = (this.next + 1) % this.cap;
      const old = this.ps.findIndex((p) => p.slot === slot);
      if (old >= 0) this.ps.splice(old, 1);
      this.ps.push({
        slot, t: 0, life: life * (0.7 + Math.random() * 0.6), size: size * (0.7 + Math.random() * 0.6), grow, gravity, drag, flat,
        x: x + Math.cos(a) * spread * Math.random(), y: y + Math.random() * 0.2, z: z + Math.sin(a) * spread * Math.random(),
        vx: Math.cos(a) * s, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * s, rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 14,
      });
      this.mesh.setColorAt(slot, this._c.set(colors[k % colors.length]));
      this.mesh.count = Math.max(this.mesh.count, slot + 1);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    if (!this.ps.length) return;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.t += dt;
      if (p.t >= p.life) { this.mesh.setMatrixAt(p.slot, ZERO); this.ps.splice(i, 1); continue; }
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp; p.vz *= damp; p.vy = p.vy * damp - p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rx += p.spin * dt; p.ry += p.spin * 0.7 * dt;
      const k = p.t / p.life, s = p.size * (1 + p.grow * k) * (k > 0.6 ? (1 - k) / 0.4 : 1);
      this._s.set(s, p.flat ? s * 0.12 : s, p.flat ? s * 0.6 : s);
      this.mesh.setMatrixAt(p.slot, this._m.compose(this._p.set(p.x, p.y, p.z), this._q.setFromEuler(this._e.set(p.rx, p.ry, 0)), this._s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// one instanced mesh with free slots
class Inst {
  constructor(scene, geo, mat, cap) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    for (let k = 0; k < cap; k++) this.mesh.setMatrixAt(k, ZERO);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.used = new Uint8Array(cap);
    scene.add(this.mesh);
  }
  add() {
    let s = 0;
    while (s < this.used.length && this.used[s]) s++;
    if (s >= this.used.length) return -1;
    this.used[s] = 1;
    this.mesh.count = Math.max(this.mesh.count, s + 1);
    return s;
  }
  remove(s) {
    if (s < 0) return;
    this.used[s] = 0;
    this.mesh.setMatrixAt(s, ZERO); this.mesh.instanceMatrix.needsUpdate = true;
    let hi = this.mesh.count;
    while (hi > 0 && !this.used[hi - 1]) hi--;
    this.mesh.count = hi;
  }
}

const CSS = `
  #btn-build { width: auto; padding: 0 9px 0 7px; gap: 5px; display: inline-flex; align-items: center; border-color: rgba(255, 179, 92, 0.6); background: rgba(255, 179, 92, 0.16); }
  #btn-build span { font: 600 13px/1 var(--font-display); color: var(--ink); }
  #btn-build svg { width: 22px; height: 22px; stroke: var(--ember); stroke-width: 2; stroke-linejoin: round; }
  #btn-build[aria-pressed="true"] { background: var(--ember); } #btn-build[aria-pressed="true"] svg { stroke: #2a2018; } #btn-build[aria-pressed="true"] span { color: #2a2018; }
  @media (orientation: landscape) and (max-height: 500px) and (max-width: 760px) { #btn-build span { display: none; } #btn-build { padding: 0; width: 44px; justify-content: center; } }
  @media (orientation: portrait) and (max-width: 380px) { #btn-build span { display: none; } #btn-build { padding: 0; width: 44px; justify-content: center; } }
  body.build-open #actions, body.build-open #bottom, body.build-open #coach, body.build-open #joy-ghost { visibility: hidden; }
  #build-bar { position: fixed; z-index: 3; left: 50%; transform: translateX(-50%); bottom: calc(10px + env(safe-area-inset-bottom, 0px)); width: max-content;
    max-width: calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)); box-sizing: border-box; display: flex; align-items: stretch; gap: 6px; padding: 6px; background: rgba(20, 26, 22, 0.9); }
  .bb-have { flex: 0 0 auto; display: grid; align-content: center; gap: 4px; padding: 0 4px 0 2px; font: 700 13px/1 var(--font-body); font-variant-numeric: tabular-nums; }
  .bb-have span { display: flex; align-items: center; gap: 3px; } .bb-have svg { width: 18px; height: 18px; display: block; }
  .bb-list { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; touch-action: pan-x; overscroll-behavior: contain; min-width: 0; }
  .bb-list::-webkit-scrollbar { display: none; }
  .bb-item { flex: 0 0 auto; min-width: 66px; padding-inline: 5px !important; min-height: 66px; box-sizing: border-box; border-radius: 12px; border: 2px solid var(--glass-edge); background: rgba(255, 255, 255, 0.06); display: grid; justify-items: center; align-content: center; gap: 2px; padding: 4px 2px; cursor: pointer; }
  .bb-item svg { width: 30px; height: 30px; fill: none; stroke: var(--ink); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; display: block; }
  .bb-name { font: 700 12px/1.05 var(--font-body); text-align: center; white-space: nowrap; }
  .bb-cost { display: flex; gap: 4px; font: 700 12px/1 var(--font-body); font-variant-numeric: tabular-nums; }
  .bb-cost span { display: inline-flex; align-items: center; gap: 1px; } .bb-cost svg { width: 14px; height: 14px; }
  .bb-cost .no { color: #ff9a8a; } .bb-cost .ok { color: #b8e890; }
  .bb-item[aria-pressed="true"] { border-color: var(--ember); background: rgba(255, 179, 92, 0.24); }
  .bb-item.remove svg { stroke: #ff9a8a; }
  #bb-close { flex: 0 0 auto; width: 40px; border-radius: 12px; border: 1px solid var(--glass-edge); background: rgba(255, 255, 255, 0.06); font-size: 16px; cursor: pointer; }
  #build-ctl { position: fixed; z-index: 3; right: max(16px, env(safe-area-inset-right, 0px)); bottom: calc(96px + env(safe-area-inset-bottom, 0px)); display: flex; align-items: center; gap: 10px; }
  .bc-btn { width: 54px; height: 54px; border-radius: 50%; border: 2px solid rgba(255, 236, 200, 0.4); background: rgba(24, 30, 26, 0.72); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: grid; place-items: center; cursor: pointer; padding: 0; font-size: 18px; }
  .bc-btn svg { width: 28px; height: 28px; fill: none; stroke: var(--ink); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  #bc-place { width: auto; min-width: 104px; height: 64px; border-radius: 32px; padding: 0 18px; display: flex; gap: 6px; background: #5fb85a; border-color: #b8f0a0; color: #10240e; font: 600 19px/1 var(--font-display); }
  #bc-place svg { stroke: #10240e; stroke-width: 2.6; }
  #bc-place.bad { background: rgba(120, 60, 52, 0.85); border-color: #ff9a8a; color: #ffe6e0; } #bc-place.bad svg { stroke: #ffe6e0; }
  #bc-place.remove { background: #e8685a; border-color: #ffc0b0; color: #2a0f0b; } #bc-place.remove svg { stroke: #2a0f0b; }
  .bc-btn:active { transform: scale(0.94); }
  .bc-hint { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(92px + env(safe-area-inset-bottom, 0px)); font-size: 12px; font-weight: 700; color: var(--ink); background: rgba(12, 17, 14, 0.7); padding: 4px 10px; border-radius: 8px; white-space: nowrap; pointer-events: none; }
  .touch .bc-hint { display: none; }
  @media (max-height: 460px) { .bb-item { min-width: 60px; min-height: 56px; } .bb-item svg { width: 26px; height: 26px; } #build-ctl { bottom: calc(84px + env(safe-area-inset-bottom, 0px)); } .bc-btn { width: 48px; height: 48px; } #bc-place { height: 56px; min-width: 96px; } .bc-hint { bottom: 80px; } }
`;

export class Builder {
  constructor({ scene, world, game, camera, audio, hud, canvas, isPlaying }) {
    Object.assign(this, { scene, world, game, camera, audio, hud, canvas });
    this.isPlaying = isPlaying || (() => true);
    this.pieces = new Map();       // key -> piece
    this.open = false;             // the build bar is showing
    this.kind = null;              // the chosen piece (or 'remove')
    this.side = 0;                 // edge side for walls: 0 north, 1 east, 2 south, 3 west
    this.rot = 0;                  // turn for roofs and stairs
    this.sideLock = false;         // set by Rotate until the ghost moves to another cell
    this.P = new THREE.Vector3();  // where the ghost is aimed (on the ground)
    this.mouse = { on: false, x: 0, y: 0 };
    this.drag = null;
    this.version = 0;              // changes whenever a piece is added or removed
    this.magnet = null;            // the tutorial can pull the ghost onto its plan: (kind, x, z) => slot or null
    this.pops = [];
    this.hiddenRoofs = new Set();
    this.counted = false;

    const geos = shapes();
    this.geos = geos;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    this.inst = {};
    for (const p of PIECES) this.inst[p.id] = new Inst(scene, geos[p.id], mat, CAP);
    this.dust = new Burst(scene, { cap: 90 });
    // the ghost: the piece's own shape, see-through, plus its outline
    this.ghostMat = new THREE.MeshBasicMaterial({ color: '#7dff8a', transparent: true, opacity: 0.42, depthWrite: false });
    this.ghostLineMat = new THREE.LineBasicMaterial({ color: '#d8ffd8', transparent: true, opacity: 0.9, depthWrite: false });
    this.ghost = new THREE.Group();
    this.ghost.visible = false;
    this.ghost.renderOrder = 7;
    this.ghostMeshes = {};
    for (const p of PIECES) {
      const m = new THREE.Mesh(geos[p.id], this.ghostMat); m.renderOrder = 7;
      const l = new THREE.LineSegments(this.edges(p.id), this.ghostLineMat); l.renderOrder = 8;
      const g = new THREE.Group(); g.add(m, l); g.visible = false;
      this.ghost.add(g); this.ghostMeshes[p.id] = g;
    }
    scene.add(this.ghost);
    this.ray = new THREE.Raycaster();
    this._v = new THREE.Vector2(); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
    this.makeUI();
    this.listen();
    // hooks for the player (stand on floors and stairs) and creatures (walls stop them)
    world.standAt = (x, z) => this.standAt(x, z);
    world.wallAt = (x, z, r) => this.wallAt(x, z, r);
  }

  // ground height including floors and stairs (used by the player)
  standAt(x, z) {
    const h = this.world.heightAt(x, z);
    if (!this.pieces.size) return h;
    const a = Math.floor(x / G), b = Math.floor(z / G);
    const p = this.pieces.get(`c:${a}:${b}`);
    if (!p) return h;
    if (p.kind === 'floor') return Math.max(h, p.y + FLOOR_H);
    // stairs rise towards local +z: three steps
    const dx = x - p.x, dz = z - p.z, c = Math.cos(p.rotY), s = Math.sin(p.rotY);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) > 0.8 || Math.abs(lz) > 0.9) return h;
    return Math.max(h, p.y + (lz < -0.3 ? 0.26 : lz < 0.3 ? 0.48 : 0.7));
  }
  // is (x, z) within r of a wall or fence (doorways stay open)? Used by creatures.
  wallAt(x, z, r = 0.4) {
    if (!this.pieces.size) return false;
    const a = Math.floor(x / G), b = Math.floor(z / G);
    for (let s = 0; s < 4; s++) {
      const e = this.edgeAt(...this.sideEdge(a, b, s));
      if (!e) continue;
      const [x0, z0, x1, z1] = this.seg(e);
      if (segDist(x, z, x0, z0, x1, z1) > r) continue;
      if (e.kind === 'door' && Math.hypot(x - e.x, z - e.z) < 0.5) continue;
      return true;
    }
    return false;
  }
  // While the build bar is open, the camera looks a little towards the ghost (or the plan) and shifts
  // so it sits above the bar instead of under it. goal is the camera's look-at point (changed in place).
  adjustCam(goal, yaw, dist) {
    if (!this.open) return;
    const f = this.kind && this.ghost.visible ? this.ghost.position : this.focus;
    if (f) { goal.x += (f.x - goal.x) * 0.5; goal.z += (f.z - goal.z) * 0.5; }
    const frac = Math.min(0.35, (this.bar.offsetHeight + 20) / innerHeight);
    const shift = frac * dist * 0.45;
    goal.x += Math.sin(yaw) * shift; goal.z += Math.cos(yaw) * shift;
  }

  edges(id) {
    if (!this._edges) this._edges = {};
    if (!this._edges[id]) this._edges[id] = new THREE.EdgesGeometry(this.geos[id], 55);
    return this._edges[id];
  }

  // ---------- the grid ----------
  cellKey(kind, a, b) { return `${kind === 'roof' ? 'r' : 'c'}:${a}:${b}`; }
  edgeKey(a, b, o) { return `e:${a}:${b}:${o}`; }
  keyOf(p) { return BY_ID[p.kind].slot === 'edge' ? this.edgeKey(p.a, p.b, p.o) : this.cellKey(p.kind, p.a, p.b); }
  floorAt(a, b) { const p = this.pieces.get(`c:${a}:${b}`); return p && p.kind === 'floor' ? p : null; }
  groundAt(a, b) { return this.pieces.get(`c:${a}:${b}`) || null; }
  roofAt(a, b) { return this.pieces.get(`r:${a}:${b}`) || null; }
  edgeAt(a, b, o) { return this.pieces.get(this.edgeKey(a, b, o)) || null; }
  // a cell's four edges, by side: 0 north (z-), 1 east (x+), 2 south (z+), 3 west (x-)
  sideEdge(a, b, s) { return s === 0 ? [a, b, 0] : s === 1 ? [a + 1, b, 1] : s === 2 ? [a, b + 1, 0] : [a, b, 1]; }
  // the two cells on either side of an edge
  edgeCells(a, b, o) { return o === 0 ? [[a, b - 1], [a, b]] : [[a - 1, b], [a, b]]; }
  edgeMid(a, b, o) { return o === 0 ? [a * G + 1, b * G] : [a * G, b * G + 1]; }
  // height range of the ground at points (lists of [x, z])
  range(pts) {
    let lo = 1e9, hi = -1e9;
    for (const [x, z] of pts) { const y = this.world.heightAt(x, z); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    return [lo, hi];
  }
  cellPts(a, b) { const out = []; for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) out.push([a * G + i, b * G + j]); return out; }
  edgePts(a, b, o) { return [0, 1, 2].map((k) => (o === 0 ? [a * G + k, b * G] : [a * G, b * G + k])); }
  wallTop(a, b) {
    let top = null;
    for (let s = 0; s < 4; s++) { const e = this.edgeAt(...this.sideEdge(a, b, s)); if (e && WALLISH.has(e.kind)) top = Math.max(top ?? -1e9, e.y + WALL_H); }
    return top;
  }

  // Where would this piece go, aimed at ground point (x, z)? Returns a slot with its height and whether it fits.
  snap(kind, x, z) {
    const def = BY_ID[kind];
    let a = Math.floor(x / G), b = Math.floor(z / G);
    let s = this.side, r = this.rot, fromMagnet = false;
    const m = this.magnet && this.magnet(kind, x, z);
    if (m) { a = m.a; b = m.b; if (m.side !== undefined) s = m.side; if (m.r !== undefined) r = m.r; fromMagnet = true; }
    if (def.slot === 'edge') {
      if (!fromMagnet) {
        if (!this.sideLock && this.mouse.on && !this.drag) {
          // the edge nearest the pointer
          const u = x / G - a, v = z / G - b;
          const d = [v, 1 - u, 1 - v, u];
          s = d.indexOf(Math.min(...d));
        }
        // that edge is taken: try the next free one round the cell
        if (!this.sideLock) for (let k = 0; k < 4; k++) { const t = (s + k) % 4; if (!this.edgeAt(...this.sideEdge(a, b, t))) { s = t; break; } }
        this.side = s;
      }
      const [ea, eb, eo] = this.sideEdge(a, b, s);
      return this.check({ kind, a: ea, b: eb, o: eo, r: 0, cell: [a, b], side: s });
    }
    return this.check({ kind, a, b, o: 0, r: kind === 'stairs' ? r % 4 : r % 2, cell: [a, b] });
  }

  // Fill in the slot's height and position, and say whether it can be built there (and why not).
  check(slot, { free = false } = {}) {
    const { kind, a, b, o } = slot, def = BY_ID[kind];
    let y, x, z, why = '';
    if (def.slot === 'cell') {
      x = a * G + 1; z = b * G + 1;
      const [lo, hi] = this.range(this.cellPts(a, b));
      if (kind === 'roof') {
        const top = this.wallTop(a, b);
        const nb = [[a - 1, b], [a + 1, b], [a, b - 1], [a, b + 1]].map(([i, j]) => this.roofAt(i, j)).find(Boolean);
        y = top ?? (nb ? nb.y : (this.floorAt(a, b) ? this.floorAt(a, b).y + FLOOR_H : hi) + WALL_H);
        if (this.roofAt(a, b)) why = 'There\'s a roof here already';
        else if (top === null && !nb) why = 'Roofs sit on walls. Build walls first';
      } else {
        const fl = this.groundAt(a, b);
        y = hi;
        if (fl) why = fl.kind === 'floor' ? 'There\'s a floor here already' : 'Something\'s built here already';
        else if (lo < WATER_Y + 0.1) why = 'Too soggy! Build on dry land';
        else if (hi - lo > (kind === 'stairs' ? 0.6 : 0.26)) why = 'Too bumpy here. Find flatter ground';
        else if (this.blockedRect(x, z, 1.0) || this.blockedCells(this.cellPts(a, b))) why = 'Stuff\'s in the way. Clear the spot first';
      }
    } else {
      [x, z] = this.edgeMid(a, b, o);
      const cells = this.edgeCells(a, b, o);
      const tops = cells.map(([i, j]) => this.floorAt(i, j)).filter(Boolean).map((f) => f.y + FLOOR_H);
      const [lo, hi] = this.range(this.edgePts(a, b, o));
      y = tops.length ? Math.max(...tops) : hi;
      if (this.edgeAt(a, b, o)) why = 'There\'s a wall here already';
      else if (lo < WATER_Y + 0.05 && !tops.length) why = 'Too soggy! Build on dry land';
      else if (!tops.length && hi - lo > 0.55) why = 'Too bumpy here. Try flatter ground';
      else if (this.blockedEdge(a, b, o) || this.blockedCells(this.edgePts(a, b, o))) why = 'Stuff\'s in the way. Clear the spot first';
    }
    if (!why && Math.hypot(x - SITE.cabin.x, z - SITE.cabin.z) < 6.5) why = 'The old cabin needs room. Step back';
    if (!why && (Math.abs(x) > HALF - 6 || Math.abs(z) > HALF - 6)) why = 'Too close to the edge of the world';
    if (!why && !free) {
      const need = Object.entries(def.cost).find(([id, n]) => !this.game.has(id, n));
      if (need) why = `Need ${def.cost[need[0]]} ${need[0]} (you have ${this.game.inv[need[0]] || 0})`;
    }
    slot.x = x; slot.z = z; slot.y = y;
    slot.rotY = def.slot === 'edge' ? (o === 1 ? Math.PI / 2 : 0) : slot.r * Math.PI / 2;
    slot.ok = !why; slot.why = why;
    return slot;
  }

  // trees, rocks, bushes, stumps or one-tap buildings inside a square (half-size h) around (x, z)?
  blockedRect(x, z, h) {
    const hit = (ox, oz, r) => Math.abs(ox - x) < h + r && Math.abs(oz - z) < h + r;
    return this.scanThings(x, z, h + 1.5, hit);
  }
  blockedEdge(a, b, o) {
    const [x0, z0] = o === 0 ? [a * G, b * G] : [a * G, b * G];
    const [x1, z1] = o === 0 ? [x0 + G, z0] : [x0, z0 + G];
    const hit = (ox, oz, r) => segDist(ox, oz, x0, z0, x1, z1) < r + 0.25;
    return this.scanThings((x0 + x1) / 2, (z0 + z1) / 2, 2.5, hit);
  }
  scanThings(x, z, reach, hit) {
    const w = this.world, g = this.game;
    const ci = cellIndex(x), cj = cellIndex(z), span = Math.ceil(reach + 1);
    for (let dj = -span; dj <= span; dj++) for (let di = -span; di <= span; di++) {
      const l = w.obstacles.get((cj + dj) * N + ci + di);
      if (l) for (const o of l) if (!o.build && !g.structures.some((st) => st.ob === o) && hit(o.x, o.z, o.r)) return true;
    }
    const gi = Math.floor(x / 4), gj = Math.floor(z / 4), gs = Math.ceil(reach / 4);
    for (let dj = -gs; dj <= gs; dj++) for (let di = -gs; di <= gs; di++) {
      const l = g.cell.get((gi + di) * 1000 + gj + dj);
      if (l) for (const o of l) if ((o.type === 'tree' || o.type === 'rock' || o.type === 'ore' || o.type === 'berries' || o.type === 'bag') && hit(o.x, o.z, o.type === 'bag' ? 0.3 : (o.scale || 1) * 0.35)) return true;
    }
    for (const id of g.chopped) { const t = g.allThings[id]; if (t && hit(t.x, t.z, 0.35)) return true; }
    for (const st of g.structures) if (hit(st.x, st.z, KITS[st.type] || 1)) return true;
    return false;
  }
  // cells that already block walking (the old cabin, its fences, big rocks), sampled just inside the points
  blockedCells(pts) {
    const w = this.world;
    for (const [x, z] of pts) for (const [dx, dz] of [[-0.3, -0.3], [0.3, 0.3]]) if (w.blocked[cellIndex(z + dz) * N + cellIndex(x + dx)]) return true;
    return false;
  }
  // For the one-tap kits: is any built piece within r of (x, z)?
  blocks(x, z, r) {
    for (const p of this.pieces.values()) {
      if (BY_ID[p.kind].slot === 'cell') { if (p.kind !== 'roof' && Math.abs(p.x - x) < 1 + r && Math.abs(p.z - z) < 1 + r) return true; }
      else { const [x0, z0, x1, z1] = this.seg(p); if (segDist(x, z, x0, z0, x1, z1) < r + 0.3) return true; }
    }
    return false;
  }
  seg(p) { return p.o === 0 ? [p.a * G, p.b * G, p.a * G + G, p.b * G] : [p.a * G, p.b * G, p.a * G, p.b * G + G]; }

  // ---------- adding and removing pieces ----------
  add(slot, { fresh = true } = {}) {
    const def = BY_ID[slot.kind];
    const p = { kind: slot.kind, a: slot.a, b: slot.b, o: slot.o || 0, r: slot.r || 0, y: slot.y };
    p.x = def.slot === 'edge' ? this.edgeMid(p.a, p.b, p.o)[0] : p.a * G + 1;
    p.z = def.slot === 'edge' ? this.edgeMid(p.a, p.b, p.o)[1] : p.b * G + 1;
    p.rotY = def.slot === 'edge' ? (p.o === 1 ? Math.PI / 2 : 0) : p.r * Math.PI / 2;
    const key = this.keyOf(p);
    if (this.pieces.has(key)) return null;
    p.slot = this.inst[p.kind].add();
    if (p.slot < 0) { this.hud.toast('That\'s a lot of building! No room for more of those'); return null; }
    this.pieces.set(key, p);
    this.setMatrix(p, fresh ? 0.45 : 1);
    if (fresh) this.pops.push({ p, t: 0 });
    // walls and fences block walking (a row of small posts); door walls leave the doorway open
    p.obs = [];
    if (def.slot === 'edge') {
      const [x0, z0, x1, z1] = this.seg(p);
      const ts = p.kind === 'door' ? [0, 0.12, 0.88, 1] : [0, 0.2, 0.4, 0.6, 0.8, 1];
      const rad = p.kind === 'fence' ? 0.16 : 0.22;
      for (const t of ts) {
        const ob = { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, r: rad, build: true };
        const k = cellIndex(ob.z) * N + cellIndex(ob.x);
        if (!this.world.obstacles.has(k)) this.world.obstacles.set(k, []);
        this.world.obstacles.get(k).push(ob);
        p.obs.push([k, ob]);
      }
    }
    if (p.kind === 'floor' || p.kind === 'stairs') { this.bury(p, true); this.hideGrass(p, true); }
    this.version++;
    return p;
  }
  remove(p) {
    const key = this.keyOf(p);
    if (!this.pieces.has(key)) return;
    this.pieces.delete(key);
    this.inst[p.kind].remove(p.slot);
    for (const [k, ob] of p.obs || []) { const l = this.world.obstacles.get(k); if (l) { const i = l.indexOf(ob); if (i >= 0) l.splice(i, 1); } }
    if (p.kind === 'floor' || p.kind === 'stairs') { this.bury(p, false); this.hideGrass(p, false); }
    this.pops = this.pops.filter((q) => q.p !== p);
    this.hiddenRoofs.delete(p);
    this.version++;
  }
  setMatrix(p, s = 1) {
    const hide = p.kind === 'roof' && this.hiddenRoofs.has(p);
    this.inst[p.kind].mesh.setMatrixAt(p.slot, hide ? ZERO : this._m.compose(this._p.set(p.x, p.y, p.z), this._q.setFromAxisAngle(this._up, p.rotY), this._s.set(s, s, s)));
    this.inst[p.kind].mesh.instanceMatrix.needsUpdate = true;
  }
  // things you can pick up never sit (or grow back) inside a floor
  bury(p, on) {
    for (const o of this.game.pickups) {
      if (Math.abs(o.x - p.x) > 1.1 || Math.abs(o.z - p.z) > 1.1) continue;
      if (on) {
        if (o.alive) { this.game.dyn[o.item].remove(o.slot); o.slot = -1; o.alive = false; }
        o.back = Infinity; o.buried = true;
      } else if (o.buried) { o.buried = false; o.back = 20; }
    }
  }
  // grass and flowers under a floor are tucked away (and come back if the floor goes)
  hideGrass(p, on) {
    if (!this.grass) {
      const skip = new Set(Object.values(this.game.dyn).map((d) => d.mesh));
      const mats = [this.world.mats.grassMat, this.world.mats.flowerMat];
      this.grass = [];
      this.scene.traverse((o) => {
        if (!o.isInstancedMesh || skip.has(o) || !mats.includes(o.material)) return;
        const n = o.count, xs = new Float32Array(n), zs = new Float32Array(n), m = new THREE.Matrix4();
        let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
        for (let k = 0; k < n; k++) { o.getMatrixAt(k, m); xs[k] = m.elements[12]; zs[k] = m.elements[14]; x0 = Math.min(x0, xs[k]); x1 = Math.max(x1, xs[k]); z0 = Math.min(z0, zs[k]); z1 = Math.max(z1, zs[k]); }
        this.grass.push({ mesh: o, xs, zs, box: [x0, x1, z0, z1] });
      });
    }
    if (on) {
      p.grass = [];
      const m = new THREE.Matrix4();
      for (const g of this.grass) {
        const [x0, x1, z0, z1] = g.box;
        if (p.x + 1.1 < x0 || p.x - 1.1 > x1 || p.z + 1.1 < z0 || p.z - 1.1 > z1) continue;
        for (let k = 0; k < g.xs.length; k++) {
          if (Math.abs(g.xs[k] - p.x) < 1.1 && Math.abs(g.zs[k] - p.z) < 1.1) {
            g.mesh.getMatrixAt(k, m); p.grass.push([g.mesh, k, m.clone()]);
            g.mesh.setMatrixAt(k, ZERO); g.mesh.instanceMatrix.needsUpdate = true;
          }
        }
      }
    } else for (const [mesh, k, m] of p.grass || []) { mesh.setMatrixAt(k, m); mesh.instanceMatrix.needsUpdate = true; }
  }

  // ---------- shelter: inside walls with a roof ----------
  // Starting in the cell at (x, z), walk to neighbouring cells through every gap in the walls.
  // If every cell reached has a roof (and it is not a huge area), you are indoors.
  room(x, z) {
    const a = Math.floor(x / G), b = Math.floor(z / G);
    const key = `${a}:${b}`;
    if (this._roomKey === key && this._roomVer === this.version) return this._room;
    this._roomKey = key; this._roomVer = this.version;
    let out = null;
    if (this.roofAt(a, b)) {
      const seen = new Set([key]), q = [[a, b]], cells = [];
      let ok = true;
      while (q.length && ok) {
        const [i, j] = q.pop();
        cells.push([i, j]);
        if (!this.roofAt(i, j) || cells.length > 40) { ok = false; break; }
        for (let s = 0; s < 4; s++) {
          const e = this.edgeAt(...this.sideEdge(i, j, s));
          if (e && WALLISH.has(e.kind)) continue;
          const n = s === 0 ? [i, j - 1] : s === 1 ? [i + 1, j] : s === 2 ? [i, j + 1] : [i - 1, j];
          const k = `${n[0]}:${n[1]}`;
          if (!seen.has(k)) { seen.add(k); q.push(n); }
        }
      }
      if (ok) out = cells;
    }
    this._room = out;
    return out;
  }
  sheltered(x, z) { return !!this.room(x, z); }
  // Inside your own house, the Use button lets you sleep (the game asks this when nothing else is in reach).
  bedTarget(pos) {
    if (!this.sheltered(pos.x, pos.z)) return null;
    if (!this._bed) this._bed = { type: 'house', x: 0, z: 0, y: 0 };
    this._bed.x = pos.x; this._bed.z = pos.z; this._bed.y = pos.y;
    return this._bed;
  }
  // roofs over you (and the roofs joined to them) hide, so you can see yourself indoors
  updateRoofs(pos) {
    const a = Math.floor(pos.x / G), b = Math.floor(pos.z / G);
    const key = `${a}:${b}:${this.version}`;
    if (key === this._roofKey) return;
    this._roofKey = key;
    const hide = new Set();
    if (this.roofAt(a, b)) {
      const q = [[a, b]], seen = new Set([`${a}:${b}`]);
      while (q.length && hide.size < 60) {
        const [i, j] = q.pop(); const r = this.roofAt(i, j);
        if (!r) continue;
        hide.add(r);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${i + di}:${j + dj}`; if (!seen.has(k)) { seen.add(k); q.push([i + di, j + dj]); } }
      }
    }
    const changed = [...this.hiddenRoofs].filter((r) => !hide.has(r)).concat([...hide].filter((r) => !this.hiddenRoofs.has(r)));
    this.hiddenRoofs = hide;
    for (const r of changed) this.setMatrix(r);
  }

  // ---------- the build bar ----------
  makeUI() {
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    const $ = (id) => document.getElementById(id);
    // the BUILD button goes first in the top bar's buttons
    const btn = document.createElement('button');
    btn.id = 'btn-build'; btn.className = 'icon-btn';
    btn.setAttribute('aria-pressed', 'false'); btn.title = 'Build (B)'; btn.setAttribute('aria-label', 'Build');
    btn.innerHTML = `${svgIcon('build')}<span>Build</span>`;
    const holder = document.querySelector('.sb-btns');
    if (holder) holder.prepend(btn); else document.body.appendChild(btn);
    btn.addEventListener('click', () => this.toggle());
    this.btn = btn;

    const bar = document.createElement('div');
    bar.id = 'build-bar'; bar.className = 'card'; bar.hidden = true;
    bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Build pieces');
    bar.innerHTML = `<div class="bb-have" aria-live="polite"><span>${icon('wood')}<b id="bb-wood">0</b></span><span>${icon('stone')}<b id="bb-stone">0</b></span></div>
      <div class="bb-list" id="bb-list">${PIECES.map((p) => `<button class="bb-item" data-kind="${p.id}" aria-pressed="false" title="${p.name}: ${p.desc} (${costText(p.cost)})">
        ${svgIcon(p.id)}<span class="bb-name">${p.name}</span><span class="bb-cost">${Object.entries(p.cost).map(([id, n]) => `<span data-need="${id}" data-n="${n}">${n}${icon(id)}</span>`).join('')}</span></button>`).join('')}
        <button class="bb-item remove" data-kind="remove" aria-pressed="false" title="Remove a piece (half the materials back)">${svgIcon('remove')}<span class="bb-name">Remove</span><span class="bb-cost"><span>½ back</span></span></button></div>
      <button id="bb-close" aria-label="Close the build bar" title="Close (B)">✕</button>`;
    document.body.appendChild(bar);
    this.bar = bar;
    bar.querySelectorAll('.bb-item').forEach((b) => b.addEventListener('click', () => this.choose(this.kind === b.dataset.kind ? null : b.dataset.kind)));
    $('bb-close').addEventListener('click', () => this.toggle(false));

    const ctl = document.createElement('div');
    ctl.id = 'build-ctl'; ctl.hidden = true;
    ctl.innerHTML = `<button class="bc-btn" id="bc-cancel" aria-label="Cancel" title="Cancel (Esc)">✕</button>
      <button class="bc-btn" id="bc-rot" aria-label="Rotate" title="Rotate (R)">${svgIcon('rotate')}</button>
      <button class="bc-btn" id="bc-place" aria-label="Place">${svgIcon('check')}<span id="bc-place-label">Place</span></button>
      <div class="bc-hint">Mouse aims · R rotates · Click places · Esc cancels</div>`;
    document.body.appendChild(ctl);
    this.ctl = ctl;
    const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); fn(); });
    tap('bc-cancel', () => this.choose(null));
    tap('bc-rot', () => this.rotate());
    tap('bc-place', () => this.place());
    this.placeBtn = $('bc-place'); this.placeLabel = $('bc-place-label');
  }

  toggle(on = !this.open) {
    if (on && (!this.isPlaying() || this.game.sleeping)) return;
    if (on === this.open) return;
    this.open = on;
    if (on && this.hud.craftOpen) this.hud.toggleCraft(false);
    this.bar.hidden = !on;
    this.btn.setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('build-open', on);
    if (!on) this.choose(null);
    this.refreshBar();
    this.audio.sfx('ui');
  }

  choose(kind) {
    if (kind && !this.open) this.toggle(true);
    this.kind = kind;
    this.bar.querySelectorAll('.bb-item').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
    this.ctl.hidden = !kind;
    this.sideLock = false;
    if (kind) {
      // start the ghost a few steps in front of you (or on the tutorial's plan)
      const pl = this.game.player;
      this.P.set(pl.pos.x + Math.sin(pl.facing) * 3, pl.pos.y, pl.pos.z + Math.cos(pl.facing) * 3);
      const m = kind !== 'remove' && this.magnet && this.magnet(kind, this.P.x, this.P.z, true);
      if (m) this.P.set(m.x, pl.pos.y, m.z);
      this.placeBtn.classList.toggle('remove', kind === 'remove');
      this.placeLabel.textContent = kind === 'remove' ? 'Remove' : 'Place';
      const b = this.bar.querySelector(`[data-kind="${kind}"]`);
      if (b) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    this.ghost.visible = false;
    this.slot = null;
  }

  rotate() {
    if (!this.kind || this.kind === 'remove') return;
    if (BY_ID[this.kind].slot === 'edge') { this.side = (this.side + 1) % 4; this.sideLock = true; this.lockCell = this.slot && this.slot.cell ? this.slot.cell.join(':') : ''; }
    else this.rot = (this.rot + 1) % 4;
    this.audio.sfx('ui');
  }

  place() {
    const g = this.game;
    if (!this.kind || g.sleeping) return;
    if (this.kind === 'remove') {
      const p = this.removeTarget;
      if (!p) { g.nope('Aim at a piece to remove it'); return; }
      const back = Object.entries(BY_ID[p.kind].cost).map(([id, n]) => [id, id === 'wood' ? Math.max(1, Math.floor(n / 2)) : Math.floor(n / 2)]).filter(([, n]) => n > 0);
      this.remove(p);
      for (const [id, n] of back) g.add(id, n);
      this.dust.emit(p.x, p.y + 0.6, p.z, { n: 12, speed: 2.2, colors: ['#cdb89a', '#a88a66'] });
      this.audio.sfx('chop');
      g.save();
      this.refreshBar();
      return;
    }
    const slot = this.slot;
    if (!slot) return;
    if (!slot.ok) { g.nope(slot.why); return; }
    const def = BY_ID[slot.kind];
    for (const [id, n] of Object.entries(def.cost)) g.take(id, n);
    const p = this.add(slot);
    if (!p) return;
    this.audio.sfx('build');
    this.dust.emit(p.x, p.y + 0.15, p.z, { n: 16, speed: 2.6, up: 1.2, colors: ['#d9c7a6', '#bfa47e', '#e8dcc4'], size: 0.13, spread: 1.0 });
    g.count('built_piece'); g.count('built_' + slot.kind);
    g.addXP(3);
    // the first time a room is closed in with a roof: it's a house!
    if (!g.counters.built_house && this.anyHouse()) {
      g.count('built_house');
      this.hud.news('A real house! It keeps you warm, and you can sleep inside after midnight', 'Home sweet home');
      g.addXP(20);
    }
    g.save();
    this.refreshBar();
    this.slot = null;   // worked out again next frame
    const nx = this.magnet && this.magnet(slot.kind, this.P.x, this.P.z, true);
    if (nx) this.P.set(nx.x, this.P.y, nx.z);
  }

  anyHouse() {
    for (const p of this.pieces.values()) if (p.kind === 'roof' && this.room(p.x, p.z)) return true;
    return false;
  }

  refreshBar() {
    if (!this.open) return;
    const g = this.game;
    const w = g.inv.wood || 0, s = g.inv.stone || 0;
    if (w !== this._w || s !== this._st) {
      this._w = w; this._st = s;
      document.getElementById('bb-wood').textContent = w; document.getElementById('bb-stone').textContent = s;
      this.bar.querySelectorAll('[data-need]').forEach((e) => { const ok = g.has(e.dataset.need, Number(e.dataset.n)); e.className = ok ? 'ok' : 'no'; });
    }
  }

  // ---------- controls ----------
  listen() {
    const typing = (e) => /input|select|textarea/i.test((e.target && e.target.tagName) || '');
    addEventListener('keydown', (e) => {
      if (typing(e) || !this.isPlaying()) return;
      if (e.code === 'KeyB' && !e.repeat) { this.toggle(); e.stopPropagation(); return; }
      if (!this.open) return;
      if (e.code === 'Escape') { if (this.kind) this.choose(null); else this.toggle(false); e.stopPropagation(); return; }
      if (this.kind && e.code === 'KeyR') { if (!e.repeat) this.rotate(); e.stopPropagation(); }
      // 1-7 pick a piece, 8 the remove tool
      const n = /^Digit([1-8])$/.exec(e.code);
      if (n) { const k = n[1] === '8' ? 'remove' : PIECES[Number(n[1]) - 1].id; this.choose(this.kind === k ? null : k); e.stopPropagation(); }
    }, true);
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.mouse.on = true; this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    });
    this.canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.mouse.on = false; });
    // a click on the world places the piece (instead of swinging at the air)
    addEventListener('mousedown', (e) => {
      if (!this.open || !this.kind || e.target !== this.canvas || e.button !== 0) return;
      e.stopPropagation();
      this.mouse.on = true; this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.aimMouse();
      if (this.kind === 'remove') this.updateRemove(); else this.slot = this.snap(this.kind, this.P.x, this.P.z);
      this.place();
    }, true);
    // phone: a finger on the right half of the screen slides the ghost (the left thumb still walks)
    const mine = (e) => [...e.changedTouches].every((t) => this.drag && t.identifier === this.drag.id);
    addEventListener('touchstart', (e) => {
      if (!this.open || !this.kind || e.target !== this.canvas || this.drag) return;
      const t = [...e.changedTouches].find((tt) => tt.clientX >= innerWidth * 0.5);
      if (!t) return;
      document.body.classList.add('touch');
      this.mouse.on = false;
      const hit = this.rayPlane(t.clientX, t.clientY, this.P.y);
      if (!hit) return;
      this.drag = { id: t.identifier, hx: hit.x, hz: hit.z, px: this.P.x, pz: this.P.z };
      if (e.changedTouches.length === 1) { e.stopPropagation(); e.preventDefault(); }
    }, { capture: true, passive: false });
    addEventListener('touchmove', (e) => {
      if (!this.drag) return;
      for (const t of e.changedTouches) if (t.identifier === this.drag.id) {
        const hit = this.rayPlane(t.clientX, t.clientY, this.P.y);
        if (hit) { this.P.x = this.drag.px + hit.x - this.drag.hx; this.P.z = this.drag.pz + hit.z - this.drag.hz; }
      }
      if (mine(e)) { e.stopPropagation(); e.preventDefault(); }
    }, { capture: true, passive: false });
    const end = (e) => {
      if (!this.drag) return;
      const all = mine(e);
      for (const t of e.changedTouches) if (t.identifier === this.drag.id) this.drag = null;
      if (all) e.stopPropagation();
    };
    addEventListener('touchend', end, true);
    addEventListener('touchcancel', end, true);
  }

  // where a screen point meets the flat plane at height y
  rayPlane(sx, sy, y) {
    this._v.set(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this._v, this.camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    if (Math.abs(d.y) < 1e-4) return null;
    const t = (y - o.y) / d.y;
    if (t < 0) return null;
    return { x: o.x + d.x * t, z: o.z + d.z * t };
  }
  // where a screen point meets the ground (steps along the ray, then narrows down)
  rayGround(sx, sy) {
    this._v.set(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this._v, this.camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction, h = this.world.heightAt;
    let t0 = 0, t1 = 0;
    for (let t = 1; t < 160; t += 1) { if (o.y + d.y * t < h(o.x + d.x * t, o.z + d.z * t)) { t1 = t; t0 = t - 1; break; } }
    if (!t1) return null;
    for (let k = 0; k < 12; k++) { const t = (t0 + t1) / 2; if (o.y + d.y * t < h(o.x + d.x * t, o.z + d.z * t)) t1 = t; else t0 = t; }
    const t = (t0 + t1) / 2;
    return { x: o.x + d.x * t, z: o.z + d.z * t };
  }
  aimMouse() {
    if (!this.mouse.on) return;
    const hit = this.rayGround(this.mouse.x, this.mouse.y);
    if (hit) this.P.set(hit.x, this.world.heightAt(hit.x, hit.z), hit.z);
  }

  // ---------- each frame ----------
  update(dt) {
    const pl = this.game.player;
    this.dust.update(dt);
    // the placing pop: a quick squash-and-bounce
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const q = this.pops[i]; q.t += dt;
      const s = q.t >= 0.6 ? 1 : 1 - 0.55 * Math.exp(-q.t * 9) * Math.cos(q.t * 24);
      this.setMatrix(q.p, s);
      if (q.t >= 0.6) this.pops.splice(i, 1);
    }
    this.updateRoofs(pl.pos);
    if (this.open && (this.hud.craftOpen || this.game.sleeping)) this.toggle(false);
    if (!this.open) { this.ghost.visible = false; return; }
    this.refreshBar();
    // the Rotate / Place buttons sit just above the bar, however tall it is
    const bh = this.bar.offsetHeight;
    if (bh !== this._bh) { this._bh = bh; this.ctl.style.bottom = `calc(${bh + 20}px + env(safe-area-inset-bottom, 0px))`; }
    if (!this.kind) { this.ghost.visible = false; return; }
    if (this.mouse.on && !this.drag) this.aimMouse();
    else if (!this.drag && Math.hypot(this.P.x - pl.pos.x, this.P.z - pl.pos.z) > 16) this.P.set(pl.pos.x + Math.sin(pl.facing) * 3, pl.pos.y, pl.pos.z + Math.cos(pl.facing) * 3);
    if (this.kind === 'remove') { this.updateRemove(); return; }
    const slot = this.snap(this.kind, this.P.x, this.P.z);
    if (this.sideLock && slot.cell && slot.cell.join(':') !== this.lockCell) this.sideLock = false;
    this.slot = slot;
    for (const [id, g] of Object.entries(this.ghostMeshes)) g.visible = id === slot.kind;
    this.ghost.visible = true;
    this.ghost.position.set(slot.x, slot.y + 0.01, slot.z);
    this.ghost.rotation.set(0, slot.rotY, 0);
    this.ghost.scale.setScalar(1.0);
    const pulse = 0.36 + Math.sin(performance.now() / 160) * 0.08;
    this.ghostMat.color.set(slot.ok ? '#7dff8a' : '#ff5a4a'); this.ghostMat.opacity = pulse;
    this.ghostLineMat.color.set(slot.ok ? '#e0ffe0' : '#ffd0c8');
    const bad = !slot.ok;
    if (bad !== this._bad) { this._bad = bad; this.placeBtn.classList.toggle('bad', bad); }
    if (slot.why !== this._why) { this._why = slot.why; this.placeBtn.title = slot.why || 'Place'; }
  }
  updateRemove() {
    let best = null, bd = 1.7;
    for (const p of this.pieces.values()) {
      const d = Math.hypot(p.x - this.P.x, p.z - this.P.z) - (p.kind === 'roof' ? 0.4 : 0);
      if (d < bd) { bd = d; best = p; }
    }
    this.removeTarget = best;
    this.slot = null;
    if (this._bad) { this._bad = false; this.placeBtn.classList.remove('bad'); }
    this.placeBtn.classList.toggle('bad', !best);
    if (!best) { this.ghost.visible = false; return; }
    for (const [id, g] of Object.entries(this.ghostMeshes)) g.visible = id === best.kind;
    this.ghost.visible = true;
    this.ghost.position.set(best.x, best.y + 0.01, best.z);
    this.ghost.rotation.set(0, best.rotY, 0);
    this.ghost.scale.setScalar(1.04);
    this.ghostMat.color.set('#ff5a4a'); this.ghostMat.opacity = 0.45;
    this.ghostLineMat.color.set('#ffd0c8');
  }

  // ---------- saving ----------
  serialize() {
    return [...this.pieces.values()].map((p) => [PIECES.findIndex((d) => d.id === p.kind), p.a, p.b, p.o, p.r, Math.round(p.y * 100) / 100]);
  }
  load(list) {
    if (!Array.isArray(list)) return;
    for (const it of list) {
      if (!Array.isArray(it) || !PIECES[it[0]]) continue;
      const [k, a, b, o, r, y] = it;
      if (![a, b, o, r, y].every(Number.isFinite)) continue;
      this.add({ kind: PIECES[k].id, a, b, o, r, y }, { fresh: false });
    }
    if (this.anyHouse()) this.game.counters.built_house = Math.max(1, this.game.counters.built_house || 0);
  }
  // test helper: build at a cell (side 0-3 for walls) using the normal rules; returns the piece or the reason
  test(kind, a, b, side = 0, r = 0) {
    const slot = BY_ID[kind].slot === 'edge'
      ? this.check({ kind, ...Object.fromEntries(['a', 'b', 'o'].map((k, i) => [k, this.sideEdge(a, b, side)[i]])), r: 0, cell: [a, b], side })
      : this.check({ kind, a, b, o: 0, r, cell: [a, b] });
    if (!slot.ok) return slot.why;
    this.slot = slot; this.kind = kind;
    this.place();
    this.kind = null;
    return this.pieces.get(this.keyOf({ kind, a: slot.a, b: slot.b, o: slot.o })) || 'not placed';
  }
}

function segDist(px, pz, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / l)) : 0;
  return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t));
}
