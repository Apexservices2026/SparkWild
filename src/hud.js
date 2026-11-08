// Everything drawn on top of the game: survival bars, the item bar, crafting,
// objectives, messages, and the touch buttons for phones.
import * as THREE from 'three';
import { ITEMS, RECIPES, LEVELS, icon } from './items.js';
import { OBJECTIVES } from './game.js';
import { Sparkles } from './sparkle.js';   // Forge: pickup sparkle (decision 13)

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

// ---------- smooth icons for the status bar (24 x 24, drawn with a soft outline) ----------
const SHAPES = {
  health: [['path', 'd="M12 20.4s-7.4-4.6-9.3-9.2C1.4 8 3.4 4.6 6.9 4.6c2 0 3.6 1.1 5.1 2.9 1.5-1.8 3.1-2.9 5.1-2.9 3.5 0 5.5 3.4 4.2 6.6-1.9 4.6-9.3 9.2-9.3 9.2z"', '#ff5a60'],
    ['ellipse', 'cx="7.4" cy="8.6" rx="1.9" ry="1.3" transform="rotate(-35 7.4 8.6)"', 'rgba(255,255,255,0.55)', true]],
  food: [['rect', 'x="-1.5" y="0" width="3" height="6.6" transform="translate(10.6 13.4) rotate(45)"', '#f6eddc'],
    ['circle', 'cx="4.5" cy="17.4" r="2.1"', '#f6eddc'], ['circle', 'cx="6.6" cy="19.5" r="2.1"', '#f6eddc'],
    ['ellipse', 'cx="14.4" cy="9.6" rx="7" ry="5.6" transform="rotate(-45 14.4 9.6)"', '#dc8a3e'],
    ['ellipse', 'cx="15.6" cy="6.9" rx="2" ry="1.1" transform="rotate(-45 15.6 6.9)"', 'rgba(255,240,210,0.5)', true]],
  water: [['path', 'd="M12 2.8c-3.2 4.4-6.4 7.9-6.4 11.5a6.4 6.4 0 0 0 12.8 0C18.4 10.7 15.2 7.2 12 2.8z"', '#4cb4f6'],
    ['ellipse', 'cx="9.4" cy="14.6" rx="1.2" ry="2" transform="rotate(20 9.4 14.6)"', 'rgba(255,255,255,0.55)', true]],
  warmth: [['path', 'd="M12 2.4c1 3.6 5.6 5.9 5.6 11.2a5.6 5.6 0 0 1-11.2 0c0-2.6 1.3-4.3 2.6-5.6.2 1.6.9 2.7 2 3.2-.5-3.2.3-6.2 1-8.8z"', '#ff8a3a'],
    ['path', 'd="M12 11.8c.9 1.5 2.4 2.4 2.4 4.4a2.4 2.4 0 0 1-4.8 0c0-1.6 1.1-2.7 2.4-4.4z"', '#ffd56a', true]],
  energy: [['path', 'd="M13.6 2.6 5.2 13.4h5.4l-1.2 8 9.2-11.6h-5.5z"', '#c2e65a']],
};
function vicon(kind, full) {
  const parts = SHAPES[kind];
  const edge = full ? 'rgba(28,16,10,0.9)' : 'rgba(255,236,200,0.6)';
  const outline = parts.filter((p) => !p[3]).map(([t, a]) => `<${t} ${a}/>`).join('');
  const fills = parts.filter((p) => full || !p[3]).map(([t, a, c]) => `<${t} ${a} fill="${full ? c : 'rgba(8,12,10,0.6)'}"/>`).join('');
  return `<svg viewBox="-1 -1 26 26" aria-hidden="true"><g fill="${edge}" stroke="${edge}" stroke-width="2.6" stroke-linejoin="round">${outline}</g>${fills}</svg>`;
}
const LV_RING = 2 * Math.PI * 15.5;

