// Small signs of life: butterflies by day, falling leaves, chickens by the cabin.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { N, cellIndex } from './world.js';

// Butterflies (mode 0) and falling leaves (mode 1). Both wrap around the camera
// and sit on the ground using the height texture.
export class Drifters {
  constructor(count, mode, heightTex, colors, seed) {
    const rnd = mulberry32(seed);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const sd = new Float32Array(count * 4), col = new Float32Array(count * 3);
    const pal = colors.map((c) => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
      sd.set([rnd(), rnd(), rnd(), rnd()], i * 4);
      const c = pal[Math.floor(rnd() * pal.length)];
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uHeight: { value: heightTex },
        uN: { value: N }, uScale: { value: 1 }, uLight: { value: new THREE.Color(1, 1, 1) }, uWind: { value: new THREE.Vector2(1, 0.5) },
      },
      vertexShader: /* glsl */`
        attribute vec4 aSeed; attribute vec3 aColor;
        uniform float uTime, uAmount, uN, uScale; uniform vec3 uCenter; uniform sampler2D uHeight; uniform vec2 uWind;
        varying vec3 vColor; varying float vA;
        void main(){
          float W = 44.0;
          vec3 p;
          float size;
          ${mode === 0 ? `
          float t = uTime * (0.35 + aSeed.z * 0.3) + aSeed.x * 60.0;
          p.x = uCenter.x + (fract((aSeed.x * W - uCenter.x) / W) - 0.5) * W + sin(t) * 2.0 + sin(t * 3.1) * 0.5;
          p.z = uCenter.z + (fract((aSeed.y * W - uCenter.z) / W) - 0.5) * W + cos(t * 0.7) * 2.0;
          float hop = abs(sin(uTime * 2.5 + aSeed.w * 9.0));
          float flap = abs(sin(uTime * 18.0 + aSeed.y * 40.0));
          size = 0.12 + flap * 0.1;
          p.y = 0.45 + aSeed.w * 1.0 + hop * 0.35;
          ` : `
          float H = 5.0;
          float speed = 0.6 + aSeed.z * 0.5;
          float fallen = mod(aSeed.w * H + uTime * speed, H);
          float t = uTime * 1.5 + aSeed.x * 30.0;
          p.x = uCenter.x + (fract((aSeed.x * W - uCenter.x - uWind.x * fallen * 0.6) / W) - 0.5) * W + sin(t) * 0.6;
          p.z = uCenter.z + (fract((aSeed.y * W - uCenter.z - uWind.y * fallen * 0.6) / W) - 0.5) * W + cos(t * 0.8) * 0.4;
          size = 0.12 + abs(sin(t * 2.0)) * 0.06;
          p.y = H - fallen;
          `}
          vec2 uv = (p.xz + uN * 0.5) / uN;
          float ground = texture2D(uHeight, uv).r * 14.0 - 4.0;
          p.y += max(ground, 0.35);
          float edge = 1.0 - smoothstep(0.38, 0.5, max(abs(p.x - uCenter.x), abs(p.z - uCenter.z)) / W);
          vA = step(aSeed.z, uAmount) * edge;
          vColor = aColor;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = max(uScale * size / -mv.z, 1.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uLight; varying vec3 vColor; varying float vA;
        void main(){ if (vA < 0.5 || length(gl_PointCoord - 0.5) > 0.5) discard; gl_FragColor = vec4(vColor * uLight, 1.0); }`,
    });
    this.mesh = new THREE.Points(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }
}

