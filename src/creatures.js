// Creatures of this strange planet.
//  Puffhop: a round, fluffy, long-eared hopper. Shy, runs away. Hunted for meat and fluff.
//  Thornmaw: a low, spiny night prowler with glowing eyes. Hunts you after dark, but fears fire.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { WATER_Y, FOREST, COAST, SWAMP, MOUNTAIN, SNOW, DESERT } from './world.js';

// Briarlurk (code name thornmaw) attack (Maverick: combat): it stalks to about 2.5 m, glows and crouches
// for WINDUP seconds, then lunges in a straight line (LUNGE_TIME, up to LUNGE_MAX metres). The bite lands
// if it reaches you during the lunge, unless you are rolling (invulnerable). A lunge that misses leaves it
// wobbly for WHIFF seconds: free hits, and they count extra (combat.js).
const WINDUP = 0.6, WINDUP_RANGE = 3.4, LUNGE_TIME = 0.3, LUNGE_MAX = 3.8, BITE_RADIUS = 1.2, WHIFF = 0.75, RECOVER = 0.5;
const COOL_BITE = 1.6, COOL_WHIFF = 1.0, STALK = 2.5;
// After two quick hits (or a stagger) it hops back out of reach and winds up at once: a fight is a few
// exchanges (hit, it hops and glows, you roll, you punish the miss), not a 2-second button mash.
const HOP_SPEED = 13, HOP_TIME = 0.28, EVADE_HITS = 2;

const M = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...extra });

function makePuffhop(rnd) {
  const g = new THREE.Group();
  const fur = M(rnd() < 0.5 ? '#b9a3e8' : '#9fdcc8'), belly = M('#f4efe6'), dark = M('#2a2230'), pink = M('#f2a7c3');
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), fur); body.scale.set(1, 0.88, 1.1); body.position.y = 0.3;
  const tummy = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), belly); tummy.position.set(0, 0.25, 0.16);
  const head = new THREE.Group(); head.position.set(0, 0.5, 0.2);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), fur));
  // Maverick: feel. Each ear hangs from a pivot at its base, so it can flop as the Puffhop hops.
  const ears = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.07, 0.12, -0.03); pivot.rotation.z = -s * 0.25;
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.32, 3, 6), fur); ear.position.y = 0.15;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 4), pink); tip.position.set(0, 0.33, 0);
    pivot.add(ear, tip);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), dark); eye.position.set(s * 0.08, 0.03, 0.16);
    head.add(pivot, eye);
    ears.push(pivot);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), belly); tail.position.set(0, 0.32, -0.33);
  // squash and stretch happens on this inner group (the outer one is scaled when it is defeated)
  const squash = new THREE.Group();
  squash.add(body, tummy, head, tail);
  g.add(squash);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return { g, head, ears, tail, squash, parts: { body }, earA: [0, 0], earV: [0, 0], hopY: 0, mw: 0 };
}

function makeThornmaw(rnd) {
  const g = new THREE.Group();
  const hide = M('#3b4150'), spine = M('#7d5a9a'), jawM = M('#2b2f3a');
  const eyes = new THREE.MeshStandardMaterial({ color: '#2a2200', emissive: '#ffd34a', emissiveIntensity: 3 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 4, 8), hide); body.rotation.x = Math.PI / 2; body.position.y = 0.55;
  g.add(body);
  for (let k = 0; k < 6; k++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.38 - Math.abs(k - 2.5) * 0.04, 5), spine);
    sp.position.set(0, 0.88, -0.5 + k * 0.2); sp.rotation.x = -0.35;
    g.add(sp);
  }
  const head = new THREE.Group(); head.position.set(0, 0.62, 0.7);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.46), hide);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.4), jawM); jaw.position.set(0, -0.18, 0.04);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.04), eyes); e.position.set(s * 0.12, 0.06, 0.23); head.add(e);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 4), spine); horn.position.set(s * 0.16, 0.2, -0.1); horn.rotation.x = -0.8; head.add(horn);
  }
  head.add(skull, jaw);
  g.add(head);
  const legs = [];
  for (const [x, z] of [[-0.24, 0.42], [0.24, 0.42], [-0.24, -0.42], [0.24, -0.42]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.45, z);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.14), jawM); leg.position.y = -0.22;
    pivot.add(leg); g.add(pivot); legs.push(pivot);
  }
  // Maverick: feel. The tail hangs from a pivot at its root, so it can sway and lift.
  const tailPivot = new THREE.Group(); tailPivot.position.set(0, 0.6, -0.58);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 5), hide); tail.rotation.x = -Math.PI / 2 - 0.3; tail.position.set(0, -0.1, -0.33);
  tailPivot.add(tail);
  g.add(tailPivot);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return { g, head, jaw, legs, eyes, spine, body, tailPivot, mw: 0 };
}

