
  // ================================
  // Salt Droppee — game.js (inline)
  // ================================
  
  
  
// --- PNG pour le bronze ---
const BronzeImg = new Image();
let bronzeReady = false;
BronzeImg.onload = ()=> bronzeReady = true;
BronzeImg.src = 'assets/bronze.png';

// --- PNG pour l'argent ---
const SilverImg = new Image();
let silverReady = false;
SilverImg.onload = ()=> silverReady = true;
SilverImg.src = 'assets/silver.png';
  
// --- PNG pour l'or ---
const GoldImg = new Image();
let goldReady = false;
GoldImg.onload = ()=> goldReady = true;
GoldImg.src = 'assets/gold.png';

// --- PNG pour le diamant ---
const DiamondImg = new Image();
let diamondReady = false;
DiamondImg.onload = ()=> diamondReady = true;
DiamondImg.src = 'assets/diamond.png';

// --- PNG de la bombe ---
const BombImg = new Image();
let bombReady = false;
BombImg.onload = ()=> bombReady = true;
BombImg.src = 'assets/bombe.png';


// --- PNG de la main (2 frames) ---
const Hand = {
  open: new Image(),
  pinch: new Image(),
  ready: false
};
Hand.open.src  = 'assets/main_open.png';
Hand.pinch.src = 'assets/main_pince.png';
Promise.all([
  new Promise(r => Hand.open.onload = r),
  new Promise(r => Hand.pinch.onload = r),
]).then(()=> Hand.ready = true);
  const VERSION = '1.0.0';

  const CONFIG = {
    portraitBase: { w: 360, h: 640 }, // 9:16
    maxTopActorH: 0.20, // Bras cap 20%
    maxWalletH: 0.20,   // Portefeuille cap 20%

    runSeconds: 75,
    lives: 3,
    baseSpawnPerSec: 1.2,
    spawnRampEverySec: 10,
    spawnRampFactor: 1.15,

    gravity: { good: 220, bad: 260, power: 200 }, // px/s²
    wallet: { speed: 480, dashSpeed: 900, dashCD: 2.0 },

    score: { bronze:10, silver:25, gold:50, diamond:100, bad:{shitcoin:-20, anvil:-10}, rugpullPct:-0.3 },
    combo: { step: 10, maxMult: 3 },

    evolveThresholds: [0,150,400,800,1400],

    powerups: { magnet:3, x2:5, shield:0, timeShard:0 },
    rarity: { bronze:0.45, silver:0.3, gold:0.2, diamond:0.05 },
    badWeights: { bomb:0.35, shitcoin:0.25, anvil:0.2, rugpull:0.1, fakeAirdrop:0.1 },
	collision: {
  walletScaleX: 0.30, // ← 30% de la largeur visible captent les objets
  walletScaleY: 1.00, // ← 100% de la hauteur (laisse 1.0 si tu ne veux pas réduire en hauteur)
  walletPadX: 0,      // ← offset horizontal supplémentaire (px), généralement 0
  walletPadY: 35       // ← offset vertical supplémentaire (px), généralement 0
},

// --- Taille des objets qui tombent ---
    palette: ["#1a1c2c","#5d275d","#b13e53","#ef7d57","#ffcd75","#a7f070","#38b764","#257179"],
    render: { supersample: 1.5 // 1.5–2.0 est un bon sweet spot. Monte si ton device tient la perf
    },
    items: {
      scale: 1.8,        // taille finale (1.0 = taille d'origine)
      spawnScale: 0.35,  // taille relative à l'apparition
      growDistance: 240  // distance (px) avant d'atteindre la taille finale
    },

	
  };
  
 


  const LS = {
    bestScore: 'sd_bestScore',
    bestCombo: 'sd_bestCombo',
    settings: 'sd_settings',
    runs: 'sd_runs',
  };

  // Utils
  const snap = v => Math.round(v);
  const snapR = (x, y, w, h) => [snap(x), snap(y), Math.round(w), Math.round(h)];
  function drawImgCrisp(g, img, x, y, w, h){
    const ix = Math.round(x);
    const iy = Math.round(y);
    const prev = g.imageSmoothingEnabled;
    g.imageSmoothingEnabled = false;   // net pour les petits sprites
    g.drawImage(img, ix, iy, w, h);    // ⚠️ on NE snap PAS w,h
    g.imageSmoothingEnabled = prev;
  }
  const clamp = (v,min,max)=> Math.max(min, Math.min(max,v));
  const lerp = (a,b,t)=> a+(b-a)*t;
  const rand = (a,b)=> Math.random()*(b-a)+a;
  const choiceWeighted = (entries)=>{
    const total = entries.reduce((s,e)=>s+e.w,0);
    let r = Math.random()*total;
    for (const e of entries){ if ((r-=e.w) <= 0) return e.k; }
    return entries[entries.length-1].k;
  };

  function seededRandom(seed){
    let t = seed >>> 0;
    return function(){ t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, 1 | t);
      r ^= r + Math.imul(r ^ r >>> 7, 61 | r); return ((r ^ r >>> 14) >>> 0) / 4294967296; };
  }

  const isTouchDevice = (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
  function haptic(ms=15){
    if (!isTouchDevice) return;
    try{ navigator.vibrate && navigator.vibrate(ms); }catch(e){}
  }

  // Scaling & viewport management
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // HD + Supersampling (Option B)
let DPR = Math.max(1, window.devicePixelRatio || 1);
let SS  = (() => {
  const u = new URLSearchParams(location.search);
  const q = parseFloat(u.get('ss'));
  return Number.isFinite(q) && q > 0 ? q : (CONFIG.render?.supersample || 1);
})();

// facteur interne total (cap pour éviter l'explosion perf/mémoire)
let SCALE_FACTOR = Math.min(4, DPR * SS);

canvas.width  = CONFIG.portraitBase.w * SCALE_FACTOR;
canvas.height = CONFIG.portraitBase.h * SCALE_FACTOR;
ctx.setTransform(SCALE_FACTOR, 0, 0, SCALE_FACTOR, 0, 0);

ctx.imageSmoothingEnabled = true;
if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';

const BASE_W = CONFIG.portraitBase.w;
const BASE_H = CONFIG.portraitBase.h;
let SCALE = 1, VIEW_W = BASE_W, VIEW_H = BASE_H;

  function resize(){
    const vw = window.innerWidth, vh = window.innerHeight;
    const scale = Math.min(vw/BASE_W, vh/BASE_H);

    // globals
    SCALE   = scale;
VIEW_W  = Math.floor(BASE_W * SCALE);
VIEW_H  = Math.floor(BASE_H * SCALE);

// Taille CSS (affichage) — PAS de marges ici
canvas.style.width  = VIEW_W + 'px';
canvas.style.height = VIEW_H + 'px';


   // HiDPI + Supersampling interne
DPR = Math.max(1, window.devicePixelRatio || 1);
SS  = (() => {
  const u = new URLSearchParams(location.search);
  const q = parseFloat(u.get('ss'));
  return Number.isFinite(q) && q > 0 ? q : (CONFIG.render?.supersample || 1);
})();
SCALE_FACTOR = Math.min(4, DPR * SS);

canvas.width  = BASE_W * SCALE_FACTOR;
canvas.height = BASE_H * SCALE_FACTOR;
ctx.setTransform(SCALE_FACTOR, 0, 0, SCALE_FACTOR, 0, 0);

ctx.imageSmoothingEnabled = true;
if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';



  }

  window.addEventListener('resize', resize, {passive:true});
  resize();

  // Input handling
  const input = { left:false, right:false, dash:false, dragging:false, dragX:0 };

  window.addEventListener('keydown', e=>{
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = true;
    if (e.code === 'Space') input.dash = true;
    if (e.code === 'Enter') Game.instance?.uiStartFromTitle();
  });
  window.addEventListener('keyup', e=>{
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = false;
    if (e.code === 'Space') input.dash = false;
  });

  // Touch drag (direct)
  canvas.addEventListener('touchstart', e=>{
    input.dragging = true; input.dragX = e.changedTouches[0].clientX;
  }, {passive:true});
  canvas.addEventListener('touchmove', e=>{
    if (!input.dragging) return;
    input.dragX = e.changedTouches[0].clientX;
  }, {passive:true});
  canvas.addEventListener('touchend', ()=>{ input.dragging=false; });

  // Telegram WebApp integration (optional)
  const TG = window.Telegram?.WebApp;
  if (TG){ try{ TG.ready(); TG.expand(); }catch(e){} }

  // Settings & persistence
  const DefaultSettings = { sound:true, contrast:false, haptics:true, sensitivity:1.0 };
  function loadSettings(){ try{ return { ...DefaultSettings, ...(JSON.parse(localStorage.getItem(LS.settings))||{}) }; }catch(e){ return {...DefaultSettings}; } }
  function saveSettings(s){ try{ localStorage.setItem(LS.settings, JSON.stringify(s)); }catch(e){} }

  // Simple Audio (WebAudio beeps)
  class AudioSys{
    constructor(){ this.ctx = null; this.enabled = true; }
    ensure(){ if (!this.ctx) this.ctx = new (window.AudioContext||window.webkitAudioContext)(); }

    beepVol(freq=440, ms=60, type='square', vol=0.02){
      if (!this.enabled) return; this.ensure();
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + ms/1000);
    }

    beep(freq=440, ms=80, type='square', vol=0.02){ this.beepVol(freq, ms, type, vol); }
    good(){ this.beepVol(660,60,'square',0.03); }
    bad(){  this.beepVol(140,120,'square',0.04); }
    pow(){  this.beepVol(880,90,'triangle',0.035); }
    up(){   this.beepVol(520,80,'square',0.03); }

    async warmup(){
      try{
        this.ensure();
        await this.ctx.resume();

        this.beepVol(660, 20, 'square',   0.001);
        this.beepVol(140, 20, 'square',   0.001);
        this.beepVol(880, 20, 'triangle', 0.001);
      }catch(_){ }
    }
  }

  // Particles (smooth dots)
  class ParticleSys{
    constructor(){ this.ps=[]; this.gpuPrimed = false; }
    burst(x,y,color='#a7f070',n=6){
      if (!this.gpuPrimed){ this.gpuPrimed = true; return; }
      for(let i=0;i<n;i++){ this.ps.push({x,y,vx:rand(-40,40),vy:rand(-60,0),t:0,life:0.4,color}); }
    }
    update(dt){ this.ps = this.ps.filter(p=> (p.t+=dt) < p.life); this.ps.forEach(p=>{ p.vy += 300*dt; p.x += p.vx*dt; p.y += p.vy*dt; }); }
    render(g){
      g.save();
      for (const p of this.ps){
        g.globalAlpha = 1 - (p.t / p.life);
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, 2.2, 0, Math.PI*2);
        g.fill();
      }
      g.globalAlpha = 1;
      g.restore();
    }
  }
