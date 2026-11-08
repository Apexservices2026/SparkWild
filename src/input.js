// Controls.
//  PC: WASD/arrows walk, Shift run, E use/gather, Space, F or left click attack (hold for the heavy spin),
//  X or right click dodge-roll, Tab switches the target, C craft, Q/R turn the view, wheel zoom.
//  Phone: left side of the screen is a thumb joystick (push to its edge to run), drag on the right side turns
//  the view (a quick sideways flick there switches the target), pinch to zoom, and the round buttons
//  bottom-right: ATTACK (tap for combos, hold for the heavy spin), DODGE, USE and CRAFT.
export class Input {
  constructor(canvas, stickEl, knobEl) {
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.run = false;
    this.zoomDelta = 0;
    this.turn = 0;        // quarter turns (keys)
    this.turnDrag = 0;    // smooth turning (touch drag), radians
    this.handlers = { action: () => {}, attack: () => {}, attackUp: () => {}, dodge: () => {}, target: () => false, craft: () => {}, gesture: () => {}, escape: () => {} };
    this.touch = { id: null, x0: 0, y0: 0, x: 0, y: 0 };
    this.look = { id: null, x: 0 };
    this.pinch = null;
    this.stick = stickEl; this.knob = knobEl;

    addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { this.handlers.escape(); return; }
      // Keys typed into a setting are not game keys. On a focused button, Enter, Space and Tab
      // belong to the button (Enter used to start the saved game again).
      const tag = e.target && e.target.tagName ? e.target.tagName : '';
      if (/input|select|textarea/i.test(tag)) return;
      if (/button/i.test(tag) && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'Tab')) return;
      this.handlers.gesture();
      if (!e.repeat) {
        if (e.code === 'KeyQ') this.turn -= 1;
        if (e.code === 'KeyR') this.turn += 1;
        if (e.code === 'KeyE' || e.code === 'Enter') this.handlers.action();
        if (e.code === 'Space' || e.code === 'KeyF') this.handlers.attack();
        if (e.code === 'KeyX') this.handlers.dodge();
        if (e.code === 'Tab') this.handlers.target(e.shiftKey ? -1 : 1);
        if (e.code === 'KeyC') this.handlers.craft();
      }   // Maverick: feel. Holding E keeps chopping at a steady rhythm (main.js checks the held key)
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space' || e.code === 'KeyF') this.handlers.attackUp();
    });
    addEventListener('blur', () => { this.keys.clear(); this.handlers.attackUp(); });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomDelta += Math.sign(e.deltaY); }, { passive: false });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.handlers.gesture(); this.handlers.attack(); }
      if (e.button === 2) { this.handlers.gesture(); this.handlers.dodge(); }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.handlers.attackUp(); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      document.body.classList.add('touch');
      this.handlers.gesture();
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.5 && this.touch.id === null) {
          this.touch = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY };
          this.showStick(t.clientX, t.clientY);
        } else if (this.look.id === null) {
          this.look = { id: t.identifier, x: t.clientX, x0: t.clientX, y0: t.clientY, t0: performance.now(), acc: 0 };
        }
      }
      if (e.touches.length === 2 && this.touch.id === null) this.pinch = this.dist(e.touches);
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 2 && this.pinch && this.touch.id === null) {
        const d = this.dist(e.touches);
        this.zoomDelta += (this.pinch - d) / 40;
        this.pinch = d;
        return;
      }
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.id) { this.touch.x = t.clientX; this.touch.y = t.clientY; }
        if (t.identifier === this.look.id) { const d = (t.clientX - this.look.x) * 0.008; this.turnDrag += d; this.look.acc += d; this.look.x = t.clientX; }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.id) this.endStick();
        if (t.identifier === this.look.id) {
          // a quick sideways flick switches the target; if it did, the view turn it made is undone
          const L = this.look, dx = t.clientX - L.x0, dy = t.clientY - L.y0;
          if (performance.now() - L.t0 < 300 && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5 && this.handlers.target(dx > 0 ? 1 : -1)) this.turnDrag -= L.acc;
          this.look.id = null;
        }
      }
      if (e.touches.length < 2) this.pinch = null;
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
    if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  }
  on(name, fn) { this.handlers[name] = fn; }
  dist(ts) { return Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY); }
  showStick(x, y) {
    if (!this.stick) return;
    this.stick.hidden = false;
    this.stick.style.transform = `translate(${x - 60}px, ${y - 60}px)`;
    this.knob.style.transform = 'translate(0px, 0px)';
  }
  endStick() {
    this.touch.id = null; this.stickRun = false;
    if (this.stick) this.stick.hidden = true;
    if (this.knob && this.knobRun) { this.knobRun = false; this.knob.classList.remove('run'); }
  }

  update() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    this.run = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this.touch.id !== null) {
      const dx = this.touch.x - this.touch.x0, dy = this.touch.y - this.touch.y0;
      const len = Math.hypot(dx, dy), max = 50;
      const c = Math.min(len, max) / (len || 1);
      // Maverick: feel. A dead zone in the middle (a resting thumb does not creep), then an analog curve:
      // a gentle push walks slowly, further walks faster, and the edge of the ring runs.
      const DEAD = 7;
      const k = Math.min(1, Math.max(0, (Math.min(len, max) - DEAD) / (max * 0.86 - DEAD)));
      const amt = k > 0 ? 0.15 + 0.85 * Math.pow(k, 1.5) : 0;   // a slow walk just past the dead zone, full walk near the edge
      x = len > 0 ? dx / len * amt : 0; y = len > 0 ? -dy / len * amt : 0;
      // run when the knob reaches the edge of the ring (the knob turns amber); a little give so it does not flicker
      this.stickRun = this.stickRun ? len > max * 0.82 : len > max * 0.9;
      this.run = this.run || this.stickRun;
      if (this.knob) {
        this.knob.style.transform = `translate(${dx * c}px, ${dy * c}px)`;
        if (this.run !== this.knobRun) { this.knobRun = this.run; this.knob.classList.toggle('run', this.run); }
      }
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.move.x = x; this.move.y = y;
  }
}