export class Creatures {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    this.list = [];
    this.rnd = mulberry32(404);
    this.spawnTimer = 0;
    this.age = 0;   // seconds of play, so the first minutes can bring Puffhops close
  }

  get hostiles() { return this.list.filter((c) => c.type === 'thornmaw' && !c.dead); }
  hostileCount() { let n = 0; for (const c of this.list) if (c.type === 'thornmaw' && !c.dead) n++; return n; }

  spawn(type, x, z) {
    const r = this.rnd;
    const parts = type === 'puffhop' ? makePuffhop(r) : makeThornmaw(r);
    const c = {
      type, ...parts, x, z, y: this.world.heightAt(x, z), yaw: r() * 6, phase: r() * 6,
      hp: 0, maxHp: 0, tx: x, tz: z, wait: 0, state: 'wander', cool: 0, flash: 0, dead: false, deadT: 0, fleeT: 0, windup: 0,
      // Maverick: combat state (knockback velocity, stagger, lunge, whiff and recovery timers)
      kvx: 0, kvz: 0, liftY: 0, liftV: 0, stun: 0, lungeT: 0, hits: 0, hitT: 0, evade: false, hopT: 0, ldx: 0, ldz: 0, lv: 0, bit: false, whiff: 0, recover: 0, poof: false, circle: r() < 0.5 ? 1 : -1,
    };
    // Briarlurk health: about 5 stone-axe hits at level 1 (a few exchanges), fewer with the spear or iron sword
    c.maxHp = c.hp = type === 'puffhop' ? 12 : 66 + ((this.level || 1) - 1) * 10;
    // materials that flash white when hit (found once here, not every frame)
    c.flashMats = [];
    c.g.traverse((m) => { if (m.isMesh && m.material.emissive && m.material !== c.eyes && m.material !== c.spine && !c.flashMats.includes(m.material)) c.flashMats.push(m.material); });
    c.lastFlash = -1;
    c.g.rotation.order = 'YXZ';   // so the lunge lean and the dizzy wobble follow its heading
    c.g.position.set(x, c.y, z);
    this.scene.add(c.g);
    this.list.push(c);
    return c;
  }

  walkable(x, z) {
    const y = this.world.heightAt(x, z);
    return y > WATER_Y + 0.05 && this.world.steepness(Math.floor(x + 112), Math.floor(z + 112)) < 0.8
      && !(this.world.wallAt && this.world.wallAt(x, z));   // Forge: building (walls and fences stop creatures)
  }

  // Keep a few Puffhops around in the day; send Thornmaws at night.
  manage(dt, player, ctx) {
    this.level = ctx.level;
    this.age += dt;
    this.spawnTimer -= dt;
    const px = player.pos.x, pz = player.pos.z;
    for (const c of this.list) {
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d > 55 && !c.dead) { c.dead = true; c.deadT = 99; }
    }
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 2.5;
    const b = this.world.biomeAt(px, pz);
    const hops = this.list.filter((c) => c.type === 'puffhop' && !c.dead).length;
    const leafy = b === FOREST || b === COAST || b === SWAMP || b === MOUNTAIN;
    // In the first few daytime minutes keep two Puffhops in easy reach (9-13 m), so hunting is easy to find.
    const close = this.list.filter((c) => c.type === 'puffhop' && !c.dead && Math.hypot(c.x - px, c.z - pz) < 16).length;
    const early = this.age < 240 && ctx.hour > 6 && ctx.hour < 19;
    if (leafy && hops < 5) this.trySpawn('puffhop', px, pz, early && close < 2 ? 9 : 14, early && close < 2 ? 13 : 30);
    const night = ctx.hour >= 20.5 || ctx.hour < 5.2;
    const maxMaws = Math.min(4, 1 + Math.floor((ctx.level - 1) / 2));
    if (night && this.hostileCount() < maxMaws && b !== DESERT) {
      this.trySpawn('thornmaw', px, pz, 22, 30, ctx.fires);
    }
  }

  trySpawn(type, px, pz, rMin, rMax, fires = []) {
    for (let t = 0; t < 8; t++) {
      const a = this.rnd() * Math.PI * 2, r = rMin + this.rnd() * (rMax - rMin);
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (Math.abs(x) > 105 || Math.abs(z) > 105 || !this.walkable(x, z)) continue;
      if (fires.some((f) => Math.hypot(f.x - x, f.z - z) < 9)) continue;
      return this.spawn(type, x, z);
    }
    return null;
  }

  // ctx: { hour, fires: [{x,z,lit}], level }; returns damage dealt to the player this frame
  update(dt, time, player, ctx, events) {
    this.manage(dt, player, ctx);
    let damage = 0;
    const px = player.pos.x, pz = player.pos.z;
    const day = ctx.hour > 5.6 && ctx.hour < 20.2;
    for (const c of this.list) {
      if (c.dead) {
        // Maverick: combat. Defeated creatures swell and flash white for a moment, then puff away
        // into leaves or fluff and sparks (combat.defeat). Others (despawned) just go.
        const was = c.deadT;
        c.deadT += dt;
        if (c.poof && was < 0.09) {
          c.g.scale.setScalar(1 + Math.min(c.deadT, 0.09) * 2.2);
          for (const m of c.flashMats) m.emissive.setRGB(1.4, 1.4, 1.4);
          if (c.deadT >= 0.09) { c.g.visible = false; if (this.combat) this.combat.defeat(c); }
        }
        continue;
      }
      c.flash = Math.max(0, c.flash - dt * 4);
      c.cool = Math.max(0, c.cool - dt);
      const dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz);
      let speed = 0, tx = c.tx, tz = c.tz;

      if (c.type === 'puffhop') {
        if (d < 6 || c.fleeT > 0) {
          c.fleeT = d < 6 ? 2.5 : c.fleeT - dt;
          tx = c.x - dx / (d || 1) * 4; tz = c.z - dz / (d || 1) * 4; speed = 4.2;
        } else {
          c.wait -= dt;
          if (c.wait <= 0) {
            const a = this.rnd() * 6.28, r = 1 + this.rnd() * 4;
            c.tx = c.x + Math.cos(a) * r; c.tz = c.z + Math.sin(a) * r; c.wait = 1.5 + this.rnd() * 4;
          }
          tx = c.tx; tz = c.tz; speed = Math.hypot(tx - c.x, tz - c.z) > 0.2 ? 1.2 : 0;
        }
      } else {
        // fire keeps them back: stay outside a ring around any lit fire
        const fire = ctx.fires.find((f) => f.lit && Math.hypot(f.x - c.x, f.z - c.z) < 7.5);
        const playerSafe = ctx.fires.some((f) => f.lit && Math.hypot(f.x - px, f.z - pz) < 5);
        if (day) { c.state = 'leave'; c.windup = 0; c.lungeT = 0; }
        // Maverick: combat. Stagger, lunge, whiff and recovery come first.
        if (c.hitT > 0) { c.hitT -= dt; if (c.hitT <= 0) c.hits = 0; }
        if (c.evade && c.stun <= 0 && c.lungeT <= 0) {
          // hop back, away from you (shaking off any dizziness), then glow straight away
          c.evade = false; c.hits = 0; c.hopT = HOP_TIME; c.recover = 0; c.cool = 0; c.whiff = 0;
          c.kvx = -dx / (d || 1) * HOP_SPEED; c.kvz = -dz / (d || 1) * HOP_SPEED;
          events.push({ type: 'growl', x: c.x, z: c.z });
        }
        if (c.hopT > 0) { c.hopT -= dt; speed = 0; }
        else if (c.stun > 0) { c.stun -= dt; c.windup = 0; speed = 0; }
        else if (c.lungeT > 0) {
          // the lunge: a fast, straight dash that eases out. It does not steer, so a roll to the side escapes it.
          c.lungeT -= dt;
          const k = 1 - Math.max(0, c.lungeT) / LUNGE_TIME;
          const v = c.lv * 1.5 * (1 - k * k);
          const nx = c.x + c.ldx * v * dt, nz = c.z + c.ldz * v * dt;
          if (this.walkable(nx, nz)) { c.x = nx; c.z = nz; }
          const bd = Math.hypot(px - c.x, pz - c.z);
          if (!c.bit && bd < BITE_RADIUS) {
            c.bit = true;
            if (player.invuln > 0) c.dodged = true;   // rolled through it: combat.lungeMissed shows "Dodged!"
            else {
              const dmg = 8 + (ctx.level - 1);
              damage += dmg; events.push({ type: 'bite', x: c.x, z: c.z });
              // a small shove back
              if (player.kick) { player.kick.x += (px - c.x) / (bd || 1) * 5; player.kick.z += (pz - c.z) / (bd || 1) * 5; }
              if (this.combat) this.combat.bitten(c, dmg);
              c.lungeT = 0;
            }
          }
          if (c.lungeT <= 0) {
            c.lungeT = 0;
            if (c.bit && !c.dodged) { c.recover = RECOVER; c.cool = COOL_BITE; }
            else { c.whiff = WHIFF; c.cool = COOL_WHIFF; if (this.combat) this.combat.lungeMissed(c); }   // missed: wobbly and open
          }
          speed = 0;
        } else if (c.whiff > 0) { c.whiff -= dt; speed = 0; }
        else if (c.recover > 0) { c.recover -= dt; tx = c.x - dx; tz = c.z - dz; speed = 1.4; }   // backs off after a bite
        else if (c.state === 'leave') {
          tx = c.x - dx; tz = c.z - dz; speed = 3.5;
          if (d > 40) { c.dead = true; c.deadT = 99; }
        } else if (fire) {
          tx = c.x + (c.x - fire.x); tz = c.z + (c.z - fire.z); speed = 3.2;
          if (this.rnd() < dt * 0.3) events.push({ type: 'growl', x: c.x, z: c.z });
        } else if (playerSafe && d < 10) {
          // circle the edge of the firelight
          const a = Math.atan2(c.z - pz, c.x - px) + dt * 0.4;
          tx = px + Math.cos(a) * 8; tz = pz + Math.sin(a) * 8; speed = 1.6;
        } else if (d < 20) {
          // stalk: close in to about 2.5 m, then circle slowly until the next lunge is ready
          if (d > STALK + 0.3) { tx = px; tz = pz; speed = 3.6; }
          else {
            const a = Math.atan2(c.z - pz, c.x - px) + c.circle * 0.5;
            tx = px + Math.cos(a) * STALK; tz = pz + Math.sin(a) * STALK; speed = 1.3;
          }
          if (d < WINDUP_RANGE + 0.6 && c.cool <= 0 && c.windup <= 0) {
            c.windup = WINDUP;   // a clear, glowing wind-up: time to roll away
            events.push({ type: 'growl', x: c.x, z: c.z });
          }
        } else {
          c.wait -= dt;
          if (c.wait <= 0) { c.tx = c.x + (dx / d) * 6 + (this.rnd() - 0.5) * 8; c.tz = c.z + (dz / d) * 6 + (this.rnd() - 0.5) * 8; c.wait = 3; }
          tx = c.tx; tz = c.tz; speed = 2.0;
        }
        if (c.windup > 0 && c.stun <= 0) {
          c.windup -= dt; speed = 0;
          if (c.windup <= 0) {
            // launch the lunge at where you are now, a little past you
            c.windup = 0;
            const l = Math.min(LUNGE_MAX, d + 0.8);
            c.ldx = dx / (d || 1); c.ldz = dz / (d || 1); c.lv = l / LUNGE_TIME;
            c.lungeT = LUNGE_TIME; c.bit = false; c.dodged = false;
            c.yaw = Math.atan2(c.ldx, c.ldz);
            events.push({ type: 'lunge', x: c.x, z: c.z });
          }
        }
      }

      // Maverick: combat. Knockback slides it back and eases off.
      if (c.kvx || c.kvz) {
        const nx = c.x + c.kvx * dt, nz = c.z + c.kvz * dt;
        if (this.walkable(nx, nz)) { c.x = nx; c.z = nz; } else { c.kvx = 0; c.kvz = 0; }
        const f = Math.exp(-dt * 8); c.kvx *= f; c.kvz *= f;
        if (Math.abs(c.kvx) + Math.abs(c.kvz) < 0.05) { c.kvx = 0; c.kvz = 0; }
      }

      // move toward the target, staying on dry, gentle ground
      const mx = tx - c.x, mz = tz - c.z, ml = Math.hypot(mx, mz);
      if (speed > 0 && ml > 0.1) {
        const step = Math.min(ml, speed * dt);
        const nx = c.x + mx / ml * step, nz = c.z + mz / ml * step;
        if (this.walkable(nx, nz)) { c.x = nx; c.z = nz; } else { c.tx = c.x; c.tz = c.z; c.wait = 0; }
        const want = Math.atan2(mx, mz);
        let a = want - c.yaw; a = Math.atan2(Math.sin(a), Math.cos(a));
        c.yaw += a * Math.min(1, dt * 8);
      }
      if (c.type === 'thornmaw' && c.windup > 0) {
        const want = Math.atan2(dx, dz);
        let a = want - c.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); c.yaw += a * Math.min(1, dt * 10);
      }
      // keep a little space from the player (measured after this frame's moves)
      { const ex = px - c.x, ez = pz - c.z, ed = Math.hypot(ex, ez); if (ed < 0.9 && ed > 0.01) { c.x = px - ex / ed * 0.9; c.z = pz - ez / ed * 0.9; } }

      c.y = this.world.heightAt(c.x, c.z);
      const moving = speed > 0 && ml > 0.1;
      // Maverick: feel. mw eases between standing and moving, so legs and hops never snap.
      c.mw += ((moving ? 1 : 0) - c.mw) * (1 - Math.exp(-dt * 7));
      c.phase += dt * (moving ? speed * 3 : 1.5);
      if (c.type === 'puffhop') {
        // a hop: up and down; squashes as it lands and pushes off, stretches in the air
        if (moving) c.hopPh = (c.hopPh || 0) + dt * (4 + speed * 2.2);
        const hs = Math.abs(Math.sin(c.hopPh || 0)), hop = hs * (0.18 + speed * 0.04) * c.mw;
        const vy = (hop - c.hopY) / Math.max(dt, 1e-4); c.hopY = hop;
        const sq = Math.max(0, 1 - hs * 5) * c.mw, st = Math.min(1, Math.abs(vy) * 0.6) * (1 - sq) * c.mw;
        c.g.position.set(c.x, c.y + hop, c.z);
        c.squash.scale.set(1 + sq * 0.16 - st * 0.07, 1 - sq * 0.22 + st * 0.14, 1 + sq * 0.1 - st * 0.02);
        // ears flop: a spring that lags behind the hop (they fold back going up, flick forward landing)
        for (let k = 0; k < 2; k++) {
          const goal = -Math.max(-1.2, Math.min(1.2, vy * 0.35)) + (moving ? -0.25 : 0) + (moving ? 0 : Math.sin(time * 0.9 + c.phase + k) * 0.06);
          c.earV[k] += ((goal - c.earA[k]) * 120 - c.earV[k] * (9 + k * 1.5)) * Math.min(dt, 0.04);
          c.earA[k] += c.earV[k] * dt;
          c.ears[k].rotation.x = c.earA[k];
        }
        // an occasional ear twitch when it sits still
        if (!moving && Math.random() < dt * 0.4) c.earV[Math.random() < 0.5 ? 0 : 1] += 6;
        // the fluffy tail wiggles (quickly while it sits, a bounce while it hops)
        c.tail.position.x = Math.sin(time * 16 + c.phase) * (moving ? 0.015 : 0.03 * Math.max(0, Math.sin(time * 1.3 + c.phase)));
        c.tail.position.y = 0.32 + vy * 0.012;
        c.head.rotation.x = moving ? 0 : Math.max(0, Math.sin(c.phase * 2)) * 0.4 * (1 - c.mw); // nibbling
      } else {
        // wind-up: 0 -> 1 over the half second before the lunge
        const wu = c.windup > 0 ? 1 - c.windup / WINDUP : 0;
        // Maverick: combat. Lunging: stretched long, jaws wide. Whiff or stagger: a dizzy wobble.
        const lg = c.lungeT > 0 ? Math.sin((1 - c.lungeT / LUNGE_TIME) * Math.PI) : 0;
        const wob = c.whiff > 0 ? c.whiff / WHIFF : c.stun > 0 ? Math.min(1, c.stun * 2) : 0;
        const hop = c.hopT > 0 ? Math.sin((1 - c.hopT / HOP_TIME) * Math.PI) * 0.45 : 0;
        c.g.position.set(c.x, c.y - wu * 0.12 + lg * 0.25 + hop, c.z);
        c.g.scale.set(1, 1 - wu * 0.18 - lg * 0.05, 1 + lg * 0.2);   // crouches low, then springs
        c.g.rotation.z = Math.sin(time * 13) * 0.22 * wob;
        c.g.rotation.x = lg * -0.15 + wob * 0.08;
        // Maverick: feel. Legs step: each swings forward lifted, then pushes back planted (a walking gait,
        // eased in and out), the body bobs and rolls a little with the steps; standing still it breathes.
        const mw = c.mw, br = Math.sin(time * 2.2 + c.phase * 0.1);
        for (let k = 0; k < 4; k++) {
          const p = c.phase + (k === 1 || k === 2 ? Math.PI : 0) + (k > 1 ? Math.PI / 2 : 0);
          const l = c.legs[k];
          l.rotation.x = Math.sin(p) * 0.55 * mw;
          l.position.y = 0.45 + Math.max(0, -Math.cos(p)) * 0.09 * mw;   // lifted while swinging forward
        }
        c.g.position.y += Math.abs(Math.sin(c.phase)) * 0.03 * mw;
        c.g.rotation.z += Math.sin(c.phase) * 0.04 * mw;
        c.body.scale.set(1 + br * 0.03 * (1 - mw), 1, 1 + br * 0.04 * (1 - mw));
        // the tail sways side to side, faster when it moves; it lifts and goes stiff during the wind-up
        c.tailPivot.rotation.y = Math.sin(time * (1.6 + mw * 3) + c.phase * 0.5) * (0.3 + mw * 0.15) * (1 - wu);
        c.tailPivot.rotation.x = -0.45 * wu - lg * 0.3 + br * 0.04;
        c.jaw.rotation.x = c.windup > 0 ? 0.2 + wu * 0.5 : c.lungeT > 0 ? 0.75 : wob > 0 ? 0.35 : 0;
        c.head.position.z = 0.7 + (c.windup > 0 ? -0.15 * wu : c.lungeT > 0 ? 0.25 * lg : 0);
        c.head.rotation.x = wob * 0.35;   // head droops while dizzy
        // eyes and spines blaze up during the wind-up
        c.eyes.emissiveIntensity = (2 + ctx.night * 3 + wu * 9) * (1 - wob * 0.7);
        c.eyes.emissive.setRGB(1, 0.83 - wu * 0.45, 0.29 - wu * 0.2);
        const sg = Math.max(wu * 1.6 + (c.windup > 0 ? Math.sin(time * 40) * 0.15 : 0), c.flash);
        c.spine.emissive.setRGB(sg, sg * 0.35, sg * 0.75);
      }
      // Maverick: moves. An uppercut pops it into the air; it falls back with a little bounce-free thump.
      if (c.liftV || c.liftY) {
        c.liftV -= 22 * dt; c.liftY = Math.max(0, c.liftY + c.liftV * dt);
        if (c.liftY === 0) c.liftV = 0;
        c.g.position.y += c.liftY;
      }
      c.g.rotation.y = c.yaw;
      if (c.flash !== c.lastFlash) { c.lastFlash = c.flash; for (const m of c.flashMats) m.emissive.setRGB(c.flash, c.flash, c.flash); }
    }
    // clean up
    for (let k = this.list.length - 1; k >= 0; k--) {
      const c = this.list[k];
      if (c.dead && c.deadT > 0.4) { this.scene.remove(c.g); this.list.splice(k, 1); }
    }
    return damage;
  }

  // Player swings: hit the nearest creature in front within reach. Returns what was hit.
  hit(player, reach, damage) {
    let best = null, bd = 1e9;
    const fx = Math.sin(player.facing), fz = Math.cos(player.facing);
    for (const c of this.list) {
      if (c.dead) continue;
      const dx = c.x - player.pos.x, dz = c.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d > reach + (c.type === 'thornmaw' ? 0.5 : 0.2)) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.2 && d > 0.8) continue;
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return null;
    const kx = best.x - player.pos.x, kz = best.z - player.pos.z, kl = Math.hypot(kx, kz) || 1;
    return this.strike(best, damage, kx / kl, kz / kl, 0.6, 0);
  }

  // Maverick: combat. A hit from combat.js: damage, a white flash, knockback (metres) and an optional
  // stagger (seconds) that stops a wind-up, and an optional lift (an uppercut pops it up). Returns { killed, c }.
  strike(c, dmg, dirX, dirZ, knock, stagger, lift = 0) {
    if (c.dead) return null;
    c.hp -= dmg; c.flash = 1;
    if (lift > 0) c.liftV = Math.max(c.liftV, 4.4 * lift);   // Maverick: moves (about 0.45 m up)
    const k = knock * (c.type === 'thornmaw' && c.lungeT > 0 ? 0.4 : 1);
    c.kvx += dirX * k * 8; c.kvz += dirZ * k * 8;
    if (c.type === 'puffhop') c.fleeT = 3;
    else {
      // once it glows it cannot be stopped (roll!); otherwise a finisher staggers it
      if (stagger > 0 && c.windup <= 0 && c.lungeT <= 0 && c.whiff <= 0) c.stun = Math.max(c.stun, stagger);
      // hits add up (also while it is dizzy); after two it hops back once it can and glows again
      if (c.windup <= 0 && c.lungeT <= 0) { c.hits++; c.hitT = 1.2; if (c.hits >= EVADE_HITS || stagger > 0) c.evade = true; }
    }
    if (c.hp <= 0) { this.kill(c); return { killed: true, c }; }
    return { killed: false, c };
  }
  kill(c) { c.dead = true; c.deadT = 0; c.poof = true; c.windup = 0; c.lungeT = 0; c.flash = 1; }

  // nearest living creature (for auto-aim)
  nearest(x, z, max) {
    let best = null, bd = max;
    for (const c of this.list) {
      if (c.dead) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  clearHostiles() { for (const c of this.list) if (c.type === 'thornmaw') { c.dead = true; c.deadT = 99; } }
}
