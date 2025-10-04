// ================================
// Salt Droppee — script.js (patched 2025‑09‑23)
// ================================

// --- Détection d'input & utilitaire cross-platform
const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const gsap = window.gsap;

const INPUT = {
  tap: hasTouch ? 'touchstart' : 'click',
  down: hasTouch ? 'touchstart' : 'mousedown',
  move: hasTouch ? 'touchmove' : 'mousemove',
  up:   hasTouch ? 'touchend'  : 'mouseup',
};
function addEvent(el, type, handler, opts) {
  if (!el) return;
  el.addEventListener(type, handler, opts || { passive: true });
}
function getPrimaryPoint(evt) {
  if (hasTouch) {
    const touches = evt.changedTouches || evt.touches;
    if (touches && touches.length > 0) {
      return touches[0];
    }
  }
  return evt;
}

let canvas;
let ctx;
let overlay;
let game;

// === Chargement des images ===
const BronzeImg  = new Image(); let bronzeReady  = false; BronzeImg.onload  = ()=> bronzeReady  = true; BronzeImg.src  = 'assets/bronze.png';
const SilverImg  = new Image(); let silverReady  = false; SilverImg.onload  = ()=> silverReady  = true; SilverImg.src  = 'assets/silver.png';
const GoldImg    = new Image(); let goldReady    = false; GoldImg.onload    = ()=> goldReady    = true; GoldImg.src    = 'assets/gold.png';
const DiamondImg = new Image(); let diamondReady = false; DiamondImg.onload = ()=> diamondReady = true; DiamondImg.src = 'assets/diamond.png';

const BombImg     = new Image(); let bombReady     = false; BombImg.onload     = ()=> bombReady     = true; BombImg.src     = 'assets/bombe.png';
const ShitcoinImg = new Image(); let shitcoinReady = false; ShitcoinImg.onload = ()=> shitcoinReady = true; ShitcoinImg.src = 'assets/shitcoin.png';
const RugpullImg  = new Image(); let rugpullReady  = false; RugpullImg.onload  = ()=> rugpullReady  = true; RugpullImg.src  = 'assets/rugpull.png';
const FakeADImg   = new Image(); let fakeADReady   = false; FakeADImg.onload   = ()=> fakeADReady   = true; FakeADImg.src   = 'assets/fakeairdrop.png';
const AnvilImg    = new Image(); let anvilReady    = false; AnvilImg.onload    = ()=> anvilReady    = true; AnvilImg.src    = 'assets/anvil.png';

const MagnetImg = new Image(); let magnetReady = false; MagnetImg.onload = ()=> magnetReady = true; MagnetImg.src = 'assets/magnet.png';
const X2Img     = new Image(); let x2Ready     = false; X2Img.onload     = ()=> x2Ready     = true; X2Img.src     = 'assets/x2.png';
const ShieldImg = new Image(); let shieldReady = false; ShieldImg.onload = ()=> shieldReady = true; ShieldImg.src = 'assets/shield.png';
const TimeImg   = new Image(); let timeReady   = false; TimeImg.onload   = ()=> timeReady   = true; TimeImg.src   = 'assets/time.png';

const BonusIcons = {
  magnet: MagnetImg,
  x2: X2Img,
  shield: ShieldImg,
};

const footerImg = new Image();
footerImg.src = 'assets/footer.png';

// --- Main (2 frames)
const Hand = { open:new Image(), pinch:new Image(), ready:false };
Hand.open.src  = 'assets/main_open.png';
Hand.pinch.src = 'assets/main_pince.png';
Promise.all([
  new Promise(r => Hand.open.onload = r),
  new Promise(r => Hand.pinch.onload = r),
]).then(()=> Hand.ready = true);

// --- Portefeuille
const wallets = [
  'assets/walletniveau1.png',
  'assets/walletniveau2.png',
  'assets/walletniveau3.png',
  'assets/walletniveau4.png',
  'assets/walletniveau4.png',
];

let currentLevel = 1;
let walletImage = null;
let currentWalletSrc = '';

function loadWallet(level = 1) {
  const previousLevel = currentLevel;
  const numericLevel = Number(level);
  const fallbackLevel = previousLevel || 1;
  const targetLevel = Math.max(1, Math.min(wallets.length, Math.floor(Number.isFinite(numericLevel) ? numericLevel : fallbackLevel)));
  currentLevel = targetLevel;
  const nextSrc = wallets[targetLevel - 1];
  const shouldReload = currentWalletSrc !== nextSrc;

  if (shouldReload) {
    currentWalletSrc = nextSrc;
    const img = new Image();
    img.onload = () => {
      walletImage = img;
      if (game?.wallet) {
        game.wallet.applyCaps();
      }
    };
    img.src = nextSrc;
    if (img.complete && img.naturalWidth > 0) {
      img.onload();
    }
  }

  if (game?.wallet && (shouldReload || previousLevel !== targetLevel)) {
    const targetWallet = game.wallet;
    if (gsap && typeof gsap.fromTo === 'function') {
      targetWallet.visualScale = 0.5;
      gsap.fromTo(targetWallet, { visualScale: 0.5 }, {
        visualScale: 1,
        duration: 0.4,
        ease: 'back.out(2)',
      });
    } else {
      targetWallet.visualScale = 1;
    }
  }
}

loadWallet(currentLevel);

// Pré-decode (si supporté)
 [GoldImg, SilverImg, BronzeImg, DiamondImg, BombImg,
 ShitcoinImg, RugpullImg, FakeADImg, AnvilImg,
 MagnetImg, X2Img, ShieldImg, TimeImg,
 walletImage, Hand.open, Hand.pinch, footerImg]
  .forEach(img => img?.decode?.().catch(()=>{}));

const VERSION = '1.1.0';

// =====================
// CONFIG & BALANCING
// =====================
const CONFIG = {
  portraitBase: { w: 360, h: 640 }, // 9:16
  maxTopActorH: 0.20,                // main ≤20%
  maxWalletH:  0.20,                 // wallet ≤20%

  runSeconds: 75,
  lives: 3,

  baseSpawnPerSec: 1.25,
  spawnRampEverySec: 10,
  spawnRampFactor: 1.15,

  fallDuration: 3,

  wallet: { speed: 500, dashSpeed: 900, dashCD: 2.0,  bottomOffset: 120, width: 180 },

  control: {
    easeDuration: 0.2,
    easeFunction: 'power2.out',
  },

  magnet: {
    duration: 1.2,
    ease: 'power2.in',
    horizontalStrength: 12.0,
    scaleStart: 0.3,
    scaleEnd: 1.0,
    trailFactor: 1,
  },

  score: { bronze:10, silver:25, gold:50, diamond:100, bad:{shitcoin:-20, anvil:-10}, rugpullPct:-0.3 },
  combo: { step: 10, maxMult: 3 },

  evolveThresholds: [0,150,400,800,1400],

  powerups: { magnet:3, x2:5, shield:0, timeShard:0 },

  rarity: { bronze:0.45, silver:0.30, gold:0.20, diamond:0.05 },
  badWeights: { bomb:0.35, shitcoin:0.25, anvil:0.20, rugpull:0.10, fakeAirdrop:0.10 },

  collision: {
    walletScaleX: 0.30,
    walletScaleY: 1.00,
    walletPadX: 0,
    walletPadY: 90
  },

  // Taille & animation des items
  items: {
    scale: 2,
    spawnScale: 0.30,
    growEase: 'outQuad',
    growDistance: 200
  },

  // Dimensions visuelles (avant scale globale) —
  // ajuste ici pour harmoniser chaque PNG sans toucher au code
  itemSize: {
    bronze:18, silver:18, gold:18, diamond:18,
    bomb:18, shitcoin:18, rugpull:18, fakeAirdrop:18, anvil:20,
    magnet:18, x2:18, shield:18, timeShard:18
  },

  render: { supersample: 1.5 },
  palette: ["#1a1c2c","#5d275d","#b13e53","#ef7d57","#ffcd75","#a7f070","#38b764","#257179"],
  fx: {
    positive: {
      color: "gold",
      duration: 0.3,
      radius: 20
    },
    negative: {
      color: "red",
      duration: 0.2,
      radius: 25
    },
    magnet: {
      color: "cyan",
      duration: 1.2,
      radius: 30
    },
    shield: {
      color: "rgba(100,200,255,0.8)",
      duration: 1.5,
      radiusOffset: 20
    },
    x2: {
      color: "violet",
      duration: 0.6,
      fontSize: 24
    }
  }
};

