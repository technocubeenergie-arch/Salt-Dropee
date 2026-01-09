(function bootstrap(){
  async function startGame(){
    if (window.__saltDroppeeStarted) return;

    const setupFn = window.setupCanvasContext
      || window.SD_CANVAS?.setupCanvasContext
      || window.SD_CANVAS?.setupCanvas
      || window.SD_CANVAS?.initCanvasContext
      || window.initCanvasContext;
    if (typeof setupFn !== 'function') {
      console.error('[boot] setupCanvasContext is not available');
      return;
    }

    const canvasRefs = setupFn();
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

    const session = window.SD_GAME_SESSION?.createGameSession
      ? window.SD_GAME_SESSION.createGameSession({
          Game,
          getGameState: () => gameState,
        })
      : null;

    game = session?.game || null;
    if (game && game.wallet) window.targetX = game.wallet.x + game.wallet.w / 2;

    const runtimeHost = {
      start: (...args) => (typeof game?.start === 'function' ? game.start(...args) : undefined),
      stop: (...args) => (typeof game?.renderPause === 'function' ? game.renderPause(...args) : undefined),
      tick: session?.tick || ((...args) => (typeof game?.step === 'function' ? game.step(...args) : undefined)),
      draw: session?.draw || ((...args) => (typeof game?.render === 'function' ? game.render(...args) : undefined)),
      getState: session?.getState || (() => ({
        state: game?.state,
        gameState,
      })),
    };

    runtime = window.SD_GAME_RUNTIME?.createRuntime
      ? window.SD_GAME_RUNTIME.createRuntime(runtimeHost)
      : null;

    if (window.SD_PROGRESS) {
      window.SD_PROGRESS.runtime = runtime;
      if (typeof window.SD_PROGRESS.getRuntime !== "function") {
        window.SD_PROGRESS.getRuntime = () => runtime;
      }
    }

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

    addEvent(document, 'visibilitychange', ()=>{ if (document.hidden && game.state==='playing'){ const now = performance.now(); if (game.ignoreVisibilityUntil && now < game.ignoreVisibilityUntil) return; resetPointerDragState({ releaseCapture: true }); window.SD_AUDIO?.pauseAllAudio?.({ reason: 'visibility' }); game.state='paused'; game.renderPause(); } });

    addEvent(canvas, INPUT.tap, (e)=>{ if (game.state!=='playing') return; const now=performance.now(); if (game.ignoreClicksUntil && now < game.ignoreClicksUntil) return; const pt=getCanvasPointSafe(e); if (pt.y<40 && pt.x>BASE_W-80){ playSound("click"); window.SD_AUDIO?.pauseAllAudio?.({ reason: 'ui-pause' }); game.state='paused'; game.renderPause(); } });

    game.render();
  }

  function boot(){
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
  }

  window.startGame = startGame;
  window.SD_BOOTSTRAP = Object.assign(window.SD_BOOTSTRAP || {}, {
    startGame,
    boot,
  });
})();
