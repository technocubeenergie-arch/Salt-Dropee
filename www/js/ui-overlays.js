(function initUiOverlays(global) {
  const SD_UI_OVERLAYS = global.SD_UI_OVERLAYS || {};

  const {
    addEvent = () => {},
    INPUT = {},
  } = global.SD_INPUT || {};

  const {
    shouldBlockGameplayShortcuts = () => false,
  } = global.SD_UI_PANELS || {};

  const {
    setInterLevelUiState = () => {},
    showInterLevelScreen = () => {},
    hideInterLevelScreen = () => {},
    updateInterLevelSaveButtonState = () => {},
    bindInterLevelButtons = () => {},
    navigateToTitleAfterSaveQuit = () => {},
    getSaveQuitStatus = () => ({ attemptSave: false, reason: 'unknown', message: '' }),
    getLastInterLevelResult = () => "win",
    showLegendResultScreen = () => {},
    hideLegendResultScreen = () => {},
    bindLegendResultButtons = () => {},
  } = global.SD_INTERLEVEL || SD_UI_OVERLAYS;

  const {
    showExclusiveOverlay = () => {},
    hideOverlay = () => {},
  } = global.SD_RENDER || {};

  function renderPauseOverlay(options = {}) {
    const overlayEl = options.overlay || global.document?.getElementById('overlay');
    if (!overlayEl) return;

    const {
      onResume = () => {},
      onQuit = () => {},
      onShowRules = () => {},
      setReturnView = () => {},
    } = options;

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

  global.showInterLevelScreen = showInterLevelScreen;
  global.hideInterLevelScreen = hideInterLevelScreen;
  global.showLegendResultScreen = showLegendResultScreen;
  global.hideLegendResultScreen = hideLegendResultScreen;

  SD_UI_OVERLAYS.setInterLevelUiState = setInterLevelUiState;
  SD_UI_OVERLAYS.showInterLevelScreen = showInterLevelScreen;
  SD_UI_OVERLAYS.hideInterLevelScreen = hideInterLevelScreen;
  SD_UI_OVERLAYS.updateInterLevelSaveButtonState = updateInterLevelSaveButtonState;
  SD_UI_OVERLAYS.bindInterLevelButtons = bindInterLevelButtons;
  SD_UI_OVERLAYS.navigateToTitleAfterSaveQuit = navigateToTitleAfterSaveQuit;
  SD_UI_OVERLAYS.getSaveQuitStatus = getSaveQuitStatus;
  SD_UI_OVERLAYS.getLastInterLevelResult = () => getLastInterLevelResult() || "win";
  SD_UI_OVERLAYS.showLegendResultScreen = showLegendResultScreen;
  SD_UI_OVERLAYS.hideLegendResultScreen = hideLegendResultScreen;
  SD_UI_OVERLAYS.bindLegendResultButtons = bindLegendResultButtons;
  SD_UI_OVERLAYS.renderPauseOverlay = renderPauseOverlay;

  global.SD_UI_OVERLAYS = SD_UI_OVERLAYS;
})(typeof window !== 'undefined' ? window : globalThis);