// ---------- pop-up tips: one at a time, each shown once ----------
const near = (g, type) => {
  let best = 1e9;
  for (const c of g.creatures.list) if (c.type === type && !c.dead) best = Math.min(best, Math.hypot(c.x - g.player.pos.x, c.z - g.player.pos.z));
  return best;
};
const picked = (g) => (g.counters.stick || 0) + (g.counters.stone || 0) + (g.counters.fiber || 0) + (g.counters.berries || 0);
const crafted = (g) => Object.entries(g.counters).reduce((n, [k, v]) => n + (k.startsWith('crafted_') ? v : 0), 0);
const article = (name) => (/^[aeiou]/i.test(name) ? 'an ' : 'a ') + name.toLowerCase();
// Each tip: when it should appear, when it is done (it then closes itself), the button it points at,
// and its words for touch screens (t) and for keyboards (k). Listed in order of importance.
const TIPS = [
  { id: 'walk', when: (g) => g.counters.walked < 1, done: (g) => g.counters.walked > 4, life: 40,
    t: () => 'Slide your <b>left thumb</b> to walk. Push further to run.',
    k: () => 'Walk with <b>W A S D</b> or the arrows. Hold <b>Shift</b> to run.' },
  { id: 'thornmaw', when: (g) => near(g, 'thornmaw') < 22, done: (g, s) => g.counters.kill_thornmaw > s.maw || near(g, 'thornmaw') > 32, btn: 'btn-atk',
    // Maverick: combat (roll through the lunge, then hit it while it wobbles)
    t: () => 'A Briarlurk! When it glows, tap <b>DODGE</b>, then <b>ATTACK</b> while it wobbles.',
    k: () => 'A Briarlurk! When it glows, roll with <b>X</b>, then hit <b>Space</b> while it wobbles.' },
  { id: 'thirsty', when: (g) => g.stats.water < 40, done: (g) => g.stats.water >= 50, btn: 'btn-act',
    t: () => 'Parched? Stand at the pond\'s edge and tap <b>USE</b>.',
    k: () => 'Parched? Stand at the pond\'s edge and press <b>E</b>.' },
  { id: 'hungry', when: (g) => g.stats.food < 40, done: (g) => g.stats.food >= 50,
    t: () => 'Tummy rumbling? Tap berries in your bag, or cook a Puffhop.',
    k: () => 'Tummy rumbling? Click berries in your bag, or cook a Puffhop.' },
  { id: 'dark', when: (g) => g.sky.hour > 17.6 && g.sky.hour < 21 && !g.has('torch'), done: (g) => g.has('torch') || g.sky.hour < 17, btn: 'btn-craft',
    t: () => 'Getting dark! Tap <b>CRAFT</b> for a torch (1 stick, 1 fiber).',
    k: () => 'Getting dark! Press <b>C</b> for a torch (1 stick, 1 fiber).' },
  { id: 'cook', when: (g) => g.has('meat'), done: (g, s) => g.counters.cooked > s.cooked || !g.has('meat'), btn: 'btn-act',
    t: (g) => g.structures.some((x) => x.type === 'campfire') ? 'Dinner time! Stand at your fire and tap <b>USE</b> to cook.' : 'Raw meat needs a fire. Tap <b>CRAFT</b> to build one, then <b>USE</b> it.',
    k: (g) => g.structures.some((x) => x.type === 'campfire') ? 'Dinner time! Stand at your fire and press <b>E</b> to cook.' : 'Raw meat needs a fire. Press <b>C</b> to build one, then <b>E</b> at it.' },
  { id: 'pickup', when: (g) => { const d = g.describe(g.target); return !!d && d.ok && (g.target.type === 'pickup' || g.target.type === 'berries'); },
    done: (g, s) => picked(g) > s.picked, btn: 'btn-act',
    t: () => 'Ooh, loot! Tap <b>USE</b> to grab it.', k: () => 'Ooh, loot! Press <b>E</b> to grab it.' },
  { id: 'hunt', when: (g) => near(g, 'puffhop') < 10 && g.sky.hour > 6 && g.sky.hour < 19.5, done: (g, s) => g.counters.kill_puffhop > s.hop || near(g, 'puffhop') > 20, btn: 'btn-atk',
    t: () => 'A Puffhop! Sneak close and tap <b>ATTACK</b> for meat.',
    k: () => 'A Puffhop! Sneak close and press <b>Space</b> for meat.' },
  { id: 'craft', when: (g) => RECIPES.some((r) => g.canCraft(r)), done: (g, s) => crafted(g) > s.crafted || !$('craft').hidden, btn: 'btn-craft',
    t: (g) => `You can make ${article(RECIPES.find((r) => g.canCraft(r)).name)} now! Tap <b>CRAFT</b>.`,
    k: (g) => `You can make ${article(RECIPES.find((r) => g.canCraft(r)).name)} now! Press <b>C</b>.` },
];

