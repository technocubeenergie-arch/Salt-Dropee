// ================================
// Salt Droppee — script.js (patched 2025‑09‑23)
// ================================

// AUDIT NOTES (2025-03):
// - Removed the legacy canvas background renderer path that was never executed in production.
// - Factorized duplicated end-of-level transition handling into finalizeLevelTransition().

// --- Détection d'input & utilitaire cross-platform
const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const supportsPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;
const usePointerEventsForMouse = supportsPointerEvents && !hasTouch;
const gsap = window.gsap;

const DEBUG_INPUT_EVENT_TYPES = new Set([
  'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
  'mousedown', 'mousemove', 'mouseup',
  'touchstart', 'touchmove', 'touchend', 'touchcancel',
  'click', 'keydown', 'keyup',
]);

const debugListenerRegistry = new WeakMap();

function debugDescribeElement(target) {
  if (!target) return 'null';
  if (target === window) return 'window';
  if (target === document) return 'document';
  if (target === document.body) return 'body';
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    if (target.id) return `#${target.id}`;
    const tag = target.tagName ? target.tagName.toLowerCase() : 'element';
    if (target.classList && target.classList.length > 0) {
      const cls = Array.from(target.classList).join('.');
      return `${tag}.${cls}`;
    }
    return tag;
  }
  if (target && typeof target.nodeName === 'string') {
    return target.nodeName.toLowerCase();
  }
  return typeof target === 'string' ? target : 'unknown';
}

function debugFormatContext(context) {
  if (!context || typeof context !== 'object') return '';
  const filteredEntries = Object.entries(context).filter(([_, value]) => {
    const t = typeof value;
    return value == null || t === 'string' || t === 'number' || t === 'boolean';
  });
  if (filteredEntries.length === 0) return '';
  try {
    return ' ' + JSON.stringify(Object.fromEntries(filteredEntries));
  } catch (err) {
    void err;
    return '';
  }
}

function registerDebugListener(target, type, handler) {
  if (!target || typeof handler !== 'function') return { count: 0 };
  let typeMap = debugListenerRegistry.get(target);
  if (!typeMap) {
    typeMap = new Map();
    debugListenerRegistry.set(target, typeMap);
  }
  const list = typeMap.get(type) || [];
  list.push(handler);
  typeMap.set(type, list);
  return { count: list.length };
}

function unregisterDebugListener(target, type, handler) {
  if (!target || typeof handler !== 'function') return { count: 0 };
  const typeMap = debugListenerRegistry.get(target);
  if (!typeMap) return { count: 0 };
  const list = typeMap.get(type);
  if (!Array.isArray(list)) return { count: 0 };
  const idx = list.indexOf(handler);
  if (idx >= 0) {
    list.splice(idx, 1);
    if (list.length === 0) {
      typeMap.delete(type);
    } else {
      typeMap.set(type, list);
    }
  }
  if (typeMap.size === 0) {
    debugListenerRegistry.delete(target);
  }
  return { count: Array.isArray(list) ? list.length : 0 };
}

function logInputListener(action, target, type, opts, extra) {
  if (!DEBUG_INPUT_EVENT_TYPES.has(type)) return;
  const base = extra && typeof extra === 'object' ? { ...extra } : {};
  if (opts && typeof opts === 'object') {
    if (typeof opts.passive === 'boolean') base.passive = opts.passive;
    if (typeof opts.capture === 'boolean') base.capture = opts.capture;
  }
  const context = debugFormatContext(base);
  console.info(`[input] ${action} ${type} -> ${debugDescribeElement(target)}${context}`);
}

function addEvent(el, type, handler, opts) {
  if (!el || !type || typeof handler !== 'function') return;
  const finalOpts = (opts === undefined || opts === null) ? { passive: true } : opts;
  el.addEventListener(type, handler, finalOpts);
  let count = 0;
  if (typeof registerDebugListener === 'function') {
    const info = registerDebugListener(el, type, handler);
    if (info && typeof info.count === 'number') {
      count = info.count;
    }
  }
  if (typeof logInputListener === 'function') {
    logInputListener('attach', el, type, finalOpts, { count });
  }
}

function removeEvent(el, type, handler, opts) {
  if (!el || !type || typeof handler !== 'function') return;
  const finalOpts = (opts === undefined || opts === null) ? false : opts;
  el.removeEventListener(type, handler, finalOpts);
  let count = 0;
  if (typeof unregisterDebugListener === 'function') {
    const info = unregisterDebugListener(el, type, handler);
    if (info && typeof info.count === 'number') {
      count = info.count;
    }
  }
  if (typeof logInputListener === 'function') {
    logInputListener('detach', el, type, typeof finalOpts === 'object' ? finalOpts : {}, { count });
  }
}

if (typeof window.openSettings !== "function") {
  window.openSettings = function openSettingsFallback() {
    const instance = (typeof Game !== "undefined" && Game.instance)
      ? Game.instance
      : null;

    if (instance && typeof instance.renderSettings === "function") {
      if (typeof playSound === "function") {
        playSound("click");
      }
      instance.renderSettings();
      return;
    }

    throw new Error("No settings handler available");
  };
}

console.info("[settings] listener initialized");
addEvent(document, 'click', (event) => {
  const btn = event.target.closest('[data-action="open-settings"]');
  if (!btn) return;

  event.preventDefault();

  const instance = (typeof Game !== "undefined" && Game.instance)
    ? Game.instance
    : null;

  if (instance) {
    let returnView = "title";

    if (btn.closest("#interLevelScreen")) {
      returnView = "inter";
    } else if (instance.state === "paused") {
      returnView = "pause";
    } else if (instance.state === "inter") {
      returnView = "inter";
    } else if (instance.state === "over") {
      returnView = "over";
    } else if (instance.state === "title") {
      returnView = "title";
    }

    instance.settingsReturnView = returnView;
  }

  try {
    openSettings();
  } catch (err) {
    console.error("[settings] openSettings failed:", err);
  }
}, { passive: false });

// --- LEVELS: fichiers réels du projet ---
const LEVELS = [
  {
    id: 1, name: "Level 1",
    background: "assets/fondniveau1.webp",
    walletSprite: "assets/walletniveau1.png",
    music: "assets/sounds/audioniveau1.mp3",
    targetScore: 800, timeLimit: 60, lives: 3,
  },
  {
    id: 2, name: "Level 2",
    background: "assets/fondniveau2.webp",
    walletSprite: "assets/walletniveau2.png",
    music: "assets/sounds/audioniveau2.mp3",
    targetScore: 1200, timeLimit: 60, lives: 3,
  },
  {
    id: 3, name: "Level 3",
    background: "assets/fondniveau3.webp",
    walletSprite: "assets/walletniveau3.png",
    music: "assets/sounds/audioniveau3.mp3",
    targetScore: 1600, timeLimit: 60, lives: 3,
  },
  {
    id: 4, name: "Level 4",
    background: "assets/fondniveau4.webp",
    walletSprite: "assets/walletniveau4.png",
    music: "assets/sounds/audioniveau4.mp3",
    targetScore: 2000, timeLimit: 60, lives: 3,
  },
  {
    id: 5, name: "Level 5",
    background: "assets/fondniveau5.webp",
    walletSprite: "assets/walletniveau5.png",
    music: "assets/sounds/audioniveau5.mp3",
    targetScore: 2500, timeLimit: 60, lives: 3,
  },
  {
    id: 6, name: "Level 6",
    background: "assets/fondniveau6.webp",
    walletSprite: "assets/walletniveau6.png",
    music: "assets/sounds/audioniveau6.mp3",
    targetScore: Infinity, timeLimit: 60, lives: 3,
    endless: true,
  },
];

const INTER_LEVEL_BACKGROUNDS = {
  0: "assets/interlevel1.webp",
  1: "assets/interlevel2.webp",
  2: "assets/interlevel3.webp",
  3: "assets/interlevel4.webp",
  4: "assets/interlevel5.webp",
};

const INTER_LEVEL_SOUND_SOURCES = {
  default: "assets/sounds/tada.mp3",
  4: "assets/sounds/supertada.mp3",
};

const MENU_BACKGROUND_SRC = "assets/fondaccueil.webp";
const MENU_MUSIC_SRC = "assets/sounds/audioaccueil.mp3";

const LEGEND_LEVEL_INDEX = LEVELS.findIndex(level => level?.id === 6);

// --- Cache d'assets par niveau ---
const levelAssets = {}; // index -> { bg:Image, wallet:Image, music:HTMLAudioElement|null }

// Précharge et renvoie {bg, wallet, music}
function preloadLevelAssets(levelCfg) {
  const tasks = [];

  // Image de fond
  const bg = new Image();
  bg.src = levelCfg.background;
  tasks.push(new Promise(res => { bg.onload = res; bg.onerror = res; }));

  // Image de wallet
  const wallet = new Image();
  wallet.src = levelCfg.walletSprite;
  tasks.push(new Promise(res => { wallet.onload = res; wallet.onerror = res; }));

  // Musique (préparée mais non jouée ici)
  let music = null;
  if (levelCfg.music) {
    music = new Audio(levelCfg.music);
    music.loop = true;
    music.preload = "auto";
    tasks.push(Promise.resolve());
  }

  return Promise.all(tasks).then(() => ({ bg, wallet, music }));
}

async function ensureLevelAssets(index) {
  if (!levelAssets[index]) {
    const levelCfg = LEVELS[index];
    if (!levelCfg) return { bg: null, wallet: null, music: null };
    levelAssets[index] = await preloadLevelAssets(levelCfg);
  }
  return levelAssets[index];
}

// --- Fond (HTML) ---
let hasBackgroundImage = false;
let currentBackgroundSrc = '';

function setBackgroundImageSrc(src) {
  const el = document.getElementById('bgLayer');
  if (!el) return;

  if (typeof src !== 'string' || !src.trim()) {
    el.style.backgroundImage = 'none';
    hasBackgroundImage = false;
    currentBackgroundSrc = '';
    return;
  }

  el.style.backgroundImage = `url("${src}")`;
  requestAnimationFrame(() => {
    el.style.opacity = 1;
  });
  hasBackgroundImage = true;
  currentBackgroundSrc = src;
}

function fadeOutBgThen(next) {
  const el = document.getElementById('bgLayer');
  const applyNext = () => {
    if (typeof next === 'function') {
      next();
    } else if (typeof next === 'string') {
      setBackgroundImageSrc(next);
    }
  };

  if (!el || !hasBackgroundImage) {
    applyNext();
    return;
  }

  el.style.opacity = 0;
  setTimeout(applyNext, 250);
}

function applyLevelBackground(src) {
  if (!src) return;

  if (currentBackgroundSrc === src) {
    setBackgroundImageSrc(src);
    return;
  }

  if (!hasBackgroundImage) {
    setBackgroundImageSrc(src);
  } else {
    fadeOutBgThen(() => setBackgroundImageSrc(src));
  }
}

// --- Wallet ---
const ENABLE_SCORE_BASED_WALLET = false;
let walletImage = null;

function setWalletSprite(img) {
  if (!img) return;
  walletImage = img;

  const runtimeWallet = (typeof window !== 'undefined' && window.wallet)
    ? window.wallet
    : (typeof game !== 'undefined' ? game?.wallet : null);

  if (runtimeWallet?.applyCaps) {
    runtimeWallet.applyCaps();
  }

  if (window.gsap && runtimeWallet) {
    if (Object.prototype.hasOwnProperty.call(runtimeWallet, 'visualScale')) {
      runtimeWallet.visualScale = 1;
      gsap.fromTo(runtimeWallet, { visualScale: 0.95 }, { visualScale: 1, duration: 0.25, ease: "back.out(2)" });
    } else {
      gsap.fromTo(runtimeWallet, { scale: 0.95 }, { scale: 1, duration: 0.25, ease: "back.out(2)" });
    }
  }
}

// --- Musique ---
let currentMusic = null;
let musicVolume = 0.6;
let musicEnabled = true;
let menuMusic = null;
let musicUnlockListener = null;
let musicUnlockCompleted = false;
let interLevelAudio = null;
if (typeof window.isSoundEnabled === 'function') {
  try {
    musicEnabled = !!window.isSoundEnabled();
  } catch (_) {}
}

function getInterLevelSoundSrc(levelIndex) {
  if (levelIndex != null && Object.prototype.hasOwnProperty.call(INTER_LEVEL_SOUND_SOURCES, levelIndex)) {
    return INTER_LEVEL_SOUND_SOURCES[levelIndex];
  }
  return INTER_LEVEL_SOUND_SOURCES.default || null;
}

function getInterLevelAudioForSrc(src) {
  if (!src) return null;

  if (interLevelAudio && interLevelAudio.src === src) {
    return interLevelAudio.element;
  }

  if (interLevelAudio && interLevelAudio.element) {
    try {
      interLevelAudio.element.pause();
      interLevelAudio.element.currentTime = 0;
    } catch (_) {}
  }

  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.loop = false;
  audio.volume = 0.9;

  interLevelAudio = { element: audio, src };
  return audio;
}

function canPlayInterLevelAudio() {
  let effectsEnabled = true;
  if (typeof window.isSoundEnabled === 'function') {
    try {
      effectsEnabled = !!window.isSoundEnabled();
    } catch (_) {}
  }
  return effectsEnabled || musicEnabled;
}

