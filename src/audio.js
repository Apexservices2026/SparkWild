// audio.js - every sound in the game, made in code with the Web Audio API.
// No audio files and no libraries: the sandboxed page blocks media loads.
//
// Layout of the sound graph:
//   music voices -> warm lowpass -> (dry + reverb) -> music duck -> music volume -> master
//   ambience loops and events -> ambience volume (follows sfx volume) -> master
//   one-shot sfx -> sfx volume -> master
//   master -> gentle compressor (safety) -> speakers

// How windy each biome sounds (0..1).
const BIOME_WIND = { forest: 0.35, mountain: 1, snow: 0.9, desert: 0.7, swamp: 0.25, coast: 0.75 };

// Chord shapes, as semitones above the root.
const CHORD = {
  maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14],
  m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14], m11: [0, 3, 7, 10, 14, 17],
  '9': [0, 4, 7, 10, 14], '7': [0, 4, 7, 10],
};

// Day progressions (C major colour). Each chord is [root MIDI note, shape].
const DAY_PROGS = [
  [[53, 'maj7'], [52, 'm7'], [50, 'm9'], [48, 'maj9']],   // F  Em  Dm  C
  [[48, 'maj9'], [45, 'm9'], [50, 'm7'], [55, '9']],      // C  Am  Dm  G
  [[50, 'm9'], [55, '9'], [48, 'maj9'], [45, 'm7']],      // Dm G   C   Am
  [[53, 'maj9'], [55, '9'], [52, 'm7'], [45, 'm9']],      // F  G   Em  Am
];
// Night progressions (A / D minor colour).
const NIGHT_PROGS = [
  [[45, 'm9'], [50, 'm9'], [53, 'maj7'], [52, 'm7']],     // Am Dm  F   Em
  [[50, 'm9'], [46, 'maj7'], [45, 'm7'], [52, '7']],      // Dm Bb  Am  E7
  [[52, 'm9'], [45, 'm9'], [50, 'm7'], [48, 'maj7']],     // Em Am  Dm  C
  [[45, 'm11'], [53, 'maj9'], [50, 'm9'], [52, 'm7']],    // Am F   Dm  Em
];
// Pentatonic scale (C major = A minor pentatonic) for the sparse melody.
const PENTA = [0, 2, 4, 7, 9];
const MEL_NOTES = [];
for (const oct of [72, 84]) for (const p of PENTA) if (oct + p <= 88) MEL_NOTES.push(oct + p);

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (v) => (v > 1 ? 1 : v > 0 ? v : 0);
const rand = (a, b) => a + Math.random() * (b - a);

export class GameAudio {
  constructor() {
    // No AudioContext yet: browsers only allow one after a tap or click.
    this.ctx = null;
    this._musicVol = 0.5;
    this._sfxVol = 0.7;
    this._muted = false;
    this._last = {};      // last value sent to each smoothed control
    this._lastSfx = {};   // last play time of each sfx (rate limit)
    this._ctlT = 0;       // timer for the 10x-per-second control update
    this._birdT = 2; this._cricketT = 1; this._frogT = 1.5; this._popT = 0.3;
    this._thunderCool = 0;
    this._gust = 0.5;
    this._biome = 'forest';
    // Music sequencer state.
    this._step = 0; this._bar = 0; this._nextT = 0;
    this._prog = null; this._progIdx = -1; this._progNight = false;
    this._chord = null; this._rehitBar = -1; this._melodyBar = -1; this._melody = [];
  }

  get musicVolume() { return this._musicVol; }
  get sfxVolume() { return this._sfxVol; }
  get muted() { return this._muted; }

