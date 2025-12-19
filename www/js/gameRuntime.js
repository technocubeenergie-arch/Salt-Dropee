(function initializeGameRuntime(global){
  if (!global) return;

  const createRuntime = (host = {}) => {
    const runtime = {
      host,
      start: (...args) => host?.start?.(...args),
      stop: (...args) => host?.stop?.(...args),
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
