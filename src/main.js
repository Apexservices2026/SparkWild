import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';

import { generateWorld, buildTerrain, buildHeightTexture, buildWater, BIOMES, SITE, N, FOREST, SWAMP, COAST, cellIndex } from './world.js';
import { planPath, buildProps, buildCabin, buildYard, buildWaterfall } from './props.js';
import { Sky, phaseName } from './sky.js';
import { Weather, STATES } from './weather.js';
import { Rain, Snow, Fireflies, Puffs, Clouds } from './fx.js';
import { Player } from './player.js';
import { Creator } from './creator.js';
import { Drifters, Chickens } from './life.js';
import { Input } from './input.js';
import { shared } from './materials.js';
import { clamp, lerp } from './noise.js';
import { Creatures } from './creatures.js';
import { Combat } from './combat.js';   // Maverick: combat
import { Game, OBJECTIVES } from './game.js';
const OBJECTIVES_TEXT = () => OBJECTIVES[window.game.game.objective].text;
import { Hud } from './hud.js';
import { Builder } from './build.js';      // Forge: building
import { Tutorial } from './tutorial.js';  // Forge: tutorial
import { WorldMap } from './map.js';       // Forge: map
import { GameAudio } from './audio.js';
import { icon } from './items.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');

// ---------- quality ----------
// Three graphics levels. Phones draw at most 1.5 screen pixels per CSS pixel; Low has no shadows and no glow.
const PRESETS = {
  high: { name: 'High', pixelRatio: Math.min(devicePixelRatio, 2), shadow: 2048, grass: 3.2, flowers: 1, trees: 1, leaf: 1, bloom: true, tilt: false, msaa: 4, rain: 7000, snow: 3500 },
  phone: { name: 'Phone', pixelRatio: Math.min(devicePixelRatio, 1.5), shadow: 1024, grass: 1.2, flowers: 0.6, trees: 0.55, leaf: 0.4, bloom: true, tilt: false, msaa: 2, rain: 2600, snow: 1500 },
  low: { name: 'Low', pixelRatio: 1, shadow: 0, grass: 0.5, flowers: 0.3, trees: 0.45, leaf: 0.3, bloom: false, tilt: false, msaa: 0, rain: 1200, snow: 700 },
};
const LEVEL_ORDER = ['high', 'phone', 'low'];
const looksLikePhone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
// Weak phones start on Low: few processor cores, or little memory on Android.
// (iPhones and iPads do not report their real core count, so they start on Phone.)
const isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
const isAndroid = /Android/i.test(navigator.userAgent);
const weakDevice = !isApple && ((navigator.hardwareConcurrency || 8) <= 4 || (isAndroid && navigator.deviceMemory !== undefined && navigator.deviceMemory <= 3));
let qKey = params.get('q');
try { qKey = qKey || localStorage.getItem('hearthwild-quality'); } catch { /* storage blocked */ }
if (!PRESETS[qKey]) qKey = looksLikePhone || (isAndroid && weakDevice) ? (weakDevice ? 'low' : 'phone') : 'high';
const Q = PRESETS[qKey];
// Art style: 'smooth' (the default) is clean and sharp at full screen resolution;
// 'pixel' draws the world as chunky pixel art with outlines.
let STYLE = params.get('look');
try { STYLE = STYLE || localStorage.getItem('hearthwild-look2'); } catch { /* storage blocked */ }
if (STYLE !== 'pixel') STYLE = 'smooth';
let pxSaved = null;
try { pxSaved = Number(localStorage.getItem('hearthwild-pixel')) || null; } catch { /* storage blocked */ }
const PIXEL = Number(params.get('px')) || pxSaved || 2;
// Pixel art is drawn at full screen sharpness: the small picture is enlarged with hard pixel edges,
// so phones with sharp screens do not blur it.
if (STYLE === 'pixel') { Q.pixelRatio = Math.min(devicePixelRatio, 3); Q.tilt = false; Q.msaa = 0; }
// A device that was too slow last time starts at the sharpness that ran smoothly.
try {
  const saved = Number(localStorage.getItem('hearthwild-sharp-' + qKey));
  if (saved && STYLE === 'smooth') Q.pixelRatio = Math.min(Q.pixelRatio, saved);
} catch { /* storage blocked */ }
const PIXEL_DEVICE = Math.max(1, Math.round(PIXEL * (STYLE === 'pixel' ? Q.pixelRatio : 1)));

// ---------- renderer ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Q.pixelRatio);
renderer.shadowMap.enabled = Q.shadow > 0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
// Touch screens start much closer (phones were "too far away"); upright screens only a little further.
// The player's own zoom (pinch or mouse wheel) is remembered on this device.
const TOUCH = matchMedia('(pointer: coarse)').matches;
// Sideways phones get the camera about 25% closer (the explorer looked tiny there).
const ZOOM = TOUCH ? { start: looksLikePhone ? 22 : 28, min: 12, max: 60, portrait: 1.15, landscape: looksLikePhone ? 0.75 : 1 } : { start: 36, min: 14, max: 60, portrait: 1.45, landscape: 1 };
let zoomSaved = null;
try { zoomSaved = Number(localStorage.getItem('hearthwild-zoom')) || null; } catch { /* storage blocked */ }
const startDist = zoomSaved ? clamp(zoomSaved, ZOOM.min, ZOOM.max) : ZOOM.start;
let zoomTimer = 0;
const cam = { yaw: Math.PI / 4, yawTarget: Math.PI / 4, pitch: 0.9, dist: startDist, distTarget: startDist, target: new THREE.Vector3() };

