// Weather. Each climate has its own little weather system with its own habits
// (the desert is mostly clear, the marsh is often wet and foggy). What you see
// is a blend of the systems for the ground you are standing on.
import * as THREE from 'three';
import { mulberry32, lerp, smoothstep } from './noise.js';
import { SNOW, MOUNTAIN } from './world.js';

export const STATES = ['clear', 'cloudy', 'rain', 'storm'];
export const STATE_LABEL = { clear: 'Clear skies', cloudy: 'Cloudy', rain: 'Drizzly', storm: 'Stormy!' };
export const SNOW_LABEL = { clear: 'Crisp and clear', cloudy: 'Gray skies', rain: 'Snowing', storm: 'Blizzard!' };

const PARAMS = {
  clear:  { cloud: 0.06, rain: 0.0,  dark: 0.0,  wind: 0.25, storm: 0, fog: 0.0 },
  cloudy: { cloud: 0.62, rain: 0.0,  dark: 0.18, wind: 0.45, storm: 0, fog: 0.12 },
  rain:   { cloud: 0.86, rain: 0.55, dark: 0.4,  wind: 0.6,  storm: 0, fog: 0.3 },
  storm:  { cloud: 1.0,  rain: 1.0,  dark: 0.66, wind: 1.0,  storm: 1, fog: 0.42 },
};
const KEYS = Object.keys(PARAMS.clear);

// chance of each state (clear, cloudy, rain, storm) and each climate's own extras
const PROFILES = [
  { odds: [0.42, 0.3, 0.2, 0.08], fog: 0.0, wind: 0.0 },                                   // forest
  { odds: [0.25, 0.4, 0.2, 0.15], fog: 0.25, wind: 0.15, tint: '#cbd3dc', tintAmt: 0.15 },   // mountains
  { odds: [0.3, 0.32, 0.28, 0.1], fog: 0.22, wind: 0.25, tint: '#e3ecf7', tintAmt: 0.3 },    // snow
  { odds: [0.8, 0.16, 0.03, 0.01], fog: 0.05, wind: 0.1, tint: '#f4cf92', tintAmt: 0.32 },   // desert
  { odds: [0.16, 0.34, 0.36, 0.14], fog: 0.5, wind: 0.0, tint: '#8f9e70', tintAmt: 0.3 },    // swamp
  { odds: [0.45, 0.25, 0.15, 0.15], fog: 0.1, wind: 0.35, tint: '#cfe6ee', tintAmt: 0.12 },  // coast
];

class Machine {
  constructor(profile, rnd, start) {
    this.p = profile; this.rnd = rnd;
    this.state = start;
    this.cur = { ...PARAMS[start] };
    this.timer = 40 + rnd() * 120;
  }
  pick() {
    let r = this.rnd(), k = 0;
    while (k < 3 && r > this.p.odds[k]) { r -= this.p.odds[k]; k++; }
    // storms build up through cloud and rain, and clear the same way
    const next = STATES[k];
    const order = STATES.indexOf(this.state), want = STATES.indexOf(next);
    this.state = STATES[order + Math.sign(want - order)] || next;
    this.timer = 90 + this.rnd() * 150; // 1.5 to 4 minutes
  }
  update(dt, auto) {
    this.timer -= dt;
    if (auto && this.timer <= 0) this.pick();
    const t = PARAMS[this.state];
    const rate = 1 - Math.exp(-dt / 12);   // about 25 seconds to blend
    for (const k of KEYS) this.cur[k] = lerp(this.cur[k], t[k], rate);
  }
}

export class Weather {
  constructor() {
    const rnd = mulberry32(99);
    this.machines = PROFILES.map((p, b) => new Machine(p, rnd, b === 4 ? 'rain' : b === 1 ? 'cloudy' : 'clear'));
    this.auto = true;
    this.rnd = rnd;
    this.local = { cloud: 0, rain: 0, dark: 0, wind: 0, storm: 0, fog: 0, snow: 0, tint: new THREE.Color(), tintAmt: 0 };
    this.flash = 0; this.flashT = 99; this.nextBolt = 6;
    this.tints = PROFILES.map((p) => new THREE.Color(p.tint || '#ffffff'));
  }

  force(state) {
    for (const m of this.machines) { m.state = state; m.timer = 150 + this.rnd() * 120; }
  }

  // Jump straight to the target look (used for screenshots).
  settle() { for (const m of this.machines) Object.assign(m.cur, PARAMS[m.state]); }

  update(dt, weights, playerY, primary) {
    for (const m of this.machines) m.update(dt, this.auto);
    const L = this.local;
    for (const k of KEYS) L[k] = 0;
    L.tint.setRGB(0, 0, 0); L.tintAmt = 0;
    for (let b = 0; b < 6; b++) {
      const w = weights[b]; if (w < 0.001) continue;
      const m = this.machines[b], p = PROFILES[b];
      for (const k of KEYS) L[k] += m.cur[k] * w;
      L.fog += p.fog * w; L.wind += p.wind * w;
      L.tint.r += this.tints[b].r * w; L.tint.g += this.tints[b].g * w; L.tint.b += this.tints[b].b * w;
      L.tintAmt += (p.tintAmt || 0) * w;
    }
    L.snow = Math.min(1, weights[SNOW] + weights[MOUNTAIN] * smoothstep(5.5, 7, playerY));
    this.state = this.machines[primary].state;

    // lightning during storms: a quick double flicker
    this.flashT += dt;
    if (L.storm > 0.6) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.flashT = 0; this.nextBolt = 5 + this.rnd() * 12; }
    }
    const t = this.flashT;
    this.flash = t < 0.07 ? 1 : t < 0.14 ? 0.1 : t < 0.26 ? 0.75 : t < 0.7 ? 0.75 * (1 - (t - 0.26) / 0.44) : 0;
    this.flash *= L.storm;
    return L;
  }

  label(snowy) {
    return (snowy ? SNOW_LABEL : STATE_LABEL)[this.state];
  }
}