export class Hud {
  constructor(camera) {
    this.camera = camera;
    this.dirty = true;
    this.root = $('hud-game');
    // status bar: 5 hearts, 5 drumsticks, 5 drops (each one is 20 points, shown in halves),
    // then small meters for warmth and energy. The page is only touched when a value changes.
    this.rows = {};
    for (const [k, label] of [['health', 'Health'], ['food', 'Food'], ['water', 'Water']]) {
      const box = $('sb-' + k);
      box.title = label;
      box.innerHTML = Array.from({ length: 5 }, () => `<span class="ic">${vicon(k, false)}<span class="full">${vicon(k, true)}</span></span>`).join('');
      this.rows[k] = { box, ics: [...box.children], label, last: -1, low: null };
    }
    this.meters = {};
    for (const [k, label] of [['warmth', 'Warmth'], ['energy', 'Energy']]) {
      const box = $('sb-' + k);
      box.innerHTML = `${vicon(k, true)}<span class="m-bar"><span class="m-fill"></span></span>`;
      this.meters[k] = { box, fill: box.querySelector('.m-fill'), label, last: -1, low: null };
    }
    this.lastHealth = null;
    this.lvKey = '';
    // keep the news strip and the cards just under the status bar, whatever its height
    const bar = $('statusbar');
    const setBarH = () => document.documentElement.style.setProperty('--bar-h', `${bar.offsetHeight}px`);
    if (window.ResizeObserver) new ResizeObserver(setBarH).observe(bar);
    addEventListener('resize', setBarH);
    setBarH();
    this.coach = { el: $('coach'), text: $('coach-text'), tip: null, t: 0, gap: 1.5, check: 0, btn: null };
    this.playing = false;
    this.obj = $('objective');
    this.hotbar = $('hotbar');
    this.prompt = $('prompt');
    this.toasts = $('toasts');
    this.floats = $('floats');
    this.actBtn = $('btn-act');
    // the round Dodge and Bow buttons use the same hand-drawn icons as everything else
    for (const [btn, id] of [['btn-dodge', 'dodge'], ['btn-bow', 'bow']]) {
      const old = $(btn) && $(btn).querySelector('svg');
      if (old) old.outerHTML = icon(id);
    }
    this.lastPrompt = '';
    this.v = new THREE.Vector3();
  }