// === Chargement de l'image du portefeuille ===
const walletImg = new Image();
walletImg.src = 'assets/wallet1.png';

// Pré-décode (si supporté)
[GoldImg, SilverImg, BronzeImg, DiamondImg, BombImg, walletImg, Hand.open, Hand.pinch]
  .forEach(img => img?.decode?.().catch(()=>{}));

  // Wallet (coffre lissé)
  class Wallet{
  constructor(game){
    this.g = game;
    this.level = 1;
    this.x = BASE_W/2;
    this.y = BASE_H-40;
    this.w = 48;
    this.h = 40;
    this.vx = 0;
    this.slowTimer = 0;
    this.dashCD = 0;
    this.spriteHCapPx = 0;

    // squash/stretch
    this.impact = 0;
    this.impactDir = 'vertical';
  }

  bump(strength = 0.35, dir = 'vertical'){
    this.impact = Math.min(1, this.impact + strength);
    this.impactDir = dir;
  }

  applyCaps(){
    const maxH = Math.floor(BASE_H * CONFIG.maxWalletH);
    this.spriteHCapPx = maxH;

    // Dimensions basées sur l'image (ratio original)
    const imgRatio = walletImg.naturalWidth / walletImg.naturalHeight || 1;
    this.h = Math.min(maxH, 60);
    this.w = this.h * imgRatio * 1.8; // élargi
    this.y = BASE_H - this.h - 60;
  }
  

    evolveByScore(score){ const th = CONFIG.evolveThresholds; let lvl = 1; for (let i=0;i<th.length;i++){ if (score>=th[i]) lvl = i+1; }
      if (lvl!==this.level){ this.level=lvl; this.applyCaps(); this.g.fx.burst(this.x, this.y, '#ffcd75', 12); this.g.playSfx(()=> this.g.audio.up()); this.squashTimer=0.12; }
    }
    update(dt){ const sets = this.g.settings; const sens = sets.sensitivity||1.0;
      let targetVX = 0;
      if (input.left) targetVX -= 1; if (input.right) targetVX += 1;
      if (input.dragging){
        const rect = canvas.getBoundingClientRect();
        const nx = ((input.dragX - rect.left) / rect.width) * BASE_W; // screen -> logical

        const dx = nx - (this.x+this.w/2);
        targetVX = clamp(dx*5, -1, 1);
      }
      let speed = CONFIG.wallet.speed * (this.slowTimer>0 ? 0.6 : 1.0) * sens;
      if (input.dash && this.dashCD<=0){
  this.vx = (targetVX>=0?1:-1) * CONFIG.wallet.dashSpeed;
  this.dashCD = CONFIG.wallet.dashCD;
  input.dash = false;
  this.bump(0.25, 'horizontal'); // petit étirement latéral
}

      if (this.dashCD>0) this.dashCD -= dt;
	  
	  // décroissance du rebond
	  this.impact = Math.max(0, this.impact - 3 * dt);

      this.vx = lerp(this.vx, targetVX*speed, 0.2);
      this.x += this.vx*dt;
      // autorise un débordement de 60px à gauche et à droite
const overflow = 60;
this.x = clamp(this.x, -overflow, BASE_W - this.w + overflow);

      if (this.slowTimer>0) this.slowTimer -= dt;
      if (this.squashTimer>0) this.squashTimer -= dt;
    }
    draw(g){
    const maxH = this.spriteHCapPx || this.h;
    const h = Math.min(this.h, maxH);
    const w = this.w;
    const x = this.x;
    const y = this.y;

    // facteur d'échelle en fonction de l'impact
    // vertical: on compresse en hauteur (rebond vers le bas)
    // horizontal: on étire en largeur (effet dash)
    let sx = 1, sy = 1;
    if (this.impactDir === 'vertical'){
      sx = 1 + 0.18 * this.impact;
      sy = 1 - 0.28 * this.impact;
    } else {
      sx = 1 + 0.25 * this.impact;
      sy = 1 - 0.12 * this.impact;
    }

    g.save();

    // point d'ancrage au centre du rectangle de destination
    const cx = Math.round(x + w/2);
    const cy = Math.round(y + h/2);
    g.translate(cx, cy);
    g.scale(sx, sy);
    g.translate(-cx, -cy);

    // ombre douce (optionnelle)
    g.shadowColor = 'rgba(0,0,0,0.25)';
    g.shadowBlur = 6;
    g.shadowOffsetY = 2;

    // dessiner le PNG ajusté aux dimensions w × h
    // (si tu veux le “gonfler” en largeur: augmente w dans applyCaps())
    g.drawImage(walletImg, Math.round(x), Math.round(y), w, h);


    g.restore();

}

  }

  // Arm (bras + pince lissés)
  class Arm{
  constructor(game){
    this.g = game;
    this.t = 0;             // timer d'anim (pincée)
    this.frame = 0;         // 0..1 (open/pinch)
    this.handX = BASE_W/2;  // position horizontale de la main
    this.spriteHCapPx = 0;

    // Mouvement autonome
    this.targetX = BASE_W/2;
    this.moveSpeed = 120;
    this.retarget = 0;
    this.jitterAmt = 0.05;

    // Dimensions de rendu calculées à chaque frame (pour spawn/limites)
    this._drawW = 90;
    this._drawH = 90;
    this._x = 0;
    this._y = 0;
  }

  applyCaps(){
    const maxH = Math.floor(BASE_H * CONFIG.maxTopActorH);
    this.h = Math.min(Math.floor(BASE_H * 0.19), maxH); // ≤20%
  }

  update(dt){
    // Animation 2 frames
    this.t += dt;
    if (this.t > 0.2){ this.t = 0; this.frame = (this.frame + 1) % 2; }

    // Re-ciblage horizontal
    this.retarget -= dt;
    const padding = 16;

    // largeur approximative avant d'avoir le PNG chargé
    const approxW = this._drawW || 90;
    const halfW = approxW / 2;
    const minX = padding + halfW;
    const maxX = BASE_W - (padding + halfW);

    if (this.retarget <= 0){
      const maxStep = 140;
      const next = clamp(this.handX + rand(-maxStep, maxStep), minX, maxX);
      this.targetX = next;
      this.retarget = rand(0.6, 1.8);
    }

    const dir = Math.sign(this.targetX - this.handX);
    this.handX += dir * this.moveSpeed * dt;

    // micro jitter
    this.handX = clamp(this.handX + rand(-this.jitterAmt, this.jitterAmt), minX, maxX);

    if (Math.abs(this.targetX - this.handX) < 2) this.handX = this.targetX;
  }

  draw(g){
    const maxH = Math.floor(BASE_H * CONFIG.maxTopActorH);
    const targetH = Math.min(this.h, maxH);  // hauteur disponible (zone "bras")
    const y = 13;                              // léger padding haut

    // Sélection de frame
    const img = (this.frame === 0 ? Hand.open : Hand.pinch);

    // Si les images ne sont pas encore prêtes, on ne dessine rien (ou un placeholder)
    if (!Hand.ready || !img || !(img.naturalWidth > 0)) {
      this._drawW = 90; this._drawH = targetH; // fallback pour les bornes
      const w = this._drawW;
      const x = clamp(this.handX - w/2, 10, BASE_W - w - 10);
      this._x = x; this._y = y;
      return;
    }

    // --- Mise à l'échelle proportionnelle pour occuper toute la hauteur cible ---
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    const scale = targetH / natH;
    const drawW = natW * scale;     // conserve le ratio
    const drawH = natH * scale;     // = targetH (plein hauteur)

    // Centrer la main autour de handX, en respectant les bords
    const x = clamp(this.handX - drawW/2, 10, BASE_W - drawW - 10);

    g.save();
    g.imageSmoothingEnabled = true; // rendu lisse
    const drawX = Math.round(x);
    const drawY = Math.round(y);
    g.drawImage(img, drawX, drawY, drawW, drawH);
    g.restore();

    // Mémoriser pour spawn/limites
    this._drawW = drawW;
    this._drawH = drawH;
    this._x = drawX;
    this._y = drawY;
  }

  // Les objets spawnent près du bout des doigts (bord droit de l'image)
  spawnX(){ 
  // pointe des doigts, sans jitter
  return clamp((this._x||0) + (this._drawW||90) - 133, 16, BASE_W - 16);
}
spawnY(){ 
  // juste sous la main
  return (this._y||0) + (this._drawH||48) - 112;
}

}


  // Items
  class FallingItem{
  constructor(game, kind, subtype, x, y){
    this.g = game;
    this.kind = kind;
    this.subtype = subtype;
    this.x = x; 
    this.y = y;
    this.vx = rand(-20, 20);
    this.vy = rand(10, 40);

    // tailles de base (taille finale visée)
    this.baseW = 14;
    this.baseH = 14;

    // overrides par sous-type
    if (this.kind === 'good') {
      if (this.subtype === 'bronze')  { this.baseW = 18; this.baseH = 18; }
      if (this.subtype === 'silver')  { this.baseW = 18; this.baseH = 18; }
      if (this.subtype === 'gold')    { this.baseW = 18; this.baseH = 18; }
      if (this.subtype === 'diamond') { this.baseW = 18; this.baseH = 18; }
    }
    if (this.subtype === 'bomb') { this.baseW = 18; this.baseH = 18; }

    const itemCfg = CONFIG.items || {};
    const finalScale = (itemCfg.scale != null) ? itemCfg.scale : 1;
    this.baseW *= finalScale;
    this.baseH *= finalScale;

    const baseCenterX = this.x + this.baseW / 2;
    const baseCenterY = this.y + this.baseH / 2;

    this.spawnScale = (itemCfg.spawnScale != null) ? itemCfg.spawnScale : 1;
    this.targetScale = 1;
    this.growthDistance = (itemCfg.growDistance != null) ? itemCfg.growDistance : (BASE_H * 0.5);
    this.scale = this.spawnScale;

    this.w = this.baseW * this.scale;
    this.h = this.baseH * this.scale;
    this.x = baseCenterX - this.w / 2;
    this.y = baseCenterY - this.h / 2;
    this.spawnCenterY = baseCenterY;

    this.dead = false;
    this.spin = rand(-3, 3);
    this.magnet = false;
    this.t = 0;
  }

  baseGravity(){
    if (this.kind==='good') return CONFIG.gravity.good;
    if (this.kind==='bad')  return CONFIG.gravity.bad;
    return CONFIG.gravity.power;
  }
 


  update(dt){
    this.t+=dt;
    this.vy += this.baseGravity()*dt*(1 + (this.g.timeElapsed/60)*0.2);
    this.x += this.vx*dt;
    this.y += this.vy*dt;

    if (this.g.effects.magnet>0 && this.kind==='good'){
      const wx = this.g.wallet.x + this.g.wallet.w/2;
      const dx = wx - (this.x+this.w/2);
      this.vx += clamp(dx*2, -140, 140)*dt;
    }

    const centerX = this.x + this.w/2;
    const centerY = this.y + this.h/2;
    const growDist = Math.max(1, this.growthDistance);
    const fallen = centerY - this.spawnCenterY;
    const progress = clamp(fallen / growDist, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 2); // easeOutQuad
    this.scale = lerp(this.spawnScale, this.targetScale, eased);

    this.w = this.baseW * this.scale;
    this.h = this.baseH * this.scale;
    this.x = centerX - this.w/2;
    this.y = centerY - this.h/2;

    if (this.y > BASE_H+50) this.dead=true;
  }

  draw(g){
    const x=this.x, y=this.y, w=this.w, h=this.h;

    g.save();
    g.shadowColor = 'rgba(0,0,0,0.15)';
    g.shadowBlur = 4;
    g.shadowOffsetY = 1;

    if (this.kind === 'good') {

      // GOLD en priorité : si l'image est prête → on la dessine et on sort

      if (this.subtype === 'bronze' && bronzeReady) {
        drawImgCrisp(g, BronzeImg, x, y, w, h);
        g.restore();
        return;
      }

      if (this.subtype === 'silver' && silverReady) {
        drawImgCrisp(g, SilverImg, x, y, w, h);
        g.restore();
        return;
      }

      if (this.subtype === 'gold' && goldReady) {
        drawImgCrisp(g, GoldImg, x, y, w, h);
        g.restore();
        return;
      }

      if (this.subtype === 'diamond' && diamondReady) {
        drawImgCrisp(g, DiamondImg, x, y, w, h);
        g.restore();
        return;
      }

      // Fallback (ou autres sous-types bronze/silver/diamond)
      let base = '#ffcd75';
      if (this.subtype === 'bronze')  base = '#c07a45';
      else if (this.subtype === 'silver')  base = '#cfd6e6';
      else if (this.subtype === 'gold')    base = '#f2c14e'; // si l'image pas prête
      else if (this.subtype === 'diamond') base = '#a8e6ff';

      const cx = Math.round(x + w/2);
      const cy = Math.round(y + h/2);
      const r = Math.floor(Math.min(w, h)/2);
      g.fillStyle = base;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2); g.fill();

      const grad = g.createRadialGradient(cx-2, cy-2, 1, cx, cy, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.8)');
      grad.addColorStop(0.4, 'rgba(255,255,255,0.0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2); g.fill();

      g.restore();
      return;

    } else if (this.kind==='bad'){
      // ✅ toute la logique des "bad" RESTE dans ce bloc
      if (this.subtype==='bomb'){
        if (bombReady){
          const pad = 1;
          drawImgCrisp(g, BombImg, x - pad, y - pad, w + pad*2, h + pad*2);
        } else {
          // fallback vectoriel si l'image n'est pas encore chargée
          const cx = Math.round(x + w/2);
          const cy = Math.round(y + h/2);
          const r = Math.floor(Math.min(w, h)/2);
          g.fillStyle = '#3b3b3b';
          g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2); g.fill();
          g.fillStyle = '#f4a261';
          const [rx, ry, rw, rh] = snapR(x + w/2 + 2, y - 2, 3, 8);
          g.fillRect(rx, ry, rw, rh);
        }

      } else if (this.subtype==='shitcoin'){
        const cx = Math.round(x + w/2);
        const cy = Math.round(y + h/2);
        const r = Math.floor(Math.min(w, h)/2);
        g.fillStyle = '#8a6b3a';
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2); g.fill();

      } else if (this.subtype==='anvil'){
        g.fillStyle = '#60656f';
        g.beginPath();
        g.moveTo(snap(x+2), snap(y+h*0.7));
        g.lineTo(snap(x+w-2), snap(y+h*0.7));
        g.lineTo(snap(x+w*0.7), snap(y+h*0.4));
        g.lineTo(snap(x+w*0.3), snap(y+h*0.4));
        g.closePath();
        g.fill();

      } else if (this.subtype==='rugpull'){
        const cx = Math.round(x + w/2);
        const cy = Math.round(y + h/2);
        const rx = Math.floor(w/2);
        const ry = Math.floor(h/2);
        g.fillStyle = '#4a3d7a';
        g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); g.fill();

      } else if (this.subtype==='fakeAirdrop'){
        const cx = Math.round(x + w/2);
        const cy = Math.round(y + h/2);
        const rx = Math.floor(w/2);
        const ry = Math.floor(h/2);
        g.fillStyle = '#6b7cff';
        g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); g.fill();
        g.fillStyle = '#ffffff';
        const [rx2, ry2, rw2, rh2] = snapR(cx - 3, cy - 3, 6, 6);
        g.fillRect(rx2, ry2, rw2, rh2);
      }

    } else {
      // powerups
      const cap = (color)=>{
        g.fillStyle=color; const r=6; g.beginPath();
        g.moveTo(x+r, y); g.lineTo(x+w-r, y);
        g.quadraticCurveTo(x+w, y, x+w, y+r);
        g.lineTo(x+w, y+h-r); g.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
        g.lineTo(x+r, y+h); g.quadraticCurveTo(x, y+h, x, y+h-r);
        g.lineTo(x, y+r); g.quadraticCurveTo(x, y, x+r, y); g.closePath(); g.fill();
      };

      if (this.subtype==='magnet'){ cap('#2ecc71'); }
      else if (this.subtype==='x2'){
        cap('#00d1ff');
        g.fillStyle='#fff';
        const [rx3, ry3, rw3, rh3] = snapR(x + w/2 - 4, y + h/2 - 4, 8, 8);
        g.fillRect(rx3, ry3, rw3, rh3);
      }
      else if (this.subtype==='shield'){ cap('#66a6ff'); }
      else if (this.subtype==='timeShard'){ cap('#9ff'); }
    }

    g.restore();
  }
}


  class Spawner{
    constructor(game){ this.g=game; this.acc=0; }
    update(dt){ const diff = this.g.diffMult(); this.acc += dt * (CONFIG.baseSpawnPerSec * diff);
      while (this.acc >= 1){ this.spawnOne(); this.acc -= 1; }
    }
    spawnOne(){
      const x = this.g.arm.spawnX();
      const y = this.g.arm.spawnY();
      let pGood=0.7, pBad=0.2, pPow=0.1;
      if (this.g.timeElapsed>30){ pGood=0.6; pBad=0.3; pPow=0.1; }
      const r = Math.random();
      if (r < pGood){
        const rar = CONFIG.rarity; const sub = choiceWeighted([
          {k:'bronze', w:rar.bronze}, {k:'silver', w:rar.silver}, {k:'gold', w:rar.gold}, {k:'diamond', w:rar.diamond}
        ]);
        this.g.items.push(new FallingItem(this.g,'good',sub,x,y));
      } else if (r < pGood + pBad){
        const bw = CONFIG.badWeights; const sub = choiceWeighted([
          {k:'bomb', w: bw.bomb*(this.g.timeElapsed>30?1.2:1)},
          {k:'shitcoin', w:bw.shitcoin}, {k:'anvil', w:bw.anvil}, {k:'rugpull', w:bw.rugpull}, {k:'fakeAirdrop', w:bw.fakeAirdrop}
        ]);
        this.g.items.push(new FallingItem(this.g,'bad',sub,x,y));
      } else {
        const pu = choiceWeighted([{k:'magnet',w:1},{k:'x2',w:1},{k:'shield',w:1},{k:'timeShard',w:1}]);
        this.g.items.push(new FallingItem(this.g,'power',pu,x,y));
      }
    }
  }

  class HUD{
    constructor(game){ this.g=game; }
    draw(g){
      const P = this.g.palette;
      g.save();

      const topCap = Math.floor(BASE_H * CONFIG.maxTopActorH);
      const BAR_H = 28;
      const barY  = topCap + 2;

      g.fillStyle = P[0];
      g.fillRect(0, barY, BASE_W, BAR_H);

      g.fillStyle = P[4];
      g.font = '12px monospace';
      g.textBaseline = 'top';

      const ty = barY + 10;

      const s = `SCORE ${this.g.score|0}`;
      const t = `TIME ${(Math.max(0,this.g.timeLeft)).toFixed(0)}s`;
      const v = `LIVES ${'♥'.repeat(this.g.lives)}`;
      const c = `COMBO x${this.g.comboMult.toFixed(1)} (${this.g.comboStreak|0})`;

      g.fillText(s, 6, ty);
      g.fillText(v, 100, ty);
      g.fillText(t, 300, ty);
      g.fillText(c, 190, ty);

      let ex = 6, ey = barY + BAR_H + 4;
      const iconSize = 10;
      const icon = (label, active, timer)=>{
        if (!active) return;
        g.fillStyle = P[5];
        g.fillRect(ex, ey, iconSize, iconSize);
        g.fillStyle = P[0];
        g.fillText(label, ex + iconSize + 4, ey - 1);
        g.fillStyle = P[4];
        g.fillText((timer>0?timer.toFixed(0)+'s':'1x'), ex + iconSize + 42, ey - 1);
        ey += iconSize + 4;
      };

      icon('MAG', this.g.effects.magnet>0, this.g.effects.magnet);
      icon('x2',  this.g.effects.x2>0,     this.g.effects.x2);
      icon('SHD', this.g.effects.shield>0, 1);
      if (this.g.effects.freeze>0){
        g.fillStyle = P[2];
        g.fillRect(ex, ey, iconSize, iconSize);
        g.fillStyle = P[4];
        g.fillText('FRZ', ex + iconSize + 4, ey - 1);
        g.fillText(this.g.effects.freeze.toFixed(0)+'s', ex + iconSize + 40, ey - 1);
      }

      g.restore();
    }
  }

  class Game{
    static instance = null;
    constructor(){ Game.instance=this; this.reset({ showTitle: true }); }
    reset({ showTitle = true } = {}){
      this.settings = loadSettings();
      document.documentElement.classList.toggle('contrast-high', !!this.settings.contrast);
      this.palette = CONFIG.palette.slice(); if (this.settings.contrast){ this.palette = ['#000','#444','#ff0044','#ffaa00','#ffffff','#00ffea','#00ff66','#66a6ff']; }

      const u = new URLSearchParams(location.search); const seed = u.get('seed');
      this.random = seed? seededRandom(parseInt(seed)||1): Math.random;

      this.state='title';
      this.audio = new AudioSys(); this.audio.enabled = !!this.settings.sound;
      this.skipFirstCatchSounds = 2;
      this.fx = new ParticleSys();

      this.timeLeft = CONFIG.runSeconds; this.timeElapsed=0;
      this.lives = CONFIG.lives; this.score = 0; this.comboStreak=0; this.comboMult=1; this.maxCombo=0; this.levelReached=1;

      this.arm = new Arm(this); this.arm.applyCaps();
      this.wallet = new Wallet(this); this.wallet.applyCaps();
      this.hud = new HUD(this);
      this.spawner = new Spawner(this);
      this.items = [];
      this.effects = { magnet:0, x2:0, shield:0, freeze:0 };
      this.shake=0;
      this.bgIndex = 0;
      this.didFirstCatch = false;
      this.updateBgByScore();

      console.log('[STATE] reset -> title');
      //this.renderTitle();
	  if (showTitle) this.renderTitle();
    }

    playSfx(fn){
      if (this.skipFirstCatchSounds > 0){
        this.skipFirstCatchSounds--;
        return;
      }
      fn?.();
    }

    diffMult(){
      const r = 1 * Math.pow(CONFIG.spawnRampFactor, Math.floor(this.timeElapsed/CONFIG.spawnRampEverySec));
      return r;
    }

    updateBgByScore(){ const th=CONFIG.evolveThresholds; let idx=0; for (let i=0;i<th.length;i++){ if (this.score>=th[i]) idx=i; }
      if (idx!==this.bgIndex){ this.bgIndex=idx; this.wallet.evolveByScore(this.score); this.levelReached = Math.max(this.levelReached, this.wallet.level); }
    }

    start(){
      this.state='playing';
      this.lastTime = performance.now();
      // Anti double-clic/visibility au démarrage
      this.ignoreClicksUntil = this.lastTime + 500;      // 0.5s
      this.ignoreVisibilityUntil = this.lastTime + 1000; // 1s
      console.log('[STATE] start -> playing');
      this.loop();
    }

    loop(){
      if (this.state==='playing'){
        const now=performance.now();
        const dt = Math.min(0.033, (now-this.lastTime)/1000);
        this.lastTime=now;
        this.step(dt);
        this.render();
        requestAnimationFrame(()=>this.loop());
      }
    }

    step(dt){
      this.timeElapsed += dt;
      if (this.timeLeft>0) this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft<=0 || this.lives<=0){
        this.endGame(); return;
      }

      this.arm.update(dt);
      this.wallet.update(dt);

      this.spawner.update(dt);
      for (const it of this.items) it.update(dt);

      const w = this.wallet;
const cx = CONFIG.collision.walletScaleX;
const cy = CONFIG.collision.walletScaleY;
const px = CONFIG.collision.walletPadX;
const py = CONFIG.collision.walletPadY;

// hitbox réduite + centrée, puis décalée par les pads
const wr = {
  x: w.x + (w.w - w.w * cx) / 2 + px,
  y: w.y + (w.h - w.h * cy) / 2 + py,
  w: w.w * cx,
  h: w.h * cy
};

for (const it of this.items){
  if (it.dead) continue;
  if (checkAABB(wr, { x: it.x, y: it.y, w: it.w, h: it.h })){
    this.onCatch(it);
    it.dead = true;
  }
}
      this.items = this.items.filter(i=>!i.dead);

      for (const k of ['magnet','x2','freeze']){ if (this.effects[k]>0) this.effects[k]-=dt; if (this.effects[k]<0) this.effects[k]=0; }

      this.updateBgByScore();

      if (this.shake>0) this.shake = Math.max(0, this.shake - dt*6);

      
    }

    onCatch(it){
      const firstCatch = !this.didFirstCatch;

      if (it.kind === 'good'){
        // rebond doux
        this.wallet.bump(0.35, 'vertical');

        let pts = CONFIG.score[it.subtype] || 0;
        if (this.effects.freeze>0){
          this.fx.burst(it.x,it.y,'#88a', 4);
          this.playSfx(()=> this.audio.bad());
          this.didFirstCatch = true;
          return;
        }
        if (this.effects.x2>0) pts *= 2;

        this.comboStreak += 1;
        if (this.comboStreak % CONFIG.combo.step === 0){
          this.comboMult = Math.min(CONFIG.combo.maxMult, this.comboMult+1);
        }
        this.maxCombo = Math.max(this.maxCombo, this.comboStreak);
        pts = Math.floor(pts * this.comboMult);
        this.score += pts;

        this.fx.burst(it.x,it.y,'#a7f070', 6);
        this.playSfx(()=> this.audio.good());
        if (this.settings.haptics && !firstCatch) haptic(8);

      } else if (it.kind === 'bad'){
        // gros rebond "ouch"
        if (it.subtype==='bomb'){
          this.wallet.bump(0.65, 'vertical');
        } else if (it.subtype==='anvil'){
          this.wallet.bump(0.55, 'vertical');
        } else if (it.subtype==='shitcoin' || it.subtype==='rugpull'){
          this.wallet.bump(0.40, 'vertical');
        } else {
          this.wallet.bump(0.35, 'vertical');
        }

        if (this.effects.shield>0){
          this.effects.shield=0;
          this.fx.burst(it.x,it.y,'#66a6ff', 8);
          this.playSfx(()=> this.audio.pow());
          this.didFirstCatch = true;
          return;
        }

        // reset combo
        this.comboStreak = 0;
        this.comboMult = 1;

        if (it.subtype==='bomb'){
          this.lives -= 1;
          this.shake = 0.8;
          this.playSfx(()=> this.audio.bad());
          if (this.settings.haptics && !firstCatch) haptic(40);
        } else if (it.subtype==='shitcoin'){
          this.score += CONFIG.score.bad.shitcoin;
          this.playSfx(()=> this.audio.bad());
        } else if (it.subtype==='anvil'){
          this.score += CONFIG.score.bad.anvil;
          this.wallet.slowTimer = 2.0;
          this.playSfx(()=> this.audio.bad());
        } else if (it.subtype==='rugpull'){
          const delta = Math.floor(this.score * CONFIG.score.rugpullPct);
          this.score = Math.max(0, this.score + delta);
          this.playSfx(()=> this.audio.bad());
        } else if (it.subtype==='fakeAirdrop'){
          this.effects.freeze = 3.0;
          this.playSfx(()=> this.audio.bad());
        }

      } else if (it.kind === 'power'){
        // petit pulse horizontal
        this.wallet.bump(0.25, 'horizontal');

        if (it.subtype==='magnet'){ this.effects.magnet = CONFIG.powerups.magnet; this.playSfx(()=> this.audio.pow()); }
        else if (it.subtype==='x2'){ this.effects.x2 = CONFIG.powerups.x2; this.playSfx(()=> this.audio.pow()); }
        else if (it.subtype==='shield'){ this.effects.shield = 1; this.playSfx(()=> this.audio.pow()); }
        else if (it.subtype==='timeShard'){ this.timeLeft = Math.min(CONFIG.runSeconds, this.timeLeft + 5); this.playSfx(()=> this.audio.pow()); }

        this.fx.burst(it.x,it.y,'#ffcd75', 10);
      }

      this.didFirstCatch = true;
    }

    endGame(){
      this.state='over';
      console.log('[STATE] endGame -> over');
      this.render();
      try{
        const best = parseInt(localStorage.getItem(LS.bestScore)||'0',10); if (this.score>best) localStorage.setItem(LS.bestScore, String(this.score));
        const bestC = parseInt(localStorage.getItem(LS.bestCombo)||'0',10); if (this.maxCombo>bestC) localStorage.setItem(LS.bestCombo, String(this.maxCombo));
        const runs = JSON.parse(localStorage.getItem(LS.runs)||'[]'); runs.unshift({ ts:Date.now(), score:this.score, combo:this.maxCombo, lvl:this.levelReached }); while (runs.length>20) runs.pop(); localStorage.setItem(LS.runs, JSON.stringify(runs));
      }catch(e){}
      this.renderGameOver();
      if (TG){ try{ TG.sendData(JSON.stringify({ score:this.score, duration:CONFIG.runSeconds, version:VERSION })); }catch(e){} }
    }

    uiStartFromTitle(){
      if (this.state==='title'){
        overlay.innerHTML='';
        this.start();
      }
    }

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
      document.getElementById('btnSettings').onclick = ()=> this.renderSettings();
      document.getElementById('btnLB').onclick = ()=> this.renderLeaderboard();
      // Play: bloque la propagation pour éviter le clic fantôme sur le canvas
      document.getElementById('btnPlay').addEventListener('click', async (e)=>{
        e.preventDefault();
        e.stopPropagation();

        // --- WARM-UP AUDIO
        await this.audio.warmup();
        await new Promise(r=>requestAnimationFrame(r));

        // --- WARM-UP GRAPHICS (force la création des pipelines/shaders)
        try{
          const prev = ctx.imageSmoothingEnabled;
          ctx.imageSmoothingEnabled = false;
          const imgs = [walletImg, GoldImg, SilverImg, BronzeImg, DiamondImg, BombImg, Hand.open, Hand.pinch];
          for (const im of imgs){ if (im && im.naturalWidth) ctx.drawImage(im, 0, 0, 1, 1); }
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(4,4,2,0,Math.PI*2); ctx.fill();
          ctx.restore();
          ctx.imageSmoothingEnabled = prev;
          ctx.clearRect(0,0,8,8);
        }catch(_){ }

        this.uiStartFromTitle();
      }, {passive:false});
    }

    renderSettings(){ const s=this.settings;
      overlay.innerHTML = `
      <div class="panel">
        <h1>Paramètres</h1>
        <p><label><input type="checkbox" id="sound" ${s.sound?'checked':''}/> Son</label></p>
        <p><label><input type="checkbox" id="contrast" ${s.contrast?'checked':''}/> Contraste élevé</label></p>
        <p><label><input type="checkbox" id="haptics" ${s.haptics?'checked':''}/> Vibrations</label></p>
        <p>Sensibilité: <input type="range" id="sens" min="0.5" max="1.5" step="0.05" value="${s.sensitivity}"></p>
        <div class="btnrow">
          <button id="back">Retour</button>
        </div>
      </div>`;
      document.getElementById('sound').onchange = e=>{ this.settings.sound = e.target.checked; this.audio.enabled = this.settings.sound; saveSettings(this.settings); };
      document.getElementById('contrast').onchange = e=>{ this.settings.contrast = e.target.checked; saveSettings(this.settings); this.reset(); };
      document.getElementById('haptics').onchange = e=>{ this.settings.haptics = e.target.checked; saveSettings(this.settings); };
      document.getElementById('sens').oninput = e=>{ this.settings.sensitivity = parseFloat(e.target.value); saveSettings(this.settings); };
      document.getElementById('back').onclick = ()=> this.renderTitle();
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
      document.getElementById('back').onclick = ()=> this.renderTitle();
    }

    renderPause(){
      overlay.innerHTML = `<div class="panel"><h1>Pause</h1><div class="btnrow"><button id="resume">Reprendre</button><button id="quit">Menu</button></div></div>`;
      document.getElementById('resume').onclick = ()=>{
        overlay.innerHTML='';
        this.state='playing';
        this.lastTime=performance.now();
        console.log('[STATE] resume -> playing');
        this.loop();
      };
      document.getElementById('quit').onclick = ()=>{ console.log('[STATE] quit -> reset'); this.reset(); };
    }

    renderGameOver(){
      const best = parseInt(localStorage.getItem(LS.bestScore)||'0',10);
      overlay.innerHTML = `
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
      document.getElementById('again').onclick = ()=>{
  overlay.innerHTML = '';
  this.reset({ showTitle: false }); // ne pas réafficher l'écran titre
  this.start();
};

      document.getElementById('menu').onclick = ()=>{
  this.reset({ showTitle: true }); // retour au menu
};
document.getElementById('quit').onclick = ()=>{
  this.reset({ showTitle: true });
};
      if (TG){ document.getElementById('share').onclick = ()=>{ try{ TG.sendData(JSON.stringify({ score:this.score, duration:CONFIG.runSeconds, version:VERSION })); }catch(e){} }; }
    }

    drawBg(g){
      const grad = g.createLinearGradient(0, 0, 0, BASE_H);
      const presets = [
        ['#0f2027', '#203a43', '#2c5364'],
        ['#232526', '#414345', '#6b6e70'],
        ['#1e3c72', '#2a5298', '#6fa3ff'],
        ['#42275a', '#734b6d', '#b57ea7'],
        ['#355c7d', '#6c5b7b', '#c06c84']
      ];
      const cols = presets[this.bgIndex % presets.length];
      grad.addColorStop(0,   cols[0]);
      grad.addColorStop(0.5, cols[1]);
      grad.addColorStop(1,   cols[2]);
      g.fillStyle = grad;
      g.fillRect(0, 0, BASE_W, BASE_H);
    }

    render(){
      const sx = this.shake>0? Math.round(rand(-2,2)):0; const sy = this.shake>0? Math.round(rand(-2,2)):0;
      ctx.save(); ctx.clearRect(0,0,BASE_W,BASE_H);
      ctx.translate(sx, sy);

      this.drawBg(ctx);

// Arm en haut
this.arm.draw(ctx);

// Wallet d'abord
this.wallet.draw(ctx);

// Items ensuite → passent PAR-DESSUS le wallet
for (const it of this.items) it.draw(ctx);

// (Optionnel) Particules au-dessus de tout le gameplay
this.fx.update(1/60); this.fx.render(ctx);

// HUD en dernier (reste au-dessus)
this.hud.draw(ctx);


      ctx.restore();
    }
  }

  // AABB collision
  function checkAABB(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }

  // Global game instance
  const game = new Game();

  // Debounce visibilitychange (évite pause juste après Start)
  document.addEventListener('visibilitychange', ()=>{
    if (document.hidden && game.state==='playing'){
      const now = performance.now();
      if (game.ignoreVisibilityUntil && now < game.ignoreVisibilityUntil){
        console.log('[VISIBILITY] ignoré juste après start');
        return;
      }
      console.log('[STATE] visibility -> paused');
      game.state='paused';
      game.renderPause();
    }
  });

  // Clic coin haut-droit pour pause (robuste + anti double-clic)
  canvas.addEventListener('click', (e)=>{
    if (game.state!=='playing') return;

    const now = performance.now();
    if (game.ignoreClicksUntil && now < game.ignoreClicksUntil){
      console.log('[CLICK] ignoré (anti-ghost)');
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width)  * BASE_W;
    const y = ((e.clientY - rect.top)  / rect.height) * BASE_H;

    if (y < 40 && x > BASE_W - 80){
      console.log('[STATE] click pause hotspot -> paused');
      game.state='paused';
      game.renderPause();
    }
  });

  // Sécurité: empêcher qu’un clic sur "Jouer" (overlay) se propage au canvas
  document.addEventListener('click', (e)=>{
    if (e.target && e.target.id==='btnPlay'){
      e.preventDefault();
      e.stopPropagation();
      game.uiStartFromTitle();
    }
  }, {capture:true});

  // Kick draw title once
  game.render();
  