const FX_RUNTIME = {
  positives: [],
  negatives: [],
  texts: [],
  magnet: null,
  shield: null,
};

const FX_HANDLES = {
  magnet: null,
  shield: null,
};

function removeFromArray(arr, item) {
  const idx = arr.indexOf(item);
  if (idx !== -1) arr.splice(idx, 1);
}

function clearFxRuntime() {
  stopMagnetFx();
  stopShieldFx();
  if (gsap) {
    FX_RUNTIME.positives.forEach(state => gsap.killTweensOf(state));
    FX_RUNTIME.negatives.forEach(state => gsap.killTweensOf(state));
    FX_RUNTIME.texts.forEach(state => gsap.killTweensOf(state));
    if (FX_RUNTIME.magnet) gsap.killTweensOf(FX_RUNTIME.magnet);
    if (FX_RUNTIME.shield) gsap.killTweensOf(FX_RUNTIME.shield);
  }
  FX_RUNTIME.positives.length = 0;
  FX_RUNTIME.negatives.length = 0;
  FX_RUNTIME.texts.length = 0;
  FX_RUNTIME.magnet = null;
  FX_RUNTIME.shield = null;
  FX_HANDLES.magnet = null;
  FX_HANDLES.shield = null;
}

function fxPositiveImpact(x, y) {
  if (!gsap) return null;
  const state = { x, y, scale: 0.1, opacity: 1 };
  FX_RUNTIME.positives.push(state);
  const cleanup = () => removeFromArray(FX_RUNTIME.positives, state);
  return gsap.to(state, {
    scale: 1.5,
    opacity: 0,
    duration: CONFIG.fx.positive.duration,
    ease: "power1.out",
    onComplete: cleanup,
    onInterrupt: cleanup,
  });
}

function fxNegativeImpact(x, y) {
  if (!gsap) return null;
  const state = { x, y, opacity: 1 };
  FX_RUNTIME.negatives.push(state);
  const cleanup = () => removeFromArray(FX_RUNTIME.negatives, state);
  return gsap.to(state, {
    opacity: 0,
    duration: CONFIG.fx.negative.duration,
    ease: "power1.out",
    onComplete: cleanup,
    onInterrupt: cleanup,
  });
}

function fxMagnetActive(wallet) {
  if (!gsap || !wallet) return null;
  const ring = { wallet, scale: 0.5, opacity: 1 };
  FX_RUNTIME.magnet = ring;
  const cleanup = () => {
    if (FX_RUNTIME.magnet === ring) FX_RUNTIME.magnet = null;
  };
  const tween = gsap.to(ring, {
    scale: 2,
    opacity: 0,
    duration: CONFIG.fx.magnet.duration,
    ease: "sine.out",
    repeat: -1,
    onRepeat: () => { ring.opacity = 1; },
    onComplete: cleanup,
    onInterrupt: cleanup,
  });
  FX_HANDLES.magnet = { tween, cleanup, state: ring };
  return FX_HANDLES.magnet;
}

function stopMagnetFx() {
  const handle = FX_HANDLES.magnet;
  if (!handle) return;
  handle.cleanup?.();
  handle.tween?.kill?.();
  if (handle.state) gsap?.killTweensOf(handle.state);
  FX_HANDLES.magnet = null;
}

function fxShieldActive(wallet) {
  if (!gsap || !wallet) return null;
  const aura = { wallet, scale: 1, opacity: 0.4 };
  FX_RUNTIME.shield = aura;
  const cleanup = () => {
    if (FX_RUNTIME.shield === aura) FX_RUNTIME.shield = null;
  };
  const tween = gsap.to(aura, {
    scale: 1.2,
    opacity: 0.2,
    yoyo: true,
    repeat: -1,
    duration: CONFIG.fx.shield.duration,
    ease: "sine.inOut",
    onComplete: cleanup,
    onInterrupt: cleanup,
  });
  FX_HANDLES.shield = { tween, cleanup, state: aura };
  return FX_HANDLES.shield;
}

function stopShieldFx() {
  const handle = FX_HANDLES.shield;
  if (!handle) return;
  handle.cleanup?.();
  handle.tween?.kill?.();
  if (handle.state) gsap?.killTweensOf(handle.state);
  FX_HANDLES.shield = null;
}

function fxX2Active(wallet) {
  if (!gsap || !wallet) return null;
  const fx = { wallet, scale: 0.5, opacity: 1 };
  FX_RUNTIME.texts.push(fx);
  const cleanup = () => removeFromArray(FX_RUNTIME.texts, fx);
  return gsap.to(fx, {
    scale: 1.2,
    opacity: 0,
    duration: CONFIG.fx.x2.duration,
    ease: "back.out(2)",
    onComplete: cleanup,
    onInterrupt: cleanup,
  });
}

function renderFxLayers(g) {
  if (!g) return;
  g.save();
  for (const state of FX_RUNTIME.positives) {
    g.globalAlpha = state.opacity;
    g.beginPath();
    g.arc(state.x, state.y, CONFIG.fx.positive.radius * state.scale, 0, Math.PI * 2);
    g.fillStyle = CONFIG.fx.positive.color;
    g.fill();
  }
  for (const state of FX_RUNTIME.negatives) {
    g.globalAlpha = state.opacity;
    g.beginPath();
    g.arc(state.x, state.y, CONFIG.fx.negative.radius, 0, Math.PI * 2);
    g.fillStyle = CONFIG.fx.negative.color;
    g.fill();
  }
  if (FX_RUNTIME.magnet && FX_RUNTIME.magnet.wallet) {
    const { wallet, opacity, scale } = FX_RUNTIME.magnet;
    g.globalAlpha = opacity;
    g.beginPath();
    g.arc(wallet.x + wallet.w / 2, wallet.y + wallet.h / 2, CONFIG.fx.magnet.radius * scale, 0, Math.PI * 2);
    g.strokeStyle = CONFIG.fx.magnet.color;
    g.lineWidth = 2;
    g.stroke();
  }
  if (FX_RUNTIME.shield && FX_RUNTIME.shield.wallet) {
    const { wallet, opacity, scale } = FX_RUNTIME.shield;
    g.globalAlpha = opacity;
    g.beginPath();
    g.arc(
      wallet.x + wallet.w / 2,
      wallet.y + wallet.h / 2,
      (wallet.w / 2) * scale + CONFIG.fx.shield.radiusOffset,
      0,
      Math.PI * 2
    );
    g.strokeStyle = CONFIG.fx.shield.color;
    g.lineWidth = 3;
    g.stroke();
  }
  for (const state of FX_RUNTIME.texts) {
    if (!state.wallet) continue;
    g.globalAlpha = state.opacity;
    g.fillStyle = CONFIG.fx.x2.color;
    g.font = `${CONFIG.fx.x2.fontSize * state.scale}px monospace`;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.fillText("×2", state.wallet.x + state.wallet.w / 2, state.wallet.y - 10);
  }
  g.restore();
}