function playInterLevelAudioForLevel(levelIndex) {
  if (!canPlayInterLevelAudio()) return;
  const src = getInterLevelSoundSrc(levelIndex);
  if (!src) return;
  const audio = getInterLevelAudioForSrc(src);
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch (_) {}
  const maybe = audio.play();
  if (maybe && typeof maybe.catch === 'function') {
    maybe.catch(() => {});
  }
}

function stopInterLevelAudio() {
  if (!interLevelAudio || !interLevelAudio.element) return;
  try {
    interLevelAudio.element.pause();
    interLevelAudio.element.currentTime = 0;
  } catch (_) {}
}

function tryFadeOut(aud) {
  if (!aud) return;
  if (!window.gsap) {
    try {
      aud.pause();
      aud.currentTime = 0;
    } catch (_) {}
    return;
  }
  gsap.to(aud, {
    volume: 0,
    duration: 0.4,
    ease: "power1.out",
    onComplete: () => {
      try {
        aud.pause();
        aud.currentTime = 0;
      } catch (_) {}
    }
  });
}

function safePlayMusic(aud) {
  if (!aud || !musicEnabled) {
    return Promise.resolve(false);
  }

  if (window.gsap && typeof window.gsap.killTweensOf === 'function') {
    window.gsap.killTweensOf(aud);
  }

  try {
    aud.loop = true;
  } catch (_) {}

  aud.volume = 0;

  const playPromise = aud.play();
  if (!playPromise || typeof playPromise.then !== 'function') {
    if (window.gsap) {
      gsap.to(aud, { volume: musicVolume, duration: 0.6, ease: "power2.out" });
    } else {
      aud.volume = musicVolume;
    }
    return Promise.resolve(!aud.paused);
  }

  return playPromise.then(() => {
    if (window.gsap) {
      gsap.to(aud, { volume: musicVolume, duration: 0.6, ease: "power2.out" });
    } else {
      aud.volume = musicVolume;
    }
    return true;
  }).catch(() => false);
}

function setLevelMusic(audio) {
  const sameAudio = !!audio && currentMusic === audio;
  if (currentMusic && currentMusic !== audio) {
    tryFadeOut(currentMusic);
  }
  currentMusic = audio || null;
  if (!currentMusic) {
    return;
  }
  if (!sameAudio) {
    try {
      currentMusic.currentTime = 0;
    } catch (_) {}
    safePlayMusic(currentMusic);
    return;
  }
  if (currentMusic.paused && musicEnabled) {
    safePlayMusic(currentMusic);
  }
}

function stopLevelMusic() {
  if (!currentMusic) return;
  tryFadeOut(currentMusic);
  currentMusic = null;
}

function getMenuMusic() {
  if (!menuMusic) {
    menuMusic = new Audio(MENU_MUSIC_SRC);
    menuMusic.loop = true;
    menuMusic.preload = "auto";
  }
  return menuMusic;
}

function playMenuMusic() {
  unlockMusicOnce();
  const audio = getMenuMusic();
  setLevelMusic(audio);
}

function stopMenuMusic() {
  if (currentMusic === menuMusic) {
    setLevelMusic(null);
  }
}

function unlockMusicOnce() {
  if (musicUnlockCompleted || musicUnlockListener) return;

  const cleanup = () => {
    if (!musicUnlockListener) return;
    removeEvent(window, 'pointerdown', musicUnlockListener);
    removeEvent(window, 'touchstart', musicUnlockListener);
    removeEvent(window, 'mousedown', musicUnlockListener);
    musicUnlockListener = null;
    musicUnlockCompleted = true;
  };

  musicUnlockListener = () => {
    const audio = currentMusic || menuMusic || getMenuMusic();
    if (!audio) return;

    const maybePromise = safePlayMusic(audio);
    if (maybePromise && typeof maybePromise.then === 'function') {
      maybePromise.then((played) => {
        if (played) {
          cleanup();
        }
      });
    } else if (!audio.paused) {
      cleanup();
    }
  };

  addEvent(window, 'pointerdown', musicUnlockListener);
  addEvent(window, 'touchstart', musicUnlockListener);
  addEvent(window, 'mousedown', musicUnlockListener);
}

window.addEventListener('load', unlockMusicOnce);

async function applyWalletForLevel(levelNumber) {
  const numeric = Math.floor(Number(levelNumber) || 1);
  const index = Math.max(0, Math.min(LEVELS.length - 1, numeric - 1));
  const assets = await ensureLevelAssets(index);
  if (assets.wallet) {
    setWalletSprite(assets.wallet);
  }
  return assets;
}

const originalSetSoundEnabled = typeof window.setSoundEnabled === 'function'
  ? window.setSoundEnabled
  : null;

window.setSoundEnabled = function patchedSetSoundEnabled(enabled) {
  if (originalSetSoundEnabled) {
    originalSetSoundEnabled(enabled);
  }
  musicEnabled = !!enabled;
  if (!musicEnabled) {
    tryFadeOut(currentMusic);
    stopInterLevelAudio();
  } else {
    safePlayMusic(currentMusic);
  }
};

window.LEVELS = LEVELS;

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

function normalizeProgressLevel(level){
  const numeric = Number.isFinite(level) ? level : Number(level) || 1;
  const clamped = Math.min(Math.max(Math.floor(numeric), 1), LEVELS.length);
  return clamped;
}

async function applyProgressSnapshot(snapshot){
  if (!snapshot || !game) return;
  const levelNumber = normalizeProgressLevel(snapshot.level || 1);
  const levelIndex = Math.max(0, levelNumber - 1);

  try {
    await loadLevel(levelIndex, { applyBackground: false, playMusic: false });
  } catch (error) {
    console.warn('[progress] unable to preload level for hydration', { error, levelIndex });
  }

  const restoredScore = Number.isFinite(snapshot.score)
    ? snapshot.score
    : Number(snapshot.score) || 0;
  const restoredLives = Number.isFinite(snapshot.lives)
    ? Math.max(0, Math.floor(snapshot.lives))
    : levelState?.lives || 0;
  const restoredTime = Number.isFinite(snapshot.timeLeft)
    ? Math.max(0, Math.round(snapshot.timeLeft))
    : Math.max(0, Math.round(levelState?.timeLimit || 0));

  currentLevelIndex = levelIndex;
  window.currentLevelIndex = currentLevelIndex;

  score = restoredScore;
  lives = restoredLives;
  timeLeft = restoredTime;

  if (game) {
    game.score = restoredScore;
    game.lives = restoredLives;
    game.timeLeft = restoredTime;
    game.levelReached = Math.max(game.levelReached || 1, levelNumber);
    if (typeof game.render === 'function') {
      game.render();
    }
  }

  if (typeof setHUDScore === 'function') setHUDScore(restoredScore);
  if (typeof setHUDLives === 'function') setHUDLives(restoredLives);
  if (typeof setHUDTime === 'function') setHUDTime(restoredTime);

  hasAppliedProgressSnapshot = true;

  console.info('[progress] applied saved snapshot', debugFormatContext({ levelNumber, restoredScore, restoredLives, restoredTime }));
}

async function applyPendingProgressIfPossible(){
  if (!pendingProgressSnapshot || !game || progressHydrationInFlight) return;
  progressHydrationInFlight = applyProgressSnapshot(pendingProgressSnapshot)
    .catch((error) => console.warn('[progress] hydration failed', error))
    .finally(() => {
      pendingProgressSnapshot = null;
      progressHydrationInFlight = null;
    });
  await progressHydrationInFlight;
}

async function syncProgressFromAuthState(state){
  const service = getProgressService();
  const playerId = state?.profile?.id || null;

  if (!service || !playerId || !state?.user) {
    pendingProgressSnapshot = null;
    lastProgressPlayerId = null;
    latestProgressSyncPromise = Promise.resolve();
    return;
  }

  if (playerId === lastProgressPlayerId && pendingProgressSnapshot === null) {
    return;
  }

  lastProgressPlayerId = playerId;

  latestProgressSyncPromise = (async () => {
    try {
      const snapshot = await service.loadProgress();
      pendingProgressSnapshot = snapshot;
      await applyPendingProgressIfPossible();
    } catch (error) {
      console.warn('[progress] failed to load progression', error);
    }
  })();

  await latestProgressSyncPromise;
}

async function waitForInitialProgressHydration(){
  // Wait for any in-flight Supabase progress retrieval triggered by auth hydration
  // before loading the initial level, so saved snapshots take priority over
  // default level initialization.
  let lastSeenPromise = null;
  while (true) {
    const current = latestProgressSyncPromise || Promise.resolve();
    if (current === lastSeenPromise) break;
    lastSeenPromise = current;
    try {
      await current;
    } catch (error) {
      console.warn('[progress] sync wait failed', error);
    }
    if (current === latestProgressSyncPromise) break;
  }

  if (progressHydrationInFlight) {
    try {
      await progressHydrationInFlight;
    } catch (error) {
      console.warn('[progress] hydration wait failed', error);
    }
  }
}