const setStatus = (t) => { const el = $('loading-text'); if (el) el.textContent = t; };

// ---------- build the world ----------
const sky = new Sky(scene, Q);
const weather = new Weather();
const world = generateWorld();
const path = planPath();
const terrain = buildTerrain(world, path.cells);
scene.add(terrain);
const heightTex = buildHeightTexture(world);
const water = buildWater(heightTex, sky.uniforms);
scene.add(water);
const lamps = [];
scene.add(buildProps(world, path, Q));
const cabin = buildCabin(world, lamps);
scene.add(cabin.group);
scene.add(buildYard(world, lamps));
const fall = buildWaterfall(sky.uniforms, water.material);
scene.add(fall.group);

const player = new Player(world, SITE.spawn.x, SITE.spawn.z);
scene.add(player.group);
const creator = new Creator(player);
cam.target.copy(player.pos);

// ---------- effects ----------
let pixelScale = 1;
let portrait = 1;
const rain = new Rain(Q.rain); scene.add(rain.mesh);
const snow = new Snow(Q.snow, 1); scene.add(snow.mesh);
const flies = new Fireflies(qKey === 'high' ? 220 : 120, heightTex, 1); scene.add(flies.mesh);
const smoke = new Puffs({ count: 28, origin: cabin.chimneyTop, rise: 4.5, spread: 1.0, life: 7, size: 1.3, opacity: 0.32, color: '#d9d6d2', pixelScale: 1, seed: 4 });
scene.add(smoke.mesh);
const mist = new Puffs({ count: 40, origin: fall.base, rise: 1.2, spread: 2.6, life: 3.2, size: 1.4, opacity: 0.22, color: '#ffffff', pixelScale: 1, seed: 6 });
scene.add(mist.mesh);
const clouds = new Clouds(18); scene.add(clouds.group);
const butterflies = new Drifters(qKey === 'high' ? 70 : 40, 0, heightTex, ['#ffffff', '#ffe066', '#ff9a3c', '#8fc8ff', '#ffb3d1'], 71); scene.add(butterflies.mesh);
const leaves = new Drifters(qKey === 'high' ? 90 : 50, 1, heightTex, ['#e0a030', '#c8682a', '#9ab84a', '#d8c050'], 72); scene.add(leaves.mesh);
const PUFFS = [smoke, mist], DRIFTERS = [butterflies, leaves];
const chickens = new Chickens(world, { x: -4.6, z: -1.2 }, 5); scene.add(chickens.group);

// ---------- the survival game ----------
const audio = new GameAudio();
const hud = new Hud(camera);
const creatures = new Creatures(scene, world);
const game = new Game({ scene, world, player, sky, weather, creatures, audio, hud, heightTex });
hud.bind(game);
const combat = new Combat({ scene, camera, player, creatures, game, audio, hud });   // Maverick: combat
game.combat = combat;
let playing = false;
let holdAct = false;
// Forge: building and the guided start
const builder = new Builder({ scene, world, game, camera, audio, hud, canvas, isPlaying: () => playing && !creator.isOpen });
game.build = builder;
const tutorial = new Tutorial({ scene, world, game, builder, camera, hud, audio });
game.tutorial = tutorial;
// Forge: map. The spinning globe in the top bar opens the full map (the game pauses while it is open).
// What you have explored rides along in the game's save, so the save and load are wrapped here.
const SAVE_KEY = 'hearthwild-save-v1';
const map = new WorldMap({
  world, game, player, builder, path, audio, globeBtn: $('btn-map'),
  canOpen: () => playing && !creator.isOpen && $('confirm').hidden && !game.sleeping,
  onToggle: (open) => { if (open) { if (hud.craftOpen) hud.toggleCraft(false); setPanel(false); } else { input.turn = 0; input.keys.clear(); } },
});
{
  const saveGame = game.save.bind(game), loadGame = game.load.bind(game);
  game.save = () => { saveGame(); if (!game.noSave) map.saveTo(SAVE_KEY); };
  game.load = () => { const ok = loadGame(); map.loadFrom(SAVE_KEY, ok); return ok; };
}
try {
  const mv = localStorage.getItem('hearthwild-music'), sv = localStorage.getItem('hearthwild-sfx');
  if (mv !== null) audio.setMusicVolume(Number(mv));
  if (sv !== null) audio.setSfxVolume(Number(sv));
} catch { /* storage blocked */ }