// =====================
// UTILS
// =====================
const snap = v => Math.round(v);
const clamp = (v,min,max)=> Math.max(min, Math.min(max,v));
const rand = (a,b)=> Math.random()*(b-a)+a;
function choiceWeighted(entries){ const total = entries.reduce((s,e)=>s+e.w,0); let r = Math.random()*total; for (const e of entries){ if ((r-=e.w) <= 0) return e.k; } return entries[entries.length-1].k; }

function computeWalletCenterBounds(wallet){
  const overflow = 60;
  if (!wallet){
    return { overflow, minCenter: overflow, maxCenter: BASE_W - overflow };
  }
  const halfWidth = wallet.w / 2;
  return {
    overflow,
    minCenter: -overflow + halfWidth,
    maxCenter: BASE_W - wallet.w + overflow + halfWidth,
  };
}

function animateWalletToCenter(wallet, center, duration){
  if (!wallet) return;
  const bounds = computeWalletCenterBounds(wallet);
  const clampedCenter = clamp(center, bounds.minCenter, bounds.maxCenter);
  targetX = clampedCenter;
  const destX = clampedCenter - wallet.w / 2;
  const tweenDuration = (typeof duration === 'number') ? duration : CONFIG.control.easeDuration;
  if (gsap && typeof gsap.to === 'function'){
    gsap.to(wallet, {
      x: destX,
      duration: tweenDuration,
      ease: CONFIG.control.easeFunction,
      overwrite: 'auto',
    });
  } else {
    wallet.x = destX;
  }
}

// =====================
// CANVAS & RENDER SETUP
// =====================
let DPR=1, SS=1, SCALE_FACTOR=1;

function setupHiDPI(){
  if (!canvas || !ctx) return;
  DPR = Math.max(1, window.devicePixelRatio || 1);
  const u = new URLSearchParams(location.search);
  const q = parseFloat(u.get('ss'));
  SS  = (Number.isFinite(q) && q > 0) ? q : (CONFIG.render?.supersample || 1);
  SCALE_FACTOR = Math.min(4, DPR * SS);
  canvas.width  = CONFIG.portraitBase.w * SCALE_FACTOR;
  canvas.height = CONFIG.portraitBase.h * SCALE_FACTOR;
  ctx.setTransform(SCALE_FACTOR, 0, 0, SCALE_FACTOR, 0, 0);
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
}

const BASE_W = CONFIG.portraitBase.w;
const BASE_H = CONFIG.portraitBase.h;
let SCALE = 1, VIEW_W = BASE_W, VIEW_H = BASE_H;
let targetX = BASE_W / 2;

function resize(){
  if (!canvas) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  const scale = Math.min(vw/BASE_W, vh/BASE_H);
  SCALE   = scale;
  VIEW_W  = Math.floor(BASE_W * SCALE);
  VIEW_H  = Math.floor(BASE_H * SCALE);
  canvas.style.width  = VIEW_W + 'px';
  canvas.style.height = VIEW_H + 'px';
  setupHiDPI();
}

// =====================
// INPUT
// =====================
const input = { dash:false, dragging:false };
let leftPressed = false;
let rightPressed = false;
function onKeyDown(e){
  if (e.code === 'ArrowLeft' || e.code === 'KeyA'){
    leftPressed = true;
  }
  if (e.code === 'ArrowRight' || e.code === 'KeyD'){
    rightPressed = true;
  }
  if (e.code === 'Space') input.dash = true;
  if (e.code === 'Enter'){
    const g = Game.instance; if (g && g.state==='title'){ g.audio.init().then(()=>{ requestAnimationFrame(()=> g.uiStartFromTitle()); }); }
  }
}
function onKeyUp(e){
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') leftPressed = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') rightPressed = false;
  if (e.code === 'Space') input.dash = false;
}
function onPointerDown(e){
  const point = getCanvasPoint(e);
  input.dragging = true;
  if (game && game.wallet) animateWalletToCenter(game.wallet, point.x);
}
function onPointerMove(e){
  if (!input.dragging) return;
  const point = getCanvasPoint(e);
  if (game && game.wallet) animateWalletToCenter(game.wallet, point.x);
}
function onPointerUp(){
  input.dragging = false;
}

const TG = window.Telegram?.WebApp; if (TG){ try{ TG.ready(); TG.expand(); }catch(e){} }

// =====================
// SETTINGS & STORAGE
// =====================
const LS = { bestScore:'sd_bestScore', bestCombo:'sd_bestCombo', settings:'sd_settings', runs:'sd_runs' };
const DefaultSettings = { sound:true, contrast:false, haptics:true, sensitivity:1.0 };
function loadSettings(){ try{ return { ...DefaultSettings, ...(JSON.parse(localStorage.getItem(LS.settings))||{}) }; }catch(e){ return {...DefaultSettings}; } }
function saveSettings(s){ try{ localStorage.setItem(LS.settings, JSON.stringify(s)); }catch(e){} }

// =====================
// AUDIO — beeps sans freeze
// =====================
class AudioSys {
  constructor(){ this.ctx=null; this.master=null; this.enabled=true; this.buffers={}; this.ready=false; }
  ensure(){ if (this.ctx) return; const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.enabled ? 0.9 : 0.0; this.master.connect(this.ctx.destination); }
  setEnabled(v){ this.enabled = !!v; if (this.master) this.master.gain.value = this.enabled ? 0.9 : 0.0; }
  _makeBeep({freq=660, ms=80, type='square', fade=0.004}){
    const sr = this.ctx.sampleRate; const len = Math.max(1, Math.floor(sr * (ms/1000))); const buf = this.ctx.createBuffer(1, len, sr); const data = buf.getChannelData(0);
    let phase=0; const dp = 2*Math.PI*freq/sr;
    for (let i=0;i<len;i++){
      let s;
      if (type==='square') s = Math.sign(Math.sin(phase))*0.25; else if (type==='triangle') s = (2/Math.PI)*Math.asin(Math.sin(phase))*0.25; else s = Math.sin(phase)*0.25;
      const t=i/len; const env = Math.min(1, Math.min(t/fade, (1-t)/fade)); data[i] = s * env; phase += dp;
    }
    return buf;
  }
  async init(){
    this.ensure(); await this.ctx.resume().catch(()=>{}); if (this.ready) return;
    this.buffers.good = this._makeBeep({freq:660,  ms:80,  type:'square'});
    this.buffers.bad  = this._makeBeep({freq:140,  ms:120, type:'square'});
    this.buffers.pow  = this._makeBeep({freq:880,  ms:90,  type:'triangle'});
    this.buffers.up   = this._makeBeep({freq:520,  ms:80,  type:'square'});
    const g = this.ctx.createGain(); g.gain.value = 0.00001; g.connect(this.master);
    ['good','bad','pow','up'].forEach(k=>{ const s = this.ctx.createBufferSource(); s.buffer = this.buffers[k]; s.connect(g); s.start(); });
    this.ready = true;
  }
  _play(name){ if (!this.enabled || !this.ready) return; const s = this.ctx.createBufferSource(); s.buffer = this.buffers[name]; s.connect(this.master); s.start(); }
  good(){ this._play('good'); } bad(){ this._play('bad'); } pow(){ this._play('pow'); } up(){ this._play('up'); }
}

