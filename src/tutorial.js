// The guided start for a new game: eight short, simple steps that end with your first log cabin.
// It can't be skipped, but each step is one easy thing, shown on a small card under the news strip,
// with a bouncing arrow and a soft glow on the exact spot in the world, an arrow at the screen edge
// (with the distance) when the spot is off-screen, and an arrow at the button to press.
// The old pop-up tips and the goal card wait until it is done.
import * as THREE from 'three';
import { WATER_Y, SITE } from './world.js';
import { Burst, G, FLOOR_H, WALL_H, PIECES } from './build.js';

const TOTAL = 8;
// the first cabin: a floor, three walls, a door wall (facing the start) and a roof
// the first cabin (4 x 4 m): 4 floors, 6 walls, a door wall, a window wall and 4 roofs
const CABIN_COST = { wood: 40, stone: 4 };
const FIRE_COST = { stick: 4, stone: 3 };

const CSS = `
  body.tut-on #objective { display: none; }
  #tut-card { position: fixed; z-index: 3; left: 50%; top: calc(8px + var(--bar-h) + var(--ticker-h)); transform: translateX(-50%); box-sizing: border-box;
    width: max-content; max-width: min(380px, calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
    padding: 9px 14px 10px; border-radius: 14px; border: 1px solid rgba(255, 179, 92, 0.7); background: rgba(20, 26, 22, 0.9); box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
    display: grid; gap: 5px; pointer-events: none; }
  #tut-card.pop { animation: tutpop 0.45s cubic-bezier(.2, 1.6, .4, 1); }
  @keyframes tutpop { from { transform: translateX(-50%) scale(0.85); opacity: 0.2; } }
  .tc-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .tc-step { font: 600 12px/1 var(--font-display); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ember); }
  .tc-dots { display: flex; gap: 4px; } .tc-dots i { width: 7px; height: 7px; border-radius: 50%; background: rgba(255, 236, 200, 0.22); }
  .tc-dots i.on { background: var(--ember); } .tc-dots i.now { background: #fff1c8; box-shadow: 0 0 0 2px rgba(255, 179, 92, 0.6); }
  .tc-text { font: 700 15px/1.35 var(--font-body); color: var(--ink); }
  .tc-text b { font-weight: 700; color: #2a2018; background: rgba(255, 210, 150, 0.95); border-radius: 5px; padding: 0 5px; white-space: nowrap; }
  .tc-meta { display: flex; gap: 8px; font: 700 13px/1 var(--font-body); color: var(--ink-dim); font-variant-numeric: tabular-nums; }
  .tc-meta span:empty { display: none; }
  .tc-meta .tc-prog { color: #b8e890; }
  #tut-card.party { border-color: #ffe08a; background: linear-gradient(135deg, rgba(90, 60, 20, 0.95), rgba(20, 26, 22, 0.92)); }
  #tut-card.party .tc-text { font-size: 16px; }
  #tut-edge { position: fixed; z-index: 3; left: 0; top: 0; width: 58px; height: 58px; margin: -29px 0 0 -29px; border-radius: 50%; display: grid; place-items: center;
    background: rgba(255, 179, 92, 0.95); box-shadow: 0 0 0 4px rgba(255, 179, 92, 0.3), 0 4px 14px rgba(0, 0, 0, 0.4); pointer-events: none; }
  #tut-edge svg { width: 30px; height: 30px; fill: #2a2018; display: block; }
  #tut-edge span { position: absolute; top: 62px; left: 50%; transform: translateX(-50%); font: 700 13px/1 var(--font-body); color: #fff8ec; background: rgba(12, 17, 14, 0.8); padding: 3px 7px; border-radius: 7px; white-space: nowrap; }
  #tut-point { position: fixed; z-index: 9; left: 0; top: 0; width: 44px; height: 44px; margin: -22px 0 0 -22px; pointer-events: none; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6)); }
  #tut-point svg { width: 44px; height: 44px; display: block; }
  .tut-hl { outline: 3px solid var(--ember) !important; outline-offset: 2px; animation: tutring 1.1s ease-in-out infinite; }
  @keyframes tutring { 50% { box-shadow: 0 0 0 7px rgba(255, 179, 92, 0.5); } }
  @media (orientation: landscape) and (max-height: 500px) { #tut-card { padding: 6px 12px 7px; gap: 3px; max-width: min(420px, 48vw); } .tc-text { font-size: 13px; line-height: 1.3; } .tc-meta { font-size: 12px; } .tc-step { font-size: 11px; } }
  @media (prefers-reduced-motion: reduce) { #tut-card.pop, .tut-hl { animation: none; } }
`;
const ARROW_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.2h9.5V5.5L21 12l-7.5 6.5v-4.7H4z"/></svg>';
const POINT_SVG = '<svg viewBox="0 0 44 44" aria-hidden="true"><path d="M4 17h20V7l17 15-17 15V27H4z" fill="#ffb35c" stroke="#2a2018" stroke-width="2.5" stroke-linejoin="round"/></svg>';

