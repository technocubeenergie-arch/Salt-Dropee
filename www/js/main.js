// ================================
// Salt Droppee — script.js (patched 2025‑09‑23)
// ================================

// --- Détection d'input & utilitaire cross-platform
const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const gsap = window.gsap;

// ---- HUD CONFIG (barre compacte) ----
const HUD_CONFIG = {
  // Hauteur de la barre = 7–9% de l’écran
  barHFracMin: 0.07,  // 7%
  barHFracMax: 0.09,  // 9%
  padX: 12,           // marge latérale interne
  padY: 8,            // marge verticale interne
  radius: 10,         // coins arrondis
  bg: "rgba(0,0,0,0.28)",

  // Tailles de police (canvas, pas CSS clamp → on calcule)
  fontMin: 12,
  fontMax: 18,
  fontVwPct: 0.026,   // ~2.6vw

  // Taille icônes/éléments
  heartSize: 16,
  bonusIconSize: 16,
  gap: 10,

  // Combo couleurs par palier
  comboColors: {
    "1.0": "#8aa0b3", // bleu/gris
    "1.5": "#3ddc97", // vert
    "2.0": "#ffc94a", // or
    "3.0": "#ff5ad9", // magenta/néon
    "4.0": "#ff5ad9"  // cap≥3.0 = même magenta
  },

  // Jauge combo (2–3 px)
  gaugeH: 3,
  gaugeBg: "rgba(255,255,255,0.15)",

  // Animations (durées légères)
  anim: {
    popDur: 0.15,
    flashDur: 0.18
  }
};

// Utils nécessaires au HUD
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

// Approche “clamp canvas” (pas CSS) pour la taille de police
function hudFontSize(baseW) {
  const vw = baseW * HUD_CONFIG.fontVwPct; // ex. 2.6% de largeur
  return clamp(Math.round(vw), HUD_CONFIG.fontMin, HUD_CONFIG.fontMax);
}

// Abréviation score (12.3k / 1.2M)
function abbr(n) {
  if (n >= 1e9) return (n/1e9).toFixed(1).replace(/\.0$/,'') + "B";
  if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'') + "M";
  if (n >= 1e5) return (n/1e3).toFixed(1).replace(/\.0$/,'') + "k";
  return n.toLocaleString();
}

function formatScore(value){
  const num = Math.round(Number.isFinite(value) ? value : Number(value) || 0);
  if (num === 0) return '0';
  if (num < 0) return '-' + abbr(Math.abs(num));
  return abbr(num);
}

function setHUDScore(v){
  const el = document.getElementById('hudScore');
  if (el) el.textContent = formatScore(v);
}
function setHUDCombo(mult, streak){
  const multEl = document.getElementById('hudComboMult');
  const streakEl = document.getElementById('hudComboStreak');
  if (multEl) multEl.textContent = 'x' + Number(mult ?? 0).toFixed(1);
  if (streakEl) streakEl.textContent = '(' + Math.max(0, Math.floor(Number(streak) || 0)) + ')';
}
function setHUDComboProgress(p){ // p: 0..1
  const fill = document.getElementById('hudComboFill');
  if (!fill) return;
  const pct = (Math.max(0, Math.min(1, Number.isFinite(p) ? p : Number(p) || 0)) * 100).toFixed(0) + '%';
  fill.style.width = pct;
}
function setHUDLives(n){
  const livesEl = document.getElementById('hudLives');
  if (livesEl) livesEl.textContent = '♥'.repeat(Math.max(0, (Number.isFinite(n) ? n : Number(n) || 0) | 0));
}
function setHUDTime(s){
  const timeEl = document.getElementById('hudTime');
  if (timeEl) timeEl.textContent = Math.max(0, (Number.isFinite(s) ? s : Number(s) || 0) | 0) + 's';
}

function updateComboChipVisual(color){
  const chip = document.getElementById('hudComboChip');
  if (chip){
    const scale = Number.isFinite(comboVis.scale) ? comboVis.scale : 1;
    chip.style.transform = `scale(${scale.toFixed(3)})`;
    const flash = clamp(Number.isFinite(comboVis.flash) ? comboVis.flash : 0, 0, 1);
    const base = 0.12;
    const bgAlpha = clamp(base + flash * 0.35, base, 0.6);
    chip.style.backgroundColor = `rgba(255,255,255,${bgAlpha.toFixed(3)})`;
    chip.style.boxShadow = flash > 0.01 ? `0 0 ${Math.round(12 + flash * 10)}px rgba(255,255,255,${(0.45 * flash).toFixed(2)})` : '';
  }
  const fill = document.getElementById('hudComboFill');
  if (fill && color) fill.style.background = color;
  const multEl = document.getElementById('hudComboMult');
  if (multEl && color) multEl.style.color = color;
}

// Tiers & progression
const comboTiers = [
  { min: 0,  mult: 1.0 },
  { min: 5,  mult: 1.5 },
  { min: 10, mult: 2.0 },
  { min: 20, mult: 3.0 },
  { min: 35, mult: 4.0 } // cap
];
function currentTier(streak) { return comboTiers.filter(t => streak >= t.min).pop(); }
function nextTier(streak) {
  const cur = currentTier(streak);
  const idx = comboTiers.findIndex(t => t === cur);
  return comboTiers[Math.min(idx + 1, comboTiers.length - 1)];
}
function progressToNext(streak) {
  const cur = currentTier(streak), nxt = nextTier(streak);
  if (nxt.min === cur.min) return 1;
  return clamp((streak - cur.min) / (nxt.min - cur.min), 0, 1);
}