async function persistProgressSnapshot(reason = 'unspecified'){
  const service = getProgressService();
  if (!service) return;

  const levelNumber = Math.max(1, (Number.isFinite(currentLevelIndex) ? Math.floor(currentLevelIndex) : 0) + 1);
  const snapshot = {
    level: levelNumber,
    score: Number.isFinite(score) ? score : Number(score) || 0,
    lives: Number.isFinite(lives) ? Math.max(0, Math.floor(lives)) : 0,
    timeLeft: Number.isFinite(timeLeft) ? Math.max(0, Math.round(timeLeft)) : null,
    state: {
      reason,
      level: levelNumber,
      gameState,
      updatedAt: new Date().toISOString(),
    },
  };

  try {
    await service.saveProgress(snapshot);
  } catch (error) {
    console.warn('[progress] failed to save progression', error);
  }
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

const INPUT = usePointerEventsForMouse
  ? {
    tap: 'pointerdown',
    down: 'pointerdown',
    move: 'pointermove',
    up: 'pointerup',
    cancel: 'pointercancel',
  }
  : {
    tap: hasTouch ? 'touchstart' : 'click',
    down: hasTouch ? 'touchstart' : 'mousedown',
    move: hasTouch ? 'touchmove' : 'mousemove',
    up:   hasTouch ? 'touchend'  : 'mouseup',
    cancel: hasTouch ? 'touchcancel' : null,
  };

const SCREEN_NAME_ALIASES = {
  playing: 'running',
  run: 'running',
  running: 'running',
  title: 'title',
  home: 'title',
  paused: 'paused',
  pause: 'paused',
  inter: 'interLevel',
  interlevel: 'interLevel',
  settings: 'settings',
  over: 'gameover',
  gameover: 'gameover',
  legend: 'interLevel',
};

let activeScreen = 'boot';
let lastNonSettingsScreen = 'boot';
const NAV_SCREEN_LOG_TARGETS = new Set(['title', 'running', 'paused', 'interLevel', 'settings', 'gameover']);

function isFormFieldElement(el) {
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') return true;
  if (el.isContentEditable) return true;
  const role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null;
  return role === 'textbox' || role === 'combobox' || role === 'searchbox';
}

function getFocusedElementForShortcuts(evt) {
  if (evt && evt.target && evt.target !== window && evt.target !== document) {
    return evt.target;
  }
  if (typeof document !== 'undefined') {
    return document.activeElement;
  }
  return null;
}

function shouldBlockGameplayShortcuts(evt) {
  const focusEl = getFocusedElementForShortcuts(evt);
  const blockedByFocus = isFormFieldElement(focusEl);
  const blockedByScreen = activeScreen === 'account';
  if (blockedByFocus || blockedByScreen) {
    console.info(
      `[input] ignore global key${debugFormatContext({
        reason: blockedByScreen ? 'account' : 'form-focus',
        key: evt?.key,
        code: evt?.code,
        screen: activeScreen,
        target: debugDescribeElement(focusEl),
      })}`
    );
    return true;
  }
  return false;
}

function normalizeScreenName(name) {
  if (typeof name !== 'string' || name.trim() === '') return 'unknown';
  const key = name.trim();
  const lower = key.toLowerCase();
  return SCREEN_NAME_ALIASES[lower] || key;
}

function logNavigation(target, context = {}) {
  const navContext = debugFormatContext(context);
  console.info(`[nav] goto(${target})${navContext}`);
}

function setActiveScreen(next, context = {}) {
  const normalized = normalizeScreenName(next);
  const prev = activeScreen;
  const sameScreen = normalized === prev;
  const info = { from: prev, ...(context && typeof context === 'object' ? context : {}) };
  if (sameScreen) {
    console.info(`[state] setActiveScreen: ${prev} (unchanged)${debugFormatContext(info)}`);
    return normalized;
  }
  activeScreen = normalized;
  if (normalized !== 'settings' && normalized !== 'unknown') {
    lastNonSettingsScreen = normalized;
  }
  console.info(`[state] setActiveScreen: ${prev} -> ${normalized}${debugFormatContext(info)}`);
  if (NAV_SCREEN_LOG_TARGETS.has(normalized)) {
    logNavigation(normalized, info);
  }
  return normalized;
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

const DEFAULT_AUTH_FRONT_STATE = Object.freeze({
  enabled: false,
  ready: false,
  loading: true,
  user: null,
  profile: null,
  lastError: null,
});

let authState = { ...DEFAULT_AUTH_FRONT_STATE };
let authFacade = null;
let authUnsubscribe = null;
let authBridgeAttempts = 0;
let authBridgeTimer = null;
let pendingProgressSnapshot = null;
let lastProgressPlayerId = null;
let progressHydrationInFlight = null;
let latestProgressSyncPromise = Promise.resolve();
let hasAppliedProgressSnapshot = false;

function getAuthService(){
  if (authFacade) return authFacade;
  if (typeof window !== 'undefined' && window.SaltAuth) {
    authFacade = window.SaltAuth;
  }
  return authFacade;
}

function getProgressService(){
  if (typeof window !== 'undefined' && window.ProgressController) {
    return window.ProgressController;
  }
  return null;
}

function getAuthStateSnapshot(){
  return authState;
}

function handleAuthStateUpdate(nextState){
  authState = { ...DEFAULT_AUTH_FRONT_STATE, ...(nextState || {}) };
  updateTitleAccountStatus();
  refreshAccountPanelIfVisible();
  syncProgressFromAuthState(authState);
}

function updateTitleAccountStatus(){
  if (typeof document === 'undefined') return;
  const statusEl = document.getElementById('titleAccountStatus');
  const buttonEl = document.getElementById('btnAccount');
  if (!statusEl && !buttonEl) return;
  const state = getAuthStateSnapshot();
  const username = state?.profile?.username || state?.user?.username || '';
  let statusText = 'Connexion en cours…';
  if (!state.enabled && !state.loading) {
    statusText = 'Compte indisponible';
  } else if (state.user) {
    statusText = username ? `Connecté : ${username}` : 'Connecté';
  } else if (state.ready) {
    statusText = 'Non connecté';
  } else if (state.lastError) {
    statusText = 'Service indisponible';
  }
  if (statusEl) {
    statusEl.textContent = statusText;
  }
  if (buttonEl) {
    buttonEl.dataset.accountState = state.user ? 'signed-in' : 'signed-out';
    buttonEl.disabled = false;
  }
}

function refreshAccountPanelIfVisible(){
  const overlayEl = overlay || (typeof document !== 'undefined' ? document.getElementById('overlay') : null);
  if (!overlayEl || typeof overlayEl.querySelector !== 'function') return;
  const isAccountPanel = overlayEl.querySelector('[data-account-panel]');
  if (!isAccountPanel) return;
  if (!game || typeof game.renderAccountPanel !== 'function') return;
  game.renderAccountPanel({ keepMode: true });
}

function tryConnectAuthFacade(){
  if (authFacade || typeof window === 'undefined') return;
  const candidate = window.SaltAuth;
  if (candidate && typeof candidate.onChange === 'function') {
    authFacade = candidate;
    if (typeof candidate.getState === 'function') {
      try {
        authState = { ...DEFAULT_AUTH_FRONT_STATE, ...candidate.getState() };
      } catch (error) {
        console.warn('[auth] failed to read initial state', error);
      }
    }
    authUnsubscribe = candidate.onChange(handleAuthStateUpdate);
    syncProgressFromAuthState(authState);
    updateTitleAccountStatus();
    return;
  }
  if (authBridgeAttempts > 20) {
    return;
  }
  authBridgeAttempts += 1;
  if (authBridgeTimer) {
    clearTimeout(authBridgeTimer);
  }
  authBridgeTimer = setTimeout(tryConnectAuthFacade, 350);
}

const HTML_ESCAPE_LOOKUP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value){
  if (value === undefined || value === null) return '';
  return String(value).replace(/[&<>"']/g, (char)=>HTML_ESCAPE_LOOKUP[char] || char);
}

const EMAIL_VALIDATION_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,15}$/;

function isValidEmail(value){
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 3 && EMAIL_VALIDATION_PATTERN.test(trimmed);
}

function isValidPassword(value){
  return typeof value === 'string' && value.length >= 6;
}

function isValidUsername(value){
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return USERNAME_PATTERN.test(trimmed);
}

tryConnectAuthFacade();

function enterTitleScreen() {
  setActiveScreen('title', { via: 'enterTitleScreen' });
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.add('is-title');
  }
  if (typeof overlay !== 'undefined' && overlay) {
    overlay.classList.remove('overlay-rules');
    overlay.classList.add('overlay-title');
  }
  playMenuMusic();
}

function leaveTitleScreen({ stopMusic = true } = {}) {
  setActiveScreen('running', { via: 'leaveTitleScreen' });
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.remove('is-title');
  }
  if (typeof overlay !== 'undefined' && overlay) {
    overlay.classList.remove('overlay-title');
  }
  if (stopMusic) {
    stopMenuMusic();
  }
}

// --- État "niveaux" ---
let currentLevelIndex = 0; // 0 → LEVELS[0] = niveau 1
let levelState = { targetScore: 0, timeLimit: 0, lives: 0 };

// --- Game state & guards ---
let gameState = "playing";  // "playing" | "paused" | "inter"
let levelEnded = false;

function canEndLevel(){
  return !levelEnded && gameState === "playing";
}

/* global */ let score = 0;   // nombre
/* global */ let streak = 0;  // nombre
/* global */ let combo = 1.0; // nombre (ex: 1.0)
/* global */ let timeLeft = 0;// nombre (secondes)
/* global */ let lives = 0;   // nombre

// Spawning/inputs/animations toggles
let spawningEnabled = true;
let inputEnabled = true;

const directionalSourceState = {
  keyboardLeft: false,
  keyboardRight: false,
  touchLeft: false,
  touchRight: false,
};

let leftPressed = false;
let rightPressed = false;
let activeControlMode = hasTouch ? 'swipe' : 'swipe';

function recomputeDirectionalState() {
  leftPressed = directionalSourceState.keyboardLeft || directionalSourceState.touchLeft;
  rightPressed = directionalSourceState.keyboardRight || directionalSourceState.touchRight;
}

function resetDirectionalInputs() {
  directionalSourceState.keyboardLeft = false;
  directionalSourceState.keyboardRight = false;
  directionalSourceState.touchLeft = false;
  directionalSourceState.touchRight = false;
  leftPressed = false;
  rightPressed = false;
}

function setActiveControlMode(mode) {
  const normalized = (mode === 'zones' && hasTouch) ? 'zones' : 'swipe';
  activeControlMode = normalized;

  if (normalized === 'zones') {
    directionalSourceState.touchLeft = false;
    directionalSourceState.touchRight = false;
    recomputeDirectionalState();
    if (typeof input !== 'undefined') {
      resetPointerDragState({ releaseCapture: true });
    }
  } else if (directionalSourceState.touchLeft || directionalSourceState.touchRight) {
    directionalSourceState.touchLeft = false;
    directionalSourceState.touchRight = false;
    recomputeDirectionalState();
  }
}

function isTouchZoneModeActive() {
  return hasTouch && activeControlMode === 'zones';
}

function stopSpawningItems(){
  spawningEnabled = false;
  if (game?.spawner) {
    game.spawner.acc = 0;
  }
}

function pauseAllAnimations(){
  if (window.gsap?.globalTimeline) {
    gsap.globalTimeline.pause();
  }
}

function disablePlayerInput(reason = 'unspecified'){
  inputEnabled = false;
  console.info(`[input] disable player input${debugFormatContext({ reason, screen: activeScreen })}`);
  if (typeof input !== "undefined") {
    resetPointerDragState({ releaseCapture: true });
    input.dash = false;
  }
  resetDirectionalInputs();
}

function resumeAllAnimations(){
  if (window.gsap?.globalTimeline) {
    gsap.globalTimeline.resume();
  }
}

function enablePlayerInput(reason = 'unspecified'){
  inputEnabled = true;
  console.info(`[input] enable player input${debugFormatContext({ reason, screen: activeScreen })}`);
  if (typeof input !== "undefined") {
    resetPointerDragState({ releaseCapture: true });
    input.dash = false;
  }
}

function hardResetRuntime(){
  if (typeof items !== "undefined" && Array.isArray(items)) {
    items.length = 0;
  }
  if (Array.isArray(game?.items)) {
    game.items.length = 0;
  }
  if (game?.spawner) {
    game.spawner.acc = 0;
  }
  if (game?.fx?.clearAll) {
    game.fx.clearAll();
  }
  resetActiveBonuses();
  resetShieldState({ silent: true });
  resetControlInversion({ silent: true });
  if (window.gsap) {
    gsap.killTweensOf("*");
  }
}

async function loadLevel(index, options = {}) {
  if (index < 0 || index >= LEVELS.length) return;

  const {
    applyBackground = true,
    playMusic = true,
  } = options;

  const L = LEVELS[index];
  currentLevelIndex = index;
  window.currentLevelIndex = currentLevelIndex;

  updateFallSpeedForLevel(index);

  const endless = !!L.endless;

  levelState.targetScore = endless
    ? Number.POSITIVE_INFINITY
    : (Number.isFinite(L.targetScore) ? L.targetScore : 0);
  levelState.timeLimit   = L.timeLimit;
  levelState.lives       = L.lives;

  resetIntraLevelSpeedRamp(levelState.timeLimit);

  const instance = game || Game.instance || null;
  const { bg, wallet, music } = await ensureLevelAssets(index);

  score    = 0;
  streak   = 0;
  combo    = 1.0;
  timeLeft = L.timeLimit;
  lives    = L.lives;

  if (instance) {
    instance.score = 0;
    instance.comboStreak = 0;
    instance.comboMult = comboTiers[0]?.mult ?? 1.0;
    instance.maxCombo = 0;
    instance.timeLeft = L.timeLimit;
    instance.timeElapsed = 0;
    instance.lives = L.lives;
    instance.targetScore = endless
      ? Number.POSITIVE_INFINITY
      : L.targetScore;
    if (instance.arm && typeof instance.arm.applyLevelSpeed === "function") {
      instance.arm.applyLevelSpeed(index + 1);
    }
  }

  if (applyBackground) {
    const bgSrc = bg?.src || L.background;
    if (bgSrc) {
      applyLevelBackground(bgSrc);
    }
  }
  if (playMusic) {
    setLevelMusic(music);
  }
  setWalletSprite(wallet);

  if (index + 1 < LEVELS.length) {
    ensureLevelAssets(index + 1);
  }

  hideLegendResultScreen();

  if (typeof setHUDScore === "function") setHUDScore(score);
  if (typeof setHUDLives === "function") setHUDLives(lives);
  if (typeof setHUDTime  === "function") setHUDTime(timeLeft);
}

async function startLevel1() {
  await loadLevel(0, { applyBackground: false, playMusic: false });
}

function checkEndConditions(){
  if (!canEndLevel()) return;

  if (isLegendLevel()) {
    if (timeLeft <= 0 || lives <= 0) {
      endLegendRun(timeLeft <= 0 ? "time" : "lives");
    }
    return;
  }

  if (Number.isFinite(levelState.targetScore) && score >= levelState.targetScore && lives > 0 && timeLeft > 0){
    endLevel("win");
    return;
  }

  if (timeLeft <= 0 || lives <= 0){
    endLevel("lose");
    return;
  }
}

function finalizeLevelTransition(afterStop){
  if (!canEndLevel()) return false;

  levelEnded = true;
  gameState = "inter";

  stopSpawningItems();
  pauseAllAnimations();
  disablePlayerInput('finalizeLevelTransition');

  if (game) {
    game.state = "inter";
    if (typeof game.render === "function") {
      game.render();
    }
  }

  window.__saltDroppeeLoopStarted = false;

  stopLevelMusic();

  if (typeof afterStop === "function") {
    afterStop();
  }

  return true;
}

function endLevel(result){
  finalizeLevelTransition(() => showInterLevelScreen(result));
}

function isLegendLevel(index = currentLevelIndex) {
  if (LEGEND_LEVEL_INDEX < 0) return false;
  const numericIndex = Number(index);
  if (!Number.isFinite(numericIndex)) return false;
  return Math.max(0, Math.floor(numericIndex)) === LEGEND_LEVEL_INDEX;
}

function endLegendRun(reason = "time") {
  finalizeLevelTransition(() => showLegendResultScreen(reason));
}

window.loadLevel = loadLevel;

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
  fakeAirdrop: FakeADImg,
  anvil: AnvilImg,
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

// --- Control inversion state (Fake Airdrop malus) ---
const controlInversionState = {
  active: false,
  timeLeft: 0,
};

function getControlInversionDuration(duration) {
  const custom = Number(duration);
  if (Number.isFinite(custom) && custom > 0) {
    return custom;
  }
  const configValue = Number(CONFIG?.malus?.fakeAirdropDuration);
  if (Number.isFinite(configValue) && configValue > 0) {
    return configValue;
  }
  return 5;
}

function resetControlInversion(options = {}) {
  void options;
  const instance = game || Game.instance || null;
  if (instance?.effects) {
    instance.effects.invert = 0;
  }
  controlInversionState.active = false;
  controlInversionState.timeLeft = 0;
}

function applyControlInversion(gameInstance, duration) {
  const instance = gameInstance || game || Game.instance || null;
  if (!instance) return;

  if (!instance.effects) {
    instance.effects = {};
  }

  const totalDuration = getControlInversionDuration(duration);
  instance.effects.invert = totalDuration;
  controlInversionState.timeLeft = totalDuration;
  controlInversionState.active = true;
}

