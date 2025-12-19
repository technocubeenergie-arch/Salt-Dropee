// ================================
// Salt Droppee — script.js (patched 2025‑09‑23)
// ================================

// AUDIT NOTES (2025-03):
// - Removed the legacy canvas background renderer path that was never executed in production.
// - Factorized duplicated end-of-level transition handling into finalizeLevelTransition().

const gsap = window.gsap;

const {
  VERSION,
  CONFIG,
  LEVELS,
  INTER_LEVEL_BACKGROUNDS,
  INTER_LEVEL_SOUND_SOURCES,
  MENU_BACKGROUND_SRC,
  MENU_MUSIC_SRC,
  LEGEND_LEVEL_INDEX,
  HUD_CONFIG,
  comboTiers,
  LS,
  SCREEN_NAME_ALIASES,
  TITLE_START_PROGRESS_EAGER_WAIT_MS,
  LOGOUT_WATCHDOG_TIMEOUT_MS,
  SAVE_AND_QUIT_TIMEOUT_MS,
  SAVE_AND_QUIT_LABELS,
} = window.SD_CONFIG || {};

const {
  clamp,
  hudFontSize,
  abbr,
  formatScore,
  rand,
  choiceWeighted,
  waitForPromiseWithTimeout,
} = window.SD_UTILS || {};

const {
  checkAABB = () => false,
} = window.SD_GAME_MATH || {};

const {
  hasTouch,
  supportsPointerEvents,
  usePointerEventsForMouse,
  debugDescribeElement,
  debugFormatContext,
  addEvent,
  removeEvent,
  INPUT,
  input,
  directionalSourceState,
  recomputeDirectionalState,
  resetDirectionalInputs,
  setActiveControlMode,
  isTouchZoneModeActive,
  resetPointerDragState,
  getRawHorizontalAxis,
  getEffectiveHorizontalAxis,
  getWalletCenter,
  isTouchLikeEvent,
  isMatchingPointer,
  handleTouchZoneEvent,
  getPrimaryPoint,
  logPointerTrace,
  onKeyDown,
  onKeyUp,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  disablePlayerInput,
  enablePlayerInput,
} = window.SD_INPUT || {};

const {
  BASE_W: CANVAS_BASE_W,
  BASE_H: CANVAS_BASE_H,
  initCanvasContext,
  resizeCanvas,
  positionHUD,
  getCanvasPoint,
} = window.SD_CANVAS || {};

const {
  getBackgroundState = () => ({ hasBackgroundImage: false, currentBackgroundSrc: '' }),
  setBackgroundImageSrc = () => {},
  fadeOutBgThen = () => {},
  applyLevelBackground = () => {},
  setHUDScore = () => {},
  setHUDCombo = () => {},
  setHUDComboProgress = () => {},
  setHUDLives = () => {},
  setHUDTime = () => {},
  setHUDLegendBoost = () => {},
  updateComboChipVisual = () => {},
  drawCompactHUD = () => null,
  comboVis = { scale: 1, flash: 0 },
  triggerHudBonusPop = () => {},
  getHudBonusScale = () => 1,
  showOverlay = () => {},
  hideOverlay = () => {},
  getOverlayElements = () => [],
  deactivateOtherOverlays = () => {},
  showExclusiveOverlay = () => {},
  clearMainOverlay = () => null,
} = window.SD_RENDER || {};

const {
  applyPendingProgressIfPossible = async () => {},
  refreshProgressSnapshotForTitleStart = async () => {},
  persistProgressSnapshot = async () => {},
  syncProgressFromAuthState = () => {},
  waitForInitialProgressHydration = async () => {},
  setProgressApplicationEnabled = () => {},
  getHasAppliedProgressSnapshot = () => false,
  setHostContext: setProgressHostContext = () => {},
} = window.SD_PROGRESS || {};

const {
  getOrCreateTitleAccountAnchor = () => null,
  setTitleAccountAnchorVisible = () => {},
} = window.SD_UI_CORE || {};

const {
  setInterLevelUiState = () => {},
  showInterLevelScreen = () => {},
  hideInterLevelScreen = () => {},
  updateInterLevelSaveButtonState = () => {},
  bindInterLevelButtons = () => {},
  navigateToTitleAfterSaveQuit = () => {},
  getSaveQuitStatus = () => ({ attemptSave: false, reason: 'unknown', message: '' }),
  getLastInterLevelResult = () => "win",
  renderPauseOverlay = () => {},
} = window.SD_UI_OVERLAYS || {};

const {
  DEFAULT_AUTH_FRONT_STATE = {},
  getAuthStateSnapshot = () => ({}),
  captureReferralCodeFromUrl = () => null,
  tryConnectAuthFacade = () => {},
  handleAuthStateUpdate = () => {},
  updateTitleAccountStatus = () => {},
  refreshAccountPanelIfVisible = () => {},
  renderAccountPanel: renderAccountPanelUi = () => {},
  bindTitleAccountButton = () => {},
  getReferralService = () => null,
} = window.SD_UI_ACCOUNT || {};

const {
  normalizeScreenName = (value) => (typeof value === 'string' && value.trim()) ? value : 'unknown',
  logNavigation = () => {},
  logPlayClickIgnored = () => {},
  logLogoutClickIgnored = () => {},
  setActiveScreen = () => 'unknown',
  shouldBlockGameplayShortcuts = () => false,
  isFormFieldElement = () => false,
  getFocusedElementForShortcuts = () => null,
  getActiveScreen = () => 'boot',
  getLastNonSettingsScreen = () => 'boot',
} = window.SD_UI_PANELS || {};

