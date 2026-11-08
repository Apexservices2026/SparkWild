// Items, their icons, and the crafting recipes.
// Icons are smooth, hand-drawn style SVGs (32 x 32): soft shapes, a thin dark outline and 2-3 tones,
// to match the clean look and the round Fredoka/Nunito fonts. The old 8 x 8 pixel icons are kept
// only for the "Pixel art" setting.

// ---------- smooth icons ----------
// Helpers: hs() is a handle or stick (a dark outline stroke under a coloured stroke).
const hs = (d, col, w = 2.6) => `<path d="${d}" stroke-width="${w + 2.3}" fill="none"/><path d="${d}" stroke="${col}" stroke-width="${w}" fill="none"/>`;
const WOOD = '#a8743f', STEEL = '#a7a39a';
const STONE_SHAPE = 'M5 21c-.6-4.6 2.4-9.4 7.4-11 4.6-1.5 9.6-.6 12.4 2.6 2.4 2.7 2.6 6.6.6 9.2-2 2.5-6 3.2-10.4 3.2S5.6 24.4 5 21z';
const STONE_SHADE = 'M5.8 21.2c3 2.2 10 2.8 14.8 1.8 2.4-.5 4.4-1.6 5.4-3.4-.4 2.4-1.8 3.8-3.6 4.4-3.6 1.4-9.6 1.4-12.8.4-1.8-.6-3.2-1.6-3.8-3.2z';
const WALL = '<rect x="4" y="6" width="24" height="20" rx="2" fill="#a86f3b"/><path d="M5.5 9.2h21M5.5 15.8h21M5.5 22.4h21" stroke="#c99060" stroke-width="1.1" fill="none"/><path d="M4 12.7h24M4 19.3h24" stroke="#6e4422" stroke-width="1.2" fill="none"/>';
const SWORD = (blade, shade, guard, grip, pommel) => `<path d="M24.2 4.4h3.4v3.4L14.6 20.8l-3.4-3.4z" fill="${blade}"/><path d="M27.2 6.4 14.6 19l-.9-.9L26.3 5.5z" fill="${shade}" stroke="none"/>${hs('M11 21 6.4 25.6', grip, 2.4)}${hs('M8.4 16.6l7 7', guard, 2.6)}<circle cx="5.6" cy="26.4" r="2.1" fill="${pommel}"/>`;
const SMOOTH = {
  stick: `${hs('M6.5 25.5 25 7', WOOD, 3.4)}${hs('M14.8 17.2 21 19.8', WOOD, 2.2)}<path d="M8.4 22.2 20.8 9.8" stroke="#d6a466" stroke-width="1.1" fill="none"/><path d="M21 19.8c1.5-3 4.5-3.6 6.6-2.8-.8 2.6-3.6 4.3-6.6 2.8z" fill="#7fb04a"/>`,
  stone: `<path d="${STONE_SHAPE}" fill="#aba79d"/><path d="${STONE_SHADE}" fill="#827e76" stroke="none"/><ellipse cx="12.6" cy="13.8" rx="3.4" ry="1.6" fill="#e0dcd3" stroke="none" transform="rotate(-18 12.6 13.8)"/>`,
  fiber: `<path d="M16 27c-1.2-6-4.6-10.6-10-14.6 5.4 1.2 9.4 5.4 10.8 10.4z" fill="#78ad44"/><path d="M16.2 27c.4-7 3.6-13.4 9.8-18-3.2 5.2-5.6 11-6.2 17.6z" fill="#98ca55"/><path d="M15.4 27c-1.4-7.6-.8-14.6 1.6-21.2 1.6 7 1.8 14.2.6 21.2z" fill="#b6dc66"/><rect x="12.2" y="20.6" width="8" height="3.8" rx="1.5" fill="#d1ad72"/>`,
  berries: `<path d="M16 4.6c-.2 2.4.2 4.2 1 5.8" stroke-width="1.6" fill="none"/><path d="M16.8 8.4c2-2.8 5.6-3.4 8.4-2.2-1.4 3-5 4-8.4 2.2z" fill="#6fa344"/><circle cx="11.2" cy="19.4" r="5.6" fill="#d23a4c"/><circle cx="20.8" cy="19.8" r="5.6" fill="#bb2d40"/><circle cx="16" cy="14" r="5.4" fill="#e24a5a"/><circle cx="14.2" cy="12.2" r="1.5" fill="#ffd3d6" stroke="none"/><circle cx="9.4" cy="17.6" r="1.3" fill="#ffc2c8" stroke="none"/><circle cx="19" cy="18" r="1.3" fill="#ffb6bd" stroke="none"/>`,
  wood: `<path d="M9 9.5h15a4.5 6.5 0 0 1 0 13H9z" fill="#9a6435"/><path d="M13 13.2h9M15 18.8h8" stroke="#6e4422" stroke-width="1.3" fill="none"/><ellipse cx="9" cy="16" rx="4.6" ry="6.5" fill="#e8c890"/><ellipse cx="9" cy="16" rx="2.4" ry="3.6" fill="none" stroke="#bb8c56" stroke-width="1"/><circle cx="9" cy="16" r="0.9" fill="#bb8c56" stroke="none"/>`,
  meat: `${hs('M17.5 17.5 24.6 24.6', '#f4ecdc', 2.8)}<circle cx="25.6" cy="22.8" r="2.4" fill="#f4ecdc"/><circle cx="22.8" cy="25.6" r="2.4" fill="#f4ecdc"/><path d="M24.2 24.2 21 21" stroke="#f4ecdc" stroke-width="2.6" fill="none" stroke-linecap="butt"/><path d="M5.2 13.4c0-5.2 4-8.6 8.8-8.6 5 0 8.8 3.8 8.8 8.4 0 3.2-1.6 5.6-4.2 7.2-2 1.4-4.4 1.6-6.6 1-3.8-1-6.8-4.2-6.8-8z" fill="#da6a5c"/><path d="M7.4 18.4c3 2.8 7.8 3 11 .8 2.2-1.6 3.6-3.6 3.8-6.2-1 3.8-4.6 6.4-8.4 6.4-2.4 0-4.6-.2-6.4-1z" fill="#b5483f" stroke="none"/><ellipse cx="11" cy="9.8" rx="2.8" ry="1.5" fill="#f6a597" stroke="none" transform="rotate(-30 11 9.8)"/>`,
  cooked: `${hs('M17.5 17.5 24.6 24.6', '#f4ecdc', 2.8)}<circle cx="25.6" cy="22.8" r="2.4" fill="#f4ecdc"/><circle cx="22.8" cy="25.6" r="2.4" fill="#f4ecdc"/><path d="M24.2 24.2 21 21" stroke="#f4ecdc" stroke-width="2.6" fill="none" stroke-linecap="butt"/><path d="M5.2 13.4c0-5.2 4-8.6 8.8-8.6 5 0 8.8 3.8 8.8 8.4 0 3.2-1.6 5.6-4.2 7.2-2 1.4-4.4 1.6-6.6 1-3.8-1-6.8-4.2-6.8-8z" fill="#b0632f"/><path d="M7.4 18.4c3 2.8 7.8 3 11 .8 2.2-1.6 3.6-3.6 3.8-6.2-1 3.8-4.6 6.4-8.4 6.4-2.4 0-4.6-.2-6.4-1z" fill="#7f421e" stroke="none"/><path d="M9.4 11.6 14 8.4M10.6 15.6l6-4.2" stroke="#7f421e" stroke-width="1.3" fill="none"/><ellipse cx="11.6" cy="8.6" rx="2" ry="1" fill="#e2a064" stroke="none" transform="rotate(-30 11.6 8.6)"/>`,
  hide: `<path d="M9 6c2 1.4 4.4 2 7 2s5-.6 7-2c.4 2 1.6 3.4 3.4 4-1 2-1.2 4-.4 6s.6 4.4-1 6c1 1.4 1.2 3 .6 4.6-2.4-.6-4.6-.2-6.4.8-1.2.6-2.6.6-3.8 0-1.8-1-4-1.4-6.4-.8-.6-1.6-.4-3.2.6-4.6-1.6-1.6-1.8-4-1-6s.6-4-.4-6C7.4 9.4 8.6 8 9 6z" fill="#cd9e66"/><path d="M11.8 12.6c1.2-.8 2.8-.4 3 .8.3 1.2-.8 2.2-2 2-1.3-.2-1.9-1.8-1-2.8zM18 17.6c1.3-.6 2.8.1 2.7 1.4-.1 1.1-1.4 1.6-2.4 1.1-1-.5-1.1-2-.3-2.5zM12.6 20.8c.8-.4 1.8 0 1.8.8s-.9 1.1-1.5.8c-.6-.3-.8-1.2-.3-1.6z" fill="#9c6e3e" stroke="none"/>`,
  fang: `<path d="M8.6 6.2h14.8c-.4 6.2-2.6 13.2-6.4 20-.5.9-1.5.9-2 0C11.2 19.4 9 12.4 8.6 6.2z" fill="#f5eddb"/><path d="M18.4 8.4c-.4 5.6-1.6 11-3.2 16.2 2.4-4.8 4.6-11 5.2-16.2z" fill="#d6c6a2" stroke="none"/><rect x="7.4" y="4.4" width="17.2" height="3.6" rx="1.8" fill="#e7b0a4"/>`,
  fluff: `<path d="M8.5 23.4c-3 0-4.9-2.4-4.5-5 .3-2.2 2.2-3.6 4.2-3.6.2-3.4 3-5.8 6.2-5.6 1.8-2.4 5.4-3 7.8-1.2 1.8 1.4 2.4 3.6 1.8 5.6 2.4.2 4.1 2.2 3.9 4.6-.2 2.6-2.4 4.2-4.9 4.2z" fill="#f3eef9"/><path d="M5.4 20.6c3.2 1.6 14 1.8 21.6-.4-.6 1.8-2 3.2-4.1 3.2H8.5c-1.4 0-2.6-1.2-3.1-2.8z" fill="#cbbde6" stroke="none"/><ellipse cx="14" cy="13.2" rx="2.8" ry="1.4" fill="#fff" stroke="none"/>`,
  axe: `${hs('M9 27.5 20.6 7.6')}<path d="M18.8 5.2c3.2-2 7.2-2.2 10.2-.4-1 2.6-.8 5.4.6 7.8-3.4 1.2-7.4.4-10.2-2.2z" fill="${STEEL}"/><path d="M28.4 5.6c-.8 2.2-.6 4.6.4 6.6" stroke="#e6e3dc" stroke-width="1.2" fill="none"/><rect x="17.6" y="8" width="5" height="3.2" rx="1.1" fill="#d1ad72" transform="rotate(30 20.1 9.6)"/>`,
  torch: `${hs('M14.6 28 17.8 15', '#8a5a30', 2.8)}<rect x="13.8" y="12.6" width="7.4" height="4" rx="1.5" fill="#d1ad72" transform="rotate(14 17.5 14.6)"/><path d="M17.6 2.6c1.2 3 5.6 4.8 5.6 9 0 2.6-2.3 4.4-5.2 4.4s-5.2-1.8-5.2-4.4c0-2.2 1.2-3.6 2.4-4.6.2 1.4.8 2.4 1.8 2.8-.4-2.6 0-5 .6-7.2z" fill="#ff8a2a"/><path d="M17.8 9.2c.8 1.4 2.4 2.2 2.4 4a2.3 2.3 0 0 1-4.6 0c0-1.4 1-2.4 2.2-4z" fill="#ffd84a" stroke="none"/>`,
  spear: `${hs('M5.5 27.5 21.4 11.6', WOOD, 2.4)}<path d="M19.4 12.6c.4-3.8 3.4-7.2 8.6-8.4-1.2 5.2-4.4 8.2-8.6 8.4z" fill="${STEEL}"/><path d="M26.6 5.6c-1 2.4-2.6 4.4-4.8 5.6" stroke="#e6e3dc" stroke-width="1.1" fill="none"/><rect x="17.2" y="12.2" width="4.8" height="3" rx="1" fill="#d1ad72" transform="rotate(-45 19.6 13.7)"/>`,
  pick: `${hs('M16 28.5V9.5')}<path d="M3.8 12.6c3.4-4.8 7.6-6.8 12.2-6.8s8.8 2 12.2 6.8c-3.8-1.6-7.8-2.4-12.2-2.4s-8.4.8-12.2 2.4z" fill="${STEEL}"/><path d="M8.6 9.4c2.2-1.3 4.6-1.9 7.4-1.9" stroke="#e6e3dc" stroke-width="1.1" fill="none"/><rect x="13.6" y="9.6" width="4.8" height="3.4" rx="1.1" fill="#d1ad72"/>`,
  bandage: `<g transform="rotate(-35 16 16)"><rect x="3" y="11" width="26" height="10" rx="5" fill="#f3e5ca"/><rect x="11" y="11" width="10" height="10" rx="1.5" fill="#e4c99e"/><path d="M16 13.2v5.6M13.2 16h5.6" stroke="#d8394a" stroke-width="2.2" fill="none"/><circle cx="6.6" cy="16" r=".7" fill="#c9ad84" stroke="none"/><circle cx="25.4" cy="16" r=".7" fill="#c9ad84" stroke="none"/></g>`,
  ore: `<path d="${STONE_SHAPE}" fill="#8e8a82"/><path d="${STONE_SHADE}" fill="#6c6861" stroke="none"/><path d="M9.6 15.8l2.6-1.8 2.2 1.8-1 2.6-2.8-.2zM18.2 12.4l2.8-.6 1.3 2.4-2.2 1.7-2.1-1.1zM16.6 19.2l2.4-.4 1 2-2 1.2-1.6-1.1z" fill="#e0843a" stroke-width="1.1"/><circle cx="11.6" cy="15.4" r=".6" fill="#ffd08a" stroke="none"/><circle cx="20.2" cy="12.8" r=".6" fill="#ffd08a" stroke="none"/>`,
  iron: `<path d="M4.5 23.5h23l-3.4-6.4H7.9z" fill="#8f99a4"/><path d="M7.9 17.1h16.2l-2.6-6.6h-11z" fill="#d6dde4"/><path d="M11.4 12.4h7.8" stroke="#f6f9fb" stroke-width="1.2" fill="none"/>`,
  ironsword: SWORD('#e3e9ee', '#a9b4bf', '#e0b040', '#6b3f22', '#e0b040'),
  sword: SWORD('#efeae0', '#b9b2a4', WOOD, '#6b3f22', '#c99560'),
  armour: `<path d="M9 5.5c2 1.6 4.4 2.4 7 2.4s5-.8 7-2.4l5 3.4-2.4 5.6-2.6-1V26c-2.4 1.2-4.8 1.6-7 1.6s-4.6-.4-7-1.6V13l-2.6 1-2.4-5.6z" fill="#98a2ac"/><path d="M12 12.4h8v10.4c-1.4.6-2.6.8-4 .8s-2.6-.2-4-.8z" fill="#ccd4db"/><path d="M12 7.2c1.2 1.4 2.6 2 4 2s2.8-.6 4-2" stroke-width="1.3" fill="none"/><path d="M13.6 14.6v6" stroke="#eef2f5" stroke-width="1.2" fill="none"/>`,
  campfire: `${hs('M4.8 26.4 25.4 21.2', '#8a5a30', 3)}${hs('M6.6 21.2 27.2 26.4', '#a5703c', 3)}<path d="M16 3.6c1.4 3.4 6.6 5.6 6.6 10.6 0 3.4-2.9 6-6.6 6s-6.6-2.6-6.6-6c0-2.6 1.4-4.2 2.8-5.4.2 1.6 1 2.8 2.2 3.2-.6-3 0-5.8 1.6-8.4z" fill="#ff8a2a"/><path d="M16.2 11c1 1.6 2.8 2.6 2.8 4.8a2.9 2.9 0 0 1-5.8 0c0-1.8 1.4-3 3-4.8z" fill="#ffd84a" stroke="none"/>`,
  shelter: `<path d="M3.5 26.4 16 5.6l12.5 20.8z" fill="#6c9d3f"/><path d="M16 5.6l12.5 20.8h-8.2z" fill="#4f7d30" stroke="none"/><path d="M8.6 20.4l3.2-1.2M7 23.4l3.4-1.2M11 16.4l2.8-1M21.6 19.6l2.6 1.2" stroke="#a3cc5c" stroke-width="1.1" fill="none"/><path d="M12.4 26.4 16 18.4l3.6 8z" fill="#3b2a1e"/><path d="M13.2 4l5.6 4.4M18.8 4l-5.6 4.4" stroke-width="1.8" fill="none"/>`,
  cabin: `<rect x="20.6" y="6" width="3.4" height="6" fill="#8f8a7f"/><rect x="6.5" y="14" width="19" height="13" rx="1" fill="#9a6435"/><path d="M6.5 18.4h19M6.5 22.8h19" stroke="#6e4422" stroke-width="1.1" fill="none"/><path d="M2.8 16.2 16 5l13.2 11.2z" fill="#c8583b"/><path d="M16 5l13.2 11.2h-6z" fill="#9e4428" stroke="none"/><rect x="13.6" y="19.6" width="4.8" height="7.4" rx="1" fill="#5a361d"/><rect x="20.2" y="18" width="3.6" height="3.4" rx=".6" fill="#ffd36a"/>`,
  farm: `<rect x="3.5" y="17" width="25" height="10" rx="3" fill="#8a5a33"/><path d="M7 21.2h18M7 24.4h18" stroke="#5e3a1e" stroke-width="1.2" fill="none"/><path d="M9 18V13M16 18v-6M23 18v-5" stroke-width="3.4" fill="none"/><path d="M9 18V13M16 18v-6M23 18v-5" stroke="#6c9d3f" stroke-width="1.4" fill="none"/><path d="M9 13.6c-.6-2.4-2.6-3.6-5-3.2.4 2.4 2.4 3.8 5 3.2zM16 12.6c.8-2.8 3.2-4 6-3.4-.8 2.8-3.2 4-6 3.4zM16 13.4c-.6-2.4-2.6-3.6-5-3.2.4 2.4 2.4 3.8 5 3.2zM23 13.6c.6-2.4 2.6-3.6 5-3.2-.4 2.4-2.4 3.8-5 3.2z" fill="#8cbc4f" stroke-width="1.2"/>`,
  forge: `<path d="M5 27V15c0-6 5-10 11-10s11 4 11 10v12z" fill="#938e83"/><path d="M5.6 20h20.8M11 14.6V20M21 14.6V20M8 9.6h16" stroke="#6f6b64" stroke-width="1.1" fill="none"/><path d="M10.4 27v-4.4c0-3.1 2.5-5.6 5.6-5.6s5.6 2.5 5.6 5.6V27z" fill="#3b2418"/><path d="M12.4 27c0-2.6 1.6-4.8 3.6-4.8s3.6 2.2 3.6 4.8z" fill="#ff8a2a" stroke="none"/><ellipse cx="16" cy="26" rx="2" ry="1.2" fill="#ffd84a" stroke="none"/>`,
  seed: `${hs('M16 19V12', '#6c9d3f', 1.8)}<path d="M16 12.4c-1-3.4-4-5-7.6-4.4.6 3.4 3.8 5.2 7.6 4.4z" fill="#8cbc4f"/><path d="M16 11.4c1.2-3 4.2-4.4 7.2-3.8-.8 3-3.8 4.6-7.2 3.8z" fill="#a8d05e"/><ellipse cx="16" cy="22.4" rx="6.4" ry="4.6" fill="#cd9e66"/><ellipse cx="14" cy="21" rx="2.2" ry="1.1" fill="#e8c890" stroke="none"/>`,
  lock: `${hs('M10.5 15.5v-4a5.5 5.5 0 0 1 11 0v4', '#bcc3c9', 2.4)}<rect x="7" y="14" width="18" height="13.4" rx="3" fill="#e2b444"/><path d="M8.6 23.6c4.6 1.4 10.2 1.4 14.8 0" stroke="#b98a24" stroke-width="1.2" fill="none"/><circle cx="16" cy="19.2" r="1.9" fill="#6b4a14" stroke="none"/><path d="M15.1 20h1.8l.6 3.6h-3z" fill="#6b4a14" stroke="none"/>`,
  hand: `<path d="M9.4 17.4V9.6a1.9 1.9 0 0 1 3.8 0V15V6.8a1.9 1.9 0 0 1 3.8 0V15V7.9a1.9 1.9 0 0 1 3.8 0v7.7v-5a1.9 1.9 0 0 1 3.8 0V19c0 5-3.4 8.6-8.2 8.6-3 0-5.2-1.2-7-3.6l-4-5.4a1.9 1.9 0 0 1 2.9-2.5z" fill="#f7deb9"/><path d="M12.4 24c1.6 1.4 3.2 2 5 2 3.2 0 5.6-2.4 6-5.4" stroke="#d6ae82" stroke-width="1.2" fill="none"/>`,
  hammer: `${hs('M16 28.5V12.4', WOOD, 2.8)}<rect x="6.6" y="5.6" width="18.8" height="7.6" rx="2.2" fill="#9ba1a7"/><path d="M9 8.2h14" stroke="#dde1e4" stroke-width="1.2" fill="none"/><rect x="13.4" y="13.2" width="5.2" height="2.8" rx="1" fill="#d1ad72"/>`,
  heart: `<path d="M16 27s-10-6.2-12.4-12.4C2 10.4 4.6 5.8 9.2 5.8c2.8 0 5 1.6 6.8 4 1.8-2.4 4-4 6.8-4 4.6 0 7.2 4.6 5.6 8.8C26 20.8 16 27 16 27z" fill="#ff5a60"/><ellipse cx="9.6" cy="11" rx="2.4" ry="1.6" fill="#ffc2c2" stroke="none" transform="rotate(-35 9.6 11)"/>`,
  drop: `<path d="M16 3.6c-4.2 5.8-8.4 10.4-8.4 15.2a8.4 8.4 0 0 0 16.8 0c0-4.8-4.2-9.4-8.4-15.2z" fill="#4cb4f6"/><ellipse cx="12.6" cy="19.4" rx="1.6" ry="2.6" fill="#c8eaff" stroke="none" transform="rotate(20 12.6 19.4)"/>`,
  flame: `<path d="M16 3.2c1.4 4.8 7.4 7.8 7.4 14.8a7.4 7.4 0 0 1-14.8 0c0-3.4 1.8-5.6 3.4-7.4.2 2.2 1.2 3.6 2.6 4.2-.6-4.2.4-8.2 1.4-11.6z" fill="#ff8a3a"/><path d="M16 15.6c1.2 2 3.2 3.2 3.2 5.8a3.2 3.2 0 0 1-6.4 0c0-2.2 1.4-3.6 3.2-5.8z" fill="#ffd56a" stroke="none"/>`,
  bolt: `<path d="M18.2 3.4 7 17.8h7.2l-1.6 10.8 12.2-15.4h-7.4z" fill="#c2e65a"/>`,
  // round buttons
  dodge: `<path d="M4.6 21c1-7.2 6.8-11.6 13.6-11.6h2.4V5l7.8 7-7.8 7v-4.6h-2.4c-4.8 0-9 2-13.6 6.6z" fill="#fbf3e4"/>${hs('M5.5 25.6h7.5M9.5 29h7', '#fbf3e4', 2)}`,
  bow: `${hs('M9.4 3.6c8.4 4.2 8.4 20.6 0 24.8', WOOD, 2.6)}<path d="M9.4 3.6v24.8" stroke="#f4ecdc" stroke-width="1" fill="none"/>${hs('M5 16h19', '#d6a466', 1.6)}<path d="M23.4 12.4 29 16l-5.6 3.6z" fill="${STEEL}"/><path d="M3.2 13.2 6.6 16l-3.4 2.8z" fill="#e05a50"/>`,
  // build bar
  build: `<rect x="5.6" y="15.2" width="13.8" height="11" fill="#c99560"/><path d="M3 16.6 12.5 7.8l9.5 8.8z" fill="#c8583b"/><rect x="10.6" y="19.8" width="3.8" height="6.4" fill="#5a361d"/>${hs('M20.6 27 26.4 13.4', WOOD, 2.2)}<rect x="21.4" y="6.4" width="10" height="5.2" rx="1.5" fill="#9ba1a7" transform="rotate(23 26.4 9)"/>`,
  floor: `<path d="M3 15.5v3L16 25v-3zM29 15.5v3L16 25v-3z" fill="#8a5a33"/><path d="M3 15.5 16 9l13 6.5L16 22z" fill="#cd9a64"/><path d="M7.4 13.3 20.4 19.8M11.8 11.1l13 6.5" stroke="#9c6a3c" stroke-width="1.1" fill="none"/>`,
  wall: WALL,
  door: `${WALL}<path d="M11.6 26v-9.4a4.4 4.4 0 0 1 8.8 0V26z" fill="#5a361d"/><circle cx="18.2" cy="21.4" r=".9" fill="#e2b444" stroke="none"/>`,
  window: `${WALL}<rect x="10.6" y="10.2" width="10.8" height="9.6" rx="1.2" fill="#a6d8ec"/><path d="M16 10.2v9.6M10.6 15h10.8" stroke-width="1.4" fill="none"/><path d="M12 13.4l2-2" stroke="#e6f6fc" stroke-width="1.2" fill="none"/>`,
  roof: `<rect x="6" y="20.6" width="20" height="5.4" fill="#8a5a33"/><path d="M2.5 22 16 6.5 29.5 22z" fill="#c8583b"/><path d="M16 6.5 29.5 22h-8.6z" fill="#9e4428" stroke="none"/><path d="M8.6 17.4h12.6M12 13.4h6.6" stroke="#e58566" stroke-width="1.1" fill="none"/>`,
  stairs: `<path d="M4 27.5v-6h6v-6h6v-6h6v-6h6v24z" fill="#c99560"/><path d="M5 21.5h4.5M11 15.5h4.5M17 9.5h4.5M23 3.5h4.5" stroke="#ecd0a0" stroke-width="1.3" fill="none"/><path d="M22 27.5v-18M16 27.5v-12M10 27.5v-6" stroke="#9c6a3c" stroke-width="1" fill="none"/>`,
  fence: `<path d="M4.4 27V9.6L7 6.4l2.6 3.2V27zM13.4 27V9.6L16 6.4l2.6 3.2V27zM22.4 27V9.6L25 6.4l2.6 3.2V27z" fill="#cd9a64"/><rect x="2.6" y="12" width="26.8" height="3.2" rx="1" fill="#9a6435"/><rect x="2.6" y="20" width="26.8" height="3.2" rx="1" fill="#9a6435"/>`,
  remove: `<path d="M7.8 10.6h16.4l-1.4 15.6c-.1 1-1 1.8-2 1.8h-9.6c-1 0-1.9-.8-2-1.8z" fill="#e8685a"/><path d="M12.8 14.4v9.6M19.2 14.4v9.6" stroke="#8e2f26" stroke-width="1.5" fill="none"/><path d="M12.6 7V4.8h6.8V7" stroke-width="1.6" fill="none"/><rect x="5.6" y="6.6" width="20.8" height="4" rx="1.8" fill="#f2988a"/>`,
  rotate: `${hs('M24.4 16.4a8.4 8.4 0 1 1-2.6-6.2', '#fbf3e4', 3)}<path d="M18.4 5.6h8.4v8.4z" fill="#fbf3e4"/>`,
  check: hs('M6 16.6l7 7L26.4 9.4', '#fbf3e4', 3.6),
};
SMOOTH.food = SMOOTH.berries;
const OUTLINE = '#33241a';