// État visuel combo (pour GSAP)
const comboVis = {
  scale: 1,
  flash: 0
};

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
const x2Image = new Image();
x2Image.src = 'assets/x2.png';
const ShieldImg = new Image(); let shieldReady = false; ShieldImg.onload = ()=> shieldReady = true; ShieldImg.src = 'assets/shield.png';
const shieldIconImage = new Image(); shieldIconImage.src = 'assets/shield.png';
const TimeImg   = new Image(); let timeReady   = false; TimeImg.onload   = ()=> timeReady   = true; TimeImg.src   = 'assets/time.png';

const BonusIcons = {
  magnet: MagnetImg,
  x2: X2Img,
  shield: ShieldImg,
};

// Types négatifs du projet
const NEGATIVE_TYPES = new Set([
  "bomb",
  "shitcoin",
  "rugpull",
  "fakeAirdrop",
  "anvil"
]);

let activeBonuses = {
  magnet: { active: false, timeLeft: 0 },
  x2: { active: false, timeLeft: 0 }
};

let shield = {
  count: 0,
  active: false,
  _effect: null
};

let shieldConsumedThisFrame = false;

function startBonusEffect(type) {
  const walletRef = game?.wallet;
  const fx = game?.fx;
  if (!walletRef || !fx) return;

  switch (type) {
    case "magnet":
      fxMagnetActive(walletRef, fx);
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => playSound("magnetat"));
      } else {
        playSound("magnetat");
      }
      break;
    case "x2":
      showX2Animation();
      break;
  }
}

function showX2Animation() {
  if (!x2Image.complete) return;

  const walletRef = game?.wallet;
  const fxManager = game?.fx;
  if (!walletRef || !fxManager || !gsap?.to) return;

  const x = walletRef.x + walletRef.w / 2;
  const y = walletRef.y - 60;
  const baseSize = 80;

  const anim = { scale: 0.5, opacity: 1 };

  const effect = {
    type: "x2",
    dead: false,
    tween: null,
    fadeTween: null,
    update() {},
    draw(ctx) {
      if (effect.dead) return;
      ctx.save();
      ctx.globalAlpha = anim.opacity;
      const size = baseSize * anim.scale;
      ctx.drawImage(
        x2Image,
        x - size / 2,
        y - size / 2,
        size,
        size
      );
      ctx.restore();
    },
    finish() {
      if (effect.dead) return;
      effect.dead = true;
      effect.tween?.kill?.();
      effect.fadeTween?.kill?.();
    },
    kill() {
      effect.finish();
    }
  };

  fxManager.add(effect);

  effect.tween = gsap.to(anim, {
    scale: 1.3,
    duration: 0.4,
    ease: "back.out(2)",
    onComplete: () => {
      effect.fadeTween = gsap.to(anim, {
        scale: 1,
        opacity: 0,
        duration: 0.3,
        ease: "power1.inOut",
        onComplete: () => {
          effect.finish();
        }
      });
    }
  });
}

function stopBonusEffect(type) {
  const fx = game?.fx;
  if (!fx) return;

  switch (type) {
    case "magnet":
      fx.clear("magnet");
      playSound("off");
      break;
    case "x2":
      break;
  }
}

function activateBonus(type, duration) {
  if (type === "shield") {
    collectShield();
    return;
  }

  const bonus = activeBonuses[type];
  if (!bonus) return;

  const extra = Math.max(0, Number(duration) || 0);
  if (bonus.active) {
    bonus.timeLeft += extra;
    if (extra > 0) {
      playSound("bonusok");
    }
  } else if (extra > 0) {
    bonus.active = true;
    bonus.timeLeft = extra;
    playSound("bonusok");
    startBonusEffect(type);
  }
}

function updateActiveBonuses(dt) {
  for (const type in activeBonuses) {
    const bonus = activeBonuses[type];
    if (!bonus.active) continue;
    bonus.timeLeft -= dt;
    if (bonus.timeLeft <= 0) {
      bonus.active = false;
      bonus.timeLeft = 0;
      stopBonusEffect(type);
    }
  }
}

function beginFrame() {
  shieldConsumedThisFrame = false;
}

function resetActiveBonuses() {
  for (const type in activeBonuses) {
    if (activeBonuses[type].active) {
      stopBonusEffect(type);
    }
    activeBonuses[type].active = false;
    activeBonuses[type].timeLeft = 0;
  }
}

function updateShieldHUD() {
  if (!game || typeof game.render !== "function") return;
  if (game.state === "playing") return;
  game.render();
}

function collectShield() {
  const wasActive = shield.count > 0;
  shield.count += 1;
  playSound("bonusok");

  if (!wasActive) {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => playSound("forcefield"));
    } else {
      playSound("forcefield");
    }
  }

  if (!shield.active) {
    shield.active = true;
    startShieldEffect();
  } else if (shield._effect?.aura && gsap?.fromTo) {
    gsap.fromTo(
      shield._effect.aura,
      { scale: 1.3, opacity: 0.35 },
      {
        scale: 1.2,
        opacity: 0.2,
        duration: 0.6,
        ease: "sine.out",
        overwrite: "auto"
      }
    );
  }

  updateShieldHUD();
}