const {
  levelAssets = {},
  preloadLevelAssets = () => Promise.resolve({}),
  ensureLevelAssets = async () => ({ bg: null, wallet: null, music: null }),
  waitForImageReady = () => Promise.resolve(),
  setWalletSprite = () => {},
  applyWalletForLevel = () => Promise.resolve({ bg: null, wallet: null, music: null }),
  getWalletImage = () => null,
  getLegendWalletImage = () => null,
} = window.SD_LEVELS || {};

const {
  playMenuMusic = () => {},
  stopMenuMusic = () => {},
  setLevelMusic = () => {},
  stopLevelMusic = () => {},
  playInterLevelAudioForLevel = () => {},
  stopInterLevelAudio = () => {},
  unlockMusicOnce = () => {},
} = window.SD_AUDIO || {};

const {
  Wallet = window.Wallet,
  Arm = window.Arm,
  computeWalletCenterBounds = window.computeWalletCenterBounds,
  animateWalletToCenter = window.animateWalletToCenter,
} = window.SD_ENTITIES || {};

const BASE_W = CANVAS_BASE_W ?? CONFIG?.portraitBase?.w;
const BASE_H = CANVAS_BASE_H ?? CONFIG?.portraitBase?.h;
const setupCanvasContext = typeof initCanvasContext === 'function'
  ? initCanvasContext
  : () => ({ canvas: null, ctx: null });
const resizeGameCanvas = typeof resizeCanvas === 'function' ? resizeCanvas : () => {};
const positionHudSafe = typeof positionHUD === 'function' ? positionHUD : () => {};
const getCanvasPointSafe = typeof getCanvasPoint === 'function'
  ? getCanvasPoint
  : () => ({ x: 0, y: 0 });

// --- Musique ---
// moved to SD_AUDIO module

function computeLegendDurationSeconds(){
  const timeLimit = Number.isFinite(levelState?.timeLimit) ? levelState.timeLimit : null;
  if (timeLimit === null || !Number.isFinite(timeLeft)) {
    return null;
  }
  return Math.max(0, Math.round(timeLimit - timeLeft));
}

async function submitLegendScoreIfNeeded(reason = 'end'){
  const levelNumber = Math.max(1, (Number.isFinite(currentLevelIndex) ? Math.floor(currentLevelIndex) : 0) + 1);
  const numericScore = Number.isFinite(score) ? score : Number(score) || 0;
  const durationSeconds = computeLegendDurationSeconds();

  console.info('[score] legend run end', {
    level: levelNumber,
    finalScore: numericScore,
    durationSeconds,
    legendRunSubmitted: legendScoreSubmissionAttempted,
    legendRunActive,
    reason,
  });

  if (!isLegendLevel() || levelNumber !== 6 || !legendRunActive) return;

  const scoreService = getScoreService();
  if (!scoreService || typeof scoreService.submitLegendScore !== 'function') {
    return;
  }

  if (legendScoreSubmissionAttempted) {
    return;
  }

  legendScoreSubmissionAttempted = true;

  const authState = getAuthStateSnapshot?.() || {};
  const playerId = authState?.profile?.id || null;

  try {
    await scoreService.submitLegendScore({
      playerId,
      score: numericScore,
      durationSeconds,
      level: levelNumber,
      reason,
    });
  } catch (error) {
    console.warn('[leaderboard] unexpected legend score submission failure', error);
  }
}

// Tiers & progression
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

let canvas;
let ctx;
let overlay;
let game;

function isActiveGameplayInProgress(){
  return Boolean(game && game.state === 'playing' && getActiveScreen() === 'running');
}

function getScoreService(){
  if (typeof window !== 'undefined' && window.ScoreController) {
    return window.ScoreController;
  }
  return null;
}

setProgressHostContext({
  getAuthStateSnapshot,
  isActiveGameplayInProgress,
});

if (window.SD_UI_PANELS?.initSettingsOpener) {
  window.SD_UI_PANELS.initSettingsOpener({
    getInstance: () => (typeof Game !== "undefined" && Game.instance) ? Game.instance : null,
  });
}

captureReferralCodeFromUrl();

tryConnectAuthFacade();

function enterTitleScreen() {
  setActiveScreen('title', { via: 'enterTitleScreen' });
  setProgressApplicationEnabled(false);
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.add('is-title');
  }
  if (typeof overlay !== 'undefined' && overlay) {
    overlay.classList.remove('overlay-rules');
    overlay.classList.add('overlay-title');
  }

  const runtimeInstance = (typeof Game !== 'undefined' && Game.instance)
    ? Game.instance
    : (game || null);
  if (runtimeInstance && runtimeInstance.state !== 'title') {
    console.info(
      `[nav] syncing runtime state to title${debugFormatContext({
        previous: runtimeInstance.state,
      })}`
    );
    runtimeInstance.state = 'title';
  }

  playMenuMusic();

  applyPendingProgressIfPossible();
}

function leaveTitleScreen({ stopMusic = true } = {}) {
  setActiveScreen('running', { via: 'leaveTitleScreen' });
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.remove('is-title');
  }
  if (typeof overlay !== 'undefined' && overlay) {
    overlay.classList.remove('overlay-title');
  }
  setTitleAccountAnchorVisible(false);
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
let legendScoreSubmissionAttempted = false;
let legendRunActive = false;

const runtimeHost = {
  start: (...args) => (typeof game?.start === 'function' ? game.start(...args) : undefined),
  stop: (...args) => (typeof game?.renderPause === 'function' ? game.renderPause(...args) : undefined),
  tick: (...args) => (typeof game?.step === 'function' ? game.step(...args) : undefined),
  draw: (...args) => (typeof game?.render === 'function' ? game.render(...args) : undefined),
  getState: () => ({
    state: game?.state,
    gameState,
  }),
};