// ---------- the pixel-art icons (only for the "Pixel art" setting) ----------
const PAL = {
  b: '#8b5a2b', B: '#5e3a1e', g: '#a3a39c', G: '#6b6b66', w: '#f4f1ea', r: '#d8394a', R: '#8e1f2c',
  y: '#ffd84a', o: '#ff8a2a', l: '#8bc34a', d: '#3c7a30', p: '#f2a7c3', P: '#c9504a', k: '#e6d3a3',
  c: '#7fd0e8', s: '#4a90c8', n: '#3a2a1e', v: '#b9a3e8',
};

// 8 x 8 pixel drawings, one string per row ('.' is empty)
const ART = {
  stick: ['......bb', '.....bb.', '....bb..', '...bb...', '..bb....', '.bb.....', 'bb......', 'b.......'],
  stone: ['........', '..gggg..', '.gggwgg.', 'gggggggG', 'gggggGGG', '.gGGGGG.', '........', '........'],
  fiber: ['.l..l.l.', '.l.ll.l.', 'll.l.ll.', '.lll.l..', '..lllll.', '..dlld..', '...dd...', '...dd...'],
  berries: ['....d...', '...dd...', '..r.r...', '.rrrrr..', 'rrRrrRr.', '.rrrrr..', '..rRr...', '........'],
  wood: ['........', '.bbbbbk.', 'bBbbbbkk', 'bbbBbbkk', 'bbbbbbkk', '.bbbbbk.', '........', '........'],
  meat: ['........', '..PPP...', '.PPpPP..', 'PPPPPPk.', '.PPPPPkk', '..PPP.kw', '.......w', '........'],
  cooked: ['........', '..BBB...', '.BBbBB..', 'BBbBBBk.', '.BBBBBkk', '..BBB.kw', '.......w', '........'],
  hide: ['.k....k.', 'kkkkkkkk', '.kkbkkk.', '.kkkkbk.', '.kkbkkk.', 'kkkkkkkk', '.k....k.', '........'],
  fang: ['........', '.wwwwww.', '..wwww..', '..wwww..', '...ww...', '...ww...', '....w...', '........'],
  fluff: ['........', '..vwvw..', '.wvwwvw.', 'wwwvwwww', '.wwwwvw.', '..wvww..', '........', '........'],
  axe: ['...gg...', '..gggg..', '..ggGb..', '...gbb..', '....b...', '...b....', '..b.....', '.b......'],
  spear: ['.......w', '......g.', '.....b..', '....b...', '...b....', '..b.....', '.b......', 'b.......'],
  pick: ['.gggggg.', 'g..bb..g', '...b....', '...b....', '...b....', '...b....', '...b....', '........'],
  bandage: ['........', '..wwww..', '.wwrrww.', '.wrrrrw.', '.wwrrww.', '..wwww..', '........', '........'],
  campfire: ['....o...', '...oy...', '..oyyo..', '..oyro..', '.BbBbBb.', 'GgGgGgGg', '........', '........'],
  shelter: ['...dd...', '..dlld..', '.dlllld.', 'dllllll.', 'b......b', 'b......b', 'b......b', '........'],
  heart: ['........', '.rr..rr.', 'rrrrrrrr', 'rrrrrrrr', '.rrrrrr.', '..rrrr..', '...rr...', '........'],
  food: ['....d...', '...dd...', '..r.r...', '.rrrrr..', 'rrRrrRr.', '.rrrrr..', '..rRr...', '........'],
  drop: ['...c....', '...c....', '..ccc...', '..ccc...', '.ccscc..', '.csccc..', '..ccc...', '........'],
  flame: ['...o....', '..oo....', '..ooo...', '.ooyo...', '.oyyoo..', '.oyyyo..', '..ooo...', '........'],
  bolt: ['....yy..', '...yy...', '..yy....', '.yyyyy..', '...yy...', '..yy....', '.yy.....', '........'],
  hand: ['..k.k...', '.kk.kk..', '.kkkkk.k', '.kkkkkkk', '.kkkkkk.', '..kkkk..', '..kkk...', '........'],
  hammer: ['.GGGGG..', '.GGGGG..', '...b....', '...b....', '...b....', '...b....', '...b....', '........'],
  sword: ['.......w', '......ww', '.....ww.', '..b.ww..', '...bw...', '..bbb...', '.b......', 'b.......'],
  ore: ['........', '..gggg..', '.gogGgg.', 'ggggoggG', 'gogggGoG', '.gGoGGG.', '........', '........'],
  iron: ['........', '........', '..wggg..', '.wgggGG.', 'gggggGG.', 'GGGGGG..', '........', '........'],
  ironsword: ['.......w', '......wg', '.....wg.', '..y.wg..', '...yg...', '..yBy...', '.B......', 'B.......'],
  armour: ['.G....G.', 'GGG..GGG', 'GgGGGGgG', '.GgggGG.', '.GgGGgG.', '.GGggGG.', '.GGGGGG.', '........'],
  cabin: ['...PP...', '..PPPP..', '.PPPPPP.', 'PPPPPPPP', '.bbbbbb.', '.byybBb.', '.bbbbBb.', '........'],
  farm: ['.l..l..l', '.l..l..l', 'dl.dl.dl', 'BBBBBBBB', 'bBbBbBbB', 'BBBBBBBB', '........', '........'],
  forge: ['........', '..GGGG..', '.GGooGG.', '.GoyyoG.', '.GGooGG.', 'GGGGGGGG', 'GgGgGgGg', '........'],
  seed: ['........', '...ll...', '..l..l..', '...ll...', '..kkkk..', '.kkbbkk.', '..kkkk..', '........'],
  torch: ['....y...', '...oyo..', '...ooo..', '....b...', '....b...', '...b....', '...b....', '..b.....'],
  lock: ['..GGGG..', '.G....G.', '.G....G.', 'gggggggg', 'gggGGggg', 'gggGGggg', 'gggggggg', '........'],
};