// =====================
// ENTITÉS
// =====================
class Wallet{
  constructor(game){ this.g=game; this.level=1; this.x=BASE_W/2; this.y=BASE_H-40; this.w=48; this.h=40; this.slowTimer=0; this.dashCD=0; this.spriteHCapPx=0; this.impact=0; this.impactDir='vertical'; this.squashTimer=0; this.visualScale=1; targetX = this.x + this.w / 2; }
  bump(strength=0.35, dir='vertical'){ this.impact = Math.min(1, this.impact + strength); this.impactDir = dir; }
  applyCaps(){
    const maxH = Math.floor(BASE_H * CONFIG.maxWalletH);
    this.spriteHCapPx = maxH;
    const baseWidth = CONFIG.wallet?.width ?? this.w;
    const ratio = (walletImage && walletImage.naturalWidth > 0)
      ? (walletImage.naturalHeight / walletImage.naturalWidth)
      : 1;
    let targetWidth = baseWidth || 0;
    let targetHeight = targetWidth * ratio;
    if (maxH > 0 && targetHeight > maxH) {
      const clampScale = maxH / targetHeight;
      targetHeight = maxH;
      targetWidth *= clampScale;
    }
    this.w = targetWidth;
    this.h = targetHeight;
    this.y = BASE_H - this.h - CONFIG.wallet.bottomOffset;
    targetX = this.x + this.w / 2;
  }
  evolveByScore(score){ const th=CONFIG.evolveThresholds; let lvl=1; for (let i=0;i<th.length;i++){ if (score>=th[i]) lvl=i+1; } if (lvl!==this.level){ this.level=lvl; loadWallet(lvl); this.applyCaps(); this.g.fx.burst(this.x, this.y, '#ffcd75', 12); this.g.audio.up(); this.squashTimer=0.12; } }
  update(dt){
    const sens = this.g.settings.sensitivity || 1.0;
    const bounds = computeWalletCenterBounds(this);
    let dir = 0;
    if (leftPressed && !rightPressed) dir = -1;
    else if (rightPressed && !leftPressed) dir = 1;

    if (input.dash && this.dashCD <= 0 && dir !== 0){
      const effectiveSpeed = CONFIG.wallet.dashSpeed * (this.slowTimer>0 ? 0.6 : 1.0) * sens;
      const dashDuration = Math.max(0.08, CONFIG.control.easeDuration * 0.5);
      const dashDistance = dir * effectiveSpeed * dashDuration;
      const desiredCenter = clamp(this.x + this.w / 2 + dashDistance, bounds.minCenter, bounds.maxCenter);
      animateWalletToCenter(this, desiredCenter, dashDuration);
      this.dashCD = CONFIG.wallet.dashCD;
      input.dash = false;
      this.bump(0.25, 'horizontal');
    }

    if (this.dashCD > 0) this.dashCD -= dt;
    this.impact = Math.max(0, this.impact - 3 * dt);
    const slowMul = this.slowTimer>0 ? 0.6 : 1.0;
    const moveSpeed = CONFIG.wallet.speed * slowMul * sens;
    if (leftPressed) this.x -= moveSpeed * dt;
    if (rightPressed) this.x += moveSpeed * dt;
    const overflow = 60;
    this.x = clamp(this.x, -overflow, BASE_W - this.w + overflow);
    if (this.slowTimer>0) this.slowTimer -= dt;
    if (this.squashTimer>0) this.squashTimer -= dt;
  }
  draw(g){
    if (!walletImage || !walletImage.complete) return;

    const aspectRatio = (walletImage.naturalWidth > 0)
      ? walletImage.naturalHeight / walletImage.naturalWidth
      : 1;
    let drawWidth = CONFIG.wallet?.width ?? this.w;
    let drawHeight = drawWidth * aspectRatio;
    const maxH = this.spriteHCapPx || drawHeight;
    if (drawHeight > maxH) {
      const clampScale = maxH / drawHeight;
      drawHeight = maxH;
      drawWidth *= clampScale;
    }

    const x = this.x;
    const y = this.y;
    let sx = 1;
    let sy = 1;
    if (this.impactDir === 'vertical') {
      sx = 1 + 0.18 * this.impact;
      sy = 1 - 0.28 * this.impact;
    } else {
      sx = 1 + 0.25 * this.impact;
      sy = 1 - 0.12 * this.impact;
    }

    g.save();
    const cx = Math.round(x + drawWidth / 2);
    const cy = Math.round(y + drawHeight / 2);
    g.translate(cx, cy);
    g.scale(sx * (this.visualScale || 1), sy * (this.visualScale || 1));
    g.translate(-cx, -cy);

    g.shadowColor = 'rgba(0,0,0,0.25)';
    g.shadowBlur = 6;
    g.shadowOffsetY = 2;

    g.drawImage(walletImage, x, y, drawWidth, drawHeight);

    g.restore();
  }
}

class Arm{
  constructor(game){ this.g=game; this.t=0; this.frame=0; this.handX=BASE_W/2; this.spriteHCapPx=0; this.targetX=BASE_W/2; this.moveSpeed=120; this.retarget=0; this.jitterAmt=0.05; this._drawW=90; this._drawH=90; this._x=0; this._y=0; }
  applyCaps(){ const maxH = Math.floor(BASE_H * CONFIG.maxTopActorH); this.h = Math.min(Math.floor(BASE_H * 0.19), maxH); }
  update(dt){ this.t += dt; if (this.t > 0.2){ this.t=0; this.frame=(this.frame+1)%2; } this.retarget -= dt; const padding=16; const approxW=this._drawW||90; const halfW=approxW/2; const minX=padding+halfW; const maxX=BASE_W-(padding+halfW); if (this.retarget<=0){ const maxStep=140; const next=clamp(this.handX + rand(-maxStep, maxStep), minX, maxX); this.targetX=next; this.retarget=rand(0.6,1.8); } const dir=Math.sign(this.targetX - this.handX); this.handX += dir * this.moveSpeed * dt; this.handX = clamp(this.handX + rand(-this.jitterAmt, this.jitterAmt), minX, maxX); if (Math.abs(this.targetX - this.handX) < 2) this.handX = this.targetX; }
  draw(g){ const maxH = Math.floor(BASE_H * CONFIG.maxTopActorH); const targetH = Math.min(this.h, maxH); const y=13; const img=(this.frame===0?Hand.open:Hand.pinch); if (!Hand.ready || !img || !(img.naturalWidth>0)){ this._drawW=90; this._drawH=targetH; const w=this._drawW; const x=clamp(this.handX - w/2, 10, BASE_W - w - 10); this._x=x; this._y=y; return; }
    const natW=img.naturalWidth, natH=img.naturalHeight; const scale=targetH/natH; const drawW=natW*scale, drawH=natH*scale; const x = clamp(this.handX - drawW/2, 10, BASE_W - drawW - 10);
    g.save(); g.imageSmoothingEnabled = true; const drawX=Math.round(x), drawY=Math.round(y); g.drawImage(img, drawX, drawY, drawW, drawH); g.restore(); this._drawW=drawW; this._drawH=drawH; this._x=drawX; this._y=drawY; }
  spawnX(){ return clamp((this._x||0) + (this._drawW||90) - 115, 16, BASE_W - 16); }
  spawnY(){ return (this._y||0) + (this._drawH||48) - 100; }
}

