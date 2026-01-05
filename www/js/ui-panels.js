(function initUiPanels(global) {
  const SD_UI_PANELS = global.SD_UI_PANELS || {};

  const {
    SCREEN_NAME_ALIASES = {},
  } = global.SD_CONFIG || {};

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
    debugDescribeElement = () => '',
    debugFormatContext = () => '',
  } = global.SD_INPUT || {};

  const uiLogger = global.SD_LOG?.createLogger
    ? global.SD_LOG.createLogger('ui')
    : null;
  const logInfo = (...args) => uiLogger?.info?.(...args);
  const logDebug = (...args) => uiLogger?.debug?.(...args);
  const {
    showInterLevelScreen = () => {},
    hideInterLevelScreen = () => {},
    getLastInterLevelResult = () => "win",
  } = global.SD_UI_OVERLAYS || {};

  const {
    formatScore = (value) => String(value),
  } = global.SD_UTILS || {};

  const NAV_SCREEN_LOG_TARGETS = new Set(['title', 'running', 'paused', 'interLevel', 'settings', 'gameover', 'leaderboard']);
  let activeScreen = 'boot';
  global.activeScreen = activeScreen;
  let lastNonSettingsScreen = 'boot';
  let navStateAccessors = { getState: null, setState: null };

  function normalizeScreenName(name) {
    if (typeof name !== 'string' || name.trim() === '') return 'unknown';
    const key = name.trim();
    const lower = key.toLowerCase();
    return SCREEN_NAME_ALIASES[lower] || key;
  }

  function logNavigation(target, context = {}) {
    const navContext = debugFormatContext(context);
    logInfo?.(`[nav] goto(${target})${navContext}`);
  }

  function registerNavStateAccessors(options = {}) {
    if (typeof options.getState === 'function') {
      navStateAccessors.getState = options.getState;
    }
    if (typeof options.setState === 'function') {
      navStateAccessors.setState = options.setState;
    }
  }

  function syncNavStateActiveScreen(next, prev) {
    if (typeof navStateAccessors.setState !== 'function') return;

    const currentState = typeof navStateAccessors.getState === 'function'
      ? navStateAccessors.getState() || {}
      : {};

    const nextState = {
      ...currentState,
      activeScreen: next,
    };

    if (typeof prev === 'string' && prev && prev !== currentState.previousScreen) {
      nextState.previousScreen = prev;
    } else if (!Object.prototype.hasOwnProperty.call(nextState, 'previousScreen')) {
      nextState.previousScreen = null;
    }

    navStateAccessors.setState(nextState);
  }

  function logPlayClickIgnored(reason, extra = {}) {
    const details = debugFormatContext({
      reason,
      ...extra,
    });
    logInfo?.(`[nav] play click ignored because ${reason}${details}`);
  }

  function logLogoutClickIgnored(reason, extra = {}) {
    const details = debugFormatContext({
      reason,
      ...extra,
    });
    logInfo?.(`[auth] logout click ignored because ${reason}${details}`);
  }

  function setActiveScreen(next, context = {}) {
    const normalized = normalizeScreenName(next);
    const prev = activeScreen;
    const sameScreen = normalized === prev;
    const via = (context && typeof context === 'object' && typeof context.via === 'string' && context.via.trim())
      ? context.via
      : 'direct';
    const info = {
      ...(context && typeof context === 'object' ? context : {}),
      from: prev,
      to: normalized,
      via,
    };

    syncNavStateActiveScreen(normalized, prev);

    if (sameScreen) {
      logInfo?.(`[state] setActiveScreen: ${prev} (unchanged)${debugFormatContext(info)}`);
      return normalized;
    }
    activeScreen = normalized;
    global.activeScreen = normalized;
    if (normalized !== 'settings' && normalized !== 'unknown') {
      lastNonSettingsScreen = normalized;
    }
    logInfo?.(`[state] setActiveScreen: ${prev} -> ${normalized}${debugFormatContext(info)}`);
    if (NAV_SCREEN_LOG_TARGETS.has(normalized)) {
      logNavigation(normalized, info);
    }
    setTitleAccountAnchorVisible(normalized === 'title');
    return normalized;
  }

  function getActiveScreen() {
    return activeScreen;
  }

  function getLastNonSettingsScreen() {
    return lastNonSettingsScreen;
  }

  function isFormFieldElement(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') return true;
    if (el.isContentEditable) return true;
    const role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null;
    return role === 'textbox' || role === 'combobox' || role === 'searchbox';
  }

  function getFocusedElementForShortcuts(evt) {
    if (evt && evt.target && evt.target !== global && evt.target !== global.document) {
      return evt.target;
    }
    if (typeof global.document !== 'undefined') {
      return global.document.activeElement;
    }
    return null;
  }

  function shouldBlockGameplayShortcuts(evt) {
    const focusEl = getFocusedElementForShortcuts(evt);
    const blockedByFocus = isFormFieldElement(focusEl);
    const blockedByScreen = activeScreen === 'account';
    if (blockedByFocus || blockedByScreen) {
      logInfo?.(
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

  global.normalizeScreenName = normalizeScreenName;
  global.logNavigation = logNavigation;
  global.logPlayClickIgnored = logPlayClickIgnored;
  global.logLogoutClickIgnored = logLogoutClickIgnored;
  global.setActiveScreen = setActiveScreen;
  global.registerNavStateAccessors = registerNavStateAccessors;
  global.isFormFieldElement = isFormFieldElement;
  global.getFocusedElementForShortcuts = getFocusedElementForShortcuts;
  global.shouldBlockGameplayShortcuts = shouldBlockGameplayShortcuts;

  SD_UI_PANELS.normalizeScreenName = normalizeScreenName;
  SD_UI_PANELS.logNavigation = logNavigation;
  SD_UI_PANELS.logPlayClickIgnored = logPlayClickIgnored;
  SD_UI_PANELS.logLogoutClickIgnored = logLogoutClickIgnored;
  SD_UI_PANELS.setActiveScreen = setActiveScreen;
  SD_UI_PANELS.registerNavStateAccessors = registerNavStateAccessors;
  SD_UI_PANELS.getActiveScreen = getActiveScreen;
  SD_UI_PANELS.getLastNonSettingsScreen = getLastNonSettingsScreen;
  SD_UI_PANELS.isFormFieldElement = isFormFieldElement;
  SD_UI_PANELS.getFocusedElementForShortcuts = getFocusedElementForShortcuts;
  SD_UI_PANELS.shouldBlockGameplayShortcuts = shouldBlockGameplayShortcuts;

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

    logInfo?.("[settings] listener initialized");
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
    logInfo?.(`[overlay] open settings (from ${fromView})${formatContext({ raw: fromViewRaw, screen: activeScreen })}`);
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
      logInfo?.(`[overlay] close settings (to ${nextScreen})${formatContext({ raw: fromViewRaw })}`);
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
              <div class="leaderboard-status-row">
                <div id="leaderboardStatus" class="leaderboard-status">Chargement du classement…</div>
                <button id="leaderboardRetry" type="button" class="btn btn-secondary" style="display:none;">Réessayer</button>
              </div>
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
    const retryEl = overlay.querySelector('#leaderboardRetry');
    const emptyEl = overlay.querySelector('#leaderboardEmpty');
    const stickyWrapper = overlay.querySelector('#leaderboardStickyWrapper');
    const stickyEntry = overlay.querySelector('#leaderboardStickyEntry');
    const scrollContainer = overlay.querySelector('.legend-leaderboard-scroll');

    const scoreService = getScoreServiceFn();
    const teardownFns = [];
    let referralCountsByPlayer = new Map();

    const registerTeardown = (fn) => {
      if (typeof fn === 'function') {
        teardownFns.push(fn);
      }
    };

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
        if (stickyWrapper) {
          stickyWrapper.style.display = 'none';
          stickyWrapper.classList.remove('floating');
        }
        if (playerRowEl) {
          playerRowEl.classList.remove('is-player-row-active', 'is-player-row-hidden');
        }
        if (scrollContainer) {
          scrollContainer.classList.remove('has-sticky-overlay');
        }
        return;
      }

      const shouldFloat = !isPlayerRowVisible();
      if (stickyWrapper) {
        stickyWrapper.style.display = shouldFloat ? '' : 'none';
        stickyWrapper.classList.toggle('floating', shouldFloat);
      }

      if (scrollContainer) {
        scrollContainer.classList.toggle('has-sticky-overlay', shouldFloat);
      }

      if (playerRowEl) {
        playerRowEl.classList.toggle('is-player-row-active', !shouldFloat);
        playerRowEl.classList.toggle('is-player-row-hidden', shouldFloat);
      }
    };

    const getPendingCount = () => {
      if (scoreService?.getPendingLegendScoreCount) {
        return scoreService.getPendingLegendScoreCount();
      }
      return 0;
    };

    const isOffline = () => {
      try {
        return global.navigator?.onLine === false;
      } catch (_) {
        return false;
      }
    };

    const updateStatus = (message, { variant = 'info', showRetry = false } = {}) => {
      if (statusEl) {
        statusEl.textContent = message || '';
        statusEl.dataset.variant = variant;
      }
      if (retryEl) {
        retryEl.style.display = showRetry ? '' : 'none';
        retryEl.disabled = !showRetry;
      }
    };

    const renderSkeletonRows = (count = 5) => {
      if (!listEl || !emptyEl) return;
      listEl.innerHTML = '';
      emptyEl.style.display = 'none';
      for (let i = 0; i < count; i += 1) {
        const li = global.document?.createElement('li');
        if (!li) continue;
        li.className = 'leaderboard-row leaderboard-skeleton';
        li.innerHTML = `
          <span class="skeleton-block skeleton-rank"></span>
          <span class="skeleton-block skeleton-name"></span>
          <span class="skeleton-block skeleton-score"></span>`;
        listEl.appendChild(li);
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
      if (!stickyWrapper || !stickyEntry) {
        return;
      }
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

    const renderUnavailable = (message, variant = 'error') => {
      if (listEl) listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'none';
      stickyData = null;
      syncStickyFloatingState();
      updateStatus(message || 'Leaderboard indisponible', { variant, showRetry: true });
    };

    const renderOffline = () => {
      const pendingCount = getPendingCount();
      const pendingLabel = pendingCount > 0
        ? ` • ${pendingCount} score(s) en attente de synchronisation`
        : '';
      renderUnavailable(`Hors ligne${pendingLabel}`, 'offline');
    };

    const handleScrollChange = () => {
      syncStickyFloatingState();
    };

    if (scrollContainer) {
      addEventFn(scrollContainer, 'scroll', handleScrollChange, { passive: true });
      addEventFn(scrollContainer, 'touchmove', handleScrollChange, { passive: true });
      registerTeardown(() => removeEventFn(scrollContainer, 'scroll', handleScrollChange, { passive: true }));
      registerTeardown(() => removeEventFn(scrollContainer, 'touchmove', handleScrollChange, { passive: true }));
    }
    addEventFn(global.window || global, 'resize', handleScrollChange, { passive: true });
    registerTeardown(() => removeEventFn(global.window || global, 'resize', handleScrollChange, { passive: true }));

    teardownStickyListeners = () => {
      teardownFns.forEach((fn) => {
        try {
          fn();
        } catch (_) {
          // ignore teardown errors
        }
      });
      teardownFns.length = 0;
    };

    const loadLeaderboard = async (context = {}) => {
      const reason = typeof context.reason === 'string' ? context.reason : 'open';
      if (!scoreService || typeof scoreService.fetchLegendTop !== 'function') {
        renderUnavailable('Leaderboard indisponible pour le moment.');
        return;
      }

      if (scoreService?.flushPendingLegendScores) {
        await scoreService.flushPendingLegendScores({ reason: `leaderboard-${reason}` });
      }

      if (isOffline()) {
        renderOffline();
        return;
      }

      renderSkeletonRows(5);
      updateStatus('Chargement du classement…', { variant: 'loading', showRetry: false });

      try {
        const topResult = await scoreService.fetchLegendTop(20);
        const entries = Array.isArray(topResult?.entries) ? topResult.entries : [];
        const errorReason = topResult?.error?.reason || topResult?.error || null;

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
            logDebug?.('[leaderboard] referral counts unavailable', referralResult.error);
          }
          if (Array.isArray(referralResult?.rows)) {
            referralCountsByPlayer = buildReferralCountMap(referralResult.rows);
          }
        }

        renderTop(entries);
        const hasError = Boolean(errorReason);
        if (hasError && entries.length === 0) {
          if (isOffline() || errorReason === 'TRANSIENT') {
            renderOffline();
          } else {
            renderUnavailable('Leaderboard indisponible pour le moment.');
          }
          renderSticky(sticky);
          return;
        }
        updateStatus(
          hasError ? 'Leaderboard indisponible pour le moment.' : '',
          { variant: hasError ? 'error' : 'success', showRetry: hasError }
        );
        renderSticky(sticky);
      } catch (error) {
        logDebug?.('[leaderboard] rendering failed', error);
        renderUnavailable('Impossible de charger le leaderboard.');
      }
    };

    const onlineHandler = () => loadLeaderboard({ reason: 'online' });
    addEventFn(global.window || global, 'online', onlineHandler, { passive: true });
    registerTeardown(() => removeEventFn(global.window || global, 'online', onlineHandler, { passive: true }));

    if (retryEl) {
      addEventFn(retryEl, inputApi.tap, (evt) => {
        if (evt?.preventDefault) evt.preventDefault();
        if (evt?.stopPropagation) evt.stopPropagation();
        loadLeaderboard({ reason: 'retry' });
      }, { passive: false });
    }

    loadLeaderboard({ reason: 'open' });
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