// Which look the player chose (the same setting main.js reads).
const PIXEL_LOOK = (() => {
  try { return (new URLSearchParams(location.search).get('look') || localStorage.getItem('hearthwild-look2')) === 'pixel'; } catch { return false; }
})();

const cache = {};
export function icon(id) {
  if (cache[id]) return cache[id];
  if (PIXEL_LOOK && ART[id]) {
    let rects = '';
    ART[id].forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== '.') rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${PAL[ch]}"/>`;
    }));
    cache[id] = `<svg viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  } else {
    const art = SMOOTH[id] || SMOOTH.lock;
    cache[id] = `<svg class="ico" viewBox="0 0 32 32" aria-hidden="true"><g stroke="${OUTLINE}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${art}</g></svg>`;
  }
  return cache[id];
}

export const ITEMS = {
  stick: { name: 'Stick' },
  stone: { name: 'Stone' },
  fiber: { name: 'Grass fiber' },
  berries: { name: 'Berries', food: 9, water: 3, eat: 'Eat' },
  wood: { name: 'Wood' },
  meat: { name: 'Raw meat', food: 10, health: -6, eat: 'Raw', badge: 'Raw' },
  cooked: { name: 'Cooked meat', food: 32, health: 6, eat: 'Eat' },
  hide: { name: 'Hide' },
  fang: { name: 'Fang' },
  fluff: { name: 'Puff fluff' },
  axe: { name: 'Stone axe', tool: true },
  torch: { name: 'Torch', tool: true },
  spear: { name: 'Stone spear', tool: true },
  pick: { name: 'Stone pick', tool: true },
  bandage: { name: 'Bandage', health: 25, eat: 'Use' },
  ore: { name: 'Iron ore' },
  iron: { name: 'Iron bar' },
  ironsword: { name: 'Iron sword', tool: true },
  armour: { name: 'Iron armor', tool: true },
};