const runtime = window.SD_GAME_RUNTIME?.createRuntime
  ? window.SD_GAME_RUNTIME.createRuntime(runtimeHost)
  : null;

if (window.SD_PROGRESS) {
  window.SD_PROGRESS.runtime = runtime;
  if (typeof window.SD_PROGRESS.getRuntime !== "function") {
    window.SD_PROGRESS.getRuntime = () => runtime;
  }
}

const DEFAULT_LEGEND_BOOSTS = { timeBonusSeconds: 0, extraShields: 0, scoreMultiplier: 1 };
let legendBoostsCache = null;
let legendBoostsPromise = null;
let legendBoostsCacheProfileId = null;

function getLegendBoostLevelFromMultiplier(multiplier) {
  if (!Number.isFinite(multiplier) || multiplier <= 1) return 0;
  if (multiplier >= 1.15) return 3;
  if (multiplier >= 1.10) return 2;
  if (multiplier > 1.0)  return 1;
  return 0;
}

function canEndLevel(){
  return !levelEnded && gameState === "playing";
}

function resetLegendState(options = {}) {
  const { resetLevelIndex = false } = options;
  legendRunActive = false;
  if (resetLevelIndex) {
    currentLevelIndex = 0;
    window.currentLevelIndex = currentLevelIndex;
  }
}

function markLegendRunComplete() {
  legendRunActive = false;
}

function getLegendReferralService() {
  if (typeof getReferralService === 'function') return getReferralService();
  if (typeof window !== 'undefined' && typeof window.getReferralService === 'function') {
    try {
      return window.getReferralService();
    } catch (_) {
      return null;
    }
  }
  if (typeof window !== 'undefined' && window.ReferralController) return window.ReferralController;
  return null;
}

async function loadLegendBoostsForSession() {
  const authState = typeof getAuthStateSnapshot === 'function' ? getAuthStateSnapshot() : null;
  const activeProfileId = authState?.profile?.id || null;

  if (legendBoostsCache && (!activeProfileId || legendBoostsCacheProfileId === activeProfileId)) return legendBoostsCache;
  if (legendBoostsPromise) return legendBoostsPromise;

  const referralService = getLegendReferralService();

  legendBoostsPromise = (async () => {
    if (!referralService?.fetchLegendBoostsForCurrentPlayer) {
      return { ...DEFAULT_LEGEND_BOOSTS };
    }

    try {
      const result = await referralService.fetchLegendBoostsForCurrentPlayer();
      if (result?.ok && result.boosts) {
        const normalized = { ...DEFAULT_LEGEND_BOOSTS, ...result.boosts };
        console.info('[referral] legend boosts applied', {
          referralCount: typeof result.referralCount === 'number' ? result.referralCount : undefined,
          boosts: normalized,
        });
        return normalized;
      }
    } catch (error) {
      console.warn('[referral] legend boosts fetch failed', error);
    }

    return { ...DEFAULT_LEGEND_BOOSTS };
  })();

  try {
    legendBoostsCache = await legendBoostsPromise;
    legendBoostsCacheProfileId = activeProfileId;
    return legendBoostsCache;
  } finally {
    legendBoostsPromise = null;
  }
}

/* global */ let score = 0;   // nombre
/* global */ let streak = 0;  // nombre
/* global */ let combo = 1.0; // nombre (ex: 1.0)
/* global */ let timeLeft = 0;// nombre (secondes)
/* global */ let lives = 0;   // nombre

// Spawning/inputs/animations toggles
let spawningEnabled = true;

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

function resumeAllAnimations(){
  if (window.gsap?.globalTimeline) {
    gsap.globalTimeline.resume();
  }
}

