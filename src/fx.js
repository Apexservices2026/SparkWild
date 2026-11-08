// Rain, snow, fireflies, chimney smoke, waterfall mist and cloud shadows.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { N } from './world.js';

const softSprite = /* glsl */`
  float soft(){ vec2 d = gl_PointCoord - 0.5; return smoothstep(0.5, 0.0, length(d)); }
`;

function seeds(count, per = 1, dims = 4, seed = 1) {
  const rnd = mulberry32(seed);
  const arr = new Float32Array(count * per * dims);
  for (let i = 0; i < count; i++) {
    const s = []; for (let d = 0; d < dims; d++) s.push(rnd());
    for (let p = 0; p < per; p++) arr.set(s, (i * per + p) * dims);
  }
  return arr;
}

export class Rain {
  constructor(count) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds(count, 2, 4, 3), 4));
    const end = new Float32Array(count * 2); for (let i = 0; i < count; i++) end[i * 2 + 1] = 1;
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uWind: { value: new THREE.Vector2(2, 1) }, uColor: { value: new THREE.Color('#cfe0f0') } },
      vertexShader: /* glsl */`
        attribute vec4 aSeed; attribute float aEnd;
        uniform float uTime, uAmount; uniform vec3 uCenter; uniform vec2 uWind;
        varying float vA;
        void main(){
          float W = 46.0, H = 28.0;
          float speed = 17.0 + aSeed.z * 7.0;
          float fallen = mod(aSeed.y * H + uTime * speed, H);
          vec3 p;
          p.x = uCenter.x + (fract((aSeed.x * W - uCenter.x - uWind.x * fallen / speed) / W) - 0.5) * W;
          p.z = uCenter.z + (fract((aSeed.w * W - uCenter.z - uWind.y * fallen / speed) / W) - 0.5) * W;
          p.y = uCenter.y + H - 3.0 - fallen;
          if (aEnd > 0.5) { p.y += 0.75; p.x -= uWind.x * 0.75 / speed; p.z -= uWind.y * 0.75 / speed; }
          vA = (aEnd > 0.5 ? 0.0 : 0.5) * step(aSeed.z, uAmount);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying float vA;
        void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(uColor, vA); }`,
    });
    this.mesh = new THREE.LineSegments(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }
}

export class Snow {
  constructor(count, pixelScale) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds(count, 1, 4, 5), 4));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uWind: { value: new THREE.Vector2(1, 0.5) }, uScale: { value: pixelScale }, uColor: { value: new THREE.Color('#ffffff') } },
      vertexShader: /* glsl */`
        attribute vec4 aSeed; uniform float uTime, uAmount, uScale; uniform vec3 uCenter; uniform vec2 uWind;
        varying float vA;
        void main(){
          float W = 46.0, H = 28.0;
          float speed = 1.6 + aSeed.z * 1.4;
          float fallen = mod(aSeed.y * H + uTime * speed, H);
          float t = uTime + aSeed.x * 40.0;
          vec3 p;
          p.x = uCenter.x + (fract((aSeed.x * W - uCenter.x - uWind.x * fallen) / W) - 0.5) * W + sin(t * 1.3) * 0.4;
          p.z = uCenter.z + (fract((aSeed.w * W - uCenter.z - uWind.y * fallen) / W) - 0.5) * W + cos(t * 1.1) * 0.4;
          p.y = uCenter.y + H - 3.0 - fallen;
          vA = step(aSeed.z, uAmount) * 0.9;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = uScale * (0.08 + aSeed.w * 0.07) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying float vA; ${softSprite}
        void main(){ float a = soft() * vA; if (a < 0.01) discard; gl_FragColor = vec4(uColor, a); }`,
    });
    this.mesh = new THREE.Points(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }
}

