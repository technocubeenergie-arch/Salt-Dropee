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

let activeScreen = 'boot';
let lastNonSettingsScreen = 'boot';
const NAV_SCREEN_LOG_TARGETS = new Set(['title', 'running', 'paused', 'interLevel', 'settings', 'gameover', 'leaderboard']);

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

function logPlayClickIgnored(reason, extra = {}) {
  const details = debugFormatContext({
    reason,
    ...extra,
  });
  console.info(`[nav] play click ignored because ${reason}${details}`);
}

function logLogoutClickIgnored(reason, extra = {}) {
  const details = debugFormatContext({
    reason,
    ...extra,
  });
  console.info(`[auth] logout click ignored because ${reason}${details}`);
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
  setTitleAccountAnchorVisible(normalized === 'title');
  return normalized;
}

let canvas;
let ctx;
let overlay;
let game;

function isActiveGameplayInProgress(){
  return Boolean(game && game.state === 'playing' && activeScreen === 'running');
}

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
let logoutInFlight = false;
let logoutWatchdogTimer = null;

function getAuthService(){
  if (authFacade) return authFacade;
  if (typeof window !== 'undefined' && window.SaltAuth) {
    authFacade = window.SaltAuth;
  }
  return authFacade;
}

function getScoreService(){
  if (typeof window !== 'undefined' && window.ScoreController) {
    return window.ScoreController;
  }
  return null;
}

function getReferralService(){
  if (typeof window !== 'undefined' && window.ReferralController) {
    return window.ReferralController;
  }
  if (typeof window !== 'undefined' && typeof window.getReferralService === 'function') {
    try {
      return window.getReferralService();
    } catch (error) {
      console.warn('[referral] failed to read service from window', error);
    }
  }
  return null;
}

const REFERRAL_URL_PARAM = 'ref';

function normalizeReferralCodeFromInput(code){
  if (typeof code !== 'string') return '';
  const trimmed = code.trim();
  return trimmed ? trimmed.toUpperCase() : '';
}

function reconcilePendingReferralCode(state){
  const referralService = getReferralService();
  if (!referralService || typeof referralService.getPendingReferralCode !== 'function') return;
  const pending = referralService.getPendingReferralCode();
  const hasReferrer = !!state?.profile?.referredBy;
  if (pending && hasReferrer && typeof referralService.setPendingReferralCode === 'function') {
    referralService.setPendingReferralCode(null);
  }
}

function captureReferralCodeFromUrl(){
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const refFromUrl = url.searchParams.get(REFERRAL_URL_PARAM);
    const normalized = normalizeReferralCodeFromInput(refFromUrl);
    if (!normalized) {
      return null;
    }

    const state = getAuthStateSnapshot();
    if (state?.profile?.referredBy) {
      return null;
    }

    const referralService = getReferralService();
    if (referralService?.setPendingReferralCode) {
      referralService.setPendingReferralCode(normalized);
      console.info(`[referral] captured code from URL: ${normalized}`);
    }

    return normalized;
  } catch (error) {
    console.warn('[referral] failed to read referral code from URL', error);
    return null;
  }
}