function startShieldEffect() {
  const walletRef = game?.wallet;
  const fxManager = game?.fx;
  if (!walletRef || !fxManager) return;

  fxManager.clear("shield");

  const aura = { scale: 1, opacity: 0.4 };
  const effect = {
    type: "shield",
    wallet: walletRef,
    aura,
    dead: false,
    tween: null,
    kill() {
      if (effect.dead) return;
      effect.dead = true;
      effect.tween?.kill?.();
      if (fxManager.active.shield === effect) {
        delete fxManager.active.shield;
      }
      if (shield._effect === effect) {
        shield._effect = null;
      }
    },
    draw(ctx) {
      if (effect.dead) return;
      ctx.save();
      ctx.globalAlpha = aura.opacity;
      ctx.beginPath();
      ctx.arc(
        walletRef.x + walletRef.w / 2,
        walletRef.y + walletRef.h / 2,
        (walletRef.w / 2) * aura.scale + CONFIG.fx.shield.radiusOffset,
        0,
        Math.PI * 2
      );
      ctx.strokeStyle = CONFIG.fx.shield.color;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
  };

  if (gsap?.to) {
    effect.tween = gsap.to(aura, {
      scale: 1.2,
      opacity: 0.2,
      yoyo: true,
      repeat: -1,
      duration: CONFIG.fx.shield.duration,
      ease: "sine.inOut"
    });
  }

  fxManager.active.shield = effect;
  fxManager.add(effect);
  shield._effect = effect;
  shield.active = true;

}

function stopShieldEffect(options = {}) {
  const { silent = false } = options;
  const fxManager = game?.fx;
  const walletRef = game?.wallet;

  if (fxManager?.active?.shield) {
    const activeEffect = fxManager.active.shield;
    fxManager.clear("shield");
    if (shield._effect === activeEffect) {
      shield._effect = null;
    }
  } else if (shield._effect) {
    shield._effect.kill?.();
    shield._effect = null;
  }

  if (!silent) {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => playSound("off"));
    } else {
      playSound("off");
    }
  }

  if (!walletRef || !fxManager) return;

  const fade = { scale: 1, opacity: 1 };
  const fadeEffect = {
    type: "shieldFade",
    wallet: walletRef,
    fade,
    dead: false,
    tween: null,
    kill() {
      if (fadeEffect.dead) return;
      fadeEffect.dead = true;
      fadeEffect.tween?.kill?.();
    },
    draw(ctx) {
      if (fadeEffect.dead || fade.opacity <= 0) return;
      ctx.save();
      ctx.globalAlpha = fade.opacity;
      ctx.beginPath();
      ctx.arc(
        walletRef.x + walletRef.w / 2,
        walletRef.y + walletRef.h / 2,
        (walletRef.w / 2) * fade.scale + CONFIG.fx.shield.radiusOffset,
        0,
        Math.PI * 2
      );
      ctx.strokeStyle = "rgba(100,200,255,0.6)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
  };

  if (gsap?.to) {
    fadeEffect.tween = gsap.to(fade, {
      scale: 1.3,
      opacity: 0,
      duration: 0.6,
      ease: "power1.in",
      onComplete: () => fadeEffect.kill(),
      onInterrupt: () => fadeEffect.kill()
    });
  } else {
    fadeEffect.dead = true;
  }

  fxManager.add(fadeEffect);
}

function removeItem(item) {
  if (!item) return;
  if ("dead" in item) {
    try {
      item.dead = true;
    } catch (_) {
      item.alive = false;
    }
  } else {
    item.alive = false;
  }
  if (gsap?.killTweensOf) {
    gsap.killTweensOf(item);
  }
}

function applyNegativeEffect(item, gameInstance, firstCatch) {
  if (!item || !gameInstance) return;

  const { x: itemX, y: itemY } = item.getCenter();
  const subtype = item.subtype;

  if (gameInstance.wallet) {
    if (subtype === "bomb") {
      gameInstance.wallet.bump(0.65, "vertical");
    } else if (subtype === "anvil") {
      gameInstance.wallet.bump(0.55, "vertical");
    } else {
      gameInstance.wallet.bump(0.40, "vertical");
    }
  }

  if (gameInstance.fx) {
    gameInstance.fx.add(new FxNegativeImpact(itemX, itemY));
  }

  gameInstance.comboStreak = 0;
  gameInstance.comboMult = comboTiers[0].mult;
  if (gsap?.killTweensOf) {
    gsap.killTweensOf(comboVis);
  }
  comboVis.scale = 1;
  comboVis.flash = 0;

  if (subtype === "bomb") {
    gameInstance.lives -= 1;
    gameInstance.shake = 0.8;
    if (gameInstance.settings?.haptics && !firstCatch) {
      try {
        navigator.vibrate && navigator.vibrate(40);
      } catch (_) {}
    }
  } else if (subtype === "shitcoin") {
    gameInstance.score += CONFIG.score.bad.shitcoin;
  } else if (subtype === "anvil") {
    gameInstance.score += CONFIG.score.bad.anvil;
    if (gameInstance.wallet) {
      gameInstance.wallet.slowTimer = 2.0;
    }
  } else if (subtype === "rugpull") {
    const delta = Math.floor(gameInstance.score * CONFIG.score.rugpullPct);
    gameInstance.score = Math.max(0, gameInstance.score + delta);
  } else if (subtype === "fakeAirdrop") {
    gameInstance.effects.freeze = 3.0;
  }
}