// ---------- post-processing ----------
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Q.msaa });
const composer = new EffectComposer(renderer, rt);
const pixelPass = new RenderPixelatedPass(PIXEL_DEVICE, scene, camera, { normalEdgeStrength: 0.35, depthEdgeStrength: 0.45 });
composer.addPass(STYLE === 'pixel' ? pixelPass : new RenderPass(scene, camera));
const tiltH = new ShaderPass(HorizontalTiltShiftShader);
const tiltV = new ShaderPass(VerticalTiltShiftShader);
tiltH.uniforms.r.value = tiltV.uniforms.r.value = 0.5;
if (Q.tilt) { composer.addPass(tiltH); composer.addPass(tiltV); }
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, STYLE === 'pixel' ? 0.3 : 0.55, 0.82);
if (Q.bloom) composer.addPass(bloom);
composer.addPass(new OutputPass());
// Soft palette with ordered dithering, lined up with the big pixels.
const PaletteShader = {
  uniforms: { tDiffuse: { value: null }, uPixel: { value: PIXEL }, uLevels: { value: 40 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uPixel, uLevels; varying vec2 vUv;
    float bayer(vec2 p){ p = mod(floor(p), 4.0);
      int i = int(p.x) + int(p.y) * 4;
      float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
      return m[i] / 16.0 - 0.5; }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.04);                       // a touch more colour
      c = (c - 0.5) * 1.04 + 0.5;                      // a touch more contrast
      vec2 px = gl_FragCoord.xy / uPixel;
      c += bayer(px) / uLevels;
      c = floor(c * uLevels + 0.5) / uLevels;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};
const palettePass = new ShaderPass(PaletteShader);
if (STYLE === 'pixel') composer.addPass(palettePass);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(Q.pixelRatio);
  composer.setSize(w, h);
  if (qKey === 'phone' || STYLE === 'pixel') bloom.setSize(w / 2, h / 2);
  palettePass.uniforms.uPixel.value = PIXEL_DEVICE;
  camera.aspect = w / h;
  portrait = w < h ? ZOOM.portrait : ZOOM.landscape;
  camera.updateProjectionMatrix();
  tiltH.uniforms.h.value = 1.25 / (w * Q.pixelRatio);
  tiltV.uniforms.v.value = 1.25 / (h * Q.pixelRatio);
  pixelScale = (h * Q.pixelRatio) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / (STYLE === 'pixel' ? PIXEL_DEVICE : 1);
  for (const fx of [snow, flies, smoke, mist, butterflies, leaves, game.embers]) fx.mat.uniforms.uScale.value = pixelScale;
}
addEventListener('resize', resize);
resize();

// ---------- input and UI ----------
const input = new Input(canvas, $('stick'), $('knob'));
const ui = {
  phase: $('ui-phase'), clock: $('ui-clock'), wx: $('ui-weather'), place: $('ui-place'),
  skyIcon: $('ui-sky-icon'), wxIcon: $('ui-wx-icon'), toast: $('toast'),
};
const ICONS = {
  Night: '<path d="M15.5 3.5a8 8 0 1 0 5 13.6A7 7 0 0 1 15.5 3.5z"/>',
  Morning: '<path d="M3 17h18M6.3 13.5a6 6 0 0 1 11.4 0"/><path d="M12 4v3M4.6 7.6l2 2M19.4 7.6l-2 2"/>',
  Day: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  Evening: '<path d="M3 17h18M6.3 13.5a6 6 0 0 1 11.4 0"/><path d="M12 7v3M9.5 4.5 12 2l2.5 2.5"/>',
  clear: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
  cloudy: '<path d="M7 18h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 7 18z"/>',
  rain: '<path d="M7 15h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 7 15z"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/>',
  storm: '<path d="M7 14h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 7 14z"/><path d="M12.5 14l-2.5 4h3l-2 4"/>',
};
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
let lastPhase = '', lastWx = '', lastPlace = -1, placeTimer = 0, pendingPlace = -1, lastClock = '';

function showToast(text, sub) { hud.news(text, sub); }

// Settings sit above everything (the round buttons and the item bar hide while they are open).
function setPanel(open) {
  const p = $('panel'); p.hidden = !open;
  $('btn-panel').setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('panel-open', open);
}
$('btn-panel').addEventListener('click', () => setPanel($('panel').hidden));
$('time-back').addEventListener('click', () => { sky.hour = (sky.hour + 21) % 24; });
$('time-fwd').addEventListener('click', () => { sky.hour = (sky.hour + 3) % 24; });
$('wx-back').addEventListener('click', () => stepWeather(-1));
$('wx-fwd').addEventListener('click', () => stepWeather(1));
function stepWeather(d) {
  const i = STATES.indexOf(weather.state);
  weather.force(STATES[(i + d + STATES.length) % STATES.length]);
}
$('opt-clock').addEventListener('change', (e) => { sky.follow = e.target.checked; });
$('opt-weather').addEventListener('change', (e) => { weather.auto = e.target.checked; });
$('opt-speed').addEventListener('change', (e) => { sky.dayMinutes = Number(e.target.value); });
// Atlas: time and weather always run while you play. Browsers can restore an old unticked box on reload,
// so start with both on and the box matching.
$('opt-clock').checked = true; sky.follow = true;
$('opt-weather').checked = true; weather.auto = true;
$('opt-speed').value = String(sky.dayMinutes);
$('opt-quality').value = qKey;
// Lightning flash: on unless the device asks for reduced motion (then off until switched on)
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let flashOn = !reduceMotion;
try { const f = localStorage.getItem('hearthwild-flash'); if (f !== null) flashOn = f === 'on'; } catch { /* storage blocked */ }
$('opt-flash').checked = flashOn;
$('opt-flash').addEventListener('change', (e) => { flashOn = e.target.checked; try { localStorage.setItem('hearthwild-flash', flashOn ? 'on' : 'off'); } catch { /* blocked */ } });
$('opt-look').value = STYLE;
$('opt-look').addEventListener('change', (e) => {
  try { localStorage.setItem('hearthwild-look2', e.target.value); } catch { /* storage blocked */ }
  location.reload();
});
$('opt-quality').addEventListener('change', (e) => {
  try { localStorage.setItem('hearthwild-quality', e.target.value); } catch { /* storage blocked */ }
  location.reload();
});
const isTouch = matchMedia('(pointer: coarse)').matches;
// Maverick: moves (sprint, dash strike, tap-tap-hold finisher)
const controlsHelp = isTouch
  ? 'Left thumb walks, push to run; SPRINT runs faster. Drag the right side to look around. ATTACK: tap for combos, hold for a spin, tap, tap, hold for a finisher. DODGE rolls; ATTACK right after is a dash strike. Tap here to hide.'
  : 'WASD to run, Shift to sprint. E to use, C to craft. Space or click attacks (hold: spin; tap, tap, hold: finisher), X or right-click rolls (attack right after: dash strike), Tab picks a target. Q and R spin the view. Click here to hide.';