// a soft round glow texture (white in the middle, clear at the edge)
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// a beam texture that fades out upwards
function beamTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.8)');
  x.fillStyle = g; x.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Tutorial {
  constructor({ scene, world, game, builder, camera, hud, audio }) {
    Object.assign(this, { scene, world, game, builder, camera, hud, audio });
    this.active = false;
    this.step = 0;
    this.base = {};
    this.plan = null;          // { a, b, door } the first cabin's cell and its door side
    this.crate = false;        // the supplies were given
    this.fire = false;         // sticks and stones for the fire were given
    this.saved = null;
    this.t = 0;
    this.think = 0;
    this.target = null;
    this.ui = null;
    this.makeWorldBits();
    this.makeUI();
  }

  // ---------- the arrow, glow and beam in the world ----------
  makeWorldBits() {
    const ember = '#ffb35c';
    const g = new THREE.Group();
    const arrowMat = new THREE.MeshBasicMaterial({ color: ember });
    const edgeMat = new THREE.MeshBasicMaterial({ color: '#3a2412' });
    const arrow = new THREE.Group();
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.6, 4), arrowMat); head.rotation.x = Math.PI; head.position.y = 0.3;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.6, 0.26), arrowMat); shaft.position.y = 0.88;
    const back = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.72, 4), edgeMat); back.rotation.x = Math.PI; back.position.y = 0.3; back.scale.set(1, 1, 0.6); back.position.z = -0.05;
    arrow.add(back, head, shaft);
    const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffcf6a', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMat); glow.rotation.x = -Math.PI / 2; glow.renderOrder = 6;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 4, 32), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = Math.PI / 2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 10, 1, true), new THREE.MeshBasicMaterial({ map: beamTexture(), color: '#ffd27a', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.renderOrder = 6;
    g.add(arrow, glow, ring, beam);
    g.visible = false;
    this.scene.add(g);
    this.beacon = { g, arrow, glow, ring, beam };
    // confetti for the finish
    this.confetti = new Burst(this.scene, { cap: 110, geo: new THREE.BoxGeometry(1, 1, 1) });
    // the cabin plan: see-through blue outlines of every piece still to place
    this.planMat = new THREE.MeshBasicMaterial({ color: '#9fdcff', transparent: true, opacity: 0.16, depthWrite: false });
    this.planNextMat = new THREE.MeshBasicMaterial({ color: '#b8f0ff', transparent: true, opacity: 0.35, depthWrite: false });
    this.planLine = new THREE.LineBasicMaterial({ color: '#d8f4ff', transparent: true, opacity: 0.55, depthWrite: false });
    this.planGroup = new THREE.Group();
    this.planGroup.visible = false;
    this.scene.add(this.planGroup);
  }

  makeUI() {
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    const card = document.createElement('div');
    card.id = 'tut-card'; card.hidden = true;
    card.setAttribute('role', 'status'); card.setAttribute('aria-live', 'polite');
    card.innerHTML = `<div class="tc-top"><span class="tc-step" id="tc-step"></span><span class="tc-dots" aria-hidden="true">${'<i></i>'.repeat(TOTAL)}</span></div>
      <div class="tc-text" id="tc-text"></div><div class="tc-meta"><span class="tc-prog" id="tc-prog"></span><span id="tc-dist"></span></div>`;
    document.body.appendChild(card);
    const edge = document.createElement('div');
    edge.id = 'tut-edge'; edge.hidden = true; edge.setAttribute('aria-hidden', 'true');
    edge.innerHTML = `<div id="te-rot">${ARROW_SVG}</div><span id="te-dist"></span>`;
    document.body.appendChild(edge);
    const point = document.createElement('div');
    point.id = 'tut-point'; point.hidden = true; point.setAttribute('aria-hidden', 'true');
    point.innerHTML = POINT_SVG;
    document.body.appendChild(point);
    const $ = (id) => document.getElementById(id);
    this.el = { card, edge, point, step: $('tc-step'), text: $('tc-text'), prog: $('tc-prog'), dist: $('tc-dist'), rot: $('te-rot'), edist: $('te-dist'), dots: [...card.querySelectorAll('.tc-dots i')] };
  }

  get touch() { return document.body.classList.contains('touch'); }
  // phone words and computer words: T('Tap <b>USE</b>', 'Press <b>E</b>')
  T(t, k) { return this.touch ? t : k; }

  // ---------- starting, saving ----------
  // Called when play begins. A new game starts the tutorial; a saved one carries on where it was.
  // Saves from before the tutorial existed skip it, unless they had barely started.
  begin(loaded) {
    if (/[?&]tutorial=off\b/.test(location.search)) return;
    const s = this.saved;
    if (loaded && s) {
      if (s.done || !s.step) return;
      Object.assign(this, { step: s.step, base: s.base || {}, plan: s.plan || null, crate: !!s.crate, fire: !!s.fire });
      this.activate();
      this.enter(this.step, true);
      return;
    }
    const g = this.game;
    if (loaded && (g.objective > 1 || g.structures.length || this.builder.pieces.size)) return;
    this.step = 0;
    this.activate();
    this.go(1);
  }
  activate() {
    this.active = true;
    document.body.classList.add('tut-on');
    this.el.card.hidden = false;
    this.builder.magnet = (kind, x, z, initial) => this.magnet(kind, x, z, initial);
  }
  serialize() {
    if (!this.active) return this.step >= TOTAL || this.finished ? { done: true } : null;
    return { step: this.step, base: this.base, plan: this.plan, crate: this.crate, fire: this.fire };
  }
  load(data) { this.saved = data && typeof data === 'object' ? data : null; if (this.saved && this.saved.done) this.finished = true; }
  skip() { this.finish(true); }

  go(n) {
    this.step = n;
    this.enter(n, false);
    this.game.save();
  }
  // set up a step (again, after loading a save)
  enter(n, resumed) {
    const c = this.game.counters;
    if (!resumed) {
      this.base = { stick: c.stick || 0, stone: c.stone || 0, fiber: c.fiber || 0, wood: c.wood || 0, fire: c.built_campfire || 0 };
      if (n > 1) { this.audio.sfx('craft'); this.game.addXP(5); }
      this.el.card.classList.remove('pop'); void this.el.card.offsetWidth; this.el.card.classList.add('pop');
    }
    if (n === 3) this.grassByTheWater();
    if (n === 6) {
      if (this.plan && this.plan.v !== 2 && !this.builder.floorAt(this.plan.a, this.plan.b)) this.plan = null;   // a plan from the old small cabin
      if (!this.plan) { this.plan = this.findPlot(); if (this.plan) this.plan.v = 2; }
      if (!this.crate) {
        this.crate = true;
        const wood = Math.max(30, CABIN_COST.wood - (this.game.inv.wood || 0)), stone = Math.max(3, CABIN_COST.stone - (this.game.inv.stone || 0));
        this.game.add('wood', wood); this.game.add('stone', stone);
        this.hud.news(`A crate of supplies washed up! +${wood} wood, +${stone} stone`, 'Lucky!');
      }
      this.showPlan();
    } else this.hidePlan();
    if (n === 7 && !resumed && this.builder.open) this.builder.toggle(false);   // the cabin's done: the build bar steps aside
    if (n === 7 && !this.fire) {
      this.fire = true;
      const give = Object.entries(FIRE_COST).map(([id, k]) => [id, Math.max(0, k - (this.game.inv[id] || 0))]).filter(([, k]) => k > 0);
      for (const [id, k] of give) this.game.add(id, k);
      if (give.length) this.hud.news('The crate had sticks and stones for a fire, too', 'Lucky!');
    }
    if (n === TOTAL && !resumed) this.celebrate();
    if (n === TOTAL && resumed) this.finish();
    this.think = 0;
    this.lastHtml = '';
  }

  finish(quiet = false) {
    this.active = false;
    this.finished = true;
    this.step = TOTAL;
    document.body.classList.remove('tut-on');
    this.el.card.hidden = true; this.el.edge.hidden = true; this.el.point.hidden = true;
    this.beacon.g.visible = false;
    this.hidePlan();
    this.clearHighlight();
    this.builder.magnet = null;
    this.game.hud.dirty = true;
    if (!quiet) this.hud.news('Your goals are back up top. Explore, build and stay warm!', 'Nice work');
    this.game.save();
  }

  celebrate() {
    const p = this.game.player.pos;
    this.confetti.emit(p.x, p.y + 1.6, p.z, { n: 80, speed: 4, up: 7, gravity: 9, drag: 1.2, life: 2.4, size: 0.16, spread: 0.6, grow: 0, flat: true,
      colors: ['#ffb35c', '#ffe08a', '#ff8fb4', '#7fd0e8', '#b8e890', '#ffffff', '#c9a3ff'] });
    this.builder.dust.emit(p.x, p.y + 0.2, p.z, { n: 14, speed: 3, colors: ['#fff1c8', '#ffe08a'], size: 0.1, life: 0.9 });
    this.audio.sfx('levelup');
    this.game.addXP(50);
    this.partyUntil = this.t + 7;
    this.hud.news('You built your first cabin! You\'re a natural', 'You did it!');
  }

  // ---------- places in the world ----------
  // three tufts of long grass right at the pond's edge, on the side facing the start
  grassByTheWater() {
    const g = this.game, w = this.world, P = SITE.pond;
    if (g.pickups.some((o) => o.tut)) return;
    const a0 = Math.atan2(SITE.spawn.z - P.z, SITE.spawn.x - P.x);
    const spots = [];
    for (let k = 0; spots.length < 3 && k < 40; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.16;
      // walk out from the middle of the pond until the ground is dry: that's the bank
      for (let s = 0.6; s < 2.4; s += 0.05) {
        const x = P.x + Math.cos(a) * P.rx * s, z = P.z + Math.sin(a) * P.rz * s;
        const y = w.heightAt(x, z);
        if (y > WATER_Y + 0.08) {
          const x2 = x + Math.cos(a) * 0.5, z2 = z + Math.sin(a) * 0.5;
          if (w.heightAt(x2, z2) > WATER_Y + 0.08 && w.steepness(Math.floor(x2 + 112), Math.floor(z2 + 112)) < 0.6 && !spots.some(([sx, sz]) => Math.hypot(sx - x2, sz - z2) < 1.2)) spots.push([x2, z2]);
          break;
        }
      }
    }
    for (const [x, z] of spots) {
      const y = w.heightAt(x, z);
      const o = { type: 'pickup', item: 'fiber', x, z, y, rot: Math.random() * 6, s: 1.1, slot: -1, alive: true, back: 0, tut: true };
      o.slot = g.dyn.fiber.add(x, y, z, o.rot, o.s);
      if (o.slot < 0) continue;
      g.pickups.push(o); g.register(o);
    }
  }

  // A flat, open 4 x 4 m spot (2 x 2 cells) near the start for the first cabin, with its door facing
  // the start, a window on the far side and room for a campfire by the door.
  // The world is the same every time, so this is too.
  findPlot() {
    const b = this.builder, s = SITE.spawn;
    // the reserved clearing (no trees or bushes grow there, at any graphics level)
    if (SITE.plot) {
      const plan = { a: SITE.plot.a, b: SITE.plot.b, door: 0 }, cx = plan.a * G + 2, cz = plan.b * G + 2;
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      plan.door = dirs.map(([dx, dz], k) => [dx * (s.x - cx) + dz * (s.z - cz), k]).sort((p, q) => q[0] - p[0])[0][1];
      this.clearPlot(plan);
      if (this.cells(plan).every(([i, j]) => b.check({ kind: 'floor', a: i, b: j, o: 0, r: 0 }, { free: true }).ok)) return plan;
    }
    const cands = [];
    for (let j = -8; j <= 8; j++) for (let i = -8; i <= 8; i++) {
      const a0 = Math.floor(s.x / G) + i, b0 = Math.floor(s.z / G) + j;
      const x = a0 * G + 2, z = b0 * G + 2, d = Math.hypot(x - s.x, z - s.z);
      if (d < 6 || d > 18) continue;
      cands.push([d, a0, b0]);
    }
    cands.sort((p, q) => p[0] - q[0]);
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (const [, a, bb] of cands) {
      const plan = { a, b: bb, door: 0 };
      const cells = this.cells(plan);
      if (!cells.every(([i, j]) => b.check({ kind: 'floor', a: i, b: j, o: 0, r: 0 }, { free: true }).ok)) continue;
      if (!this.perimeter(plan).every(([i, j, sd]) => { const [ea, eb, eo] = b.sideEdge(i, j, sd); return b.check({ kind: 'wall', a: ea, b: eb, o: eo, r: 0 }, { free: true }).ok; })) continue;
      const cx = a * G + 2, cz = bb * G + 2;
      plan.door = dirs.map(([dx, dz], k) => [dx * (s.x - cx) + dz * (s.z - cz), k]).sort((p, q) => q[0] - p[0])[0][1];
      const f = this.fireSpot(plan);
      if (this.world.heightAt(f.x, f.z) < WATER_Y + 0.15 || this.game.crowded(f.x, f.z, 0.6)) continue;
      return plan;
    }
    return null;
  }
  // anything that still sits on the clearing (a dropped bag, a stick that blew in) is tucked away quietly
  clearPlot(p) {
    const g = this.game, x0 = p.a * G - 0.5, x1 = p.a * G + 4.5, z0 = p.b * G - 0.5, z1 = p.b * G + 4.5;
    for (const o of g.pickups) if (o.x > x0 && o.x < x1 && o.z > z0 && o.z < z1 && o.alive) { g.dyn[o.item].remove(o.slot); o.slot = -1; o.alive = false; o.back = 600; }
  }
  cells(p) { return [[p.a, p.b], [p.a + 1, p.b], [p.a, p.b + 1], [p.a + 1, p.b + 1]]; }
  // the 8 outside edges as [cell a, cell b, side]
  perimeter(p) {
    const out = [];
    for (const [i, j] of this.cells(p)) for (let sd = 0; sd < 4; sd++) {
      const n = sd === 0 ? [i, j - 1] : sd === 1 ? [i + 1, j] : sd === 2 ? [i, j + 1] : [i - 1, j];
      if (n[0] < p.a || n[0] > p.a + 1 || n[1] < p.b || n[1] > p.b + 1) out.push([i, j, sd]);
    }
    return out;
  }
  // the door is the first outside edge on the door side; the window the first on the far side
  doorEdge(p) { return this.perimeter(p).find((e) => e[2] === p.door); }
  fireSpot(p) {
    const [i, j, sd] = this.doorEdge(p), B = this.builder;
    const [x, z] = B.edgeMid(...B.sideEdge(i, j, sd));
    const d = [[0, -1], [1, 0], [0, 1], [-1, 0]][sd];
    return { x: x + d[0] * 3, z: z + d[1] * 3 };
  }
  planSlots() {
    const p = this.plan;
    if (!p || p.v !== 2) return [];
    const B = this.builder, out = [];
    for (const [a, b] of this.cells(p)) out.push({ kind: 'floor', a, b });
    const door = this.doorEdge(p), win = this.perimeter(p).find((e) => e[2] === (p.door + 2) % 4);
    const same = (e, f) => e[0] === f[0] && e[1] === f[1] && e[2] === f[2];
    for (const e of this.perimeter(p)) if (!same(e, door) && !same(e, win)) out.push({ kind: 'wall', a: e[0], b: e[1], side: e[2] });
    out.push({ kind: 'door', a: door[0], b: door[1], side: door[2] });
    out.push({ kind: 'window', a: win[0], b: win[1], side: win[2] });
    for (const [a, b] of this.cells(p)) out.push({ kind: 'roof', a, b, r: (p.door + 1) % 2 });
    for (const sl of out) {
      if (sl.side !== undefined) {
        const [ea, eb, eo] = B.sideEdge(sl.a, sl.b, sl.side);
        const e = B.edgeAt(ea, eb, eo);
        sl.done = !!e && (sl.kind === 'door' ? e.kind === 'door' : e.kind === 'wall' || e.kind === 'window');
        [sl.x, sl.z] = B.edgeMid(ea, eb, eo);
      } else {
        sl.done = !!(sl.kind === 'roof' ? B.roofAt(sl.a, sl.b) : B.floorAt(sl.a, sl.b));
        sl.x = sl.a * G + 1; sl.z = sl.b * G + 1;
      }
    }
    return out;
  }
  // the ghost is pulled onto the plan when you pick a piece the plan still needs
  magnet(kind, x, z, initial) {
    if (this.step !== 6) return null;
    const fits = (sl) => sl.kind === kind || ((kind === 'window' || kind === 'wall') && (sl.kind === 'wall' || sl.kind === 'window'));
    const slots = this.planSlots().filter((sl) => !sl.done && fits(sl));
    if (!slots.length) return null;
    if (initial) return slots.find((sl) => sl.kind === kind) || slots[0];
    let best = null, bd = 1.5;
    for (const sl of slots) { const d = Math.hypot(sl.x - x, sl.z - z); if (d < bd) { bd = d; best = sl; } }
    return best;
  }
  showPlan() {
    if (!this.plan) return;
    this.planGroup.visible = true;
    this.planKey = '';
    this.builder.focus = { x: this.plan.a * G + 2, z: this.plan.b * G + 2 };
  }
  hidePlan() { this.planGroup.visible = false; if (this.builder) this.builder.focus = null; }
  refreshPlan() {
    const slots = this.planSlots();
    const next = slots.find((s) => !s.done);
    const key = slots.map((s) => (s.done ? 1 : 0)).join('') + (next ? next.kind : '');
    if (key === this.planKey) return slots;
    this.planKey = key;
    this.planGroup.clear();
    const B = this.builder;
    const base = (a, b) => (B.floorAt(a, b) ? B.floorAt(a, b).y : B.check({ kind: 'floor', a, b, o: 0, r: 0 }, { free: true }).y);
    const top = Math.max(...this.cells(this.plan).map(([a, b]) => base(a, b))) + FLOOR_H;
    for (const sl of slots) {
      if (sl.done) continue;
      const y = sl.kind === 'floor' ? base(sl.a, sl.b) : sl.kind === 'roof' ? (B.wallTop(sl.a, sl.b) ?? top + WALL_H) : top;
      sl.y = y;
      const g = new THREE.Group();
      g.add(new THREE.Mesh(B.geos[sl.kind], sl.kind === next.kind ? this.planNextMat : this.planMat));
      g.add(new THREE.LineSegments(B.edges(sl.kind), this.planLine));
      g.children.forEach((m) => { m.renderOrder = 7; });
      g.position.set(sl.x, y + 0.01, sl.z);
      g.rotation.y = sl.side !== undefined ? (sl.side % 2 ? Math.PI / 2 : 0) : (sl.r || 0) * Math.PI / 2;
      this.planGroup.add(g);
    }
    this.planY = Object.fromEntries(slots.map((sl) => [`${sl.kind}:${sl.a}:${sl.b}:${sl.side}`, sl.y]));
    return slots;
  }

  // ---------- what each step asks for ----------
  nearestPickup(item, near) {
    const p = this.game.player.pos;
    let best = null, bd = 1e9;
    for (const o of this.game.pickups) {
      if (o.item !== item || !o.alive) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z) + (near ? near(o) : 0);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  nearestTree() {
    const p = this.game.player.pos;
    let best = null, bd = 40;
    for (const t of this.game.allThings) {
      if (t.type !== 'tree') continue;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  // the words, the spot in the world and the button for the current step
  plan6() {
    const B = this.builder;
    const slots = this.refreshPlan();
    const next = slots.find((s) => !s.done);
    const built = slots.filter((s) => s.done).length;
    return { slots, next, built };
  }
  describe() {
    const g = this.game, c = g.counters, b = this.base, T = (t, k) => this.T(t, k);
    const pick = (id, need) => Math.min(need, (c[id] || 0) - (b[id] || 0));
    switch (this.step) {
      case 1: {
        const n = pick('stick', 3), o = this.nearestPickup('stick');
        return { text: T('Grab <b>3 sticks</b>! Walk to the glowing ones and tap <b>USE</b>.', 'Grab <b>3 sticks</b>! Walk to the glowing ones and press <b>E</b>.'),
          prog: `${n}/3 sticks`, target: o && { x: o.x, y: o.y, z: o.z, h: 0.4, r: 0.8 }, done: n >= 3 };
      }
      case 2: {
        const n = pick('stone', 2), cx = SITE.pond.x - 6, cz = SITE.pond.z + 2;
        const o = this.nearestPickup('stone', (s) => (Math.hypot(s.x - cx, s.z - cz) < 8 ? 0 : 25));
        return { text: T('Now grab <b>2 stones</b> by the pond. Tap <b>USE</b> on each.', 'Now grab <b>2 stones</b> by the pond. Press <b>E</b> on each.'),
          prog: `${n}/2 stones`, target: o && { x: o.x, y: o.y, z: o.z, h: 0.4, r: 0.8 }, done: n >= 2 };
      }
      case 3: {
        const n = pick('fiber', 2), o = this.nearestPickup('fiber', (s) => (s.tut ? 0 : 30));
        return { text: T('Pull <b>2 grass</b> at the water\'s edge. Grass loves a riverbank!', 'Pull <b>2 grass</b> at the water\'s edge (press <b>E</b>). Grass loves a riverbank!'),
          prog: `${n}/2 grass`, target: o && { x: o.x, y: o.y, z: o.z, h: 1.0, r: 0.9 }, done: n >= 2 };
      }
      case 4: {
        const open = this.hud.craftOpen;
        return { text: open ? T('Tap <b>Craft</b> next to the <b>Stone axe</b>.', 'Click <b>Craft</b> next to the <b>Stone axe</b>.')
          : T('Tap <b>CRAFT</b> and make a <b>stone axe</b>.', 'Press <b>C</b> (Craft) and make a <b>stone axe</b>.'),
          ui: open ? '#craft-list .recipe[data-id="axe"] .r-btn' : '#btn-craft', hl: open ? '#craft-list .recipe[data-id="axe"]' : '#btn-craft', done: g.has('axe') };
      }
      case 5: {
        const t = this.nearestTree();
        return { text: T('Chop a tree! Stand by it and tap <b>USE</b> a few times. Timber!', 'Chop a tree! Stand by it and press <b>E</b> a few times (or hold it). Timber!'),
          target: t && { x: t.x, y: t.y, z: t.z, h: 3.2 + t.scale * 1.6, r: 1.2 }, done: (c.wood || 0) > (b.wood || 0), hl: '#btn-act' };
      }
      case 6: {
        if (!this.plan) return { text: 'Build a little house: floors, walls, a door wall and a roof!', done: this.builder.anyHouse(), ui: this.builder.open ? null : '#btn-build' };
        const { slots, next } = this.plan6();
        const built = slots.filter((s) => s.done).length;
        const prog = `${built}/${slots.length} pieces`;
        if (!next) return { text: 'Cabin done!', prog, done: true };
        const y = this.planY ? this.planY[`${next.kind}:${next.a}:${next.b}:${next.side}`] ?? next.y : next.y;
        const tgt = { x: next.x, y: y ?? this.world.heightAt(next.x, next.z), z: next.z, h: next.kind === 'roof' ? 1.4 : next.kind === 'floor' ? 0.6 : 2.6, r: next.kind === 'floor' || next.kind === 'roof' ? 1.4 : 1.1 };
        if (!this.builder.open) return { text: T('Time to build your first cabin! Tap <b>BUILD</b>.', 'Time to build your first cabin! Press <b>B</b> (or click <b>Build</b>).'), prog, target: tgt, ui: '#btn-build', hl: '#btn-build' };
        const name = PIECES.find((p) => p.id === next.kind).name;
        const left = slots.filter((s) => !s.done && s.kind === next.kind).length;
        const item = `#build-bar [data-kind="${next.kind}"]`;
        if (this.builder.kind !== next.kind) return { text: T(`Pick <b>${name}</b>.`, `Pick <b>${name}</b> (or press <b>${PIECES.findIndex((p) => p.id === next.kind) + 1}</b>).`), prog, target: tgt, ui: item, hl: item };
        const ok = this.builder.slot && this.builder.slot.ok;
        return { text: `${T('Place the glowing pieces. Tap <b>Place</b>!', 'Place the glowing pieces: aim and <b>click</b>.')} (${left} ${name.toLowerCase()}${left > 1 ? 's' : ''} to go)`, prog, target: tgt, ui: this.touch && ok ? '#bc-place' : null, hl: '#bc-place' };
      }
      case 7: {
        const p = this.plan, B = this.builder;
        let spot = null;
        if (p) { const f = this.fireSpot(p); spot = { x: f.x, y: this.world.heightAt(f.x, f.z), z: f.z, h: 0.6, r: 1.0 }; }
        const pl = g.player.pos, near = !spot || Math.hypot(spot.x - pl.x, spot.z - pl.z) < 3;
        const open = this.hud.craftOpen;
        if (B.open) return { text: T('Close the build bar with <b>✕</b>, then light a campfire by your cabin.', 'Close the build bar (<b>B</b>), then light a campfire by your cabin.'), target: spot, ui: '#bb-close', done: false };
        if (!near) return { text: 'Last thing: a campfire! Walk to the glowing spot by your door.', target: spot, done: false };
        return { text: open ? T('Tap <b>Build</b> next to <b>Campfire</b>.', 'Click <b>Build</b> next to <b>Campfire</b>.') : T('Tap <b>CRAFT</b> and build a <b>Campfire</b>.', 'Press <b>C</b> and build a <b>Campfire</b>.'),
          target: spot, ui: open ? '#craft-list .recipe[data-id="campfire"] .r-btn' : '#btn-craft', hl: open ? '#craft-list .recipe[data-id="campfire"]' : '#btn-craft',
          done: (c.built_campfire || 0) > (b.fire || 0) };
      }
      case 8:
        return { text: 'You built your first cabin! Snooze inside after midnight, keep your fire fed, and see what\'s out there.', party: true, done: this.t > (this.partyUntil ?? 0) };
    }
    return { text: '', done: true };
  }

  // ---------- each frame ----------
  update(dt, time) {
    this.t += dt;
    this.confetti.update(dt);
    if (!this.active) return;
    this.think -= dt;
    if (this.think <= 0 || !this.info) {
      this.think = 0.2;
      // keep the cabin buildable: if materials ran short (used elsewhere), the crate has a few more
      if (this.step === 6 && this.plan && this.crate) this.topUp();
      this.info = this.describe();
      if (this.info.done) {
        if (this.step >= TOTAL) { this.finish(); return; }
        if (this.step === 6) this.builder.dust.emit(this.plan ? this.plan.a * G + 2 : 0, this.game.player.pos.y + 2.4, this.plan ? this.plan.b * G + 2 : 0, { n: 24, speed: 3, up: 2, colors: ['#ffe08a', '#fff1c8', '#ffb35c'], size: 0.12, life: 1 });
        this.go(this.step + 1);
        this.info = this.describe();
      }
      this.render();
    }
    this.place(time);
  }
  topUp() {
    const left = this.planSlots().filter((s) => !s.done);
    const need = {};
    for (const s of left) for (const [id, n] of Object.entries(PIECES.find((p) => p.id === s.kind).cost)) need[id] = (need[id] || 0) + n;
    const add = Object.entries(need).map(([id, n]) => [id, n - (this.game.inv[id] || 0)]).filter(([, n]) => n > 0);
    if (!add.length) return;
    for (const [id, n] of add) this.game.add(id, n);
    this.hud.news('Found a few more supplies in the crate!', 'Lucky!');
  }
  render() {
    const i = this.info, e = this.el;
    const html = i.text;
    const stepTxt = this.step >= TOTAL ? 'All done!' : `Step ${this.step} of ${TOTAL}`;
    if (html !== this.lastHtml) { e.text.innerHTML = html; this.lastHtml = html; }
    if (e.step.textContent !== stepTxt) {
      e.step.textContent = stepTxt;
      e.dots.forEach((d, k) => { d.className = k + 1 < this.step ? 'on' : k + 1 === this.step ? 'now' : ''; });
    }
    const prog = i.prog || '';
    if (e.prog.textContent !== prog) e.prog.textContent = prog;
    e.card.classList.toggle('party', !!i.party);
    this.highlight(i.hl);
  }
  highlight(sel) {
    const el = sel ? document.querySelector(sel) : null;
    if (el === this.hlEl) return;
    this.clearHighlight();
    if (el) { el.classList.add('tut-hl'); this.hlEl = el; }
  }
  clearHighlight() { if (this.hlEl) this.hlEl.classList.remove('tut-hl'); this.hlEl = null; }

  // the beacon, the edge arrow and the button pointer follow every frame
  place(time) {
    const i = this.info, e = this.el, b = this.beacon;
    // the highlight is put back when a menu redraws itself
    if (i.hl && (!this.hlEl || !this.hlEl.isConnected)) { this.hlEl = null; this.highlight(i.hl); }
    const tg = i.target;
    const pl = this.game.player.pos;
    if (tg) {
      b.g.visible = true;
      b.g.position.set(tg.x, tg.y, tg.z);
      const bob = Math.abs(Math.sin(time * 3.2));
      b.arrow.position.y = tg.h + 0.4 + bob * 0.5;
      // if the arrow would sit behind the card or the top bars, it comes down close to the target
      const av = this._av || (this._av = new THREE.Vector3());
      av.set(tg.x, tg.y + tg.h + 1.2, tg.z).project(this.camera);
      if ((-av.y * 0.5 + 0.5) * innerHeight < e.card.getBoundingClientRect().bottom + 10) b.arrow.position.y = Math.min(tg.h, 0.9) + 0.2 + bob * 0.25;
      b.arrow.rotation.y = time * 1.6;
      const pulse = 1 + Math.sin(time * 4) * 0.12;
      b.glow.scale.setScalar(tg.r * 2.6 * pulse); b.glow.position.y = 0.05;
      b.ring.scale.setScalar(tg.r * (0.9 + ((time * 0.8) % 1) * 0.5)); b.ring.position.y = 0.08;
      b.ring.material.opacity = 0.9 * (1 - ((time * 0.8) % 1));
      b.beam.scale.set(1, 7, 1); b.beam.position.y = 3.5;
      const d = Math.hypot(tg.x - pl.x, tg.z - pl.z);
      b.beam.visible = d > 6;
      const dist = d > 3 ? `${Math.round(d)} m away` : '';
      if (e.dist.textContent !== dist) e.dist.textContent = dist;
      this.edgeArrow(tg, d);
    } else {
      b.g.visible = false; e.edge.hidden = true;
      if (e.dist.textContent) e.dist.textContent = '';
    }
    this.pointAt(i.ui, time);
  }
  edgeArrow(tg, d) {
    const e = this.el, W = innerWidth, H = innerHeight;
    const v = this._v || (this._v = new THREE.Vector3());
    v.set(tg.x, tg.y + tg.h * 0.5, tg.z).project(this.camera);
    const behind = v.z > 1;
    const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
    const card = e.card.getBoundingClientRect();
    const ticker = document.getElementById('ticker'), status = document.getElementById('statusbar');
    const barsBottom = Math.max(status ? status.getBoundingClientRect().bottom : 0, ticker && ticker.offsetHeight ? ticker.getBoundingClientRect().bottom : 0);
    const bar = document.getElementById('build-bar'), barTop = bar && !bar.hidden ? bar.getBoundingClientRect().top : H;
    // on screen, clear of the top bars, the card and the build bar: the beacon itself shows the way
    const underCard = sx > card.left - 10 && sx < card.right + 10 && sy < card.bottom + 10;
    if (!behind && sx > 30 && sx < W - 30 && sy > barsBottom + 30 && sy < Math.min(H, barTop) - 20 && !underCard) { e.edge.hidden = true; return; }
    // otherwise the arrow sits on a frame just inside the screen edges (below the top bars, above the
    // bottom buttons), never in the middle where the explorer is
    const top = barsBottom + 40, bottom = Math.min(H - 120, barTop - 40), left = 40, right = W - 40;
    const cx = W / 2, cy = H / 2;
    let dx = sx - cx, dy = sy - cy;
    if (behind) { dx = -dx; dy = -dy; }
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const tx = dx > 0 ? (right - cx) / dx : dx < 0 ? (left - cx) / dx : 1e9;
    const ty = dy > 0 ? (bottom - cy) / dy : dy < 0 ? (top - cy) / dy : 1e9;
    const t = Math.max(0, Math.min(tx, ty));
    let px = cx + dx * t, py = cy + dy * t;
    // the card covers the top middle: slide the arrow out to the card's side
    if (px > card.left - 36 && px < card.right + 36 && py < card.bottom + 36) px = dx < 0 ? Math.max(left, card.left - 40) : Math.min(right, card.right + 40);
    e.edge.hidden = false;
    e.edge.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    e.rot.style.transform = `rotate(${Math.atan2(sy - py, sx - px) * (behind ? 0 : 1) + (behind ? Math.atan2(dy, dx) : 0)}rad)`;
    const txt = `${Math.round(d)} m`;
    if (e.edist.textContent !== txt) e.edist.textContent = txt;
  }
  pointAt(sel, time) {
    const p = this.el.point;
    const el = sel ? document.querySelector(sel) : null;
    const r = el ? el.getBoundingClientRect() : null;
    if (!r || !r.width || getComputedStyle(el).visibility === 'hidden') { p.hidden = true; return; }
    const ex = r.left + r.width / 2, ey = r.top + r.height / 2, H = innerHeight;
    // buttons low on the screen get the pointer from above, buttons up top from below (so it never
    // covers a neighbouring button); others from the middle of the screen
    let dx, dy;
    if (ey > H * 0.6) { dx = 0; dy = -1; } else if (ey < H * 0.3) { dx = 0; dy = 1; }
    else { dx = innerWidth / 2 - ex; dy = H / 2 - ey; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len; }
    const off = (dy ? r.height : r.width) / 2 + 28 + Math.abs(Math.sin(time * 5)) * 8;
    p.hidden = false;
    p.style.transform = `translate(${(ex + dx * off).toFixed(1)}px, ${(ey + dy * off).toFixed(1)}px) rotate(${Math.atan2(-dy, -dx).toFixed(3)}rad)`;
  }
}
