// The survivor: a small explorer with a bedroll on their back; the player picks their look (woman or man,
// skin, hair, outfit) in the character creator. Walks on the terraces,
// steps up one block at a time, wades in shallow water.
import * as THREE from 'three';
import { N, HALF, STEP, WATER_Y, cellIndex } from './world.js';

const M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });

// Maverick: feel. Movement and animation tuning.
const WALK = 4.2, RUN = 7.5;           // top speeds (m/s)
const ACCEL = 9, DECEL = 14, REVERSE = 18;   // how fast speed builds, stops and turns around (per second)
const TURN_K = 260, TURN_C = 2 * Math.sqrt(260);   // facing spring (critically damped: smooth, no wobble)
const WAIST = 0.86;                    // the upper body bends here (the hips)
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
const mix = (a, b, k) => a + (b - a) * k;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const expo = (rate, dt) => 1 - Math.exp(-rate * dt);
// Action poses (the chop swing and the pick-up bend). Channels:
//  rx/rz right arm, lx/lz left arm, cx/cy chest bend and twist, tl/tr thighs, kl/kr knees, by body drop, bz hips back, hx head nod
const POSE = (o) => Object.assign({ rx: 0, rz: -0.12, lx: 0, lz: 0.12, cx: 0, cy: 0, tl: 0, tr: 0, kl: 0, kr: 0, by: 0, bz: 0, hx: 0 }, o);
const CHOP = {
  // wind-up: the tool goes up over the right shoulder, the chest turns and leans back a little, weight on the back foot
  wind: POSE({ rx: -2.75, rz: -0.35, lx: -1.0, lz: 0.3, cx: -0.14, cy: 0.42, tl: -0.3, tr: 0.18, kl: 0.25, kr: 0.15, by: -0.02, hx: -0.1 }),
  // strike: the tool comes down in front, the chest drives forward and turns through, knees give a little
  hit: POSE({ rx: -1.15, rz: -0.08, lx: -0.9, lz: 0.05, cx: 0.32, cy: -0.28, tl: -0.4, tr: 0.25, kl: 0.45, kr: 0.35, by: -0.07, hx: 0.12 }),
  // follow-through: carries on a little past the hit
  follow: POSE({ rx: -0.75, rz: -0.1, lx: -0.6, lz: 0.1, cx: 0.4, cy: -0.36, tl: -0.4, tr: 0.25, kl: 0.5, kr: 0.35, by: -0.08, hx: 0.15 }),
};
// pick-up: bend at the hips and knees (a squat with a forward lean), right hand down to the ground
const BEND = POSE({ rx: -0.6, rz: -0.05, lx: -0.25, lz: 0.35, cx: 0.78, cy: 0.05, tl: -0.85, tr: -0.6, kl: 1.3, kr: 1.0, by: -0.11, bz: -0.06, hx: 0.25 });
const SWING_T = { wind: 0.2, hit: 0.26, follow: 0.34, end: 0.48 };   // seconds (busy is 0.5, so held Use flows on)
const BEND_T = { in: 0.18, grab: 0.2, down: 0.27, end: 0.5 };
const CH = ['rx', 'rz', 'lx', 'lz', 'cx', 'cy', 'tl', 'tr', 'kl', 'kr', 'by', 'bz', 'hx'];

// ---------- the explorer's look (chosen in the character creator) ----------
// Saved as small numbers and words, so old saves without a look get DEFAULT_LOOK.
export const LOOKS = {
  bodies: [{ id: 'woman', name: 'Woman' }, { id: 'man', name: 'Man' }],
  skins: [
    { c: '#f5d1b6', name: 'Fair' }, { c: '#f0c39b', name: 'Light' }, { c: '#d6a274', name: 'Tan' },
    { c: '#b07a4c', name: 'Golden brown' }, { c: '#80522f', name: 'Brown' }, { c: '#55331d', name: 'Deep brown' },
  ],
  hairs: [
    { id: 'short', name: 'Short' }, { id: 'long', name: 'Long' }, { id: 'braid', name: 'Braid' },
    { id: 'curls', name: 'Curls' }, { id: 'bun', name: 'Bun' }, { id: 'hood', name: 'Hood' },
  ],
  hairColors: [
    { c: '#1d1714', name: 'Black' }, { c: '#6e3f22', name: 'Brown' }, { c: '#a4452a', name: 'Auburn' },
    { c: '#e0bd76', name: 'Blonde' }, { c: '#dcd8d2', name: 'Silver' }, { c: '#c4508f', name: 'Berry pink' },
  ],
  outfits: [
    { c: '#3f7391', scarf: '#c9493b', name: 'Lake blue' }, { c: '#5d7f3c', scarf: '#c9493b', name: 'Moss green' },
    { c: '#b04a3b', scarf: '#e0a83a', name: 'Berry red' }, { c: '#c99636', scarf: '#b04a3b', name: 'Honey' },
    { c: '#70508a', scarf: '#e0a83a', name: 'Plum' },
  ],
};
export const DEFAULT_NAME = 'Wanderer';
// The look the explorer had before the creator existed (old saves keep it)
export const DEFAULT_LOOK = Object.freeze({ body: 'man', skin: 1, hair: 'short', hairColor: 1, outfit: 0, name: DEFAULT_NAME });