// A few chickens that wander, stop and peck around the yard.
export class Chickens {
  constructor(world, home, count = 5) {
    this.world = world; this.home = home;
    this.group = new THREE.Group();
    this.list = [];
    const rnd = (this.rnd = mulberry32(55));
    const M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
    const white = M('#f3efe6'), brown = M('#b0773f'), red = M('#d63b30'), orange = M('#f0a03a');
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const feathers = i % 3 === 2 ? brown : white;
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), feathers); body.scale.set(1, 0.85, 1.2); body.position.y = 0.3;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.1), feathers); tail.position.set(0, 0.42, -0.22); tail.rotation.x = -0.5;
      const head = new THREE.Group(); head.position.set(0, 0.48, 0.18);
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), feathers));
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 5), orange); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.01, 0.12);
      const comb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.1), red); comb.position.set(0, 0.1, 0.01);
      head.add(beak, comb);
      // Maverick: feel. Each leg hangs from a hip pivot with a little foot, so it can step.
      const legs = [-0.07, 0.07].map((x) => {
        const hip = new THREE.Group(); hip.position.set(x, 0.17, 0.02);
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 4), orange); l.position.y = -0.08;
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.07), orange); foot.position.set(0, -0.165, 0.02);
        hip.add(l, foot); return hip;
      });
      g.add(body, tail, head, ...legs);
      g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      const c = { g, head, legs, body, mw: 0, x: home.x + (rnd() - 0.5) * 4, z: home.z + (rnd() - 0.5) * 4, tx: 0, tz: 0, wait: rnd() * 3, peck: 0, yaw: rnd() * 6, phase: rnd() * 6 };
      c.tx = c.x; c.tz = c.z;
      this.list.push(c);
      this.group.add(g);
    }
  }
  free(x, z) {
    const w = this.world;
    const i = cellIndex(x), j = cellIndex(z);
    return !w.blocked[j * N + i] && w.level(i, j) >= 1 && Math.abs(w.heightAt(x, z) - w.heightAt(this.home.x, this.home.z)) < 0.8;
  }
  update(dt, time) {
    for (const c of this.list) {
      const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
      let moving = false;
      if (d > 0.05) {
        const step = Math.min(d, dt * 1.1);
        const nx = c.x + dx / d * step, nz = c.z + dz / d * step;
        if (this.free(nx, nz)) { c.x = nx; c.z = nz; moving = true; } else { c.tx = c.x; c.tz = c.z; }
        const want = Math.atan2(dx, dz);
        let a = want - c.yaw; a = Math.atan2(Math.sin(a), Math.cos(a));
        c.yaw += a * Math.min(1, dt * 8);
      } else {
        c.wait -= dt;
        if (c.wait <= 0) {
          if (this.rnd() < 0.45) { c.peck = 1.2; c.wait = 1.4; }
          else {
            const a = this.rnd() * Math.PI * 2, r = 0.6 + this.rnd() * 2.2;
            const tx = c.x + Math.cos(a) * r, tz = c.z + Math.sin(a) * r;
            if (Math.hypot(tx - this.home.x, tz - this.home.z) < 5.5 && this.free(tx, tz)) { c.tx = tx; c.tz = tz; }
            c.wait = 0.6 + this.rnd() * 2.5;
          }
        }
      }
      c.peck = Math.max(0, c.peck - dt);
      c.phase += dt * (moving ? 14 : 2);
      // Maverick: feel. Legs walk (one forward lifted, the other pushing back) instead of sliding; eased in and out.
      c.mw += ((moving ? 1 : 0) - c.mw) * (1 - Math.exp(-dt * 10));
      for (let k = 0; k < 2; k++) {
        const s = Math.sin(c.phase + k * Math.PI);
        c.legs[k].rotation.x = s * 0.55 * c.mw;
        c.legs[k].position.y = 0.17 + Math.max(0, -Math.cos(c.phase + k * Math.PI)) * 0.03 * c.mw;
      }
      c.body.rotation.z = Math.sin(c.phase) * 0.06 * c.mw;   // a little waddle
      const peck = c.peck > 0 ? Math.max(0, Math.sin(c.peck * 9)) : 0;
      c.head.rotation.x = peck * 1.1;
      c.head.position.z = 0.18 + (moving ? Math.sin(c.phase) * 0.04 : 0);
      c.g.position.set(c.x, this.world.heightAt(c.x, c.z) + (moving ? Math.abs(Math.sin(c.phase)) * 0.03 : 0), c.z);
      c.g.rotation.y = c.yaw;
    }
  }
}
