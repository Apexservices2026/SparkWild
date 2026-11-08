// Combat (Maverick): combos for each weapon, a hold-to-charge heavy spin, a dodge roll,
// lock-on with a ring under the target, and hit feel (a tiny freeze, camera shake, knockback,
// a white flash, pop-up damage numbers, slash trails, leaf and spark bursts, defeat puffs).
//
// How it fits in:
//  - main.js calls combat.update(dt, input, camYaw, active) before player.update. It returns the
//    game's dt for this frame (almost zero during a hit-pause), used for the player and creatures.
//  - The player's pose is set at the end of player.update through player.ctl.pose (a late update).
//  - press()/release() come from the ATTACK button, Space, F or the left mouse button;
//    dodge() from the DODGE button, X or the right mouse button; cycleTarget() from Tab or a swipe.
// Nothing here makes new objects each frame: particles, the trail and the rings are made once.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- timing and tuning ----------
const BUFFER = 0.32;      // a tap this early is remembered and chains the next swing
const LINK = 0.38;        // after a swing ends, a tap within this time still continues the combo
const HOLD = 0.3;         // holding ATTACK this long starts charging the heavy spin
const CHARGE_TIME = 0.55; // ...and this long more to charge it fully
const DODGE_TIME = 0.42, DODGE_DIST = 3.4, IFRAMES = 0.3, DODGE_COOL = 0.3;
const DODGE_V = DODGE_DIST / (DODGE_TIME * 2 / Math.PI);   // speed eases out (cosine), covers DODGE_DIST
const STOP = 0.055, STOP_BIG = 0.08;                        // hit-pause on contact (seconds)
const LOCK_RANGE = { thornmaw: 7.5, puffhop: 4.5 };
const TRAIL_LIFE = 0.15;

// ---------- poses ----------
// Pose channels: right arm (x, y, z), left arm (x, y, z), body twist, body lean, legs, tool angle, body height offset.
// Arms turn in Y-X-Z order, so x lifts the arm forward and y then swings it left or right.
const ARX = 0, ARY = 1, ARZ = 2, ALX = 3, ALY = 4, ALZ = 5, BRY = 6, BRX = 7, LL = 8, LR = 9, TOOL = 10, BPY = 11, NCH = 12;
const KEYS = { arx: ARX, ary: ARY, arz: ARZ, alx: ALX, aly: ALY, alz: ALZ, bry: BRY, brx: BRX, ll: LL, lr: LR, tool: TOOL, bpy: BPY };
function P(o) {
  const a = new Float32Array(NCH);
  a[ARZ] = -0.12; a[ALZ] = 0.12; a[TOOL] = HALF_PI;
  for (const k in o) a[KEYS[k]] = o[k];
  return a;
}
// The spear stays level: its angle makes up for the arm's lift.
const level = (arx) => HALF_PI - arx;