async function ensureLegendVisualsReady(options = {}) {
  const variant = HandVariants?.legend;
  const wallet = options.walletImage || (typeof getLegendWalletImage === 'function' ? getLegendWalletImage() : null);
  const tasks = [];

  if (variant) {
    if (variant.ready) {
      tasks.push(Promise.resolve());
    } else if (variant.readyPromise) {
      tasks.push(variant.readyPromise.catch(() => {}));
    }
  }

  if (wallet) {
    tasks.push(waitForImageReady(wallet));
  }

  if (tasks.length === 0) return true;
  await Promise.all(tasks);
  return true;
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
    immediateBackground = false,
  } = options;

  const L = LEVELS[index];
  currentLevelIndex = index;
  window.currentLevelIndex = currentLevelIndex;

  if (applyBackground && immediateBackground) {
    const eagerBgSrc = L?.background;
    if (eagerBgSrc) {
      applyLevelBackground(eagerBgSrc, { immediate: true });
    }
  }

  updateFallSpeedForLevel(index);

  const endless = !!L.endless;

  legendScoreSubmissionAttempted = false;
  legendRunActive = isLegendLevel(index);
  setActiveHandVariant(legendRunActive ? 'legend' : 'default');

  if (legendRunActive) {
    const eagerLegendWallet = levelAssets[index]?.wallet || (typeof getLegendWalletImage === 'function' ? getLegendWalletImage() : null);
    if (eagerLegendWallet) {
      setWalletSprite(eagerLegendWallet, { skipAnimation: true });
    }
  }

  const legendBoosts = legendRunActive
    ? await loadLegendBoostsForSession()
    : { ...DEFAULT_LEGEND_BOOSTS };
  const legendTimeBonus = legendRunActive
    ? Math.max(0, Number(legendBoosts.timeBonusSeconds) || 0)
    : 0;
  const effectiveTimeLimit = (Number.isFinite(L.timeLimit) ? L.timeLimit : L.timeLimit) + legendTimeBonus;
  const legendScoreMult = legendRunActive
    ? Math.max(0, Number(legendBoosts.scoreMultiplier) || 1)
    : 1;
  const legendBoostLevel = legendRunActive
    ? getLegendBoostLevelFromMultiplier(legendScoreMult)
    : 0;

  levelState.targetScore = endless
    ? Number.POSITIVE_INFINITY
    : (Number.isFinite(L.targetScore) ? L.targetScore : 0);
  levelState.timeLimit   = effectiveTimeLimit;
  levelState.lives       = L.lives;
  resetIntraLevelSpeedRamp(levelState.timeLimit);

  const instance = game || Game.instance || null;
  const { bg, wallet, music } = await ensureLevelAssets(index);

  if (legendRunActive) {
    await ensureLegendVisualsReady({ walletImage: wallet });
  }

  score    = 0;
  streak   = 0;
  combo    = 1.0;
  timeLeft = effectiveTimeLimit;
  lives    = L.lives;

  if (instance) {
    instance.score = 0;
    instance.comboStreak = 0;
    instance.comboMult = comboTiers[0]?.mult ?? 1.0;
    instance.maxCombo = 0;
    instance.timeLeft = effectiveTimeLimit;
    instance.timeElapsed = 0;
    instance.lives = L.lives;
    instance.targetScore = endless
      ? Number.POSITIVE_INFINITY
      : L.targetScore;
    instance.legendScoreMultiplier = legendScoreMult;
    instance.legendBoostLevel = legendBoostLevel;
    if (instance.arm && typeof instance.arm.applyLevelSpeed === "function") {
      instance.arm.applyLevelSpeed(index + 1);
    }
  }

  if (!legendRunActive && instance) {
    instance.legendScoreMultiplier = 1;
    instance.legendBoostLevel = 0;
  }

  if (legendRunActive) {
    applyLegendShieldBoost(legendBoosts.extraShields);
  }

  setHUDLegendBoost(legendBoostLevel, legendRunActive);

  if (applyBackground && immediateBackground) {
    const eagerBgSrc = L?.background;
    if (eagerBgSrc) {
      applyLevelBackground(eagerBgSrc, { immediate: true });
    }
  }

  if (applyBackground) {
    const bgSrc = bg?.src || L.background;
    if (bgSrc) {
      applyLevelBackground(bgSrc, { immediate: immediateBackground });
    }
  }
  if (playMusic) {
    setLevelMusic(music);
  }
  setWalletSprite(wallet);

  if (index + 1 < LEVELS.length) {
    ensureLevelAssets(index + 1);
  }

  hideLegendResultScreen({ immediate: true });

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

window.SD_RENDER = window.SD_RENDER || {};
SD_RENDER.ITEM_ASSETS = {
  good: {
    bronze: { image: BronzeImg, ready: () => bronzeReady },
    silver: { image: SilverImg, ready: () => silverReady },
    gold: { image: GoldImg, ready: () => goldReady },
    diamond: { image: DiamondImg, ready: () => diamondReady },
  },
  bad: {
    bomb: { image: BombImg, ready: () => bombReady },
    shitcoin: { image: ShitcoinImg, ready: () => shitcoinReady },
    rugpull: { image: RugpullImg, ready: () => rugpullReady },
    fakeAirdrop: { image: FakeADImg, ready: () => fakeADReady },
    anvil: { image: AnvilImg, ready: () => anvilReady }
  },
  power: {
    magnet: { image: MagnetImg, ready: () => magnetReady },
    x2: { image: X2Img, ready: () => x2Ready },
    shield: { image: ShieldImg, ready: () => shieldReady },
    timeShard: { image: TimeImg, ready: () => timeReady }
  }
};

const POWERUP_PICKUP_ASSETS = {
  magnet: { image: MagnetImg, ready: () => magnetReady },
  x2: { image: x2Image, ready: () => x2Image.complete },
  shield: { image: shieldIconImage, ready: () => shieldIconImage.complete },
  timeShard: { image: TimeImg, ready: () => timeReady }
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

window.activeBonuses = activeBonuses;

let shield = {
  count: 0,
  active: false,
  _effect: null
};

let shieldConsumedThisFrame = false;

function applyLegendShieldBoost(extraCount = 0) {
  const additional = Number.isFinite(extraCount) ? Math.max(0, Math.floor(extraCount)) : 0;
  if (additional <= 0) return;

  shield.count = Math.max(0, shield.count) + additional;
  shield.active = shield.count > 0;

  if (shield.active) {
    startShieldEffect();
    updateShieldHUD();
  }
}

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
      showPowerupPickup("magnet");
      break;
    case "x2":
      showX2Animation();
      break;
    case "shield":
      showPowerupPickup("shield");
      break;
    case "timeShard":
      showPowerupPickup("timeShard");
      break;
  }
}

const BONUS_PICKUP_ANIM = {
  initialScale: 0.5,
  peakScale: 0.6,
  settleScale: 0.55,
  popDuration: 0.15,
  fadeDuration: 0.2,
  overlap: 0.08
};

function createBonusPickupTimeline(target, onFinish) {
  const timeline = gsap.timeline({ onComplete: onFinish, defaults: { overwrite: "auto" } });

  timeline
    .to(target, {
      scale: BONUS_PICKUP_ANIM.peakScale,
      duration: BONUS_PICKUP_ANIM.popDuration,
      ease: "back.out(2)"
    })
    .to(
      target,
      {
        scale: BONUS_PICKUP_ANIM.settleScale,
        opacity: 0,
        duration: BONUS_PICKUP_ANIM.fadeDuration,
        ease: "power1.inOut"
      },
      `-=${BONUS_PICKUP_ANIM.overlap}`
    );

  return timeline;
}

