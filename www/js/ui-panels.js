(function initUiPanels(global) {
  const SD_UI_PANELS = global.SD_UI_PANELS || {};

  const {
    addEvent = () => {},
    removeEvent = () => {},
    INPUT = {},
    hasTouch = false,
    setActiveControlMode = () => {},
  } = global.SD_INPUT || {};

  const {
    showExclusiveOverlay = () => {},
    hideOverlay = () => {},
  } = global.SD_RENDER || {};

  const {
    setTitleAccountAnchorVisible = () => {},
  } = global.SD_UI_CORE || {};

  const {
    showInterLevelScreen = () => {},
    hideInterLevelScreen = () => {},
    getLastInterLevelResult = () => "win",
  } = global.SD_UI_OVERLAYS || {};

  const {
    formatScore = (value) => String(value),
  } = global.SD_UTILS || {};

  function getGameInstance() {
    return (typeof Game !== "undefined" && Game.instance)
      ? Game.instance
      : null;
  }

  function getNormalizer(options = {}) {
    if (typeof options.normalizeScreenName === 'function') {
      return options.normalizeScreenName;
    }
    if (typeof global.normalizeScreenName === 'function') {
      return global.normalizeScreenName;
    }
    return (value) => (typeof value === 'string' && value.trim()) ? value : 'unknown';
  }

  function initSettingsOpener(options = {}) {
    if (SD_UI_PANELS.__settingsListenerBound) return;
    SD_UI_PANELS.__settingsListenerBound = true;

    const getInstance = options.getInstance || getGameInstance;

    if (typeof global.openSettings !== "function") {
      global.openSettings = function openSettingsFallback() {
        const instance = getInstance();

        if (instance && typeof instance.renderSettings === "function") {
          if (typeof global.playSound === "function") {
            global.playSound("click");
          }
          instance.renderSettings();
          return;
        }

        throw new Error("No settings handler available");
      };
    }

    console.info("[settings] listener initialized");
    addEvent(global.document, 'click', (event) => {
      const btn = event.target.closest('[data-action="open-settings"]');
      if (!btn) return;

      event.preventDefault();

      const instance = getInstance();

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
        global.openSettings();
      } catch (err) {
        console.error("[settings] openSettings failed:", err);
      }
    }, { passive: false });
  }

  function renderSettingsPanel(options = {}) {
    const {
      overlay = global.document?.getElementById('overlay'),
      settings = {},
      settingsReturnView = "title",
      state = "title",
      activeScreen = "title",
      lastNonSettingsScreen = "boot",
      showExclusiveOverlay: showOverlayFn = showExclusiveOverlay,
      hideOverlay: hideOverlayFn = hideOverlay,
      hideLegendResultScreen = () => {},
      hideInterLevelScreen: hideInterLevelScreenFn = hideInterLevelScreen,
      showInterLevelScreen: showInterLevelScreenFn = showInterLevelScreen,
      getLastInterLevelResult: getLastInterLevelResultFn = getLastInterLevelResult,
      playSound: playSoundFn = () => {},
      saveSettings = () => {},
      setSoundEnabled = null,
      setActiveControlMode: setActiveControlModeFn = setActiveControlMode,
      addEvent: addEventFn = addEvent,
      INPUT: inputApi = INPUT,
      onSettingsReturnViewChange = () => {},
      onRenderPause = () => {},
      onRenderGameOver = () => {},
      onRenderTitle = () => {},
      debugFormatContext = null,
      setActiveScreen: setActiveScreenFn = global.setActiveScreen || (() => {}),
    } = options;

    const normalize = getNormalizer(options);
    const formatContext = typeof debugFormatContext === 'function'
      ? debugFormatContext
      : (global.SD_INPUT?.debugFormatContext || (() => ''));

    if (overlay) overlay.classList.remove('overlay-title');
    const fromViewRaw = settingsReturnView || state || activeScreen;
    const fromView = normalize(fromViewRaw);
    console.info(`[overlay] open settings (from ${fromView})${formatContext({ raw: fromViewRaw, screen: activeScreen })}`);
    setActiveScreenFn('settings', { via: 'renderSettings', from: fromView, raw: fromViewRaw });
    const controlMode = (settings.controlMode === 'zones') ? 'zones' : 'swipe';
    settings.controlMode = controlMode;
    if (!overlay) return;
    overlay.innerHTML = `
    <div class="panel panel-shell settings-panel" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
      <div class="panel-header">
        <h1 id="settingsTitle">Paramètres</h1>
        <p class="panel-subtitle">Ajuste ton expérience de jeu.</p>
      </div>

      <div class="panel-grid settings-grid">
        <section class="panel-section panel-card settings-audio-card">
          <h2 class="panel-title">Audio & retours</h2>
          <div class="panel-field settings-toggle-group">
            <label class="settings-toggle"><input type="checkbox" id="sound" ${settings.sound?'checked':''}/> Son</label>
            <label class="settings-toggle"><input type="checkbox" id="haptics" ${settings.haptics?'checked':''}/> Vibrations</label>
          </div>
        </section>

        ${hasTouch ? `
        <section class="panel-section panel-card">
          <div class="control-mode-setting">
            <span class="control-mode-label" id="controlModeLabel">Mode de contrôle (mobile)</span>
            <div class="control-mode-toggle" role="group" aria-labelledby="controlModeLabel" data-control-toggle>
              <button type="button" class="control-mode-option" data-mode="swipe">Swipe</button>
              <button type="button" class="control-mode-option" data-mode="zones">Zones tactiles</button>
            </div>
          </div>
        </section>` : ''}

        <section class="panel-section panel-card settings-sensitivity-card">
          <h2 class="panel-title">Sensibilité</h2>
          <p class="panel-subline">Ajuste la vitesse de déplacement.</p>
          <input type="range" id="sens" min="0.5" max="1.5" step="0.05" value="${settings.sensitivity}">
        </section>
      </div>

      <div class="panel-footer">
        <div class="btnrow panel-actions"><button id="back">Retour</button></div>
      </div>
    </div>`;
    showOverlayFn(overlay);
    addEventFn(global.document?.getElementById('sound'), 'change', e=>{ playSoundFn("click"); settings.sound = e.target.checked; saveSettings(settings); if (typeof setSoundEnabled === "function") { setSoundEnabled(settings.sound); } });
    addEventFn(global.document?.getElementById('haptics'), 'change', e=>{ playSoundFn("click"); settings.haptics = e.target.checked; saveSettings(settings); });
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
        updateToggleState(settings.controlMode);
        controlButtons.forEach(btn=>{
          addEventFn(btn, 'click', (evt)=>{
            if (evt && typeof evt.preventDefault === 'function') {
              evt.preventDefault();
            }
            if (evt && typeof evt.stopPropagation === 'function') {
              evt.stopPropagation();
            }
            const value = btn.dataset.mode === 'zones' ? 'zones' : 'swipe';
            if (value === settings.controlMode) {
              updateToggleState(value);
              return;
            }
            playSoundFn("click");
            settings.controlMode = value;
            saveSettings(settings);
            setActiveControlModeFn(value);
            updateToggleState(value);
          }, { passive: false });
        });
      }
    }
    addEventFn(global.document?.getElementById('sens'), 'input', e=>{ settings.sensitivity = parseFloat(e.target.value); saveSettings(settings); });
    addEventFn(global.document?.getElementById('back'), inputApi.tap, (evt)=>{
      if (evt && typeof evt.preventDefault === 'function') {
        evt.preventDefault();
      }
      if (evt && typeof evt.stopImmediatePropagation === 'function') {
        evt.stopImmediatePropagation();
      } else if (evt && typeof evt.stopPropagation === 'function') {
        evt.stopPropagation();
      }
      playSoundFn("click");
      const targetScreen = normalize(fromViewRaw);
      const nextScreen = targetScreen === 'unknown' ? lastNonSettingsScreen : targetScreen;
      const isInterLevelTarget = nextScreen === 'interLevel';
      console.info(`[overlay] close settings (to ${nextScreen})${formatContext({ raw: fromViewRaw })}`);
      setActiveScreenFn(nextScreen, { via: 'settings-back', raw: fromViewRaw });
      onSettingsReturnViewChange("title");
      if (!isInterLevelTarget) {
        hideLegendResultScreen();
        hideInterLevelScreenFn();
      }
      overlay.innerHTML='';

      if (targetScreen === "pause" || targetScreen === "paused") {
        onRenderPause();
        return;
      }

      if (isInterLevelTarget) {
        hideOverlayFn(overlay);
        showInterLevelScreenFn(getLastInterLevelResultFn(), { replaySound: false });
        return;
      }

      if (targetScreen === "over") {
        onRenderGameOver();
        return;
      }

      onRenderTitle();
    }, { passive: false });
  }

  function renderLeaderboardPanel(options = {}) {
    const {
      overlay = global.document?.getElementById('overlay'),
      activeScreen = 'title',
      setActiveScreen: setActiveScreenFn = global.setActiveScreen || (() => {}),
      setTitleAccountAnchorVisible: setTitleAccountAnchorVisibleFn = setTitleAccountAnchorVisible,
      showExclusiveOverlay: showOverlayFn = showExclusiveOverlay,
      addEvent: addEventFn = addEvent,
      removeEvent: removeEventFn = removeEvent,
      INPUT: inputApi = INPUT,
      playSound: playSoundFn = () => {},
      normalizeScreenName,
      formatScore: formatScoreFn = formatScore,
      getScoreService: getScoreServiceFn = global.getScoreService || (() => null),
      getLastInterLevelResult: getLastInterLevelResultFn = getLastInterLevelResult,
      showInterLevelScreen: showInterLevelScreenFn = showInterLevelScreen,
      hideOverlay: hideOverlayFn = hideOverlay,
      onRenderTitle = () => {},
      onRenderPause = () => {},
      onRenderGameOver = () => {},
      onSetReturnView = () => {},
    } = options;

    const normalize = getNormalizer({ normalizeScreenName });
    const originScreen = normalize(activeScreen);
    const originReturn = originScreen === 'unknown' ? 'title' : originScreen;
    onSetReturnView(originReturn);

    if (!overlay) return;

    overlay.classList.remove('overlay-title', 'overlay-rules');
    setActiveScreenFn('leaderboard', { via: 'renderLeaderboard', from: originScreen });
    setTitleAccountAnchorVisibleFn(false);
    overlay.innerHTML = `
    <div class="panel legend-leaderboard-panel" role="dialog" aria-modal="true" aria-labelledby="legendLeaderboardTitle">
        <div class="legend-leaderboard-header">
          <h1 id="legendLeaderboardTitle">Leaderboard Legend</h1>
        </div>

      <div class="legend-leaderboard-grid">
        <section class="panel-section legend-leaderboard-card">
          <div class="legend-leaderboard-card-header">
            <h2 class="panel-title">Top 20</h2>
            <p class="panel-subline">Classement Legend</p>
          </div>
          <div class="legend-leaderboard-body">
            <div class="legend-leaderboard-scroll" aria-live="polite">
              <div id="leaderboardStatus" class="leaderboard-status">Chargement du classement…</div>
              <ol id="leaderboardList" class="leaderboard-list"></ol>
              <div id="leaderboardEmpty" class="leaderboard-empty" style="display:none;">Aucun score Legend pour le moment.</div>
            </div>
            <div id="leaderboardStickyWrapper" class="leaderboard-sticky" style="display:none;">
              <div id="leaderboardStickyEntry" class="leaderboard-entry"></div>
            </div>
          </div>
        </section>
      </div>

      <div class="panel-footer">
        <div class="btnrow legend-leaderboard-actions"><button id="back" type="button" class="btn btn-secondary">Retour</button></div>
      </div>
    </div>`;
    showOverlayFn(overlay);

    let currentPlayerId = null;
    let playerRowEl = null;
    let stickyData = null;
    let teardownStickyListeners = () => {};

    const goBack = () => {
      playSoundFn("click");
      teardownStickyListeners();
      const target = normalize(originReturn);
      if (target === 'title') {
        onRenderTitle();
        return;
      }
      if (target === 'paused' || target === 'pause') {
        onRenderPause();
        return;
      }
      if (target === 'interLevel') {
        hideOverlayFn(overlay);
        showInterLevelScreenFn(getLastInterLevelResultFn(), { replaySound: false });
        return;
      }
      if (target === 'gameover') {
        onRenderGameOver();
        return;
      }
      onRenderTitle();
    };
    addEventFn(global.document?.getElementById('back'), inputApi.tap, (evt)=>{
      if (evt && typeof evt.preventDefault === 'function') {
        evt.preventDefault();
      }
      if (evt && typeof evt.stopPropagation === 'function') {
        evt.stopPropagation();
      }
      goBack();
    }, { passive: false });

    const listEl = overlay.querySelector('#leaderboardList');
    const statusEl = overlay.querySelector('#leaderboardStatus');
    const emptyEl = overlay.querySelector('#leaderboardEmpty');
    const stickyWrapper = overlay.querySelector('#leaderboardStickyWrapper');
    const stickyEntry = overlay.querySelector('#leaderboardStickyEntry');
    const scrollContainer = overlay.querySelector('.legend-leaderboard-scroll');

    const scoreService = getScoreServiceFn();
    let referralCountsByPlayer = new Map();

    const buildReferralCountMap = (rows = []) => {
      const map = new Map();
      rows.forEach((row) => {
        if (!row?.player_id) return;
        const numeric = Number(row.credited_count);
        map.set(row.player_id, Number.isFinite(numeric) ? numeric : 0);
      });
      return map;
    };

    const getBadgeNameForReferrals = (count) => {
      const n = Number(count) || 0;
      if (n >= 20) return 'badge7.png';
      if (n >= 12) return 'badge6.png';
      if (n >= 8) return 'badge5.png';
      if (n >= 5) return 'badge4.png';
      if (n >= 3) return 'badge3.png';
      if (n >= 1) return 'badge2.png';
      return 'badge1.png';
    };

    const getReferralCountForEntry = (entry) => {
      if (!entry?.player_id) return 0;
      return referralCountsByPlayer.get(entry.player_id) ?? 0;
    };

    const formatValue = (value) => {
      if (typeof formatScoreFn === 'function') {
        return formatScoreFn(value);
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed.toString() : '0';
    };

    const renderEntry = (target, entry, rank, { isSticky = false } = {}) => {
      if (!target || !entry) return;
      target.innerHTML = '';
      if (target.tagName === 'LI') {
        target.classList.add('leaderboard-row');
      }
      target.classList.add('leaderboard-entry', 'legend-leaderboard-row');

      const isPlayerRow = Boolean(currentPlayerId && entry.player_id === currentPlayerId);
      const displayRank = Number.isFinite(rank) ? rank : (Number(entry.rank) || '?');

      if (isPlayerRow) {
        target.classList.add('is-player-row');
        target.dataset.playerId = entry.player_id;
      }
      if (isSticky) {
        target.classList.add('is-sticky-row');
      }
      target.dataset.rank = displayRank;

      const rankEl = global.document?.createElement('span');
      if (!rankEl) return;
      rankEl.className = 'lb-rank legend-leaderboard-rank';
      rankEl.textContent = `#${displayRank} `;

      const badgeEl = global.document?.createElement('img');
      badgeEl.className = 'lb-badge';
      const badgeName = getBadgeNameForReferrals(getReferralCountForEntry(entry));
      badgeEl.src = `assets/${badgeName}`;
      badgeEl.alt = 'Badge joueur';

      const nameEl = global.document?.createElement('span');
      nameEl.className = 'lb-name legend-leaderboard-name';
      nameEl.textContent = `${entry.username || 'Anonyme'} : `;

      const scoreEl = global.document?.createElement('span');
      scoreEl.className = 'lb-score legend-leaderboard-score';
      scoreEl.textContent = formatValue(entry.best_score);

      target.appendChild(rankEl);
      target.appendChild(badgeEl);
      target.appendChild(nameEl);
      target.appendChild(scoreEl);
    };

    const isPlayerRowVisible = () => {
      if (!playerRowEl || !scrollContainer) return false;
      const containerRect = scrollContainer.getBoundingClientRect();
      const rowRect = playerRowEl.getBoundingClientRect();
      const overlap = Math.min(containerRect.bottom, rowRect.bottom) - Math.max(containerRect.top, rowRect.top);
      return overlap > 0 && overlap >= Math.min(rowRect.height * 0.65, rowRect.height);
    };

    const syncStickyFloatingState = () => {
      const hasStickyEntry = Boolean(stickyData?.entry);
      if (!hasStickyEntry) {
        stickyWrapper.style.display = 'none';
        stickyWrapper.classList.remove('floating');
        if (playerRowEl) {
          playerRowEl.classList.remove('is-player-row-active', 'is-player-row-hidden');
        }
        if (scrollContainer) {
          scrollContainer.classList.remove('has-sticky-overlay');
        }
        return;
      }

      const shouldFloat = !isPlayerRowVisible();
      stickyWrapper.style.display = shouldFloat ? '' : 'none';
      stickyWrapper.classList.toggle('floating', shouldFloat);

      if (scrollContainer) {
        scrollContainer.classList.toggle('has-sticky-overlay', shouldFloat);
      }

      if (playerRowEl) {
        playerRowEl.classList.toggle('is-player-row-active', !shouldFloat);
        playerRowEl.classList.toggle('is-player-row-hidden', shouldFloat);
      }
    };

    const renderTop = (entries = []) => {
      if (!listEl || !emptyEl) return;
      listEl.innerHTML = '';
      playerRowEl = null;

      const hasEntries = Array.isArray(entries) && entries.length > 0;
      emptyEl.style.display = hasEntries ? 'none' : '';

      if (!hasEntries) {
        return;
      }

      entries.forEach((entry, index) => {
        const li = global.document?.createElement('li');
        if (!li) return;
        li.className = 'leaderboard-row';
        const rank = index + 1;
        renderEntry(li, entry, rank);
        if (currentPlayerId && entry.player_id === currentPlayerId) {
          playerRowEl = li;
        }
        listEl.appendChild(li);
      });
    };

    const renderSticky = (sticky) => {
      stickyData = sticky;
      if (!sticky?.entry) {
        syncStickyFloatingState();
        return;
      }
      stickyWrapper.style.display = '';
      const fallbackRank = Number.isFinite(sticky.entry.rank)
        ? sticky.entry.rank
        : Number(playerRowEl?.dataset?.rank) || sticky.entry.rank;
      renderEntry(stickyEntry, sticky.entry, fallbackRank, { isSticky: true });
      syncStickyFloatingState();
    };

    const handleScrollChange = () => {
      syncStickyFloatingState();
    };

    if (scrollContainer) {
      addEventFn(scrollContainer, 'scroll', handleScrollChange, { passive: true });
      addEventFn(scrollContainer, 'touchmove', handleScrollChange, { passive: true });
    }
    addEventFn(global.window || global, 'resize', handleScrollChange, { passive: true });

    teardownStickyListeners = () => {
      if (scrollContainer) {
        removeEventFn(scrollContainer, 'scroll', handleScrollChange, { passive: true });
        removeEventFn(scrollContainer, 'touchmove', handleScrollChange, { passive: true });
      }
      removeEventFn(global.window || global, 'resize', handleScrollChange, { passive: true });
    };

    const renderError = (message) => {
      if (statusEl) {
        statusEl.textContent = message;
      }
    };

    if (!scoreService || typeof scoreService.fetchLegendTop !== 'function') {
      renderError('Leaderboard indisponible pour le moment.');
      return;
    }

    (async () => {
      try {
        renderError('Chargement du classement…');
        const topResult = await scoreService.fetchLegendTop(20);
        const entries = Array.isArray(topResult?.entries) ? topResult.entries : [];

        let sticky = null;
        if (typeof scoreService.fetchMyLegendRank === 'function') {
          sticky = await scoreService.fetchMyLegendRank();
        }

        currentPlayerId = sticky?.entry?.player_id || null;

        const playerIds = new Set();
        entries.forEach((entry) => {
          if (entry?.player_id) {
            playerIds.add(entry.player_id);
          }
        });
        if (sticky?.entry?.player_id) {
          playerIds.add(sticky.entry.player_id);
        }

        if (playerIds.size > 0 && typeof scoreService.fetchLegendReferralCounts === 'function') {
          const referralResult = await scoreService.fetchLegendReferralCounts(Array.from(playerIds));
          if (referralResult?.error) {
            console.warn('[leaderboard] referral counts unavailable', referralResult.error);
          }
          if (Array.isArray(referralResult?.rows)) {
            referralCountsByPlayer = buildReferralCountMap(referralResult.rows);
          }
        }

        renderTop(entries);
        renderError(topResult?.error ? 'Classement indisponible pour le moment.' : '');
        renderSticky(sticky);
      } catch (error) {
        console.warn('[leaderboard] rendering failed', error);
        renderError('Impossible de charger le leaderboard.');
      }
    })();
  }

  function renderRulesPanel(options = {}) {
    const {
      overlay = global.document?.getElementById('overlay'),
      rulesReturnView = "title",
      setTitleAccountAnchorVisible: setTitleAccountAnchorVisibleFn = setTitleAccountAnchorVisible,
      showExclusiveOverlay: showOverlayFn = showExclusiveOverlay,
      hideOverlay: hideOverlayFn = hideOverlay,
      addEvent: addEventFn = addEvent,
      removeEvent: removeEventFn = removeEvent,
      INPUT: inputApi = INPUT,
      playSound: playSoundFn = () => {},
      onSetRulesReturnView = () => {},
      onReturnToPause = () => {},
      onReturnToTitle = () => {},
    } = options;

    if (overlay) overlay.classList.remove('overlay-title');
    const resolvedReturn = rulesReturnView || "title";
    onSetRulesReturnView(resolvedReturn);
    setTitleAccountAnchorVisibleFn(false);
    if (!overlay) return;
    overlay.innerHTML = `
      <div class="rules-screen" role="dialog" aria-modal="true" aria-label="Règles du jeu">
        <img src="assets/rules.webp" alt="Règles du jeu" />
      </div>`;
    overlay.classList.add('overlay-rules');
    showOverlayFn(overlay);

    const closeRules = () => {
      removeEventFn(overlay, inputApi.tap, onTap, { passive: false });
      overlay.classList.remove('overlay-rules');
      overlay.innerHTML = '';
      hideOverlayFn(overlay);

      if (resolvedReturn === 'pause' || resolvedReturn === 'paused') {
        onReturnToPause();
      } else {
        onReturnToTitle();
      }
    };

    const onTap = (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      playSoundFn("click");
      closeRules();
    };

    addEventFn(overlay, inputApi.tap, onTap, { passive:false });
  }

  function bindTitlePanelButtons(options = {}) {
    const {
      root = global.document,
      INPUT: inputApi = INPUT,
      addEvent: addEventFn = addEvent,
      playSound: playSoundFn = () => {},
      onShowRules = () => {},
      onShowLeaderboard = () => {},
    } = options;

    const btnLB = root?.getElementById('btnLB');
    const btnRules = root?.getElementById('btnRulesTitle');

    if (btnLB) {
      addEventFn(btnLB, inputApi.tap, (evt)=>{ evt.preventDefault(); evt.stopPropagation(); playSoundFn("click"); onShowLeaderboard(); }, { passive:false });
    }

    if (btnRules) {
      addEventFn(btnRules, inputApi.tap, (evt)=>{ evt.preventDefault(); evt.stopPropagation(); playSoundFn("click"); onShowRules(); }, { passive:false });
    }
  }

  SD_UI_PANELS.initSettingsOpener = initSettingsOpener;
  SD_UI_PANELS.renderSettingsPanel = renderSettingsPanel;
  SD_UI_PANELS.renderLeaderboardPanel = renderLeaderboardPanel;
  SD_UI_PANELS.renderRulesPanel = renderRulesPanel;
  SD_UI_PANELS.bindTitlePanelButtons = bindTitlePanelButtons;

  global.SD_UI_PANELS = SD_UI_PANELS;
})(typeof window !== 'undefined' ? window : globalThis);
