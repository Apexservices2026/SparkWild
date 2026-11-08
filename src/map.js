// Forge: map. The little spinning globe in the top bar and the full map it opens.
// - The globe is a small 2D canvas: the island wrapped on a "fake sphere" (each pixel looks up a
//   longitude and latitude worked out once), redrawn about 15 times a second. No second WebGL renderer.
// - The full map is drawn once from the world data (climates, water, height shading, cliffs, the stone
//   path) and cached. Markers, the player arrow and the fog are drawn on top.
// - Fog of war: a 56 x 56 grid (4 m squares). Walking reveals it; it is kept in the save as a short string.
import { N, HALF, BIOMES, SITE, WATER_Y, SWAMP, cellIndex } from './world.js';
import { makeNoise2D, fbm, clamp, smoothstep } from './noise.js';

// "Places to visit": question-mark pins for the next story places, one per land.
// Saga: fill in a name and a line for each (until then the pin just shows "?").
export const PLACES = [
  { id: 'woods-hollow',  land: 'forest',   x: -48, z: 52,  name: null, line: null },
  { id: 'peaks-mine',    land: 'mountain', x: 58,  z: -60, name: null, line: null },
  { id: 'frost-shrine',  land: 'snow',     x: -54, z: -88, name: null, line: null },
  { id: 'dunes-ruin',    land: 'desert',   x: 72,  z: 68,  name: null, line: null },
  { id: 'marsh-hut',     land: 'swamp',    x: -26, z: 88,  name: null, line: null },
  { id: 'coast-wreck',   land: 'coast',    x: -76, z: -40, name: null, line: null },
];

const FG = 4;                 // fog square size in metres
const FN = N / FG;            // 56 squares per side
const FP = 10;                // the fog picture reaches this many squares past the island
const FOG_PX = 512;           // fog picture size
const REVEAL = 18;            // metres revealed around the explorer
const RES = 3;                // full map: pixels per metre
const GLOBE_FPS = 15;
const SPIN = (Math.PI * 2) / 26;   // one turn every 26 seconds

const lin2srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t, out) => { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; };
const SEA_DEEP = hex('#2b6a80'), SEA_SHALLOW = hex('#78c2bc'), MARSH_DEEP = hex('#46603f'), MARSH_SHALLOW = hex('#7d9868');
const FOAM = hex('#eef3e6'), CLIFF = hex('#6b5a4c'), CLOUD = hex('#ece8df');

const CSS = `
  #map { position: fixed; inset: 0; z-index: 6; display: grid; place-items: center; background: rgba(5, 8, 6, 0.55); box-sizing: border-box;
    padding: max(10px, env(safe-area-inset-top, 0px)) max(10px, env(safe-area-inset-right, 0px)) max(10px, env(safe-area-inset-bottom, 0px)) max(10px, env(safe-area-inset-left, 0px)); }
  body.map-open #statusbar, body.map-open #ticker, body.map-open .hud-tr, body.map-open #actions, body.map-open #bottom, body.map-open #coach, body.map-open #hint { visibility: hidden; }
  .map-card { width: min(980px, 100%); height: 100%; max-height: 900px; display: flex; flex-direction: column; overflow: hidden; }
  .map-head { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 16px; }
  .map-head h2 { margin: 0; font: 600 20px/1 var(--font-display); }
  .map-where { font: 600 14px/1.2 var(--font-display); color: var(--ember); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .map-head .icon-btn { width: 44px; height: 44px; font-size: 18px; flex: 0 0 auto; }
  .map-view { position: relative; flex: 1; min-height: 0; margin: 0 8px; border-radius: 12px; overflow: hidden; background: #2b6a80; }
  #map-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
  #map-canvas.drag { cursor: grabbing; }
  .map-tools { position: absolute; right: 8px; bottom: 8px; display: flex; flex-direction: column; gap: 6px; }
  .map-tools button { width: 44px; height: 44px; border-radius: 12px; border: 1px solid var(--glass-edge); background: rgba(16, 22, 18, 0.78); color: var(--ink); cursor: pointer; display: grid; place-items: center; font: 600 22px/1 var(--font-display); }
  .map-tools button:hover { background: rgba(40, 50, 44, 0.9); }
  .map-tools svg { width: 22px; height: 22px; fill: none; stroke: var(--ember); stroke-width: 2; stroke-linecap: round; }
  .map-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 8px 16px 10px; font-size: 13px; color: var(--ink-dim); }
  .map-legend span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
  .map-legend i { display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; font: 700 11px/1 var(--font-display); font-style: normal; }
  .lg-you { background: var(--ember); clip-path: polygon(50% 0, 100% 100%, 50% 75%, 0 100%); border-radius: 0 !important; }
  .lg-build { background: #f4e2bd; border: 2px solid #5a3b22; box-sizing: border-box; }
  .lg-ore { background: #8a8f99; border: 2px solid #c8763a; box-sizing: border-box; }
  .lg-q { background: #ffcf6a; color: #3a2510; }
  .lg-fog { background: #ece8df; }
  @media (orientation: landscape) and (max-height: 500px) {
    .map-head { padding: 4px 6px 4px 12px; } .map-head h2 { font-size: 17px; }
    .map-legend { display: none; }
    .map-view { margin-bottom: 8px; }
  }
`;