// Each move: wind-up (w), strike (s) and recovery (r) times; damage multiplier; hit arc (half-angle);
// reach multiplier; knockback (m); stagger (s); step forward (m); a finisher's crit; and two key poses:
// "ready" at the end of the wind-up, "hit" at the end of the strike.
const MOVES = {
  jabL: { w: 0.07, s: 0.08, r: 0.2, dmg: 1, arc: 0.7, reach: 1, knock: 0.25, step: 0.2, single: true, cancel: 0.3,
    ready: P({ alx: -0.75, aly: 0.1, alz: 0.25, arx: -0.95, arz: -0.3, bry: 0.2, ll: 0.1, lr: -0.1 }),
    hit: P({ alx: -1.6, aly: -0.25, alz: 0.1, arx: -0.85, arz: -0.3, bry: -0.42, brx: 0.12, ll: -0.35, lr: 0.25, bpy: -0.03 }) },
  jabR: { w: 0.07, s: 0.08, r: 0.2, dmg: 1, arc: 0.7, reach: 1, knock: 0.25, step: 0.2, single: true, cancel: 0.3,
    ready: P({ arx: -0.75, ary: -0.1, arz: -0.25, alx: -0.95, alz: 0.3, bry: -0.2, ll: -0.1, lr: 0.1 }),
    hit: P({ arx: -1.6, ary: 0.25, arz: -0.1, alx: -0.85, alz: 0.3, bry: 0.42, brx: 0.12, ll: 0.25, lr: -0.35, bpy: -0.03 }) },
  push: { w: 0.14, s: 0.1, r: 0.32, dmg: 1.5, arc: 0.9, reach: 1.05, knock: 1.6, stagger: 0.45, step: 0.35, crit: true, cancel: 0.6,
    ready: P({ arx: -0.45, alx: -0.45, arz: -0.35, alz: 0.35, brx: -0.12, bpy: -0.06, ll: 0.15, lr: -0.1 }),
    hit: P({ arx: -1.5, ary: 0.15, arz: -0.1, alx: -1.5, aly: -0.15, alz: 0.1, brx: 0.38, ll: -0.75, lr: 0.5, bpy: -0.1 }) },

  // sword and axe: slash, back-slash, overhead finisher
  slash: { w: 0.1, s: 0.1, r: 0.24, dmg: 1, arc: 1.1, reach: 1, knock: 0.35, step: 0.3, cancel: 0.35, trail: true,
    ready: P({ arx: -1.25, ary: -1.4, arz: -0.2, alx: -0.3, alz: 0.3, bry: -0.6, brx: 0.05, ll: -0.25, lr: 0.2, tool: 2.75, bpy: -0.04 }),
    hit: P({ arx: -1.35, ary: 1.3, arz: -0.1, alx: 0.25, alz: 0.25, bry: 0.62, brx: 0.16, ll: -0.45, lr: 0.3, tool: 2.75, bpy: -0.07 }) },
  backslash: { w: 0.08, s: 0.1, r: 0.24, dmg: 1, arc: 1.1, reach: 1, knock: 0.35, step: 0.3, cancel: 0.35, trail: true,
    ready: P({ arx: -1.6, ary: 1.35, arz: 0, alx: 0.2, alz: 0.3, bry: 0.58, brx: 0.08, ll: 0.3, lr: -0.35, tool: 2.6, bpy: -0.04 }),
    hit: P({ arx: -1.45, ary: -1.45, arz: -0.25, alx: -0.35, alz: 0.3, bry: -0.62, brx: 0.16, ll: 0.35, lr: -0.5, tool: 2.6, bpy: -0.07 }) },
  overhead: { w: 0.2, s: 0.1, r: 0.4, dmg: 1.6, arc: 0.8, reach: 1.1, knock: 2.0, stagger: 0.55, step: 0.5, crit: true, cancel: 0.6, trail: true, big: true,
    ready: P({ arx: -3.0, ary: 0.12, arz: -0.05, alx: -2.6, aly: -0.4, alz: 0.1, bry: -0.15, brx: -0.22, ll: 0.1, lr: 0.1, tool: 1.6, bpy: 0.03 }),
    hit: P({ arx: -0.55, ary: 0.1, arz: -0.05, alx: -0.55, aly: -0.4, alz: 0.1, bry: 0.1, brx: 0.48, ll: -0.75, lr: 0.5, tool: 2.45, bpy: -0.15 }) },

  // spear: thrust, thrust, wide sweep
  thrust: { w: 0.11, s: 0.09, r: 0.24, dmg: 1, arc: 0.45, reach: 1, knock: 0.4, step: 0.45, single: true, cancel: 0.35, trail: true,
    ready: P({ arx: -0.7, ary: -0.25, arz: -0.15, alx: -0.9, aly: 0.5, bry: -0.45, brx: -0.05, ll: -0.2, lr: 0.25, tool: level(-0.7) }),
    hit: P({ arx: -1.5, ary: 0.05, arz: -0.1, alx: -1.2, aly: 0.3, bry: 0.35, brx: 0.25, ll: -0.6, lr: 0.45, tool: level(-1.5), bpy: -0.08 }) },
  thrust2: { w: 0.08, s: 0.09, r: 0.24, dmg: 1, arc: 0.45, reach: 1, knock: 0.45, step: 0.45, single: true, cancel: 0.35, trail: true,
    ready: P({ arx: -0.8, ary: -0.1, arz: -0.15, alx: -1.0, aly: 0.45, bry: -0.35, ll: 0.25, lr: -0.2, tool: level(-0.8) }),
    hit: P({ arx: -1.55, ary: -0.1, arz: -0.1, alx: -1.25, aly: 0.25, bry: 0.3, brx: 0.25, ll: 0.45, lr: -0.6, tool: level(-1.55), bpy: -0.08 }) },
  sweep: { w: 0.18, s: 0.14, r: 0.4, dmg: 1.4, arc: 1.9, reach: 1, knock: 1.7, stagger: 0.5, step: 0.3, crit: true, cancel: 0.6, trail: true, big: true,
    ready: P({ arx: -0.9, ary: -1.75, arz: -0.2, alx: -0.4, alz: 0.3, bry: -0.85, brx: 0.05, ll: -0.3, lr: 0.3, tool: level(-0.9), bpy: -0.05 }),
    hit: P({ arx: -0.9, ary: 1.7, arz: -0.1, alx: -0.4, alz: 0.3, bry: 0.95, brx: 0.22, ll: -0.6, lr: 0.45, tool: level(-0.9), bpy: -0.1 }) },

  // the heavy spin (hold ATTACK): hits all around; ready is the charge pose
  spin: { w: 0.04, s: 0.3, r: 0.36, dmg: 1.5, arc: Math.PI, reach: 1.05, knock: 2.2, stagger: 0.6, step: 0.6, crit: true, cancel: 0.65, trail: true, big: true, spin: true,
    ready: P({ arx: -1.3, ary: -2.0, arz: -0.3, alx: -0.4, alz: 0.35, bry: -1.1, brx: 0.15, ll: -0.5, lr: 0.5, tool: 2.8, bpy: -0.12 }),
    hit: P({ arx: -1.45, ary: -1.5, arz: -0.25, alx: -0.5, alz: 0.5, bry: -0.6, brx: 0.12, ll: -0.3, lr: 0.3, tool: 2.9, bpy: -0.06 }) },
  spinFist: { w: 0.04, s: 0.3, r: 0.36, dmg: 1.5, arc: Math.PI, reach: 1.05, knock: 2.2, stagger: 0.6, step: 0.6, crit: true, cancel: 0.65, big: true, spin: true,
    ready: P({ arx: -1.2, ary: -1.2, arz: -0.4, alx: -1.2, aly: 1.2, alz: 0.4, bry: -1.1, brx: 0.15, ll: -0.5, lr: 0.5, bpy: -0.12 }),
    hit: P({ arx: -1.5, ary: -1.45, arz: -0.3, alx: -1.5, aly: 1.45, alz: 0.3, bry: -0.6, brx: 0.12, ll: -0.3, lr: 0.3, bpy: -0.06 }) },
};
for (const [k, m] of Object.entries(MOVES)) m.name = k;
const CHARGE_POSE = { tool: MOVES.spin.ready, fist: MOVES.spinFist.ready };

// How each weapon fights. Damage and reach come from game.weapon (game.js).
const STYLES = {
  fist: { combo: ['jabL', 'jabR', 'push'], spin: 'spinFist', pace: 0.9, trail: null, metal: false },
  axe: { combo: ['slash', 'backslash', 'overhead'], spin: 'spin', pace: 1, trail: [-0.05, 0.5], color: '#ffe2a8', metal: false },
  ironsword: { combo: ['slash', 'backslash', 'overhead'], spin: 'spin', pace: 1.06, trail: [0.12, 1.0], color: '#e2f2ff', metal: true },
  spear: { combo: ['thrust', 'thrust2', 'sweep'], spin: 'spin', pace: 1, trail: [0.9, 1.3], color: '#fff0c8', metal: false },
};