function controlsAreInverted() {
  const instance = game || Game.instance || null;
  if (!instance?.effects) return false;
  return (Number(instance.effects.invert) || 0) > 0;
}

function updateControlInversionTimer(gameInstance, dt) {
  if (!gameInstance?.effects) return;

  let remaining = Number(gameInstance.effects.invert) || 0;
  if (remaining <= 0) {
    gameInstance.effects.invert = 0;
    if (controlInversionState.active) {
      controlInversionState.active = false;
      controlInversionState.timeLeft = 0;
    }
    return;
  }

  remaining = Math.max(0, remaining - dt);
  gameInstance.effects.invert = remaining;
  controlInversionState.timeLeft = remaining;
  if (remaining <= 0 && controlInversionState.active) {
    controlInversionState.active = false;
    controlInversionState.timeLeft = 0;
  }
}

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
    applyControlInversion(gameInstance, CONFIG?.malus?.fakeAirdropDuration);
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
footerImg.src = 'assets/footer.webp';

// --- Main (2 frames)
const Hand = { open:new Image(), pinch:new Image(), ready:false };
Hand.open.src  = 'assets/main_open.png';
Hand.pinch.src = 'assets/main_pince.png';
Promise.all([
  new Promise(r => Hand.open.onload = r),
  new Promise(r => Hand.pinch.onload = r),
]).then(()=> Hand.ready = true);

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
  malus: { fakeAirdropDuration: 5 },

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

const BASE_FALL_DURATION = CONFIG.fallDuration ?? 3;
let currentFallDuration = BASE_FALL_DURATION;

const INTRA_LEVEL_SPEED_RAMP_TARGET = 0.20;
const levelSpeedRampState = {
  progress: 0,
  multiplier: 1,
  duration: 0,
};

function resetIntraLevelSpeedRamp(duration){
  levelSpeedRampState.progress = 0;
  levelSpeedRampState.multiplier = 1;

  if (Number.isFinite(duration) && duration > 0){
    levelSpeedRampState.duration = duration;
    return;
  }

  if (Number.isFinite(levelState?.timeLimit) && levelState.timeLimit > 0){
    levelSpeedRampState.duration = levelState.timeLimit;
    return;
  }

  const fallback = Number(LEVELS?.[currentLevelIndex]?.timeLimit);
  const defaultDuration = (Number.isFinite(CONFIG?.runSeconds) && CONFIG.runSeconds > 0)
    ? CONFIG.runSeconds
    : 60;
  levelSpeedRampState.duration = (Number.isFinite(fallback) && fallback > 0) ? fallback : defaultDuration;
}

function updateIntraLevelSpeedRamp(gameInstance){
  if (!gameInstance){
    return levelSpeedRampState.multiplier;
  }

  const elapsed = Math.max(0, Number(gameInstance.timeElapsed) || 0);
  const baseDuration = (Number.isFinite(levelSpeedRampState.duration) && levelSpeedRampState.duration > 0)
    ? levelSpeedRampState.duration
    : Math.max(
        1,
        Number(levelState?.timeLimit)
        || Number(LEVELS?.[currentLevelIndex]?.timeLimit)
        || Number(CONFIG?.runSeconds)
        || 60
      );

  const progress = clamp(baseDuration > 0 ? elapsed / baseDuration : 1, 0, 1);
  levelSpeedRampState.progress = progress;
  levelSpeedRampState.multiplier = 1 + INTRA_LEVEL_SPEED_RAMP_TARGET * progress;
  return levelSpeedRampState.multiplier;
}

function getCurrentIntraLevelSpeedMultiplier(){
  return levelSpeedRampState.multiplier || 1;
}

const LEVEL_SPEED_MULTIPLIERS = [1.0, 1.05, 1.10, 1.15, 1.20, 1.26];

function getLevelSpeedMultiplier(levelIndex) {
  const numericIndex = Number(levelIndex);
  const safeIndex = Number.isFinite(numericIndex) ? numericIndex : 0;
  const clampedIndex = Math.max(0, Math.floor(safeIndex));
  return LEVEL_SPEED_MULTIPLIERS[clampedIndex] ?? (1 + 0.05 * clampedIndex);
}

function updateFallSpeedForLevel(levelIndex) {
  const multiplier = getLevelSpeedMultiplier(levelIndex);
  currentFallDuration = BASE_FALL_DURATION / multiplier;
  CONFIG.fallDuration = currentFallDuration;
}

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

function describeCanvasRegionFromPoint(point) {
  if (!point || !Number.isFinite(point.y)) return '#canvas';
  const baseH = BASE_H;
  const y = point.y;
  const wallet = game?.wallet;
  const walletBottom = wallet ? (wallet.y + wallet.h) : (baseH - 96);
  const footerThreshold = baseH - 4;
  if (y >= footerThreshold) {
    return '#footer';
  }
  if (y >= walletBottom) {
    return '#controlZone';
  }
  return '#canvas';
}

function classifyPointerTarget(evt, point) {
  if (!evt) return 'unknown';
  const target = evt.target;
  if (target === window) return 'window';
  if (target === document || target === document?.body) return 'document';
  const closest = typeof target?.closest === 'function' ? (sel) => target.closest(sel) : () => null;
  if (closest('#interLevelScreen')) return '#interLevel';
  if (closest('#legendResultScreen')) return '#interLevel';
  if (closest('#overlay')) {
    if (activeScreen === 'settings') return '#settings';
    if (activeScreen === 'paused') return '#pauseOverlay';
    if (activeScreen === 'title') return '#titleOverlay';
    if (activeScreen === 'gameover') return '#gameoverOverlay';
    if (activeScreen === 'legend') return '#legendOverlay';
    return '#overlay';
  }
  if (canvas && (target === canvas || closest('#gameCanvas'))) {
    return describeCanvasRegionFromPoint(point);
  }
  if (target && target.id) return `#${target.id}`;
  return debugDescribeElement(target);
}

function logPointerTrace(eventName, evt, meta = {}) {
  const { point, ...rest } = (meta && typeof meta === 'object') ? meta : {};
  const logicalTarget = classifyPointerTarget(evt, point);
  const info = { screen: activeScreen, ...rest };
  if (typeof evt?.pointerId === 'number') info.pointerId = evt.pointerId;
  if (typeof evt?.pointerType === 'string') info.pointerType = evt.pointerType;
  if (!info.pointerType && typeof evt?.type === 'string') {
    if (evt.type.startsWith('mouse')) info.pointerType = 'mouse';
    if (evt.type.startsWith('touch')) info.pointerType = 'touch';
  }
  if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
    info.x = Math.round(point.x);
    info.y = Math.round(point.y);
  }
  console.info(`[input] ${eventName} target=${logicalTarget}${debugFormatContext(info)}`);
}

function positionHUD(){
  const canvasEl = document.getElementById('gameCanvas');
  const hud = document.getElementById('hud');
  if (!canvasEl || !hud) return;

  const rect = canvasEl.getBoundingClientRect();
  const offsetPx = Math.round(rect.height * 0.21);

  hud.style.setProperty('--hud-top', offsetPx + 'px');
}

window.addEventListener('load', positionHUD);
window.addEventListener('resize', positionHUD);

function showOverlay(el){
  if (!el) return;
  el.classList.add("show");
  if (typeof el.setAttribute === "function") {
    el.setAttribute("aria-hidden", "false");
  }
  if (typeof el.removeAttribute === "function") {
    try {
      el.removeAttribute("inert");
    } catch (err) {
      void err;
    }
  }
  if (el?.style) {
    el.style.pointerEvents = "auto";
  }
}

function hideOverlay(el){
  if (!el) return;
  el.classList.remove("show");
  if (typeof el.setAttribute === "function") {
    el.setAttribute("aria-hidden", "true");
  }
  if (typeof el.setAttribute === "function") {
    try {
      el.setAttribute("inert", "");
    } catch (err) {
      void err;
    }
  }
  if (el?.style) {
    el.style.pointerEvents = "none";
  }
  if (typeof document !== 'undefined' && typeof el.contains === 'function') {
    const active = document.activeElement;
    if (active && el.contains(active) && typeof active.blur === 'function') {
      active.blur();
    }
  }
}

function getOverlayElements() {
  if (typeof document === 'undefined') return [];
  const ids = ['overlay', 'interLevelScreen', 'legendResultScreen'];
  return ids
    .map((id) => document.getElementById(id))
    .filter((node) => !!node);
}

function deactivateOtherOverlays(activeEl) {
  const overlays = getOverlayElements();
  overlays.forEach((node) => {
    if (!node || node === activeEl) return;
    hideOverlay(node);
    if (node !== overlay && node.classList) {
      node.classList.remove('overlay-title', 'overlay-rules');
    }
  });
}

function showExclusiveOverlay(el) {
  if (!el) return;
  deactivateOtherOverlays(el);
  showOverlay(el);
}

function clearMainOverlay(except){
  const mainOverlay = overlay || document.getElementById("overlay");
  if (!mainOverlay || mainOverlay === except) return mainOverlay || null;

  mainOverlay.innerHTML = "";
  hideOverlay(mainOverlay);
  mainOverlay.classList.remove("overlay-title", "overlay-rules");
  return mainOverlay;
}

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

// --- Écran intermédiaire : show/hide ---
async function goToNextLevel(){
  const next = currentLevelIndex + 1;
  const lastIndex = Math.max(0, LEVELS.length - 1);

  hardResetRuntime();
  await loadLevel(Math.min(next, lastIndex));
  resumeGameplay();
}

function resumeGameplay(){
  hideLegendResultScreen();
  hideInterLevelScreen();
  setActiveScreen('running', { via: 'resumeGameplay' });
  levelEnded = false;
  gameState = "playing";
  spawningEnabled = true;
  resumeAllAnimations();
  enablePlayerInput('resumeGameplay');
  resetDirectionalInputs();

  if (game) {
    game.state = "playing";
    if (game.spawner) {
      game.spawner.acc = 0;
    }
    game.lastTime = performance.now();
    window.__saltDroppeeLoopStarted = false;
    score = game.score;
    lives = game.lives;
    timeLeft = game.timeLeft;
    game.loop();
  }
}

let lastInterLevelResult = "win";

function setInterLevelUiState(active) {
  const isActive = !!active;
  const body = typeof document !== 'undefined' ? document.body : null;
  const wrapper = document.getElementById('gameWrapper');
  const canvasEl = document.getElementById('gameCanvas');
  const hudEl = document.getElementById('hud');

  if (body) {
    body.classList.toggle('is-inter-level', isActive);
  }
  if (wrapper) {
    wrapper.classList.toggle('is-inter-level', isActive);
  }
  if (canvasEl) {
    canvasEl.setAttribute('aria-hidden', isActive ? 'true' : 'false');
  }
  if (hudEl) {
    hudEl.setAttribute('aria-hidden', isActive ? 'true' : 'false');
  }
}

function showInterLevelScreen(result = "win", options = {}){
  lastInterLevelResult = result;
  const screen = document.getElementById("interLevelScreen");
  const title  = document.getElementById("interTitle");
  const scoreText = document.getElementById("interScore");
  const btnNext = document.getElementById("btnNextLevel");
  if (!screen || !title || !scoreText) return;

  const opts = (options && typeof options === "object") ? options : {};
  const screenAlreadyVisible = screen.classList.contains("show");

  clearMainOverlay(screen);

  setActiveScreen('interLevel', { via: 'showInterLevelScreen', result });

  if (!screenAlreadyVisible) {
    // Synchronisation de la progression Supabase à chaque fin de niveau / game over.
    persistProgressSnapshot(result === "win" ? "level-complete" : "game-over");
  }

  if (typeof Game !== "undefined" && Game.instance) {
    Game.instance.settingsReturnView = "inter";
  }

  title.textContent = (result === "win") ? "Niveau terminé 🎉" : "Game Over 💀";
  const numericScore = Number.isFinite(score) ? score : Number(window.score) || 0;
  const formattedScore = typeof formatScore === "function"
    ? formatScore(numericScore)
    : String(numericScore | 0);
  scoreText.textContent = "Score : " + formattedScore;

  const levelIndex = Math.max(0, Number.isFinite(currentLevelIndex) ? Math.floor(currentLevelIndex) : 0);
  const nextIndex = Math.min(levelIndex + 1, LEVELS.length - 1);
  const isLegend = isLegendLevel(levelIndex);
  const nextIsLegend = isLegendLevel(nextIndex);

  if (btnNext){
    let nextLabel = "Rejouer";
    if (result === "win") {
      nextLabel = nextIsLegend ? "Passer au mode Légende" : "Niveau suivant";
    }

    btnNext.textContent = nextLabel;
    btnNext.onclick = async () => {
      hideInterLevelScreen();
      if (result === "win"){
        await goToNextLevel();
      } else {
        hardResetRuntime();
        await loadLevel(currentLevelIndex);
        resumeGameplay();
      }
    };
  }

  const backgroundSrc = INTER_LEVEL_BACKGROUNDS[levelIndex];
  const shouldUseInterVisuals = result === "win" && backgroundSrc && !isLegend;

  screen.classList.toggle("inter-win", !!shouldUseInterVisuals);

  if (shouldUseInterVisuals) {
    applyLevelBackground(backgroundSrc);
    const shouldPlayAudio = opts.replaySound !== false && !screenAlreadyVisible;
    if (shouldPlayAudio) {
      playInterLevelAudioForLevel(levelIndex);
    }
  } else {
    stopInterLevelAudio();
  }

  setInterLevelUiState(true);
  showExclusiveOverlay(screen);
}

