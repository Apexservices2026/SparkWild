// Time of day: sun, moon, sky colour, fog. One game day = 24 real minutes by default.
import * as THREE from 'three';
import { clamp, smoothstep, lerp } from './noise.js';

const K = (h, sun, sunI, sky, ground, hemiI, fog) => ({ h, sun: new THREE.Color(sun), sunI, sky: new THREE.Color(sky), ground: new THREE.Color(ground), hemiI, fog: new THREE.Color(fog) });
// Colour keyframes through the day (hour, light colour, light strength, sky, ground bounce, ambient strength, fog/horizon)
const KEYS = [
  K(0.0, '#a8bcf5', 1.25, '#5b74b8', '#27324e', 1.55, '#1a2748'),
  K(4.4, '#a8bcf5', 1.2, '#5b74b8', '#27324e', 1.5, '#1a2748'),
  K(5.5, '#c79ac0', 0.7, '#7c78ac', '#33304a', 1.3, '#5a5480'),
  K(6.6, '#ffb07a', 1.5, '#f2c2a6', '#4a4038', 1.0, '#eab89e'),
  K(8.5, '#ffdcb0', 2.4, '#cadcf0', '#4a5434', 0.9, '#d3e2ea'),
  K(12.0, '#fff2dc', 2.8, '#c4dcf5', '#4c5a36', 0.9, '#c8e2f0'),
  K(15.5, '#ffeccc', 2.7, '#c8daf2', '#4c5834', 0.9, '#cfe0ea'),
  K(17.4, '#ffcf92', 2.2, '#ffd8b4', '#5c5440', 1.0, '#f2cfa4'),
  K(18.5, '#ff8f55', 1.6, '#eb9a82', '#463242', 0.95, '#e08f70'),
  K(19.3, '#c88aa8', 0.8, '#8a74ac', '#34304a', 1.3, '#5d4a7c'),
  K(20.4, '#a8bcf5', 1.15, '#5b72b0', '#27324e', 1.5, '#1d2846'),
  K(24.0, '#a8bcf5', 1.25, '#5b74b8', '#27324e', 1.55, '#1a2748'),
];

export const PHASES = [
  { name: 'Night', from: 21, to: 5 },
  { name: 'Morning', from: 5, to: 11 },
  { name: 'Day', from: 11, to: 17 },
  { name: 'Evening', from: 17, to: 21 },
];
export function phaseName(h) {
  if (h >= 21 || h < 5) return 'Night';
  if (h < 11) return 'Morning';
  if (h < 17) return 'Day';
  return 'Evening';
}

const FLASH_COLOR = new THREE.Color('#dfe8ff'), GREY = new THREE.Color(), SLATE = new THREE.Color('#6f7a80');

