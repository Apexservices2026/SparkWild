// The character creator ("Who are you?"): woman or man, skin tone, hair style and color, outfit color
// and a name. It opens after Begin on a new game, and again from Settings ("Change look").
// The preview is the real explorer in the world: main.js frames the camera on them inside #cc-stage
// while the creator is open, and they slowly turn (drag to spin them).
import { LOOKS, DEFAULT_NAME, normalizeLook, randomLook, cleanName } from './player.js';

const $ = (id) => document.getElementById(id);
const darker = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (s) => Math.round(((n >> s) & 255) * k).toString(16).padStart(2, '0');
  return `#${c(16)}${c(8)}${c(0)}`;
};

// A small head in a 24-unit box: the chosen hair style, skin and hair color.
// part: 'all', 'back' (hair behind the head only) or 'front' (everything else)
function headSvg(L, ox = 0, oy = 0, part = 'all') {
  const skin = LOOKS.skins[L.skin].c, hair = LOOKS.hairColors[L.hairColor].c, fit = LOOKS.outfits[L.outfit].c;
  let back = '', front = '';
  const cap = `<path fill="${hair}" d="M6 12.4a6 6 0 0 1 12 0c-1.6-1.5-3.8-2.2-6-2.1-2.2-.1-4.4.6-6 2.1z"/>`;
  if (L.hair === 'long') back = `<path fill="${hair}" d="M5.6 12a6.4 6.4 0 0 1 12.8 0v9.5h-3.2V14H8.8v7.5H5.6z"/>`;
  if (L.hair === 'curls') back = `<g fill="${hair}"><circle cx="12" cy="6.4" r="3.3"/><circle cx="7.1" cy="8.2" r="3"/><circle cx="16.9" cy="8.2" r="3"/><circle cx="5.5" cy="12.6" r="2.6"/><circle cx="18.5" cy="12.6" r="2.6"/></g>`;
  if (L.hair === 'bun') back = `<circle fill="${hair}" cx="12" cy="4.6" r="3"/>`;
  if (L.hair === 'hood') back = `<path fill="${darker(fit, 0.8)}" d="M3.6 22c0-11 3.6-17.6 8.4-17.6S20.4 11 20.4 22z"/>`;
  if (L.hair === 'braid') front = `<g fill="${hair}"><circle cx="17.4" cy="16.6" r="1.9"/><circle cx="18" cy="19.5" r="1.8"/><circle cx="18.2" cy="22.2" r="1.5"/></g>`;
  const rest = `<circle fill="${skin}" cx="12" cy="13" r="6"/>${cap}${front}`
    + '<circle fill="#2a1d16" cx="9.8" cy="13.8" r="0.85"/><circle fill="#2a1d16" cx="14.2" cy="13.8" r="0.85"/>';
  return `<g transform="translate(${ox} ${oy})">${part !== 'front' ? back : ''}${part !== 'back' ? rest : ''}</g>`;
}
// A whole small figure (40-unit box) for the Woman and Man buttons: same head, different body shape
function figureSvg(L, body) {
  const fit = LOOKS.outfits[L.outfit].c;
  const shape = body === 'woman'
    ? 'M9 40l3.2-10.6Q13.4 23.6 20 23.6t7.8 5.8L31 40z'     // narrower shoulders, tunic flares at the hem
    : 'M6.5 40v-8.6q0-7.8 8.2-7.8h10.6q8.2 0 8.2 7.8V40z';  // broader shoulders
  // long hair and hoods sit behind the shoulders; the face is drawn over the body
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${headSvg(L, 8, 1, 'back')}<path fill="${fit}" d="${shape}"/>${headSvg(L, 8, 1, 'front')}</svg>`;
}

export class Creator {
  constructor(player) {
    this.player = player;
    this.isOpen = false;
    this.mode = 'new';
    this.spin = 0;        // seconds the auto-turn waits after a drag
    this.el = $('creator');
    this.build();
  }

  build() {
    const radio = (group, value, inner, cls, label) =>
      `<label class="cc-opt ${cls}"${label ? ` title="${label}"` : ''}><input type="radio" name="cc-${group}" value="${value}">${inner}</label>`;
    $('cc-bodies').innerHTML = LOOKS.bodies.map((b) => radio('body', b.id, `<span class="cc-body"><span class="cc-fig" data-body="${b.id}"></span>${b.name}</span>`, '')).join('');
    const swatches = (group, list) => list.map((s, i) => radio(group, i, `<span class="dot" style="--c:${s.c}"></span><span class="sr">${s.name}</span>`, 'sw', s.name)).join('');
    $('cc-skin').innerHTML = swatches('skin', LOOKS.skins);
    $('cc-hairColor').innerHTML = swatches('hairColor', LOOKS.hairColors);
    $('cc-outfit').innerHTML = swatches('outfit', LOOKS.outfits);
    $('cc-hair').innerHTML = LOOKS.hairs.map((h) => radio('hair', h.id, `<span class="cc-chip"><span class="cc-head-ic" data-hair="${h.id}"></span>${h.name}</span>`, '')).join('');

    this.el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.type !== 'radio') return;
      const key = t.name.slice(3);
      this.set(key, key === 'body' || key === 'hair' ? t.value : Number(t.value));
    });
    const name = $('cc-name');
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
    $('cc-random').addEventListener('click', () => { this.look = randomLook(this.look.name); this.apply(); });
    $('cc-go').addEventListener('click', () => this.done());
    $('cc-close').addEventListener('click', () => this.cancel());
    // drag the preview to spin the explorer
    const stage = $('cc-stage');
    let drag = null;
    stage.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX }; stage.setPointerCapture(e.pointerId); this.spin = 2; });
    stage.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      this.player.facing += (e.clientX - drag.x) * 0.012; drag.x = e.clientX; this.spin = 2;
    });
    const up = () => { drag = null; };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    // more choices below: a soft fade at the bottom of the list
    const list = this.el.querySelector('.cc-scroll');
    const more = () => list.classList.toggle('more', list.scrollTop + list.clientHeight < list.scrollHeight - 4);
    list.addEventListener('scroll', more, { passive: true });
    addEventListener('resize', () => { if (this.isOpen) { this.measure(); more(); } });
    this.moreCheck = more;
    // Tab stays inside the creator
    this.el.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = [...this.el.querySelectorAll('button, input:not([type=radio]), input[type=radio]:checked')].filter((x) => x.offsetParent);
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
  }

  // mode 'new': after Begin (the main button says "Let's go!"); 'edit': from Settings ("Looks good!")
  open(mode = 'new', { onDone, onCancel } = {}) {
    this.mode = mode; this.onDone = onDone; this.onCancel = onCancel;
    this.before = { ...this.player.look };
    this.look = { ...this.player.look };
    $('cc-name').value = this.look.name === DEFAULT_NAME ? '' : this.look.name;
    $('cc-go').textContent = mode === 'edit' ? 'Looks good!' : "Let's go!";
    $('cc-close').setAttribute('aria-label', mode === 'edit' ? 'Close without changes' : 'Back');
    $('cc-close').title = $('cc-close').getAttribute('aria-label');
    this.el.hidden = false;
    this.isOpen = true;
    this.justOpened = true;
    document.body.classList.add('creator-open');
    this.el.querySelector('.cc-scroll').scrollTop = 0;
    this.apply();
    this.measure();
    this.moreCheck();
    const first = this.el.querySelector('input[name=cc-body]:checked');
    if (first) first.focus({ preventScroll: true });
  }
  close() {
    this.el.hidden = true;
    this.isOpen = false;
    document.body.classList.remove('creator-open');
  }
  set(key, value) { this.look[key] = value; this.apply(); }
  // shows the look on the explorer and on the buttons
  apply() {
    this.look = normalizeLook({ ...this.look, name: this.look.name });
    this.player.setLook(this.look);
    const L = this.look;
    for (const [group, v] of [['body', L.body], ['skin', L.skin], ['hair', L.hair], ['hairColor', L.hairColor], ['outfit', L.outfit]]) {
      for (const r of this.el.querySelectorAll(`input[name=cc-${group}]`)) r.checked = r.value === String(v);
    }
    for (const f of this.el.querySelectorAll('.cc-fig')) f.innerHTML = figureSvg(L, f.dataset.body);
    for (const h of this.el.querySelectorAll('.cc-head-ic')) h.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${headSvg({ ...L, hair: h.dataset.hair })}</svg>`;
  }
  // where the preview sits on screen (main.js frames the camera there)
  measure() {
    const r = $('cc-stage').getBoundingClientRect();
    this.stage = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: Math.max(r.width, 80), h: Math.max(r.height, 110) };
  }
  done() {
    this.look.name = cleanName($('cc-name').value);
    this.apply();
    this.close();
    if (this.onDone) this.onDone(this.look);
  }
  cancel() {
    this.player.setLook(this.before);
    this.close();
    if (this.onCancel) this.onCancel();
  }
}
