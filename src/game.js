// The survival game itself: what you carry, how you feel, what you can gather,
// craft and build, the story objectives, and saving.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { N, HALF, WATER_Y, SITE, cellX, FOREST, SWAMP, MOUNTAIN, SNOW, DESERT, COAST } from './world.js';
import { mulberry32, clamp } from './noise.js';
import { ITEMS, RECIPES, LEVELS } from './items.js';
import { Puffs } from './fx.js';

const TREE_KINDS = new Set(['oak', 'pine', 'snowpine', 'palm', 'swamp', 'dead']);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const SAVE_KEY = 'hearthwild-save-v1';
// rough radius of each building on the ground (for keeping clear of trees and rocks)
const FOOTPRINT = { campfire: 0.6, shelter: 1.4, cabin: 2.4, farm: 1.3, forge: 1.0 };

export const OBJECTIVES = [
  { text: 'Stretch, then take a look around.', done: (g) => g.counters.walked > 6 },
  { text: 'Gather 5 sticks. The forest won\'t mind.', done: (g) => g.counters.stick >= 5, goal: (g) => [g.counters.stick, 5] },
  { text: 'Find a sharp stone by the pond.', done: (g) => g.counters.stone >= 1 },
  { text: 'Pull long grass to twist into fiber.', done: (g) => g.counters.fiber >= 1 },
  { text: 'Craft a stone axe: stick, stone, fiber.', done: (g) => g.has('axe') || g.counters.crafted_axe > 0 },
  { text: 'Craft a torch for the night: 1 stick, 1 fiber.', done: (g) => g.has('torch') },
  { text: 'Eat some berries. Your belly is grumbling.', done: (g) => g.counters.ate_berries > 0 },
  { text: 'Sip some fresh water from the pond.', done: (g) => g.counters.drank > 0 },
  { text: 'Chop a tree for wood. Timber!', done: (g) => g.counters.wood >= 2, goal: (g) => [Math.min(g.counters.wood, 2), 2] },
  { text: 'Build a campfire before night falls.', done: (g) => g.counters.built_campfire > 0 },
  { text: 'Build a lean-to shelter. Bedtime needs a bed.', done: (g) => g.counters.built_shelter > 0 || g.counters.built_house > 0 },   // Forge: building (a built house counts)
  { text: 'Make it to morning by your fire. No fainting!', done: (g) => g.counters.nights > 0 },
  { text: 'Hunt a Puffhop for meat. Sorry, Puffhop.', done: (g) => g.counters.kill_puffhop > 0 },
  { text: 'Cook meat on your campfire.', done: (g) => g.counters.cooked > 0 },
  { text: 'Defeat a Briarlurk. Dodge when it glows!', done: (g) => g.counters.kill_thornmaw > 0 },
  { text: 'Reach level 4 and build a log cabin.', done: (g) => g.counters.built_cabin > 0 },
  { text: 'Build a farm plot and plant berries.', done: (g) => g.counters.planted > 0 },
  { text: 'Harvest your first crop. Farmer life!', done: (g) => g.counters.harvested > 0 },
  { text: 'Head north to Greycrag Peaks. Mine iron ore with a pick.', done: (g) => g.counters.ore >= 2 },
  { text: 'Build a forge and smelt an iron bar.', done: (g) => g.counters.smelted > 0 },
  { text: 'Forge an iron sword. Ooh, shiny.', done: (g) => g.has('ironsword') },
  { text: 'Forge iron armor.', done: (g) => g.has('armour') },
  { text: 'Far off, past the stone path, a lantern glows.', done: () => false },
];

// ---------- small meshes for things you can pick up ----------
function g0(geo, color, pos, rot = [0, 0, 0], scl = [1, 1, 1]) {
  const g = (geo.index ? geo.toNonIndexed() : geo); g.deleteAttribute('uv');
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) arr.set([c.r, c.g, c.b], k * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scl)));
  return g;
}
const pickupGeos = () => ({
  stick: mergeGeometries([
    g0(new THREE.CylinderGeometry(0.035, 0.045, 0.9, 5), '#7a5230', [0, 0.05, 0], [0, 0, Math.PI / 2]),
    g0(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 4), '#7a5230', [0.15, 0.08, 0.08], [0.6, 0, Math.PI / 2.6]),
  ]),
  stone: mergeGeometries([g0(new THREE.DodecahedronGeometry(0.14, 0), '#a7a39a', [0, 0.08, 0], [0.4, 0.3, 0], [1.2, 0.7, 1])]),
  fiber: mergeGeometries([0, 1, 2, 3, 4, 5, 6].map((k) =>
    g0(new THREE.ConeGeometry(0.05, 0.9 + (k % 3) * 0.2, 3), k % 2 ? '#c8d878' : '#a8c860', [Math.cos(k) * 0.12, 0.45, Math.sin(k) * 0.12], [Math.cos(k * 2) * 0.25, 0, Math.sin(k * 2) * 0.25]))),
});

// A pool of copies of one small mesh. Only slots up to the highest one in use are drawn
// (mesh.count), and new copies take the lowest free slot so the used slots stay packed.
const _m4 = new THREE.Matrix4(), _p3 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
class DynInst {
  constructor(scene, geo, mat, cap, cast = true) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    for (let k = 0; k < cap; k++) this.mesh.setMatrixAt(k, ZERO);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = cast; this.mesh.receiveShadow = true;
    this.used = new Uint8Array(cap);
    this.hi = 0;           // one past the highest used slot
    this.low = 0;          // no free slot below this one
    this.mesh.count = 0;
    scene.add(this.mesh);
  }
  add(x, y, z, rot = 0, s = 1, color) {
    const cap = this.used.length;
    let slot = this.low;
    while (slot < cap && this.used[slot]) slot++;
    if (slot >= cap) return -1;
    this.used[slot] = 1; this.low = slot + 1;
    if (slot >= this.hi) { this.hi = slot + 1; this.mesh.count = this.hi; }
    this.mesh.setMatrixAt(slot, _m4.compose(_p3.set(x, y, z), _q.setFromAxisAngle(_up, rot), _s3.set(s, s, s)));
    if (color) { this.mesh.setColorAt(slot, color); this.mesh.instanceColor.needsUpdate = true; }
    this.mesh.instanceMatrix.needsUpdate = true;
    return slot;
  }
  remove(slot) {
    if (slot < 0 || !this.used[slot]) return;
    this.used[slot] = 0;
    if (slot < this.low) this.low = slot;
    this.mesh.setMatrixAt(slot, ZERO); this.mesh.instanceMatrix.needsUpdate = true;
    while (this.hi > 0 && !this.used[this.hi - 1]) this.hi--;
    this.mesh.count = this.hi;
  }
}

// A dropped bag (left where you passed out). Use it to pick everything back up.
function buildBag() {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: '#a8794a', roughness: 1 });
  const tie = new THREE.MeshStandardMaterial({ color: '#5e3a1e', roughness: 1 });
  const sack = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), cloth); sack.scale.set(1, 0.8, 0.9); sack.position.y = 0.22;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.14, 8), cloth); neck.position.y = 0.48;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.025, 4, 10), tie); band.rotation.x = Math.PI / 2; band.position.y = 0.45;
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.1, 6), cloth); top.position.y = 0.58; top.rotation.x = Math.PI;
  g.add(sack, neck, band, top);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