// ---------- easing ----------
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeInOut = (k) => k * k * (3 - 2 * k);
const easeOut3 = (k) => 1 - (1 - k) * (1 - k) * (1 - k);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ---------- pooled particles (leaves, sparks, dust) ----------
class Particles {
  constructor(scene, geo, mat, n, spinning) {
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.n = n; this.next = 0; this.live = 0; this.spinning = spinning;
    this.p = [];
    const white = new THREE.Color(1, 1, 1);
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) {
      this.p.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 0, size: 1, grow: 0, grav: 0, drag: 0, rx: 0, ry: 0, wx: 0, wy: 0 });
      this.mesh.setMatrixAt(i, this.zero);
      this.mesh.setColorAt(i, white);
    }
    this.dummy = new THREE.Object3D();
    scene.add(this.mesh);
  }
  emit(x, y, z, vx, vy, vz, life, size, color, grav = 9, drag = 2, grow = 0) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    const q = this.p[i];
    if (q.life <= 0) this.live++;
    q.x = x; q.y = y; q.z = z; q.vx = vx; q.vy = vy; q.vz = vz; q.age = 0; q.life = life; q.size = size; q.grav = grav; q.drag = drag; q.grow = grow;
    q.rx = Math.random() * TAU; q.ry = Math.random() * TAU; q.wx = (Math.random() - 0.5) * 18; q.wy = (Math.random() - 0.5) * 18;
    this.mesh.setColorAt(i, color);
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    if (this.live <= 0) return;
    const d = this.dummy;
    for (let i = 0; i < this.n; i++) {
      const q = this.p[i];
      if (q.life <= 0) continue;
      q.age += dt;
      if (q.age >= q.life) { q.life = 0; this.live--; this.mesh.setMatrixAt(i, this.zero); continue; }
      const f = Math.exp(-q.drag * dt);
      q.vx *= f; q.vz *= f; q.vy = q.vy * f - q.grav * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const k = q.age / q.life;
      const s = q.size * (1 + q.grow * k) * (k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);
      d.position.set(q.x, q.y, q.z);
      if (this.spinning) { q.rx += q.wx * dt; q.ry += q.wy * dt; d.rotation.set(q.rx, q.ry, 0); }
      d.scale.setScalar(Math.max(0.001, s));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- the slash trail: a short ribbon between the blade's base and tip ----------
class Trail {
  constructor(scene, n = 24) {
    this.n = n;
    this.ax = new Float32Array(n); this.ay = new Float32Array(n); this.az = new Float32Array(n);
    this.bx = new Float32Array(n); this.by = new Float32Array(n); this.bz = new Float32Array(n);
    this.st = new Float32Array(n);
    this.head = -1; this.count = 0;
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3); this.pos.setUsage(THREE.DynamicDrawUsage);
    this.alpha = new THREE.BufferAttribute(new Float32Array(n * 2), 1); this.alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos); geo.setAttribute('aA', this.alpha);
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color('#ffffff') } },
      vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(uColor * vA * 1.8, vA); }',
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 6; this.mesh.visible = false;
    scene.add(this.mesh);
  }
  push(a, b, t) {
    const h = this.head = (this.head + 1) % this.n;
    this.ax[h] = a.x; this.ay[h] = a.y; this.az[h] = a.z; this.bx[h] = b.x; this.by[h] = b.y; this.bz[h] = b.z; this.st[h] = t;
    this.count = Math.min(this.n, this.count + 1);
  }
  clear() { this.count = 0; this.mesh.visible = false; }
  refresh(t) {
    if (!this.count) return;
    const P = this.pos.array, A = this.alpha.array, n = this.n;
    let any = false;
    for (let i = 0; i < n; i++) {
      const s = i < this.count ? (this.head - i + n) % n : this.head;
      const fade = i < this.count ? clamp01(1 - (t - this.st[s]) / TRAIL_LIFE) : 0;
      const al = fade * (1 - i / (this.count || 1));
      if (al > 0.01) any = true;
      const o = i * 6;
      P[o] = this.ax[s]; P[o + 1] = this.ay[s]; P[o + 2] = this.az[s];
      P[o + 3] = this.bx[s]; P[o + 4] = this.by[s]; P[o + 5] = this.bz[s];
      A[i * 2] = al * 0.3; A[i * 2 + 1] = al;
    }
    this.pos.needsUpdate = true; this.alpha.needsUpdate = true;
    this.mesh.visible = any;
    if (!any) this.count = 0;
  }
}