if (isTouch) $('controls-note').textContent = 'Left thumb: walk, push further to run. Drag the right side to look around. Pinch to zoom. Tap food in your bag to eat.';
$('ic-act').innerHTML = icon('hand'); $('ic-atk').innerHTML = icon('sword'); $('ic-craft').innerHTML = icon('hammer');
$('opt-pixel').value = String(PIXEL);
$('opt-pixel').addEventListener('change', (e) => {
  try { localStorage.setItem('hearthwild-pixel', e.target.value); } catch { /* storage blocked */ }
  game.save(); location.reload();
});
$('opt-music').value = String(audio.musicVolume);
$('opt-sfx').value = String(audio.sfxVolume);
$('opt-music').addEventListener('input', (e) => { audio.start(); audio.setMusicVolume(Number(e.target.value)); try { localStorage.setItem('hearthwild-music', e.target.value); } catch { /* blocked */ } });
$('opt-sfx').addEventListener('input', (e) => { audio.start(); audio.setSfxVolume(Number(e.target.value)); try { localStorage.setItem('hearthwild-sfx', e.target.value); } catch { /* blocked */ } });
// Start over: a small card asks first. Once erased, nothing may save the old game again
// (the page-hide save used to write it straight back while reloading).
// The same card is used from Settings and from the start screen's "Start over" button.
let confirmFrom = 'panel';
function setConfirm(open, from) {
  if (from) confirmFrom = from;
  $('confirm').hidden = !open;
  document.body.classList.toggle('confirm-open', open);
  if (open) $('confirm-no').focus({ preventScroll: true });
  else $(confirmFrom === 'start' ? 'btn-fresh' : 'btn-new').focus({ preventScroll: true });
}
$('btn-new').addEventListener('click', () => setConfirm(true, 'panel'));
$('confirm-no').addEventListener('click', () => setConfirm(false));
$('confirm').addEventListener('click', (e) => { if (e.target === e.currentTarget) setConfirm(false); });
$('confirm-yes').addEventListener('click', () => {
  if (confirmFrom === 'start') {
    // still on the start screen: erase and start a fresh game straight away
    setConfirm(false);
    if (!muted) audio.start();
    newGame(true);
    return;
  }
  game.noSave = true; playing = false;
  Game.clearSave();
  location.reload();
});
// Mute: a small button in the top bar (remembered on this device)
let muted = false;
try { muted = localStorage.getItem('hearthwild-muted') === '1'; } catch { /* storage blocked */ }
const MUTE_ICONS = {
  on: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  off: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
};
function setMuted(m) {
  muted = m;
  audio.setMuted(m || document.hidden);
  const b = $('btn-mute');
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${MUTE_ICONS[m ? 'off' : 'on']}</svg>`;
  b.setAttribute('aria-pressed', String(m));
  b.title = m ? 'Sound off (tap to turn on)' : 'Sound on (tap to mute)';
  b.setAttribute('aria-label', b.title);
  try { localStorage.setItem('hearthwild-muted', m ? '1' : '0'); } catch { /* storage blocked */ }
}
$('btn-mute').addEventListener('click', () => { audio.start(); setMuted(!muted); });
setMuted(muted);

// controls (while the crafting menu, settings or the start-over card are open, the game ignores them)
const wake = () => { if (playing && !muted) audio.start(); };
const menuOpen = () => hud.craftOpen || !$('confirm').hidden || creator.isOpen || map.isOpen;   // Forge: map
input.on('gesture', wake);
input.on('action', () => { if (playing && !menuOpen()) game.act(); });
// Maverick: combat. ATTACK: tap for combos, hold for the heavy spin. DODGE rolls. Tab or a swipe switches the target.
input.on('attack', () => { if (playing && !menuOpen()) combat.press(); });
input.on('attackUp', () => combat.release());
input.on('dodge', () => { if (playing && !menuOpen()) combat.dodge(); });
input.on('target', (dir) => (playing && !menuOpen() ? combat.cycleTarget(dir) : false));
input.on('craft', () => { if (playing && $('confirm').hidden && !creator.isOpen && !map.isOpen) hud.toggleCraft(); });   // Forge: map
// Escape closes the top-most open card
input.on('escape', () => {
  if (map.isOpen) map.toggle(false);   // Forge: map
  else if (creator.isOpen) creator.cancel();
  else if (!$('confirm').hidden) setConfirm(false);
  else if (hud.craftOpen) hud.toggleCraft(false);
  else if (!$('panel').hidden) { setPanel(false); $('btn-panel').focus({ preventScroll: true }); }
});
const press = (id, fn) => {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); wake(); if (playing && !menuOpen()) fn(); });
};
press('btn-atk', () => combat.press());   // Maverick: combat
press('btn-dodge', () => combat.dodge());
press('btn-sprint', () => combat.toggleSprint());   // Maverick: moves
press('btn-act', () => { holdAct = true; game.act(); });
addEventListener('pointerup', () => { holdAct = false; combat.release(); });
addEventListener('pointercancel', () => { holdAct = false; combat.release(); });

// ---------- simulation ----------
let time = 0;
const tmpW = new Float32Array(6);
const wind2 = new THREE.Vector2();
// reused every frame, so the main loop makes no new objects
const camGoal = new THREE.Vector3();
const camLead = new THREE.Vector3();   // Maverick: feel (camera look-ahead)
const mk = { on: false, pos: new THREE.Vector3(), s: 1 };   // Maverick: feel (the target ring glides)
// Maverick: feel. Which targets keep going while Use is held
const HOLD_TYPES = new Set(['tree', 'rock', 'ore', 'pickup', 'berries', 'water']);
function holdable() { const t = game.target, d = t && game.describe(t); return !!(d && d.ok && HOLD_TYPES.has(t.type)); }
const fxLight = new THREE.Color();
const gameCtx = { hour: 0, night: 0, time: 0, weather: null, biome: 0 };
const noGame = { danger: 0, nearFire: 0 };
const audioCtx = { hour: 0, night: 0, rain: 0, storm: 0, snow: 0, wind: 0, nearFire: 0, biome: '', danger: 0, lightning: 0 };

// Character creator: the camera comes down to the explorer, who stands in the middle of the preview
// area (#cc-stage) and slowly turns. At night a soft light from the camera side shows their colors.
const cc = { t: 0, yaw: 0, from: new THREE.Vector3(), fromLook: new THREE.Vector3(), look: new THREE.Vector3(), goal: new THREE.Vector3(), tmp: new THREE.Vector3() };
function frameCreator(dt, night) {
  if (creator.justOpened) {
    creator.justOpened = false; cc.t = 0;
    cc.from.copy(camera.position); cc.fromLook.copy(cam.target);
    // a new game looks along the stone path at the start; later the view keeps its direction
    cc.yaw = creator.mode === 'new' ? Math.PI / 2 : cam.yaw;
    player.facing = cc.yaw;   // they start by facing you
    game.marker.visible = false;
  }
  cc.t = Math.min(1, cc.t + dt * 2.2);
  const e = cc.t * cc.t * (3 - 2 * cc.t);
  if (creator.spin > 0) creator.spin -= dt; else player.facing += dt * 0.55;
  const st = creator.stage, W = innerWidth, H = innerHeight;
  // the explorer (about 2.1 units tall) fills about 72% of the preview's height
  const viewH = 2.1 / (0.72 * Math.min(st.h, st.w * 1.6)) * H;
  const d = viewH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const pitch = 0.3;
  cc.look.set(player.pos.x, player.pos.y + 0.98, player.pos.z);
  cc.goal.set(cc.look.x + Math.sin(cc.yaw) * Math.cos(pitch) * d, cc.look.y + Math.sin(pitch) * d, cc.look.z + Math.cos(cc.yaw) * Math.cos(pitch) * d);
  camera.position.lerpVectors(cc.from, cc.goal, e);
  camera.lookAt(cc.tmp.lerpVectors(cc.fromLook, cc.look, e));
  // leaves and grass between the camera and the explorer are left out (the near clip plane moves up close)
  camera.near = Math.max(1, (d - 2) * e + 1 - e);
  camera.setViewOffset(W, H, (W / 2 - st.cx) * e, (H / 2 - st.cy) * e, W, H);
  // soft front light (the torch light, moved) when it is dark
  const tl = player.torchLight;
  tl.position.copy(cc.tmp.lerpVectors(cc.look, camera.position, 0.45));
  player.group.worldToLocal(tl.position);
  tl.intensity = 7 * night * e;
  return d;
}
function endCreator() {
  camera.near = 1;
  camera.clearViewOffset();
  player.torchLight.position.set(0.25, 1.9, 0.2);
  player.torchLight.intensity = 0;
}
// mode 'new' after Begin (fresh: erase the old save when play starts), or 'edit' from Settings
function newGame(fresh) {
  $('loading').classList.add('done');
  creator.open('new', {
    onDone: () => { endCreator(); begin(fresh, true); },
    onCancel: () => { endCreator(); $('loading').classList.remove('done'); $('btn-begin').focus({ preventScroll: true }); },
  });
}
function changeLook() {
  setPanel(false);
  creator.open('edit', {
    onDone: (look) => { endCreator(); game.save(); hud.news(`Looking good, ${look.name}!`, 'New look'); $('btn-panel').focus({ preventScroll: true }); },
    onCancel: () => { endCreator(); $('btn-panel').focus({ preventScroll: true }); },
  });
}
$('btn-look').addEventListener('click', () => { if (playing) changeLook(); });

function step(dt) {
  time += dt;
  shared.uTime.value = time;
  sky.advance(dt);

  input.update();
  if (input.turn) { cam.yawTarget += input.turn * Math.PI / 2; input.turn = 0; }
  if (input.turnDrag) { cam.yawTarget -= input.turnDrag; cam.yaw -= input.turnDrag; input.turnDrag = 0; }
  if (!playing || game.sleeping || menuOpen()) { input.move.x = input.move.y = 0; input.run = false; }
  // Maverick: feel. Holding Use (the button or E) keeps chopping, mining or picking up at a steady rhythm.
  if ((holdAct || input.keys.has('KeyE')) && playing && !game.busy && !menuOpen() && holdable()) game.act();
  if (input.zoomDelta) {
    cam.distTarget = clamp(cam.distTarget + input.zoomDelta * 2.5, ZOOM.min, ZOOM.max); input.zoomDelta = 0;
    clearTimeout(zoomTimer);
    zoomTimer = setTimeout(() => { try { localStorage.setItem('hearthwild-zoom', cam.distTarget.toFixed(1)); } catch { /* storage blocked */ } }, 600);
  }
  cam.yaw = lerp(cam.yaw, cam.yawTarget, 1 - Math.exp(-dt * 6));
  cam.dist = lerp(cam.dist, cam.distTarget, 1 - Math.exp(-dt * 4.5));   // Maverick: feel (gentler zoom easing)

  // Maverick: combat. Combat runs first; its dt is almost zero during a hit-pause (the player and creatures freeze).
  const gdt = combat.update(dt, input, cam.yaw, playing && !game.sleeping && !menuOpen() && !creator.isOpen);
  player.update(gdt, input.move, input.run, cam.yaw);

  // local weather at the player's feet
  const i = clamp(cellIndex(player.pos.x), 0, N - 1), j = clamp(cellIndex(player.pos.z), 0, N - 1);
  for (let b = 0; b < 6; b++) tmpW[b] = world.weights[(j * N + i) * 6 + b];
  const primary = world.primary[j * N + i];
  const w = weather.update(dt, tmpW, player.pos.y, primary);
  sky.flash = flashOn ? weather.flash : 0;   // with the flash switched off, lightning does not light the screen

  // camera
  // Maverick: feel. A smooth follow with a little look-ahead where you are heading; the height follows
  // more softly, so steps, stairs and terraces do not jolt the view.
  const leadOn = !builder.open && !creator.isOpen;
  camLead.x += ((leadOn ? player.vel.x * 0.28 : 0) - camLead.x) * (1 - Math.exp(-dt * 2.5));
  camLead.z += ((leadOn ? player.vel.z * 0.28 : 0) - camLead.z) * (1 - Math.exp(-dt * 2.5));
  camGoal.set(player.pos.x + camLead.x, player.pos.y + 0.8, player.pos.z + camLead.z);
  builder.adjustCam(camGoal, cam.yaw, cam.dist * portrait);   // Forge: building (keep the ghost above the build bar)
  const fxz = 1 - Math.exp(-dt * 6), fy = 1 - Math.exp(-dt * 3.5);
  cam.target.x += (camGoal.x - cam.target.x) * fxz; cam.target.z += (camGoal.z - cam.target.z) * fxz;
  cam.target.y += (camGoal.y - cam.target.y) * fy;
  const cp = Math.cos(cam.pitch);
  let camDist = cam.dist * portrait;
  camera.position.set(
    cam.target.x + Math.sin(cam.yaw) * cp * camDist,
    cam.target.y + Math.sin(cam.pitch) * camDist,
    cam.target.z + Math.cos(cam.yaw) * cp * camDist);
  camera.lookAt(cam.target);
  combat.shakeCamera(camera);   // Maverick: combat
  if (creator.isOpen) camDist = frameCreator(dt, sky.night);

  sky.update(cam.target, camDist, w);

  // wind, wet ground, lights
  shared.uWind.value = 0.3 + w.wind * 0.9;
  wind2.set(0.9, 0.45).multiplyScalar(0.5 + w.wind * 3);
  const wet = w.rain * (1 - w.snow);
  terrain.material.color.setScalar(1 - wet * 0.22);
  terrain.material.roughness = 0.92 - wet * 0.3;
  const lamp = Math.max(sky.night, w.dark * 0.55);
  for (const l of lamps) {
    const flicker = 1 + Math.sin(time * 11.3 + l.base) * 0.03 + Math.sin(time * 23.1) * 0.02;
    l.light.intensity = l.base * lamp * flicker;
    l.glass.emissiveIntensity = 0.12 + lamp * 2.6 * flicker;
  }
  bloom.strength = STYLE === 'pixel' ? sky.night * 0.5 : 0.08 + sky.night * 0.45;  // no daytime glow haze on pixel art
  bloom.threshold = 0.82 - sky.night * 0.12;

  // effects
  const ru = rain.mat.uniforms;
  ru.uTime.value = time; ru.uCenter.value.copy(cam.target); ru.uAmount.value = w.rain * (1 - w.snow);
  ru.uWind.value.copy(wind2); ru.uColor.value.copy(sky.uniforms.uAmbient.value).multiplyScalar(1.4).addScalar(0.15);
  const su = snow.mat.uniforms;
  su.uTime.value = time; su.uCenter.value.copy(cam.target); su.uAmount.value = w.snow * Math.max(w.rain, w.cloud > 0.5 ? 0.15 : 0);
  su.uWind.value.copy(wind2).multiplyScalar(0.6 + w.storm); su.uColor.value.copy(sky.uniforms.uAmbient.value).multiplyScalar(1.6).addScalar(0.25);
  const fu = flies.mat.uniforms;
  const leafy = tmpW[FOREST] + tmpW[SWAMP] * 1.3 + tmpW[COAST] * 0.3;
  fu.uTime.value = time; fu.uCenter.value.copy(cam.target);
  fu.uAmount.value = clamp(sky.night * (1 - w.rain * 0.9) * (1 - w.snow) * leafy, 0, 1);
  for (const p of PUFFS) {
    p.mat.uniforms.uTime.value = time;
    p.mat.uniforms.uWind.value.copy(wind2).multiplyScalar(0.5);
    p.mat.uniforms.uLight.value.copy(sky.uniforms.uAmbient.value).add(sky.uniforms.uSunColor.value).multiplyScalar(0.9);
  }
  const day = 1 - sky.night;
  const meadow = tmpW[FOREST] + tmpW[COAST] * 0.7;
  const light = fxLight.copy(sky.uniforms.uAmbient.value).add(sky.uniforms.uSunColor.value).multiplyScalar(0.85);
  for (const d of DRIFTERS) { d.mat.uniforms.uTime.value = time; d.mat.uniforms.uCenter.value.copy(cam.target); d.mat.uniforms.uLight.value.copy(light); d.mat.uniforms.uWind.value.copy(wind2); }
  butterflies.mat.uniforms.uAmount.value = clamp(day * (1 - w.rain) * (1 - w.snow) * meadow, 0, 1);
  leaves.mat.uniforms.uAmount.value = clamp((tmpW[FOREST] + tmpW[SWAMP] * 0.5) * (0.25 + w.wind * 0.6) * (1 - w.snow), 0, 1);
  chickens.update(dt, time);
  water.material.uniforms.uTime.value = time;
  water.material.uniforms.uRain.value = w.rain * (1 - w.snow);
  fall.mat.uniforms.uTime.value = time;
  clouds.update(dt, cam.target, camera.position.y + 14, w.cloud, wind2);

  // survival, creatures, sound
  let g = noGame;
  if (playing && !creator.isOpen) {   // the game waits while the character creator is open
    gameCtx.hour = sky.hour; gameCtx.night = sky.night; gameCtx.time = time; gameCtx.weather = w; gameCtx.biome = primary;
    g = game.update(gdt, gameCtx);   // Maverick: combat (gdt: hit-pause)
    // Maverick: feel. The target ring glides to the next target and grows in, instead of jumping.
    const m = game.marker;
    if (m.visible) {
      const goalS = m.scale.x;
      if (!mk.on) { mk.on = true; mk.pos.copy(m.position); mk.s = goalS * 0.5; }
      mk.pos.lerp(m.position, 1 - Math.exp(-dt * 16)); mk.s += (goalS - mk.s) * (1 - Math.exp(-dt * 12));
      m.position.copy(mk.pos); m.scale.setScalar(mk.s);
    } else mk.on = false;
  }
  if (playing && !creator.isOpen) { builder.update(dt); tutorial.update(dt, time); }   // Forge: building and tutorial
  map.update(dt, playing && !creator.isOpen);   // Forge: map (reveals the fog as you walk; the globe redraws about 15 times a second)
  hud.update(dt);
  const a = audioCtx;
  a.hour = sky.hour; a.night = sky.night; a.rain = w.rain * (1 - w.snow); a.storm = w.storm; a.snow = w.snow; a.wind = w.wind;
  a.nearFire = g.nearFire || 0; a.biome = BIOMES[primary].key; a.danger = g.danger || 0; a.lightning = weather.flash;
  audio.update(dt, a);

  // HUD
  const ph = phaseName(sky.hour);
  const hh = Math.floor(sky.hour), mm = Math.floor((sky.hour % 1) * 60);
  const clock = `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;   // 12-hour clock, e.g. 3:30 PM
  if (clock !== lastClock) { ui.clock.textContent = clock; lastClock = clock; }
  if (ph !== lastPhase) { ui.phase.textContent = ph; ui.skyIcon.innerHTML = svg(ICONS[ph]); $('ui-time').title = ph; lastPhase = ph; }
  const snowy = w.snow > 0.5;
  const wl = weather.label(snowy);
  if (wl !== lastWx) { ui.wx.textContent = wl; ui.wxIcon.innerHTML = svg(ICONS[weather.state]); $('ui-wx').title = wl; lastWx = wl; }
  if (primary !== pendingPlace) { pendingPlace = primary; placeTimer = 0; }
  placeTimer += dt;
  if (pendingPlace !== lastPlace && placeTimer > 1.2) {
    lastPlace = pendingPlace;
    ui.place.textContent = BIOMES[lastPlace].name;
    if (time > 3) showToast(`${BIOMES[lastPlace].name}. ${BIOMES[lastPlace].line}`, 'Welcome to');
  }
}