function resolvePositiveCollision(item, gameInstance, firstCatch) {
  if (!item || !gameInstance) {
    removeItem(item);
    return;
  }

  const { x: itemX, y: itemY } = item.getCenter();

  if (item.kind === "good") {
    gameInstance.wallet?.bump(0.35, "vertical");

    if (gameInstance.effects.freeze > 0) {
      gameInstance.fx?.add(new FxNegativeImpact(itemX, itemY));
      playSound("wrong");
      removeItem(item);
      return;
    }

    let pts = CONFIG.score[item.subtype] || 0;
    if (activeBonuses.x2?.active) pts *= 2;

    const prevTier = currentTier(gameInstance.comboStreak || 0) || comboTiers[0];
    const prevMult = prevTier.mult;

    gameInstance.comboStreak += 1;
    const newTier = currentTier(gameInstance.comboStreak) || comboTiers[comboTiers.length - 1];
    gameInstance.comboMult = newTier.mult;
    gameInstance.maxCombo = Math.max(gameInstance.maxCombo, gameInstance.comboStreak);
    pts = Math.floor(pts * gameInstance.comboMult);
    gameInstance.score += pts;

    if (gsap?.to) {
      if (gsap?.killTweensOf) {
        gsap.killTweensOf(comboVis, 'scale');
      }
      comboVis.scale = 1;
      gsap.to(comboVis, {
        scale: 1.06,
        duration: HUD_CONFIG.anim.popDur / 2,
        ease: 'power2.out',
        onComplete: () => {
          gsap.to(comboVis, {
            scale: 1,
            duration: HUD_CONFIG.anim.popDur / 2,
            ease: 'power2.in'
          });
        }
      });
    } else {
      comboVis.scale = 1;
    }

    if (newTier.mult > prevMult) {
      if (gsap?.to) {
        if (gsap?.killTweensOf) {
          gsap.killTweensOf(comboVis, 'flash');
        }
        comboVis.flash = 0.6;
        gsap.to(comboVis, {
          flash: 0,
          duration: HUD_CONFIG.anim.flashDur,
          ease: 'power1.out'
        });
      } else {
        comboVis.flash = 0;
      }
    }

    playSound("coin");
    gameInstance.fx?.add(new FxPositiveImpact(itemX, itemY));

    if (gameInstance.settings?.haptics && !firstCatch) {
      try {
        navigator.vibrate && navigator.vibrate(8);
      } catch (_) {}
    }
  } else if (item.kind === "power") {
    gameInstance.wallet?.bump(0.25, "horizontal");

    if (item.subtype === "magnet") {
      activateBonus("magnet", CONFIG.powerups.magnet);
    } else if (item.subtype === "x2") {
      activateBonus("x2", CONFIG.powerups.x2);
    } else if (item.subtype === "shield") {
      activateBonus("shield", CONFIG.powerups.shield);
    } else if (item.subtype === "timeShard") {
      gameInstance.timeLeft = Math.min(CONFIG.runSeconds, gameInstance.timeLeft + 5);
      playSound("bonusok");
    }

    gameInstance.fx?.add(new FxPositiveImpact(itemX, itemY));
  }

  removeItem(item);
}

// Consume shield charge first (once per frame), then early-return; otherwise apply negative effect.
function resolveNegativeCollision(item, gameInstance, firstCatch) {
  if (!item) return;

  const walletRef = gameInstance?.wallet ?? game?.wallet;
  const fxManager = gameInstance?.fx ?? game?.fx;
  const shieldActiveThisFrame = shield.count > 0 || shieldConsumedThisFrame;

  if (shieldActiveThisFrame) {
    if (!shieldConsumedThisFrame && shield.count > 0) {
      shield.count = Math.max(0, shield.count - 1);
      shieldConsumedThisFrame = true;
      shield.active = shield.count > 0;
      updateShieldHUD();
      if (shield.count === 0) {
        stopShieldEffect();
      }
    }

    if (walletRef && gsap?.fromTo) {
      gsap.fromTo(
        walletRef,
        { visualScale: 1.15 },
        {
          visualScale: 1,
          duration: 0.25,
          ease: "back.out(2)",
          overwrite: "auto"
        }
      );
    }

    if (walletRef && fxManager) {
      const impactX = walletRef.x + walletRef.w / 2;
      const impactY = walletRef.y;
      fxManager.add(new FxPositiveImpact(impactX, impactY, "lightblue"));
    }

    playSound("zap");
    removeItem(item);
    return;
  }

  playSound("wrong");
  applyNegativeEffect(item, gameInstance, firstCatch);
  removeItem(item);
}

function handleCollision(item) {
  if (!item || !item.alive) return;

  const gameInstance = item.g ?? game;
  if (!gameInstance) {
    removeItem(item);
    return;
  }

  const firstCatch = !gameInstance.didFirstCatch;

  if (item.isNegative) {
    resolveNegativeCollision(item, gameInstance, firstCatch);
  } else {
    resolvePositiveCollision(item, gameInstance, firstCatch);
  }

  gameInstance.didFirstCatch = true;
}

function resetShieldState(options = {}) {
  const { silent = false } = options;
  if (shield.active || shield.count > 0 || shield._effect) {
    shield.count = 0;
    shield.active = false;
    stopShieldEffect({ silent });
  } else {
    shield.count = 0;
    shield.active = false;
  }
  shield._effect = null;
  shieldConsumedThisFrame = false;
  updateShieldHUD();
}

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

  powerups: { magnet:3, x2:5, shield:6, timeShard:0 },

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