function getAuthStateSnapshot(){
  return authState;
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

function handleAuthStateUpdate(nextState){
  authState = { ...DEFAULT_AUTH_FRONT_STATE, ...(nextState || {}) };
  reconcilePendingReferralCode(authState);
  updateTitleAccountStatus();
  refreshAccountPanelIfVisible();
  updateInterLevelSaveButtonState();
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
    statusText = username || 'Connecté';
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
let targetX = (typeof BASE_W === 'number' ? BASE_W : 0) / 2;
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

// =====================
// ENTITÉS
// =====================
class Wallet{
  constructor(game){ this.g=game; this.level=1; this.x=BASE_W/2; this.y=BASE_H-40; this.w=48; this.h=40; this.slowTimer=0; this.dashCD=0; this.spriteHCapPx=0; this.impact=0; this.impactDir='vertical'; this.squashTimer=0; this.visualScale=1; targetX = this.x + this.w / 2; }
  bump(strength=0.35, dir='vertical'){ this.impact = Math.min(1, this.impact + strength); this.impactDir = dir; }
  applyCaps(){
    const walletImg = typeof getWalletImage === 'function' ? getWalletImage() : null;
    const maxH = Math.floor(BASE_H * CONFIG.maxWalletH);
    this.spriteHCapPx = maxH;
    const baseWidth = CONFIG.wallet?.width ?? this.w;
    const ratio = (walletImg && walletImg.naturalWidth > 0)
      ? (walletImg.naturalHeight / walletImg.naturalWidth)
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
    const walletImg = typeof getWalletImage === 'function' ? getWalletImage() : null;
    if (!walletImg || !walletImg.complete) return;

    const aspectRatio = (walletImg.naturalWidth > 0)
      ? walletImg.naturalHeight / walletImg.naturalWidth
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

    g.drawImage(walletImg, x, y, drawWidth, drawHeight);

    g.restore();
  }
}

const HAND_RIGHT_OVERFLOW_RATIO = 0.6;

class Arm{
  constructor(game){ this.g=game; this.t=0; this.frame=0; this.handX=BASE_W/2; this.spriteHCapPx=0; this.targetX=BASE_W/2; this.baseMoveSpeed=120; this.moveSpeed=this.baseMoveSpeed; this.level=1; this.retarget=0; this.baseRetargetMin=0.6; this.baseRetargetMax=1.8; this.baseMaxStep=140; this.baseJitter=0.05; this.activityFactor=1; this.minRetarget=this.baseRetargetMin; this.maxRetarget=this.baseRetargetMax; this.maxStep=this.baseMaxStep; this.maxIdleAtTarget=Infinity; this.jitterAmt=this.baseJitter; this._drawW=90; this._drawH=90; this._x=0; this._y=0; }
  applyCaps(){ const maxH = Math.floor(BASE_H * CONFIG.maxTopActorH); this.h = Math.min(Math.floor(BASE_H * 0.21), maxH); }
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
  draw(g){ const maxH = Math.floor(BASE_H * CONFIG.maxTopActorH); const targetH = Math.min(this.h, maxH); const y=Math.max(0, CONFIG.topActorOffsetY ?? 13); const img=(this.frame===0?Hand.open:Hand.pinch); if (!Hand.ready || !img || !(img.naturalWidth>0)){ this._drawW=90; this._drawH=targetH; const w=this._drawW; const overflow=w*HAND_RIGHT_OVERFLOW_RATIO; const x=clamp(this.handX - w/2, 10, BASE_W - w - 10 + overflow); this._x=x; this._y=y; return; }
    const natW=img.naturalWidth, natH=img.naturalHeight; const scale=targetH/natH; const drawW=natW*scale, drawH=natH*scale; const overflow=drawW*HAND_RIGHT_OVERFLOW_RATIO; const x = clamp(this.handX - drawW/2, 10, BASE_W - drawW - 10 + overflow);
    g.save(); g.imageSmoothingEnabled = true; const drawX=Math.round(x), drawY=Math.round(y); g.drawImage(img, drawX, drawY, drawW, drawH); g.restore(); this._drawW=drawW; this._drawH=drawH; this._x=drawX; this._y=drawY; }
  spawnX(){ return clamp((this._x||0) + (this._drawW||90) - 103, 16, BASE_W - 16); }
  spawnY(){ return (this._y||0) + (this._drawH||48) - 88; }
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
  async uiStartFromTitle(){
    if (this.titleStartInFlight){
      logPlayClickIgnored('start-in-flight', { screen: activeScreen, state: this.state });
      return;
    }

    if (this.state !== 'title'){
      if (activeScreen === 'title') {
        console.warn(
          `[nav] title start recovery${debugFormatContext({ previous: this.state })}`
        );
        this.state = 'title';
      } else {
        logPlayClickIgnored('invalid-state', { screen: activeScreen, state: this.state });
        return;
      }
    }

    this.titleStartInFlight = true;

    try {
      setProgressApplicationEnabled(true);
      console.info(`[progress] start requested${debugFormatContext({ via: 'uiStartFromTitle', screen: activeScreen })}`);
      await refreshProgressSnapshotForTitleStart({ eagerWaitMs: TITLE_START_PROGRESS_EAGER_WAIT_MS });

      const resumedFromSnapshot = getHasAppliedProgressSnapshot() && activeScreen === 'interLevel';

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
    const accountAnchor = getOrCreateTitleAccountAnchor();
    const accountBtn = document.getElementById('btnAccount');
    if (accountBtn) {
      if (!accountBtn.dataset.titleAccountBound) {
        addEvent(accountBtn, INPUT.tap, (evt)=>{
          evt.preventDefault();
          evt.stopPropagation();
          playSound("click");
          this.renderAccountPanel({ keepMode: true });
        }, { passive:false });
        accountBtn.dataset.titleAccountBound = 'true';
      }
      if (accountAnchor) {
        accountAnchor.classList.add('is-ready');
      }
    }
    updateTitleAccountStatus();
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
      console.info(`[progress] play clicked${debugFormatContext({ screen: activeScreen, auth: authSnapshot?.user ? 'authenticated' : 'guest' })}`);
      await new Promise(r=>requestAnimationFrame(r));
      try{ const prev=ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled=false; const warmupWallet = typeof getWalletImage === 'function' ? getWalletImage() : null; const imgs=[warmupWallet, GoldImg, SilverImg, BronzeImg, DiamondImg, BombImg, Hand.open, Hand.pinch]; for (const im of imgs){ if (im && im.naturalWidth) ctx.drawImage(im,0,0,1,1); } ctx.save(); ctx.shadowColor='rgba(0,0,0,0.15)'; ctx.shadowBlur=4; ctx.shadowOffsetY=1; ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(4,4,2,0,Math.PI*2); ctx.fill(); ctx.restore(); ctx.imageSmoothingEnabled=prev; ctx.clearRect(0,0,8,8); }catch(_){ }
      this.uiStartFromTitle();
    }, { passive:false });
  }
  async renderAccountPanel(options = {}){
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
      <div class="panel panel-shell account-panel" role="dialog" aria-modal="true" aria-labelledby="accountTitle" data-account-panel="true">
        <div class="panel-header">
          <h1 id="accountTitle"></h1>
          <p class="panel-subtitle">Gestion du profil et des récompenses.</p>
        </div>
        <div class="panel-grid account-panel-body" data-account-body></div>
        <div class="panel-footer">
          <p class="account-message" data-account-message role="status" aria-live="polite"></p>
        </div>
      </div>`;
    showExclusiveOverlay(overlay);
    setActiveScreen('account', { via: 'renderAccountPanel', mode: this.accountMode });
    const state = getAuthStateSnapshot();
    const body = overlay.querySelector('[data-account-body]');
    const messageEl = overlay.querySelector('[data-account-message]');
    const titleEl = overlay.querySelector('#accountTitle');

    const setAccountTitle = (text = '') => {
      if (!titleEl) return;
      titleEl.textContent = text || '';
    };

    setAccountTitle(state?.profile?.username || 'Compte');

    const setMessage = (text = '', variant = 'info') => {
      if (!messageEl) return;
      messageEl.textContent = text || '';
      messageEl.classList.remove('is-error', 'is-success');
      if (variant === 'error') messageEl.classList.add('is-error');
      if (variant === 'success') messageEl.classList.add('is-success');
    };

    if (this.accountFlashMessage) {
      setMessage(this.accountFlashMessage.text, this.accountFlashMessage.variant || 'info');
      this.accountFlashMessage = null;
    }

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
          <section class="panel-section panel-card">
            <h2 class="panel-title">Service indisponible</h2>
            <p>Le service de compte est désactivé sur cette version.</p>
          </section>
          <div class="panel-footer">
            <div class="btnrow panel-actions"><button type="button" data-account-close>Retour</button></div>
          </div>`;
      }
      setMessage('Authentification indisponible.', 'error');
      wireCloseButtons();
      return;
    }

    if (!state.ready) {
      if (body) {
        body.innerHTML = `
          <section class="panel-section panel-card">
            <h2 class="panel-title">Connexion en cours</h2>
            <p>Connexion au service d’authentification…</p>
          </section>
          <div class="panel-footer">
            <div class="btnrow panel-actions"><button type="button" data-account-close>Retour</button></div>
          </div>`;
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
      let referralStats = { ok: true, creditedCount: 0 };
      const referralService = getReferralService();
      if (referralService && typeof referralService.fetchReferralStatsForCurrentPlayer === 'function') {
        try {
          const result = await referralService.fetchReferralStatsForCurrentPlayer();
          if (result) {
            referralStats = result;
          }
        } catch (error) {
          console.warn('[referral] failed to fetch referral stats for account panel', error);
        }
      }

      const creditedCount = referralStats?.ok ? Math.max(0, referralStats.creditedCount || 0) : 0;
      const referralStatsLine = referralStats?.ok
        ? (creditedCount > 0
          ? `<p class="account-field-note account-field-readonly">Tu as déjà parrainé ${creditedCount === 1 ? '1 joueur.' : `${creditedCount} joueurs.`}</p>`
          : '<p class="account-field-note account-field-readonly account-referral-empty">Tu n’as pas encore parrainé de joueur.</p>')
        : '';

      const profileUsername = state.profile?.username || '';
      const safeProfileUsername = escapeHtml(profileUsername);
      const safeUsername = escapeHtml(state.user.username || '');
      const safeEmail = escapeHtml(state.user.email || '');
      const accountTitle = profileUsername || state.user.username || state.user.email || 'Compte';
      setAccountTitle(accountTitle);
      const pendingReferralCode = !state.profile?.referredBy && referralService?.getPendingReferralCode
        ? referralService.getPendingReferralCode()
        : null;
      const referralCodeRaw = state.profile?.referralCode || '';
      const referralLink = `${window.location.origin}${window.location.pathname}${referralCodeRaw ? `?${REFERRAL_URL_PARAM}=${encodeURIComponent(referralCodeRaw)}` : ''}`;
      const safeReferralLink = escapeHtml(referralLink);
      const referralCopyButton = referralCodeRaw
        ? `<div class="btnrow panel-actions account-referral-actions account-referral-copy">\n                <button type="button" class="btn btn-secondary" data-referral-copy>Copier le lien</button>\n              </div>`
        : '';
      const referralSection = `
          <div class="account-referral-section panel-grid">
            <div class="panel-section panel-card account-referral-link-block">
              <h2 class="panel-title">🔗 Mon lien de parrainage</h2>
              <p class="account-field-note account-field-readonly account-referral-link">${safeReferralLink}</p>
              ${referralCopyButton}
            </div>
            <div class="panel-section panel-card account-referral-stats">
              <h2 class="panel-title">👥 Mes filleuls</h2>
              ${referralStatsLine}
            </div>
            <div class="panel-section panel-card account-referral-redeem">
              <h2 class="panel-title">🎁 Utiliser un code de parrainage</h2>
              ${state.profile?.referredBy
                ? '<p class="account-field-note account-field-readonly">Ton code de parrainage a bien été pris en compte.</p>'
                : `<label class="panel-field">Code de parrainage (optionnel)
                    <input type="text" name="referralCode" data-referral-input autocomplete="off" spellcheck="false" maxlength="24" value="${escapeHtml(pendingReferralCode || '')}" />
                  </label>
                  <div class="btnrow panel-actions account-referral-actions">
                    <button type="button" data-referral-submit>Valider</button>
                  </div>
                  <p class="account-field-note account-field-error" data-referral-feedback role="status" aria-live="polite"></p>`}
            </div>
          </div>`;
      if (body) {
        body.innerHTML = `
          ${referralSection}
          <div class="panel-footer">
            <div class="btnrow panel-actions">
              <button type="button" id="btnAccountSignOut">Se déconnecter</button>
              <button type="button" data-account-close>Fermer</button>
            </div>
          </div>`;
      }
      wireCloseButtons();
      const signOutBtn = document.getElementById('btnAccountSignOut');
        if (signOutBtn) {
          addEvent(signOutBtn, INPUT.tap, async (evt)=>{
            evt.preventDefault();
            evt.stopPropagation();
            playSound("click");

            if (logoutInFlight) {
              logLogoutClickIgnored('in-flight', { screen: activeScreen });
              return;
            }

            const liveService = getAuthService();
            if (!liveService || typeof liveService.signOut !== 'function') {
              logLogoutClickIgnored('service-unavailable', { screen: activeScreen });
              setMessage('Service indisponible.', 'error');
              return;
            }

            logoutInFlight = true;
            if (logoutWatchdogTimer) {
              clearTimeout(logoutWatchdogTimer);
              logoutWatchdogTimer = null;
            }
            setMessage('Déconnexion en cours…');

            try {
              const timeoutToken = Symbol('logout-timeout');
              const signOutPromise = liveService.signOut();
              const watchdogPromise = new Promise((resolve) => {
                logoutWatchdogTimer = setTimeout(() => {
                  console.warn('[auth] logout watchdog triggered after timeout');
                  setMessage('Déconnexion trop longue. Réessayez.', 'error');
                  logoutWatchdogTimer = null;
                  resolve(timeoutToken);
                }, LOGOUT_WATCHDOG_TIMEOUT_MS);
              });

              const result = await Promise.race([signOutPromise, watchdogPromise]);
              if (result === timeoutToken) {
                if (typeof liveService.forceLocalSignOut === 'function') {
                  try {
                    await liveService.forceLocalSignOut({ reason: 'watchdog-timeout' });
                  } catch (error) {
                    console.warn('[auth] local logout fallback failed', error);
                  }
                }
                if (signOutPromise && typeof signOutPromise.then === 'function') {
                  signOutPromise
                    .then((lateResult) => {
                      if (lateResult?.success) {
                        console.info('[auth] remote signOut confirmed after local fallback');
                      } else if (lateResult) {
                        console.warn('[auth] remote signOut reported failure after local fallback', lateResult);
                      }
                    })
                    .catch((error) => console.warn('[auth] remote signOut rejected after local fallback', error));
                }
                console.warn('[auth] Supabase signOut not confirmed in time. Forced local logout.');
                return;
              }

              if (!result?.success) {
                setMessage(result?.message || 'Déconnexion impossible.', 'error');
              }
            } catch (error) {
              console.error('[auth] logout handler failed', error);
              setMessage('Déconnexion impossible pour le moment.', 'error');
            } finally {
              logoutInFlight = false;
              if (logoutWatchdogTimer) {
                clearTimeout(logoutWatchdogTimer);
                logoutWatchdogTimer = null;
              }
            }
          }, { passive:false });
        }

        const referralInput = overlay.querySelector('[data-referral-input]');
        const referralSubmit = overlay.querySelector('[data-referral-submit]');
        const referralFeedback = overlay.querySelector('[data-referral-feedback]');
        const setReferralFeedback = (text = '', variant = 'info') => {
          if (!referralFeedback) return;
          referralFeedback.textContent = text || '';
          referralFeedback.classList.remove('is-error', 'is-success');
          if (variant === 'error') referralFeedback.classList.add('is-error');
          if (variant === 'success') referralFeedback.classList.add('is-success');
        };

        if (referralSubmit) {
          addEvent(referralSubmit, INPUT.tap, async (evt)=>{
            evt.preventDefault();
            evt.stopPropagation();
            playSound("click");

            const service = getReferralService();
            if (!service || typeof service.applyReferralCode !== 'function') {
              setMessage('Service de parrainage indisponible.', 'error');
              return;
            }

            const clearPendingReferral = () => {
              if (service?.setPendingReferralCode) {
                service.setPendingReferralCode(null);
              }
              if (referralInput) {
                referralInput.value = '';
              }
            };

            const currentAuthState = getAuthStateSnapshot();
            const alreadyReferred = !!currentAuthState?.profile?.referredBy;

              if (alreadyReferred) {
                setMessage('Un code de parrainage est déjà associé à ton compte.', 'error');
                setReferralFeedback('Tu ne peux pas appliquer un second code.', 'error');
                clearPendingReferral();
                return;
              }

            const rawCode = (referralInput?.value || '').trim();
            setReferralFeedback('');
            setMessage('Vérification du code…');

            referralSubmit.disabled = true;
            if (referralInput) referralInput.disabled = true;

            try {
              const result = await service.applyReferralCode({ code: rawCode });
              if (!result?.ok) {
                switch (result?.reason) {
                  case 'EMPTY_CODE':
                    setMessage('Merci de saisir un code avant de valider.', 'error');
                    setReferralFeedback('Code manquant.', 'error');
                    break;
                  case 'CODE_NOT_FOUND':
                    setMessage('Ce code de parrainage est invalide.', 'error');
                    setReferralFeedback('Code invalide ou inexistant.', 'error');
                    clearPendingReferral();
                    break;
                  case 'SELF_REFERRAL_NOT_ALLOWED':
                    setMessage('Tu ne peux pas utiliser ton propre code.', 'error');
                    setReferralFeedback('Choisis le code d’un autre joueur.', 'error');
                    break;
                  case 'ALREADY_REFERRED':
                    setMessage('Un code de parrainage est déjà associé à ton compte.', 'error');
                    setReferralFeedback('Tu ne peux pas appliquer un second code.', 'error');
                    clearPendingReferral();
                    break;
                  case 'AUTH_REQUIRED':
                    setMessage('Connexion requise pour appliquer un code.', 'error');
                    setReferralFeedback('Reconnecte-toi puis réessaie.', 'error');
                    break;
                  default:
                    setMessage('Impossible d’appliquer le code pour le moment.', 'error');
                    setReferralFeedback('Réessaie dans quelques instants.', 'error');
                    console.warn('[referral] applyReferralCode failed', result);
                    break;
                }
                return;
              }

              this.accountFlashMessage = { text: 'Code de parrainage appliqué avec succès 🎉', variant: 'success' };

              setReferralFeedback('Code appliqué avec succès.', 'success');

              const liveService = getAuthService();
              if (liveService?.refreshProfile) {
                await liveService.refreshProfile();
              } else if (typeof service.refreshProfileSnapshotFromSupabase === 'function') {
                await service.refreshProfileSnapshotFromSupabase();
              }

              this.renderAccountPanel({ keepMode: true });
            } catch (error) {
              console.warn('[referral] applyReferralCode handler failed', error);
              setMessage('Code impossible à valider pour le moment.', 'error');
              setReferralFeedback('Réessaie dans quelques instants.', 'error');
            } finally {
              referralSubmit.disabled = false;
              if (referralInput) referralInput.disabled = false;
            }
          }, { passive:false });
        }

        const referralCopyButtonEl = overlay.querySelector('[data-referral-copy]');
        if (referralCopyButtonEl && referralLink) {
          addEvent(referralCopyButtonEl, INPUT.tap, async (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            playSound("click");

            const showCopyError = (error) => {
              console.warn('[referral] clipboard copy failed', error);
              setMessage('Impossible de copier le lien pour le moment.', 'error');
            };

            const showCopySuccess = () => {
              setMessage('Lien de parrainage copié dans le presse-papiers ✅', 'success');
            };

            if (!referralLink) {
              showCopyError(new Error('referral link unavailable'));
              return;
            }

            try {
              if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(referralLink);
                showCopySuccess();
                return;
              }

              const textarea = document.createElement('textarea');
              textarea.value = referralLink;
              textarea.setAttribute('readonly', '');
              textarea.style.position = 'fixed';
              textarea.style.left = '-9999px';
              document.body.appendChild(textarea);

              textarea.select();
              textarea.setSelectionRange(0, referralLink.length);

              const succeeded = document.execCommand && document.execCommand('copy');
              document.body.removeChild(textarea);

              if (succeeded) {
                showCopySuccess();
              } else {
                showCopyError(new Error('execCommand copy failed'));
              }
            } catch (error) {
              showCopyError(error);
            }
          }, { passive: false });
        }
        return;
      }

    const mode = this.accountMode === 'signup' ? 'signup' : 'signin';
    if (body) {
      body.innerHTML = `
        <section class="panel-section panel-card account-auth-card">
          <div class="account-auth-header">
            <h2 class="panel-title">${mode === 'signup' ? 'Créer un compte' : 'Connexion'}</h2>
            <p class="panel-subline">${mode === 'signup' ? 'Crée ton profil pour sauvegarder tes progrès.' : 'Connecte-toi pour retrouver tes scores.'}</p>
          </div>
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
          </form>
        </section>`;
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
    if (window.SD_UI_PANELS?.renderSettingsPanel) {
      window.SD_UI_PANELS.renderSettingsPanel({
        overlay,
        settings: this.settings,
        settingsReturnView: this.settingsReturnView,
        state: this.state,
        activeScreen,
        lastNonSettingsScreen,
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
        activeScreen,
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

function checkAABB(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }

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
  if (game && game.wallet) targetX = game.wallet.x + game.wallet.w / 2;

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