// ---------- buildings ----------
function buildCampfire() {
  const g = new THREE.Group();
  const stoneM = new THREE.MeshStandardMaterial({ color: '#8d8a82', roughness: 1 });
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), stoneM);
    s.position.set(Math.cos(a) * 0.5, 0.08, Math.sin(a) * 0.5); s.scale.set(1.1, 0.7, 1); s.rotation.y = a;
    s.castShadow = true; g.add(s);
  }
  const logM = new THREE.MeshStandardMaterial({ color: '#6b4528', roughness: 1 });
  for (let k = 0; k < 3; k++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.75, 6), logM);
    l.rotation.z = Math.PI / 2 - 0.35; l.rotation.y = k * 2.1; l.position.y = 0.16; l.castShadow = true; g.add(l);
  }
  const flame = new THREE.Group(); flame.position.y = 0.18;
  const fl = (c, r, h, y) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95 })); m.position.y = y; flame.add(m); return m; };
  const outer = fl('#ff7a1a', 0.26, 0.75, 0.3), mid = fl('#ffb02e', 0.17, 0.55, 0.26), core = fl('#fff0a0', 0.08, 0.32, 0.18);
  g.add(flame);
  return { g, flame, cones: [outer, mid, core] };
}

function buildShelter() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 1 });
  const leaf = new THREE.MeshStandardMaterial({ color: '#4f8a35', roughness: 1 });
  const leaf2 = new THREE.MeshStandardMaterial({ color: '#6aa040', roughness: 1 });
  const bed = new THREE.MeshStandardMaterial({ color: '#b0a060', roughness: 1 });
  for (const x of [-1.1, 1.1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.7, 5), wood); p.position.set(x, 0.85, 0.7); p.castShadow = true; g.add(p);
  }
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 5), wood); ridge.rotation.z = Math.PI / 2; ridge.position.set(0, 1.68, 0.7); g.add(ridge);
  // sloped roof of leafy rows from the ridge down to the ground at the back
  for (let r = 0; r < 6; r++) {
    const t = (r + 0.5) / 6;
    const row = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.42), r % 2 ? leaf : leaf2);
    row.position.set(0, 1.68 - t * 1.6, 0.7 - t * 1.5); row.rotation.x = -0.82; row.castShadow = true; row.receiveShadow = true;
    g.add(row);
  }
  const mat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.0), bed); mat.position.set(0, 0.05, 0.1); g.add(mat);
  return { g };
}

// A small log cabin you build yourself (about 4 x 3.4 m), with a glowing window at night.
function buildPlayerCabin() {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...o });
  const log1 = M('#8b5a35'), log2 = M('#7a4c2c'), stone = M('#8f8a7f'), roof1 = M('#a8552f'), roof2 = M('#934a29'), dark = M('#4a2e1c');
  const glass = M('#1f2430', { emissive: '#ffb45e', emissiveIntensity: 0.1 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(4.3, 0.3, 3.7), stone, 0, 0.15, 0);
  for (let k = 0; k < 6; k++) {
    const y = 0.47 + k * 0.33, m = k % 2 ? log1 : log2;
    add(new THREE.CylinderGeometry(0.17, 0.17, 4.2, 7), m, 0, y, 1.6, 0, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.17, 0.17, 4.2, 7), m, 0, y, -1.6, 0, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.17, 0.17, 3.5, 7), m, 1.95, y + 0.16, 0, Math.PI / 2, 0, 0);
    add(new THREE.CylinderGeometry(0.17, 0.17, 3.5, 7), m, -1.95, y + 0.16, 0, Math.PI / 2, 0, 0);
  }
  const top = 0.47 + 5 * 0.33 + 0.17;
  const tri = new THREE.Shape([new THREE.Vector2(-1.8, 0), new THREE.Vector2(1.8, 0), new THREE.Vector2(0, 1.25)]);
  const gable = new THREE.ExtrudeGeometry(tri, { depth: 0.25, bevelEnabled: false });
  add(gable, log1, 1.85, top, 0, 0, Math.PI / 2, 0);
  add(gable.clone(), log1, -2.1, top, 0, 0, Math.PI / 2, 0);
  const a = 0.6, span = 2.45;
  for (const side of [1, -1]) for (let r = 0; r < 4; r++) {
    const d = (r + 0.5) / 4 * span;
    add(new THREE.BoxGeometry(4.8, 0.13, span / 4 + 0.07), r % 2 ? roof1 : roof2, 0, top + 1.35 - Math.sin(a) * d, side * Math.cos(a) * d, side * a, 0, 0);
  }
  add(new THREE.BoxGeometry(0.85, 1.6, 0.12), dark, -0.8, 0.3 + 0.8, 1.79);
  add(new THREE.BoxGeometry(0.9, 0.8, 0.14), dark, 0.9, 1.25, 1.77);
  const win = add(new THREE.BoxGeometry(0.7, 0.6, 0.16), glass, 0.9, 1.25, 1.79);
  win.castShadow = false;
  add(new THREE.BoxGeometry(0.06, 0.62, 0.2), dark, 0.9, 1.25, 1.8);
  add(new THREE.BoxGeometry(0.72, 0.06, 0.2), dark, 0.9, 1.25, 1.8);
  // its window light is borrowed from a pool made at start-up (a new light would freeze the game)
  return { g, glass, lightAt: new THREE.Vector3(0.5, 1.4, 2.6), lightColor: '#ffb35a', lightDist: 7, lightDecay: 1.7 };
}

// A tilled farm plot. Crops grow through four stages.
function buildFarm() {
  const g = new THREE.Group();
  const soil = new THREE.MeshStandardMaterial({ color: '#5a3d27', roughness: 1 });
  const ridge = new THREE.MeshStandardMaterial({ color: '#6b4a30', roughness: 1 });
  const wood = new THREE.MeshStandardMaterial({ color: '#8b5a35', roughness: 1 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 1.8), soil); b.position.y = 0.1; b.receiveShadow = true; g.add(b);
  for (let r = 0; r < 3; r++) { const m = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.3), ridge); m.position.set(0, 0.22, -0.55 + r * 0.55); g.add(m); }
  for (const [x, z, w, d] of [[0, 0.95, 2.4, 0.1], [0, -0.95, 2.4, 0.1], [1.15, 0, 0.1, 1.9], [-1.15, 0, 0.1, 1.9]]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, d), wood); e.position.set(x, 0.14, z); e.castShadow = true; g.add(e);
  }
  const plants = [];
  const leaf = new THREE.MeshStandardMaterial({ color: '#5fa83e', roughness: 0.9 });
  const berry = new THREE.MeshStandardMaterial({ color: '#d23a4a', roughness: 0.7 });
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) {
    const p = new THREE.Group(); p.position.set(-0.75 + k * 0.5, 0.25, -0.55 + r * 0.55);
    const stem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), leaf); stem.position.y = 0.12; stem.castShadow = true;
    const fruit = new THREE.Group();
    for (let f = 0; f < 3; f++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), berry); m.position.set(Math.cos(f * 2.1) * 0.12, 0.2, Math.sin(f * 2.1) * 0.12); fruit.add(m); }
    p.add(stem, fruit); g.add(p); plants.push({ p, stem, fruit });
  }
  return { g, plants };
}

// A stone forge with glowing coals.
function buildForge() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#7d7870', roughness: 1 });
  const stone2 = new THREE.MeshStandardMaterial({ color: '#6a655e', roughness: 1 });
  const iron = new THREE.MeshStandardMaterial({ color: '#3d3f44', roughness: 0.6, metalness: 0.4 });
  const coal = new THREE.MeshStandardMaterial({ color: '#2a1a10', emissive: '#ff6a1a', emissiveIntensity: 1.5 });
  for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.4 - k * 0.12, 0.3, 1.2 - k * 0.1), k % 2 ? stone : stone2); m.position.y = 0.15 + k * 0.3; m.castShadow = m.receiveShadow = true; g.add(m); }
  const pit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.55), coal); pit.position.y = 1.22; g.add(pit);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.3, 0.45), stone2); chimney.position.set(0, 1.9, -0.4); chimney.castShadow = true; g.add(chimney);
  const anvil = new THREE.Group(); anvil.position.set(1.3, 0, 0.2);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 0.3), iron); base.position.y = 0.22;
  const topA = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.18, 0.3), iron); topA.position.y = 0.53;
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 5), iron); horn.rotation.z = -Math.PI / 2; horn.position.set(0.45, 0.53, 0);
  anvil.add(base, topA, horn); anvil.traverse((m) => { if (m.isMesh) m.castShadow = true; }); g.add(anvil);
  return { g, coal, lightAt: new THREE.Vector3(0, 1.6, 0.3), lightColor: '#ff7a2a', lightDist: 5, lightDecay: 1.8 };
}