export class Combat {
  constructor({ scene, camera, player, creatures, game, audio, hud }) {
    Object.assign(this, { scene, camera, player, creatures, game, audio, hud });
    creatures.combat = this;   // creatures report bites, dodged lunges and defeats here
    player.armR.rotation.order = 'YXZ'; player.armL.rotation.order = 'YXZ';
    player.ctl.pose = (pl, dt) => this.late(pl, dt);

    this.time = 0; this.gt = 0;          // real seconds, and game seconds (stops during a hit-pause)
    this.stop = 0; this.slow = 0; this.shake = 0;
    // attack state
    this.move = null; this.mt = 0; this.pmt = 0; this.hitDone = false; this.swung = false; this.power = 1; this.pace = 1; this.step = -1;
    this.nextStep = 0; this.linkT = 0; this.buffer = 0;
    this.holding = false; this.holdT = 0; this.charging = false; this.charge = 0; this.chargeT = 0; this.charged = false;
    this.aim = 0;
    // dodge state
    this.dodgeT = -1; this.dodgeCool = 0; this.dodgeBuf = 0; this.lastRoll = -9; this.ddx = 0; this.ddz = 0; this.rollSign = 1; this.dustT = 0;
    // movement wish from the input (world space), for the dodge direction
    this.wx = 0; this.wz = 0;
    // lock-on
    this.target = null; this.manualT = 0;
    // poses
    this.base = new Float32Array(NCH); this.cur = new Float32Array(NCH); this.from = new Float32Array(NCH);
    this.poseW = 0; this.fromW = 0; this.posed = false;
    // a short log for tests: what happened in the fight
    this.log = [];
    this.stats = { swings: 0, hits: 0, dmg: 0, crits: 0, dodges: 0, dodged: 0, bitten: 0, kills: 0 };

    // reused objects
    this._m = new THREE.Matrix4(); this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
    this._col = new THREE.Color();
    this.COL = {
      leaf: ['#6fae4a', '#4f8a3a', '#9ac85a', '#7d5a9a'].map((c) => new THREE.Color(c)),
      fluff: ['#f4efe6', '#d9cdf2', '#bfe8da'].map((c) => new THREE.Color(c)),
      spark: ['#ffd27a', '#ffb040', '#fff1c0'].map((c) => new THREE.Color(c).multiplyScalar(2.2)),
      dust: ['#cdbb98', '#b9a582', '#d9cbb0'].map((c) => new THREE.Color(c)),
    };

    // effects (made once)
    this.leaves = new Particles(scene, new THREE.PlaneGeometry(0.17, 0.1), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), 48, true);
    this.sparks = new Particles(scene, new THREE.OctahedronGeometry(0.05), new THREE.MeshBasicMaterial({ toneMapped: false }), 28, true);
    this.dust = new Particles(scene, new THREE.SphereGeometry(0.2, 7, 5), new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.55, depthWrite: false }), 18, false);
    this.trail = new Trail(scene);
    // the lock-on ring under the target
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 36).rotateX(-HALF_PI),
      new THREE.MeshBasicMaterial({ color: '#ff6b4a', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    this.ring.renderOrder = 3; this.ring.visible = false; scene.add(this.ring);
    // a ring at your feet that grows while the heavy spin charges
    this.chargeRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 36).rotateX(-HALF_PI),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
    this.chargeRing.renderOrder = 3; this.chargeRing.visible = false; scene.add(this.chargeRing);
    // a small health bar over the target (Briarlurks)
    this.bar = new THREE.Group();
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.12), new THREE.MeshBasicMaterial({ color: '#1a1410', transparent: true, opacity: 0.7, depthTest: false, depthWrite: false }));
    this.barFill = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.07).translate(0.42, 0, 0), new THREE.MeshBasicMaterial({ color: '#ff7a4a', depthTest: false, depthWrite: false, toneMapped: false }));
    this.barFill.position.set(-0.42, 0, 0.001);
    back.renderOrder = 9; this.barFill.renderOrder = 10;
    this.bar.add(back, this.barFill); this.bar.visible = false; scene.add(this.bar);
    this.floats = document.getElementById('floats');
  }

  get style() { return STYLES[this.game.weapon.id] || STYLES.fist; }
  get busy() { return !!this.move || this.charging || this.dodgeT >= 0; }
  note(o) { o.t = Math.round(this.time * 1000) / 1000; this.log.push(o); if (this.log.length > 300) this.log.shift(); }

  // ---------- input ----------
  press() {
    this.holding = true; this.holdT = 0;
    if (this.dodgeT >= 0) { this.buffer = BUFFER; return; }
    // no creature close and a tree or rock to work on: ATTACK chops, as before
    const g = this.game, wpn = g.weapon;
    const t = g.target;
    if (!this.move && !this.charging && !this.threat(wpn.reach + 1.2) && t && (t.type === 'tree' || t.type === 'rock' || t.type === 'ore')) {
      const d = g.describe(t);
      if (d && d.ok) { this.holding = false; g.act(); return; }
    }
    if (this.move || this.charging) { this.buffer = BUFFER; return; }
    this.startNext();
  }
  release() {
    if (!this.holding) return;
    this.holding = false;
    if (this.charging) {
      this.charging = false; this.chargeRing.visible = false;
      this.power = 1 + 0.6 * this.charge;          // the spin hits 1.5x to 2.4x
      this.startMove(MOVES[this.style.spin], true);
    }
  }
  dodge() {
    if (this.dodgeT >= 0) return;
    if (this.dodgeCool > 0) { this.dodgeBuf = 0.2; return; }
    const m = this.move;
    if (m && this.mt >= m.w * this.pace && this.mt < (m.w + m.s) * this.pace) { this.dodgeBuf = 0.2; return; }   // mid-strike: right after it
    this.startDodge();
  }
  // Tab or a swipe: switch to the next target to the right (dir 1) or left (-1). Returns true if it switched.
  cycleTarget(dir = 1) {
    const pl = this.player, yaw = this.camYaw || 0;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw), fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const ang = (c) => Math.atan2((c.x - pl.pos.x) * rx + (c.z - pl.pos.z) * rz, (c.x - pl.pos.x) * fx + (c.z - pl.pos.z) * fz);
    const cur = this.target ? ang(this.target) : 0;
    let best = null, bestA = Infinity, wrap = null, wrapA = Infinity;
    for (const c of this.creatures.list) {
      if (c.dead || c === this.target || !this.inRange(c, 1)) continue;
      const a = (ang(c) - cur) * dir;
      if (a > 0 && a < bestA) { bestA = a; best = c; }
      if (a <= 0 && a < wrapA) { wrapA = a; wrap = c; }
    }
    const pick = best || wrap;
    if (!pick) return false;
    this.target = pick; this.manualT = 3;
    this.audio.sfx('ui');
    this.note({ kind: 'target', type: pick.type });
    return true;
  }

  // ---------- helpers ----------
  inRange(c, extra = 0) { return Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z) < (LOCK_RANGE[c.type] || 5) + extra; }
  threat(r) {
    for (const c of this.creatures.list) if (!c.dead && Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z) < r + (c.type === 'thornmaw' ? 0.6 : 0.3)) return c;
    return null;
  }
  pickTarget(dt) {
    const pl = this.player;
    this.manualT = Math.max(0, this.manualT - dt);
    const t = this.target;
    if (t && (t.dead || !this.inRange(t, 1.5))) this.target = null;
    if (this.target && (this.manualT > 0 || this.busy)) return;   // keep it while you fight or after a switch
    const fx = Math.sin(pl.facing), fz = Math.cos(pl.facing);
    let best = null, bs = Infinity;
    for (const c of this.creatures.list) {
      if (c.dead || !this.inRange(c)) continue;
      const dx = c.x - pl.pos.x, dz = c.z - pl.pos.z, d = Math.hypot(dx, dz) || 0.01;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < -0.3 && d > 2.2) continue;                    // behind you and not close
      const s = d + (1 - dot) * 2.2 - (c.type === 'thornmaw' ? 1.5 : 0) - (c === t ? 0.8 : 0);
      if (s < bs) { bs = s; best = c; }
    }
    this.target = best;
  }

  startNext() {
    const st = this.style, i = this.nextStep;
    this.nextStep = i >= st.combo.length - 1 ? 0 : i + 1;
    this.linkT = 0; this.buffer = 0;
    this.startMove(MOVES[st.combo[i]], false, i);
  }
  startMove(m, heavy, step = -1) {
    this.move = m; this.mt = 0; this.pmt = 0; this.hitDone = false; this.swung = false;
    this.pace = this.style.pace;
    if (!heavy) this.power = 1;
    this.step = step;
    if (this.poseW > 0.01) { this.from.set(this.cur); this.fromW = this.poseW; }
    else { this.from.set(m.ready); this.fromW = 0; }
    // aim: the target if it is close enough, else where you are pushing the stick, else straight ahead
    const pl = this.player, t = this.target;
    if (t && Math.hypot(t.x - pl.pos.x, t.z - pl.pos.z) < this.game.weapon.reach + 3) this.aim = Math.atan2(t.x - pl.pos.x, t.z - pl.pos.z);
    else if (Math.hypot(this.wx, this.wz) > 0.25) this.aim = Math.atan2(this.wx, this.wz);
    else this.aim = pl.facing;
    this.trail.clear();
    this.stats.swings++;
    this.note({ kind: 'move', move: m.name, step, power: Math.round(this.power * 100) / 100 });
  }
  startDodge() {
    const pl = this.player;
    if (this.move) this.note({ kind: 'cancel', move: this.move.name, at: Math.round(this.mt * 1000) / 1000 });
    this.move = null; this.charging = false; this.chargeRing.visible = false; this.holding = false;
    const l = Math.hypot(this.wx, this.wz);
    if (l > 0.25) { this.ddx = this.wx / l; this.ddz = this.wz / l; this.rollSign = 1; this.aim = Math.atan2(this.ddx, this.ddz); }
    else { this.ddx = -Math.sin(pl.facing); this.ddz = -Math.cos(pl.facing); this.rollSign = -1; this.aim = pl.facing; }
    this.dodgeT = 0; this.dustT = 0; this.lastRoll = this.time;
    pl.invuln = IFRAMES;
    this.stats.dodges++;
    this.audio.sfx('whoosh');
    for (let k = 0; k < 4; k++) this.puffDust(pl.pos.x, pl.pos.y, pl.pos.z, 1);
    this.note({ kind: 'dodge', back: this.rollSign < 0 });
  }

  // ---------- each frame (before player.update) ----------
  update(dt, input, camYaw, active) {
    this.camYaw = camYaw;
    let scale = 1;
    if (this.stop > 0) { this.stop -= dt; scale = 0.03; } else if (this.slow > 0) { this.slow -= dt; scale = 0.35; }
    const gdt = dt * scale;
    this.time += dt; this.gt += gdt;
    this.shake *= Math.exp(-dt * 11);
    const pl = this.player, ctl = pl.ctl;
    // the stick or keys, turned into a world direction (as in player.update)
    const sy = Math.sin(camYaw), cy = Math.cos(camYaw), mx = input.move.x, my = input.move.y;
    this.wx = cy * mx - sy * my; this.wz = -sy * mx - cy * my;

    ctl.speed = 1; ctl.dash = false; ctl.px = 0; ctl.pz = 0; ctl.face = null;
    if (!active) {
      if (this.busy) { this.move = null; this.charging = false; this.dodgeT = -1; this.chargeRing.visible = false; }
      this.holding = false; this.buffer = 0;
      this.ring.visible = false; this.bar.visible = false;
      return gdt;
    }
    pl.invuln = Math.max(0, (pl.invuln || 0) - gdt);
    this.dodgeCool = Math.max(0, this.dodgeCool - gdt);
    this.buffer = Math.max(0, this.buffer - gdt);
    this.dodgeBuf = Math.max(0, this.dodgeBuf - gdt);
    if (this.linkT > 0) { this.linkT -= gdt; if (this.linkT <= 0) this.nextStep = 0; }   // too slow: the combo starts over
    this.pickTarget(dt);

    // hold to charge the heavy spin
    if (this.holding) {
      this.holdT += dt;
      const m = this.move;
      if (!this.charging && this.dodgeT < 0 && this.holdT >= HOLD && (!m || this.mt >= (m.w + m.s) * this.pace)) {
        this.charging = true; this.charge = 0; this.chargeT = 0; this.charged = false;
        if (this.poseW > 0.01) { this.from.set(this.cur); this.fromW = this.poseW; } else { this.fromW = 0; }
        this.move = null; this.buffer = 0; this.nextStep = 0;
        this.audio.sfx('charge');
        this.note({ kind: 'charge' });
      }
    }
    if (this.charging) {
      this.chargeT += gdt;
      this.charge = clamp01(this.chargeT / CHARGE_TIME);
      if (this.charge >= 1 && !this.charged) { this.charged = true; this.audio.sfx('charged'); this.burst(this.sparks, pl.pos.x, pl.pos.y + 1, pl.pos.z, 6, this.COL.spark, 2.5, 0.35, 0.8); }
      ctl.speed = 0.4;
      if (this.target) ctl.face = Math.atan2(this.target.x - pl.pos.x, this.target.z - pl.pos.z);
    }

    // the current swing
    const m = this.move;
    if (m) {
      const pace = this.pace, w = m.w * pace, s = m.s * pace, r = m.r * pace;
      this.pmt = this.mt; this.mt += gdt;
      const t = this.mt;
      // keep turning toward the target through the wind-up and strike
      const tg = this.target;
      if (tg && t < w + s && Math.hypot(tg.x - pl.pos.x, tg.z - pl.pos.z) < this.game.weapon.reach + 3) this.aim = Math.atan2(tg.x - pl.pos.x, tg.z - pl.pos.z);
      ctl.face = this.aim;
      ctl.speed = t < w + s ? 0.25 : 0.55;
      // a small step forward on each swing (not into the target)
      if (t < w + s) {
        let room = true;
        if (tg) { const d = Math.hypot(tg.x - pl.pos.x, tg.z - pl.pos.z) - (tg.type === 'thornmaw' ? 0.55 : 0.3); room = d > 0.75; }
        if (room) { const v = m.step * 2 / (w + s) * (1 - t / (w + s)); ctl.px = Math.sin(this.aim) * v; ctl.pz = Math.cos(this.aim) * v; }
      }
      if (!this.swung && t >= w) { this.swung = true; this.audio.sfx(m.spin ? 'heavy' : 'swing'); }
      if (!this.hitDone && t >= w + s * (m.spin ? 0.5 : 0.35)) { this.hitDone = true; this.resolve(m); }
      // chain: a buffered tap cancels the late recovery into the next swing
      if (this.buffer > 0 && !this.holdingCharge() && t >= w + s + r * m.cancel) this.startNext();
      else if (t >= w + s + r) {
        this.move = null;
        if (this.buffer > 0) this.startNext();
        else this.linkT = this.nextStep === 0 ? 0 : LINK;
      }
    }

    // the dodge roll
    if (this.dodgeBuf > 0 && this.dodgeT < 0 && this.dodgeCool <= 0) {
      const mm = this.move;
      if (!mm || this.mt < mm.w * this.pace || this.mt >= (mm.w + mm.s) * this.pace) { this.dodgeBuf = 0; this.startDodge(); }
    }
    if (this.dodgeT >= 0) {
      this.dodgeT += gdt;
      const k = this.dodgeT / DODGE_TIME;
      if (k >= 1) {
        this.dodgeT = -1; this.dodgeCool = DODGE_COOL;
        if (this.buffer > 0) this.startNext();   // attack straight out of the roll
      } else {
        const v = DODGE_V * Math.cos(k * HALF_PI);
        ctl.dash = true; ctl.dx = this.ddx * v; ctl.dz = this.ddz * v;
        ctl.face = this.aim;
        this.dustT -= gdt;
        if (this.dustT <= 0 && k < 0.8) { this.dustT = 0.07; this.puffDust(pl.pos.x, pl.pos.y, pl.pos.z, 0.6); }
      }
    }
    return gdt;
  }
  holdingCharge() { return this.holding && this.holdT >= HOLD * 0.8; }

  // A swing lands: find what it hits, then damage, knockback and the hit feel.
  resolve(m) {
    const pl = this.player, g = this.game, wpn = g.weapon, st = this.style;
    const fx = Math.sin(this.aim), fz = Math.cos(this.aim), cosArc = Math.cos(m.arc);
    const reach = wpn.reach * m.reach;
    let single = null, sd = Infinity, any = false;
    for (const c of this.creatures.list) {
      if (c.dead) continue;
      const rad = c.type === 'thornmaw' ? 0.55 : 0.3;
      const dx = c.x - pl.pos.x, dz = c.z - pl.pos.z, d = Math.hypot(dx, dz) || 0.01;
      if (d - rad > reach) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < cosArc && d > 0.8) continue;
      if (m.single) { const s = d * (2 - dot); if (s < sd) { sd = s; single = c; } continue; }
      this.damage(c, m, wpn, st, d); any = true;
    }
    if (single) { this.damage(single, m, wpn, st, sd); any = true; }
    if (!any) this.note({ kind: 'miss', move: m.name });
  }
  damage(c, m, wpn, st) {
    const pl = this.player, g = this.game;
    const punish = c.whiff > 0;                       // it missed its lunge: it takes more
    const crit = !!m.crit || punish;
    const base = (wpn.dmg + (g.level - 1)) * m.dmg * this.power * (punish ? 1.15 : 1);
    const dmg = Math.max(1, Math.round(base * (0.94 + Math.random() * 0.12)));
    const dx = c.x - pl.pos.x, dz = c.z - pl.pos.z, d = Math.hypot(dx, dz) || 1;
    const res = this.creatures.strike(c, dmg, dx / d, dz / d, m.knock * (c.type === 'puffhop' ? 1.4 : 1), m.stagger || 0);
    // hit feel: a tiny freeze, a shake, a flash (strike sets it), a number, a thud and a burst
    this.stop = Math.max(this.stop, crit || m.big ? STOP_BIG : STOP);
    this.shake = Math.min(0.6, this.shake + (m.big ? 0.32 : crit ? 0.22 : 0.13));
    this.audio.sfx(crit ? 'crit' : 'thud');
    const y = c.y + (c.type === 'thornmaw' ? 0.7 : 0.35);
    const hx = c.x - dx / d * 0.3, hz = c.z - dz / d * 0.3;
    this.burst(this.leaves, hx, y, hz, crit ? 8 : 5, c.type === 'puffhop' ? this.COL.fluff : this.COL.leaf, 3.2, 0.9, 0.55, dx / d, dz / d);
    if (st.metal || crit) this.burst(this.sparks, hx, y + 0.1, hz, crit ? 7 : 4, this.COL.spark, 4.5, 0.25, 0.9, dx / d, dz / d);
    this.number(String(dmg) + (crit ? '!' : ''), c.x, y + 0.6, c.z, crit ? 'crit' : '');
    this.stats.hits++; this.stats.dmg += dmg; if (crit) this.stats.crits++;
    this.note({ kind: 'hit', move: m.name, dmg, crit, punish, hp: Math.max(0, Math.round(c.hp)), of: c.maxHp, type: c.type });
    if (res && res.killed) {
      this.stats.kills++;
      this.note({ kind: 'kill', type: c.type });
      if (g.reward) g.reward(c);
      if (this.target === c) this.target = null;
    }
  }

  // ---------- reports from creatures.js ----------
  bitten(c, dmg) {
    this.stats.bitten++;
    this.note({ kind: 'bitten', dmg });
    this.shake = Math.min(0.6, this.shake + 0.28);
    this.stop = Math.max(this.stop, 0.05);
    // a bite knocks you out of your swing (not out of a roll)
    if (this.move || this.charging) { this.move = null; this.charging = false; this.chargeRing.visible = false; this.holding = false; this.nextStep = 0; this.buffer = 0; }
  }
  // a lunge ended without biting: if you rolled just now, that was a dodge
  lungeMissed(c) { if (c.dodged || this.time - this.lastRoll < 0.8) this.dodged(c); }
  dodged(c) {
    this.stats.dodged++;
    this.note({ kind: 'dodged-lunge' });
    this.slow = 0.16;                                  // a moment of slow motion: nice dodge!
    this.number('Dodged!', this.player.pos.x, this.player.pos.y + 2.1, this.player.pos.z, 'info');
  }
  // creatures puff away into leaves (Briarlurk) or fluff (Puffhop), with sparks
  defeat(c) {
    const y = c.y + (c.type === 'thornmaw' ? 0.55 : 0.3);
    const big = c.type === 'thornmaw';
    this.burst(this.leaves, c.x, y, c.z, big ? 18 : 12, big ? this.COL.leaf : this.COL.fluff, 3.6, 1.6, 1.1);
    this.burst(this.sparks, c.x, y + 0.1, c.z, big ? 10 : 4, this.COL.spark, 4, 0.6, 0.8);
    for (let k = 0; k < (big ? 5 : 3); k++) this.puffDust(c.x + (Math.random() - 0.5) * 0.8, c.y + 0.2, c.z + (Math.random() - 0.5) * 0.8, 1.6);
    this.audio.sfx('poof');
    this.shake = Math.min(0.6, this.shake + 0.15);
  }

  // Maverick: feel. A chop or a pick strike lands on a tree, rock or ore: chips fly, a short shake and
  // the tiniest freeze, so every hit of a held Use feels solid. kind: 'tree' or 'stone'; big: it fell or cracked open.
  gatherHit(x, y, z, kind, big) {
    const pl = this.player, dx = x - pl.pos.x, dz = z - pl.pos.z, d = Math.hypot(dx, dz) || 1;
    const hx = pl.pos.x + dx / d * Math.max(0.3, d - 0.35), hz = pl.pos.z + dz / d * Math.max(0.3, d - 0.35);
    if (kind === 'tree') {
      this.burst(this.leaves, x, y + 1.9, z, big ? 16 : 5, this.COL.leaf, big ? 3 : 1.6, 0.4, 1.2);
      for (let k = 0; k < (big ? 4 : 2); k++) this.puffDust(hx, y + 0.5, hz, 0.45);
    } else {
      this.burst(this.sparks, hx, y + 0.45, hz, big ? 7 : 3, this.COL.spark, 3.2, 0.5, 0.45, -dx / d, -dz / d);
      for (let k = 0; k < (big ? 4 : 2); k++) this.puffDust(hx, y + 0.2, hz, 0.6);
    }
    this.shake = Math.min(0.6, this.shake + (big ? 0.2 : 0.07));
    this.stop = Math.max(this.stop, big ? 0.05 : 0.03);
  }

  // ---------- effects ----------
  burst(pool, x, y, z, n, cols, speed, up, life, dirX = 0, dirZ = 0) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, s = speed * (0.4 + Math.random() * 0.6);
      pool.emit(x, y, z, Math.cos(a) * s + dirX * speed * 0.6, up * speed * (0.5 + Math.random()), Math.sin(a) * s + dirZ * speed * 0.6,
        life * (0.7 + Math.random() * 0.5), 0.8 + Math.random() * 0.5, cols[k % cols.length], pool === this.sparks ? 6 : 5, pool === this.sparks ? 3 : 2.5);
    }
  }
  puffDust(x, y, z, size) {
    const a = Math.random() * TAU, s = 0.6 + Math.random() * 0.8;
    this.dust.emit(x + Math.cos(a) * 0.2, y + 0.12, z + Math.sin(a) * 0.2, Math.cos(a) * s, 0.5 + Math.random() * 0.4, Math.sin(a) * s, 0.5 + Math.random() * 0.25, 0.7 * size, this.COL.dust[Math.floor(Math.random() * 3)], -0.6, 3, 1.4);
  }
  // pop-up numbers in the floating-text layer (hud.js moves and fades them)
  number(text, x, y, z, cls) {
    if (!this.floats) return;
    const f = document.createElement('div');
    f.className = 'float dmg' + (cls ? ' ' + cls : '');
    const s = document.createElement('span'); s.textContent = text; f.appendChild(s);
    f._p = new THREE.Vector3(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5); f._t = 0;
    this.floats.appendChild(f);
  }
  // after the camera is placed: a small shake
  shakeCamera(camera) {
    if (this.shake < 0.004) return;
    const a = this.shake * (reduceMotion ? 0.12 : 0.4), t = this.time;
    camera.position.x += Math.sin(t * 71.3) * a;
    camera.position.y += Math.sin(t * 93.7 + 1.3) * a * 0.6;
    camera.position.z += Math.sin(t * 57.1 + 2.1) * a;
  }

  // ---------- poses (called at the end of player.update) ----------
  late(pl, dt) {
    const m = this.move, rolling = this.dodgeT >= 0;
    const B = this.base;
    B[ARX] = pl.armR.rotation.x; B[ARY] = 0; B[ARZ] = pl.armR.rotation.z;
    B[ALX] = pl.armL.rotation.x; B[ALY] = 0; B[ALZ] = pl.armL.rotation.z;
    B[BRY] = pl.body.rotation.y; B[BRX] = pl.body.rotation.x; B[LL] = pl.legL.rotation.x; B[LR] = pl.legR.rotation.x;
    B[TOOL] = HALF_PI; B[BPY] = pl.body.position.y;
    pl.ctl.posing = !!(m || this.charging || rolling);
    if (rolling) this.poseRoll(pl);
    else if (this.charging) {
      const e = easeInOut(clamp01(this.chargeT / 0.15));
      const C = this.player.tool ? CHARGE_POSE.tool : CHARGE_POSE.fist;
      for (let i = 0; i < NCH; i++) this.cur[i] = this.from[i] + (C[i] - this.from[i]) * e;
      this.cur[ARY] += Math.sin(this.time * 47) * 0.03 * this.charge;   // a little tremble as it builds
      this.poseW = this.fromW + (1 - this.fromW) * e;
      this.apply(pl, this.cur, this.poseW);
    } else if (m) {
      const st = this.style, trail = m.trail && st.trail && pl.tool;
      const pace = this.pace, w = m.w * pace, s = m.s * pace;
      // sub-steps through the strike so the trail is a smooth arc even at low frame rates
      const inTrail = trail && this.mt - this.pmt > 0.002 && this.mt >= w - 0.02 && this.pmt <= w + s + 0.05;   // not while frozen
      const steps = inTrail ? 3 : 1;
      for (let k = 1; k <= steps; k++) {
        const t = steps === 1 ? this.mt : this.pmt + (this.mt - this.pmt) * (k / steps);
        this.poseW = this.evalMove(m, t, this.cur);
        this.apply(pl, this.cur, this.poseW);
        if (inTrail && t >= w - 0.02 && t <= w + s + 0.05) {
          this.toolPoints(pl, st.trail[0], st.trail[1]);
          this.trail.push(this._a, this._b, this.gt - (this.mt - t));
        }
      }
      if (inTrail) this.trail.mat.uniforms.uColor.value.set(m.spin ? '#ffd27a' : st.color);
      this.posed = true;
    } else if (this.posed || this.poseW > 0) {
      // back to the walk pose
      this.poseW = 0; this.posed = false;
      pl.body.rotation.y = 0; pl.body.rotation.z = 0; pl.body.position.z = 0; pl.body.scale.setScalar(1);
      pl.armR.rotation.y = 0; pl.armL.rotation.y = 0;
      if (pl.tool) pl.tool.rotation.x = HALF_PI;
    }
    this.trail.refresh(this.gt);
    this.fx(pl, dt);
  }
  // the pose of a move at time t (returns how strongly it overrides the walk pose)
  evalMove(m, t, out) {
    const pace = this.pace, w = m.w * pace, s = m.s * pace, r = m.r * pace;
    const R = m.ready, H = m.hit, F = this.from;
    if (t < w) {
      const e = easeInOut(clamp01(t / w));
      for (let i = 0; i < NCH; i++) out[i] = F[i] + (R[i] - F[i]) * e;
      return this.fromW + (1 - this.fromW) * easeOut3(clamp01(t / w));
    }
    if (t < w + s) {
      const e = easeOut3((t - w) / s);
      for (let i = 0; i < NCH; i++) out[i] = R[i] + (H[i] - R[i]) * e;
      if (m.spin) out[BRY] = R[BRY] + (H[BRY] + TAU - R[BRY]) * e;   // a full turn
      return 1;
    }
    // follow-through: carry on a little past the hit, then ease back to the walk pose
    const k = clamp01((t - w - s) / r);
    const o = m.spin ? 0 : 0.12 * Math.sin(Math.PI * Math.min(1, k * 1.6));
    for (let i = 0; i < NCH; i++) out[i] = H[i] + (H[i] - R[i]) * o;
    return 1 - easeInOut(clamp01((k - 0.15) / 0.85));
  }
  apply(pl, c, w) {
    const b = this.base;
    pl.armR.rotation.set(b[ARX] + (c[ARX] - b[ARX]) * w, b[ARY] + (c[ARY] - b[ARY]) * w, b[ARZ] + (c[ARZ] - b[ARZ]) * w);
    pl.armL.rotation.set(b[ALX] + (c[ALX] - b[ALX]) * w, b[ALY] + (c[ALY] - b[ALY]) * w, b[ALZ] + (c[ALZ] - b[ALZ]) * w);
    pl.body.rotation.y = b[BRY] + (c[BRY] - b[BRY]) * w;
    pl.body.rotation.x = b[BRX] + (c[BRX] - b[BRX]) * w;
    pl.legL.rotation.x = b[LL] + (c[LL] - b[LL]) * w;
    pl.legR.rotation.x = b[LR] + (c[LR] - b[LR]) * w;
    if (pl.tool) pl.tool.rotation.x = b[TOOL] + (c[TOOL] - b[TOOL]) * w;
    pl.body.position.y = b[BPY] + c[BPY] * w;
  }
  // the roll: the body turns a full circle around its middle, tucked up small
  poseRoll(pl) {
    const k = clamp01(this.dodgeT / DODGE_TIME), e = easeInOut(k), tuck = Math.sin(k * Math.PI);
    const th = TAU * e * this.rollSign, h = 0.62, c = h - 0.22 * tuck;
    pl.body.rotation.set(th, 0, 0);
    pl.body.position.set(0, c - h * Math.cos(th), -h * Math.sin(th));
    pl.body.scale.setScalar(1 - 0.14 * tuck);
    pl.legL.rotation.x = pl.legR.rotation.x = -1.7 * tuck;
    if (pl.kneeL) { pl.kneeL.rotation.x = pl.kneeR.rotation.x = 1.9 * tuck; pl.chest.rotation.set(0.5 * tuck, 0, 0); }   // Maverick: feel (tucked knees)
    pl.armR.rotation.set(-1.3 * tuck, 0, -0.12); pl.armL.rotation.set(-1.3 * tuck, 0, 0.12);
    if (pl.tool) pl.tool.rotation.x = HALF_PI;
    this.poseW = 0; this.posed = true;
  }
  // world positions of two points along the tool (base and tip), from the pose just applied
  toolPoints(pl, a, b) {
    const m = this._m;
    pl.group.updateMatrix(); m.copy(pl.group.matrix);
    pl.body.updateMatrix(); m.multiply(pl.body.matrix);
    if (pl.chest) { pl.chest.updateMatrix(); m.multiply(pl.chest.matrix); }   // Maverick: feel (arms hang from the chest now)
    pl.armR.updateMatrix(); m.multiply(pl.armR.matrix);
    pl.tool.updateMatrix(); m.multiply(pl.tool.matrix);
    this._a.set(0, a, 0).applyMatrix4(m); this._b.set(0, b, 0).applyMatrix4(m);
  }
  // particles, the lock-on ring, the charge ring and the target's health bar
  fx(pl, dt) {
    const gdt = this.stop > 0 ? dt * 0.03 : this.slow > 0 ? dt * 0.35 : dt;
    this.leaves.update(gdt); this.sparks.update(gdt); this.dust.update(gdt);
    const t = this.target;
    if (t && !t.dead) {
      const big = t.type === 'thornmaw';
      const near = Math.hypot(t.x - pl.pos.x, t.z - pl.pos.z) - (big ? 0.55 : 0.3) < this.game.weapon.reach;
      this.ring.visible = true;
      this.ring.position.set(t.x, t.y + 0.06, t.z);
      this.ring.scale.setScalar((big ? 1.3 : 0.75) * (1 + Math.sin(this.time * 6) * 0.05));
      this.ring.rotation.y += dt * 1.2;
      this.ring.material.opacity = near ? 0.95 : 0.6;
      if (big) {
        this.bar.visible = true;
        this.bar.position.set(t.x, t.y + 1.55, t.z);
        this.bar.quaternion.copy(this.camera.quaternion);
        this.barFill.scale.x = Math.max(0.001, t.hp / t.maxHp);
      } else this.bar.visible = false;
    } else { this.ring.visible = false; this.bar.visible = false; }
    if (this.charging) {
      this.chargeRing.visible = true;
      this.chargeRing.position.set(pl.pos.x, pl.pos.y + 0.05, pl.pos.z);
      this.chargeRing.scale.setScalar(0.6 + this.charge * 1.2);
      this.chargeRing.material.color.setRGB(1, 1 - this.charge * 0.25, 1 - this.charge * 0.6);
      this.chargeRing.material.opacity = this.charge >= 1 ? 0.7 + Math.sin(this.time * 20) * 0.25 : 0.55;
    } else this.chargeRing.visible = false;
  }
}