  // Call from a tap/click handler. Safe to call again (just resumes).
  start() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this._build();
      }
      if (!this._muted && this.ctx.state !== 'running') {
        const p = this.ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
      // iOS unlock: play one silent sample inside the user gesture.
      const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const src = this.ctx.createBufferSource();
      src.buffer = b; src.connect(this.ctx.destination); src.start(0);
      src.onended = () => src.disconnect();
    } catch (e) { /* never break the game over sound */ }
  }

  setMusicVolume(v) {
    this._musicVol = clamp01(+v || 0);
    if (this.ctx) this._ramp('mvol', this.musicVolNode.gain, this._musicGain(), 0.1);
  }
  setSfxVolume(v) {
    this._sfxVol = clamp01(+v || 0);
    if (!this.ctx) return;
    this._ramp('svol', this.sfxVolNode.gain, this._sfxVol, 0.1);
    this._ramp('avol', this.ambVolNode.gain, this._sfxVol * 0.9, 0.1);
  }
  setMuted(m) {
    this._muted = !!m;
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      clearTimeout(this._suspT);
      if (this._muted) {
        this.master.gain.setTargetAtTime(0, now, 0.05);
        // Once faded out, pause the whole engine to save battery.
        this._suspT = setTimeout(() => {
          if (this._muted && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
        }, 350);
      } else {
        const p = this.ctx.resume();
        if (p && p.catch) p.catch(() => {});
        this.master.gain.setTargetAtTime(1, now, 0.08);
      }
    } catch (e) { /* ignore */ }
  }

  // ---------- one-time setup ----------
  _build() {
    const c = this.ctx;
    // Shared noise buffers, made once and reused by every noisy sound.
    this._noiseBuf = this._makeNoise(2);
    this._vinylBuf = this._makeCrackle(4, 4, 0.5);   // sparse record crackle
    this._fireBuf = this._makeCrackle(3, 28, 1);      // dense fire crackle

    this.master = this._gain(this._muted ? 0 : 1);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.01; comp.release.value = 0.25;
    this.master.connect(comp); comp.connect(c.destination);

    // Music chain.
    this.musicVolNode = this._gain(this._musicGain());
    this.musicVolNode.connect(this.master);
    this.musicDuck = this._gain(1);
    this.musicDuck.connect(this.musicVolNode);
    this.musicLP = this._filter('lowpass', 3200, 0.5);
    this.musicLP.connect(this.musicDuck);
    this.verbSend = this._gain(0.25);
    this.reverb = c.createConvolver();
    this.reverb.normalize = true;
    this.reverb.buffer = this._makeImpulse(2.2);
    this.musicLP.connect(this.verbSend); this.verbSend.connect(this.reverb);
    this.reverbOut = this._gain(0.6);
    this.reverb.connect(this.reverbOut); this.reverbOut.connect(this.musicDuck);

    // Electric piano bus with a slow shared tremolo.
    this.epBus = this._gain(1);
    this.epTrem = this._gain(0.88);
    this.epBus.connect(this.epTrem); this.epTrem.connect(this.musicLP);
    this.lfo = c.createOscillator(); this.lfo.frequency.value = 4;
    this.lfoDepth = this._gain(0.12);
    this.lfo.connect(this.lfoDepth); this.lfoDepth.connect(this.epTrem.gain);
    this.lfo.start();
    this.bassBus = this._gain(1); this.bassBus.connect(this.musicLP);
    this.drumBus = this._gain(1); this.drumBus.connect(this.musicLP);
    this.melBus = this._gain(1); this.melBus.connect(this.musicLP);

    // Tape hiss and vinyl crackle, very quiet, after the lowpass.
    this._loop(this._noiseBuf, this._filter('bandpass', 5000, 0.4), 0.004, this.musicDuck);
    this._loop(this._vinylBuf, this._filter('highpass', 900, 0.7), 0.05, this.musicDuck);

    // Ambience chain.
    this.ambVolNode = this._gain(this._sfxVol * 0.9);
    this.ambVolNode.connect(this.master);
    this.ambBus = this._gain(1); this.ambBus.connect(this.ambVolNode);
    // Three fixed stereo spots so birds and bugs come from different sides.
    this.ambSpots = [-0.7, 0, 0.7].map((p) => {
      if (!c.createStereoPanner) return this.ambBus;
      const pn = c.createStereoPanner(); pn.pan.value = p; pn.connect(this.ambBus); return pn;
    });
    this.windF = this._filter('lowpass', 500, 1.6);
    this.windG = this._loop(this._noiseBuf, this.windF, 0, this.ambBus, 0.7);
    const rainHP = this._filter('highpass', 500, 0.5);
    this.rainF = this._filter('lowpass', 4000, 0.5);
    rainHP.connect(this.rainF);
    this.rainG = this._loop(this._noiseBuf, rainHP, 0, this.ambBus, 1, this.rainF);
    this.fireBedG = this._loop(this._noiseBuf, this._filter('lowpass', 380, 0.7), 0, this.ambBus, 0.8);
    this.fireCrkG = this._loop(this._fireBuf, this._filter('bandpass', 2600, 0.6), 0, this.ambBus);
    // Low beating drone that rises when a predator is near.
    this.dangerG = this._gain(0); this.dangerG.connect(this.ambBus);
    for (const f of [55, 58.3]) {
      const o = c.createOscillator(); o.frequency.value = f; o.connect(this.dangerG); o.start();
    }

    // Sfx chain.
    this.sfxVolNode = this._gain(this._sfxVol);
    this.sfxVolNode.connect(this.master);
    this.sfxBus = this._gain(1); this.sfxBus.connect(this.sfxVolNode);

    this._nextT = c.currentTime + 0.15;
  }

  // White noise, 'sec' seconds long, mono.
  _makeNoise(sec) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  // Silence with random tiny clicks: 'perSec' clicks per second.
  _makeCrackle(sec, perSec, amp) {
    const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * sec);
    const b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
    const n = Math.floor(sec * perSec);
    for (let k = 0; k < n; k++) {
      const at = Math.floor(Math.random() * (len - 64));
      const a = amp * rand(0.2, 1) * (Math.random() < 0.5 ? -1 : 1);
      const w = 2 + Math.floor(Math.random() * 30);
      for (let i = 0; i < w; i++) d[at + i] += a * Math.exp(-i / (w * 0.3)) * (Math.random() * 2 - 1);
    }
    return b;
  }
  // Reverb impulse: stereo noise that fades away, slightly darkened.
  _makeImpulse(sec) {
    const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * sec);
    const b = c.createBuffer(2, len, sr), fade = sr * 0.01;
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let y = 0;
      for (let i = 0; i < len; i++) {
        y += 0.3 * (Math.random() * 2 - 1 - y);
        d[i] = y * Math.pow(1 - i / len, 2.5) * (i < fade ? i / fade : 1);
      }
    }
    return b;
  }

  // ---------- small helpers ----------
  _gain(v) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  _filter(type, f, Q) {
    const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b;
  }
  // A looping buffer through a filter into a gain; returns the gain.
  _loop(buf, filt, level, dest, rate = 1, filtOut = filt) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true; src.playbackRate.value = rate;
    const g = this._gain(level);
    src.connect(filt); filtOut.connect(g); g.connect(dest);
    src.start(0, Math.random() * buf.duration * 0.9);
    return g;
  }
  // Smoothly move a control, skipping tiny changes (keeps the timeline short).
  _ramp(key, param, v, tc = 0.3) {
    const old = this._last[key];
    if (old !== undefined && Math.abs(old - v) < 0.002) return;
    this._last[key] = v;
    param.setTargetAtTime(v, this.ctx.currentTime, tc);
  }
  _musicGain() { return 0.6 * this._musicVol * this._musicVol; }
  // Click-free percussive envelope: silent, quick rise, smooth fall.
  _perc(param, t, peak, attack, decay) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.setTargetAtTime(0, t + attack, decay);
  }
  // One short tone (optional pitch sweep). Cleans itself up when done.
  _tone(dest, o) {
    const c = this.ctx, t = o.t, att = o.attack || 0.005, dec = o.decay || 0.1;
    const end = t + att + dec * 7 + 0.02;
    const osc = c.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.sweep || dec * 2));
    if (o.detune) osc.detune.value = o.detune;
    const g = this._gain(0); this._perc(g.gain, t, o.peak, att, dec);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(end);
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
  }
  // One short filtered noise burst (optional filter sweep).
  _noise(dest, o) {
    const c = this.ctx, t = o.t, att = o.attack || 0.003, dec = o.decay || 0.05;
    const end = t + att + dec * 7 + 0.02;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuf; src.loop = true; src.playbackRate.value = o.rate || 1;
    const f = this._filter(o.type || 'bandpass', o.f || 1000, o.Q || 1);
    f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.sweep || dec * 3));
    const g = this._gain(0); this._perc(g.gain, t, o.peak, att, dec);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(end);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  }

  // ---------- instruments ----------
  // Electric-piano note: soft sine body plus a quickly fading octave "tine".
  _ep(dest, midi, t, dur, vel) {
    const c = this.ctx, f = mtof(midi), end = t + dur + 1.6;
    const body = c.createOscillator(), tine = c.createOscillator();
    body.frequency.value = f; body.detune.value = rand(-4, 4);
    tine.frequency.value = f * 2; tine.detune.value = rand(-2, 8);
    const gb = this._gain(0), gt = this._gain(0);
    gb.gain.setValueAtTime(0, t);
    gb.gain.linearRampToValueAtTime(vel, t + 0.025);
    gb.gain.setTargetAtTime(vel * 0.45, t + 0.025, 0.6);
    gb.gain.setTargetAtTime(0, t + dur, 0.25);
    this._perc(gt.gain, t, vel * 0.3, 0.01, 0.18);
    body.connect(gb); tine.connect(gt); gb.connect(dest); gt.connect(dest);
    body.start(t); tine.start(t); body.stop(end); tine.stop(end);
    body.onended = () => { body.disconnect(); tine.disconnect(); gb.disconnect(); gt.disconnect(); };
  }
  // Soft round bass: sine with a little triangle for warmth.
  _bass(midi, t, dur, vel) {
    const c = this.ctx, f = mtof(midi), end = t + dur + 1;
    const o1 = c.createOscillator(), o2 = c.createOscillator();
    o1.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f;
    const g2 = this._gain(0.25), g = this._gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.02);
    g.gain.setTargetAtTime(vel * 0.6, t + 0.02, 0.3);
    g.gain.setTargetAtTime(0, t + dur, 0.12);
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.bassBus);
    o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
    o1.onended = () => { o1.disconnect(); o2.disconnect(); g2.disconnect(); g.disconnect(); };
  }
  _kick(t, v) { this._tone(this.drumBus, { f: 130, f2: 42, sweep: 0.13, t, peak: v, attack: 0.002, decay: 0.09 }); }
  _snare(t, v) {
    this._noise(this.drumBus, { t, peak: v, f: 1800, Q: 0.9, decay: 0.06 });
    this._tone(this.drumBus, { type: 'triangle', f: 190, f2: 150, t, peak: v * 0.5, decay: 0.04 });
  }
  _rim(t, v) {
    this._noise(this.drumBus, { t, peak: v, f: 3000, Q: 3, decay: 0.015 });
    this._tone(this.drumBus, { f: 800, t, peak: v * 0.5, decay: 0.02 });
  }
  _hat(t, v) { this._noise(this.drumBus, { t, peak: v, type: 'highpass', f: 7000, Q: 0.7, decay: 0.012, attack: 0.001 }); }

  // Turn a [root, shape] chord into rootless piano notes in a mid range.
  _voicing(ch) {
    const [root, shape] = ch;
    return CHORD[shape].slice(1).map((i) => { let m = root + i; while (m < 52) m += 12; return m; });
  }

  // ---------- music sequencer (16 steps per bar, scheduled ahead) ----------
  _runScheduler(now, s) {
    if (this._nextT < now - 0.2) this._nextT = now + 0.05; // tab was paused: resync
    let guard = 0;
    while (this._nextT < now + 0.3 && guard++ < 16) {
      const n = clamp01(s.night || 0);
      const sd = 60 / (78 - 8 * n) / 4;          // 78 BPM by day, 70 at night
      const st = this._step;
      const t = this._nextT + (st % 2 === 1 ? sd * 0.3 : 0); // light swing
      this._musicStep(st, t, sd, n);
      this._nextT += sd;
      this._step = (st + 1) % 16;
      if (this._step === 0) this._bar++;
    }
  }

  _musicStep(step, t, sd, n) {
    const bar = this._bar, nightMode = n > 0.55;
    if (step === 0) {
      // New progression every 8 bars, or at a 4-bar line when day/night flips.
      if (!this._prog || bar % 8 === 0 || (this._progNight !== nightMode && bar % 4 === 0)) {
        const list = nightMode ? NIGHT_PROGS : DAY_PROGS;
        let i = Math.floor(Math.random() * list.length);
        if (this._progNight === nightMode && i === this._progIdx) i = (i + 1) % list.length;
        this._prog = list[i]; this._progIdx = i; this._progNight = nightMode;
      }
      this._chord = this._prog[bar % 4];
      const notes = this._voicing(this._chord), vel = 0.065 * (1 - 0.25 * n);
      const strum = nightMode ? 0.03 : 0.014;
      notes.forEach((m, i) => this._ep(this.epBus, m, t + i * strum, 16 * sd - 0.05, vel));
      this._bass(this._chord[0] - 12, t, (nightMode ? 15 : 8) * sd, 0.2);
      this._rehitBar = !nightMode && Math.random() < 0.35 ? bar : -1;
      // Sometimes a sparse pentatonic melody of a few notes.
      if (bar % 8 >= 2 && Math.random() < (nightMode ? 0.3 : 0.4)) {
        const slots = [0, 2, 3, 6, 8, 10, 11, 14].filter(() => Math.random() < 0.5).slice(0, 5);
        let idx = Math.floor(rand(2, MEL_NOTES.length - 2));
        this._melody = slots.map((st) => {
          idx = Math.max(0, Math.min(MEL_NOTES.length - 1, idx + Math.floor(rand(-2, 3))));
          return { step: st, midi: MEL_NOTES[idx] };
        });
        this._melodyBar = bar;
      }
    }
    if (this._melodyBar === bar) {
      for (const m of this._melody) if (m.step === step) this._ep(this.melBus, m.midi, t, sd * 3, 0.045 * (1 - 0.3 * n));
    }
    if (step === 10 && this._rehitBar === bar && this._chord) {
      this._voicing(this._chord).forEach((m, i) => this._ep(this.epBus, m, t + i * 0.012, 5 * sd, 0.035));
    }
    if (step === 10 && !nightMode && Math.random() < 0.6 && this._chord) {
      this._bass(this._chord[0] - 12 + (Math.random() < 0.5 ? 7 : 12), t, 5 * sd, 0.15);
    }

    // Drums: soft loop by day, almost nothing at night.
    if (!nightMode) {
      const dl = 1 - 0.9 * n;
      if (step === 0 || step === 10 || (step === 7 && Math.random() < 0.25)) this._kick(t, 0.32 * dl);
      if (step === 4 || step === 12) this._snare(t, 0.11 * dl);
      else if (step === 15 && Math.random() < 0.15) this._snare(t, 0.03 * dl);
      if (step % 2 === 0) this._hat(t, 0.035 * dl * (step % 4 === 0 ? 1 : 0.7));
      else if (Math.random() < 0.12) this._hat(t, 0.018 * dl);
    } else {
      const nl = 1.6 - n;
      if (step === 0 && bar % 2 === 0 && n < 0.9) this._kick(t, 0.12 * nl);
      if (step === 12 && bar % 2 === 1) this._rim(t, 0.04 * nl);
    }
  }

  // ---------- per-frame update ----------
  update(dt, s) {
    if (!this.ctx || !s || this.ctx.state !== 'running') return;
    try {
      dt = Math.min(Math.max(dt || 0, 0), 0.5);
      const now = this.ctx.currentTime;
      this._biome = s.biome || 'forest';
      this._runScheduler(now, s);
      this._ctlT -= dt;
      if (this._ctlT <= 0) { this._ctlT = 0.1; this._controls(now, s); }
      this._ambientEvents(dt, now, s);
    } catch (e) { /* ignore */ }
  }

  // Gains and filters, about 10 times a second.
  _controls(now, s) {
    const n = clamp01(s.night || 0), storm = clamp01(s.storm || 0), rain = clamp01(s.rain || 0);
    const wind = clamp01(s.wind || 0), snow = clamp01(s.snow || 0), danger = clamp01(s.danger || 0);
    const fire = clamp01(s.nearFire || 0), biome = this._biome;
    // Music mood.
    this._ramp('duck', this.musicDuck.gain, (1 - 0.35 * storm) * (1 - 0.2 * n) * (1 - 0.3 * danger), 0.8);
    this._ramp('lp', this.musicLP.frequency, 3400 - 1300 * n - 600 * storm, 1);
    this._ramp('verb', this.verbSend.gain, 0.22 + 0.4 * n, 1);
    this._ramp('lfo', this.lfo.frequency, 4.2 - 1.4 * n, 1);
    // Wind: random gusts; coast adds a slow wave-like swell.
    this._gust = clamp01(this._gust + (Math.random() - 0.5) * 0.15);
    let w = (BIOME_WIND[biome] ?? 0.35) * (0.12 + 0.6 * wind) + 0.25 * storm;
    if (biome === 'coast') w *= 0.65 + 0.35 * Math.sin(now * 0.9);
    this._ramp('wind', this.windG.gain, w * 0.35, 0.4);
    this._ramp('windF', this.windF.frequency, (250 + 900 * this._gust * (0.4 + wind)) * (1 - 0.35 * snow), 0.5);
    // Rain.
    this._ramp('rain', this.rainG.gain, 0.3 * rain + 0.1 * storm * rain, 0.6);
    this._ramp('rainF', this.rainF.frequency, 2500 + 3000 * rain, 0.6);
    // Campfire and danger drone.
    this._ramp('fireBed', this.fireBedG.gain, 0.12 * fire, 0.3);
    this._ramp('fireCrk', this.fireCrkG.gain, 0.35 * fire, 0.3);
    this._ramp('danger', this.dangerG.gain, 0.05 * danger, 0.6);
  }

  // Random ambient events: birds, crickets, frogs, thunder, fire pops.
  _ambientEvents(dt, now, s) {
    const n = clamp01(s.night || 0), rain = clamp01(s.rain || 0), biome = this._biome;
    const hour = s.hour || 12, dawn = hour >= 5 && hour <= 8;
    // Birds by day in forest, coast and swamp; a dawn chorus is busier.
    this._birdT -= dt;
    if (this._birdT <= 0) {
      this._birdT = rand(1.5, 6) / (dawn ? 2.5 : 1);
      if ((biome === 'forest' || biome === 'coast' || biome === 'swamp') &&
          Math.random() < (1 - n) * (1 - rain) * (1 - 0.6 * (s.danger || 0))) this._bird(now + rand(0.05, 0.25), biome);
    }
    // Crickets at night (not in snow).
    this._cricketT -= dt;
    if (this._cricketT <= 0) {
      this._cricketT = rand(0.5, 1.3);
      if (n > 0.45 && biome !== 'snow' && rain < 0.7) this._cricket(now + rand(0.02, 0.2), 0.02 * n * (biome === 'mountain' ? 0.5 : 1));
    }
    // Frogs in the swamp at night.
    this._frogT -= dt;
    if (this._frogT <= 0) {
      this._frogT = rand(0.8, 3);
      if (biome === 'swamp' && n > 0.4) this._frog(now + rand(0.02, 0.2), 0.05 * n);
    }
    // Distant thunder after a lightning flash.
    this._thunderCool -= dt;
    if ((s.lightning || 0) > 0.5 && this._thunderCool <= 0) {
      this._thunderCool = 1.2;
      this._thunder(now + rand(0.5, 2), clamp01(s.lightning));
    }
    // Bigger fire pops on top of the crackle loop.
    if ((s.nearFire || 0) > 0.05) {
      this._popT -= dt;
      if (this._popT <= 0) {
        this._popT = rand(0.2, 0.8);
        this._noise(this.ambBus, { t: now + 0.02, peak: rand(0.05, 0.12) * s.nearFire, f: rand(2000, 4000), Q: 1.5, attack: 0.001, decay: rand(0.006, 0.015) });
      }
    }
  }

  _spot() { return this.ambSpots[Math.floor(Math.random() * this.ambSpots.length)]; }
  _bird(t, biome) {
    const base = biome === 'coast' ? rand(1500, 2000) : biome === 'swamp' ? rand(2200, 3000) : rand(3000, 4400);
    const dest = this._spot(), count = 2 + Math.floor(Math.random() * 4);
    const up = Math.random() < 0.5;
    for (let i = 0; i < count; i++) {
      const f = base * rand(0.9, 1.2);
      this._tone(dest, { f, f2: f * (up ? 1.35 : 0.7), sweep: 0.06, t: t + i * rand(0.09, 0.17), peak: 0.035, attack: 0.01, decay: 0.025 });
    }
  }
  _cricket(t, level) {
    const c = this.ctx, o = c.createOscillator(), g = this._gain(0);
    o.frequency.value = rand(4300, 4900);
    const pulses = 3 + Math.floor(Math.random() * 3);
    g.gain.setValueAtTime(0, t);
    for (let k = 0; k < pulses; k++) {
      const tk = t + k * 0.045;
      g.gain.setValueAtTime(0, tk);
      g.gain.linearRampToValueAtTime(level, tk + 0.008);
      g.gain.linearRampToValueAtTime(0, tk + 0.03);
    }
    o.connect(g); g.connect(this._spot());
    o.start(t); o.stop(t + pulses * 0.045 + 0.05);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  _frog(t, level) {
    const c = this.ctx, o = c.createOscillator(), f = this._filter('bandpass', 600, 2), g = this._gain(0);
    o.type = 'square';
    const base = rand(200, 300), pulses = 2 + Math.floor(Math.random() * 2);
    g.gain.setValueAtTime(0, t);
    for (let k = 0; k < pulses; k++) {
      const tk = t + k * 0.09;
      o.frequency.setValueAtTime(base, tk);
      o.frequency.exponentialRampToValueAtTime(base * 0.8, tk + 0.06);
      g.gain.setValueAtTime(0, tk);
      g.gain.linearRampToValueAtTime(level, tk + 0.01);
      g.gain.linearRampToValueAtTime(0, tk + 0.06);
    }
    o.connect(f); f.connect(g); g.connect(this._spot());
    o.start(t); o.stop(t + pulses * 0.09 + 0.05);
    o.onended = () => { o.disconnect(); f.disconnect(); g.disconnect(); };
  }
  _thunder(t, str) {
    const dur = rand(3.5, 6);
    this._noise(this.ambBus, { t, peak: 0.5 * str, type: 'lowpass', f: 180, f2: 60, sweep: dur, Q: 0.5, rate: 0.4, attack: 0.25, decay: dur / 5 });
    this._noise(this.ambBus, { t: t + rand(0.5, 1.2), peak: 0.3 * str, type: 'lowpass', f: 140, f2: 50, sweep: dur, Q: 0.5, rate: 0.35, attack: 0.4, decay: dur / 6 });
  }

  // ---------- one-shot sound effects ----------
  sfx(name) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime, t = now + 0.01, d = this.sfxBus;
      const gap = name === 'step' ? 0.12 : 0.04;               // stop pile-ups
      if (now - (this._lastSfx[name] || -1) < gap) return;
      switch (name) {
        case 'pick': // soft pop
          this._tone(d, { f: 600, f2: 950, sweep: 0.06, t, peak: 0.22, decay: 0.04 }); break;
        case 'chop': // woody thunk
          this._noise(d, { t, peak: 0.25, f: 420, Q: 2, decay: 0.04 });
          this._tone(d, { f: 150, f2: 80, sweep: 0.1, t, peak: 0.3, decay: 0.05 }); break;
        case 'stone': // click / knock
          this._noise(d, { t, peak: 0.2, f: 2500, Q: 4, decay: 0.012, attack: 0.001 });
          this._tone(d, { type: 'triangle', f: 900, f2: 700, t, peak: 0.1, decay: 0.02 }); break;
        case 'craft': // two-note chime
          this._ep(d, 79, t, 0.3, 0.12); this._ep(d, 84, t + 0.12, 0.45, 0.12); break;
        case 'eat': // soft crunch
          for (let i = 0; i < 3; i++) this._noise(d, { t: t + i * 0.08, peak: 0.12, f: rand(1500, 3000), Q: 1.2, decay: 0.015 });
          break;
        case 'drink': // bloop
          this._tone(d, { f: 300, f2: 700, sweep: 0.1, t, peak: 0.2, attack: 0.01, decay: 0.04 });
          this._tone(d, { f: 400, f2: 850, sweep: 0.1, t: t + 0.15, peak: 0.15, attack: 0.01, decay: 0.04 }); break;
        case 'hit': // swing then impact
          this._noise(d, { t, peak: 0.08, f: 600, f2: 2000, sweep: 0.1, Q: 1, attack: 0.04, decay: 0.03 });
          this._tone(d, { f: 160, f2: 60, sweep: 0.1, t: t + 0.1, peak: 0.3, decay: 0.05 });
          this._noise(d, { t: t + 0.1, peak: 0.15, type: 'lowpass', f: 800, decay: 0.03 }); break;
        case 'hurt': // low thud
          this._tone(d, { f: 110, f2: 50, sweep: 0.2, t, peak: 0.35, decay: 0.08 });
          this._noise(d, { t, peak: 0.15, type: 'lowpass', f: 300, decay: 0.06 }); break;
        case 'levelup': // gentle rising arpeggio
          [72, 76, 79, 84].forEach((m, i) => this._ep(d, m, t + i * 0.09, i === 3 ? 0.7 : 0.25, 0.1)); break;
        case 'build': // wooden knocks
          for (let i = 0; i < 3; i++) {
            const tt = t + i * 0.14;
            this._tone(d, { type: 'triangle', f: i === 1 ? 260 : 220, t: tt, peak: 0.2, decay: 0.025 });
            this._noise(d, { t: tt, peak: 0.1, f: 800, Q: 2, decay: 0.015 });
          }
          break;
        case 'fire': // whoosh plus a few crackles
          this._noise(d, { t, peak: 0.15, f: 300, f2: 1200, sweep: 0.4, Q: 0.8, attack: 0.15, decay: 0.12 });
          for (let i = 0; i < 4; i++) this._noise(d, { t: t + rand(0.1, 0.6), peak: 0.08, f: rand(2000, 4000), Q: 1.5, attack: 0.001, decay: 0.008 });
          break;
        case 'step': { // very quiet; crunchy on snow, sandy in desert
          const b = this._biome;
          if (b === 'snow') this._noise(d, { t, peak: 0.035, f: 2000, Q: 0.8, decay: 0.03 });
          else if (b === 'desert') this._noise(d, { t, peak: 0.025, type: 'highpass', f: 2500, decay: 0.03 });
          else this._noise(d, { t, peak: 0.04, type: 'lowpass', f: rand(400, 600), decay: 0.025 });
          break;
        }
        case 'creature': { // low growl: two detuned saws, darkened
          const c = this.ctx, f = this._filter('lowpass', 260, 1), g = this._gain(0), end = t + 1.4;
          const os = [65, 68].map((hz) => {
            const o = c.createOscillator(); o.type = 'sawtooth';
            o.frequency.setValueAtTime(hz * 1.15, t);
            o.frequency.linearRampToValueAtTime(hz * 0.9, t + 0.9);
            o.connect(f); o.start(t); o.stop(end); return o;
          });
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.25, t + 0.2);
          g.gain.setTargetAtTime(0, t + 0.5, 0.15);
          f.connect(g); g.connect(d);
          os[0].onended = () => { os.forEach((o) => o.disconnect()); f.disconnect(); g.disconnect(); };
          break;
        }
        // Maverick: combat sounds
        case 'swing': { // quick airy swish (a little different each time)
          const k = rand(0.85, 1.2);
          this._noise(d, { t, peak: 0.13, f: 500 * k, f2: 2600 * k, sweep: 0.08, Q: 1.4, attack: 0.02, decay: 0.035 }); break;
        }
        case 'heavy': // the charged spin: a longer, lower whoosh
          this._noise(d, { t, peak: 0.2, f: 300, f2: 1600, sweep: 0.25, Q: 1, attack: 0.07, decay: 0.09 });
          this._noise(d, { t: t + 0.12, peak: 0.12, f: 1600, f2: 500, sweep: 0.2, Q: 1, attack: 0.03, decay: 0.07 }); break;
        case 'whoosh': // the dodge roll: a cloth-and-air rush
          this._noise(d, { t, peak: 0.16, f: 1400, f2: 350, sweep: 0.22, Q: 0.9, attack: 0.025, decay: 0.08 });
          this._noise(d, { t: t + 0.18, peak: 0.06, type: 'lowpass', f: 500, decay: 0.04 }); break;
        case 'thud': // a hit landing
          this._tone(d, { f: 150, f2: 55, sweep: 0.08, t, peak: 0.4, attack: 0.002, decay: 0.05 });
          this._noise(d, { t, peak: 0.22, type: 'lowpass', f: 700, decay: 0.03, attack: 0.001 }); break;
        case 'crit': // a big hit: deeper thud and a bright crack
          this._tone(d, { f: 120, f2: 40, sweep: 0.14, t, peak: 0.5, attack: 0.002, decay: 0.08 });
          this._noise(d, { t, peak: 0.3, type: 'lowpass', f: 900, decay: 0.04, attack: 0.001 });
          this._tone(d, { type: 'triangle', f: 1400, f2: 900, sweep: 0.06, t, peak: 0.09, attack: 0.001, decay: 0.04 }); break;
        case 'poof': // a creature puffs away into leaves
          this._noise(d, { t, peak: 0.22, f: 1000, f2: 280, sweep: 0.3, Q: 0.8, attack: 0.01, decay: 0.1 });
          this._tone(d, { f: 520, f2: 980, sweep: 0.08, t: t + 0.02, peak: 0.12, decay: 0.04 }); break;
        case 'charge': // the heavy spin starts to charge: a soft rising hum
          this._tone(d, { type: 'triangle', f: 220, f2: 440, sweep: 0.5, t, peak: 0.07, attack: 0.15, decay: 0.12 }); break;
        case 'charged': // fully charged: a bright ding
          this._ep(d, 88, t, 0.2, 0.1); break;
        // Maverick: moves (sprint, dash strike, finishers)
        case 'sprint': // setting off at a sprint: a soft airy burst
          this._noise(d, { t, peak: 0.09, f: 700, f2: 2200, sweep: 0.14, Q: 1, attack: 0.03, decay: 0.06 }); break;
        case 'dash': // the dash strike: a sharp rising swish over a low thump
          this._noise(d, { t, peak: 0.17, f: 600, f2: 3800, sweep: 0.1, Q: 1.6, attack: 0.01, decay: 0.05 });
          this._tone(d, { f: 190, f2: 90, sweep: 0.09, t, peak: 0.14, attack: 0.004, decay: 0.04 }); break;
        case 'slam': // the ground slam: a deep boom, a crack and a rumble
          this._tone(d, { f: 95, f2: 32, sweep: 0.35, t, peak: 0.6, attack: 0.003, decay: 0.16 });
          this._noise(d, { t, peak: 0.36, type: 'lowpass', f: 500, f2: 110, sweep: 0.5, attack: 0.002, decay: 0.18 });
          this._noise(d, { t, peak: 0.2, f: 2600, Q: 2, attack: 0.001, decay: 0.02 });
          this._noise(d, { t: t + 0.08, peak: 0.12, type: 'lowpass', f: 220, attack: 0.05, decay: 0.25 }); break;
        case 'pierce': // the charged thrust: a long thin hiss and a bright ping
          this._noise(d, { t, peak: 0.15, f: 1200, f2: 5200, sweep: 0.18, Q: 3, attack: 0.02, decay: 0.06 });
          this._tone(d, { type: 'triangle', f: 1800, f2: 2500, sweep: 0.08, t: t + 0.04, peak: 0.07, attack: 0.002, decay: 0.06 }); break;
        case 'uppercut': // the uppercut: a rising whoosh and a pop
          this._noise(d, { t, peak: 0.14, f: 300, f2: 2400, sweep: 0.13, Q: 1.2, attack: 0.02, decay: 0.05 });
          this._tone(d, { f: 220, f2: 560, sweep: 0.08, t: t + 0.05, peak: 0.16, attack: 0.003, decay: 0.04 }); break;
        case 'ui': // tiny tick
          this._tone(d, { f: 1200, t, peak: 0.08, attack: 0.002, decay: 0.012 }); break;
        default: return; // unknown name: do nothing
      }
      this._lastSfx[name] = now;
    } catch (e) { /* ignore */ }
  }
}
