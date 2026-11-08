// Pickup sparkle (Forge, decision 13): a soft, brief twinkle on sticks, stones, fiber and ripe
// berry bushes near the player, so loot is easy to spot. One small pool of 24 glints drawn in a
// single draw call; the nearest things are picked again four times a second.
import * as THREE from 'three';

const POOL = 24;
const NEAR = 10;        // metres: glints fade out between 7 and 10 m
const HEIGHT = { stick: 0.22, stone: 0.3, fiber: 0.35, berries: 0.85 };

export class Sparkles {
  constructor(scene) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    this.at = new Float32Array(POOL * 3);
    this.info = new Float32Array(POOL * 2);   // phase, strength (0 = unused)
    this.atAttr = new THREE.InstancedBufferAttribute(this.at, 3);
    this.infoAttr = new THREE.InstancedBufferAttribute(this.info, 2);
    geo.setAttribute('aAt', this.atAttr);
    geo.setAttribute('aInfo', this.infoAttr);
    geo.instanceCount = POOL;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */`
        attribute vec3 aAt; attribute vec2 aInfo;
        uniform float uTime;
        varying vec2 vUv; varying float vA;
        void main() {
          // a short glint every few seconds, each at its own moment
          float t = fract(uTime * 0.32 + aInfo.x);
          float g = smoothstep(0.0, 0.1, t) * smoothstep(0.3, 0.1, t);
          vA = g * aInfo.y;
          vec4 mv = viewMatrix * vec4(aAt, 1.0);
          mv.xy += position.xy * (0.1 + 0.16 * g) * step(0.001, aInfo.y);
          vUv = uv - 0.5;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; varying float vA;
        void main() {
          vec2 p = abs(vUv) * 2.0;
          float core = exp(-dot(p, p) * 22.0);
          float rays = max(0.0, 1.0 - p.x * 7.0) * max(0.0, 1.0 - p.y) + max(0.0, 1.0 - p.y * 7.0) * max(0.0, 1.0 - p.x);
          float a = (core + rays * 0.8) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.78) * a, a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'pickup-sparkle';
    scene.add(this.mesh);
    this.t = 0; this.pick = 0; this.berries = null;
    this.cands = [];
  }

  update(dt, game) {
    this.t += dt;
    this.mat.uniforms.uTime.value = this.t;
    if ((this.pick -= dt) > 0) return;
    this.pick = 0.25;
    const px = game.player.pos.x, pz = game.player.pos.z;
    if (!this.berries && game.allThings) this.berries = game.allThings.filter((t) => t.type === 'berries');
    const c = this.cands; c.length = 0;
    const consider = (o, x, y, z, kind) => {
      const d = Math.hypot(x - px, z - pz);
      if (d < NEAR) c.push({ o, x, y: y + (HEIGHT[kind] || 0.3), z, d });
    };
    for (const o of game.pickups || []) if (o.alive) consider(o, o.x, o.y, o.z, o.item);
    for (const t of this.berries || []) if (t.ready && !t.hidden) consider(t, t.x, t.y, t.z, 'berries');
    c.sort((a, b) => a.d - b.d);
    for (let k = 0; k < POOL; k++) {
      const e = c[k];
      if (!e) { this.info[k * 2 + 1] = 0; continue; }
      this.at[k * 3] = e.x; this.at[k * 3 + 1] = e.y; this.at[k * 3 + 2] = e.z;
      // a steady phase per thing, so its twinkle does not jump when the list is re-sorted
      this.info[k * 2] = ((e.x * 12.9898 + e.z * 78.233) % 1 + 1) % 1;
      this.info[k * 2 + 1] = 0.75 * Math.min(1, (NEAR - e.d) / 3);
    }
    this.atAttr.needsUpdate = true; this.infoAttr.needsUpdate = true;
  }
}