// XP needed to reach each level (level 1 is the start)
export const LEVELS = [0, 0, 30, 90, 180, 320, 500, 750, 1050, 1400];

export const RECIPES = [
  { id: 'axe', name: 'Stone axe', level: 1, needs: { stick: 1, stone: 1, fiber: 1 }, gives: 'axe', desc: 'Chops trees for wood. Beats punching bark.' },
  { id: 'torch', name: 'Torch', level: 1, needs: { stick: 1, fiber: 1 }, gives: 'torch', desc: 'Light to go. It lights itself after dark.' },
  { id: 'campfire', name: 'Campfire', level: 1, needs: { stick: 4, stone: 3 }, place: 'campfire', desc: 'Warmth, light and dinner. Night creatures keep away.' },
  { id: 'bandage', name: 'Bandage', level: 2, needs: { fiber: 3 }, gives: 'bandage', desc: 'Heals 25 health. Bye-bye, boo-boos.' },
  { id: 'spear', name: 'Stone spear', level: 2, needs: { stick: 2, stone: 1, fiber: 2 }, gives: 'spear', desc: 'Long reach, big poke. Your best weapon for now.' },
  { id: 'shelter', name: 'Lean-to shelter', level: 2, needs: { stick: 6, wood: 4, fiber: 4 }, place: 'shelter', desc: 'Keeps the rain off. Sleep here after midnight, or when tired.' },
  { id: 'pick', name: 'Stone pick', level: 3, needs: { stick: 2, stone: 3, fiber: 2 }, gives: 'pick', desc: 'Breaks rocks fast and mines iron ore. Rock on.' },
  { id: 'cabin', name: 'Log cabin', level: 4, needs: { wood: 16, stone: 8, fiber: 6 }, place: 'cabin', desc: 'A real home: warm, dry and safe. Sleep here, wake here.' },
  { id: 'farm', name: 'Farm plot', level: 5, needs: { wood: 4, fiber: 2 }, place: 'farm', desc: 'Plant berries, wait half a day, pick more. Berry simple.' },
  { id: 'forge', name: 'Forge', level: 6, needs: { stone: 12, wood: 6 }, place: 'forge', desc: 'Turns iron ore into bars. Find ore up north in Greycrag Peaks.' },
  { id: 'ironsword', name: 'Iron sword', level: 7, needs: { iron: 3, wood: 1 }, gives: 'ironsword', desc: 'Hits way harder than stone. Craft it at your forge.', atForge: true },
  { id: 'armour', name: 'Iron armor', level: 8, needs: { iron: 5, hide: 2 }, gives: 'armour', desc: 'Takes the bite out of bites. Craft it at your forge.', atForge: true },
  // The road ahead (shown locked, built in later stages)
  { id: 'village', name: 'Village hall', level: 9, soon: true, desc: 'Invite new friends to live nearby. Coming soon!' },
  { id: 'walls', name: 'Watchtower and walls', level: 9, soon: true, desc: 'Keep dragons from toasting your village. Coming soon!' },
];
