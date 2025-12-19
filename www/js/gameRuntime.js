(function initializeGameRuntime(global){
  if (!global) return;

  const createRuntime = (host = {}) => {
    let rafId = null;
    let running = false;
    let lastTime = null;

    const getNow = () => {
      if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
      }
      return Date.now();
    };

    const scheduleNextFrame = () => {
      if (typeof requestAnimationFrame === 'function') {
        rafId = requestAnimationFrame(stepFrame);
      }
    };

    const stepFrame = () => {
      if (!running) return;

      const state = typeof runtime.getState === 'function' ? runtime.getState() : null;
      if (state?.state && state.state !== 'playing') {
        runtime.stop();
        return;
      }

      const now = getNow();
      const previous = typeof lastTime === 'number' ? lastTime : now;
      const dt = Math.min(0.033, (now - previous) / 1000);
      lastTime = now;

      if (runtime.host) {
        runtime.host.lastTime = lastTime;
      }

      runtime.tick(dt);
      runtime.draw();

      const nextState = typeof runtime.getState === 'function' ? runtime.getState() : null;
      if (nextState?.state && nextState.state !== 'playing') {
        runtime.stop();
        return;
      }

      scheduleNextFrame();
    };

    const runtime = {
      host,
      start: () => {
        if (running) return;
        running = true;
        lastTime = typeof host?.lastTime === 'number' ? host.lastTime : getNow();
        scheduleNextFrame();
      },
      stop: () => {
        running = false;
        if (typeof cancelAnimationFrame === 'function' && typeof rafId === 'number') {
          cancelAnimationFrame(rafId);
        }
        rafId = null;
      },
      tick: (...args) => host?.tick?.(...args),
      draw: (...args) => host?.draw?.(...args),
      getState: (...args) => (typeof host?.getState === 'function' ? host.getState(...args) : undefined),
    };

    return runtime;
  };

  global.SD_GAME_RUNTIME = global.SD_GAME_RUNTIME || {};
  if (typeof global.SD_GAME_RUNTIME.createRuntime !== 'function') {
    global.SD_GAME_RUNTIME.createRuntime = createRuntime;
  }
})(typeof window !== 'undefined' ? window : null);