// === Assets registry pour simplifier le rendu ===
const ITEM_ASSETS = {
  good: {
    bronze: { img: BronzeImg, ready: ()=>bronzeReady, fallback: (g,x,y,w,h)=>{ g.fillStyle='#c07a45'; g.beginPath(); g.arc(x+w/2, y+h/2, Math.min(w,h)/2, 0, Math.PI*2); g.fill(); } },
    silver: { img: SilverImg, ready: ()=>silverReady, fallback: (g,x,y,w,h)=>{ g.fillStyle='#cfd6e6'; g.beginPath(); g.arc(x+w/2, y+h/2, Math.min(w,h)/2, 0, Math.PI*2); g.fill(); } },
    gold:   { img: GoldImg,   ready: ()=>goldReady,   fallback: (g,x,y,w,h)=>{ g.fillStyle='#f2c14e'; g.beginPath(); g.arc(x+w/2, y+h/2, Math.min(w,h)/2, 0, Math.PI*2); g.fill(); } },
    diamond:{ img: DiamondImg,ready: ()=>diamondReady,fallback: (g,x,y,w,h)=>{ g.fillStyle='#a8e6ff'; g.beginPath(); g.arc(x+w/2, y+h/2, Math.min(w,h)/2, 0, Math.PI*2); g.fill(); } }
  },
  bad: {
    bomb: { img: BombImg, ready: ()=>bombReady, fallback: (g,x,y,w,h)=>{ g.fillStyle='#333'; g.fillRect(x, y, w, h); } },
    shitcoin: { img: ShitcoinImg, ready: ()=>shitcoinReady, fallback: (g,x,y,w,h)=>{ g.fillStyle='#8a6b3a'; g.beginPath(); g.arc(x+w/2, y+h/2, Math.min(w,h)/2, 0, Math.PI*2); g.fill(); } },
    rugpull: { img: RugpullImg, ready: ()=>rugpullReady, fallback: (g,x,y,w,h)=>{ g.fillStyle='#4a3d7a'; g.beginPath(); g.ellipse(x+w/2, y+h/2, w/2, h/2, 0, 0, Math.PI*2); g.fill(); } },
    fakeAirdrop: { img: FakeADImg, ready: ()=>fakeADReady, fallback: (g,x,y,w,h)=>{ g.fillStyle='#6b7cff'; g.beginPath(); g.ellipse(x+w/2, y+h/2, w/2, h/2, 0, 0, Math.PI*2); g.fill(); g.fillStyle='#fff'; g.fillRect(x+w/2-3, y+h/2-3, 6, 6); } },
    anvil: { img: AnvilImg, ready: ()=>anvilReady, fallback: (g,x,y,w,h)=>{ g.fillStyle='#60656f'; g.beginPath(); g.moveTo(x+2, y+h*0.7); g.lineTo(x+w-2, y+h*0.7); g.lineTo(x+w*0.7, y+h*0.4); g.lineTo(x+w*0.3, y+h*0.4); g.closePath(); g.fill(); } },
  },
  power: {
    magnet: { img: MagnetImg, ready: ()=>magnetReady, fallback: (g,x,y,w,h)=>{ g.fillStyle='#00d1ff'; g.fillRect(x,y,w,h); } },
    x2:     { img: X2Img,     ready: ()=>x2Ready,     fallback: (g,x,y,w,h)=>{ g.fillStyle='#00d1ff'; g.fillRect(x,y,w,h); } },
    shield: { img: ShieldImg, ready: ()=>shieldReady, fallback: (g,x,y,w,h)=>{ g.fillStyle='#00d1ff'; g.fillRect(x,y,w,h); } },
    timeShard:{img: TimeImg,  ready: ()=>timeReady,   fallback: (g,x,y,w,h)=>{ g.fillStyle='#00d1ff'; g.fillRect(x,y,w,h); } },
  }
};

function drawItemSprite(g, kind, subtype, x, y, w, h){
  const entry = ITEM_ASSETS[kind]?.[subtype];
  if (entry){ const im = entry.img; if (im && im.complete) { g.drawImage(im, x, y, w, h); } else { entry.fallback(g,x,y,w,h); } return; }
  // Fallback ultime
  g.fillStyle = '#00d1ff'; g.fillRect(x,y,w,h);
}

class FallingItem{
  constructor(game, kind, subtype, x, y){
    this.g = game;
    this.kind = kind;
    this.subtype = subtype;
    this.x = x;
    this.y = y;
    this.spawnScale = (CONFIG.items?.spawnScale != null) ? CONFIG.items.spawnScale : 0.30;
    this.maxScale = 1;
    this.scale = this.spawnScale;
    this.alive = true;
    this._dead = false;
    this._tween = null;
    this.vx = 0;

    const endY = BASE_H - 80;
    const duration = CONFIG.fallDuration ?? 2.5;

    if (gsap && typeof gsap.to === 'function'){
      this._tween = gsap.to(this, {
        y: endY,
        scale: 1,
        duration,
        ease: "power2.in",
        onComplete: () => {
          this.dead = true;
        }
      });
    } else {
      this.y = endY;
      this.scale = 1;
    }
  }

  update(dt){
    if (!this.alive || this.dead) return;

    const damping = Math.exp(-8 * dt);
    this.vx *= damping;
    if (Math.abs(this.vx) < 0.01) this.vx = 0;

    if (this.kind === 'good' && this.g?.effects?.magnet > 0){
      const wallet = this.g?.wallet;
      if (wallet){
        const walletCenter = wallet.x + wallet.w / 2;
        const dx = walletCenter - this.x;
        const strength = CONFIG?.magnet?.horizontalStrength ?? 4;
        this.vx += dx * strength * dt;
      }
    }

    if (this.vx){
      const maxSpeed = 600;
      this.vx = clamp(this.vx, -maxSpeed, maxSpeed);
      this.x += this.vx * dt;
      const halfSize = (this.getBaseSize() * this.scale) / 2;
      const minX = halfSize;
      const maxX = BASE_W - halfSize;
      this.x = clamp(this.x, minX, maxX);
    }
  }

  updateScaleFromVerticalPosition(){
    const progress = clamp(this.y / BASE_H, 0, 1);
    const startScale = this.spawnScale ?? 0.3;
    const endScale = this.maxScale ?? 1;
    this.scale = startScale + (endScale - startScale) * progress;
    if (this.scale > endScale) this.scale = endScale;
  }

  get dead(){
    return this._dead;
  }