function showLegendResultScreen(reason = "time"){
  void reason;
  hideInterLevelScreen();

  const screen = document.getElementById("legendResultScreen");
  const title = document.getElementById("legendTitle");
  const message = document.getElementById("legendMessage");
  if (!screen) return;

  clearMainOverlay(screen);

  setActiveScreen('interLevel', { via: 'showLegendResultScreen', reason });

  // Sauvegarde également l'échec / réussite du mode Légende côté Supabase.
  persistProgressSnapshot(`legend-${reason || 'end'}`);

  if (typeof Game !== "undefined" && Game.instance) {
    Game.instance.settingsReturnView = "legend";
  }

  if (title) {
    title.textContent = "Mode Légende";
  }

  const numericScore = Number.isFinite(score) ? score : Number(window.score) || 0;
  const formattedScore = typeof formatScore === "function"
    ? formatScore(numericScore)
    : String(numericScore | 0);

  if (message) {
    message.textContent = `Félicitations, votre score est de ${formattedScore}.`;
  }

  showExclusiveOverlay(screen);
}

function hideLegendResultScreen(){
  const screen = document.getElementById("legendResultScreen");
  if (!screen) return;
  hideOverlay(screen);
}

function hideInterLevelScreen(){
  const screen = document.getElementById("interLevelScreen");
  stopInterLevelAudio();
  setInterLevelUiState(false);
  if (!screen) return;
  hideOverlay(screen);
}

// --- Boutons ---
function bindInterLevelButtons(){
  const bNext = document.getElementById("btnNextLevel");
  const bSave = document.getElementById("btnSaveQuit");

  if (bNext){
    bNext.onclick = () => {
      hideInterLevelScreen();
      goToNextLevel();
    };
  }

  if (bSave){
    bSave.onclick = () => {
      hideInterLevelScreen();
      if (typeof playSound === "function") {
        playSound("click");
      }

      const instance = (typeof Game !== "undefined" && Game.instance)
        ? Game.instance
        : null;

      if (instance && typeof instance.reset === "function") {
        instance.reset({ showTitle: true });
        return;
      }

      setInterLevelUiState(false);
      enterTitleScreen();
      const mainOverlay = overlay || document.getElementById("overlay");
      if (mainOverlay) {
        mainOverlay.innerHTML = "";
        hideOverlay(mainOverlay);
      }
      setBackgroundImageSrc(MENU_BACKGROUND_SRC);
    };
  }
}

function bindLegendResultButtons(){
  const btnHome = document.getElementById("legendHomeButton");
  const btnRetry = document.getElementById("legendRetryButton");

  if (btnHome){
    btnHome.onclick = async () => {
      if (typeof playSound === "function") playSound("click");
      hideLegendResultScreen();
      const instance = Game.instance;
      currentLevelIndex = 0;
      if (instance) {
        instance.reset({ showTitle: true });
      } else {
        hardResetRuntime();
        await loadLevel(0, { applyBackground: false, playMusic: false });
      }
    };
  }

  if (btnRetry){
    btnRetry.onclick = async () => {
      if (typeof playSound === "function") playSound("click");
      hideLegendResultScreen();
      hardResetRuntime();
      const legendIndex = LEGEND_LEVEL_INDEX >= 0 ? LEGEND_LEVEL_INDEX : currentLevelIndex;
      await loadLevel(legendIndex);
      resumeGameplay();
    };
  }
}

// --- Test manuel temporaire : appuyer sur 'i' pour afficher l’écran ---
addEvent(window, 'keydown', (e) => {
  if (shouldBlockGameplayShortcuts(e)) return;
  if (e.key === "i" || e.key === "I") {
    console.info('[nav] debug shortcut -> interLevel');
    showInterLevelScreen("win");
  }
});

// Appeler le binding après chargement du DOM / init jeu
window.addEventListener("load", bindInterLevelButtons);
window.addEventListener("load", bindLegendResultButtons);

window.showInterLevelScreen = showInterLevelScreen;
window.hideInterLevelScreen = hideInterLevelScreen;

// =====================
// INPUT
// =====================
const input = {
  dash: false,
  dragging: false,
  pointerLastX: null,
  pointerVirtualX: null,
  pointerInvertState: false,
  pointerId: null,
};

function resetPointerDragState(options = {}) {
  const { releaseCapture = false, pointerId = null } = options;
  const activePointerId = Number.isInteger(pointerId) ? pointerId : input.pointerId;

  if (
    releaseCapture &&
    Number.isInteger(activePointerId) &&
    canvas &&
    typeof canvas.releasePointerCapture === 'function'
  ) {
    try {
      canvas.releasePointerCapture(activePointerId);
    } catch (err) {
      // ignore capture release errors
    }
  }

  input.dragging = false;
  input.pointerLastX = null;
  input.pointerVirtualX = null;
  input.pointerInvertState = controlsAreInverted();
  input.pointerId = null;
}

function getRawHorizontalAxis() {
  if (leftPressed && !rightPressed) return -1;
  if (rightPressed && !leftPressed) return 1;
  return 0;
}

function getEffectiveHorizontalAxis() {
  const axis = getRawHorizontalAxis();
  return controlsAreInverted() ? -axis : axis;
}

function getWalletCenter(walletRef) {
  if (!walletRef) return BASE_W / 2;
  return walletRef.x + walletRef.w / 2;
}

function isTouchLikeEvent(evt) {
  if (!evt) return false;
  if (typeof evt.pointerType === 'string') {
    return evt.pointerType === 'touch';
  }
  const type = evt.type;
  return typeof type === 'string' && type.startsWith('touch');
}

function isMatchingPointer(evt) {
  if (!evt || typeof evt.pointerId !== 'number') return true;
  if (!Number.isInteger(input.pointerId)) return true;
  return evt.pointerId === input.pointerId;
}

function handleTouchZoneEvent(evt) {
  if (!isTouchZoneModeActive()) {
    if (directionalSourceState.touchLeft || directionalSourceState.touchRight) {
      directionalSourceState.touchLeft = false;
      directionalSourceState.touchRight = false;
      recomputeDirectionalState();
    }
    return false;
  }

  if (!inputEnabled) {
    if (directionalSourceState.touchLeft || directionalSourceState.touchRight) {
      directionalSourceState.touchLeft = false;
      directionalSourceState.touchRight = false;
      recomputeDirectionalState();
    }
    return true;
  }

  const wallet = game?.wallet;
  const touches = evt?.touches || evt?.changedTouches || (evt?.pointerType === 'touch' ? [evt] : null);
  if (!wallet || !touches) {
    if (directionalSourceState.touchLeft || directionalSourceState.touchRight) {
      directionalSourceState.touchLeft = false;
      directionalSourceState.touchRight = false;
      recomputeDirectionalState();
    }
    return true;
  }

  const zoneTop = clamp(wallet.y + wallet.h, 0, BASE_H);
  const zoneBottom = BASE_H;
  const zoneHeight = zoneBottom - zoneTop;

  let leftActive = false;
  let rightActive = false;

  if (zoneHeight > 0 && canvas) {
    for (let i = 0; i < touches.length; i += 1) {
      const touch = touches[i];
      if (!touch) continue;
      const point = projectClientToCanvas(touch.clientX, touch.clientY);
      if (point.y < zoneTop || point.y > zoneBottom) continue;
      if (point.x < BASE_W / 2) {
        leftActive = true;
      } else {
        rightActive = true;
      }
      if (leftActive && rightActive) break;
    }
  }

  directionalSourceState.touchLeft = leftActive;
  directionalSourceState.touchRight = rightActive;
  recomputeDirectionalState();

  return true;
}
function onKeyDown(e){
  if (shouldBlockGameplayShortcuts(e)) return;
  const allowTitleStart = (e.code === 'Enter');
  const canTriggerTitleStart = allowTitleStart && activeScreen === 'title';
  if (!inputEnabled && !canTriggerTitleStart) return;

  if (!inputEnabled && canTriggerTitleStart){
    const g = Game.instance;
    if (g && g.state==='title'){
      playSound("click");
      requestAnimationFrame(()=> g.uiStartFromTitle());
    }
    return;
  }

  let changed = false;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA'){
    directionalSourceState.keyboardLeft = true;
    changed = true;
  }
  if (e.code === 'ArrowRight' || e.code === 'KeyD'){
    directionalSourceState.keyboardRight = true;
    changed = true;
  }
  if (changed) recomputeDirectionalState();
  if (e.code === 'Space') input.dash = true;
  if (canTriggerTitleStart){
    const g = Game.instance;
    if (g && g.state==='title'){
      playSound("click");
      requestAnimationFrame(()=> g.uiStartFromTitle());
    }
  }
}
function onKeyUp(e){
  if (shouldBlockGameplayShortcuts(e)) return;
  let changed = false;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
    directionalSourceState.keyboardLeft = false;
    changed = true;
  }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    directionalSourceState.keyboardRight = false;
    changed = true;
  }
  if (changed) recomputeDirectionalState();
  if (e.code === 'Space') input.dash = false;
}
function onPointerDown(e){
  const point = getCanvasPoint(e);
  if (isTouchLikeEvent(e) && handleTouchZoneEvent(e)) {
    logPointerTrace('pointerdown', e, { point, status: 'touch-zone-delegated' });
    return;
  }

  if (!inputEnabled) {
    logPointerTrace('pointerdown', e, { point, status: 'input-disabled' });
    resetPointerDragState({ releaseCapture: true });
    return;
  }

  logPointerTrace('pointerdown', e, { point, status: 'drag-start' });
  resetPointerDragState({ releaseCapture: true });

  if (typeof e.pointerId === 'number') {
    input.pointerId = e.pointerId;
    const target = e.target;
    if (target && typeof target.setPointerCapture === 'function') {
      try {
        target.setPointerCapture(e.pointerId);
      } catch (err) {
        // ignore capture errors
      }
    }
  } else {
    input.pointerId = null;
  }

  input.dragging = true;
  input.pointerLastX = point.x;
  input.pointerInvertState = controlsAreInverted();
  if (game && game.wallet) {
    input.pointerVirtualX = point.x;
    animateWalletToCenter(game.wallet, input.pointerVirtualX);
  } else {
    input.pointerVirtualX = point.x;
  }
}
function onPointerMove(e){
  if (isTouchLikeEvent(e) && handleTouchZoneEvent(e)) return;
  if (!inputEnabled || !input.dragging || !isMatchingPointer(e)) return;
  const point = getCanvasPoint(e);
  if (!game || !game.wallet) return;

  const inverted = controlsAreInverted();
  if (!Number.isFinite(input.pointerVirtualX)) {
    input.pointerVirtualX = Number.isFinite(targetX)
      ? targetX
      : getWalletCenter(game.wallet);
  }

  if (inverted !== input.pointerInvertState || !Number.isFinite(input.pointerLastX)) {
    input.pointerInvertState = inverted;
    input.pointerLastX = point.x;
    input.pointerVirtualX = Number.isFinite(targetX)
      ? targetX
      : getWalletCenter(game.wallet);
  }

  const delta = point.x - input.pointerLastX;
  input.pointerLastX = point.x;

  const direction = inverted ? -1 : 1;
  input.pointerVirtualX += direction * delta;
  animateWalletToCenter(game.wallet, input.pointerVirtualX);
}
function onPointerUp(e){
  const point = getCanvasPoint(e);
  if (isTouchLikeEvent(e) && handleTouchZoneEvent(e)) {
    logPointerTrace('pointerup', e, { point, status: 'touch-zone-delegated' });
    return;
  }
  if (!isMatchingPointer(e) && Number.isInteger(input.pointerId)) {
    logPointerTrace('pointerup', e, { point, status: 'non-matching-pointer' });
    return;
  }
  logPointerTrace('pointerup', e, { point, status: 'release' });
  const pointerId = typeof e.pointerId === 'number' ? e.pointerId : null;
  resetPointerDragState({ releaseCapture: true, pointerId });
}

const TG = window.Telegram?.WebApp; if (TG){ try{ TG.ready(); TG.expand(); }catch(e){} }