export class Fireflies {
  constructor(count, heightTex, pixelScale) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds(count, 1, 4, 9), 4));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uHeight: { value: heightTex }, uN: { value: N }, uScale: { value: pixelScale } },
      vertexShader: /* glsl */`
        attribute vec4 aSeed; uniform float uTime, uAmount, uN, uScale; uniform vec3 uCenter; uniform sampler2D uHeight;
        varying float vA;
        void main(){
          float W = 52.0;
          float t = uTime * (0.25 + aSeed.z * 0.3) + aSeed.x * 50.0;
          vec3 p;
          p.x = uCenter.x + (fract((aSeed.x * W - uCenter.x) / W) - 0.5) * W + sin(t) * 1.5 + sin(t * 2.3) * 0.4;
          p.z = uCenter.z + (fract((aSeed.y * W - uCenter.z) / W) - 0.5) * W + cos(t * 0.8) * 1.5;
          vec2 uv = (p.xz + uN * 0.5) / uN;
          float ground = texture2D(uHeight, uv).r * 14.0 - 4.0;
          p.y = max(ground, 0.4) + 0.5 + aSeed.w * 1.8 + sin(t * 1.7) * 0.3;
          float blink = pow(sin(uTime * (1.2 + aSeed.z * 2.0) + aSeed.y * 30.0) * 0.5 + 0.5, 3.0);
          float edge = 1.0 - smoothstep(0.35, 0.5, max(abs(p.x - uCenter.x), abs(p.z - uCenter.z)) / W);
          vA = blink * uAmount * edge * step(aSeed.w, 0.25 + uAmount);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = uScale * 0.42 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying float vA; ${softSprite}
        void main(){ float d = length(gl_PointCoord - 0.5);
          float a = (pow(smoothstep(0.5, 0.0, d), 3.0) * 0.8 + smoothstep(0.1, 0.0, d)) * vA;
          if (a < 0.005) discard; gl_FragColor = vec4(vec3(1.0, 0.9, 0.42) * a, 1.0); }`,
    });
    this.mesh = new THREE.Points(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }
}

// Rising, fading soft puffs: chimney smoke, waterfall mist.
export class Puffs {
  constructor({ count, origin, rise, spread, life, size, opacity, color, pixelScale, seed = 1 }) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds(count, 1, 4, seed), 4));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uOrigin: { value: origin.clone() }, uRise: { value: rise }, uSpread: { value: spread },
        uLife: { value: life }, uSize: { value: size }, uOpacity: { value: opacity }, uColor: { value: new THREE.Color(color) },
        uLight: { value: new THREE.Color(1, 1, 1) }, uWind: { value: new THREE.Vector2(0.6, 0.3) }, uScale: { value: pixelScale },
      },
      vertexShader: /* glsl */`
        attribute vec4 aSeed; uniform float uTime, uRise, uSpread, uLife, uSize, uScale; uniform vec3 uOrigin; uniform vec2 uWind;
        varying float vLife; varying float vSeed;
        void main(){
          float life = fract(uTime / uLife + aSeed.x);
          vLife = life; vSeed = aSeed.w;
          vec3 p = uOrigin + vec3((aSeed.y - 0.5) * uSpread * (0.3 + life), life * uRise * (0.6 + aSeed.z * 0.6), (aSeed.z - 0.5) * uSpread * (0.3 + life));
          p.xz += uWind * life * life * uRise * 0.5;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = uScale * uSize * (0.5 + life * 1.3) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uOpacity; uniform vec3 uColor, uLight; varying float vLife; varying float vSeed; ${softSprite}
        void main(){ float a = soft() * uOpacity * sin(vLife * 3.14159) * (0.7 + vSeed * 0.3);
          if (a < 0.01) discard; gl_FragColor = vec4(uColor * uLight, a); }`,
    });
    this.mesh = new THREE.Points(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }
}

// Puffy clouds high above the camera. You do not see them directly (the camera looks down),
// but their soft shadows drift across the land.
export class Clouds {
  constructor(count = 16) {
    this.group = new THREE.Group();
    this.items = [];
    const rnd = mulberry32(31);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const n = 4 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2.5 + rnd() * 2.5, 1), mat);
        m.position.set((rnd() - 0.5) * 9, (rnd() - 0.5) * 1.5, (rnd() - 0.5) * 6);
        m.scale.y = 0.55;
        m.castShadow = true; m.receiveShadow = false;
        g.add(m);
      }
      this.items.push({ g, x: (rnd() - 0.5) * 160, z: (rnd() - 0.5) * 160, need: rnd(), s: 0.8 + rnd() * 0.7 });
      this.group.add(g);
    }
  }
  update(dt, center, height, cover, wind) {
    const W = 160;
    for (const c of this.items) {
      c.x += wind.x * dt * 1.5; c.z += wind.y * dt * 1.5;
      const x = center.x + ((((c.x - center.x) / W + 0.5) % 1 + 1) % 1 - 0.5) * W;
      const z = center.z + ((((c.z - center.z) / W + 0.5) % 1 + 1) % 1 - 0.5) * W;
      const vis = Math.min(1, Math.max(0, (cover - c.need * 0.9) / 0.2));
      c.g.position.set(x, height, z);
      c.g.scale.setScalar(Math.max(vis * c.s, 0.0001));
      c.g.visible = vis > 0.01;
    }
  }
}
