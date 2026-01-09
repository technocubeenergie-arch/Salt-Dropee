(function initUiOverlays(global) {
  const SD_UI_OVERLAYS = global.SD_UI_OVERLAYS || {};

  const {
    SAVE_AND_QUIT_TIMEOUT_MS = 0,
    SAVE_AND_QUIT_LABELS = {},
    MENU_BACKGROUND_SRC = '',
    INTER_LEVEL_BACKGROUNDS = [],
    LEVELS = [],
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

  const {
    addEvent = () => {},
    INPUT = {},
  } = global.SD_INPUT || {};

  let lastInterLevelResult = SD_UI_OVERLAYS.getLastInterLevelResult?.() || "win";

  function getAuthState() {
    if (global.SD_UI_ACCOUNT?.getAuthStateSnapshot) {
      return global.SD_UI_ACCOUNT.getAuthStateSnapshot();
    }
    return global.getAuthStateSnapshot?.() || {};
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
    const body = global.document?.body || null;
    if (body) {
      body.classList.remove('is-legend-level');
    }

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
    const isGameOver = result !== "win";

    screen.classList.toggle("inter-win", !!shouldUseInterVisuals);
    screen.classList.toggle("legend-mode", !!isLegend);
    screen.classList.toggle("gameover-mode", !!isGameOver);

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
    screen.classList.remove("gameover-mode");
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

  function renderPauseOverlay(options = {}) {
    const overlayEl = options.overlay || global.document?.getElementById('overlay');
    if (!overlayEl) return;

    const {
      onResume = () => {},
      onQuit = () => {},
      onShowRules = () => {},
      setReturnView = () => {},
    } = options;

    if (typeof global.SD_AUDIO?.pauseAllAudio === 'function') {
      global.SD_AUDIO.pauseAllAudio({ reason: 'ui-pause' });
    }
    setActiveScreen('paused', { via: 'renderPause' });
    overlayEl.classList.remove('overlay-title');
    setReturnView();
    overlayEl.innerHTML = `
      <div class="panel panel-shell pause-panel" role="dialog" aria-modal="true" aria-labelledby="pauseTitle">
        <div class="panel-header">
          <h1 id="pauseTitle">Pause</h1>
          <p class="panel-subtitle">Fais une pause, reprends quand tu veux.</p>
        </div>
        <div class="panel-grid">
          <section class="panel-section panel-card">
            <h2 class="panel-title">Actions</h2>
            <div class="btnrow panel-actions">
              <button id="resume" type="button">Reprendre</button>
              <button type="button" class="btn-settings" data-action="open-settings">Paramètres</button>
              <button id="quit" type="button">Menu</button>
              <button id="btnRulesPause" type="button">Règle du jeu</button>
            </div>
          </section>
        </div>
      </div>`;
    showExclusiveOverlay(overlayEl);
    addEvent(global.document?.getElementById('resume'), INPUT.tap, ()=>{
      playSound("click");
      if (typeof global.SD_AUDIO?.resumeAllAudio === 'function') {
        global.SD_AUDIO.resumeAllAudio({ reason: 'user-resume' });
      }
      overlayEl.innerHTML='';
      hideOverlay(overlayEl);
      onResume();
    });
    addEvent(global.document?.getElementById('quit'), INPUT.tap, ()=>{
      playSound("click");
      overlayEl.innerHTML='';
      hideOverlay(overlayEl);
      onQuit();
    });
    addEvent(global.document?.getElementById('btnRulesPause'), INPUT.tap, (evt)=>{
      evt.preventDefault();
      evt.stopPropagation();
      playSound("click");
      onShowRules();
    }, { passive:false });
  }

  // --- Test manuel temporaire : appuyer sur 'i' pour afficher l’écran ---
  addEvent(global.window, 'keydown', (e) => {
    if (shouldBlockGameplayShortcuts(e)) return;
    if (e.key === "i" || e.key === "I") {
      console.info('[nav] debug shortcut -> interLevel');
      showInterLevelScreen("win");
    }
  });

  // Appeler le binding après chargement du DOM / init jeu
  addEvent(global.window, "load", bindInterLevelButtons);

  global.showInterLevelScreen = showInterLevelScreen;
  global.hideInterLevelScreen = hideInterLevelScreen;

  SD_UI_OVERLAYS.setInterLevelUiState = setInterLevelUiState;
  SD_UI_OVERLAYS.showInterLevelScreen = showInterLevelScreen;
  SD_UI_OVERLAYS.hideInterLevelScreen = hideInterLevelScreen;
  SD_UI_OVERLAYS.updateInterLevelSaveButtonState = updateInterLevelSaveButtonState;
  SD_UI_OVERLAYS.bindInterLevelButtons = bindInterLevelButtons;
  SD_UI_OVERLAYS.navigateToTitleAfterSaveQuit = navigateToTitleAfterSaveQuit;
  SD_UI_OVERLAYS.getSaveQuitStatus = getSaveQuitStatus;
  SD_UI_OVERLAYS.getLastInterLevelResult = () => lastInterLevelResult || "win";
  SD_UI_OVERLAYS.renderPauseOverlay = renderPauseOverlay;

  global.SD_UI_OVERLAYS = SD_UI_OVERLAYS;
})(typeof window !== 'undefined' ? window : globalThis);