export class WorldMap {
  constructor({ world, game, player, builder, path, audio, globeBtn, canOpen, onToggle }) {
    this.world = world; this.game = game; this.player = player; this.builder = builder; this.path = path;
    this.audio = audio; this.canOpen = canOpen || (() => true); this.onToggle = onToggle || (() => {});
    this.btn = globeBtn;
    this.globe = globeBtn ? globeBtn.querySelector('canvas') : null;
    this.explored = new Uint8Array(FN * FN);
    this.lastCell = -1;
    this.fogDirty = true;
    this.globeTexDirty = true;
    this.isOpen = false;
    this.rot = Math.PI; this.acc = 1;   // starts facing the island
    this.stats = { globeMs: 0, globeDraws: 0, baseMs: 0 };
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.cloudNoise = makeNoise2D(91);
    this.labels = this.findLabels();
    this.ore = this.findOre();
    // a small copy of the map for the globe, made now (the big one waits for the first open)
    this.small = this.buildBase(128 / N);
    this.makeDom();
    if (this.globe) {
      const resize = () => { this.globeTable = null; };
      addEventListener('resize', resize);
      this.btn.addEventListener('click', () => this.toggle(true));
    }
    addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName ? e.target.tagName : '';
      if (/input|select|textarea/i.test(tag)) return;
      if (e.code === 'KeyM' && !e.repeat) {
        if (this.isOpen) this.toggle(false); else if (this.canOpen()) this.toggle(true);
        return;
      }
      if (!this.isOpen) return;
      const pan = 40 / this.view.s;
      if (e.code === 'ArrowLeft') this.panBy(-pan, 0);
      else if (e.code === 'ArrowRight') this.panBy(pan, 0);
      else if (e.code === 'ArrowUp') this.panBy(0, -pan);
      else if (e.code === 'ArrowDown') this.panBy(0, pan);
      else if (e.key === '+' || e.key === '=') this.zoomBy(1.35);
      else if (e.key === '-' || e.key === '_') this.zoomBy(1 / 1.35);
    });
  }

  // ---------- fog of war ----------
  reveal(x, z, r = REVEAL) {
    const fi0 = Math.max(0, Math.floor((x - r + HALF) / FG)), fi1 = Math.min(FN - 1, Math.floor((x + r + HALF) / FG));
    const fj0 = Math.max(0, Math.floor((z - r + HALF) / FG)), fj1 = Math.min(FN - 1, Math.floor((z + r + HALF) / FG));
    let changed = false;
    for (let j = fj0; j <= fj1; j++) for (let i = fi0; i <= fi1; i++) {
      const cx = i * FG - HALF + FG / 2, cz = j * FG - HALF + FG / 2;
      if (!this.explored[j * FN + i] && Math.hypot(cx - x, cz - z) < r) { this.explored[j * FN + i] = 1; changed = true; }
    }
    if (changed) { this.fogDirty = true; this.globeTexDirty = true; }
  }
  isExplored(x, z) {
    const i = Math.floor((x + HALF) / FG), j = Math.floor((z + HALF) / FG);
    return i >= 0 && j >= 0 && i < FN && j < FN && !!this.explored[j * FN + i];
  }
  // 3136 squares packed 8 to a byte, as base64 (about 520 characters)
  serialize() {
    const bytes = new Uint8Array(Math.ceil(this.explored.length / 8));
    for (let k = 0; k < this.explored.length; k++) if (this.explored[k]) bytes[k >> 3] |= 1 << (k & 7);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }
  load(str) {
    this.explored.fill(0);
    let ok = false;
    if (typeof str === 'string') {
      try {
        const s = atob(str);
        for (let k = 0; k < this.explored.length; k++) this.explored[k] = (s.charCodeAt(k >> 3) >> (k & 7)) & 1;
        ok = true;
      } catch { ok = false; }
    }
    // a new game, or an older save without a map: the area around the explorer starts revealed
    this.reveal(this.player.pos.x, this.player.pos.z, REVEAL + 6);
    this.lastCell = -1;
    this.fogDirty = true; this.globeTexDirty = true;
    return ok;
  }
  // the map rides along in the game's own save
  saveTo(key) {
    try {
      const data = JSON.parse(localStorage.getItem(key) || 'null');
      if (!data) return;
      data.map = this.serialize();
      localStorage.setItem(key, JSON.stringify(data));
    } catch { /* storage blocked */ }
  }
  loadFrom(key, loaded) {
    let str = null;
    if (loaded) { try { const d = JSON.parse(localStorage.getItem(key) || 'null'); str = d && d.map; } catch { str = null; } }
    this.load(str);
  }

  // ---------- every frame (cheap) ----------
  update(dt, playing) {
    if (!playing) return;
    const p = this.player.pos;
    const cell = Math.floor((p.z + HALF) / FG) * FN + Math.floor((p.x + HALF) / FG);
    if (cell !== this.lastCell) { this.lastCell = cell; this.reveal(p.x, p.z); }
    if (!this.reduceMotion) this.rot += dt * SPIN;
    this.acc += dt;
    if (this.acc >= 1 / GLOBE_FPS && !this.isOpen) { this.acc = 0; this.drawGlobe(); }
  }

  // ---------- the map picture, drawn once ----------
  // res: pixels per metre. Water, shore foam, climates (the ground's own colours), height shading,
  // contour lines, cliffs and the stone path.
  buildBase(res) {
    const t0 = performance.now();
    const w = this.world, size = Math.round(N * res);
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size), px = img.data;
    const H = new Float32Array((size + 1) * (size + 1));
    for (let j = 0; j <= size; j++) for (let i = 0; i <= size; i++) H[j * (size + 1) + i] = w.heightAt(i / res - HALF, j / res - HALF);
    const top = w.topColors, srgb = new Float32Array(N * N * 3);
    for (let k = 0; k < N * N * 3; k++) srgb[k] = lin2srgb(top[k]) * 255;
    const c = [0, 0, 0];
    const lx = -0.55, ly = 0.75, lz = -0.55, lf = ly / Math.hypot(lx, ly, lz);
    const step = 1 / res;   // metres per pixel
    const S = SITE.stream;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const x = (i + 0.5) / res - HALF, z = (j + 0.5) / res - HALF;
      const h00 = H[j * (size + 1) + i], h10 = H[j * (size + 1) + i + 1], h01 = H[(j + 1) * (size + 1) + i], h11 = H[(j + 1) * (size + 1) + i + 1];
      const h = (h00 + h10 + h01 + h11) / 4;
      const ci = clamp(cellIndex(x), 0, N - 1), cj = clamp(cellIndex(z), 0, N - 1);
      const swamp = w.weights[(cj * N + ci) * 6 + SWAMP];
      const inStream = x > S.x0 + 0.6 && x < S.x1 - 0.6 && z > S.z0 && z < S.z1 + 0.4;
      if (h < WATER_Y || inStream) {
        const d = inStream ? 0.3 : WATER_Y - h;
        const deep = swamp > 0.4 ? MARSH_DEEP : SEA_DEEP, shallow = swamp > 0.4 ? MARSH_SHALLOW : SEA_SHALLOW;
        mix(shallow, deep, smoothstep(0, 2.6, d), c);
        // soft wave lines that follow the shore
        if (d > 0.25 && d < 3.2 && (d * 1.4) % 1 < 0.08 * (res > 1 ? 1 : 2)) mix(c, FOAM, 0.16, c);
        if (d < 0.14 && !inStream) mix(c, FOAM, 0.65, c);
      } else {
        // the ground's colour, blended between cell centres
        const fx = clamp(x + HALF - 0.5, 0, N - 1.001), fz = clamp(z + HALF - 0.5, 0, N - 1.001);
        const i0 = Math.floor(fx), j0 = Math.floor(fz), u = fx - i0, v = fz - j0;
        const k00 = (j0 * N + i0) * 3, k10 = k00 + 3, k01 = k00 + N * 3, k11 = k01 + 3;
        for (let q = 0; q < 3; q++) c[q] = (srgb[k00 + q] * (1 - u) + srgb[k10 + q] * u) * (1 - v) + (srgb[k01 + q] * (1 - u) + srgb[k11 + q] * u) * v;
        // height shading (light from the north-west)
        const R = Math.max(1, Math.round(res)), W1 = size + 1;
        const iL = Math.max(0, i - R + 1), iR = Math.min(size, i + R), jT = Math.max(0, j - R + 1), jB = Math.min(size, j + R);
        const gx = (H[j * W1 + iR] + H[(j + 1) * W1 + iR] - H[j * W1 + iL] - H[(j + 1) * W1 + iL]) / (2 * (iR - iL) * step);
        const gz = (H[jB * W1 + i] + H[jB * W1 + i + 1] - H[jT * W1 + i] - H[jT * W1 + i + 1]) / (2 * (jB - jT) * step);
        const nl = Math.hypot(gx, 1, gz), dot = (-gx * lx + ly - gz * lz) / (nl * Math.hypot(lx, ly, lz));
        let shade = clamp(1 + (dot - lf) * 1.1, 0.74, 1.18);
        // a gentle contour line every metre of height
        if (Math.floor(h) !== Math.floor(Math.max(h10, h01, h11))) shade *= 0.9;
        const slope = Math.hypot(gx, gz);
        if (slope > 1.0) mix(c, CLIFF, smoothstep(1.0, 2.4, slope) * 0.45, c);
        c[0] *= shade; c[1] *= shade; c[2] *= shade;
      }
      const o = (j * size + i) * 4;
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    cv.pixels = px;   // kept, so the globe never has to read the canvas back (that waits on the GPU)
    this.stats.baseMs += performance.now() - t0;
    return cv;
  }

  // cloud texture for unexplored ground (made once)
  makeClouds(size) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size), px = img.data;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const n = fbm(this.cloudNoise, i * 0.035, j * 0.035, 4) * 0.5 + 0.5;
      const t = smoothstep(0.3, 0.75, n);
      const o = (j * size + i) * 4;
      px[o] = 205 + t * 35; px[o + 1] = 204 + t * 33; px[o + 2] = 200 + t * 28; px[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  // the fog layer for the full map: the explored grid, softened, filled with clouds (only when it changed)
  fogLayer() {
    if (!this.fog) {
      this.fog = document.createElement('canvas'); this.fog.width = this.fog.height = FOG_PX;
      this.fogSmall = document.createElement('canvas'); this.fogSmall.width = this.fogSmall.height = FN + 2 * FP;
      this.clouds = this.makeClouds(FOG_PX);
    }
    if (!this.fogDirty) return this.fog;
    this.fogDirty = false;
    const M = FN + 2 * FP, s = this.fogSmall.getContext('2d'), img = s.createImageData(M, M), px = img.data;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const fi = i - FP, fj = j - FP;
      const seen = fi >= 0 && fj >= 0 && fi < FN && fj < FN && this.explored[fj * FN + fi];
      px[(j * M + i) * 4 + 3] = seen ? 0 : 255;
    }
    s.putImageData(img, 0, 0);
    const f = this.fog.getContext('2d');
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, FOG_PX, FOG_PX);
    f.imageSmoothingEnabled = true;
    if ('filter' in f) f.filter = 'blur(4px)';
    f.drawImage(this.fogSmall, 0, 0, FOG_PX, FOG_PX);
    if ('filter' in f) f.filter = 'none';
    // the outer border is always cloud (the blur would thin it and show a seam)
    const bw = 16; f.fillStyle = '#000';
    f.fillRect(0, 0, FOG_PX, bw); f.fillRect(0, FOG_PX - bw, FOG_PX, bw); f.fillRect(0, 0, bw, FOG_PX); f.fillRect(FOG_PX - bw, 0, bw, FOG_PX);
    f.globalCompositeOperation = 'source-in';
    f.drawImage(this.clouds, 0, 0);
    f.globalCompositeOperation = 'source-over';
    return this.fog;
  }

  // label spots: the middle of the biggest stretch of each land
  findLabels() {
    const w = this.world, sums = BIOMES.map((b) => b.centers.map(() => [0, 0, 0]));
    for (let j = 0; j < N; j += 2) for (let i = 0; i < N; i += 2) {
      if (w.levels[j * N + i] <= 0) continue;
      const b = w.primary[j * N + i], x = i - HALF + 0.5, z = j - HALF + 0.5;
      let best = 0, bd = 1e9;
      BIOMES[b].centers.forEach((c, k) => { const d = Math.hypot(x - c[0], z - c[1]); if (d < bd) { bd = d; best = k; } });
      const s = sums[b][best]; s[0] += x; s[1] += z; s[2]++;
    }
    return BIOMES.map((b, bi) => {
      const s = sums[bi].reduce((m, q) => (q[2] > m[2] ? q : m), [0, 0, 0]);
      return { name: b.name, x: s[2] ? s[0] / s[2] : b.centers[0][0], z: s[2] ? s[1] / s[2] : b.centers[0][1] };
    });
  }

  // iron ore: rocks with ore, grouped into areas about 36 m across (3 or more rocks)
  findOre() {
    const list = (this.game.allThings || []).filter((t) => t.type === 'ore');
    const groups = new Map();
    for (const t of list) {
      const k = Math.floor((t.x + HALF) / 36) * 100 + Math.floor((t.z + HALF) / 36);
      if (!groups.has(k)) groups.set(k, [0, 0, 0]);
      const g = groups.get(k); g[0] += t.x; g[1] += t.z; g[2]++;
    }
    return [...groups.values()].filter((g) => g[2] >= 3).map((g) => ({ x: g[0] / g[2], z: g[1] / g[2], n: g[2] }));
  }

  // ---------- the globe ----------
  globeTexture() {
    const W = 256, Hh = 128;
    if (!this.gtex) {
      this.gtex = new Uint8ClampedArray(W * Hh * 3);
      this.smallPx = this.small.pixels;
    }
    if (!this.globeTexDirty) return this.gtex;
    this.globeTexDirty = false;
    const t = this.gtex, sp = this.smallPx, c = [0, 0, 0], cloudC = CLOUD;
    for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
      const o = (j * W + i) * 3;
      const mi = i - 64;   // the island fills the middle half of the longitudes
      let fog;
      if (mi >= 0 && mi < 128) {
        const s = (j * 128 + mi) * 4;
        c[0] = sp[s]; c[1] = sp[s + 1]; c[2] = sp[s + 2];
        const fi = Math.min(FN - 1, (mi * FN / 128) | 0), fj = Math.min(FN - 1, (j * FN / 128) | 0);
        fog = this.explored[fj * FN + fi] ? 0 : 0.35;
      } else {
        c[0] = SEA_DEEP[0]; c[1] = SEA_DEEP[1]; c[2] = SEA_DEEP[2];
        fog = 0;
      }
      // a few drifting clouds over the far side, so the globe visibly turns
      const n = fbm(this.cloudNoise, i * 0.03 + 5, j * 0.05, 2);
      const cl = Math.max(fog, smoothstep(0.22, 0.5, n) * 0.8 * (mi >= 0 && mi < 128 ? 0.3 : 1));
      mix(c, cloudC, cl, c);
      t[o] = c[0]; t[o + 1] = c[1]; t[o + 2] = c[2];
    }
    return t;
  }

  // per-pixel longitude, latitude and light, worked out once for the globe's size
  makeGlobeTable() {
    const cv = this.globe;
    const css = cv.clientWidth || 44;
    const S = Math.round(css * Math.min(2, devicePixelRatio || 1));
    cv.width = cv.height = S;
    const r = S * 0.4, cx = S / 2, cy = S / 2;
    const idx = [], u0 = [], row = [], shade = [];
    const L = [-0.5, 0.55, 0.67], ll = Math.hypot(...L);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const nx = (x + 0.5 - cx) / r, ny = (cy - y - 0.5) / r, d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const lat = Math.asin(ny), lon = Math.atan2(nx, nz);
      idx.push(y * S + x);
      u0.push((lon / (Math.PI * 2)) * 256);
      row.push(Math.min(127, Math.max(0, Math.floor((0.5 - lat / Math.PI) * 128))));
      const lam = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / ll);
      shade.push(0.42 + 0.72 * lam);
    }
    // the atmosphere: a soft blue glow round the edge and a little shine
    const over = document.createElement('canvas'); over.width = over.height = S;
    const o = over.getContext('2d', { willReadFrequently: true });
    const glow = o.createRadialGradient(cx, cy, r * 0.92, cx, cy, S / 2);
    glow.addColorStop(0, 'rgba(150, 210, 255, 0.55)'); glow.addColorStop(0.35, 'rgba(130, 200, 255, 0.28)'); glow.addColorStop(1, 'rgba(120, 190, 255, 0)');
    o.fillStyle = glow; o.beginPath(); o.arc(cx, cy, S / 2, 0, Math.PI * 2); o.arc(cx, cy, r * 0.97, 0, Math.PI * 2, true); o.fill();
    const shine = o.createRadialGradient(cx - r * 0.38, cy - r * 0.42, 0, cx - r * 0.38, cy - r * 0.42, r * 0.8);
    shine.addColorStop(0, 'rgba(255, 255, 255, 0.28)'); shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
    o.fillStyle = shine; o.beginPath(); o.arc(cx, cy, r, 0, Math.PI * 2); o.fill();
    o.strokeStyle = 'rgba(190, 228, 255, 0.75)'; o.lineWidth = Math.max(1, S / 60); o.beginPath(); o.arc(cx, cy, r, 0, Math.PI * 2); o.stroke();
    this.globeTable = { S, r, idx: Int32Array.from(idx), u0: Float32Array.from(u0), row: Int32Array.from(row), shade: Float32Array.from(shade), over, img: cv.getContext('2d', { willReadFrequently: true }).createImageData(S, S) };   // a CPU canvas: no waiting on the GPU
  }

  drawGlobe() {
    if (!this.globe || !this.globe.offsetParent) return;   // hidden (menus, creator)
    const t0 = performance.now();
    if (!this.globeTable) this.makeGlobeTable();
    const G = this.globeTable, tex = this.globeTexture(), px = G.img.data;
    const p = this.player.pos;
    // the island's longitude of the explorer; with reduced motion the globe simply faces them
    const pLon = (0.25 + 0.5 * (p.x + HALF) / N) * Math.PI * 2;
    const pLat = (0.5 - (p.z + HALF) / N) * Math.PI;
    const rot = this.reduceMotion ? pLon : this.rot;
    const rotU = ((rot / (Math.PI * 2)) * 256) % 256;
    const { idx, u0, row, shade } = G;
    for (let k = 0; k < idx.length; k++) {
      let u = u0[k] + rotU; u = ((u % 256) + 256) % 256;
      const s = (row[k] * 256 + (u | 0)) * 3, o = idx[k] * 4, sh = shade[k];
      px[o] = tex[s] * sh; px[o + 1] = tex[s + 1] * sh; px[o + 2] = tex[s + 2] * sh; px[o + 3] = 255;
    }
    const ctx = this.globe.getContext('2d', { willReadFrequently: true });
    ctx.putImageData(G.img, 0, 0);
    ctx.drawImage(G.over, 0, 0);
    // the explorer's dot, when their side faces you
    const dl = pLon - rot, nz = Math.cos(pLat) * Math.cos(dl);
    if (nz > 0.1) {
      const x = G.S / 2 + Math.cos(pLat) * Math.sin(dl) * G.r, y = G.S / 2 - Math.sin(pLat) * G.r;
      const d = G.S / 22;
      ctx.fillStyle = '#ffb35c'; ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = d * 0.6;
      ctx.beginPath(); ctx.arc(x, y, d * 1.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    const ms = performance.now() - t0;
    this.stats.globeDraws++;
    this.stats.globeMs = this.stats.globeMs ? this.stats.globeMs * 0.9 + ms * 0.1 : ms;
    this.stats.globeMax = Math.max(this.stats.globeMax || 0, ms);
  }

  // ---------- the full map ----------
  makeDom() {
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    const box = document.createElement('div');
    box.id = 'map'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'map-title');
    box.innerHTML = `<div class="card map-card">
      <div class="map-head"><h2 id="map-title">Map</h2><span class="map-where" id="map-where"></span><button class="icon-btn" id="map-close" aria-label="Close the map" title="Close (Esc)">✕</button></div>
      <div class="map-view"><canvas id="map-canvas" role="img" aria-label="Map of the island. Explored land is clear, unexplored land is cloudy."></canvas>
        <div class="map-tools">
          <button id="map-in" aria-label="Zoom in" title="Zoom in">+</button>
          <button id="map-out" aria-label="Zoom out" title="Zoom out">−</button>
          <button id="map-me" aria-label="Center on me" title="Center on me"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.6" fill="#ffb35c"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg></button>
        </div></div>
      <div class="map-legend"><span><i class="lg-you"></i>You</span><span><i class="lg-build"></i>Your builds</span><span><i class="lg-ore"></i>Iron ore</span><span><i class="lg-q">?</i>Places to visit</span><span><i class="lg-fog"></i>Not explored yet</span></div>
    </div>`;
    document.body.appendChild(box);
    this.box = box;
    this.cv = box.querySelector('#map-canvas');
    box.querySelector('#map-close').addEventListener('click', () => this.toggle(false));
    box.addEventListener('click', (e) => { if (e.target === box) this.toggle(false); });
    box.querySelector('#map-in').addEventListener('click', () => this.zoomBy(1.4));
    box.querySelector('#map-out').addEventListener('click', () => this.zoomBy(1 / 1.4));
    box.querySelector('#map-me').addEventListener('click', () => { this.view.cx = this.player.pos.x; this.view.cz = this.player.pos.z; this.view.s = Math.max(this.view.s, this.fit * 2.2); this.clampView(); this.redraw(); });
    this.view = { cx: 0, cz: 0, s: 2 };
    // drag to pan, pinch or wheel to zoom
    const pts = new Map();
    let pinch = null;
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); cv.classList.add('drag'); pinch = null; });
    cv.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 1) {
        this.panBy(-(e.clientX - p.x) / this.view.s, -(e.clientY - p.y) / this.view.s);
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const [a2, b2] = [...pts.values()];
        const after = Math.hypot(a2.x - b2.x, a2.y - b2.y);
        const r = cv.getBoundingClientRect();
        if (pinch && before > 10) this.zoomBy(after / before, (a2.x + b2.x) / 2 - r.left, (a2.y + b2.y) / 2 - r.top);
        pinch = true;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = null; if (!pts.size) cv.classList.remove('drag'); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      this.zoomBy(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    addEventListener('resize', () => { if (this.isOpen) this.redraw(true); });
  }

  toggle(open) {
    if (open === this.isOpen) return;
    if (open && !this.canOpen()) return;
    this.isOpen = open;
    this.box.hidden = !open;
    document.body.classList.toggle('map-open', open);
    if (this.btn) this.btn.setAttribute('aria-expanded', String(open));
    if (open) {
      if (!this.base) this.base = this.buildBase(RES);
      this.ore = this.ore.length ? this.ore : this.findOre();
      const p = this.player.pos;
      this.reveal(p.x, p.z);
      const b = BIOMES[this.world.biomeAt(p.x, p.z)];
      this.box.querySelector('#map-where').textContent = `You are in ${b.name}`;
      this.size();
      this.view.cx = p.x; this.view.cz = p.z; this.view.s = this.fit * 1.5;
      this.clampView();
      this.redraw();
      this.box.querySelector('#map-close').focus({ preventScroll: true });
    } else if (this.btn) this.btn.focus({ preventScroll: true });
    if (this.audio) this.audio.sfx('ui');
    this.onToggle(open);
  }

  size() {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
    this.fit = Math.min(this.W, this.H) / (N * 0.92);
  }
  clampView() {
    const v = this.view;
    v.s = clamp(v.s, this.fit * 0.9, 12);
    v.cx = clamp(v.cx, -HALF, HALF); v.cz = clamp(v.cz, -HALF, HALF);
  }
  panBy(dx, dz) { this.view.cx += dx; this.view.cz += dz; this.clampView(); this.redraw(); }
  zoomBy(f, sx = this.W / 2, sy = this.H / 2) {
    const v = this.view;
    const wx = v.cx + (sx - this.W / 2) / v.s, wz = v.cz + (sy - this.H / 2) / v.s;
    v.s *= f; this.clampView();
    v.cx = wx - (sx - this.W / 2) / v.s; v.cz = wz - (sy - this.H / 2) / v.s;
    this.clampView(); this.redraw();
  }
  redraw(resized) {
    if (resized) this.size();
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  draw() {
    const ctx = this.cv.getContext('2d'), v = this.view, d = this.dpr;
    const sx = (x) => this.W / 2 + (x - v.cx) * v.s, sy = (z) => this.H / 2 + (z - v.cz) * v.s;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    this.fogLayer();
    // the island, then your building pieces, then the clouds over unexplored land (all in metres)
    ctx.setTransform(d * v.s, 0, 0, d * v.s, d * (this.W / 2 - v.cx * v.s), d * (this.H / 2 - v.cz * v.s));
    ctx.imageSmoothingEnabled = true;
    // clouds all the way out (lined up with the fog's own clouds, so there is no seam)
    const FW = HALF + FP * FG;
    if (!this.cloudFill) {
      this.cloudFill = ctx.createPattern(this.clouds, 'repeat');
      const k = (FW * 2) / FOG_PX;
      if (this.cloudFill.setTransform && window.DOMMatrix) this.cloudFill.setTransform(new DOMMatrix([k, 0, 0, k, -FW, -FW]));
    }
    ctx.fillStyle = this.cloudFill;
    ctx.fillRect(v.cx - this.W / v.s, v.cz - this.H / v.s, (this.W / v.s) * 2, (this.H / v.s) * 2);
    ctx.drawImage(this.base, -HALF, -HALF, N, N);
    if (this.path && this.path.pts) {
      if (!this.pathShape) {
        this.pathShape = new Path2D();
        for (const p of this.path.pts) { this.pathShape.moveTo(p.x + 0.75, p.z); this.pathShape.arc(p.x, p.z, 0.75, 0, Math.PI * 2); }
      }
      ctx.fillStyle = 'rgb(220, 198, 156)'; ctx.fill(this.pathShape);
    }
    const B = this.builder;
    if (B && B.pieces) {
      for (const p of B.pieces.values()) {
        if (p.kind === 'floor' || p.kind === 'roof' || p.kind === 'stairs') {
          ctx.fillStyle = p.kind === 'roof' ? '#a4543a' : '#e6cf9c';
          ctx.fillRect(p.a * 2, p.b * 2, 2, 2);
        }
      }
      ctx.strokeStyle = '#5a3b22'; ctx.lineWidth = 0.45; ctx.lineCap = 'round';
      for (const p of B.pieces.values()) {
        if (!B.seg || p.kind === 'floor' || p.kind === 'roof' || p.kind === 'stairs') continue;
        try { const [x0, z0, x1, z1] = B.seg(p); ctx.beginPath(); ctx.moveTo(x0, z0); ctx.lineTo(x1, z1); ctx.stroke(); } catch { /* not an edge piece */ }
      }
    }
    ctx.drawImage(this.fogLayer(), -FW, -FW, FW * 2, FW * 2);
    ctx.setTransform(d, 0, 0, d, 0, 0);

    // places you know: the old cabin, the pond, the waterfall, iron ore, your builds
    const seen = (x, z) => this.isExplored(x, z);
    const big = v.s >= 2.6;   // close enough for small labels
    const label = (text, x, y, size = 13, color = '#fbf3e4') => {
      ctx.font = `600 ${size}px Fredoka, 'Trebuchet MS', sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20, 16, 10, 0.85)';
      ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
    };
    const badge = (x, y, fill, edge, glyph) => {
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = edge; ctx.stroke();
      glyph(x, y);
    };
    const house = (x, y, col = '#5a3b22') => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x + 4.5, y); ctx.lineTo(x + 4.5, y + 5.5); ctx.lineTo(x - 4.5, y + 5.5); ctx.lineTo(x - 4.5, y); ctx.closePath(); ctx.fill(); };
    const flame = (x, y) => { ctx.fillStyle = '#e8641e'; ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.quadraticCurveTo(x + 7, y + 1, x, y + 6); ctx.quadraticCurveTo(x - 7, y + 1, x, y - 7); ctx.fill(); ctx.fillStyle = '#ffd56a'; ctx.beginPath(); ctx.arc(x, y + 2, 2.4, 0, Math.PI * 2); ctx.fill(); };
    const sprout = (x, y) => { ctx.strokeStyle = '#3c7a2a'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x, y - 2); ctx.stroke(); ctx.fillStyle = '#5aa83a'; ctx.beginPath(); ctx.ellipse(x - 3.5, y - 3, 3.6, 2, -0.5, 0, Math.PI * 2); ctx.ellipse(x + 3.5, y - 3, 3.6, 2, 0.5, 0, Math.PI * 2); ctx.fill(); };
    const anvil = (x, y) => { ctx.fillStyle = '#3d3f46'; ctx.fillRect(x - 6, y - 4, 12, 4); ctx.fillRect(x - 2.5, y, 5, 3); ctx.fillRect(x - 5, y + 3, 10, 2.5); };
    const tent = (x, y) => { ctx.fillStyle = '#5a3b22'; ctx.beginPath(); ctx.moveTo(x - 7, y + 5); ctx.lineTo(x, y - 6); ctx.lineTo(x + 7, y + 5); ctx.closePath(); ctx.fill(); };
    const drop = (x, y) => { ctx.fillStyle = '#2f86c6'; ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.quadraticCurveTo(x + 6, y + 1, x, y + 6); ctx.quadraticCurveTo(x - 6, y + 1, x, y - 7); ctx.fill(); };
    const falls = (x, y) => { ctx.strokeStyle = '#2f86c6'; ctx.lineWidth = 2; for (const o of [-3.5, 0, 3.5]) { ctx.beginPath(); ctx.moveTo(x + o, y - 6); ctx.lineTo(x + o, y + 6); ctx.stroke(); } };
    const ore = (x, y) => { ctx.fillStyle = '#7f838c'; ctx.beginPath(); ctx.moveTo(x - 6, y + 4); ctx.lineTo(x - 3, y - 5); ctx.lineTo(x + 4, y - 4); ctx.lineTo(x + 6, y + 4); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#d27a3a'; ctx.beginPath(); ctx.arc(x - 1, y - 1, 1.8, 0, Math.PI * 2); ctx.arc(x + 2.5, y + 1.5, 1.5, 0, Math.PI * 2); ctx.fill(); };

    const marks = [];
    const c = SITE.cabin, pd = SITE.pond, st = SITE.stream;
    marks.push({ x: c.x, z: c.z, glyph: (x, y) => house(x, y), fill: '#f4e2bd', edge: '#5a3b22', name: 'Old cabin' });
    marks.push({ x: pd.x, z: pd.z, glyph: drop, fill: '#dff1f6', edge: '#2f6f8f', name: 'Pond' });
    marks.push({ x: (st.x0 + st.x1) / 2, z: st.z0 + 3, glyph: falls, fill: '#dff1f6', edge: '#2f6f8f', name: 'Waterfall' });
    for (const o of this.ore) marks.push({ x: o.x, z: o.z, glyph: ore, fill: '#d9dadf', edge: '#c8763a', name: 'Iron ore' });
    const G = { cabin: house, campfire: flame, farm: sprout, forge: anvil, shelter: tent };
    const NAMES = { cabin: 'Your cabin', campfire: 'Campfire', farm: 'Farm', forge: 'Forge', shelter: 'Shelter' };
    for (const s of this.game.structures || []) marks.push({ x: s.x, z: s.z, glyph: G[s.type] || tent, fill: '#f4e2bd', edge: '#5a3b22', name: NAMES[s.type] || '', mine: true });
    const placed = [];
    for (const m of marks) {
      if (!m.mine && !seen(m.x, m.z)) continue;
      const x = sx(m.x), y = sy(m.z);
      if (x < -20 || y < -20 || x > this.W + 20 || y > this.H + 20) continue;
      // markers closer than a badge apart are drawn once (when zoomed far out)
      if (placed.some((q) => Math.hypot(q[0] - x, q[1] - y) < 16)) continue;
      placed.push([x, y]);
      badge(x, y, m.fill, m.edge, m.glyph);
      if (big && m.name) label(m.name, x, y + 21, 12);
    }
    // places to visit: question-mark pins (named once Saga writes them and you have seen them)
    for (const p of PLACES) {
      const x = sx(p.x), y = sy(p.z);
      if (x < -20 || y < -30 || x > this.W + 20 || y > this.H + 20) continue;
      ctx.fillStyle = '#ffcf6a'; ctx.strokeStyle = '#3a2510'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.arc(x, y - 12, 10, Math.PI * 0.72, Math.PI * 2.28); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a2510'; ctx.font = "700 14px Fredoka, 'Trebuchet MS', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', x, y - 11.5);
      if (big && p.name && seen(p.x, p.z)) label(p.name, x, y + 12, 12);
      placed.push([x, y - 12]);
    }
    // land names (always shown, so you know where to head)
    const fs = v.s > 3 ? 16 : 14;
    ctx.font = `600 ${fs}px Fredoka, 'Trebuchet MS', sans-serif`;
    for (const l of this.labels) {
      const x = sx(l.x); let y = sy(l.z);
      if (x < -80 || y < -20 || x > this.W + 80 || y > this.H + 20) continue;
      const hw = ctx.measureText(l.name).width / 2 + 12;
      // nudge the name up or down until it clears the markers (badges, their labels and pins)
      for (const dy of [0, 30, -30, 54, -54, 78, -78, 102, -102]) {
        if (!placed.some((q) => Math.abs(q[0] - x) < hw && q[1] - 14 < y + dy + 10 && q[1] + (big ? 30 : 12) > y + dy - 10)) { y += dy; break; }
      }
      label(l.name, x, y, fs, '#ffe2b0');
      ctx.font = `600 ${fs}px Fredoka, 'Trebuchet MS', sans-serif`;
    }
    // you: an arrow pointing the way you face
    const pl = this.player, px = sx(pl.pos.x), py = sy(pl.pos.z), f = pl.facing;
    ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI - f);   // facing f walks along (sin f, cos f); north (-z) is up
    ctx.fillStyle = 'rgba(255, 179, 92, 0.25)'; ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb35c'; ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8.5, 9); ctx.lineTo(0, 4.5); ctx.lineTo(-8.5, 9); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();
    // north
    ctx.save(); ctx.translate(26, 26);
    ctx.fillStyle = 'rgba(16, 22, 18, 0.72)'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb35c'; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(5, -4); ctx.lineTo(-5, -4); ctx.closePath(); ctx.fill();
    label('N', 0, 4, 13);
    ctx.restore();
  }
}
