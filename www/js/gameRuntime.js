(function initializeGameRuntime(global){
  if (!global) return;

  const createRuntime = (host = {}) => {
    let rafId = null;
    let lastTime = null;
    let running = false;
    let paused = false;
    let lastTickLogTime = 0;

    const logState = (label) => {
      try {
        console.debug(`[runtime] ${label} ${JSON.stringify({ running, paused, rafId })}`);
      } catch (_) {}
    };

    const logTick = () => {
      const nowTs = performance?.now ? performance.now() : Date.now();
      if (nowTs - lastTickLogTime < 1000) return;
      lastTickLogTime = nowTs;
      try {
        console.debug(`[runtime] tick ${JSON.stringify({ running, paused })}`);
      } catch (_) {}
    };

    const getState = (...args) => (typeof host?.getState === 'function' ? host.getState(...args) : undefined);
    const isPlaying = () => {
      const state = getState();
      return !state || state.state === 'playing';
    };

    const startLoop = () => {
      if (!isPlaying()) {
        window.__saltDroppeeLoopStarted = false;
        running = false;
        paused = true;
        if (rafId !== null) {
          rafId = null;
        }
        logState('pause');
        return;
      }

      window.__saltDroppeeLoopStarted = true;
      paused = false;
      running = true;

      const now = performance.now();
      const dt = Math.min(0.033, (now - lastTime) / 1000);
      lastTime = now;

      if (typeof host?.tick === 'function') {
        host.tick(dt);
      }

      logTick();

      if (typeof host?.draw === 'function') {
        host.draw();
      }

      if (!isPlaying()) {
        window.__saltDroppeeLoopStarted = false;
        running = false;
        paused = true;
        rafId = null;
        logState('pause');
        return;
      }

      if (typeof requestAnimationFrame === 'function') {
        rafId = requestAnimationFrame(() => {
          window.__saltDroppeeLoopStarted = false;
          startLoop();
        });
      } else {
        rafId = null;
        window.__saltDroppeeLoopStarted = false;
      }
    };

    const runtime = {
      host,
      start: (options = {}) => {
        if (rafId !== null) return;
        lastTime = Number.isFinite(options?.lastTime) ? options.lastTime : performance.now();
        paused = false;
        logState('resume');
        startLoop();
      },
      stop: (...args) => {
        if (rafId !== null && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(rafId);
        }
        rafId = null;
        running = false;
        paused = true;
        logState('pause');
        window.__saltDroppeeLoopStarted = false;
        return host?.stop?.(...args);
      },
      tick: (...args) => host?.tick?.(...args),
      draw: (...args) => host?.draw?.(...args),
      getState,
    };

    return runtime;
  };

  global.SD_GAME_RUNTIME = global.SD_GAME_RUNTIME || {};
  if (typeof global.SD_GAME_RUNTIME.createRuntime !== 'function') {
    global.SD_GAME_RUNTIME.createRuntime = createRuntime;
  }
})(typeof window !== 'undefined' ? window : null);
