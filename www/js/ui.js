(function initUiModule(global) {
  const SD_UI = global.SD_UI || {};

  let CONFIG = global.SD_CONFIG || {};
  let UTIL = global.SD_UTILS || {};
  let NAV = global.SD_NAV || {};
  let AUDIO = global.SD_AUDIO || {};
  let PROGRESS = global.SD_PROGRESS || {};
  let RENDER = global.SD_RENDER || {};
  let LEVELS = global.SD_LEVELS || {};
  let UI_CORE = global.SD_UI_CORE || {};
  let UI_OVERLAYS = global.SD_UI_OVERLAYS || {};
  let UI_PANELS = global.SD_UI_PANELS || {};
  let UI_ACCOUNT = global.SD_UI_ACCOUNT || {};
  let INPUT = global.SD_INPUT || {};

  let overlay = null;

  function init(options = {}) {
    CONFIG = options.CONFIG || CONFIG;
    UTIL = options.UTILS || UTIL;
    NAV = options.NAV || NAV;
    AUDIO = options.AUDIO || AUDIO;
    PROGRESS = options.PROGRESS || PROGRESS;
    RENDER = options.RENDER || RENDER;
    LEVELS = options.LEVELS || LEVELS;
    UI_CORE = options.UI_CORE || UI_CORE;
    UI_OVERLAYS = options.UI_OVERLAYS || UI_OVERLAYS;
    UI_PANELS = options.UI_PANELS || UI_PANELS;
    UI_ACCOUNT = options.UI_ACCOUNT || UI_ACCOUNT;
    INPUT = options.INPUT || INPUT;

    overlay = options.overlay
      || (options.overlayId && global.document ? global.document.getElementById(options.overlayId) : null)
      || (global.document ? global.document.getElementById('overlay') : null);

    return { overlay };
  }

  function getOverlay() {
    return overlay;
  }

  function gotoScreen(target, meta = {}) {
    if (typeof NAV?.goto === 'function') return NAV.goto(target, meta);
    if (typeof UI_PANELS?.setActiveScreen === 'function') return UI_PANELS.setActiveScreen(target, meta);
    return target;
  }

  function getActiveScreen() {
    if (typeof UI_PANELS?.getActiveScreen === 'function') return UI_PANELS.getActiveScreen();
    return typeof global.activeScreen === 'string' ? global.activeScreen : 'unknown';
  }

  function showOverlay(target) {
    if (typeof RENDER?.showExclusiveOverlay === 'function') {
      return RENDER.showExclusiveOverlay(target);
    }
    return null;
  }

  function hideOverlayElement(target) {
    if (typeof RENDER?.hideOverlay === 'function') {
      return RENDER.hideOverlay(target);
    }
    return null;
  }

  function enterTitleScreen() {
    gotoScreen('title', { via: 'enterTitleScreen' });
    PROGRESS?.setProgressApplicationEnabled?.(false);
    if (typeof global.document !== 'undefined' && global.document.body) {
      global.document.body.classList.add('is-title');
    }
    if (overlay) {
      overlay.classList.remove('overlay-rules');
      overlay.classList.add('overlay-title');
    }

    const runtimeInstance = (typeof global.Game !== 'undefined' && global.Game.instance)
      ? global.Game.instance
      : null;
    if (runtimeInstance && runtimeInstance.state !== 'title') {
      console.info(
        `[nav] syncing runtime state to title${UTIL?.debugFormatContext?.({
          previous: runtimeInstance.state,
        }) ?? ''}`
      );
      runtimeInstance.state = 'title';
    }

    AUDIO?.playMenuMusic?.();

    PROGRESS?.applyPendingProgressIfPossible?.();
  }

  function leaveTitleScreen({ stopMusic = true } = {}) {
    gotoScreen('running', { via: 'leaveTitleScreen' });
    if (typeof global.document !== 'undefined' && global.document.body) {
      global.document.body.classList.remove('is-title');
    }
    if (overlay) {
      overlay.classList.remove('overlay-title');
    }
    UI_CORE?.setTitleAccountAnchorVisible?.(false);
    if (stopMusic) {
      AUDIO?.stopMenuMusic?.();
    }
  }

  function clearOverlay({ removeTitleState = false } = {}) {
    if (!overlay) return;
    overlay.innerHTML = '';
    hideOverlayElement(overlay);
    if (removeTitleState) {
      if (typeof global.document !== 'undefined' && global.document.body) {
        global.document.body.classList.remove('is-title');
      }
      overlay.classList.remove('overlay-title');
    }
  }

  function renderTitle({ game, ctx }) {
    gotoScreen('title', { via: 'renderTitle' });
    if (game) {
      game.settingsReturnView = "title";
    }
    const bgState = typeof RENDER?.getBackgroundState === 'function'
      ? RENDER.getBackgroundState()
      : { currentBackgroundSrc: '', hasBackgroundImage: false };
    if (bgState.currentBackgroundSrc === CONFIG?.MENU_BACKGROUND_SRC) {
      RENDER?.setBackgroundImageSrc?.(CONFIG?.MENU_BACKGROUND_SRC);
    } else if (bgState.hasBackgroundImage) {
      RENDER?.fadeOutBgThen?.(CONFIG?.MENU_BACKGROUND_SRC);
    } else {
      RENDER?.setBackgroundImageSrc?.(CONFIG?.MENU_BACKGROUND_SRC);
    }
    UI_CORE?.setTitleAccountAnchorVisible?.(true);
    enterTitleScreen();
    if (overlay) {
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
      showOverlay(overlay);
    }
    UI_ACCOUNT?.bindTitleAccountButton?.({
      onOpenAccount: () => game?.renderAccountPanel?.({ keepMode: true }),
      playSound: global.playSound,
    });
    if (UI_PANELS?.bindTitlePanelButtons) {
      UI_PANELS.bindTitlePanelButtons({
        INPUT,
        addEvent: INPUT?.addEvent || global.addEvent,
        playSound: global.playSound,
        onShowRules: () => game?.renderRules?.("title"),
        onShowLeaderboard: () => game?.renderLeaderboard?.(),
      });
    }
    const settingsBtn = overlay?.querySelector('[data-action="open-settings"]');
    if (settingsBtn && typeof INPUT?.addEvent === 'function' && INPUT?.tap) {
      INPUT.addEvent(settingsBtn, INPUT.tap, (evt) => {
        evt?.preventDefault?.();
        evt?.stopPropagation?.();
        global.playSound?.("click");
        global.openSettings?.();
      }, { passive: false });
    }
    const playBtn = global.document?.getElementById('btnPlay');
    if (playBtn && typeof INPUT?.addEvent === 'function' && INPUT?.tap) {
      INPUT.addEvent(playBtn, INPUT.tap, async (e) => {
        e.preventDefault(); e.stopPropagation();
        global.playSound?.("click");
        const authSnapshot = UI_ACCOUNT?.getAuthStateSnapshot?.();
        console.info(`[progress] play clicked${UTIL?.debugFormatContext?.({ screen: getActiveScreen(), auth: authSnapshot?.user ? 'authenticated' : 'guest' })}`);
        await new Promise(r=>global.requestAnimationFrame(r));
        try{ const prev=ctx?.imageSmoothingEnabled; if (ctx){ ctx.imageSmoothingEnabled=false; const warmupWallet = typeof LEVELS?.getWalletImage === 'function' ? LEVELS.getWalletImage() : null; const imgs=[warmupWallet, global.GoldImg, global.SilverImg, global.BronzeImg, global.DiamondImg, global.BombImg, global.Hand?.open, global.Hand?.pinch]; for (const im of imgs){ if (im && im.naturalWidth && typeof ctx.drawImage === 'function') ctx.drawImage(im,0,0,1,1); } ctx.save?.(); ctx.shadowColor='rgba(0,0,0,0.15)'; ctx.shadowBlur=4; ctx.shadowOffsetY=1; ctx.fillStyle='#fff'; ctx.beginPath?.(); ctx.arc?.(4,4,2,0,Math.PI*2); ctx.fill?.(); ctx.restore?.(); ctx.imageSmoothingEnabled=prev; ctx.clearRect?.(0,0,8,8); }
        }catch(_){ }
        game?.uiStartFromTitle?.();
      }, { passive:false });
    }
  }

  async function renderAccountPanel({ game, options = {} } = {}) {
    if (typeof UI_ACCOUNT?.renderAccountPanel !== 'function') return;
    await UI_ACCOUNT.renderAccountPanel({
      ...options,
      overlay,
      addEvent: INPUT?.addEvent || global.addEvent,
      INPUT,
      playSound: global.playSound,
      showExclusiveOverlay: showOverlay,
      setActiveScreen: gotoScreen,
      LOGOUT_WATCHDOG_TIMEOUT_MS: CONFIG?.LOGOUT_WATCHDOG_TIMEOUT_MS,
      activeScreen: getActiveScreen(),
      accountMode: game?.accountMode,
      setAccountMode: (mode) => {
        if (!game) return;
        game.accountMode = mode === 'signup' ? 'signup' : 'signin';
      },
      accountFlashMessage: game?.accountFlashMessage,
      setAccountFlashMessage: (value) => {
        if (!game) return;
        game.accountFlashMessage = value;
      },
      clearAccountFlashMessage: () => {
        if (!game) return;
        game.accountFlashMessage = null;
      },
      onReturnToTitle: () => game?.renderTitle?.(),
      onRerender: (args = {}) => game?.renderAccountPanel?.({ ...args, keepMode: true }),
      logLogoutClickIgnored: UI_PANELS?.logLogoutClickIgnored,
    });
  }

  function renderSettings({ game } = {}) {
    if (typeof UI_PANELS?.renderSettingsPanel !== 'function') return;
    UI_PANELS.renderSettingsPanel({
      overlay,
      settings: game?.settings,
      settingsReturnView: game?.settingsReturnView,
      state: game?.state,
      activeScreen: getActiveScreen(),
      lastNonSettingsScreen: UI_PANELS?.getLastNonSettingsScreen?.(),
      showExclusiveOverlay: showOverlay,
      hideOverlay: hideOverlayElement,
      hideLegendResultScreen: UI_OVERLAYS?.hideLegendResultScreen,
      hideInterLevelScreen: UI_OVERLAYS?.hideInterLevelScreen,
      showInterLevelScreen: UI_OVERLAYS?.showInterLevelScreen,
      getLastInterLevelResult: UI_OVERLAYS?.getLastInterLevelResult,
      playSound: global.playSound,
      saveSettings: global.saveSettings,
      setSoundEnabled: global.setSoundEnabled,
      setActiveControlMode: global.setActiveControlMode,
      addEvent: INPUT?.addEvent || global.addEvent,
      INPUT,
      normalizeScreenName: UI_PANELS?.normalizeScreenName,
      setActiveScreen: gotoScreen,
      debugFormatContext: UTIL?.debugFormatContext,
      onSettingsReturnViewChange: (value) => { if (game) game.settingsReturnView = value; },
      onRenderPause: () => game?.renderPause?.(),
      onRenderGameOver: () => game?.renderGameOver?.(),
      onRenderTitle: () => game?.renderTitle?.(),
    });
  }

  function renderLeaderboard({ game } = {}) {
    if (typeof UI_PANELS?.renderLeaderboardPanel !== 'function') return;
    UI_PANELS.renderLeaderboardPanel({
      overlay,
      activeScreen: getActiveScreen(),
      setActiveScreen: gotoScreen,
      setTitleAccountAnchorVisible: UI_CORE?.setTitleAccountAnchorVisible,
      showExclusiveOverlay: showOverlay,
      addEvent: INPUT?.addEvent || global.addEvent,
      removeEvent: INPUT?.removeEvent || global.removeEvent,
      INPUT,
      playSound: global.playSound,
      normalizeScreenName: UI_PANELS?.normalizeScreenName,
      formatScore: UTIL?.formatScore,
      getScoreService: global.getScoreService,
      getLastInterLevelResult: UI_OVERLAYS?.getLastInterLevelResult,
      showInterLevelScreen: UI_OVERLAYS?.showInterLevelScreen,
      hideOverlay: hideOverlayElement,
      onRenderTitle: () => game?.renderTitle?.(),
      onRenderPause: () => game?.renderPause?.(),
      onRenderGameOver: () => game?.renderGameOver?.(),
      onSetReturnView: (value) => { if (game) game.leaderboardReturnView = value; },
    });
  }

  function renderPause({ game } = {}) {
    if (typeof UI_OVERLAYS?.renderPauseOverlay !== 'function') return;
    UI_OVERLAYS.renderPauseOverlay({
      overlay,
      onResume: () => {
        gotoScreen('running', { via: 'pause-resume' });
        if (!game) return;
        game.state='playing';
        game.lastTime=global.performance?.now();
        game.loop?.();
      },
      onQuit: () => {
        game?.reset?.();
      },
      onShowRules: () => {
        game?.renderRules?.("pause");
      },
      setReturnView: () => {
        if (game) game.settingsReturnView = "pause";
      },
    });
  }

  function renderRules({ game, returnView }) {
    if (typeof UI_PANELS?.renderRulesPanel !== 'function') return;
    UI_PANELS.renderRulesPanel({
      overlay,
      rulesReturnView: returnView || game?.state || "title",
      setTitleAccountAnchorVisible: UI_CORE?.setTitleAccountAnchorVisible,
      showExclusiveOverlay: showOverlay,
      hideOverlay: hideOverlayElement,
      addEvent: INPUT?.addEvent || global.addEvent,
      removeEvent: INPUT?.removeEvent || global.removeEvent,
      INPUT,
      playSound: global.playSound,
      onSetRulesReturnView: (value) => { if (game) game.rulesReturnView = value; },
      onReturnToPause: () => game?.renderPause?.(),
      onReturnToTitle: () => game?.renderTitle?.(),
    });
  }

  function renderGameOver({ game } = {}) {
    const LS = CONFIG?.LS || {};
    const best=parseInt(global.localStorage?.getItem?.(LS.bestScore)||'0',10);
    if (game) {
      game.settingsReturnView = "over";
    }
    gotoScreen('gameover', { via: 'renderGameOver' });
    if (overlay) {
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
            <li><span>Score</span><strong>${game?.score ?? 0}</strong></li>
            <li><span>Record local</span><strong>${best}</strong></li>
            <li><span>Combo max</span><strong>${game?.maxCombo ?? 0}</strong></li>
            <li><span>Niveau atteint</span><strong>N${game?.levelReached ?? 1}</strong></li>
          </ul>
        </section>
      </div>

      <div class="panel-footer">
        <div class="btnrow panel-actions">
          <button id="again">Rejouer</button>
          <button id="menu">Menu</button>
          ${global.TG? '<button id="share">Partager</button>': ''}
        </div>
      </div>
    </div>`;
      showOverlay(overlay);
      const addEvt = INPUT?.addEvent || global.addEvent;
      if (typeof addEvt === 'function' && INPUT?.tap) {
        const again = global.document?.getElementById('again');
        if (again) {
          addEvt(again, INPUT.tap, async ()=>{ global.playSound?.("click"); overlay.innerHTML=''; hideOverlayElement(overlay); game?.reset?.({showTitle:false}); await new Promise(r=>global.requestAnimationFrame(r)); game?.start?.(); }, { passive:false });
        }
        const menu = global.document?.getElementById('menu');
        if (menu) {
          addEvt(menu, INPUT.tap, ()=>{ global.playSound?.("click"); overlay.innerHTML=''; hideOverlayElement(overlay); game?.reset?.({showTitle:true}); });
        }
        const sh = global.document?.getElementById('share');
        if (global.TG && sh) {
          addEvt(sh, INPUT.tap, ()=>{ global.playSound?.("click"); try{ global.TG.sendData(JSON.stringify({ score:game?.score, duration:CONFIG?.runSeconds, version:CONFIG?.VERSION })); }catch(e){} });
        }
      }
    }
  }

  SD_UI.init = init;
  SD_UI.getOverlay = getOverlay;
  SD_UI.enterTitleScreen = enterTitleScreen;
  SD_UI.leaveTitleScreen = leaveTitleScreen;
  SD_UI.clearOverlay = clearOverlay;
  SD_UI.renderTitle = renderTitle;
  SD_UI.renderAccountPanel = renderAccountPanel;
  SD_UI.renderSettings = renderSettings;
  SD_UI.renderLeaderboard = renderLeaderboard;
  SD_UI.renderPause = renderPause;
  SD_UI.renderRules = renderRules;
  SD_UI.renderGameOver = renderGameOver;

  global.SD_UI = SD_UI;
})(typeof window !== 'undefined' ? window : globalThis);