function render() { composer.render(); }

// ---------- main loop ----------
let last = performance.now();
// Keeps the game smooth: if frames are slow for a few seconds, draw slightly fewer pixels.
const perf = { t: 0, frames: 0, slow: 0 };
function watchSpeed(dt) {
  if (STYLE !== 'smooth' || !playing) return;
  perf.t += dt; perf.frames++;
  if (perf.t < 2) return;
  const fps = perf.frames / perf.t;
  perf.t = 0; perf.frames = 0;
  perf.slow = fps < 40 ? perf.slow + 1 : 0;
  if (perf.slow >= 2 && Q.pixelRatio > 1) {
    perf.slow = 0;
    Q.pixelRatio = Math.max(1, Math.round((Q.pixelRatio - 0.25) * 4) / 4);
    renderer.setPixelRatio(Q.pixelRatio);
    resize();
    try { localStorage.setItem('hearthwild-sharp-' + qKey, String(Q.pixelRatio)); } catch { /* storage blocked */ }
  } else if (perf.slow >= 3 && qKey !== 'low') {
    // already at the lowest sharpness and still slow: step down one graphics level
    perf.slow = 0;
    stepDownGraphics();
  }
}
// One level down (High -> Phone -> Low). Glow and shadows change at once; fewer plants from the next start.
function stepDownGraphics() {
  const next = LEVEL_ORDER[Math.min(LEVEL_ORDER.length - 1, LEVEL_ORDER.indexOf(qKey) + 1)];
  if (next === qKey) return;
  const P = PRESETS[next];
  qKey = next;
  try { localStorage.setItem('hearthwild-quality', next); } catch { /* storage blocked */ }
  $('opt-quality').value = next;
  bloom.enabled = P.bloom;
  if (!P.shadow) { renderer.shadowMap.enabled = false; sky.light.castShadow = false; }
  else if (P.shadow < sky.light.shadow.mapSize.x) {
    sky.light.shadow.mapSize.set(P.shadow, P.shadow);
    if (sky.light.shadow.map) { sky.light.shadow.map.dispose(); sky.light.shadow.map = null; }
  }
  hud.news(`Graphics down to ${P.name} for smoother play. Change it in Settings`, 'Graphics');
}