  set dead(value){
    if (value && !this._dead){
      this._dead = true;
      this.alive = false;
      if (this._tween) this._tween.kill();
    }
  }

  getBaseSize(){
    const base = CONFIG.itemSize?.[this.subtype] ?? 64;
    const mul = CONFIG.items?.scale ?? 1;
    return base * mul;
  }

  getBounds(){
    const size = this.getBaseSize() * this.scale;
    return {
      x: this.x - size / 2,
      y: this.y - size / 2,
      w: size,
      h: size,
    };
  }

  getCenter(){
    return { x: this.x, y: this.y };
  }

  draw(g){
    if (!this.alive) return;
    const bounds = this.getBounds();
    drawItemSprite(g, this.kind, this.subtype, bounds.x, bounds.y, bounds.w, bounds.h);
  }
}

class Spawner{
  constructor(game){ this.g=game; this.acc=0; }
  update(dt){ const diff=this.g.diffMult(); this.acc += dt * (CONFIG.baseSpawnPerSec * diff); while (this.acc >= 1){ this.spawnOne(); this.acc -= 1; } }
  spawnOne(){
    const x = this.g.arm.spawnX(); const y = this.g.arm.spawnY();
    let pGood=0.7, pBad=0.2, pPow=0.1; if (this.g.timeElapsed>30){ pGood=0.6; pBad=0.3; pPow=0.1; }
    const r=Math.random();
    if (r < pGood){ const rar = CONFIG.rarity; const sub = choiceWeighted([{k:'bronze',w:rar.bronze},{k:'silver',w:rar.silver},{k:'gold',w:rar.gold},{k:'diamond',w:rar.diamond}]); this.g.items.push(new FallingItem(this.g,'good',sub,x,y)); }
    else if (r < pGood + pBad){ const bw = CONFIG.badWeights; const sub = choiceWeighted([{k:'bomb',w:bw.bomb*(this.g.timeElapsed>30?1.2:1)},{k:'shitcoin',w:bw.shitcoin},{k:'anvil',w:bw.anvil},{k:'rugpull',w:bw.rugpull},{k:'fakeAirdrop',w:bw.fakeAirdrop}]); this.g.items.push(new FallingItem(this.g,'bad',sub,x,y)); }
    else { const pu = choiceWeighted([{k:'magnet',w:1},{k:'x2',w:1},{k:'shield',w:1},{k:'timeShard',w:1}]); this.g.items.push(new FallingItem(this.g,'power',pu,x,y)); }
  }
}

class HUD{ constructor(game){ this.g=game; } draw(g){ const P=this.g.palette; g.save(); const topCap = Math.floor(BASE_H * CONFIG.maxTopActorH); const BAR_H=28; const barY=topCap+2; g.fillStyle=P[0]; g.fillRect(0,barY,BASE_W,BAR_H); g.fillStyle=P[4]; g.font='12px monospace'; g.textBaseline='top'; const ty=barY+10; const s=`SCORE ${this.g.score|0}`; const t=`TIME ${(Math.max(0,this.g.timeLeft)).toFixed(0)}s`; const v=`LIVES ${'♥'.repeat(this.g.lives)}`; const c=`COMBO x${this.g.comboMult.toFixed(1)} (${this.g.comboStreak|0})`; g.fillText(s,6,ty); g.fillText(v,100,ty); g.fillText(t,300,ty); g.fillText(c,190,ty); let ex=6, ey=barY+BAR_H+4; const iconSize=16; const drawBonus=(icon,timer)=>{ if (!icon || timer<=0) return; if (icon.complete) g.drawImage(icon,ex,ey,iconSize,iconSize); g.fillStyle=P[4]; g.font='12px monospace'; g.textBaseline='top'; g.fillText(`${Math.ceil(timer)}s`, ex+iconSize+4, ey+1); ey += iconSize+4; };
  drawBonus(BonusIcons.magnet, this.g.effects.magnet);
  drawBonus(BonusIcons.x2, this.g.effects.x2);
  if (this.g.effects.shield>0) drawBonus(BonusIcons.shield, 1);
  g.restore(); } }