export class Sky {
  constructor(scene, quality) {
    this.hour = 15.5;
    this.dayMinutes = 24;      // real minutes per game day
    this.follow = true;        // clock runs on its own
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight('#cfe4ff', '#5f6c44', 1);
    scene.add(this.hemi);
    this.light = new THREE.DirectionalLight('#ffffff', 2);
    this.light.castShadow = quality.shadow > 0;   // the Low graphics level has no shadows
    const s = this.light.shadow;
    s.mapSize.set(quality.shadow || 512, quality.shadow || 512);
    s.camera.left = -32; s.camera.right = 32; s.camera.top = 32; s.camera.bottom = -32;
    s.camera.near = 1; s.camera.far = 220;
    s.bias = -0.0004; s.normalBias = 0.03;
    s.radius = 3;
    scene.add(this.light, this.light.target);
    scene.fog = new THREE.Fog('#c8e2f0', 60, 160);
    scene.background = new THREE.Color('#c8e2f0');
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.night = 0;
    this.flash = 0;
    // shared with water and waterfall shaders
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uAmbient: { value: new THREE.Color() },
      uSkyColor: { value: new THREE.Color() },
    };
    this._c = { sun: new THREE.Color(), sky: new THREE.Color(), ground: new THREE.Color(), fog: new THREE.Color() };
  }

  advance(dt) {
    if (this.follow) this.hour = (this.hour + dt * 24 / (this.dayMinutes * 60)) % 24;
  }

  sample(h) {
    let a = KEYS[0], b = KEYS[1];
    for (let k = 0; k < KEYS.length - 1; k++) if (h >= KEYS[k].h && h <= KEYS[k + 1].h) { a = KEYS[k]; b = KEYS[k + 1]; break; }
    const t = smoothstep(0, 1, (h - a.h) / (b.h - a.h));
    const c = this._c;
    c.sun.copy(a.sun).lerp(b.sun, t); c.sky.copy(a.sky).lerp(b.sky, t);
    c.ground.copy(a.ground).lerp(b.ground, t); c.fog.copy(a.fog).lerp(b.fog, t);
    return { sunI: lerp(a.sunI, b.sunI, t), hemiI: lerp(a.hemiI, b.hemiI, t) };
  }

  // w = local weather mix: { cloud, dark, fog, lightning, tint }
  update(target, camDist, w) {
    const h = this.hour;
    const { sunI, hemiI } = this.sample(h);
    const c = this._c;
    // sun is up from 5.5 to 19.0, moon the rest of the time
    const dayLen = 13.5;
    const sa = ((h - 5.5 + 24) % 24) / dayLen * Math.PI;
    const ma = ((h - 19.0 + 24) % 24) / (24 - dayLen) * Math.PI;
    const sunUp = sa <= Math.PI;
    const ang = sunUp ? sa : ma;
    const elev = Math.sin(ang);
    const az = Math.cos(ang);
    // path: rises in the east (+x), crosses the south (+z, toward the camera), sets in the west
    this.sunDir.set(az * 0.85, Math.max(elev, 0.18) * 1.1, 0.55 + 0.25 * elev).normalize();
    // the moon never goes fully dark, so night stays playable
    const k = sunUp ? smoothstep(0.0, 0.18, elev) : Math.max(0.6, smoothstep(0.0, 0.18, elev));
    this.night = sunUp ? 1 - smoothstep(0.0, 0.3, elev) : 1;

    // weather: clouds dim and grey the light
    const grey = (col, amt) => { const l = col.r * 0.3 + col.g * 0.59 + col.b * 0.11; col.lerp(GREY.setRGB(l, l, l), amt); };
    // Forge (look polish): rain reads greyer and darker (a cool slate tint, less colour in the light)
    grey(c.sun, w.cloud * 0.7); grey(c.sky, w.cloud * 0.8); grey(c.fog, w.cloud * 0.8); grey(c.ground, w.cloud * 0.5);
    const wet = Math.min(1, (w.rain || 0) * 1.4);
    c.fog.lerp(SLATE, wet * 0.35); c.sky.lerp(SLATE, wet * 0.25);
    c.fog.multiplyScalar(1 - w.dark * 0.55); c.sky.multiplyScalar(1 - w.dark * 0.45);
    if (w.tint) { c.fog.lerp(w.tint, w.tintAmt); c.sky.lerp(w.tint, w.tintAmt * 0.6); }

    this.light.color.copy(c.sun);
    this.light.intensity = sunI * k * (1 - w.cloud * 0.72) * (1 - wet * 0.22) + this.flash * 3;
    this.hemi.color.copy(c.sky);
    this.hemi.groundColor.copy(c.ground);
    this.hemi.intensity = hemiI * (1 - w.dark * 0.45) * (1 - wet * 0.15) + this.flash * 2.5;
    this.hemi.groundColor.lerp(SLATE, wet * 0.3);
    if (this.flash > 0) this.hemi.color.lerp(FLASH_COLOR, Math.min(this.flash, 1));

    this.light.position.copy(target).addScaledVector(this.sunDir, 90);
    // snap shadow camera to texels so shadows do not shimmer while walking
    const texel = 64 / this.light.shadow.mapSize.x;
    this.light.target.position.set(Math.round(target.x / texel) * texel, target.y, Math.round(target.z / texel) * texel);
    this.light.position.copy(this.light.target.position).addScaledVector(this.sunDir, 90);

    this.scene.fog.color.copy(c.fog);
    this.scene.background.copy(c.fog);
    const f = clamp(w.fog + wet * 0.2, 0, 1);   // rain pulls the grey haze a little closer
    this.scene.fog.near = camDist + lerp(22, -6, f);
    this.scene.fog.far = camDist + lerp(110, 40, f);

    const u = this.uniforms;
    u.uSunDir.value.copy(this.sunDir);
    u.uSunColor.value.copy(c.sun).multiplyScalar(this.light.intensity * 0.45);
    u.uAmbient.value.copy(c.sky).multiplyScalar(this.hemi.intensity * 0.55).lerp(c.ground, 0.2);
    u.uSkyColor.value.copy(c.sky);
  }

  get lampFactor() { return this.night; }
}