let paused = false, rafId = 0;
function frame(now) {
  if (paused) return;   // the loop stops while the page is hidden; it restarts on return
  if (map.isOpen) { last = now; rafId = requestAnimationFrame(frame); return; }   // Forge: map (the game pauses while the map is open)
  const dt = Math.min((now - last) / 1000, 0.05);
  watchSpeed((now - last) / 1000);
  last = now;
  step(dt);
  render();
  rafId = requestAnimationFrame(frame);
}
// Switching apps or tabs pauses the game and the music, and saves; coming back carries on.
function setPaused(p) {
  if (p === paused) return;
  paused = p;
  audio.setMuted(muted || p);
  cancelAnimationFrame(rafId);
  if (!p && !CAPTURE) {
    perf.t = 0; perf.frames = 0;
    rafId = requestAnimationFrame((t) => { last = t; frame(t); });
  }
}

// Controls for testing and screenshots.
window.game = {
  scene, camera, world, player, sky, weather, cam, renderer, game, creatures, hud, audio, creator, combat,
  builder, tutorial,   // Forge: building and tutorial
  map,   // Forge: map
  // opens the character creator as after Begin ('new') or from Settings ('edit')
  openCreator(mode = 'edit') { if (mode === 'new' && !playing) newGame(false); else if (playing) changeLook(); },
  setHour(h) { sky.hour = ((h % 24) + 24) % 24; },
  setWeather(s, settle = true) { weather.force(s); if (settle) weather.settle(); },
  teleport(x, z) { player.pos.set(x, world.heightAt(x, z), z); cam.target.set(x, player.pos.y + 0.8, z); camLead.set(0, 0, 0); },   // Maverick: feel (lead reset)
  view(yaw, dist, pitch) { if (yaw !== undefined) cam.yaw = cam.yawTarget = yaw; if (dist !== undefined) cam.dist = cam.distTarget = dist; if (pitch !== undefined) cam.pitch = pitch; },
  hold(keys) { input.keys = new Set(keys); },
  blendWeather(dt) { for (const m of weather.machines) m.update(dt, false); },
  step(dt = 1 / 30, n = 1) { for (let k = 0; k < n; k++) step(dt); render(); },
  sim(dt = 1 / 30, n = 1) { for (let k = 0; k < n; k++) step(dt); },
  info() { return { hour: sky.hour, weather: weather.state, x: player.pos.x, z: player.pos.z, place: BIOMES[world.biomeAt(player.pos.x, player.pos.z)].name, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
};

function begin(fresh, created) {
  if (playing) return;
  // let go of the start button, so Enter or Space do not press it again (it reloaded the save)
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (fresh) Game.clearSave();
  const loaded = !fresh && game.load();
  if (!loaded) sky.hour = 8;
  hud.news(controlsHelp, 'How to play', 150);
  const name = player.look.name;
  hud.news(loaded ? `Welcome back, ${name}!` : `Welcome, ${name}! The wild is happy to see you.`, 'Hello', 40);
  cam.target.set(player.pos.x, player.pos.y + 0.8, player.pos.z);
  playing = true;
  hud.playing = true;
  hud.dirty = true;
  $('loading').classList.add('done');
  tutorial.begin(loaded);   // Forge: tutorial (new games start the guided start; saves carry on)
  if (created) game.save();   // a new explorer is saved straight away, so Continue brings them back
}

function start() {
  step(1 / 60); render();
  if (!CAPTURE) rafId = requestAnimationFrame((t) => { last = t; frame(t); });
  // the start screen: opening text and Begin
  let hasSave = false;
  try { hasSave = !!localStorage.getItem('hearthwild-save-v1'); } catch { /* storage blocked */ }
  $('loading-text').hidden = true;
  $('story-open').hidden = false;
  $('start-buttons').hidden = false;
  $('loading').classList.add('ready');
  $('btn-begin').textContent = hasSave ? 'Continue' : 'Begin';
  $('btn-fresh').hidden = !hasSave;
  // Continue loads the saved game; Begin (a new game) opens the character creator first
  $('btn-begin').addEventListener('click', () => { if (!muted) audio.start(); if (hasSave) begin(false); else newGame(false); });
  $('btn-fresh').addEventListener('click', () => setConfirm(true, 'start'));
  setInterval(() => { if (playing && !game.sleeping && !paused) game.save(); }, 20000);
  addEventListener('pagehide', () => { if (playing) game.save(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) game.save();
    setPaused(document.hidden);
  });
  if (CAPTURE) begin(true);
  window.gameReady = true;
}
start();

// Atlas: as a Home Screen app, keep a copy on the phone so it opens with no signal (updates still come
// straight through when online). Not available inside the claude.ai preview, which is fine.
try {
  if ('serviceWorker' in navigator && location.protocol === 'https:' && /github\.io$|pages\.dev$/.test(location.hostname)) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
} catch { /* not supported here */ }