class FxManager {
  constructor(game) {
    this.g = game;
    this.effects = [];
    this.active = {};
  }

  add(effect) {
    if (!effect) return null;
    this.effects.push(effect);
    return effect;
  }

  // --- Méthode rétro-compatible ---
  burst(x, y, color = "gold", radius = 20) {
    const fx = new FxPositiveImpact(x, y);
    if (color) CONFIG.fx.positive.color = color;
    if (radius) CONFIG.fx.positive.radius = radius;
    this.add(fx);
  }

  update(dt) {
    for (const fx of this.effects) {
      if (fx.dead) continue;
      if (typeof fx.update === "function") {
        fx.update(dt);
      }
    }
    this.effects = this.effects.filter(fx => !fx.dead);
  }

  render(ctx) {
    if (!ctx) return;
    for (const fx of this.effects) {
      if (!fx.dead && typeof fx.draw === "function") {
        fx.draw(ctx);
      }
    }
  }

  clear(type) {
    const activeEffect = this.active[type];
    if (!activeEffect) return;
    if (typeof activeEffect.kill === "function") {
      activeEffect.kill();
    } else if (activeEffect.tween?.kill) {
      activeEffect.tween.kill();
    }
    this.effects = this.effects.filter(fx => fx !== activeEffect);
    delete this.active[type];
  }

  clearAll() {
    for (const fx of this.effects) {
      if (typeof fx.kill === "function") {
        fx.kill();
      } else if (fx.tween?.kill) {
        fx.tween.kill();
      }
      fx.dead = true;
    }
    this.effects.length = 0;
    for (const key of Object.keys(this.active)) {
      const activeEffect = this.active[key];
      if (typeof activeEffect?.kill === "function") {
        activeEffect.kill();
      } else if (activeEffect?.tween?.kill) {
        activeEffect.tween.kill();
      }
    }
    this.active = {};
  }
}

class FxPositiveImpact {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.scale = 0.1;
    this.opacity = 1;
    this.dead = false;
    this.color = color || CONFIG.fx.positive.color;

    this.tween = null;

    if (gsap?.to) {
      this.tween = gsap.to(this, {
        scale: 1.5,
        opacity: 0,
        duration: CONFIG.fx.positive.duration,
        ease: "power1.out",
        onComplete: () => this.finish(),
        onInterrupt: () => this.finish(),
      });
    } else {
      this.scale = 1.5;
      this.opacity = 0;
      this.dead = true;
    }
  }

  finish() {
    if (this.dead) return;
    this.dead = true;
    const tween = this.tween;
    this.tween = null;
    tween?.kill?.();
  }

  kill() {
    this.finish();
  }

  draw(ctx) {
    if (this.dead) return;
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.beginPath();
    ctx.arc(this.x, this.y, CONFIG.fx.positive.radius * this.scale, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.restore();
  }
}

class FxNegativeImpact {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.opacity = 1;
    this.dead = false;
    this.tween = null;

    if (gsap?.to) {
      this.tween = gsap.to(this, {
        opacity: 0,
        duration: CONFIG.fx.negative.duration,
        ease: "power1.out",
        onComplete: () => this.finish(),
        onInterrupt: () => this.finish(),
      });
    } else {
      this.opacity = 0;
      this.dead = true;
    }
  }

  finish() {
    if (this.dead) return;
    this.dead = true;
    const tween = this.tween;
    this.tween = null;
    tween?.kill?.();
  }

  kill() {
    this.finish();
  }

  draw(ctx) {
    if (this.dead) return;
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.beginPath();
    ctx.arc(this.x, this.y, CONFIG.fx.negative.radius, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.fx.negative.color;
    ctx.fill();
    ctx.restore();
  }
}