  bind(game) {
    this.game = game;
    // the news strip: tap to hide, the small lines button brings it back
    let hidden = false;
    try { hidden = localStorage.getItem('hearthwild-ticker') === 'off'; } catch { /* storage blocked */ }
    document.body.classList.toggle('no-ticker', hidden);
    const setTicker = (off) => {
      document.body.classList.toggle('no-ticker', off);
      try { localStorage.setItem('hearthwild-ticker', off ? 'off' : 'on'); } catch { /* storage blocked */ }
    };
    $('ticker').addEventListener('click', () => setTicker(true));
    // the goal: on small upright phones it is a slim pill; a tap opens the full text (and closes it again)
    this.obj.setAttribute('role', 'button');
    this.obj.tabIndex = 0;
    this.obj.setAttribute('aria-expanded', 'false');
    const toggleGoal = () => this.openGoal(!this.obj.classList.contains('open'), 0);
    this.obj.addEventListener('click', toggleGoal);
    this.obj.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGoal(); } });
    $('btn-news').addEventListener('click', () => { $('btn-news').classList.remove('unread'); setTicker(false); });
    // tips: on/off in settings; each tip is shown once (turning tips back on shows them all again)
    let seen = [];
    try { seen = JSON.parse(store.get('hearthwild-tips-seen') || '[]'); } catch { seen = []; }
    this.coach.seen = new Set(Array.isArray(seen) ? seen : []);
    this.coach.on = store.get('hearthwild-tips') !== 'off';
    const opt = $('opt-tips');
    opt.checked = this.coach.on;
    opt.addEventListener('change', () => {
      this.coach.on = opt.checked;
      store.set('hearthwild-tips', opt.checked ? 'on' : 'off');
      if (opt.checked) { this.coach.seen.clear(); store.set('hearthwild-tips-seen', '[]'); this.coach.gap = 1; } else this.hideTip();
    });
    $('coach-close').addEventListener('click', (e) => { e.stopPropagation(); this.hideTip(); });
    addEventListener('resize', () => { if (this.coach.tip) this.placeTip(); });
    setInterval(() => this.renderNews(), 2000);
    $('btn-craft').addEventListener('click', () => this.toggleCraft());
    $('craft-close').addEventListener('click', () => this.toggleCraft(false));
    // a tap on the dark area around the card closes the crafting menu
    $('craft').addEventListener('click', (e) => { if (e.target === e.currentTarget) this.toggleCraft(false); });
    this.hotbar.addEventListener('click', (e) => {
      const slot = e.target.closest('[data-item]');
      if (slot) { game.use(slot.dataset.item); this.dirty = true; }
    });
    // the item bar fades at an edge when it can scroll that way
    this.hotbar.addEventListener('scroll', () => this.scrollHint(), { passive: true });
    addEventListener('resize', () => this.scrollHint());
  }

  get craftOpen() { return !$('craft').hidden; }

  toggleCraft(open) {
    const p = $('craft');
    const was = !p.hidden;
    p.hidden = open === undefined ? !p.hidden : !open;
    document.body.classList.toggle('craft-open', !p.hidden);
    if (!p.hidden) {
      this.renderCraft();
      if (!was) { const first = p.querySelector('.r-btn:not(:disabled)') || $('craft-close'); first.focus({ preventScroll: true }); }
    } else if (was && p.contains(document.activeElement)) document.activeElement.blur();
    if (was !== !p.hidden) this.game.audio.sfx('ui');
  }

  scrollHint() {
    const h = this.hotbar;
    const left = h.scrollLeft > 2, right = h.scrollLeft + h.clientWidth < h.scrollWidth - 2;
    h.classList.toggle('more-left', left);
    h.classList.toggle('more-right', right);
  }

  renderCraft() {
    const g = this.game, list = $('craft-list');
    list.innerHTML = '';
    for (const r of RECIPES) {
      const locked = r.soon || g.level < r.level;
      const row = el('div', 'recipe' + (locked ? ' locked' : ''));
      row.dataset.id = r.id;   // Forge: tutorial (so it can point at a recipe)
      const needs = r.needs ? Object.entries(r.needs).map(([id, n]) =>
        `<span class="need ${g.has(id, n) ? 'ok' : 'no'}">${icon(id)}${g.inv[id] || 0}/${n}</span>`).join('') : '';
      row.innerHTML = `<span class="r-icon">${icon(locked ? 'lock' : (r.gives || r.place || r.id))}</span>
        <span class="r-body"><span class="r-name">${r.name}${locked ? ` <em>Level ${r.level}</em>` : ''}</span>
        <span class="r-desc">${r.desc}</span><span class="r-needs">${needs}</span></span>`;
      if (!locked) {
        const owned = g.owns(r);
        const b = el('button', 'r-btn', owned ? 'Got it' : r.place ? 'Build' : 'Craft');
        b.disabled = !g.canCraft(r);
        if (owned) row.classList.add('owned');
        b.addEventListener('click', () => {
          if (g.craft(r.id)) {
            this.toast(`${r.place ? 'Built' : 'Crafted'}: ${r.name}`, r.gives || r.place);
            if (r.place) this.toggleCraft(false); else this.renderCraft();
          }
        });
        row.appendChild(b);
      }
      list.appendChild(row);
    }
  }

  // open the goal card; with secs > 0 it tucks itself back into a pill after that long
  openGoal(open, secs) {
    clearTimeout(this.goalTimer);
    this.obj.classList.toggle('open', open);
    this.obj.setAttribute('aria-expanded', String(open));
    if (open && secs) this.goalTimer = setTimeout(() => this.openGoal(false, 0), secs * 1000);
  }

  toast(text, id) {
    const t = el('div', 'toast', `${id ? `<span class="t-icon">${icon(id)}</span>` : ''}<span>${text}</span>`);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 2) this.toasts.firstChild.remove();   // at most 2 at a time
    setTimeout(() => t.classList.add('out'), 2200);
    setTimeout(() => t.remove(), 2800);
  }

  // Big moments (level up, morning, new place) go to the news strip at the top,
  // so nothing ever covers the middle of the screen.
  banner(title, sub) { this.news(sub, title); }

  news(text, tag = '', life = 90) {
    this.items = (this.items || []).filter((m) => m.text !== text);
    this.items.push({ text, tag, until: performance.now() + life * 1000 });
    while (this.items.length > 5) this.items.shift();
    this.fresh = true;
    this.renderNews();
  }
  // The newest message comes first and starts already in view, then the strip scrolls on.
  renderNews() {
    const now = performance.now();
    this.items = (this.items || []).filter((m) => m.until > now);
    document.body.classList.toggle('news-empty', !this.items.length);   // no messages: the strip tucks away
    const track = $('ticker-track');
    const html = this.items.slice().reverse().map((m) => `<span>${m.tag ? `<b>${m.tag}</b>` : ''}${m.text}</span>`).join('');
    const fresh = this.fresh; this.fresh = false;
    if (html === this.newsHtml) return;
    this.newsHtml = html;
    track.innerHTML = html;
    const chars = this.items.reduce((n, m) => n + m.text.length + m.tag.length, 0);
    const secs = Math.max(14, chars * 0.16 + 8);
    track.style.setProperty('--tick-time', `${secs}s`);
    track.style.animation = 'none'; void track.offsetWidth;
    const win = track.parentElement.clientWidth, w = track.offsetWidth;
    track.style.animationDelay = fresh && w > 0 ? `${(-Math.max(0, win - 6) / w * secs).toFixed(2)}s` : '0s';
    track.style.animation = '';
    if (fresh) {
      const t = $('ticker');
      t.classList.remove('fresh'); void t.offsetWidth; t.classList.add('fresh');
      if (document.body.classList.contains('no-ticker')) $('btn-news').classList.add('unread');
    }
  }

  hurt() {
    const v = $('vignette'); v.classList.remove('hit'); void v.offsetWidth; v.classList.add('hit');
    this.shakeHearts();
  }
  shakeHearts() { const h = $('sb-health'); h.classList.remove('hurt'); void h.offsetWidth; h.classList.add('hurt'); }

  // ---------- tips ----------
  showTip(tip) {
    const c = this.coach, g = this.game;
    const touch = document.body.classList.contains('touch');
    c.tip = tip; c.t = 0;
    c.snap = { maw: g.counters.kill_thornmaw || 0, hop: g.counters.kill_puffhop || 0, cooked: g.counters.cooked || 0, picked: picked(g), crafted: crafted(g) };
    c.seen.add(tip.id);
    store.set('hearthwild-tips-seen', JSON.stringify([...c.seen]));
    c.text.innerHTML = (touch ? tip.t : tip.k)(g);
    // Atlas: on small upright phones there is no free corner for a card, so the tip goes in the news strip
    // at the top (the highlighted button still pulses) and never covers the player.
    if (innerWidth <= 430 && innerHeight > innerWidth) {
      this.news(c.text.textContent.replace(/\s+/g, ' ').trim(), 'Tip', 40);
      document.body.classList.remove('no-ticker');
      c.btn = tip.btn ? $(tip.btn) : null;
      if (c.btn) c.btn.classList.add('coach-target');
      c.el.hidden = true;
      return;
    }
    c.el.hidden = false;
    c.el.style.animation = 'none'; void c.el.offsetWidth; c.el.style.animation = '';
    c.btn = tip.btn ? $(tip.btn) : null;
    if (c.btn) c.btn.classList.add('coach-target');
    this.placeTip();
  }
  // a small arrow points down at the button the tip talks about, when the tip sits above it
  placeTip() {
    const c = this.coach;
    // sit above the top edge of the item bar (and the prompt over it) whenever they line up
    c.el.style.bottom = '';
    if (getComputedStyle(c.el).bottom !== 'auto') {
      const t = c.el.getBoundingClientRect();
      let top = Infinity;
      for (const id of ['hotbar', 'prompt', 'toasts']) {
        const e = $(id);
        if (!e || e.hidden || !e.offsetWidth) continue;
        const q = e.getBoundingClientRect();
        if (q.height && q.left < t.right && q.right > t.left) top = Math.min(top, q.top);
      }
      if (top < t.bottom + 8) c.el.style.bottom = `${Math.round(innerHeight - top + 10)}px`;
    }
    if (!c.btn) { c.el.classList.remove('arrow'); return; }
    const r = c.el.getBoundingClientRect(), b = c.btn.getBoundingClientRect();
    const ax = b.left + b.width / 2;
    // no arrow if another button sits between the tip and this one (it would look like it points there)
    const blocked = [...document.querySelectorAll('#actions .act')].some((o) => {
      if (o === c.btn) return false;
      const q = o.getBoundingClientRect();
      return q.left < ax && q.right > ax && q.top < b.top;
    });
    const above = !blocked && r.bottom <= b.top + 2 && ax > r.left + 12 && ax < r.right - 12;
    c.el.classList.toggle('arrow', above);
    if (above) c.el.style.setProperty('--ax', `${Math.round(ax - r.left)}px`);
  }
  hideTip() {
    const c = this.coach;
    if (!c.tip) return;
    c.tip = null; c.el.hidden = true; c.gap = 2.5;
    if (c.btn) c.btn.classList.remove('coach-target');
    c.btn = null;
  }
  updateTips(dt) {
    const c = this.coach, g = this.game;
    if (g.tutorial && g.tutorial.active) { this.hideTip(); return; }   // Forge: tutorial (no pop-up tips during the guided start)
    if (c.tip) {
      c.t += dt;
      if (c.tip.done(g, c.snap) || c.t > (c.tip.life || 25) || !c.on) this.hideTip();
      return;
    }
    if (!c.on || !this.playing || g.sleeping) return;
    c.gap -= dt; c.check -= dt;
    if (c.gap > 0 || c.check > 0) return;
    c.check = 0.4;
    if (!$('craft').hidden) return;
    const tip = TIPS.find((tp) => !c.seen.has(tp.id) && tp.when(g));
    if (tip) this.showTip(tip);
  }

  fade(on, text = '') {
    const f = $('fade');
    f.querySelector('span').textContent = text;
    f.classList.toggle('on', on);
  }

  floatText(text, x, y, z, color) {
    const f = el('div', 'float', text);
    f.style.color = color;
    f._p = new THREE.Vector3(x, y, z); f._t = 0;
    this.floats.appendChild(f);
  }

  update(dt) {
    const g = this.game;
    // pickup sparkle: a soft twinkle on loot near the player (one pooled draw call)
    if (!this.sparkle && g.pickups && g.scene) this.sparkle = new Sparkles(g.scene);
    if (this.sparkle) this.sparkle.update(dt, g);
    // hearts, drumsticks and drops: halves of 10 points (a sliver still shows as half)
    if (!this.rowList) { this.rowList = Object.entries(this.rows); this.meterList = Object.values(this.meters); for (const m of this.meterList) m.key = m.label.toLowerCase(); }
    for (const [k, r] of this.rowList) {
      const v = Math.max(0, Math.min(100, g.stats[k]));
      const units = Math.ceil(v / 10 - 0.001);
      if (units !== r.last) {
        r.last = units;
        r.ics.forEach((ic, i) => { ic.className = 'ic' + (units >= i * 2 + 2 ? ' f' : units === i * 2 + 1 ? ' h' : ''); });
        r.box.setAttribute('aria-label', `${r.label}: ${units / 2} of 5`);
      }
      const low = v < 25;
      if (low !== r.low) { r.low = low; r.box.classList.toggle('low', low); }
    }
    if (this.lastHealth !== null && g.stats.health < this.lastHealth - 2.5) this.shakeHearts();
    this.lastHealth = g.stats.health;
    for (const m of this.meterList) {
      const v = Math.round(Math.max(0, Math.min(100, g.stats[m.key])));
      if (v !== m.last) {
        m.last = v;
        m.fill.style.transform = `scaleX(${v / 100})`;
        m.box.setAttribute('aria-label', `${m.label}: ${v} of 100`);
        m.box.title = `${m.label}: ${v}`;
      }
      const low = v < 25;
      if (low !== m.low) { m.low = low; m.box.classList.toggle('low', low); }
    }
    this.updateTips(dt);
    // floating numbers follow the world
    for (let i = this.floats.children.length - 1; i >= 0; i--) {
      const f = this.floats.children[i];
      f._t += dt;
      this.v.copy(f._p); this.v.y += f._t * 1.2;
      this.v.project(this.camera);
      f.style.transform = `translate(${(this.v.x * 0.5 + 0.5) * innerWidth}px, ${(-this.v.y * 0.5 + 0.5) * innerHeight}px)`;
      f.style.opacity = String(Math.max(0, 1 - f._t / 1.1));
      if (f._t > 1.1) f.remove();
    }
    // what the action button would do
    const d = g.describe(g.target);
    const label = d ? d.label : '';
    if (label !== this.lastPrompt) {
      this.lastPrompt = label;
      this.prompt.hidden = !label;
      this.prompt.innerHTML = label ? `<kbd>E</kbd>${label}` : '';
      this.prompt.classList.toggle('dim', !!d && !d.ok);
      $('act-label').textContent = d && d.ok ? (d.short || 'Use') : 'Use';
      this.actBtn.classList.toggle('ready', !!d && d.ok);
    }
    if (!this.dirty) return;
    this.dirty = false;
    if (this.game.objective !== this.lastObjective) {
      if (this.lastObjective !== undefined) { this.news(OBJECTIVES[this.game.objective].text, 'New goal'); this.openGoal(true, 6); }
      this.lastObjective = this.game.objective;
    }
    // level and experience
    const next = LEVELS[g.level + 1], prev = LEVELS[g.level];
    const pct = next ? Math.max(0, Math.min(1, (g.xp - prev) / (next - prev))) : 1;
    const lvKey = `${g.level}:${pct.toFixed(2)}`;
    if (lvKey !== this.lvKey) {
      this.lvKey = lvKey;
      $('lv-num').textContent = `Lv ${g.level}`;
      $('lv-prog').setAttribute('stroke-dasharray', `${(pct * LV_RING).toFixed(1)} ${LV_RING.toFixed(1)}`);
      $('sb-level').setAttribute('aria-label', `Level ${g.level}, ${Math.round(pct * 100)}% to the next level`);
      $('sb-level').title = next ? `Level ${g.level}: ${g.xp - prev} of ${next - prev} XP to level ${g.level + 1}` : `Level ${g.level}`;
    }
    // objective
    const o = OBJECTIVES[g.objective];
    const prog = o.goal ? ` <span class="o-prog">${o.goal(g)[0]}/${o.goal(g)[1]}</span>` : '';
    this.obj.innerHTML = `<span class="o-label">Goal</span><span class="o-text">${o.text}${prog}</span>`;
    // item bar: food (things you can tap to eat or use) first
    const ids = Object.keys(g.inv).filter((id) => g.inv[id] > 0 && ITEMS[id]);
    ids.sort((a, b) => (ITEMS[a].eat ? 0 : 1) - (ITEMS[b].eat ? 0 : 1));
    this.hotbar.innerHTML = ids.length ? ids.map((id) => {
      const it = ITEMS[id];
      return `<button class="slot${it.eat ? ' usable' : ''}" data-item="${id}" title="${it.name}${it.eat ? ` (tap to ${it.eat === 'Use' ? 'use' : 'eat'})` : ''}">
        ${icon(id)}<span class="count">${it.tool ? '' : g.inv[id]}</span>${it.eat ? `<span class="use">${it.badge || it.eat}</span>` : ''}</button>`;
    }).join('') : '<span class="empty">Empty pockets. Go grab some sticks!</span>';
    this.scrollHint();
    if (this.coach.tip) this.placeTip();
    if (!$('craft').hidden) this.renderCraft();
    // the craft button glows when something new can be made
    $('btn-craft').classList.toggle('ready', RECIPES.some((r) => g.canCraft(r)));
  }
}