function showPowerupPickup(type) {
  const asset = POWERUP_PICKUP_ASSETS[type];
  if (!asset?.image) return;
  if (typeof asset.ready === "function" && !asset.ready()) return;
  if (!asset.image.complete) return;

  const walletRef = game?.wallet;
  const fxManager = game?.fx;
  if (!walletRef || !fxManager || !gsap?.to) return;

  const x = walletRef.x + walletRef.w / 2;
  const y = walletRef.y - 30;
  const baseSize = 80;

  const anim = { scale: BONUS_PICKUP_ANIM.initialScale, opacity: 1 };

  const effect = {
    type: type,
    dead: false,
    timeline: null,
    update() {},
    draw(ctx) {
      if (effect.dead) return;
      ctx.save();
      ctx.globalAlpha = anim.opacity;
      const size = baseSize * anim.scale;
      ctx.drawImage(
        asset.image,
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
      effect.timeline?.kill?.();
    },
    kill() {
      effect.finish();
    }
  };

  fxManager.add(effect);

  effect.timeline = createBonusPickupTimeline(anim, () => effect.finish());
}

function showX2Animation() {
  showPowerupPickup("x2");
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

  const wasActive = bonus.active;

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

  if (!wasActive && bonus.active) {
    if (type === "magnet" && window?.location?.search?.includes("debug")) {
      console.debug(`[magnet] activated (timeLeft=${bonus.timeLeft.toFixed(2)}s)`);
    }
    triggerHudBonusPop(type);
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

  if (!wasActive) {
    triggerHudBonusPop("shield");
  }

  showPowerupPickup("shield");
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
      scale: 1,
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
    const legendMult = Math.max(0, Number(gameInstance.legendScoreMultiplier) || 1);
    pts = Math.floor(pts * gameInstance.comboMult * legendMult);
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

    showPowerupPickup(item.subtype);
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
function createHandVariant(openSrc, pinchSrc) {
  const open = new Image();
  const pinch = new Image();
  let ready = false;

  const readyPromise = Promise.all([
    new Promise(r => open.onload = r),
    new Promise(r => pinch.onload = r),
  ]).then(() => {
    ready = true;
    return true;
  });

  open.src = openSrc;
  pinch.src = pinchSrc;

  return {
    open,
    pinch,
    get ready() { return ready; },
    readyPromise,
  };
}

const HandVariants = {
  default: createHandVariant('assets/main_open.png', 'assets/main_pince.png'),
  legend: createHandVariant('assets/open_angry.png', 'assets/pince_angry.png'),
};

const Hand = { open: HandVariants.default.open, pinch: HandVariants.default.pinch, ready: false };

function setActiveHandVariant(key = 'default') {
  const variant = HandVariants[key] || HandVariants.default;
  Hand.open = variant.open;
  Hand.pinch = variant.pinch;

  if (variant.ready) {
    Hand.ready = true;
  } else {
    Hand.ready = false;
    variant.readyPromise.then(() => {
      if (Hand.open === variant.open && Hand.pinch === variant.pinch) {
        Hand.ready = true;
      }
    }).catch(() => {});
  }
}

setActiveHandVariant('default');

// Pré-decode (si supporté)
const warmupWalletImage = typeof getWalletImage === 'function' ? getWalletImage() : null;
const warmupLegendWallet = typeof getLegendWalletImage === 'function' ? getLegendWalletImage() : null;
[GoldImg, SilverImg, BronzeImg, DiamondImg, BombImg,
 ShitcoinImg, RugpullImg, FakeADImg, AnvilImg,
 MagnetImg, X2Img, ShieldImg, TimeImg,
 warmupWalletImage, warmupLegendWallet, Hand.open, Hand.pinch,
 HandVariants.legend.open, HandVariants.legend.pinch,
 footerImg]
  .forEach(img => img?.decode?.().catch(()=>{}));

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
// CANVAS & RENDER SETUP
// =====================
const WR = { x: 0, y: 0, w: 0, h: 0 };

window.addEventListener('load', positionHudSafe);
window.addEventListener('resize', positionHudSafe);

// --- Écran intermédiaire : show/hide ---
async function goToNextLevel(){
  const next = currentLevelIndex + 1;
  const lastIndex = Math.max(0, LEVELS.length - 1);

  hardResetRuntime();
  await loadLevel(Math.min(next, lastIndex), { immediateBackground: true });
  resumeGameplay();
}

function resumeGameplay(){
  hideLegendResultScreen({ immediate: true });
  hideInterLevelScreen({ immediate: true });
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

function prepareLegendLevelWarmup(index) {
  const targetIndex = Number.isFinite(index) ? index : LEGEND_LEVEL_INDEX;
  if (!Number.isFinite(targetIndex) || targetIndex < 0) return;

  ensureLevelAssets(targetIndex).then(({ wallet }) => {
    ensureLegendVisualsReady({ walletImage: wallet }).catch(() => {});
  }).catch(() => {});

  loadLegendBoostsForSession().catch(() => {});
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

  // Les résultats du mode Légende sont enregistrés uniquement dans la table "scores".
  // On évite ici toute sauvegarde de progression automatique afin de ne pas écrire
  // dans la table "progress" qui est réservée aux sauvegardes manuelles.
  submitLegendScoreIfNeeded(reason || 'end');
  markLegendRunComplete();

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

function hideLegendResultScreen(options = {}){
  const screen = document.getElementById("legendResultScreen");
  if (!screen) return;
  hideOverlay(screen, options);
}

// --- Boutons ---
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
      hideLegendResultScreen({ immediate: true });
      hardResetRuntime();
      const legendIndex = LEGEND_LEVEL_INDEX >= 0 ? LEGEND_LEVEL_INDEX : currentLevelIndex;
      await loadLevel(legendIndex, { immediateBackground: true });
      resumeGameplay();
    };
  }
}

window.addEventListener("load", bindLegendResultButtons);

setProgressHostContext({
  getGame: () => game,
  getCurrentLevelIndex: () => currentLevelIndex,
  setCurrentLevelIndex: (index) => {
    currentLevelIndex = index;
    window.currentLevelIndex = currentLevelIndex;
  },
  getScore: () => score,
  setScore: (value) => {
    score = value;
    if (game) {
      game.score = value;
    }
  },
  getGameState: () => gameState,
  setGameState: (value) => {
    gameState = value;
  },
  setLevelEnded: (value) => {
    levelEnded = value;
  },
  setSpawningEnabled: (value) => {
    spawningEnabled = value;
  },
  loadLevel,
  showInterLevelScreen,
  setHUDScore,
  disablePlayerInput,
  isActiveGameplayInProgress,
  getAuthStateSnapshot,
});

// =====================
// INPUT
// =====================
const TG = window.Telegram?.WebApp; if (TG){ try{ TG.ready(); TG.expand(); }catch(e){} }

// =====================
// SETTINGS & STORAGE
// =====================
const DefaultSettings = { sound:true, haptics:true, sensitivity:1.0, controlMode:'swipe' };
function loadSettings(){ try{ const raw = JSON.parse(localStorage.getItem(LS.settings))||{}; const merged = { ...DefaultSettings, ...raw }; merged.controlMode = (merged.controlMode === 'zones' && hasTouch) ? 'zones' : 'swipe'; return merged; }catch(e){ return {...DefaultSettings}; } }
function saveSettings(s){ try{ localStorage.setItem(LS.settings, JSON.stringify(s)); }catch(e){} }

function spawnItem(gameInstance, kind, subtype, x, y, extra = {}) {
  if (!gameInstance) return null;
  const FallingItemCtor = window.SD_ENTITIES?.FallingItem || window.FallingItem;
  if (!FallingItemCtor) return null;
  const item = new FallingItemCtor(gameInstance, kind, subtype, x, y);
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

class HUD{
  constructor(game){ this.g=game; }
  draw(g){
    const metrics = drawCompactHUD(g, this.g, {
      HUD_CONFIG,
      baseWidth: BASE_W,
      baseHeight: BASE_H,
      comboTiers,
      progressToNext,
      comboVis,
      activeBonuses,
      controlInversionState,
      shield,
      bonusIcons: BonusIcons,
      shieldIconImage,
      isLegendLevel,
    });
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
      const scale = getHudBonusScale(type);
      if (icon.complete) {
        const cx = bonusX + iconSize / 2;
        const cy = bonusY + iconSize / 2;
        g.save();
        g.translate(cx, cy);
        g.scale(scale, scale);
        g.drawImage(icon, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
        g.restore();
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
      const scale = getHudBonusScale("shield");

      const cx = bx + size / 2;
      const cy = by + size / 2;

      g.save();
      g.translate(cx, cy);
      g.scale(scale, scale);
      g.drawImage(shieldIconImage, -size / 2, -size / 2, size, size);
      g.restore();
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
  constructor(){
    Game.instance=this;
    this.rulesReturnView = "title";
    this.accountMode = 'signin';
    this.titleStartInFlight = false;
    this.accountFlashMessage = null;
    this.reset({ showTitle:true });
  }
  reset({showTitle=true}={}){
    window.__saltDroppeeLoopStarted = false;
    setInterLevelUiState(false);
    gameState = "paused";
    levelEnded = false;
    spawningEnabled = false;
    resetLegendState({ resetLevelIndex: showTitle });
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
    if (typeof document !== 'undefined' && document.documentElement){
      document.documentElement.classList.remove('contrast-high');
    }
    this.palette = CONFIG.palette.slice();
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
    this.timeLeft=CONFIG.runSeconds; this.timeElapsed=0; this.lives=CONFIG.lives; this.score=0; this.comboStreak=0; this.comboMult=comboTiers[0].mult; this.maxCombo=0; this.levelReached=1; this.legendScoreMultiplier=1; this.legendBoostLevel=0;
    if (gsap?.killTweensOf) {
      gsap.killTweensOf(comboVis);
    }
    comboVis.scale = 1;
    comboVis.flash = 0;
    this.arm=new Arm(this); this.arm.applyCaps(); this.wallet=new Wallet(this); this.wallet.applyCaps(); applyWalletForLevel(1); this.hud=new HUD(this); this.spawner=new Spawner(this);
    this.items=[]; this.effects={invert:0}; this.fx = new FxManager(this);
    this.shake=0; this.bgIndex=0; this.didFirstCatch=false; this.updateBgByScore();
    loadLevel(currentLevelIndex, { applyBackground: !showTitle, playMusic: !showTitle, immediateBackground: !showTitle });
    if (showTitle) this.renderTitle(); else this.render();
  }
  diffMult(){ return Math.pow(CONFIG.spawnRampFactor, Math.floor(this.timeElapsed/CONFIG.spawnRampEverySec)); }
  updateBgByScore(){ const th=CONFIG.evolveThresholds; let idx=0; for (let i=0;i<th.length;i++){ if (this.score>=th[i]) idx=i; } if (idx!==this.bgIndex){ this.bgIndex=idx; } }
  start(){
    const levelCfg = LEVELS[currentLevelIndex];
    if (levelCfg?.background) {
      applyLevelBackground(levelCfg.background, { immediate: true });
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
    if (runtime?.start) {
      runtime.start({ lastTime: this.lastTime });
    }
  }
  loop(){
    if (runtime?.start) {
      runtime.start({ lastTime: this.lastTime });
    }
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
  async uiStartFromTitle(){
    if (this.titleStartInFlight){
      logPlayClickIgnored('start-in-flight', { screen: getActiveScreen(), state: this.state });
      return;
    }

    if (this.state !== 'title'){
      if (getActiveScreen() === 'title') {
        console.warn(
          `[nav] title start recovery${debugFormatContext({ previous: this.state })}`
        );
        this.state = 'title';
      } else {
        logPlayClickIgnored('invalid-state', { screen: getActiveScreen(), state: this.state });
        return;
      }
    }

    this.titleStartInFlight = true;

    try {
      setProgressApplicationEnabled(true);
      console.info(`[progress] start requested${debugFormatContext({ via: 'uiStartFromTitle', screen: getActiveScreen() })}`);
      await refreshProgressSnapshotForTitleStart({ eagerWaitMs: TITLE_START_PROGRESS_EAGER_WAIT_MS });

      const resumedFromSnapshot = getHasAppliedProgressSnapshot() && getActiveScreen() === 'interLevel';

      if (resumedFromSnapshot) {
        overlay.innerHTML = '';
        hideOverlay(overlay);
        if (typeof document !== 'undefined' && document.body) {
          document.body.classList.remove('is-title');
        }
        if (overlay) {
          overlay.classList.remove('overlay-title');
        }
        stopMenuMusic();
        return;
      }

      leaveTitleScreen();
      overlay.innerHTML = '';
      hideOverlay(overlay);
      this.start();
  } finally {
    this.titleStartInFlight = false;
  }
}
  renderTitle(){
    setActiveScreen('title', { via: 'renderTitle' });
    this.settingsReturnView = "title";
    const bgState = typeof getBackgroundState === 'function' ? getBackgroundState() : { currentBackgroundSrc: '', hasBackgroundImage: false };
    if (bgState.currentBackgroundSrc === MENU_BACKGROUND_SRC) {
      setBackgroundImageSrc(MENU_BACKGROUND_SRC);
    } else if (bgState.hasBackgroundImage) {
      fadeOutBgThen(MENU_BACKGROUND_SRC);
    } else {
      setBackgroundImageSrc(MENU_BACKGROUND_SRC);
    }
    setTitleAccountAnchorVisible(true);
    enterTitleScreen();
    overlay.innerHTML = `
      <div class="title-screen" role="presentation">
        <div class="title-screen-spacer" aria-hidden="true"></div>
        <div class="title-buttons" role="navigation">
          <button id="btnPlay" type="button">Jouer</button>
          <button id="btnRulesTitle" type="button">Règle du jeu</button>
          <button type="button" class="btn-settings" data-action="open-settings">Paramètres</button>
      <button id="btnLB" type="button">Leaderboard</button>
        </div>
      </div>`;
    showExclusiveOverlay(overlay);
    bindTitleAccountButton({
      onOpenAccount: () => this.renderAccountPanel({ keepMode: true }),
      playSound,
    });
    if (window.SD_UI_PANELS?.bindTitlePanelButtons) {
      window.SD_UI_PANELS.bindTitlePanelButtons({
        INPUT,
        addEvent,
        playSound,
        onShowRules: () => this.renderRules("title"),
        onShowLeaderboard: () => this.renderLeaderboard(),
      });
    }
    addEvent(document.getElementById('btnPlay'), INPUT.tap, async (e)=>{
      e.preventDefault(); e.stopPropagation();
      playSound("click");
      const authSnapshot = getAuthStateSnapshot();
      console.info(`[progress] play clicked${debugFormatContext({ screen: getActiveScreen(), auth: authSnapshot?.user ? 'authenticated' : 'guest' })}`);
      await new Promise(r=>requestAnimationFrame(r));
      try{ const prev=ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled=false; const warmupWallet = typeof getWalletImage === 'function' ? getWalletImage() : null; const imgs=[warmupWallet, GoldImg, SilverImg, BronzeImg, DiamondImg, BombImg, Hand.open, Hand.pinch]; for (const im of imgs){ if (im && im.naturalWidth) ctx.drawImage(im,0,0,1,1); } ctx.save(); ctx.shadowColor='rgba(0,0,0,0.15)'; ctx.shadowBlur=4; ctx.shadowOffsetY=1; ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(4,4,2,0,Math.PI*2); ctx.fill(); ctx.restore(); ctx.imageSmoothingEnabled=prev; ctx.clearRect(0,0,8,8); }catch(_){ }
      this.uiStartFromTitle();
    }, { passive:false });
  }
  async renderAccountPanel(options = {}){
    if (typeof renderAccountPanelUi !== 'function') return;
    await renderAccountPanelUi({
      ...options,
      overlay,
      addEvent,
      INPUT,
      playSound,
      showExclusiveOverlay,
      setActiveScreen,
      LOGOUT_WATCHDOG_TIMEOUT_MS,
      activeScreen: getActiveScreen(),
      accountMode: this.accountMode,
      setAccountMode: (mode) => {
        this.accountMode = mode === 'signup' ? 'signup' : 'signin';
      },
      accountFlashMessage: this.accountFlashMessage,
      setAccountFlashMessage: (value) => {
        this.accountFlashMessage = value;
      },
      clearAccountFlashMessage: () => {
        this.accountFlashMessage = null;
      },
      onReturnToTitle: () => this.renderTitle(),
      onRerender: (args = {}) => this.renderAccountPanel({ ...args, keepMode: true }),
      logLogoutClickIgnored,
    });
  }
  renderSettings(){
    if (window.SD_UI_PANELS?.renderSettingsPanel) {
      window.SD_UI_PANELS.renderSettingsPanel({
        overlay,
        settings: this.settings,
        settingsReturnView: this.settingsReturnView,
        state: this.state,
        activeScreen: getActiveScreen(),
        lastNonSettingsScreen: getLastNonSettingsScreen(),
        showExclusiveOverlay,
        hideOverlay,
        hideLegendResultScreen,
        hideInterLevelScreen,
        showInterLevelScreen,
        getLastInterLevelResult,
        playSound,
        saveSettings,
        setSoundEnabled,
        setActiveControlMode,
        addEvent,
        INPUT,
        normalizeScreenName,
        setActiveScreen,
        debugFormatContext,
        onSettingsReturnViewChange: (value) => { this.settingsReturnView = value; },
        onRenderPause: () => this.renderPause(),
        onRenderGameOver: () => this.renderGameOver(),
        onRenderTitle: () => this.renderTitle(),
      });
    }
  }
  renderLeaderboard(){
    if (window.SD_UI_PANELS?.renderLeaderboardPanel) {
      window.SD_UI_PANELS.renderLeaderboardPanel({
        overlay,
        activeScreen: getActiveScreen(),
        setActiveScreen,
        setTitleAccountAnchorVisible,
        showExclusiveOverlay,
        addEvent,
        removeEvent,
        INPUT,
        playSound,
        normalizeScreenName,
        formatScore,
        getScoreService,
        getLastInterLevelResult,
        showInterLevelScreen,
        hideOverlay,
        onRenderTitle: () => this.renderTitle(),
        onRenderPause: () => this.renderPause(),
        onRenderGameOver: () => this.renderGameOver(),
        onSetReturnView: (value) => { this.leaderboardReturnView = value; },
      });
    }
  }
  renderPause(){
    renderPauseOverlay({
      overlay,
      onResume: () => {
        setActiveScreen('running', { via: 'pause-resume' });
        this.state='playing';
        this.lastTime=performance.now();
        this.loop();
      },
      onQuit: () => {
        this.reset();
      },
      onShowRules: () => {
        this.renderRules("pause");
      },
      setReturnView: () => {
        this.settingsReturnView = "pause";
      },
    });
  }
  renderRules(returnView){
    if (window.SD_UI_PANELS?.renderRulesPanel) {
      window.SD_UI_PANELS.renderRulesPanel({
        overlay,
        rulesReturnView: returnView || this.state || "title",
        setTitleAccountAnchorVisible,
        showExclusiveOverlay,
        hideOverlay,
        addEvent,
        removeEvent,
        INPUT,
        playSound,
        onSetRulesReturnView: (value) => { this.rulesReturnView = value; },
        onReturnToPause: () => this.renderPause(),
        onReturnToTitle: () => this.renderTitle(),
      });
    }
  }
  renderGameOver(){
    const best=parseInt(localStorage.getItem(LS.bestScore)||'0',10);
    this.settingsReturnView = "over";
    setActiveScreen('gameover', { via: 'renderGameOver' });
    overlay.innerHTML = `
    <div class="panel panel-shell gameover-panel" role="dialog" aria-modal="true" aria-labelledby="gameOverTitle">
      <div class="panel-header">
        <h1 id="gameOverTitle">Fin de partie</h1>
        <p class="panel-subtitle">Récapitulatif de ta dernière session.</p>
      </div>

      <div class="panel-grid">
        <section class="panel-section panel-card">
          <h2 class="panel-title">Résumé</h2>
          <ul class="panel-stat-list">
            <li><span>Score</span><strong>${this.score}</strong></li>
            <li><span>Record local</span><strong>${best}</strong></li>
            <li><span>Combo max</span><strong>${this.maxCombo}</strong></li>
            <li><span>Niveau atteint</span><strong>N${this.levelReached}</strong></li>
          </ul>
        </section>
      </div>

      <div class="panel-footer">
        <div class="btnrow panel-actions">
          <button id="again">Rejouer</button>
          <button id="menu">Menu</button>
          ${TG? '<button id="share">Partager</button>': ''}
        </div>
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

async function startGame(){
  if (window.__saltDroppeeStarted) return;

  const canvasRefs = setupCanvasContext();
  canvas = canvasRefs.canvas;
  ctx = canvasRefs.ctx;
  overlay = document.getElementById('overlay');
  if (!canvas || !ctx || !overlay) return;

  window.__saltDroppeeStarted = true;

  if (typeof unlockAudioOnce === "function") {
    unlockAudioOnce();
  }
  unlockMusicOnce();

  resizeGameCanvas();
  addEvent(window, 'resize', resizeGameCanvas);
  addEvent(window, 'keydown', onKeyDown);
  addEvent(window, 'keyup', onKeyUp);
  addEvent(canvas, INPUT.down, onPointerDown);
  addEvent(window, INPUT.move, onPointerMove);
  addEvent(window, INPUT.up, onPointerUp);
  if (INPUT.cancel) addEvent(window, INPUT.cancel, onPointerUp);
  addEvent(window, 'blur', () => resetPointerDragState({ releaseCapture: true }));

  game = new Game();
  if (game && game.wallet) window.targetX = game.wallet.x + game.wallet.w / 2;

  // Synchronisation de la progression Supabase avant le tout premier chargement de niveau
  // pour éviter de lancer startLevel(0) avant d'avoir récupéré un snapshot éventuel.
  await waitForInitialProgressHydration();
  await applyPendingProgressIfPossible();

  if (!getHasAppliedProgressSnapshot()) {
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

  addEvent(canvas, INPUT.tap, (e)=>{ if (game.state!=='playing') return; const now=performance.now(); if (game.ignoreClicksUntil && now < game.ignoreClicksUntil) return; const pt=getCanvasPointSafe(e); if (pt.y<40 && pt.x>BASE_W-80){ playSound("click"); game.state='paused'; game.renderPause(); } });

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
