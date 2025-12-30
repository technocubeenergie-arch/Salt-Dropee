(function initInterLevel(global) {
  const SD_INTERLEVEL = global.SD_INTERLEVEL || {};

  const {
    SAVE_AND_QUIT_TIMEOUT_MS = 0,
    SAVE_AND_QUIT_LABELS = {},
    MENU_BACKGROUND_SRC = '',
    INTER_LEVEL_BACKGROUNDS = [],
    LEVELS = [],
    LEGEND_LEVEL_INDEX = -1,
  } = global.SD_CONFIG || {};

  const {
    formatScore = (value) => String(value),
  } = global.SD_UTILS || {};

  const {
    showExclusiveOverlay = () => {},
    hideOverlay = () => {},
    clearMainOverlay = () => null,
    applyLevelBackground = () => {},
    setBackgroundImageSrc = () => {},
  } = global.SD_RENDER || {};

  const {
    stopInterLevelAudio = () => {},
    playInterLevelAudioForLevel = () => {},
  } = global.SD_AUDIO || {};

  const playSound = global.playSound || (() => {});

  const {
    addEvent = () => {},
    INPUT = {},
  } = global.SD_INPUT || {};

  const {
    setActiveScreen = () => 'unknown',
    getActiveScreen = () => 'unknown',
  } = global.SD_UI_PANELS || {};

  const {
    goto: gotoScreen = () => 'unknown',
  } = global.SD_NAV || {};

  const {
    persistProgressSnapshot = async () => {},
  } = global.SD_PROGRESS || {};

  const getAuthStateSnapshot = global.SD_UI_ACCOUNT?.getAuthStateSnapshot
    || global.getAuthStateSnapshot
    || (() => ({}));

  const submitLegendScoreIfNeeded = global.submitLegendScoreIfNeeded || (async () => {});
  const markLegendRunComplete = global.markLegendRunComplete || (() => {});
  const prepareLegendLevelWarmup = global.prepareLegendLevelWarmup || (() => {});
  const isLegendLevel = global.isLegendLevel || (() => false);
  const goToNextLevel = global.goToNextLevel || (() => {});
  const hardResetRuntime = global.hardResetRuntime || (() => {});
  const loadLevel = global.loadLevel || (async () => {});
  const resumeGameplay = global.resumeGameplay || (() => {});
  const enterTitleScreen = global.enterTitleScreen || (() => {});

  let lastInterLevelResult = SD_INTERLEVEL.getLastInterLevelResult?.() || "win";

  function getAuthState() {
    try {
      return getAuthStateSnapshot() || {};
    } catch (err) {
      console.warn('[progress] unable to read auth state', err);
      return {};
    }
  }

  function getSaveQuitStatus() {
    const state = getAuthState();

    if (!state.enabled) {
      return { attemptSave: false, reason: 'supabase-disabled', message: 'Sauvegarde en ligne désactivée pour cette version.' };
    }

    if (state.lastError) {
      return { attemptSave: false, reason: 'service-error', message: state.lastError };
    }

    if (!state.ready) {
      return { attemptSave: false, reason: 'service-not-ready', message: 'Initialisation du service en cours.' };
    }

    if (!state.user || !state.profile) {
      return { attemptSave: false, reason: 'no-auth', message: 'Connexion requise pour sauvegarder en ligne.' };
    }

    return { attemptSave: true, reason: 'ok', message: 'Sauvegarde en ligne disponible.' };
  }

  function updateInterLevelSaveButtonState() {
    const btnSave = global.document?.getElementById('btnSaveQuit');
    if (!btnSave) return;

    const status = getSaveQuitStatus();
    const label = status.attemptSave
      ? SAVE_AND_QUIT_LABELS.default
      : status.reason === 'no-auth'
        ? SAVE_AND_QUIT_LABELS.loginRequired
        : SAVE_AND_QUIT_LABELS.unavailable;

    btnSave.textContent = label;
    btnSave.title = status.message || '';
    btnSave.dataset.saveAvailable = status.attemptSave ? 'yes' : 'no';
    btnSave.dataset.saveReason = status.reason || 'unknown';
    btnSave.setAttribute('aria-disabled', status.attemptSave ? 'false' : 'true');
  }

  function navigateToTitleAfterSaveQuit(context = {}) {
    const { saveResult = 'skipped', reason = null } = context;
    console.info('[progress] returning to title from save-quit', { saveResult, reason });

    hideInterLevelScreen();

    const instance = (typeof Game !== "undefined" && Game.instance)
      ? Game.instance
      : null;

    if (instance && typeof instance.reset === "function") {
      instance.reset({ showTitle: true });
      return;
    }

    setInterLevelUiState(false);
    enterTitleScreen();
    const mainOverlay = global.document?.getElementById("overlay");
    if (mainOverlay) {
      mainOverlay.innerHTML = "";
      hideOverlay(mainOverlay);
    }
    setBackgroundImageSrc(MENU_BACKGROUND_SRC);
  }

  function setInterLevelUiState(active) {
    const isActive = !!active;
    const body = typeof global.document !== 'undefined' ? global.document.body : null;
    const wrapper = global.document?.getElementById('gameWrapper');
    const canvasEl = global.document?.getElementById('gameCanvas');
    const hudEl = global.document?.getElementById('hud');

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

  function showInterLevelScreen(result = "win", options = {}) {
    lastInterLevelResult = result;
    const screen = global.document?.getElementById("interLevelScreen");
    const title  = global.document?.getElementById("interTitle");
    const scoreText = global.document?.getElementById("interScore");
    const btnNext = global.document?.getElementById("btnNextLevel");
    if (!screen || !title || !scoreText) return;

    const opts = (options && typeof options === "object") ? options : {};
    const screenAlreadyVisible = screen.classList.contains("show");

    clearMainOverlay(screen);

    setActiveScreen('interLevel', { via: 'showInterLevelScreen', result });

    // Important : la sauvegarde de progression reste manuelle (bouton "Sauvegarder & Quitter").
    // Aucun appel à persistProgressSnapshot ne doit être déclenché automatiquement ici.

    if (typeof Game !== "undefined" && Game.instance) {
      Game.instance.settingsReturnView = "inter";
    }

    title.textContent = (result === "win") ? "Niveau terminé 🎉" : "Game Over 💀";
    const numericScore = Number.isFinite(score) ? score : Number(global.score) || 0;
    const formattedScore = typeof formatScore === "function"
      ? formatScore(numericScore)
      : String(numericScore | 0);
    scoreText.textContent = "Score : " + formattedScore;

    const levelIndex = Math.max(0, Number.isFinite(currentLevelIndex) ? Math.floor(currentLevelIndex) : 0);
    const nextIndex = Math.min(levelIndex + 1, LEVELS.length - 1);
    const isLegend = isLegendLevel(levelIndex);
    const nextIsLegend = isLegendLevel(nextIndex);

    if (result === "win" && nextIsLegend) {
      prepareLegendLevelWarmup(nextIndex);
    }

    if (btnNext){
      let nextLabel = "Rejouer";
      if (result === "win") {
        nextLabel = nextIsLegend ? "Passer au mode Légende" : "Niveau suivant";
      }

      btnNext.textContent = nextLabel;
      btnNext.onclick = async () => {
        hideInterLevelScreen({ immediate: true });
        if (result === "win"){
          await goToNextLevel();
        } else {
          hardResetRuntime();
          await loadLevel(currentLevelIndex, { immediateBackground: true });
          resumeGameplay();
        }
      };
    }

    const backgroundSrc = INTER_LEVEL_BACKGROUNDS[levelIndex];
    const shouldUseInterVisuals = result === "win" && backgroundSrc && !isLegend;

    screen.classList.toggle("inter-win", !!shouldUseInterVisuals);

    if (shouldUseInterVisuals) {
      applyLevelBackground(backgroundSrc, { immediate: true });
      const shouldPlayAudio = opts.replaySound !== false && !screenAlreadyVisible;
      if (shouldPlayAudio) {
        playInterLevelAudioForLevel(levelIndex);
      }
    } else {
      stopInterLevelAudio();
    }

    setInterLevelUiState(true);
    updateInterLevelSaveButtonState();
    showExclusiveOverlay(screen);
  }

  function hideInterLevelScreen(options = {}) {
    const screen = global.document?.getElementById("interLevelScreen");
    stopInterLevelAudio();
    setInterLevelUiState(false);
    if (!screen) return;
    hideOverlay(screen, options);
  }

  function bindInterLevelButtons() {
    const bNext = global.document?.getElementById("btnNextLevel");
    const bSave = global.document?.getElementById("btnSaveQuit");

    updateInterLevelSaveButtonState();

    if (bNext){
      bNext.onclick = () => {
        hideInterLevelScreen({ immediate: true });
        goToNextLevel();
      };
    }

    if (bSave){
      bSave.onclick = async () => {
        if (typeof playSound === "function") {
          playSound("click");
        }

        const status = getSaveQuitStatus();
        console.info('[progress] save-quit clicked', {
          attemptSave: status.attemptSave,
          reason: status.reason,
          user: getAuthState()?.user ? 'yes' : 'no',
        });

        let saveResult = 'skipped';

        if (status.attemptSave) {
          const saveAction = (async () => {
            if (isLegendLevel()) {
              await submitLegendScoreIfNeeded('save-quit');
            }
            await persistProgressSnapshot('save-quit');
            return 'saved';
          })();

          saveResult = await Promise.race([
            saveAction.catch((error) => {
              console.warn('[progress] manual save failed', error);
              return 'failed';
            }),
            new Promise((resolve) => setTimeout(() => resolve('timeout'), SAVE_AND_QUIT_TIMEOUT_MS)),
          ]);

          if (saveResult === 'timeout') {
            console.warn('[progress] manual save timed out; navigating back to title.');
          }
        } else {
          console.info('[progress] save-quit skipping save attempt', status);
        }

        navigateToTitleAfterSaveQuit({ saveResult, reason: status.reason });
      };
    }
  }

  function showLegendResultScreen(reason = "time"){
    void reason;
    hideInterLevelScreen();

    const screen = global.document?.getElementById("legendResultScreen");
    const title = global.document?.getElementById("legendTitle");
    const message = global.document?.getElementById("legendMessage");
    if (!screen) return;

    clearMainOverlay(screen);

    gotoScreen('interLevel', { via: 'showLegendResultScreen', reason });

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

    const numericScore = Number.isFinite(score) ? score : Number(global.score) || 0;
    const formattedScore = typeof formatScore === "function"
      ? formatScore(numericScore)
      : String(numericScore | 0);

    if (message) {
      message.textContent = `Félicitations, votre score est de ${formattedScore}.`;
    }

    showExclusiveOverlay(screen);
  }

  function hideLegendResultScreen(options = {}){
    const screen = global.document?.getElementById("legendResultScreen");
    if (!screen) return;
    hideOverlay(screen, options);
  }

  function bindLegendResultButtons(){
    const btnHome = global.document?.getElementById("legendHomeButton");
    const btnRetry = global.document?.getElementById("legendRetryButton");

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

  addEvent(global.window, "load", () => {
    bindInterLevelButtons();
    bindLegendResultButtons();
  });

  global.showInterLevelScreen = showInterLevelScreen;
  global.hideInterLevelScreen = hideInterLevelScreen;
  global.showLegendResultScreen = showLegendResultScreen;
  global.hideLegendResultScreen = hideLegendResultScreen;

  SD_INTERLEVEL.setInterLevelUiState = setInterLevelUiState;
  SD_INTERLEVEL.showInterLevelScreen = showInterLevelScreen;
  SD_INTERLEVEL.hideInterLevelScreen = hideInterLevelScreen;
  SD_INTERLEVEL.updateInterLevelSaveButtonState = updateInterLevelSaveButtonState;
  SD_INTERLEVEL.bindInterLevelButtons = bindInterLevelButtons;
  SD_INTERLEVEL.navigateToTitleAfterSaveQuit = navigateToTitleAfterSaveQuit;
  SD_INTERLEVEL.getSaveQuitStatus = getSaveQuitStatus;
  SD_INTERLEVEL.getLastInterLevelResult = () => lastInterLevelResult || "win";
  SD_INTERLEVEL.showLegendResultScreen = showLegendResultScreen;
  SD_INTERLEVEL.hideLegendResultScreen = hideLegendResultScreen;
  SD_INTERLEVEL.bindLegendResultButtons = bindLegendResultButtons;

  global.SD_INTERLEVEL = SD_INTERLEVEL;
})(typeof window !== 'undefined' ? window : globalThis);