export class Game {
  constructor({ scene, world, player, sky, weather, creatures, audio, hud, heightTex }) {
    Object.assign(this, { scene, world, player, sky, weather, creatures, audio, hud });
    this.inv = {};
    this.stats = { health: 100, food: 80, water: 80, warmth: 90, energy: 90 };
    this.xp = 0; this.level = 1;
    this.counters = { walked: 0, stick: 0, stone: 0, fiber: 0, wood: 0, ore: 0, iron: 0, drank: 0, cooked: 0, nights: 0 };
    this.objective = 0;
    this.structures = [];
    this.chopped = new Set();
    this.cell = new Map();
    this.rnd = mulberry32(8080);
    this.target = null;
    this.busy = 0;
    this.sleeping = 0;
    this.lastHour = sky.hour;
    this.wasNight = false;
    this.respawn = { x: SITE.spawn.x, z: SITE.spawn.z };
    this.events = [];

    // dynamic meshes for pickups, empty bushes and stumps
    const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const geos = pickupGeos();
    this.dyn = {
      stick: new DynInst(scene, geos.stick, vc, 1500, false),
      stone: new DynInst(scene, geos.stone, vc, 1500, false),
      fiber: new DynInst(scene, geos.fiber, world.mats.grassMat, 1200, false),
      emptyBush: new DynInst(scene, world.kinds.bush[0], world.mats.bushMat, 400),
      berryBush: new DynInst(scene, world.kinds.bush[1], world.mats.bushMat, 20),
      stump: new DynInst(scene, world.kinds.stump[0], world.mats.rockMat, 600),
    };
    // a ring that marks what you are about to use
    this.marker = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 4, 20), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.85 }));
    this.marker.rotation.x = Math.PI / 2; this.marker.visible = false;
    scene.add(this.marker);
    // two lights shared by the nearest burning campfires (kept in the scene from the start)
    this.fireLights = [0, 1].map(() => { const l = new THREE.PointLight('#ff9a3a', 0, 11, 1.6); scene.add(l); return l; });
    // two more lights for the nearest cabin windows and forges. All lights exist from the start
    // (at zero brightness): adding a light later makes every material rebuild and the game freezes.
    this.buildLights = [0, 1].map(() => { const l = new THREE.PointLight('#ffb35a', 0, 7, 1.7); scene.add(l); return l; });
    this.bags = [];          // bags dropped where you passed out
    this.fainted = false;
    this.clock = 0;          // seconds of play, for spacing out repeated messages
    this.said = new Map();   // message -> when it was last shown
    // reused every frame (no new objects in the main loop)
    this._fires = []; this._burning = []; this._buildLit = []; this._evs = [];
    this._ret = { danger: 0, nearFire: 0, inShelter: false };
    this._sleepRet = { danger: 0, nearFire: 0, inShelter: false };
    this._mA = new THREE.Matrix4(); this._mB = new THREE.Matrix4();
    this._byDist = (a, b) => a._d - b._d;
    this.embers = new Puffs({ count: 24, origin: new THREE.Vector3(0, -50, 0), rise: 2.2, spread: 0.5, life: 1.6, size: 0.35, opacity: 0.9, color: '#ffb040', pixelScale: 1, seed: 12 });
    scene.add(this.embers.mesh);

    this.scatter();
    this.indexThings();
  }

  // ---------- inventory ----------
  has(id, n = 1) { return (this.inv[id] || 0) >= n; }
  add(id, n = 1, quiet = false) {
    this.inv[id] = (this.inv[id] || 0) + n;
    if (this.counters[id] !== undefined) this.counters[id] += n;
    if (!quiet) this.hud.toast(`+${n} ${ITEMS[id].name}`, id);
    this.hud.dirty = true;
  }
  take(id, n = 1) { this.inv[id] = Math.max(0, (this.inv[id] || 0) - n); if (!this.inv[id]) delete this.inv[id]; this.hud.dirty = true; }
  count(key) { this.counters[key] = (this.counters[key] || 0) + 1; }
  // A "can't do that" message: shown (with its sound) at most once every 0.6 s, so holding Use does not spam.
  nope(text, sound = true) {
    const last = this.said.get(text);
    if (last !== undefined && this.clock - last < 0.6) return;
    this.said.set(text, this.clock);
    this.hud.toast(text);
    if (sound) this.audio.sfx('ui');
  }

  addXP(n) {
    this.xp += n;
    while (this.level < LEVELS.length - 1 && this.xp >= LEVELS[this.level + 1]) {
      this.level++;
      this.audio.sfx('levelup');
      const unlocked = RECIPES.filter((r) => r.level === this.level && !r.soon).map((r) => r.name);
      this.hud.banner(`Level ${this.level}!`, unlocked.length ? `New to craft: ${unlocked.join(', ')}` : 'You feel stronger. Flex a little.');
      this.stats.health = Math.min(100, this.stats.health + 20);
    }
    this.hud.dirty = true;
  }

  // Maverick: combat. Weapon damage per hit (before combo multipliers) and reach in metres.
  // Fixed objects, so combat.js can read them every frame without making new ones.
  static WEAPONS = {
    ironsword: Object.freeze({ id: 'ironsword', dmg: 26, reach: 2.15 }),
    spear: Object.freeze({ id: 'spear', dmg: 16, reach: 2.6 }),
    axe: Object.freeze({ id: 'axe', dmg: 12, reach: 1.85 }),
    fist: Object.freeze({ id: 'fist', dmg: 5, reach: 1.45 }),
  };
  get weapon() {
    const W = Game.WEAPONS;
    return this.has('ironsword') ? W.ironsword : this.has('spear') ? W.spear : this.has('axe') ? W.axe : W.fist;
  }

  // ---------- the world's resources ----------
  key(x, z) { return Math.floor(x / 4) * 1000 + Math.floor(z / 4); }
  register(o) { const k = this.key(o.x, o.z); if (!this.cell.has(k)) this.cell.set(k, []); this.cell.get(k).push(o); }
  unregister(o) { const l = this.cell.get(this.key(o.x, o.z)); if (l) { const i = l.indexOf(o); if (i >= 0) l.splice(i, 1); } }

  scatter() {
    const w = this.world, r = this.rnd;
    this.pickups = [];
    const put = (type, x, z) => {
      const y = w.heightAt(x, z);
      if (y < WATER_Y + 0.05) return;
      const o = { type: 'pickup', item: type, x, z, y, rot: r() * 6, s: 0.85 + r() * 0.3, slot: -1, alive: true, back: 0 };
      o.slot = this.dyn[type].add(x, y, z, o.rot, o.s);
      if (o.slot < 0) return;
      this.pickups.push(o); this.register(o);
    };
    // near the start, so the first steps are easy
    const s = SITE.spawn;
    [[2.5, 3], [-1.5, 4], [4, -1], [-3, 2], [6, 3.5], [1, 6.5], [-5, 5], [7.5, 0.5]].forEach(([dx, dz]) => put('stick', s.x + dx, s.z + dz));
    [[-1.2, 2.2], [1.8, 2.8], [-2.8, 0.6]].forEach(([dx, dz]) => put('stone', SITE.pond.x - 6 + dx, SITE.pond.z + 2 + dz));
    [[3.5, 5], [-3.5, 6.5], [6, 6], [0, 8]].forEach(([dx, dz]) => put('fiber', s.x + dx, s.z + dz));
    // across the island
    for (const t of w.things) {
      if (TREE_KINDS.has(t.kind) && t.kind !== 'palm' && r() < 0.3) {
        const a = r() * 6.28, d = 1 + r() * 1.5;
        put('stick', t.x + Math.cos(a) * d, t.z + Math.sin(a) * d);
      }
    }
    for (let j = 4; j < N - 4; j += 2) for (let i = 4; i < N - 4; i += 2) {
      const k = j * N + i;
      if (w.levels[k] <= 0 || w.reserved[k]) continue;
      const b = w.primary[k], gr = w.ground[k];
      const x = cellX(i) + r() * 2 - 1, z = cellX(j) + r() * 2 - 1;
      const pStone = b === MOUNTAIN || b === SNOW ? 0.05 : b === DESERT ? 0.025 : 0.018;
      if (r() < pStone) put('stone', x, z);
      else if (gr === 0 && (b === FOREST || b === COAST || b === SWAMP) && r() < 0.03) put('fiber', x, z);
    }
    // three berry bushes close to the start
    this.extraBushes = [[-1.8, 6.2], [5.2, 5.6], [-6.2, 3.4]].map(([dx, dz]) => {
      const x = s.x + dx, z = s.z + dz, y = w.heightAt(x, z);
      return { kind: 'bush', variant: 1, x, z, y, rot: r() * 6, scale: 1, extra: true, slot: this.dyn.berryBush.add(x, y - 0.03, z, r() * 6, 1) };
    });
  }

  indexThings() {
    const w = this.world;
    const list = [...w.things, ...this.extraBushes];
    list.forEach((t, idx) => {
      t.id = idx;
      if (TREE_KINDS.has(t.kind)) { t.type = 'tree'; t.hits = 0; }
      else if (t.kind === 'bush' && t.variant === 1) { t.type = 'berries'; t.ready = true; t.back = 0; }
      else if (t.kind === 'orerock') { t.type = 'ore'; t.hits = 0; t.cool = 0; }
      else if (t.kind.includes('rock') && t.scale > 0.65) { t.type = 'rock'; t.hits = 0; t.cool = 0; }
      else return;
      t.y = w.heightAt(t.x, t.z);
      this.register(t);
    });
    this.allThings = list;
  }

  setThingVisible(t, on) {
    if (t.extra) {
      if (on && t.slot < 0) t.slot = this.dyn.berryBush.add(t.x, t.y - 0.03, t.z, t.rot, 1);
      if (!on && t.slot >= 0) { this.dyn.berryBush.remove(t.slot); t.slot = -1; }
      return;
    }
    const mesh = t.batch.mesh;
    mesh.setMatrixAt(t.index, on ? t.batch.m[t.index] : ZERO);
    mesh.instanceMatrix.needsUpdate = true;
  }

  removeObstacle(t) {
    if (!t.ob) return;
    for (const l of this.world.obstacles.values()) { const i = l.indexOf(t.ob); if (i >= 0) { l.splice(i, 1); break; } }
    t.ob = null;
  }

  fellTree(t, quiet = false) {
    t.type = 'stump';
    this.unregister(t);
    this.setThingVisible(t, false);
    this.removeObstacle(t);
    this.dyn.stump.add(t.x, t.y - 0.02, t.z, t.rot, Math.min(1.2, t.scale));
    this.chopped.add(t.id);
    if (!quiet) {
      const wood = 2 + Math.floor(this.rnd() * 2);
      this.add('wood', wood); this.add('stick', 1);
      this.addXP(6);
    }
  }

  // ---------- what is in front of you ----------
  nearWater() {
    const p = this.player.pos;
    for (let a = 0; a < 8; a++) {
      const x = p.x + Math.cos(a * 0.785) * 1.4, z = p.z + Math.sin(a * 0.785) * 1.4;
      if (this.world.heightAt(x, z) < WATER_Y - 0.08) return true;
    }
    return this.world.heightAt(p.x, p.z) < WATER_Y - 0.02;
  }

  findTarget() {
    const p = this.player.pos;
    const fx = Math.sin(this.player.facing), fz = Math.cos(this.player.facing);
    let best = null, bs = 1e9;
    const consider = (o, dist, reach) => {
      if (dist > reach) return;
      const dx = o.x - p.x, dz = o.z - p.z;
      const facing = dist > 0.3 ? (dx * fx + dz * fz) / dist : 1;
      // prefer things you can pick up, and things you can actually use right now
      const d = this.describe(o);
      const score = dist - facing * 0.6 + (o.type === 'pickup' || o.type === 'bag' ? -0.5 : 0) + (['shelter', 'campfire', 'cabin', 'farm', 'forge'].includes(o.type) ? -0.7 : 0) + (d && !d.ok ? 0.9 : 0);
      if (score < bs) { bs = score; best = o; }
    };
    const ci = Math.floor(p.x / 4), cj = Math.floor(p.z / 4);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const l = this.cell.get((ci + di) * 1000 + cj + dj);
      if (!l) continue;
      for (const o of l) {
        if ((o.type === 'pickup' || o.type === 'bag') && !o.alive) continue;
        if (o.type === 'berries' && !o.ready) continue;
        // Maverick: feel. Right after a pickup, the next one nearby is in reach (the explorer steps to it)
        const chain = this.chainT > 0 && (o.type === 'pickup' || o.type === 'berries') ? 0.9 : 0;
        const reach = o.type === 'tree' ? 1.5 + o.scale * 0.3 : o.type === 'rock' || o.type === 'ore' ? 1.3 + o.scale * 0.4 : 1.5 + chain;
        consider(o, Math.hypot(o.x - p.x, o.z - p.z), reach);
      }
    }
    for (const s of this.structures) consider(s, Math.hypot(s.x - p.x, s.z - p.z), { shelter: 2.4, cabin: 3.2, farm: 1.9, forge: 2.0 }[s.type] || 1.9);
    if (!best && this.nearWater()) best = { type: 'water', x: p.x + fx, z: p.z + fz, y: WATER_Y };
    if (!best && this.build) best = this.build.bedTarget(p);   // Forge: building (inside your own house: sleep)
    return best;
  }

  // what pressing the action button would do right now
  describe(t) {
    if (!t) return null;
    switch (t.type) {
      case 'pickup': return { label: `Pick up ${ITEMS[t.item].name.toLowerCase()}`, short: 'Grab', ok: true };
      case 'bag': return { label: 'Grab your dropped bag', short: 'Grab', ok: true };
      case 'berries': return { label: 'Pick berries', short: 'Pick', ok: true };
      case 'tree': return this.has('axe') ? { label: 'Chop this tree', short: 'Chop', ok: true } : { label: 'Bark beats fists. Craft a stone axe', ok: false };
      case 'rock': return this.has('pick') || this.has('axe') ? (t.cool > 0 ? { label: 'All cracked out. Try another rock', ok: false } : { label: 'Break rock for stone', short: 'Break', ok: true }) : { label: 'Rocks beat fists. Craft an axe or pick', ok: false };
      case 'water': return { label: 'Drink water', short: 'Drink', ok: true };
      case 'campfire':
        if (this.has('meat') && t.fuel > 0) return { label: 'Cook meat', short: 'Cook', ok: true };
        if (this.has('wood')) return { label: 'Feed the fire some wood', short: 'Add wood', ok: true };
        if (this.has('stick')) return { label: 'Feed the fire a stick', short: 'Add stick', ok: true };
        return { label: t.fuel > 0 ? 'Toasty! Bring sticks or wood to feed it' : 'Fire\'s out. Gather sticks to relight it', ok: false };
      case 'shelter': return { label: 'Sleep till morning', short: 'Sleep', ok: true };
      case 'cabin': return { label: 'Sleep in your cozy cabin', short: 'Sleep', ok: true };
      case 'house': return { label: 'Sleep in your house', short: 'Sleep', ok: true };   // Forge: building
      case 'ore':
        if (!this.has('pick')) return { label: 'Iron ore! Craft a stone pick to mine it', ok: false };
        return t.cool > 0 ? { label: 'Mined out. Check back later', ok: false } : { label: 'Mine iron ore', short: 'Mine', ok: true };
      case 'farm':
        if (t.stage < 0) return this.has('berries') ? { label: 'Plant berries', short: 'Plant', ok: true } : { label: 'No berries to plant. Go pick some', ok: false };
        if (t.stage >= 3) return { label: 'Harvest berries', short: 'Harvest', ok: true };
        return { label: ['Sprouting! Come back later', 'Growing nicely. Come back later', 'Almost ripe. Come back soon!'][t.stage], ok: false };
      case 'forge':
        return this.has('ore', 2) && this.has('wood') ? { label: 'Smelt an iron bar (2 ore, 1 wood)', short: 'Smelt', ok: true }
          : { label: 'Bring 2 iron ore and 1 wood to smelt', ok: false };
    }
    return null;
  }

  act() {
    if (this.busy > 0 || this.sleeping) return;
    const t = this.target;
    const d = this.describe(t);
    if (!d) return;
    if (!d.ok) { this.nope(d.label); return; }
    const pl = this.player;
    pl.face(t.x, t.z);
    switch (t.type) {
      case 'pickup':
        pl.animate('bend'); this.busy = 0.35;
        this.chainT = 0.9;   // Maverick: feel. Next pickups in the pile are in reach for a moment (tap-tap-tap)
        t.alive = false; this.dyn[t.item].remove(t.slot); t.slot = -1; t.back = 240;
        this.add(t.item, 1); this.addXP(2); this.audio.sfx(t.item === 'stone' ? 'stone' : 'pick');
        break;
      case 'bag': {
        pl.animate('bend'); this.busy = 0.4;
        t.alive = false; this.scene.remove(t.g); this.unregister(t);
        this.bags.splice(this.bags.indexOf(t), 1);
        let n = 0;
        for (const [id, k] of Object.entries(t.items)) { this.add(id, k, true); n += k; }
        this.hud.toast(`Got your stuff back. Phew! (+${n})`);
        this.audio.sfx('pick');
        this.save();
        break;
      }
      case 'berries':
        pl.animate('bend'); this.busy = 0.4;
        this.chainT = 0.9;   // Maverick: feel
        t.ready = false; t.back = 300;
        this.setThingVisible(t, false);
        t.empty = this.dyn.emptyBush.add(t.x, t.y - 0.03, t.z, t.rot, t.scale);
        this.add('berries', 2 + Math.floor(this.rnd() * 2)); this.addXP(2); this.audio.sfx('pick');
        break;
      // Maverick: feel. The hit (sound, shake, chips, the tree falling, the stone) lands when the tool does.
      case 'tree': {
        this.busy = 0.5;
        t.hits++;
        const need = this.has('pick') ? 4 : 4;
        const fell = t.hits >= need + Math.round(t.scale);
        pl.animate('swing', () => {
          t.shake = 0.4; this.audio.sfx('chop');
          if (this.combat) this.combat.gatherHit(t.x, t.y ?? this.world.heightAt(t.x, t.z), t.z, 'tree', fell);
          if (fell && t.type === 'tree') this.fellTree(t);
          this.hud.dirty = true;
        });
        break;
      }
      case 'rock': {
        this.busy = 0.5;
        t.hits++;
        const done = t.hits >= (this.has('pick') ? 2 : 4);
        if (done) { t.hits = 0; t.cool = 90; }
        pl.animate('swing', () => {
          this.audio.sfx('stone');
          if (this.combat) this.combat.gatherHit(t.x, t.y ?? this.world.heightAt(t.x, t.z), t.z, 'stone', done);
          if (done) { this.add('stone', 2); this.addXP(4); }
          this.hud.dirty = true;
        });
        break;
      }
      case 'water':
        pl.animate('bend'); this.busy = 0.5;
        this.stats.water = Math.min(100, this.stats.water + 25); this.count('drank'); this.audio.sfx('drink');
        this.hud.toast('Ahh. Cold, fresh and free');
        break;
      case 'campfire':
        pl.animate('bend'); this.busy = 0.4;
        if (this.has('meat') && t.fuel > 0) { this.take('meat'); this.add('cooked'); this.count('cooked'); this.addXP(3); this.audio.sfx('fire'); }
        else if (this.has('wood')) { this.take('wood'); t.fuel = Math.min(10, t.fuel + 3); this.audio.sfx('fire'); this.hud.toast('Whoosh! The fire roars back'); }
        else if (this.has('stick')) { this.take('stick'); t.fuel = Math.min(10, t.fuel + 1.2); this.audio.sfx('fire'); }
        break;
      case 'shelter': case 'cabin': this.trySleep(t); break;
      case 'house': this.respawn = { x: t.x, z: t.z }; this.trySleep(t); break;   // Forge: building (you wake here)
      case 'ore': {   // Maverick: feel (the hit lands with the pick)
        this.busy = 0.5; t.hits++;
        const done = t.hits >= 3;
        if (done) { t.hits = 0; t.cool = 150; }
        pl.animate('swing', () => {
          this.audio.sfx('stone');
          if (this.combat) this.combat.gatherHit(t.x, t.y ?? this.world.heightAt(t.x, t.z), t.z, 'stone', done);
          if (done) { this.add('ore', 2); this.addXP(8); }
          this.hud.dirty = true;
        });
        break;
      }
      case 'farm':
        pl.animate('bend'); this.busy = 0.4;
        if (t.stage < 0) { this.take('berries'); t.stage = 0; t.grow = 0; this.count('planted'); this.audio.sfx('pick'); this.hud.toast('Planted! Ready in about half a day'); }
        else { t.stage = -1; t.grow = 0; this.add('berries', 6); this.addXP(6); this.count('harvested'); this.audio.sfx('pick'); }
        this.showFarm(t);
        break;
      case 'forge':
        pl.animate('swing'); this.busy = 0.9;
        this.take('ore', 2); this.take('wood', 1); this.add('iron', 1); this.addXP(10); this.count('smelted'); this.audio.sfx('build');
        break;
    }
    this.hud.dirty = true;
  }

  // Maverick: combat. ATTACK is handled by combat.js (combos, the heavy spin); this is a single tap.
  attack() {
    if (this.sleeping) return;
    if (this.combat) { this.combat.press(); this.combat.release(); return; }
  }
  // what a defeated creature gives you (called by combat.js)
  reward(c) {
    if (c.type === 'puffhop') { this.add('meat', 1); this.add('fluff', 1); this.addXP(8); this.count('kill_puffhop'); }
    else { this.add('meat', 2); this.add('hide', 1); this.add('fang', 1); this.addXP(25); this.count('kill_thornmaw'); }
  }

  use(id) {
    const it = ITEMS[id];
    if (!it || !it.eat || !this.has(id)) return;
    this.take(id);
    const s = this.stats;
    if (it.food) s.food = Math.min(100, s.food + it.food);
    if (it.water) s.water = Math.min(100, s.water + it.water);
    if (it.health) s.health = clamp(s.health + it.health, 1, 100);
    this.count('ate_' + id);
    this.audio.sfx(id === 'bandage' ? 'craft' : 'eat');
    this.hud.toast(id === 'meat' ? 'Raw meat? Brave. Cook it next time' : id === 'bandage' ? 'All wrapped up. Healing nicely' : id === 'berries' ? 'Berry tasty!' : id === 'cooked' ? 'Mmm. Worth the wait.' : 'Delicious');
  }

  // ---------- crafting and building ----------
  owns(r) { return !!(r.gives && ITEMS[r.gives].tool && this.has(r.gives)); }
  canCraft(r) {
    if (r.soon || this.level < r.level || this.owns(r)) return false;
    return Object.entries(r.needs).every(([id, n]) => this.has(id, n));
  }
  craft(id) {
    const r = RECIPES.find((x) => x.id === id);
    if (r && this.owns(r)) { this.hud.toast(`You already own a ${r.name.toLowerCase()}. One's plenty`); return false; }
    if (!r || !this.canCraft(r)) return false;
    if (r.atForge && !this.structures.some((st) => st.type === 'forge' && Math.hypot(st.x - this.player.pos.x, st.z - this.player.pos.z) < 4)) {
      this.hud.toast('Head to your forge to make this'); return false;
    }
    if (r.place && !this.place(r.place)) return false;
    for (const [i, n] of Object.entries(r.needs)) this.take(i, n);
    if (r.gives) { this.add(r.gives, 1); this.player.setTool(this.weapon.id); this.player.setArmour(this.has('armour')); this.player.setTorch(this.has('torch')); }
    this.count('crafted_' + r.id);
    this.addXP(r.place ? 15 : 10);
    this.audio.sfx(r.place ? 'build' : 'craft');
    return true;
  }

  place(type, at, silent = false) {
    const p = this.player;
    const d = { shelter: 2.6, cabin: 4.2, farm: 2.4, forge: 2.4 }[type] || 1.8;
    const size = { shelter: 2.2, cabin: 4.0, farm: 2.4, forge: 2.4 }[type] || 2.2;
    const x = at ? at.x : p.pos.x + Math.sin(p.facing) * d, z = at ? at.z : p.pos.z + Math.cos(p.facing) * d;
    const y = this.world.heightAt(x, z);
    if (!at) {
      const i = Math.floor(x + HALF), j = Math.floor(z + HALF);
      let bad = y < WATER_Y + 0.1 || this.world.steepness(i, j) > 0.6 || this.world.blocked[j * N + i];
      // big buildings need a larger flat patch
      if (size > 3) for (const [dx, dz] of [[-2, -1.7], [2, -1.7], [-2, 1.7], [2, 1.7]]) {
        const yy = this.world.heightAt(x + dx, z + dz);
        if (Math.abs(yy - y) > 0.7 || yy < WATER_Y + 0.1) bad = true;
      }
      if (bad) { this.hud.toast('Too lumpy here. Try flat, dry ground'); return false; }
      if (this.structures.some((s) => Math.hypot(s.x - x, s.z - z) < (size + 2.2) / 2 + 0.5)) { this.hud.toast('Too snug! Step away from your builds'); return false; }
      if (Math.hypot(x - SITE.cabin.x, z - SITE.cabin.z) < 6) { this.hud.toast('The old cabin needs room. Step back'); return false; }
      // Forge: building pieces count too
      if (this.crowded(x, z, FOOTPRINT[type] || 0.7) || (this.build && this.build.blocks(x, z, FOOTPRINT[type] || 0.7))) { this.hud.toast('Stuff\'s in the way. Find open ground'); return false; }
    }
    const rot = at ? at.rot : p.facing + Math.PI;
    let s;
    // buildings made again from a save are not counted again, and keep the saved wake-up spot
    const fresh = !at;
    if (type === 'campfire') {
      const f = buildCampfire();
      s = { type, x, z, y, rot, fuel: at ? at.fuel : 4, ...f };
    } else if (type === 'shelter') {
      const sh = buildShelter();
      s = { type, x, z, y, rot, ...sh };
      if (fresh) this.respawn = { x: x + Math.sin(rot) * 1.6, z: z + Math.cos(rot) * 1.6 };
    } else if (type === 'cabin') {
      s = { type, x, z, y, rot, ...buildPlayerCabin() };
      if (fresh) this.respawn = { x: x + Math.sin(rot) * 2.8, z: z + Math.cos(rot) * 2.8 };
    } else if (type === 'farm') {
      s = { type, x, z, y, rot, stage: at && at.stage !== undefined ? at.stage : -1, grow: at ? at.grow || 0 : 0, ...buildFarm() };
      this.showFarm(s);
    } else if (type === 'forge') {
      s = { type, x, z, y, rot, ...buildForge() };
    }
    if (fresh) this.count('built_' + type);
    s.g.position.set(x, y, z); s.g.rotation.y = rot;
    this.scene.add(s.g);
    if (s.lightAt) { s.g.updateMatrixWorld(true); s.g.localToWorld(s.lightAt); }
    s.ob = { x, z, r: { shelter: 0.9, cabin: 1.9, farm: 0.9, forge: 0.8 }[type] || 0.55 };
    if (type === 'cabin') {
      // the walls block walking; the door side stays open to reach the bed
      for (let dz = -1.6; dz <= 1.6; dz += 0.5) for (let dx = -1.9; dx <= 1.9; dx += 0.5) {
        const wx = x + dx * Math.cos(rot) + dz * Math.sin(rot), wz = z - dx * Math.sin(rot) + dz * Math.cos(rot);
        this.world.blocked[Math.floor(wz + HALF) * N + Math.floor(wx + HALF)] = 1;
      }
    }
    const k = Math.floor(z + HALF) * N + Math.floor(x + HALF);
    if (!this.world.obstacles.has(k)) this.world.obstacles.set(k, []);
    this.world.obstacles.get(k).push(s.ob);
    this.structures.push(s);
    if (!silent && !at) this.hud.toast({ campfire: 'Campfire lit! Burns about 4 hours', shelter: 'Shelter up! Sleep here after midnight', cabin: 'Your cabin is done. Welcome home!', farm: 'Farm plot ready. Plant some berries!', forge: 'Forge built. Bring ore to smelt' }[type]);
    if (!silent && !at && type === 'campfire' && this.counters.built_campfire === 1) this.hud.news('Your flame mark glows back at the fire', 'Strange…');
    return true;
  }

  // Is there a tree, rock, bush, stump or pickup within about 1 m of a building this wide (radius r)?
  crowded(x, z, r) {
    const reach = r + 1.0;
    const near = (o, extra = 0) => Math.hypot(o.x - x, o.z - z) < reach + extra;
    const ci = Math.floor(x + HALF), cj = Math.floor(z + HALF), span = Math.ceil(reach + 1.5);
    for (let dj = -span; dj <= span; dj++) for (let di = -span; di <= span; di++) {
      const l = this.world.obstacles.get((cj + dj) * N + ci + di);
      if (l) for (const o of l) if (!this.structures.some((st) => st.ob === o) && near(o, o.r)) return true;
    }
    const gi = Math.floor(x / 4), gj = Math.floor(z / 4), gs = Math.ceil(reach / 4);
    for (let dj = -gs; dj <= gs; dj++) for (let di = -gs; di <= gs; di++) {
      const l = this.cell.get((gi + di) * 1000 + gj + dj);
      if (!l) continue;
      // pickups count even while regrowing, so they never grow back inside a building
      for (const o of l) if (near(o, o.type === 'pickup' || o.type === 'bag' ? -0.5 : (o.scale || 1) * 0.4)) return true;
    }
    for (const id of this.chopped) { const t = this.allThings[id]; if (t && near(t, 0.3)) return true; }
    return false;
  }

  showFarm(f) {
    f.plants.forEach(({ p, stem, fruit }) => {
      p.visible = f.stage >= 0;
      const s = [0.35, 0.6, 0.85, 1][Math.max(0, f.stage)];
      stem.scale.setScalar(s);
      fruit.visible = f.stage >= 3;
    });
  }

  // the campfires, for the creatures (the same array and objects every frame)
  get fires() {
    const out = this._fires;
    let n = 0;
    for (const s of this.structures) if (s.type === 'campfire') {
      const f = out[n] || (out[n] = { x: 0, z: 0, lit: false });
      f.x = s.x; f.z = s.z; f.lit = s.fuel > 0; n++;
    }
    out.length = n;
    return out;
  }

  // Sleep is allowed after midnight (00:00 to 05:00), or any time your energy is below 40.
  trySleep(s) {
    const h = this.sky.hour;
    const lateNight = h < 5;
    if (!lateNight && this.stats.energy >= 40) { this.nope('Not sleepy yet. Sleep after midnight or when tired'); return; }
    if (this.creatures.hostiles.some((c) => Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z) < 12)) { this.nope('A Briarlurk is close! Chase it off first'); return; }
    this.sleeping = 3.2;
    this.fainted = false;
    // after midnight you sleep until morning; a daytime nap (when tired) lasts about 3 hours
    this.sleepUntil = lateNight || h >= 18 ? 6.5 : (h + 3) % 24;
    this.hud.fade(true, s.type === 'cabin' ? 'Snug as a bug in your cabin…' : 'You doze off under the leaves…');
    this.audio.sfx('ui');
  }

  wake() {
    const toMorning = this.sleepUntil === undefined || this.sleepUntil === 6.5;
    this.sky.hour = this.sleepUntil ?? 6.5;
    this.lastHour = this.sky.hour;
    const s = this.stats;
    s.energy = 100; s.warmth = Math.max(s.warmth, 75); s.health = Math.min(100, s.health + 30);
    s.food = Math.max(5, s.food - (toMorning ? 18 : 8)); s.water = Math.max(5, s.water - (toMorning ? 22 : 10));
    this.creatures.clearHostiles();
    for (const f of this.structures) if (f.type === 'campfire') f.fuel = Math.max(0, f.fuel - (toMorning ? 6 : 3));
    this.hud.fade(false);
    if (toMorning) this.wasNight = true;   // the morning check below counts the night and gives the reward
    this.sleepUntil = undefined;
    this.save();
  }

  // Passing out: half of each stack (not tools) drops in a bag where you fell.
  faint() {
    const s = this.stats, pl = this.player;
    s.health = 50; s.food = Math.max(s.food, 40); s.water = Math.max(s.water, 40); s.warmth = 70; s.energy = 60;
    this.creatures.clearHostiles();
    const items = {};
    let n = 0;
    for (const [id, k] of Object.entries(this.inv)) {
      if (ITEMS[id] && ITEMS[id].tool) continue;
      const drop = Math.floor(k / 2);
      if (drop > 0) { items[id] = drop; this.take(id, drop); n += drop; }
    }
    if (n > 0) this.dropBag(pl.pos.x, pl.pos.z, items);
    this.fainted = true;
    this.sleeping = 3.2;
    this.hud.fade(true, 'Everything goes dark… You wake back at camp.');
  }

  dropBag(x, z, items) {
    const y = this.world.heightAt(x, z);
    const b = { type: 'bag', x, z, y, items, alive: true, g: buildBag() };
    b.g.position.set(x, Math.max(y, WATER_Y), z); b.g.rotation.y = this.rnd() * 6;
    this.scene.add(b.g);
    this.bags.push(b); this.register(b);
    return b;
  }

  // waking up after passing out: the clock goes on as it was, no night is counted and no XP is given
  wakeFromFaint() {
    const pl = this.player;
    pl.pos.set(this.respawn.x, this.world.heightAt(this.respawn.x, this.respawn.z), this.respawn.z);
    this.fainted = false;
    this.hud.fade(false);
    if (this.bags.length) this.hud.news('Part of your bag fell where you fainted. Go fetch it!', 'Oof');
    this.save();
  }

  // ---------- each frame ----------
  update(dt, ctx) {
    const s = this.stats, pl = this.player;
    this.busy = Math.max(0, this.busy - dt);
    this.chainT = Math.max(0, (this.chainT || 0) - dt);   // Maverick: feel

    this.clock += dt;
    if (this.sleeping) {
      this.sleeping -= dt;
      if (this.sleeping <= 0) { this.sleeping = 0; if (this.fainted) this.wakeFromFaint(); else this.wake(); }
      this.lastHour = ctx.hour;
      return this._sleepRet;
    }

    // walking counts for the first objective
    this.counters.walked += Math.hypot(pl.vel.x, pl.vel.z) * dt;

    // regrowing resources and cooling rocks
    for (const o of this.pickups) if (!o.alive && (o.back -= dt) <= 0) { o.alive = true; o.slot = this.dyn[o.item].add(o.x, o.y, o.z, o.rot, o.s); }
    for (const t of this.allThings) {
      if (t.type === 'berries' && !t.ready && (t.back -= dt) <= 0) { t.ready = true; this.dyn.emptyBush.remove(t.empty); this.setThingVisible(t, true); }
      if ((t.type === 'rock' || t.type === 'ore') && t.cool > 0) t.cool -= dt;   // rocks and iron ore refill
      if (t.shake > 0) {
        t.shake -= dt;
        const m = this._mA.copy(t.batch.m[t.index]).multiply(this._mB.makeRotationZ(Math.sin(t.shake * 40) * t.shake * 0.12));
        t.batch.mesh.setMatrixAt(t.index, t.shake > 0 && t.type === 'tree' ? m : (t.type === 'tree' ? t.batch.m[t.index] : ZERO));
        t.batch.mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // fires burn down; the two nearest burning fires get a light
    const gameHours = (ctx.hour - this.lastHour + 24) % 24;
    this.lastHour = ctx.hour;
    let nearFire = 0;
    const burning = this._burning; burning.length = 0;
    for (const f of this.structures) if (f.type === 'campfire') {
      if (gameHours < 2) f.fuel = Math.max(0, f.fuel - gameHours);
      const lit = f.fuel > 0;
      f.flame.visible = lit;
      if (lit) {
        const t = ctx.time * 9 + f.x;
        f.cones.forEach((c, k) => { c.scale.set(1 + Math.sin(t + k) * 0.08, 1 + Math.sin(t * 1.3 + k * 2) * 0.18 * (f.fuel < 1 ? 0.5 : 1), 1); });
        f.flame.scale.setScalar(f.fuel < 1 ? 0.6 : 1);
        burning.push(f);
      }
      const d = Math.hypot(f.x - pl.pos.x, f.z - pl.pos.z);
      if (lit) nearFire = Math.max(nearFire, clamp(1 - (d - 1.5) / 4, 0, 1));
    }
    for (const f of burning) f._d = Math.hypot(f.x - pl.pos.x, f.z - pl.pos.z);
    burning.sort(this._byDist);
    for (let k = 0; k < this.fireLights.length; k++) {
      const l = this.fireLights[k], f = burning[k];
      if (f) { l.position.set(f.x, f.y + 0.9, f.z); l.intensity = (4 + ctx.night * 6) * (0.92 + Math.sin(ctx.time * 13 + k) * 0.08) * (f.fuel < 1 ? 0.5 : 1); }
      else l.intensity = 0;
    }
    if (burning[0]) { this.embers.mat.uniforms.uOrigin.value.set(burning[0].x, burning[0].y + 0.3, burning[0].z); this.embers.mat.uniforms.uTime.value = ctx.time; }
    else this.embers.mat.uniforms.uOrigin.value.set(0, -50, 0);

    const lit = this._buildLit; lit.length = 0;
    const inShelter = this.structures.some((st) => (st.type === 'shelter' && Math.hypot(st.x - pl.pos.x, st.z - pl.pos.z) < 2.2) || (st.type === 'cabin' && Math.hypot(st.x - pl.pos.x, st.z - pl.pos.z) < 4))
      || !!(this.build && this.build.sheltered(pl.pos.x, pl.pos.z));   // Forge: building (walls and a roof keep you warm)
    // farms grow (about 12 game hours from seed to ripe); cabin windows glow at night; forges glow
    for (const st of this.structures) {
      if (st.type === 'farm' && st.stage >= 0 && st.stage < 3 && gameHours < 2) {
        st.grow += gameHours;
        const stage = Math.min(3, Math.floor(st.grow / 4));
        if (stage !== st.stage) { st.stage = stage; this.showFarm(st); }
      }
      if (st.type === 'cabin') { const lamp = Math.max(ctx.night, ctx.weather.dark * 0.55); st.glass.emissiveIntensity = 0.1 + lamp * 2.4; st.glow = lamp * 6; }
      if (st.type === 'forge') { const f = 1.2 + Math.sin(ctx.time * 5 + st.x) * 0.3; st.coal.emissiveIntensity = f; st.glow = 1.5 + f; }
      if (st.lightAt && st.glow > 0.01) { st._d = Math.hypot(st.x - pl.pos.x, st.z - pl.pos.z); lit.push(st); }
    }
    // the nearest glowing cabin windows and forges borrow the two building lights
    lit.sort(this._byDist);
    for (let k = 0; k < this.buildLights.length; k++) {
      const l = this.buildLights[k], st = lit[k];
      if (st) { l.position.copy(st.lightAt); l.color.set(st.lightColor); l.distance = st.lightDist; l.decay = st.lightDecay; l.intensity = st.glow; }
      else l.intensity = 0;
    }

    // the torch lights itself after dark; a reminder at dusk if you have none
    const dim = Math.max(ctx.night, ctx.weather.dark * 0.8);
    this.player.torchLit(dim > 0.3, ctx.time);
    if (ctx.hour > 18.2 && ctx.hour < 18.4 && !this.duskTold) { this.duskTold = true; this.hud.news(this.has('torch') ? 'Torch time! It lights itself after dark' : 'Getting dark! Craft a torch: 1 stick, 1 fiber', 'Dusk'); }
    if (ctx.hour < 12) this.duskTold = false;

    // ---- survival ----
    const w = ctx.weather;
    const running = pl.running ? 1.8 : 1;
    s.food = Math.max(0, s.food - dt * 0.07);
    s.water = Math.max(0, s.water - dt * (0.095 + (ctx.biome === DESERT ? 0.08 : 0)) * running);
    s.energy = Math.max(0, s.energy - dt * 0.055 * running);
    let target = 95 - ctx.night * 35 - w.rain * (1 - w.snow) * 30 - w.storm * 10 - w.snow * 45 - (ctx.biome === SNOW ? 25 : 0) + (ctx.biome === DESERT ? 10 : 0);
    if (inShelter) target += 30;
    target = Math.max(target, nearFire * 100);
    s.warmth += (clamp(target, 0, 100) - s.warmth) * Math.min(1, dt * 0.06);
    let hurt = 0;
    if (s.food <= 0) hurt += 0.5;
    if (s.water <= 0) hurt += 0.6;
    if (s.warmth < 20) hurt += 0.45;
    if (s.energy <= 0) hurt += 0.2;
    if (hurt) s.health -= hurt * dt;
    else if (s.food > 45 && s.water > 45 && s.warmth > 45) s.health = Math.min(100, s.health + dt * 0.35);

    // creatures
    const evs = this._evs; evs.length = 0;
    const bite = this.creatures.update(dt, ctx.time, pl, { hour: ctx.hour, night: ctx.night, fires: this.fires, level: this.level }, evs);
    if (bite) { const dmg = Math.round(bite * (this.has('armour') ? 0.55 : 1)); s.health -= dmg; this.audio.sfx('hurt'); this.hud.hurt(); this.hud.floatText(`-${dmg}`, pl.pos.x, pl.pos.y + 2, pl.pos.z, '#ff7070'); }
    for (const e of evs) if (e.type === 'growl') this.audio.sfx('creature');
    let danger = 0;
    for (const c of this.creatures.list) if (c.type === 'thornmaw' && !c.dead) danger = Math.max(danger, clamp(1 - Math.hypot(c.x - pl.pos.x, c.z - pl.pos.z) / 15, 0, 1));

    // passing out (this is not sleep: the clock and the night count stay as they are)
    if (s.health <= 0) this.faint();

    // surviving the night
    const night = ctx.hour >= 21 || ctx.hour < 5;
    if (this.wasNight && !night && ctx.hour < 12) { this.counters.nights++; this.addXP(20); this.hud.banner('Good morning!', 'You made it through the night. Nice work!'); }
    this.wasNight = night;

    // target marker
    this.target = this.findTarget();
    if (this.target && this.target.type !== 'water') {
      this.marker.visible = true;
      this.marker.position.set(this.target.x, (this.target.y ?? this.world.heightAt(this.target.x, this.target.z)) + 0.06 + Math.sin(ctx.time * 4) * 0.03, this.target.z);
      const big = this.target.type === 'tree' || this.target.type === 'shelter' ? 1.6 : this.target.type === 'rock' || this.target.type === 'berries' || this.target.type === 'campfire' ? 1.2 : 0.8;
      this.marker.scale.setScalar(big);
    } else this.marker.visible = false;

    // objectives
    // Forge: tutorial (the goals wait until the guided start is done)
    while (!(this.tutorial && this.tutorial.active) && this.objective < OBJECTIVES.length - 1 && OBJECTIVES[this.objective].done(this)) {
      this.objective++;
      this.addXP(5);
      this.audio.sfx('craft');
      this.hud.dirty = true;
    }

    const ret = this._ret;
    ret.danger = danger; ret.nearFire = nearFire; ret.inShelter = inShelter;
    return ret;
  }

  // ---------- saving (this device only) ----------
  save() {
    const data = {
      v: 1, inv: this.inv, stats: this.stats, xp: this.xp, level: this.level, counters: this.counters, objective: this.objective,
      hour: this.sky.hour, pos: [this.player.pos.x, this.player.pos.z], respawn: this.respawn,
      chopped: [...this.chopped], structures: this.structures.map((s) => ({ type: s.type, x: s.x, z: s.z, rot: s.rot, fuel: s.fuel || 0, stage: s.stage, grow: s.grow })),
      bags: this.bags.map((b) => ({ x: b.x, z: b.z, items: b.items })),
      look: this.player.look,   // the explorer's look and name (older saves have none and get the default look)
      build: this.build ? this.build.serialize() : undefined,           // Forge: building pieces
      tutorial: this.tutorial ? this.tutorial.serialize() : undefined,  // Forge: tutorial progress
    };
    if (this.noSave) return;   // set while starting over, so nothing writes the old game back
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage blocked */ }
  }
  load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { data = null; }
    if (!data || data.v !== 1) return false;
    Object.assign(this.stats, data.stats); this.inv = data.inv || {}; this.xp = data.xp || 0; this.level = data.level || 1;
    Object.assign(this.counters, data.counters); this.objective = data.objective || 0;
    this.sky.hour = data.hour ?? 8; this.respawn = data.respawn || this.respawn;
    if (data.pos) { const [x, z] = data.pos; this.player.pos.set(x, this.world.heightAt(x, z), z); }
    for (const id of data.chopped || []) { const t = this.allThings[id]; if (t && t.type === 'tree') this.fellTree(t, true); }
    for (const s of data.structures || []) this.place(s.type, s, true);
    for (const b of data.bags || []) if (b && b.items) this.dropBag(b.x, b.z, b.items);
    if (this.build) this.build.load(data.build);           // Forge: building
    if (this.tutorial) this.tutorial.load(data.tutorial);  // Forge: tutorial
    this.player.setLook(data.look);
    this.player.setTool(this.weapon.id);
    this.player.setArmour(this.has('armour'));
    this.player.setTorch(this.has('torch'));
    this.lastHour = this.sky.hour;
    return true;
  }
  static clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* storage blocked */ } }
}