// =====================
// GAME
// =====================
class Game{
  static instance=null;
  constructor(){ Game.instance=this; this.reset({ showTitle:true }); }
  reset({showTitle=true}={}){
    clearFxRuntime();
    this.settings = loadSettings(); document.documentElement.classList.toggle('contrast-high', !!this.settings.contrast);
    this.palette = CONFIG.palette.slice(); if (this.settings.contrast){ this.palette = ['#000','#444','#ff0044','#ffaa00','#ffffff','#00ffea','#00ff66','#66a6ff']; }
    const u=new URLSearchParams(location.search); const seed=u.get('seed'); this.random = seed? (function(seed){ let t=seed>>>0; return function(){ t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, 1 | t); r ^= r + Math.imul(r ^ r >>> 7, 61 | r); return ((r ^ r >>> 14) >>> 0) / 4294967296; };})(parseInt(seed)||1) : Math.random;
    this.state='title'; this.audio=new AudioSys(); this.audio.setEnabled(!!this.settings.sound);
    this.timeLeft=CONFIG.runSeconds; this.timeElapsed=0; this.lives=CONFIG.lives; this.score=0; this.comboStreak=0; this.comboMult=1; this.maxCombo=0; this.levelReached=1;
    this.arm=new Arm(this); this.arm.applyCaps(); this.wallet=new Wallet(this); this.wallet.applyCaps(); loadWallet(1); this.hud=new HUD(this); this.spawner=new Spawner(this);
    this.items=[]; this.effects={magnet:0,x2:0,shield:0,freeze:0}; this.shake=0; this.bgIndex=0; this.didFirstCatch=false; this.updateBgByScore();
    if (showTitle) this.renderTitle(); else this.render();
  }
  diffMult(){ return Math.pow(CONFIG.spawnRampFactor, Math.floor(this.timeElapsed/CONFIG.spawnRampEverySec)); }
  updateBgByScore(){ const th=CONFIG.evolveThresholds; let idx=0; for (let i=0;i<th.length;i++){ if (this.score>=th[i]) idx=i; } if (idx!==this.bgIndex){ this.bgIndex=idx; this.wallet.evolveByScore(this.score); this.levelReached = Math.max(this.levelReached, this.wallet.level); } }
  start(){ this.state='playing'; this.lastTime=performance.now(); this.ignoreClicksUntil=this.lastTime+500; this.ignoreVisibilityUntil=this.lastTime+1000; this.loop(); }
  loop(){ if (this.state==='playing'){ const now=performance.now(); const dt=Math.min(0.033, (now-this.lastTime)/1000); this.lastTime=now; this.step(dt); this.render(); requestAnimationFrame(()=>this.loop()); } }
  step(dt){
    this.timeElapsed += dt; if (this.timeLeft>0) this.timeLeft = Math.max(0, this.timeLeft - dt); if (this.timeLeft<=0 || this.lives<=0){ this.endGame(); return; }
    this.arm.update(dt); this.wallet.update(dt); this.spawner.update(dt);
    const w=this.wallet; const cx=CONFIG.collision.walletScaleX, cy=CONFIG.collision.walletScaleY, px=CONFIG.collision.walletPadX, py=CONFIG.collision.walletPadY;
    const wr = { x: w.x + (w.w - w.w*cx)/2 + px, y: w.y + (w.h - w.h*cy)/2 + py, w: w.w*cx, h: w.h*cy };
    for (const it of this.items){
      if (!it.alive || it.dead) continue;

      if (typeof it.update === 'function'){
        it.update(dt);
      }
      const hitbox = it.getBounds();
      if (checkAABB(wr, hitbox)){
        this.onCatch(it);
        it.dead = true;
      }
    }
    this.items = this.items.filter(i=>i.alive);
    for (const k of ['magnet','x2','freeze']){ if (this.effects[k]>0) this.effects[k]-=dt; if (this.effects[k]<0) this.effects[k]=0; }
    if (this.effects.magnet <= 0) stopMagnetFx();
    if (this.effects.shield <= 0) stopShieldFx();
    this.updateBgByScore(); if (this.shake>0) this.shake = Math.max(0, this.shake - dt*6);
  }
  onCatch(it){
    const firstCatch = !this.didFirstCatch;
    const { x: itemX, y: itemY } = it.getCenter();
    if (it.kind==='good'){
      this.wallet.bump(0.35, 'vertical');
      let pts = CONFIG.score[it.subtype] || 0; if (this.effects.freeze>0){ fxNegativeImpact(itemX,itemY); this.audio.bad(); this.didFirstCatch=true; return; }
      if (this.effects.x2>0) pts *= 2; this.comboStreak += 1; if (this.comboStreak % CONFIG.combo.step === 0){ this.comboMult = Math.min(CONFIG.combo.maxMult, this.comboMult+1); }
      this.maxCombo = Math.max(this.maxCombo, this.comboStreak); pts = Math.floor(pts * this.comboMult); this.score += pts;
      fxPositiveImpact(itemX,itemY); this.audio.good(); if (this.settings.haptics && !firstCatch) try{ navigator.vibrate && navigator.vibrate(8); }catch(e){}
    } else if (it.kind==='bad'){
      if (it.subtype==='bomb') this.wallet.bump(0.65,'vertical'); else if (it.subtype==='anvil') this.wallet.bump(0.55,'vertical'); else this.wallet.bump(0.40,'vertical');
      fxNegativeImpact(itemX,itemY);
      if (this.effects.shield>0){ this.effects.shield=0; stopShieldFx(); this.audio.pow(); this.didFirstCatch=true; return; }
      this.comboStreak=0; this.comboMult=1;
      if (it.subtype==='bomb'){ this.lives -= 1; this.shake = 0.8; this.audio.bad(); if (this.settings.haptics && !firstCatch) try{ navigator.vibrate && navigator.vibrate(40); }catch(e){} }
      else if (it.subtype==='shitcoin'){ this.score += CONFIG.score.bad.shitcoin; this.audio.bad(); }
      else if (it.subtype==='anvil'){ this.score += CONFIG.score.bad.anvil; this.wallet.slowTimer = 2.0; this.audio.bad(); }
      else if (it.subtype==='rugpull'){ const delta = Math.floor(this.score * CONFIG.score.rugpullPct); this.score = Math.max(0, this.score + delta); this.audio.bad(); }
      else if (it.subtype==='fakeAirdrop'){ this.effects.freeze = 3.0; this.audio.bad(); }
    } else if (it.kind==='power'){
      this.wallet.bump(0.25,'horizontal');
      if (it.subtype==='magnet'){ this.effects.magnet = CONFIG.powerups.magnet; stopMagnetFx(); fxMagnetActive(this.wallet); this.audio.pow(); }
      else if (it.subtype==='x2'){ this.effects.x2 = CONFIG.powerups.x2; fxX2Active(this.wallet); this.audio.pow(); }
      else if (it.subtype==='shield'){ this.effects.shield = 1; stopShieldFx(); fxShieldActive(this.wallet); this.audio.pow(); }
      else if (it.subtype==='timeShard'){ this.timeLeft = Math.min(CONFIG.runSeconds, this.timeLeft + 5); this.audio.pow(); }
      fxPositiveImpact(itemX,itemY);
    }
    this.didFirstCatch=true;
  }
  endGame(){ stopMagnetFx(); stopShieldFx(); this.state='over'; this.render(); try{ const best=parseInt(localStorage.getItem(LS.bestScore)||'0',10); if (this.score>best) localStorage.setItem(LS.bestScore, String(this.score)); const bestC=parseInt(localStorage.getItem(LS.bestCombo)||'0',10); if (this.maxCombo>bestC) localStorage.setItem(LS.bestCombo, String(this.maxCombo)); const runs=JSON.parse(localStorage.getItem(LS.runs)||'[]'); runs.unshift({ ts:Date.now(), score:this.score, combo:this.maxCombo, lvl:this.levelReached }); while (runs.length>20) runs.pop(); localStorage.setItem(LS.runs, JSON.stringify(runs)); }catch(e){}
    this.renderGameOver(); if (TG){ try{ TG.sendData(JSON.stringify({ score:this.score, duration:CONFIG.runSeconds, version:VERSION })); }catch(e){} }
  }
  uiStartFromTitle(){ if (this.state==='title'){ overlay.innerHTML=''; this.start(); } }
  renderTitle(){
    overlay.innerHTML = `
      <div class="panel">
        <h1>Salt Droppee</h1>
        <p>Attrapez les bons tokens, évitez les malus. 75s, 3 vies.</p>
        <div class="btnrow">
          <button id="btnPlay">Jouer</button>
          <button id="btnSettings">Paramètres</button>
          <button id="btnLB">Leaderboard local</button>
        </div>
      </div>`;
    addEvent(document.getElementById('btnSettings'), INPUT.tap, ()=> this.renderSettings());
    addEvent(document.getElementById('btnLB'), INPUT.tap, ()=> this.renderLeaderboard());
    addEvent(document.getElementById('btnPlay'), INPUT.tap, async (e)=>{
      e.preventDefault(); e.stopPropagation(); await this.audio.init(); await new Promise(r=>requestAnimationFrame(r));
      try{ const prev=ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled=false; const imgs=[walletImage, GoldImg, SilverImg, BronzeImg, DiamondImg, BombImg, Hand.open, Hand.pinch]; for (const im of imgs){ if (im && im.naturalWidth) ctx.drawImage(im,0,0,1,1); } ctx.save(); ctx.shadowColor='rgba(0,0,0,0.15)'; ctx.shadowBlur=4; ctx.shadowOffsetY=1; ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(4,4,2,0,Math.PI*2); ctx.fill(); ctx.restore(); ctx.imageSmoothingEnabled=prev; ctx.clearRect(0,0,8,8); }catch(_){ }
      this.uiStartFromTitle();
    }, { passive:false });
  }
  renderSettings(){ const s=this.settings; overlay.innerHTML = `
    <div class="panel">
      <h1>Paramètres</h1>
      <p><label><input type="checkbox" id="sound" ${s.sound?'checked':''}/> Son</label></p>
      <p><label><input type="checkbox" id="contrast" ${s.contrast?'checked':''}/> Contraste élevé</label></p>
      <p><label><input type="checkbox" id="haptics" ${s.haptics?'checked':''}/> Vibrations</label></p>
      <p>Sensibilité: <input type="range" id="sens" min="0.5" max="1.5" step="0.05" value="${s.sensitivity}"></p>
      <div class="btnrow"><button id="back">Retour</button></div>
    </div>`;
    addEvent(document.getElementById('sound'), 'change', e=>{ this.settings.sound = e.target.checked; saveSettings(this.settings); this.audio.setEnabled(this.settings.sound); });
    addEvent(document.getElementById('contrast'), 'change', e=>{ this.settings.contrast = e.target.checked; saveSettings(this.settings); this.reset(); });
    addEvent(document.getElementById('haptics'), 'change', e=>{ this.settings.haptics = e.target.checked; saveSettings(this.settings); });
    addEvent(document.getElementById('sens'), 'input', e=>{ this.settings.sensitivity = parseFloat(e.target.value); saveSettings(this.settings); });
    addEvent(document.getElementById('back'), INPUT.tap, ()=> this.renderTitle());
  }
  renderLeaderboard(){ let runs=[]; try{ runs = JSON.parse(localStorage.getItem(LS.runs)||'[]'); }catch(e){}
    const best = parseInt(localStorage.getItem(LS.bestScore)||'0',10);
    const bestC = parseInt(localStorage.getItem(LS.bestCombo)||'0',10);
    overlay.innerHTML = `
    <div class="panel">
      <h1>Leaderboard (local)</h1>
      <p>Record: <b>${best}</b> | Combo max: <b>${bestC}</b></p>
      <div style="text-align:left; max-height:200px; overflow:auto; border:1px solid var(--ui); padding:6px;">
        ${runs.map((r,i)=>`#${i+1} — ${new Date(r.ts).toLocaleString()} — Score ${r.score} — Combo ${r.combo} — N${r.lvl}`).join('<br/>') || 'Aucune partie'}
      </div>
      <div class="btnrow"><button id="back">Retour</button></div>
    </div>`;
    addEvent(document.getElementById('back'), INPUT.tap, ()=> this.renderTitle());
  }
  renderPause(){ overlay.innerHTML = `<div class="panel"><h1>Pause</h1><div class="btnrow"><button id="resume">Reprendre</button><button id="quit">Menu</button></div></div>`; addEvent(document.getElementById('resume'), INPUT.tap, ()=>{ overlay.innerHTML=''; this.state='playing'; this.lastTime=performance.now(); this.loop(); }); addEvent(document.getElementById('quit'), INPUT.tap, ()=>{ this.reset(); }); }
  renderGameOver(){ const best=parseInt(localStorage.getItem(LS.bestScore)||'0',10); overlay.innerHTML = `
    <div class="panel">
      <h1>Fin de partie</h1>
      <p>Score: <b>${this.score}</b> | Record local: <b>${best}</b></p>
      <p>Combo max: <b>${this.maxCombo}</b> | Niveau atteint: <b>N${this.levelReached}</b></p>
      <div class="btnrow">
        <button id="again">Rejouer</button>
        <button id="menu">Menu</button>
        ${TG? '<button id="share">Partager</button>': ''}
      </div>
    </div>`;
    addEvent(document.getElementById('again'), INPUT.tap, async ()=>{ overlay.innerHTML=''; this.reset({showTitle:false}); await this.audio.init(); await new Promise(r=>requestAnimationFrame(r)); this.start(); }, { passive:false });
    addEvent(document.getElementById('menu'), INPUT.tap, ()=>{ this.reset({showTitle:true}); });
    if (TG){ const sh=document.getElementById('share'); if (sh) addEvent(sh, INPUT.tap, ()=>{ try{ TG.sendData(JSON.stringify({ score:this.score, duration:CONFIG.runSeconds, version:VERSION })); }catch(e){} }); }
  }
  drawBg(g){ const grad=g.createLinearGradient(0,0,0,BASE_H); const presets=[ ['#0f2027','#203a43','#2c5364'], ['#232526','#414345','#6b6e70'], ['#1e3c72','#2a5298','#6fa3ff'], ['#42275a','#734b6d','#b57ea7'], ['#355c7d','#6c5b7b','#c06c84'] ]; const cols=presets[this.bgIndex % presets.length]; grad.addColorStop(0,cols[0]); grad.addColorStop(0.5,cols[1]); grad.addColorStop(1,cols[2]); g.fillStyle=grad; g.fillRect(0,0,BASE_W,BASE_H); }
  render(){
    const sx = this.shake>0? Math.round(rand(-2,2)):0;
    const sy = this.shake>0? Math.round(rand(-2,2)):0;

    ctx.save();
    ctx.clearRect(0,0,BASE_W,BASE_H);
    ctx.translate(sx,sy);

    this.drawBg(ctx);
    this.arm.draw(ctx);
    this.wallet.draw(ctx);

    for (const it of this.items){
      if (!it.dead) it.draw(ctx);
    }

    renderFxLayers(ctx);
    this.hud.draw(ctx);

    if (footerImg.complete){
      const walletBottom = this.wallet.y + this.wallet.h;
      const footerHeight = Math.max(0, BASE_H - walletBottom);

      if (footerHeight > 0){
        ctx.drawImage(footerImg, 0, walletBottom, BASE_W, footerHeight);
      }
    }

    ctx.restore();
  }
}

function checkAABB(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }

function getCanvasPoint(evt){
  if (!canvas) return { x:0, y:0 };
  const rect = canvas.getBoundingClientRect();
  const point = getPrimaryPoint(evt);
  return {
    x: ((point.clientX - rect.left) / rect.width) * BASE_W,
    y: ((point.clientY - rect.top) / rect.height) * BASE_H,
  };
}

function startGame(){
  if (window.__saltDroppeeStarted) return;

  canvas = document.getElementById('game');
  ctx = canvas?.getContext('2d');
  overlay = document.getElementById('overlay');
  if (!canvas || !ctx || !overlay) return;

  window.__saltDroppeeStarted = true;

  resize();
  addEvent(window, 'resize', resize);
  addEvent(window, 'keydown', onKeyDown);
  addEvent(window, 'keyup', onKeyUp);
  addEvent(canvas, INPUT.down, onPointerDown);
  addEvent(window, INPUT.move, onPointerMove);
  addEvent(window, INPUT.up, onPointerUp);
  if (hasTouch) addEvent(window, 'touchcancel', onPointerUp);

  game = new Game();
  if (game && game.wallet) targetX = game.wallet.x + game.wallet.w / 2;

  addEvent(document, 'visibilitychange', ()=>{ if (document.hidden && game.state==='playing'){ const now = performance.now(); if (game.ignoreVisibilityUntil && now < game.ignoreVisibilityUntil) return; game.state='paused'; game.renderPause(); } });

  addEvent(canvas, INPUT.tap, (e)=>{ if (game.state!=='playing') return; const now=performance.now(); if (game.ignoreClicksUntil && now < game.ignoreClicksUntil) return; const pt=getCanvasPoint(e); if (pt.y<40 && pt.x>BASE_W-80){ game.state='paused'; game.renderPause(); } });

  addEvent(document, INPUT.tap, async (e)=>{ if (e.target && e.target.id==='btnPlay' && game.state==='title'){ e.preventDefault(); e.stopPropagation(); await game.audio.init(); await new Promise(r=>requestAnimationFrame(r)); game.uiStartFromTitle(); } }, { capture:true, passive:false });

  game.render();
}

(function boot(){
  if (window.cordova){
    document.addEventListener('deviceready', () => {
      startGame();
    }, false);
  } else {
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', startGame, { once:true });
    } else {
      startGame();
    }
  }
})();
