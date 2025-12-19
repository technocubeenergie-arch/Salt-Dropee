(function initializeGameRuntime(global){
  if (!global) return;

  const createRuntime = (host = {}) => {
    let rafId = null;
    let lastTime = null;

    const getState = (...args) => (typeof host?.getState === 'function' ? host.getState(...args) : undefined);
    const isPlaying = () => {
      const state = getState();
      return !state || state.state === 'playing';
    };

    const startLoop = () => {
      if (!isPlaying()) {
        window.__saltDroppeeLoopStarted = false;
        return;
      }

      window.__saltDroppeeLoopStarted = true;

      const now = performance.now();
      const dt = Math.min(0.033, (now - lastTime) / 1000);
      lastTime = now;

      if (typeof host?.tick === 'function') {
        host.tick(dt);
      }

      if (typeof host?.draw === 'function') {
        host.draw();
      }

      if (!isPlaying()) {
        window.__saltDroppeeLoopStarted = false;
        rafId = null;
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
        startLoop();
      },
      stop: (...args) => {
        if (rafId !== null && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(rafId);
        }
        rafId = null;
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