function fxMagnetActive(wallet, fxManager) {
  if (!wallet || !fxManager) return;

  fxManager.clear("magnet");

  const ring = { scale: 0.5, opacity: 1 };
  const effect = {
    type: "magnet",
    wallet,
    ring,
    dead: false,
    tween: null,
    kill() {
      if (effect.dead) return;
      effect.dead = true;
      const tween = effect.tween;
      effect.tween = null;
      tween?.kill?.();
    },
    draw(ctx) {
      if (effect.dead) return;
      ctx.save();
      ctx.globalAlpha = ring.opacity;
      ctx.beginPath();
      ctx.arc(
        wallet.x + wallet.w / 2,
        wallet.y + wallet.h / 2,
        CONFIG.fx.magnet.radius * ring.scale,
        0,
        Math.PI * 2
      );
      ctx.strokeStyle = CONFIG.fx.magnet.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  };

  if (gsap?.to) {
    effect.tween = gsap.to(ring, {
      scale: 2,
      opacity: 0,
      duration: CONFIG.fx.magnet.duration,
      ease: "sine.out",
      repeat: -1,
      onRepeat: () => {
        ring.opacity = 1;
        ring.scale = 0.5;
      }
    });
  }

  fxManager.active.magnet = effect;
  fxManager.add(effect);
}

// =====================
// UTILS
// =====================
const snap = v => Math.round(v);
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
const WR = { x: 0, y: 0, w: 0, h: 0 };

function positionHUD(){
  const canvasEl = document.getElementById('gameCanvas');
  const hud = document.getElementById('hud');
  if (!canvasEl || !hud) return;

  const rect = canvasEl.getBoundingClientRect();
  const offsetPx = Math.round(rect.height * 0.14);

  hud.style.setProperty('--hud-top', offsetPx + 'px');
}

window.addEventListener('load', positionHUD);
window.addEventListener('resize', positionHUD);

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
  positionHUD();
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
    const g = Game.instance;
    if (g && g.state==='title'){
      playSound("click");
      requestAnimationFrame(()=> g.uiStartFromTitle());
    }
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
  evolveByScore(score){ const th=CONFIG.evolveThresholds; let lvl=1; for (let i=0;i<th.length;i++){ if (score>=th[i]) lvl=i+1; } if (lvl!==this.level){ this.level=lvl; loadWallet(lvl); this.applyCaps(); this.g.fx.burst(this.x, this.y, '#ffcd75', 12); playSound("bonusok"); this.squashTimer=0.12; } }
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
    this.type = subtype;
    this.x = x;
    this.y = y;
    this.spawnScale = (CONFIG.items?.spawnScale != null) ? CONFIG.items.spawnScale : 0.30;
    this.maxScale = 1;
    this.scale = this.spawnScale;
    this.alive = true;
    this._dead = false;
    this._tween = null;
    this.vx = 0;
    this.isNegative = NEGATIVE_TYPES.has(subtype);

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

    if (this.kind === 'good' && activeBonuses.magnet?.active){
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

function spawnItem(gameInstance, kind, subtype, x, y, extra = {}) {
  if (!gameInstance) return null;
  const item = new FallingItem(gameInstance, kind, subtype, x, y);
  item.isNegative = NEGATIVE_TYPES.has(subtype);
  Object.assign(item, extra);
  gameInstance.items.push(item);
  return item;
}

class Spawner{
  constructor(game){ this.g=game; this.acc=0; }
  update(dt){ const diff=this.g.diffMult(); this.acc += dt * (CONFIG.baseSpawnPerSec * diff); while (this.acc >= 1){ this.spawnOne(); this.acc -= 1; } }
  spawnOne(){
    const x = this.g.arm.spawnX(); const y = this.g.arm.spawnY();
    let pGood=0.7, pBad=0.2, pPow=0.1; if (this.g.timeElapsed>30){ pGood=0.6; pBad=0.3; pPow=0.1; }
    const r=Math.random();
    if (r < pGood){ const rar = CONFIG.rarity; const sub = choiceWeighted([{k:'bronze',w:rar.bronze},{k:'silver',w:rar.silver},{k:'gold',w:rar.gold},{k:'diamond',w:rar.diamond}]); spawnItem(this.g,'good',sub,x,y); }
    else if (r < pGood + pBad){ const bw = CONFIG.badWeights; const sub = choiceWeighted([{k:'bomb',w:bw.bomb*(this.g.timeElapsed>30?1.2:1)},{k:'shitcoin',w:bw.shitcoin},{k:'anvil',w:bw.anvil},{k:'rugpull',w:bw.rugpull},{k:'fakeAirdrop',w:bw.fakeAirdrop}]); spawnItem(this.g,'bad',sub,x,y); }
    else { const pu = choiceWeighted([{k:'magnet',w:1},{k:'x2',w:1},{k:'shield',w:1},{k:'timeShard',w:1}]); spawnItem(this.g,'power',pu,x,y); }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCompactHUD(ctx, g) {
  if (!g) return null;

  const W = BASE_W;
  const H = BASE_H;

  const desired = H * 0.08;
  const barH = Math.round(clamp(desired, H * HUD_CONFIG.barHFracMin, H * HUD_CONFIG.barHFracMax));
  const topFrac = g.maxTopActorH || CONFIG.maxTopActorH || 0.14;
  const y = Math.round(Math.floor(H * topFrac));
  const x = HUD_CONFIG.padX;
  const w = W - HUD_CONFIG.padX * 2;
  const h = barH;

  const scoreValue = Math.round(g.score ?? 0);
  setHUDScore(scoreValue);

  const streak = Math.max(0, Math.floor(g.comboStreak ?? 0));
  const cur = currentTier(streak) || comboTiers[0];
  const comboMult = cur.mult;
  setHUDCombo(comboMult, streak);
  setHUDComboProgress(progressToNext(streak));

  const color =
    HUD_CONFIG.comboColors[String(cur.mult)] ||
    (cur.mult >= 3.0 ? HUD_CONFIG.comboColors['3.0'] : HUD_CONFIG.comboColors['1.0']);

  updateComboChipVisual(color);

  const heartsCount = Math.max(0, Math.round(g.lives ?? 0));
  setHUDLives(heartsCount);

  const timeSeconds = Math.max(0, Math.floor(g.timeLeft ?? 0));
  setHUDTime(timeSeconds);

  return { x, y, w, h };
}

class HUD{
  constructor(game){ this.g=game; }
  draw(g){
    const metrics = drawCompactHUD(g, this.g);
    const barY = metrics?.y ?? 0;
    const barH = metrics?.h ?? 0;

    const bonusX = HUD_CONFIG.padX + 2;
    let bonusY = barY + barH + HUD_CONFIG.padY;
    const iconSize = HUD_CONFIG.bonusIconSize;
    const iconSpacing = HUD_CONFIG.gap;
    const timerFontSize = Math.max(HUD_CONFIG.fontMin, Math.round(hudFontSize(BASE_W) * 0.85));

    const drawBonusIcon = (type, timeLeft) => {
      const icon = BonusIcons[type];
      if (!icon) return;
      const timer = Math.max(0, timeLeft);
      if (icon.complete) {
        g.drawImage(icon, bonusX, bonusY, iconSize, iconSize);
      }
      g.save();
      g.fillStyle = '#fff';
      g.font = `${timerFontSize}px "Roboto Mono", "Inter", monospace`;
      g.textBaseline = 'middle';
      g.fillText(`${Math.ceil(timer)}s`, bonusX + iconSize + 6, bonusY + iconSize / 2);
      g.restore();
      bonusY += iconSize + iconSpacing;
    };

    // --- HUD des bonus temporaires ---
    for (const type in activeBonuses) {
      const bonus = activeBonuses[type];
      if (bonus.active) {
        drawBonusIcon(type, bonus.timeLeft);
      }
    }

    const drawShieldIcon = (count) => {
      if (!shieldIconImage.complete) return;
      const size = iconSize;
      const bx = bonusX;
      const by = bonusY;

      g.drawImage(shieldIconImage, bx, by, size, size);
      g.save();
      g.fillStyle = '#fff';
      g.font = `${timerFontSize}px "Roboto Mono", "Inter", monospace`;
      g.textBaseline = 'middle';
      g.fillText(`x${count}`, bx + size + 6, by + size / 2);
      g.restore();
      bonusY += size + iconSpacing;
    };

    // --- HUD du bouclier cumulatif ---
    if (shield.count > 0) {
      drawShieldIcon(shield.count);
    }
  }
}

// =====================
// GAME
// =====================
class Game{
  static instance=null;
  constructor(){ Game.instance=this; this.reset({ showTitle:true }); }
  reset({showTitle=true}={}){
    window.__saltDroppeeLoopStarted = false;
    if (this.fx) this.fx.clearAll();
    resetActiveBonuses();
    resetShieldState({ silent: true });
    this.settings = loadSettings(); document.documentElement.classList.toggle('contrast-high', !!this.settings.contrast);
    this.palette = CONFIG.palette.slice(); if (this.settings.contrast){ this.palette = ['#000','#444','#ff0044','#ffaa00','#ffffff','#00ffea','#00ff66','#66a6ff']; }
    const u=new URLSearchParams(location.search); const seed=u.get('seed'); this.random = seed? (function(seed){ let t=seed>>>0; return function(){ t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, 1 | t); r ^= r + Math.imul(r ^ r >>> 7, 61 | r); return ((r ^ r >>> 14) >>> 0) / 4294967296; };})(parseInt(seed)||1) : Math.random;
    this.state='title';
    if (typeof setSoundEnabled === "function") {
      setSoundEnabled(!!this.settings.sound);
    }
    this.timeLeft=CONFIG.runSeconds; this.timeElapsed=0; this.lives=CONFIG.lives; this.score=0; this.comboStreak=0; this.comboMult=comboTiers[0].mult; this.maxCombo=0; this.levelReached=1;
    if (gsap?.killTweensOf) {
      gsap.killTweensOf(comboVis);
    }
    comboVis.scale = 1;
    comboVis.flash = 0;
    this.arm=new Arm(this); this.arm.applyCaps(); this.wallet=new Wallet(this); this.wallet.applyCaps(); loadWallet(1); this.hud=new HUD(this); this.spawner=new Spawner(this);
    this.items=[]; this.effects={freeze:0}; this.fx = new FxManager(this);
    this.shake=0; this.bgIndex=0; this.didFirstCatch=false; this.updateBgByScore();
    if (showTitle) this.renderTitle(); else this.render();
  }
  diffMult(){ return Math.pow(CONFIG.spawnRampFactor, Math.floor(this.timeElapsed/CONFIG.spawnRampEverySec)); }
  updateBgByScore(){ const th=CONFIG.evolveThresholds; let idx=0; for (let i=0;i<th.length;i++){ if (this.score>=th[i]) idx=i; } if (idx!==this.bgIndex){ this.bgIndex=idx; this.wallet.evolveByScore(this.score); this.levelReached = Math.max(this.levelReached, this.wallet.level); } }
  start(){ this.state='playing'; this.lastTime=performance.now(); this.ignoreClicksUntil=this.lastTime+500; this.ignoreVisibilityUntil=this.lastTime+1000; this.loop(); }
  loop(){
    if (this.state!=='playing'){
      window.__saltDroppeeLoopStarted = false;
      return;
    }
    if (window.__saltDroppeeLoopStarted) return;
    window.__saltDroppeeLoopStarted = true;

    const now=performance.now();
    const dt=Math.min(0.033, (now-this.lastTime)/1000);
    this.lastTime=now;
    this.step(dt);
    this.render();

    if (this.state!=='playing'){
      window.__saltDroppeeLoopStarted = false;
      return;
    }

    requestAnimationFrame(()=>{
      window.__saltDroppeeLoopStarted = false;
      this.loop();
    });
  }
  step(dt){
    beginFrame();
    this.timeElapsed += dt; if (this.timeLeft>0) this.timeLeft = Math.max(0, this.timeLeft - dt); if (this.timeLeft<=0 || this.lives<=0){ this.endGame(); return; }
    this.arm.update(dt); this.wallet.update(dt); this.spawner.update(dt);
    const w=this.wallet; const cx=CONFIG.collision.walletScaleX, cy=CONFIG.collision.walletScaleY, px=CONFIG.collision.walletPadX, py=CONFIG.collision.walletPadY;
    WR.x = w.x + (w.w - w.w*cx)/2 + px;
    WR.y = w.y + (w.h - w.h*cy)/2 + py;
    WR.w = w.w*cx;
    WR.h = w.h*cy;

    const remaining = [];
    for (const it of this.items){
      if (!it.alive || it.dead){
        if (gsap?.killTweensOf) gsap.killTweensOf(it);
        continue;
      }

      if (typeof it.update === 'function'){
        it.update(dt);
      }
      if (it.dead || !it.alive){
        if (gsap?.killTweensOf) gsap.killTweensOf(it);
        continue;
      }

      const hitbox = it.getBounds();
      if (checkAABB(WR, hitbox)){
        handleCollision(it);
        continue;
      }

      if (it.alive && !it.dead){
        remaining.push(it);
      } else if (gsap?.killTweensOf){
        gsap.killTweensOf(it);
      }
    }
    this.items = remaining;
    updateActiveBonuses(dt);
    if (this.effects.freeze>0){
      this.effects.freeze -= dt;
      if (this.effects.freeze<0) this.effects.freeze = 0;
    }
    this.updateBgByScore(); if (this.shake>0) this.shake = Math.max(0, this.shake - dt*6);
  }
  onCatch(it){
    handleCollision(it);
  }
  endGame(){ this.fx?.clearAll(); resetActiveBonuses(); resetShieldState({ silent: true }); this.state='over'; this.render(); try{ const best=parseInt(localStorage.getItem(LS.bestScore)||'0',10); if (this.score>best) localStorage.setItem(LS.bestScore, String(this.score)); const bestC=parseInt(localStorage.getItem(LS.bestCombo)||'0',10); if (this.maxCombo>bestC) localStorage.setItem(LS.bestCombo, String(this.maxCombo)); const runs=JSON.parse(localStorage.getItem(LS.runs)||'[]'); runs.unshift({ ts:Date.now(), score:this.score, combo:this.maxCombo, lvl:this.levelReached }); while (runs.length>20) runs.pop(); localStorage.setItem(LS.runs, JSON.stringify(runs)); }catch(e){}
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
    addEvent(document.getElementById('btnSettings'), INPUT.tap, ()=>{ playSound("click"); this.renderSettings(); });
    addEvent(document.getElementById('btnLB'), INPUT.tap, ()=>{ playSound("click"); this.renderLeaderboard(); });
    addEvent(document.getElementById('btnPlay'), INPUT.tap, async (e)=>{
      e.preventDefault(); e.stopPropagation();
      playSound("click");
      await new Promise(r=>requestAnimationFrame(r));
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
    addEvent(document.getElementById('sound'), 'change', e=>{ playSound("click"); this.settings.sound = e.target.checked; saveSettings(this.settings); if (typeof setSoundEnabled === "function") { setSoundEnabled(this.settings.sound); } });
    addEvent(document.getElementById('contrast'), 'change', e=>{ playSound("click"); this.settings.contrast = e.target.checked; saveSettings(this.settings); this.reset(); });
    addEvent(document.getElementById('haptics'), 'change', e=>{ playSound("click"); this.settings.haptics = e.target.checked; saveSettings(this.settings); });
    addEvent(document.getElementById('sens'), 'input', e=>{ this.settings.sensitivity = parseFloat(e.target.value); saveSettings(this.settings); });
    addEvent(document.getElementById('back'), INPUT.tap, ()=>{ playSound("click"); this.renderTitle(); });
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
    addEvent(document.getElementById('back'), INPUT.tap, ()=>{ playSound("click"); this.renderTitle(); });
  }
  renderPause(){ overlay.innerHTML = `<div class="panel"><h1>Pause</h1><div class="btnrow"><button id="resume">Reprendre</button><button id="quit">Menu</button></div></div>`; addEvent(document.getElementById('resume'), INPUT.tap, ()=>{ playSound("click"); overlay.innerHTML=''; this.state='playing'; this.lastTime=performance.now(); this.loop(); }); addEvent(document.getElementById('quit'), INPUT.tap, ()=>{ playSound("click"); this.reset(); }); }
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
    addEvent(document.getElementById('again'), INPUT.tap, async ()=>{ playSound("click"); overlay.innerHTML=''; this.reset({showTitle:false}); await new Promise(r=>requestAnimationFrame(r)); this.start(); }, { passive:false });
    addEvent(document.getElementById('menu'), INPUT.tap, ()=>{ playSound("click"); this.reset({showTitle:true}); });
    if (TG){ const sh=document.getElementById('share'); if (sh) addEvent(sh, INPUT.tap, ()=>{ playSound("click"); try{ TG.sendData(JSON.stringify({ score:this.score, duration:CONFIG.runSeconds, version:VERSION })); }catch(e){} }); }
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

    if (this.fx){
      this.fx.update(1/60);
      this.fx.render(ctx);
    }
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

  canvas = document.getElementById('gameCanvas');
  ctx = canvas?.getContext('2d');
  overlay = document.getElementById('overlay');
  if (!canvas || !ctx || !overlay) return;

  window.__saltDroppeeStarted = true;

  if (typeof unlockAudioOnce === "function") {
    unlockAudioOnce();
  }

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

  addEvent(canvas, INPUT.tap, (e)=>{ if (game.state!=='playing') return; const now=performance.now(); if (game.ignoreClicksUntil && now < game.ignoreClicksUntil) return; const pt=getCanvasPoint(e); if (pt.y<40 && pt.x>BASE_W-80){ playSound("click"); game.state='paused'; game.renderPause(); } });

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