// A name is plain letters, numbers, spaces and a little punctuation, at most 14 characters.
export function cleanName(s) {
  const n = String(s ?? '').replace(/[^\p{L}\p{N} .'\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14).trim();
  return n || DEFAULT_NAME;
}
const pick = (v, n, d) => (Number.isInteger(v) && v >= 0 && v < n ? v : d);
export function normalizeLook(l) {
  l = l && typeof l === 'object' ? l : {};
  const d = DEFAULT_LOOK;
  return {
    body: LOOKS.bodies.some((b) => b.id === l.body) ? l.body : d.body,
    skin: pick(l.skin, LOOKS.skins.length, d.skin),
    hair: LOOKS.hairs.some((h) => h.id === l.hair) ? l.hair : d.hair,
    hairColor: pick(l.hairColor, LOOKS.hairColors.length, d.hairColor),
    outfit: pick(l.outfit, LOOKS.outfits.length, d.outfit),
    name: cleanName(l.name),
  };
}
export function randomLook(name) {
  const r = (n) => Math.floor(Math.random() * n);
  return normalizeLook({
    body: LOOKS.bodies[r(2)].id, skin: r(LOOKS.skins.length), hair: LOOKS.hairs[r(LOOKS.hairs.length)].id,
    hairColor: r(LOOKS.hairColors.length), outfit: r(LOOKS.outfits.length), name,
  });
}
// Body shapes: the woman has slightly narrower shoulders and a tunic that flares a little at the hips.
const BODY = {
  man: { torsoR: 0.21, torsoLen: 0.32, torsoY: 1.08, shoulder: 0.29, armR: 0.065, legX: 0.11, legR: 0.085, hem: null, packZ: -0.24 },
  woman: { torsoR: 0.185, torsoLen: 0.3, torsoY: 1.1, shoulder: 0.255, armR: 0.058, legX: 0.1, legR: 0.08, hem: { top: 0.18, bottom: 0.255, h: 0.27, y: 0.87 }, packZ: -0.22 },
};

export class Player {
  constructor(world, x, z, look) {
    this.world = world;
    this.pos = new THREE.Vector3(x, world.heightAt(x, z), z);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.facing = Math.PI * 1.25;
    this.phase = 0;
    this.radius = 0.3;
    // Maverick: combat (combat.js steers the player through ctl each frame):
    //  speed: walk speed multiplier; dash + dx/dz: a roll's velocity (replaces walking);
    //  px/pz: an extra push (the step forward on a swing); face: an angle to turn toward (or null);
    //  pose: called at the end of update to pose the limbs; posing: true while a combat pose is on.
    this.ctl = { speed: 1, dash: false, dx: 0, dz: 0, px: 0, pz: 0, face: null, turn: 18, pose: null, posing: false };
    this.kick = { x: 0, z: 0 };   // a shove (a bite knocks you back a little), eases off
    this.invuln = 0;              // seconds left of the dodge roll's invulnerability
    this.build();
    this.setLook(look || DEFAULT_LOOK);
  }

  // The skeleton (body, head, arm and leg pivots) is made once; the look is rebuilt inside it,
  // so the tool, torch and armour stay attached when the look changes.
  build() {
    const g = new THREE.Group();
    this.body = new THREE.Group(); g.add(this.body);
    // Maverick: feel. The upper body (chest, head, arms) hangs from the hips, so it can bend there;
    // each leg has a knee. (combat.js poses the body, arms and thighs as before.)
    this.chest = new THREE.Group(); this.chest.position.y = WAIST; this.body.add(this.chest);
    const head = new THREE.Group(); head.position.set(0, 1.6 - WAIST, 0); this.chest.add(head); this.head = head;
    const pivot = (parent) => { const p = new THREE.Group(); parent.add(p); return p; };
    this.legL = pivot(this.body); this.legR = pivot(this.body); this.armL = pivot(this.chest); this.armR = pivot(this.chest);
    this.kneeL = pivot(this.legL); this.kneeR = pivot(this.legR);
    // animation state (all numbers, nothing made per frame)
    this.sp = 0; this.runW = 0; this.moveW = 0; this.runBlend = 0; this.turnVel = 0; this.lean = 0; this.accLean = 0; this.lastSp = 0;
    this.antT = 0; this.wishOn = false; this.idleT = 0; this.lookT = 3; this.lookYaw = 0; this.lookGoal = 0; this.lookPitch = 0; this.lookPitchGoal = 0;
    this.torchUp = false; this.torchW = 0; this.faceGoal = null; this.faceT = 0; this.reach = { x: 0, z: 0, t: 0 };
    this.ap = POSE({});   // the action pose this frame
    this.group = g;
    // The torch light exists from the start (at zero brightness): adding a light later
    // makes every material rebuild, which freezes the game for a moment.
    this.torchLight = new THREE.PointLight('#ffb060', 0, 15, 1.4);
    this.torchLight.position.set(0.25, 1.9, 0.2);
    g.add(this.torchLight);
  }

  // Rebuilds the explorer's body, face, hair and clothes for a look ({ body, skin, hair, hairColor, outfit, name }).
  setLook(look) {
    const L = this.look = normalizeLook(look);
    // clear the old look
    for (const part of this.lookParts || []) {
      part.parent.remove(part);
      part.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    }
    for (const m of this.lookMats || []) m.dispose();
    this.lookParts = []; this.lookMats = []; this.helmHidden = [];
    const mat = (c, opts) => { const m = M(c); if (opts) Object.assign(m, opts); this.lookMats.push(m); return m; };
    const part = (parent) => { const p = new THREE.Group(); parent.add(p); this.lookParts.push(p); return p; };
    const add = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };

    const B = BODY[L.body], fit = LOOKS.outfits[L.outfit];
    const skin = mat(LOOKS.skins[L.skin].c), tunic = mat(fit.c), hair = mat(LOOKS.hairColors[L.hairColor].c);
    const pants = mat('#5b4632'), boots = mat('#3b2a1d'), pack = mat('#8d5c33'), roll = mat('#e6d6b4'), scarf = mat(fit.scarf);
    const eye = mat('#2a1d16'), shine = mat('#fffaf0', { roughness: 0.3 });

    // body and clothes
    // (the torso hangs from the hips at WAIST; the belt and the tunic's flare stay with the legs)
    const torso = part(this.chest), hips = part(this.body), W = WAIST;
    add(new THREE.CapsuleGeometry(B.torsoR, B.torsoLen, 4, 10), tunic, 0, B.torsoY - W, 0, torso);
    add(new THREE.CylinderGeometry(B.torsoR + 0.015, B.torsoR + 0.015, 0.08, 10), pants, 0, 0.86, 0, hips);
    if (B.hem) add(new THREE.CylinderGeometry(B.hem.top, B.hem.bottom, B.hem.h, 12), tunic, 0, B.hem.y, 0, hips);
    add(new THREE.TorusGeometry(0.15, 0.06, 6, 12).rotateX(Math.PI / 2), scarf, 0, 1.36 - W, 0, torso);
    add(new THREE.BoxGeometry(0.34, 0.38, 0.17), pack, 0, 1.12 - W, B.packZ, torso);
    add(new THREE.CylinderGeometry(0.09, 0.09, 0.42, 10).rotateZ(Math.PI / 2), roll, 0, 1.36 - W, B.packZ - 0.01, torso);

    // face: skin, eyes with a tiny shine (so they read on every skin tone)
    const face = part(this.head);
    add(new THREE.SphereGeometry(0.22, 14, 10), skin, 0, 0, 0, face);
    for (const sx of [1, -1]) {
      add(new THREE.SphereGeometry(0.03, 6, 4), eye, sx * 0.08, 0, 0.2, face);
      add(new THREE.SphereGeometry(0.011, 4, 3), shine, sx * 0.08 + 0.01, 0.012, 0.226, face);
    }

    // hair (simple rounded shapes)
    const h = part(this.head);
    const under = (o) => { this.helmHidden.push(o); return o; };   // hidden under the iron helmet
    const cap = () => add(new THREE.SphereGeometry(0.235, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.03, -0.02, h);
    if (L.hair === 'short') cap();
    else if (L.hair === 'long') {
      cap();
      add(new THREE.CapsuleGeometry(0.18, 0.14, 3, 10), hair, 0, -0.12, -0.12, h).scale.set(1.05, 1, 0.6);
      for (const sx of [1, -1]) add(new THREE.CapsuleGeometry(0.055, 0.2, 3, 6), hair, sx * 0.185, -0.15, 0.03, h);
    } else if (L.hair === 'braid') {
      cap();
      // a braid over the right shoulder, tied with a scarf-colored band
      [[0.19, -0.1, 0.02, 0.07], [0.2, -0.2, 0.07, 0.066], [0.2, -0.3, 0.11, 0.062], [0.19, -0.39, 0.14, 0.054]]
        .forEach(([x, y, z, r]) => add(new THREE.SphereGeometry(r, 8, 6), hair, -x, y, z, h));
      add(new THREE.SphereGeometry(0.032, 6, 4), scarf, -0.185, -0.45, 0.15, h);
    } else if (L.hair === 'curls') {
      add(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), hair, 0, 0.03, -0.02, h);
      const bump = (theta, phi, r, top) => {
        const R = 0.25;
        const o = add(new THREE.SphereGeometry(r, 8, 6), hair, Math.sin(theta) * Math.sin(phi) * R, 0.03 + Math.cos(theta) * R, -0.02 + Math.sin(theta) * Math.cos(phi) * R, h);
        if (top) under(o);
      };
      bump(0, 0, 0.11, true);
      for (let k = 0; k < 6; k++) bump(Math.PI * 0.3, k * Math.PI / 3, 0.1, true);
      for (const phi of [Math.PI * 0.55, Math.PI * 0.8, Math.PI, Math.PI * 1.2, Math.PI * 1.45]) bump(Math.PI * 0.55, phi, 0.095, false);
    } else if (L.hair === 'bun') {
      cap();
      under(add(new THREE.SphereGeometry(0.11, 10, 8), hair, 0, 0.21, -0.13, h));
    } else if (L.hair === 'hood') {
      // a soft hood in a deeper shade of the outfit, open at the front, with a little hair peeking out
      cap();
      const hood = mat(new THREE.Color(fit.c).multiplyScalar(0.72), { side: THREE.DoubleSide });
      under(add(new THREE.SphereGeometry(0.275, 14, 5, 0, Math.PI * 2, 0, Math.PI * 0.3), hood, 0, 0.02, -0.02, h));
      const open = 0.95;
      under(add(new THREE.SphereGeometry(0.275, 14, 7, Math.PI / 2 + open, Math.PI * 2 - open * 2, Math.PI * 0.29, Math.PI * 0.5), hood, 0, 0.02, -0.02, h));
      const tip = under(add(new THREE.ConeGeometry(0.085, 0.24, 8), hood, 0, 0.1, -0.3, h));
      tip.rotation.x = -2.1;
    }

    // arms and legs: tunic sleeves with skin-colored hands, trousers with boots
    const limb = (p, x, y, len, r, m) => {
      p.position.set(x, y, 0);
      const l = part(p);
      add(new THREE.CapsuleGeometry(r, len, 3, 8), m, 0, -len / 2 - r * 0.5, 0, l);
      add(new THREE.SphereGeometry(r * 1.15, 8, 6), skin, 0, -len - r, 0, l);
    };
    // legs: a thigh from the hip, and a shin with the boot from the knee (same length and height as before)
    const leg = (p, knee, x) => {
      const r = B.legR;
      p.position.set(x, 0.8, 0);
      knee.position.set(0, -0.25, 0);
      add(new THREE.CapsuleGeometry(r, 0.2, 3, 8), pants, 0, -0.13, 0, part(p));
      const s = part(knee);
      add(new THREE.CapsuleGeometry(r * 0.94, 0.18, 3, 8), pants, 0, -0.12, 0, s);
      add(new THREE.BoxGeometry(0.15, 0.11, 0.24), boots, 0, -0.295, 0.04, s);
    };
    leg(this.legL, this.kneeL, B.legX);
    leg(this.legR, this.kneeR, -B.legX);
    limb(this.armL, B.shoulder, 1.3 - WAIST, 0.36, B.armR, tunic);
    limb(this.armR, -B.shoulder, 1.3 - WAIST, 0.36, B.armR, tunic);
    this.shoulder = B.shoulder;

    // armour follows the new body shape
    if (this.armour) { this.setArmour(false); this.setArmour(true); }
    this.helmHair();
    return L;
  }
  helmHair() { for (const o of this.helmHidden || []) o.visible = !this.armour; }

  // Maverick: feel. Turning toward something you use is smooth (a quick spring), not a snap.
  face(x, z) {
    this.faceGoal = Math.atan2(x - this.pos.x, z - this.pos.z); this.faceT = 0.45;
    this.reach.x = x; this.reach.z = z;
  }
  // An action: 'swing' (chop, mine) or 'bend' (pick up, drink). onImpact runs when the tool lands
  // (or straight away if the action is cut short), so the sound and the hit match the swing.
  animate(type, onImpact) {
    this.flushImpact();
    const a = this.anim;
    // a new bend while still bent starts from the same depth (tap-tap-tap through a pile, no pop)
    let t = 0;
    if (a && type === 'bend' && a.type === 'bend') t = Math.min(BEND_T.down, a.t) * 0.6;
    this.anim = { type, t, impact: onImpact || null, hitAt: type === 'swing' ? SWING_T.hit : BEND_T.grab };
    if (type === 'bend') this.reach.t = 0.22;   // a small step toward the item if it is a little far
  }
  flushImpact() {
    const a = this.anim;
    if (a && a.impact) { const f = a.impact; a.impact = null; f(); }
  }

  // Shows the best tool in the right hand
  setTool(id) {
    if (this.tool) { this.tool.parent.remove(this.tool); this.tool = null; }
    if (id === 'fist') return;
    const wood = new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 0.9 });
    const stone = new THREE.MeshStandardMaterial({ color: '#9a978f', roughness: 0.9 });
    const g = new THREE.Group();
    if (id === 'ironsword') {
      const steel = new THREE.MeshStandardMaterial({ color: '#cfd4da', roughness: 0.35, metalness: 0.6 });
      const gold = new THREE.MeshStandardMaterial({ color: '#c9a03a', roughness: 0.5, metalness: 0.4 });
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 5), wood); grip.position.y = 0.0;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.06), gold); guard.position.y = 0.13;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, 0.025), steel); blade.position.y = 0.55;
      g.add(grip, guard, blade);
    } else if (id === 'spear') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 5), wood); shaft.position.y = 0.3;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 4), stone); tip.position.y = 1.18;
      g.add(shaft, tip);
    } else {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.55, 5), wood); handle.position.y = 0.12;
      const head = new THREE.Mesh(new THREE.BoxGeometry(id === 'pick' ? 0.4 : 0.1, 0.12, id === 'pick' ? 0.06 : 0.2), stone); head.position.set(0, 0.36, id === 'pick' ? 0 : 0.06);
      g.add(handle, head);
    }
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.position.set(0, -0.5, 0.05);
    g.rotation.x = Math.PI / 2;
    this.armR.add(g);
    this.tool = g;
  }

  // A torch in the left hand, with its own warm light
  setTorch(on) {
    if (on === !!this.torch) return;
    if (!on) { this.torch.g.parent.remove(this.torch.g); this.torchLight.intensity = 0; this.torch = null; return; }
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.5, 5), new THREE.MeshStandardMaterial({ color: '#6b4528', roughness: 1 }));
    stick.position.y = 0.05;
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 6), new THREE.MeshStandardMaterial({ color: '#b0a070', roughness: 1 }));
    wrap.position.y = 0.3;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), new THREE.MeshBasicMaterial({ color: '#ffb040' }));
    flame.position.y = 0.45;
    g.add(stick, wrap, flame);
    g.position.set(0, -0.48, 0.05); g.rotation.x = -0.25;
    this.armL.add(g);
    this.torch = { g, flame, light: this.torchLight };
  }
  torchLit(lit, time) {
    if (!this.torch) return;
    const t = this.torch;
    t.flame.visible = lit;
    t.light.intensity = lit ? 16 * (0.9 + Math.sin(time * 14) * 0.06 + Math.sin(time * 23) * 0.04) : 0;
    t.flame.scale.set(1, 1 + Math.sin(time * 18) * 0.15, 1);
    this.torchUp = lit;   // Maverick: feel. update() eases the left arm up to hold it (no snap)
  }

  // Iron armour: steel plates over the tunic
  setArmour(on) {
    if (on === !!this.armour) return;
    if (!on) { this.armour.forEach((m) => m.parent.remove(m)); this.armour = null; this.helmHair(); return; }
    const steel = new THREE.MeshStandardMaterial({ color: '#9aa1aa', roughness: 0.4, metalness: 0.5 });
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.225, 0.2, 4, 10), steel); chest.position.y = 1.12 - WAIST;
    const pads = [-1, 1].map((sx) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel); m.position.set(sx * (this.shoulder || 0.29) * 0.93, 1.32 - WAIST, 0); return m; });
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.245, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), steel); helm.position.y = 0.04;
    [chest, ...pads].forEach((m) => { m.castShadow = true; this.chest.add(m); });
    helm.castShadow = true; this.head.add(helm);
    this.armour = [chest, ...pads, helm];
    this.helmHair();
  }

  canStand(x, z, fromY) {
    const w = this.world;
    if (Math.abs(x) > HALF - 3 || Math.abs(z) > HALF - 3) return false;
    const i = cellIndex(x), j = cellIndex(z);
    if (w.blocked[j * N + i]) return false;
    const y = w.heightAt(x, z);
    if (y < WATER_Y - 0.45) return false;    // too deep to wade
    if (y - fromY > 0.42) return false;      // too steep to climb
    return true;
  }

  update(dt, move, run, camYaw) {
    const w = this.world, c = this.ctl;
    // Maverick: feel. Movement: the stick or keys give a wish (direction and how far it is pushed);
    // speed builds and stops smoothly, the run blends in, and turning around is quick but not a snap.
    const sy = Math.sin(camYaw), cy = Math.cos(camYaw);
    const mx = move.x, my = move.y, mag = Math.min(1, Math.hypot(mx, my));
    this.runBlend += ((run && mag > 0.05 ? 1 : 0) - this.runBlend) * expo(run ? 4 : 6, dt);
    const level = w.heightAt(this.pos.x, this.pos.z);
    const wading = level < WATER_Y;
    const top = mix(WALK, RUN, this.runBlend) * c.speed * (wading ? 0.6 : 1);
    let wx = 0, wz = 0;
    if (mag > 0.001) { wx = (cy * mx - sy * my) / mag * mag * top; wz = (-sy * mx - cy * my) / mag * mag * top; }
    const wl = Math.hypot(wx, wz), vl = Math.hypot(this.vel.x, this.vel.z);
    let rate = DECEL;
    if (wl > 0.01) rate = vl > 0.5 && (wx * this.vel.x + wz * this.vel.z) < 0 ? REVERSE : wl < vl ? DECEL * 0.8 : ACCEL;
    const f = expo(rate, dt);
    this.vel.x += (wx - this.vel.x) * f; this.vel.z += (wz - this.vel.z) * f;
    if (wl < 0.01 && Math.hypot(this.vel.x, this.vel.z) < 0.06) { this.vel.x = 0; this.vel.z = 0; }   // come to a clean stop
    if (c.dash) { this.vel.x = c.dx; this.vel.z = c.dz; }   // Maverick: combat (dodge roll)
    // a little anticipation when you set off from standing: a quick dip before the first step
    const wish = wl > 0.3;
    if (wish && !this.wishOn && vl < 0.4 && !c.posing && !this.anim) { this.antT = 0.16; this.phase = 0; }
    this.wishOn = wish;
    this.antT = Math.max(0, this.antT - dt);
    // a small step toward an item picked up a little out of reach
    let rx = 0, rz = 0;
    if (this.reach.t > 0 && this.anim && this.anim.type === 'bend') {
      this.reach.t -= dt;
      const dx = this.reach.x - this.pos.x, dz = this.reach.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.95) { const v = Math.min(3.2, (d - 0.9) / Math.max(dt, 0.2)); rx = dx / d * v; rz = dz / d * v; }
    }
    // the step forward on a swing, any shove and the reach step are added on top
    const vx = this.vel.x + c.px + this.kick.x + rx, vz = this.vel.z + c.pz + this.kick.z + rz;
    const kf = Math.exp(-dt * 9); this.kick.x *= kf; this.kick.z *= kf;

    // move one axis at a time so you slide along walls
    const r = this.radius;
    const nx = this.pos.x + vx * dt;
    if (this.canStand(nx + Math.sign(vx) * r, this.pos.z, level)) this.pos.x = nx; else { this.vel.x = 0; this.kick.x = 0; }
    const nz = this.pos.z + vz * dt;
    if (this.canStand(this.pos.x, nz + Math.sign(vz) * r, level)) this.pos.z = nz; else { this.vel.z = 0; this.kick.z = 0; }

    // push out of tree trunks and rocks
    const ci = cellIndex(this.pos.x), cj = cellIndex(this.pos.z);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const list = w.obstacles.get((cj + dj) * N + ci + di);
      if (!list) continue;
      for (const o of list) {
        const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
        const d = Math.hypot(dx, dz), min = o.r + r;
        if (d < min && d > 1e-4) { this.pos.x = o.x + dx / d * min; this.pos.z = o.z + dz / d * min; }
      }
    }

    // height: steps up and small steps down are eased (no jitter on terraces and stairs); real drops fall
    const ground = w.standAt ? w.standAt(this.pos.x, this.pos.z) : w.heightAt(this.pos.x, this.pos.z);   // Forge: building (floors and stairs)
    const gap = ground - this.pos.y;
    if (gap > 0) { this.pos.y += gap * expo(16, dt); this.vy = 0; if (gap < 0.004) this.pos.y = ground; }
    else if (gap > -0.5 && this.vy >= -0.5) { this.pos.y += gap * expo(14, dt); this.vy = 0; if (gap > -0.004) this.pos.y = ground; }
    else { this.vy -= 30 * dt; this.pos.y = Math.max(ground, this.pos.y + this.vy * dt); if (this.pos.y === ground) this.vy = 0; }

    // ---------- facing ----------
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.faceT = Math.max(0, this.faceT - dt);
    if (c.face !== null) {
      // Maverick: combat. Swings and rolls turn you smoothly toward their aim.
      const d = angDiff(c.face, this.facing);
      this.facing += d * Math.min(1, dt * c.turn);
      this.turnVel = 0; this.faceT = 0;
    } else {
      let goal = null;
      if (this.faceT > 0 && this.faceGoal !== null) goal = this.faceGoal;
      else if (sp > 0.25 && wl > 0.01) goal = Math.atan2(this.vel.x, this.vel.z);
      else if (sp > 0.6) goal = Math.atan2(this.vel.x, this.vel.z);
      if (goal !== null) this.turnVel += (TURN_K * angDiff(goal, this.facing) - TURN_C * this.turnVel) * Math.min(dt, 0.05);
      else this.turnVel *= Math.exp(-dt * 12);
      this.facing += this.turnVel * dt;
    }
    this.facing = Math.atan2(Math.sin(this.facing), Math.cos(this.facing));

    // ---------- the walk: blended by speed, so idle, walk and run flow into each other ----------
    const ds = (sp - this.lastSp) / Math.max(dt, 1e-4); this.lastSp = sp;
    this.sp = sp;
    this.moveW += (smooth(sp / 1.6) - this.moveW) * expo(10, dt);
    this.runW += (smooth((sp - WALK * 0.9) / (RUN - WALK * 0.9)) - this.runW) * expo(8, dt);
    this.running = this.runW > 0.5 && sp > 0.5;
    const mw = this.moveW, rw = this.runW;
    this.phase += dt * (sp > 0.05 ? 2.6 + sp * 1.75 : 0);
    const ph = this.phase, s = Math.sin(ph), co = Math.cos(ph);
    const legA = (0.5 + 0.38 * rw) * mw, kneeA = (0.75 + 0.75 * rw) * mw, armA = (0.42 + 0.5 * rw) * mw;
    let tl = -s * legA, tr = s * legA;
    let kl = (0.08 + Math.max(0, co) * 0.92) * kneeA + 0.12 * rw * mw, kr = (0.08 + Math.max(0, -co) * 0.92) * kneeA + 0.12 * rw * mw;
    let arx = -s * armA, alx = s * armA;   // arms swing against the legs
    let bob = (0.022 + 0.04 * rw) * mw * Math.cos(2 * ph) - 0.035 * rw * mw;   // lowest as each foot lands
    // leaning: forward with speed and when speeding up, back a touch when stopping, into turns
    this.accLean += (Math.max(-0.12, Math.min(0.14, ds * 0.025)) - this.accLean) * expo(6, dt);
    let bx = (0.04 + 0.13 * rw) * mw + this.accLean;
    const leanGoal = Math.max(-0.2, Math.min(0.2, -this.turnVel * Math.min(sp, RUN) * 0.012));
    this.lean += (leanGoal - this.lean) * expo(8, dt);
    let bz = this.lean;
    let bry = 0.07 * s * mw, cry = -0.13 * s * mw * (1 - rw * 0.3), crx = 0.03 * rw * mw;
    // the anticipation dip
    if (this.antT > 0) { const k = 1 - this.antT / 0.16, d = Math.sin(k * Math.PI); bob -= 0.045 * d; bx += 0.06 * d; kl += 0.3 * d; kr += 0.3 * d; }

    // ---------- idle: breathing, a little weight shift and the odd look around ----------
    const iw = 1 - mw;
    this.idleT += dt;
    const br = Math.sin(this.idleT * 2.1);
    crx += -0.02 * br * iw; bob += 0.006 * br * iw;
    bz += 0.018 * Math.sin(this.idleT * 0.55) * iw;
    arx += 0.04 * br * iw; alx += 0.04 * br * iw;
    this.lookT -= dt;
    if (this.lookT <= 0) {
      const glance = this.lookGoal === 0 && iw > 0.8 && !this.anim;
      this.lookGoal = glance ? (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.4) : 0;
      this.lookPitchGoal = glance ? (Math.random() - 0.6) * 0.25 : 0;
      this.lookT = glance ? 1.1 + Math.random() * 0.8 : 3 + Math.random() * 4;
    }
    const lg = iw > 0.6 && !this.anim ? this.lookGoal : 0;
    this.lookYaw += (lg - this.lookYaw) * expo(4, dt);
    this.lookPitch += ((iw > 0.6 ? this.lookPitchGoal : 0) - this.lookPitch) * expo(4, dt);

    // ---------- action poses (chop swing, pick-up bend), blended over the walk ----------
    const A = this.ap;
    let aw = 0;
    if (this.anim) {
      const a = this.anim; a.t += dt;
      const t = a.t;
      if (a.impact && t >= a.hitAt) this.flushImpact();
      if (a.type === 'swing') {
        const T = SWING_T;
        if (t < T.wind) { const k = smooth(t / T.wind); for (const ch of CH) A[ch] = CHOP.wind[ch] * k; }
        else if (t < T.hit) { const k = (t - T.wind) / (T.hit - T.wind); const e = k * k; for (const ch of CH) A[ch] = mix(CHOP.wind[ch], CHOP.hit[ch], e); }
        else if (t < T.follow) { const k = (t - T.hit) / (T.follow - T.hit); const e = 1 - (1 - k) * (1 - k); for (const ch of CH) A[ch] = mix(CHOP.hit[ch], CHOP.follow[ch], e); }
        else for (const ch of CH) A[ch] = CHOP.follow[ch];
        aw = t < 0.06 ? smooth(t / 0.06) : 1 - smooth((t - T.follow) / (T.end - T.follow));
        if (t >= T.end) this.anim = null;
      } else {
        const T = BEND_T;
        for (const ch of CH) A[ch] = BEND[ch];
        aw = t < T.in ? smooth(t / T.in) : 1 - smooth((t - T.down) / (T.end - T.down));
        if (t >= T.end) this.anim = null;
      }
      // the arm a swing does not use keeps a little of the walk; the action pose replaces the rest
    }
    const tw = this.torchW += ((this.torchUp ? 1 : 0) - this.torchW) * expo(5, dt);
    alx = mix(alx, -0.6 + alx * 0.25, tw);
    const k1 = 1 - aw;
    this.legL.rotation.x = tl * k1 + A.tl * aw; this.legR.rotation.x = tr * k1 + A.tr * aw;
    this.kneeL.rotation.x = kl * k1 + A.kl * aw; this.kneeR.rotation.x = kr * k1 + A.kr * aw;
    this.armR.rotation.x = arx * k1 + A.rx * aw; this.armL.rotation.x = alx * k1 + A.lx * aw;
    this.armR.rotation.z = -0.12 - 0.05 * rw * mw + (A.rz + 0.12) * aw; this.armL.rotation.z = 0.12 + 0.05 * rw * mw + (A.lz - 0.12) * aw;
    this.chest.rotation.x = crx * k1 + A.cx * aw; this.chest.rotation.y = cry * k1 + A.cy * aw;
    this.body.position.y = bob * k1 + A.by * aw; this.body.position.z = A.bz * aw;
    this.body.rotation.x = bx * k1; this.body.rotation.y = bry * k1; this.body.rotation.z = bz * k1;
    // the head stays steady: it counters the body's lean and follows the idle glance
    this.head.rotation.x = -bx * 0.5 * k1 - crx * k1 + this.lookPitch + A.hx * aw;
    this.head.rotation.y = this.lookYaw * k1 - cry * 0.6 * k1;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing;
    if (c.pose) c.pose(this, dt);   // Maverick: combat poses (combat.js) go over the walk
    if (c.posing && this.anim) this.flushImpact();
  }
}