// =====================
// SETTINGS & STORAGE
// =====================
const LS = { bestScore:'sd_bestScore', bestCombo:'sd_bestCombo', settings:'sd_settings', runs:'sd_runs' };
const DefaultSettings = { sound:true, contrast:false, haptics:true, sensitivity:1.0, controlMode:'swipe' };
function loadSettings(){ try{ const raw = JSON.parse(localStorage.getItem(LS.settings))||{}; const merged = { ...DefaultSettings, ...raw }; merged.controlMode = (merged.controlMode === 'zones' && hasTouch) ? 'zones' : 'swipe'; return merged; }catch(e){ return {...DefaultSettings}; } }
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
  evolveByScore(score){
    if (!ENABLE_SCORE_BASED_WALLET) {
      return;
    }
    // --- ANCIEN CODE DÉSACTIVÉ ---
    const th = CONFIG.evolveThresholds;
    let lvl = 1;
    for (let i = 0; i < th.length; i++) {
      if (score >= th[i]) lvl = i + 1;
    }
    if (lvl !== this.level) {
      this.level = lvl;
      applyWalletForLevel(lvl);
      this.applyCaps();
      this.g.fx.burst(this.x, this.y, '#ffcd75', 12);
      playSound("bonusok");
      this.squashTimer = 0.12;
    }
  }
  update(dt){
    const sens = this.g.settings.sensitivity || 1.0;
    const bounds = computeWalletCenterBounds(this);
    const axis = getEffectiveHorizontalAxis();
    const moveDir = Math.sign(axis);

    if (input.dash && this.dashCD <= 0 && moveDir !== 0){
      const effectiveSpeed = CONFIG.wallet.dashSpeed * (this.slowTimer>0 ? 0.6 : 1.0) * sens;
      const dashDuration = Math.max(0.08, CONFIG.control.easeDuration * 0.5);
      const dashDistance = moveDir * effectiveSpeed * dashDuration;
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
    if (axis !== 0) {
      this.x += axis * moveSpeed * dt;
    }
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

const HAND_RIGHT_OVERFLOW_RATIO = 0.6;

class Arm{
  constructor(game){ this.g=game; this.t=0; this.frame=0; this.handX=BASE_W/2; this.spriteHCapPx=0; this.targetX=BASE_W/2; this.baseMoveSpeed=120; this.moveSpeed=this.baseMoveSpeed; this.level=1; this.retarget=0; this.baseRetargetMin=0.6; this.baseRetargetMax=1.8; this.baseMaxStep=140; this.baseJitter=0.05; this.activityFactor=1; this.minRetarget=this.baseRetargetMin; this.maxRetarget=this.baseRetargetMax; this.maxStep=this.baseMaxStep; this.maxIdleAtTarget=Infinity; this.jitterAmt=this.baseJitter; this._drawW=90; this._drawH=90; this._x=0; this._y=0; }
  applyCaps(){ const maxH = Math.floor(BASE_H * CONFIG.maxTopActorH); this.h = Math.min(Math.floor(BASE_H * 0.19), maxH); }
  applyLevelSpeed(levelNumber){
    const numeric = Number(levelNumber);
    const lvl = Number.isFinite(numeric) ? Math.max(1, Math.floor(numeric)) : 1;
    const multiplier = 1 + 0.05 * (lvl - 1);
    this.level = lvl;
    this.activityFactor = multiplier;
    this.moveSpeed = this.baseMoveSpeed * multiplier;
    this.maxStep = this.baseMaxStep * this.activityFactor;
    const intervalScale = 1 / this.activityFactor;
    this.minRetarget = Math.max(0.25, this.baseRetargetMin * intervalScale);
    this.maxRetarget = Math.max(this.minRetarget + 0.1, this.baseRetargetMax * intervalScale);
    this.jitterAmt = this.baseJitter * (0.6 + 0.4 * this.activityFactor);
    this.maxIdleAtTarget = (lvl > 1) ? Math.max(0.15, 0.45 * intervalScale) : Infinity;
    if (this.retarget > this.maxRetarget) { this.retarget = this.maxRetarget; }
  }
  update(dt){ this.t += dt; if (this.t > 0.2){ this.t=0; this.frame=(this.frame+1)%2; } this.retarget -= dt; const padding=16; const approxW=this._drawW||90; const halfW=approxW/2; const minX=padding+halfW; const rightOverflow=approxW*HAND_RIGHT_OVERFLOW_RATIO; const maxX=BASE_W-(padding+halfW)+rightOverflow; if (this.retarget<=0){ const maxStep=this.maxStep; const next=clamp(this.handX + rand(-maxStep, maxStep), minX, maxX); this.targetX=next; this.retarget=rand(this.minRetarget, this.maxRetarget); } const dir=Math.sign(this.targetX - this.handX); this.handX += dir * this.moveSpeed * dt; this.handX = clamp(this.handX + rand(-this.jitterAmt, this.jitterAmt), minX, maxX); if (Math.abs(this.targetX - this.handX) < 2){ this.handX = this.targetX; if (Number.isFinite(this.maxIdleAtTarget)) this.retarget = Math.min(this.retarget, this.maxIdleAtTarget); } }
  draw(g){ const maxH = Math.floor(BASE_H * CONFIG.maxTopActorH); const targetH = Math.min(this.h, maxH); const y=13; const img=(this.frame===0?Hand.open:Hand.pinch); if (!Hand.ready || !img || !(img.naturalWidth>0)){ this._drawW=90; this._drawH=targetH; const w=this._drawW; const overflow=w*HAND_RIGHT_OVERFLOW_RATIO; const x=clamp(this.handX - w/2, 10, BASE_W - w - 10 + overflow); this._x=x; this._y=y; return; }
    const natW=img.naturalWidth, natH=img.naturalHeight; const scale=targetH/natH; const drawW=natW*scale, drawH=natH*scale; const overflow=drawW*HAND_RIGHT_OVERFLOW_RATIO; const x = clamp(this.handX - drawW/2, 10, BASE_W - drawW - 10 + overflow);
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

    this.startY = y;
    this.endY = BASE_H - 80;
    this.fallDuration = Math.max(0.35, CONFIG.fallDuration ?? 2.5);
    this.elapsed = 0;
    this.progress = 0;
  }

  update(dt){
    if (!this.alive || this.dead) return;

    const fallSpeedMultiplier = getCurrentIntraLevelSpeedMultiplier();
    const fallDt = dt * fallSpeedMultiplier;

    this.elapsed += fallDt;
    const duration = this.fallDuration || 1;
    const linearProgress = clamp(this.elapsed / duration, 0, 1);
    this.progress = linearProgress;

    const eased = linearProgress * linearProgress;
    this.y = this.startY + (this.endY - this.startY) * eased;
    this.updateScaleFromVerticalPosition(linearProgress);

    if (linearProgress >= 1){
      this.dead = true;
      return;
    }

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

  updateScaleFromVerticalPosition(progressOverride){
    const denom = Math.max(0.0001, (this.endY ?? BASE_H) - (this.startY ?? 0));
    const fallbackProgress = (this.y - (this.startY ?? 0)) / denom;
    const progress = clamp(progressOverride ?? fallbackProgress, 0, 1);
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
  update(dt){
    if (!spawningEnabled || gameState !== "playing") return;
    const diff=this.g.diffMult();
    this.acc += dt * (CONFIG.baseSpawnPerSec * diff);
    while (this.acc >= 1){
      this.spawnOne();
      this.acc -= 1;
    }
  }
  spawnOne(){
    const x = this.g.arm.spawnX(); const y = this.g.arm.spawnY();
    const basePow = 0.1;
    const minGood = 0.05;
    const isLate = this.g.timeElapsed > 30;
    const baseBad = isLate ? 0.3 : 0.2;
    const baseGood = 1 - basePow - baseBad;
    const rawBonus = (typeof currentLevelIndex === 'number' ? currentLevelIndex : 0) * 0.05;
    const bonusLimit = Math.max(0, baseGood - minGood); // keep at least a small share of good drops
    const bonus = clamp(rawBonus, 0, bonusLimit);
    const pGood = clamp(baseGood - bonus, minGood, 1 - basePow);
    const pBad = 1 - basePow - pGood;
    const r=Math.random();
    if (r < pGood){ const rar = CONFIG.rarity; const sub = choiceWeighted([{k:'bronze',w:rar.bronze},{k:'silver',w:rar.silver},{k:'gold',w:rar.gold},{k:'diamond',w:rar.diamond}]); spawnItem(this.g,'good',sub,x,y); }
    else if (r < pGood + pBad){ const bw = CONFIG.badWeights; const sub = choiceWeighted([{k:'bomb',w:bw.bomb*(isLate?1.2:1)},{k:'shitcoin',w:bw.shitcoin},{k:'anvil',w:bw.anvil},{k:'rugpull',w:bw.rugpull},{k:'fakeAirdrop',w:bw.fakeAirdrop}]); spawnItem(this.g,'bad',sub,x,y); }
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

    // --- HUD des bonus et malus temporaires ---
    for (const type in activeBonuses) {
      const bonus = activeBonuses[type];
      if (bonus.active) {
        drawBonusIcon(type, bonus.timeLeft);
      }
    }

    if (controlInversionState.active && controlInversionState.timeLeft > 0) {
      drawBonusIcon("fakeAirdrop", controlInversionState.timeLeft);
    }

    const slowTimer = Math.max(0, Number(this.g?.wallet?.slowTimer) || 0);
    if (slowTimer > 0) {
      drawBonusIcon("anvil", slowTimer);
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
  constructor(){ Game.instance=this; this.rulesReturnView = "title"; this.accountMode = 'signin'; this.reset({ showTitle:true }); }
  reset({showTitle=true}={}){
    window.__saltDroppeeLoopStarted = false;
    setInterLevelUiState(false);
    gameState = "paused";
    levelEnded = false;
    spawningEnabled = false;
    resumeAllAnimations();
    if (window.gsap?.killTweensOf) {
      gsap.killTweensOf("*");
    }
    enablePlayerInput('Game.reset');
    resetDirectionalInputs();
    if (typeof input !== "undefined") {
      input.dragging = false;
      input.pointerLastX = null;
      input.pointerVirtualX = null;
      input.pointerInvertState = false;
    }
    if (this.fx) this.fx.clearAll();
    resetActiveBonuses();
    resetShieldState({ silent: true });
    resetControlInversion({ silent: true });
    this.settings = loadSettings();
    this.applyContrastSetting(this.settings.contrast);
    setActiveControlMode(this.settings.controlMode);
    const u=new URLSearchParams(location.search); const seed=u.get('seed'); this.random = seed? (function(seed){ let t=seed>>>0; return function(){ t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, 1 | t); r ^= r + Math.imul(r ^ r >>> 7, 61 | r); return ((r ^ r >>> 14) >>> 0) / 4294967296; };})(parseInt(seed)||1) : Math.random;
    this.state='title';
    this.settingsReturnView = "title";
    setActiveScreen(showTitle ? 'title' : 'running', { via: 'Game.reset', showTitle });
    if (typeof setSoundEnabled === "function") {
      setSoundEnabled(!!this.settings.sound);
    }
    if (showTitle) {
      playMenuMusic();
    } else {
      leaveTitleScreen({ stopMusic: true });
      setLevelMusic(null);
    }
    this.timeLeft=CONFIG.runSeconds; this.timeElapsed=0; this.lives=CONFIG.lives; this.score=0; this.comboStreak=0; this.comboMult=comboTiers[0].mult; this.maxCombo=0; this.levelReached=1;
    if (gsap?.killTweensOf) {
      gsap.killTweensOf(comboVis);
    }
    comboVis.scale = 1;
    comboVis.flash = 0;
    this.arm=new Arm(this); this.arm.applyCaps(); this.wallet=new Wallet(this); this.wallet.applyCaps(); applyWalletForLevel(1); this.hud=new HUD(this); this.spawner=new Spawner(this);
    this.items=[]; this.effects={invert:0}; this.fx = new FxManager(this);
    this.shake=0; this.bgIndex=0; this.didFirstCatch=false; this.updateBgByScore();
    loadLevel(currentLevelIndex, { applyBackground: !showTitle, playMusic: !showTitle });
    if (showTitle) this.renderTitle(); else this.render();
  }
  applyContrastSetting(enabled){
    const contrastOn = !!enabled;
    if (typeof document !== 'undefined' && document.documentElement){
      document.documentElement.classList.toggle('contrast-high', contrastOn);
    }
    this.palette = CONFIG.palette.slice();
    if (contrastOn){
      this.palette = ['#000','#444','#ff0044','#ffaa00','#ffffff','#00ffea','#00ff66','#66a6ff'];
    }
  }
  diffMult(){ return Math.pow(CONFIG.spawnRampFactor, Math.floor(this.timeElapsed/CONFIG.spawnRampEverySec)); }
  updateBgByScore(){ const th=CONFIG.evolveThresholds; let idx=0; for (let i=0;i<th.length;i++){ if (this.score>=th[i]) idx=i; } if (idx!==this.bgIndex){ this.bgIndex=idx; this.wallet.evolveByScore(this.score); this.levelReached = Math.max(this.levelReached, this.wallet.level); } }
  start(){
    const levelCfg = LEVELS[currentLevelIndex];
    if (levelCfg?.background) {
      applyLevelBackground(levelCfg.background);
    }

    const cachedAssets = levelAssets[currentLevelIndex];
    if (cachedAssets?.music) {
      setLevelMusic(cachedAssets.music);
    } else {
      ensureLevelAssets(currentLevelIndex).then(({ music }) => {
        if (this.state === 'playing') {
          setLevelMusic(music);
        }
      }).catch(() => {});
    }

    levelEnded = false;
    gameState = "playing";
    spawningEnabled = true;
    enablePlayerInput('Game.start');
    this.state='playing';
    setActiveScreen('running', { via: 'Game.start' });
    this.lastTime=performance.now();
    this.ignoreClicksUntil=this.lastTime+500;
    this.ignoreVisibilityUntil=this.lastTime+1000;
    this.loop();
  }
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

    if (gameState !== "playing"){
      score = this.score;
      lives = this.lives;
      timeLeft = this.timeLeft;
      return;
    }

    this.timeElapsed += dt;
    updateIntraLevelSpeedRamp(this);
    if (this.timeLeft > 0){
      this.timeLeft = Math.max(0, this.timeLeft - dt);
    }

    score = this.score;
    lives = this.lives;
    timeLeft = this.timeLeft;

    checkEndConditions();
    if (gameState !== "playing") return;

    this.arm.update(dt);
    this.wallet.update(dt);
    if (spawningEnabled && typeof this.spawner?.update === "function"){
      this.spawner.update(dt);
    }
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
    updateControlInversionTimer(this, dt);
    this.updateBgByScore(); if (this.shake>0) this.shake = Math.max(0, this.shake - dt*6);

    score = this.score;
    lives = this.lives;
    timeLeft = this.timeLeft;
    checkEndConditions();
  }
  onCatch(it){
    handleCollision(it);
  }
  endGame(){ this.fx?.clearAll(); resetActiveBonuses(); resetShieldState({ silent: true }); resetControlInversion({ silent: true }); this.state='over'; this.render(); try{ const best=parseInt(localStorage.getItem(LS.bestScore)||'0',10); if (this.score>best) localStorage.setItem(LS.bestScore, String(this.score)); const bestC=parseInt(localStorage.getItem(LS.bestCombo)||'0',10); if (this.maxCombo>bestC) localStorage.setItem(LS.bestCombo, String(this.maxCombo)); const runs=JSON.parse(localStorage.getItem(LS.runs)||'[]'); runs.unshift({ ts:Date.now(), score:this.score, combo:this.maxCombo, lvl:this.levelReached }); while (runs.length>20) runs.pop(); localStorage.setItem(LS.runs, JSON.stringify(runs)); }catch(e){}
    this.renderGameOver(); if (TG){ try{ TG.sendData(JSON.stringify({ score:this.score, duration:CONFIG.runSeconds, version:VERSION })); }catch(e){} }
  }
  uiStartFromTitle(){
    if (this.state === 'title'){
      console.info(`[progress] start requested${debugFormatContext({ via: 'uiStartFromTitle', screen: activeScreen })}`);
      leaveTitleScreen();
      overlay.innerHTML = '';
      hideOverlay(overlay);
      this.start();
    }
  }
  renderTitle(){
    setActiveScreen('title', { via: 'renderTitle' });
    this.settingsReturnView = "title";
    if (currentBackgroundSrc === MENU_BACKGROUND_SRC) {
      setBackgroundImageSrc(MENU_BACKGROUND_SRC);
    } else if (hasBackgroundImage) {
      fadeOutBgThen(MENU_BACKGROUND_SRC);
    } else {
      setBackgroundImageSrc(MENU_BACKGROUND_SRC);
    }
    enterTitleScreen();
    overlay.innerHTML = `
      <div class="title-screen" role="presentation">
        <div class="title-account-bar">
          <div class="title-account-card">
            <span id="titleAccountStatus" class="title-account-status">Connexion en cours…</span>
            <button id="btnAccount" type="button" class="title-account-button">Compte</button>
          </div>
        </div>
        <div class="title-screen-spacer" aria-hidden="true"></div>
        <div class="title-buttons" role="navigation">
          <button id="btnPlay" type="button">Jouer</button>
          <button id="btnRulesTitle" type="button">Règle du jeu</button>
          <button type="button" class="btn-settings" data-action="open-settings">Paramètres</button>
          <button id="btnLB" type="button">Leaderboard</button>
        </div>
      </div>`;
    showExclusiveOverlay(overlay);
    const accountBtn = document.getElementById('btnAccount');
    if (accountBtn) {
      addEvent(accountBtn, INPUT.tap, (evt)=>{
        evt.preventDefault();
        evt.stopPropagation();
        playSound("click");
        this.renderAccountPanel({ keepMode: true });
      }, { passive:false });
    }
    updateTitleAccountStatus();
    addEvent(document.getElementById('btnLB'), INPUT.tap, ()=>{ playSound("click"); this.renderLeaderboard(); });
    addEvent(document.getElementById('btnRulesTitle'), INPUT.tap, (evt)=>{
      evt.preventDefault();
      evt.stopPropagation();
      playSound("click");
      this.renderRules("title");
    }, { passive:false });
    addEvent(document.getElementById('btnPlay'), INPUT.tap, async (e)=>{
      e.preventDefault(); e.stopPropagation();
      playSound("click");
      const authSnapshot = getAuthStateSnapshot();
      console.info(`[progress] play clicked${debugFormatContext({ screen: activeScreen, auth: authSnapshot?.user ? 'authenticated' : 'guest' })}`);
      await new Promise(r=>requestAnimationFrame(r));
      try{ const prev=ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled=false; const imgs=[walletImage, GoldImg, SilverImg, BronzeImg, DiamondImg, BombImg, Hand.open, Hand.pinch]; for (const im of imgs){ if (im && im.naturalWidth) ctx.drawImage(im,0,0,1,1); } ctx.save(); ctx.shadowColor='rgba(0,0,0,0.15)'; ctx.shadowBlur=4; ctx.shadowOffsetY=1; ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(4,4,2,0,Math.PI*2); ctx.fill(); ctx.restore(); ctx.imageSmoothingEnabled=prev; ctx.clearRect(0,0,8,8); }catch(_){ }
      this.uiStartFromTitle();
    }, { passive:false });
  }
  renderAccountPanel(options = {}){
    const keepMode = options && options.keepMode;
    if (!overlay) return;
    const service = getAuthService();
    if (!keepMode && options && typeof options.mode === 'string') {
      this.accountMode = options.mode === 'signup' ? 'signup' : 'signin';
    } else if (!this.accountMode) {
      this.accountMode = 'signin';
    }
    overlay.classList.remove('overlay-title', 'overlay-rules');
    overlay.innerHTML = `
      <div class="panel account-panel" role="dialog" aria-modal="true" aria-labelledby="accountTitle" data-account-panel="true">
        <h1 id="accountTitle">Compte joueur</h1>
        <div class="account-panel-body" data-account-body></div>
        <p class="account-message" data-account-message role="status" aria-live="polite"></p>
      </div>`;
    showExclusiveOverlay(overlay);
    setActiveScreen('account', { via: 'renderAccountPanel', mode: this.accountMode });
    const state = getAuthStateSnapshot();
    const body = overlay.querySelector('[data-account-body]');
    const messageEl = overlay.querySelector('[data-account-message]');

    const setMessage = (text = '', variant = 'info') => {
      if (!messageEl) return;
      messageEl.textContent = text || '';
      messageEl.classList.remove('is-error', 'is-success');
      if (variant === 'error') messageEl.classList.add('is-error');
      if (variant === 'success') messageEl.classList.add('is-success');
    };

    const wireCloseButtons = () => {
      const closeButtons = overlay.querySelectorAll('[data-account-close]');
      closeButtons.forEach((btn) => {
        addEvent(btn, INPUT.tap, (evt)=>{
          evt.preventDefault();
          evt.stopPropagation();
          playSound("click");
          this.renderTitle();
        }, { passive:false });
      });
    };

    if (!state.enabled) {
      if (body) {
        body.innerHTML = `
          <p>Le service de compte est désactivé sur cette version.</p>
          <div class="btnrow"><button type="button" data-account-close>Retour</button></div>`;
      }
      setMessage('Authentification indisponible.', 'error');
      wireCloseButtons();
      return;
    }

    if (!state.ready) {
      if (body) {
        body.innerHTML = `
          <p>Connexion au service d’authentification…</p>
          <div class="btnrow"><button type="button" data-account-close>Retour</button></div>`;
      }
      if (state.lastError) {
        setMessage(state.lastError, 'error');
      } else {
        setMessage('Initialisation en cours…', 'info');
      }
      wireCloseButtons();
      return;
    }

    if (state.user) {
      const safeEmail = escapeHtml(state.user.email || '');
      const safeUsername = escapeHtml(state.user.username || '');
      const safeProfileUsername = escapeHtml(state.profile?.username || '');
      const identifier = safeProfileUsername || safeUsername || safeEmail || 'Utilisateur connecté';
      const pseudoLine = safeProfileUsername || safeUsername
        ? `<p class="account-field-note account-field-readonly">Pseudo actuel : <strong>${safeProfileUsername || safeUsername}</strong></p>`
        : '<p class="account-field-note account-field-readonly">Pseudo actuel non renseigné.</p>';
      const secondaryLine = safeEmail && identifier !== safeEmail
        ? `<br><small>${safeEmail}</small>`
        : '';
      if (body) {
        body.innerHTML = `
          <p class="account-status-line">Connecté en tant que <strong>${identifier}</strong>.${secondaryLine}</p>
          ${pseudoLine}
          <div class="btnrow">
            <button type="button" id="btnAccountSignOut">Se déconnecter</button>
            <button type="button" data-account-close>Fermer</button>
          </div>`;
      }
      wireCloseButtons();
      const signOutBtn = document.getElementById('btnAccountSignOut');
      if (signOutBtn) {
        addEvent(signOutBtn, INPUT.tap, async (evt)=>{
          evt.preventDefault();
          evt.stopPropagation();
          playSound("click");
          if (!service || typeof service.signOut !== 'function') {
            setMessage('Service indisponible.', 'error');
            return;
          }
          const result = await service.signOut();
          if (!result?.success) {
            setMessage(result?.message || 'Déconnexion impossible.', 'error');
          } else {
            setMessage('Déconnexion en cours…');
          }
        }, { passive:false });
      }
      return;
    }

    const mode = this.accountMode === 'signup' ? 'signup' : 'signin';
    if (body) {
      body.innerHTML = `
        <form class="account-form" data-account-form novalidate>
          <label>Adresse e-mail
            <input type="email" name="email" required autocomplete="email" inputmode="email" />
          </label>
          ${mode === 'signup' ? `
          <label>Pseudo
            <input type="text" name="username" required minlength="3" maxlength="15" autocomplete="username" spellcheck="false" />
            <p class="account-field-note account-field-error" data-account-username-error role="status" aria-live="polite" hidden></p>
          </label>` : ''}
          <label>Mot de passe
            <input type="password" name="password" required minlength="6" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" />
          </label>
          ${mode === 'signup' ? `
          <label>Confirmer le mot de passe
            <input type="password" name="confirmPassword" required minlength="6" autocomplete="new-password" />
          </label>` : ''}
          <div class="btnrow account-button-row">
            <button type="submit" data-account-submit>${mode === 'signup' ? 'Créer mon compte' : 'Se connecter'}</button>
            <button type="button" data-account-close>Retour</button>
          </div>
          <button type="button" class="account-switch" data-account-switch>
            ${mode === 'signup' ? 'Déjà un compte ? Se connecter' : 'Pas encore de compte ? S’inscrire'}
          </button>
        </form>`;
    }
    wireCloseButtons();
    const form = overlay.querySelector('[data-account-form]');
    const switchBtn = overlay.querySelector('[data-account-switch]');
    const submitBtn = overlay.querySelector('[data-account-submit]');
    const usernameErrorEl = overlay.querySelector('[data-account-username-error]');
    const setUsernameError = (message = '') => {
      if (!usernameErrorEl) return;
      usernameErrorEl.textContent = message;
      if (message) {
        usernameErrorEl.hidden = false;
      } else {
        usernameErrorEl.hidden = true;
      }
    };
    setUsernameError('');
    const formInputs = form ? Array.from(form.querySelectorAll('input')) : [];
    const toggleFormDisabled = (disabled) => {
      formInputs.forEach((input)=>{ input.disabled = disabled; });
      if (submitBtn) submitBtn.disabled = disabled;
      if (switchBtn) switchBtn.disabled = disabled;
    };

    setMessage('Connectez-vous pour sauvegarder vos progrès.', 'info');

    if (switchBtn) {
      addEvent(switchBtn, INPUT.tap, (evt)=>{
        evt.preventDefault();
        evt.stopPropagation();
        playSound("click");
        this.accountMode = mode === 'signup' ? 'signin' : 'signup';
        this.renderAccountPanel({ keepMode: true });
      }, { passive:false });
    }

    if (form) {
      addEvent(form, 'submit', async (evt)=>{
        evt.preventDefault();
        evt.stopPropagation();
        if (!service) {
          setMessage('Service indisponible.', 'error');
          return;
        }
        const formData = new FormData(form);
        const email = String(formData.get('email') || '').trim();
        const password = String(formData.get('password') || '');
        const confirmPassword = mode === 'signup' ? String(formData.get('confirmPassword') || '') : '';
        const username = mode === 'signup' ? String(formData.get('username') || '').trim() : '';
        if (!isValidEmail(email)) {
          setMessage('Merci de saisir un email valide.', 'error');
          return;
        }
        if (!isValidPassword(password)) {
          setMessage('Mot de passe trop court (6 caractères minimum).', 'error');
          return;
        }
        if (mode === 'signup' && !isValidUsername(username)) {
          setUsernameError('Choisissez un pseudo de 3 à 15 caractères (lettres, chiffres ou _).');
          setMessage('Pseudo invalide.', 'error');
          return;
        }
        if (mode === 'signup' && password !== confirmPassword) {
          setMessage('Les mots de passe ne correspondent pas.', 'error');
          return;
        }
        if (mode === 'signup') {
          setUsernameError('');
        }
        playSound("click");
        toggleFormDisabled(true);
        setMessage(mode === 'signup' ? 'Création du compte…' : 'Connexion…');
        try {
          const action = mode === 'signup' ? service.signUp : service.signIn;
          const payload = mode === 'signup' ? { email, password, username } : { email, password };
          const result = await action(payload);
          if (!result?.success) {
            setMessage(result?.message || 'Opération impossible.', 'error');
            if (mode === 'signup') {
              if (result?.reason === 'USERNAME_TAKEN') {
                setUsernameError(result?.message || 'Ce pseudo est déjà utilisé.');
              } else {
                setUsernameError('');
              }
            }
            toggleFormDisabled(false);
            return;
          }
          if (result.requiresEmailConfirmation) {
            setMessage(result.message || 'Vérifiez votre email pour confirmer votre compte.', 'success');
            if (mode === 'signup') {
              setUsernameError('');
            }
            toggleFormDisabled(false);
          } else {
            setMessage('Connexion réussie.', 'success');
          }
        } catch (error) {
          console.error('[auth] form submit failed', error);
          setMessage('Une erreur inattendue est survenue.', 'error');
          toggleFormDisabled(false);
        }
      }, { passive:false });
    }
  }
  renderSettings(){
    if (overlay) overlay.classList.remove('overlay-title');
    const fromViewRaw = this.settingsReturnView || this.state || activeScreen;
    const fromView = normalizeScreenName(fromViewRaw);
    console.info(`[overlay] open settings (from ${fromView})${debugFormatContext({ raw: fromViewRaw, screen: activeScreen })}`);
    setActiveScreen('settings', { via: 'renderSettings', from: fromView, raw: fromViewRaw });
    const s=this.settings;
    const controlMode = (s.controlMode === 'zones') ? 'zones' : 'swipe';
    s.controlMode = controlMode;
    overlay.innerHTML = `
    <div class="panel">
      <h1>Paramètres</h1>
      <p><label><input type="checkbox" id="sound" ${s.sound?'checked':''}/> Son</label></p>
      <p><label><input type="checkbox" id="contrast" ${s.contrast?'checked':''}/> Contraste élevé</label></p>
      <p><label><input type="checkbox" id="haptics" ${s.haptics?'checked':''}/> Vibrations</label></p>
      ${hasTouch ? `
      <div class="control-mode-setting">
        <span class="control-mode-label" id="controlModeLabel">Mode de contrôle (mobile)</span>
        <div class="control-mode-toggle" role="group" aria-labelledby="controlModeLabel" data-control-toggle>
          <button type="button" class="control-mode-option" data-mode="swipe">Swipe</button>
          <button type="button" class="control-mode-option" data-mode="zones">Zones tactiles</button>
        </div>
      </div>` : ''}
      <p>Sensibilité: <input type="range" id="sens" min="0.5" max="1.5" step="0.05" value="${s.sensitivity}"></p>
      <div class="btnrow"><button id="back">Retour</button></div>
    </div>`;
    showExclusiveOverlay(overlay);
    addEvent(document.getElementById('sound'), 'change', e=>{ playSound("click"); this.settings.sound = e.target.checked; saveSettings(this.settings); if (typeof setSoundEnabled === "function") { setSoundEnabled(this.settings.sound); } });
    addEvent(document.getElementById('contrast'), 'change', e=>{
      if (e && typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      } else if (e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      }
      playSound("click");
      const contrastEnabled = !!e?.target?.checked;
      this.settings.contrast = contrastEnabled;
      saveSettings(this.settings);
      this.applyContrastSetting(contrastEnabled);
    }, { passive: false });
    addEvent(document.getElementById('haptics'), 'change', e=>{ playSound("click"); this.settings.haptics = e.target.checked; saveSettings(this.settings); });
    if (hasTouch) {
      const controlToggle = overlay.querySelector('[data-control-toggle]');
      if (controlToggle) {
        const controlButtons = Array.from(controlToggle.querySelectorAll('button[data-mode]'));
        const updateToggleState = (mode)=>{
          const normalized = mode === 'zones' ? 'zones' : 'swipe';
          controlButtons.forEach(btn=>{
            const isActive = btn.dataset.mode === normalized;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          });
        };
        updateToggleState(this.settings.controlMode);
        controlButtons.forEach(btn=>{
          addEvent(btn, 'click', (evt)=>{
            if (evt && typeof evt.preventDefault === 'function') {
              evt.preventDefault();
            }
            if (evt && typeof evt.stopPropagation === 'function') {
              evt.stopPropagation();
            }
            const value = btn.dataset.mode === 'zones' ? 'zones' : 'swipe';
            if (value === this.settings.controlMode) {
              updateToggleState(value);
              return;
            }
            playSound("click");
            this.settings.controlMode = value;
            saveSettings(this.settings);
            setActiveControlMode(value);
            updateToggleState(value);
          }, { passive: false });
        });
      }
    }
    addEvent(document.getElementById('sens'), 'input', e=>{ this.settings.sensitivity = parseFloat(e.target.value); saveSettings(this.settings); });
    addEvent(document.getElementById('back'), INPUT.tap, (evt)=>{
      if (evt && typeof evt.preventDefault === 'function') {
        evt.preventDefault();
      }
      if (evt && typeof evt.stopImmediatePropagation === 'function') {
        evt.stopImmediatePropagation();
      } else if (evt && typeof evt.stopPropagation === 'function') {
        evt.stopPropagation();
      }
      playSound("click");
      const returnViewRaw = this.settingsReturnView || this.state || "title";
      const targetScreen = normalizeScreenName(returnViewRaw);
      const nextScreen = targetScreen === 'unknown' ? lastNonSettingsScreen : targetScreen;
      console.info(`[overlay] close settings (to ${nextScreen})${debugFormatContext({ raw: returnViewRaw })}`);
      setActiveScreen(nextScreen, { via: 'settings-back', raw: returnViewRaw });
      const returnView = returnViewRaw;
      this.settingsReturnView = "title";
      if (nextScreen !== 'interLevel') {
        hideLegendResultScreen();
        hideInterLevelScreen();
      }
      overlay.innerHTML='';

      if (returnView === "pause" || returnView === "paused") {
        this.renderPause();
        return;
      }

      if (returnView === "inter") {
        hideOverlay(overlay);
        showInterLevelScreen(lastInterLevelResult || "win", { replaySound: false });
        return;
      }

      if (returnView === "over") {
        this.renderGameOver();
        return;
      }

      this.renderTitle();
    }, { passive: false });
  }
  renderLeaderboard(){
    if (overlay) overlay.classList.remove('overlay-title');
    let runs=[];
    try{ runs = JSON.parse(localStorage.getItem(LS.runs)||'[]'); }catch(e){}
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
    showExclusiveOverlay(overlay);
    addEvent(document.getElementById('back'), INPUT.tap, ()=>{ playSound("click"); this.renderTitle(); });
  }
  renderPause(){
    setActiveScreen('paused', { via: 'renderPause' });
    if (overlay) overlay.classList.remove('overlay-title');
    this.settingsReturnView = "pause";
    overlay.innerHTML = `
      <div class="panel">
        <h1>Pause</h1>
        <div class="btnrow">
          <button id="resume" type="button">Reprendre</button>
          <button type="button" class="btn-settings" data-action="open-settings">Paramètres</button>
          <button id="quit" type="button">Menu</button>
          <button id="btnRulesPause" type="button">Règle du jeu</button>
        </div>
      </div>`;
    showExclusiveOverlay(overlay);
    addEvent(document.getElementById('resume'), INPUT.tap, ()=>{
      playSound("click");
      overlay.innerHTML='';
      hideOverlay(overlay);
      setActiveScreen('running', { via: 'pause-resume' });
      this.state='playing';
      this.lastTime=performance.now();
      this.loop();
    });
    addEvent(document.getElementById('quit'), INPUT.tap, ()=>{
      playSound("click");
      overlay.innerHTML='';
      hideOverlay(overlay);
      this.reset();
    });
    addEvent(document.getElementById('btnRulesPause'), INPUT.tap, (evt)=>{
      evt.preventDefault();
      evt.stopPropagation();
      playSound("click");
      this.renderRules("pause");
    }, { passive:false });
  }
  renderRules(returnView){
    if (overlay) overlay.classList.remove('overlay-title');
    this.rulesReturnView = returnView || this.state || "title";
    overlay.innerHTML = `
      <div class="rules-screen" role="dialog" aria-modal="true" aria-label="Règles du jeu">
        <img src="assets/rules.webp" alt="Règles du jeu" />
      </div>`;
    overlay.classList.add('overlay-rules');
    showExclusiveOverlay(overlay);

    const closeRules = () => {
      removeEvent(overlay, INPUT.tap, onTap, { passive: false });
      overlay.classList.remove('overlay-rules');
      overlay.innerHTML = '';
      hideOverlay(overlay);

      if (this.rulesReturnView === 'pause' || this.rulesReturnView === 'paused') {
        this.renderPause();
      } else {
        this.renderTitle();
      }
    };

    const onTap = (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      playSound("click");
      closeRules();
    };

    addEvent(overlay, INPUT.tap, onTap, { passive:false });
  }
  renderGameOver(){
    const best=parseInt(localStorage.getItem(LS.bestScore)||'0',10);
    this.settingsReturnView = "over";
    setActiveScreen('gameover', { via: 'renderGameOver' });
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
    showExclusiveOverlay(overlay);
    addEvent(document.getElementById('again'), INPUT.tap, async ()=>{ playSound("click"); overlay.innerHTML=''; hideOverlay(overlay); this.reset({showTitle:false}); await new Promise(r=>requestAnimationFrame(r)); this.start(); }, { passive:false });
    addEvent(document.getElementById('menu'), INPUT.tap, ()=>{ playSound("click"); overlay.innerHTML=''; hideOverlay(overlay); this.reset({showTitle:true}); });
    if (TG){ const sh=document.getElementById('share'); if (sh) addEvent(sh, INPUT.tap, ()=>{ playSound("click"); try{ TG.sendData(JSON.stringify({ score:this.score, duration:CONFIG.runSeconds, version:VERSION })); }catch(e){} }); }
  }
  render(){
    const sx = this.shake>0? Math.round(rand(-2,2)):0;
    const sy = this.shake>0? Math.round(rand(-2,2)):0;

    ctx.save();
    ctx.clearRect(0,0,BASE_W,BASE_H);
    ctx.translate(sx,sy);
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

function projectClientToCanvas(clientX, clientY) {
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 0;
  const height = rect.height || 0;
  if (width === 0 || height === 0) {
    return { x: BASE_W / 2, y: BASE_H / 2 };
  }
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return { x: BASE_W / 2, y: BASE_H / 2 };
  }
  return {
    x: ((clientX - rect.left) / width) * BASE_W,
    y: ((clientY - rect.top) / height) * BASE_H,
  };
}

function getCanvasPoint(evt){
  if (!canvas) return { x:0, y:0 };
  const point = getPrimaryPoint(evt);
  if (!point) return { x:0, y:0 };
  return projectClientToCanvas(point.clientX, point.clientY);
}

async function startGame(){
  if (window.__saltDroppeeStarted) return;

  canvas = document.getElementById('gameCanvas');
  ctx = canvas?.getContext('2d');
  overlay = document.getElementById('overlay');
  if (!canvas || !ctx || !overlay) return;

  window.__saltDroppeeStarted = true;

  if (typeof unlockAudioOnce === "function") {
    unlockAudioOnce();
  }
  unlockMusicOnce();

  resize();
  addEvent(window, 'resize', resize);
  addEvent(window, 'keydown', onKeyDown);
  addEvent(window, 'keyup', onKeyUp);
  addEvent(canvas, INPUT.down, onPointerDown);
  addEvent(window, INPUT.move, onPointerMove);
  addEvent(window, INPUT.up, onPointerUp);
  if (INPUT.cancel) addEvent(window, INPUT.cancel, onPointerUp);
  addEvent(window, 'blur', () => resetPointerDragState({ releaseCapture: true }));

  game = new Game();
  if (game && game.wallet) targetX = game.wallet.x + game.wallet.w / 2;

  // Synchronisation de la progression Supabase avant le tout premier chargement de niveau
  // pour éviter de lancer startLevel(0) avant d'avoir récupéré un snapshot éventuel.
  await waitForInitialProgressHydration();
  await applyPendingProgressIfPossible();

  if (!hasAppliedProgressSnapshot) {
    await startLevel1();
  }

  if (!game) return;
  if (typeof game.renderTitle === 'function' && game.state === 'title') {
    game.renderTitle();
  } else if (typeof game.render === 'function') {
    game.render();
  }

  // Application tardive d'une progression Supabase si elle s'est résolue pendant le rendu initial.
  await applyPendingProgressIfPossible();

  addEvent(document, 'visibilitychange', ()=>{ if (document.hidden && game.state==='playing'){ const now = performance.now(); if (game.ignoreVisibilityUntil && now < game.ignoreVisibilityUntil) return; resetPointerDragState({ releaseCapture: true }); game.state='paused'; game.renderPause(); } });

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
