// ================================
// Salt Droppee — utilitaires purs
// ================================

(function initSaltDroppeeUtils(){
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function hudFontSize(baseW) {
    const cfg = (window.SD_CONFIG && window.SD_CONFIG.HUD_CONFIG) || window.HUD_CONFIG || {};
    const vw = (baseW || 0) * (cfg.fontVwPct || 0);
    return clamp(Math.round(vw), cfg.fontMin || 0, cfg.fontMax || 0);
  }

  function abbr(n) {
    if (n >= 1e9) return (n/1e9).toFixed(1).replace(/\.0$/,'') + "B";
    if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'') + "M";
    if (n >= 1e5) return (n/1e3).toFixed(1).replace(/\.0$/,'') + "k";
    return n.toLocaleString();
  }

  function formatScore(value){
    const num = Math.round(Number.isFinite(value) ? value : Number(value) || 0);
    if (num === 0) return '0';
    if (num < 0) return '-' + abbr(Math.abs(num));
    return abbr(num);
  }

  const rand = (a,b)=> Math.random()*(b-a)+a;

  function choiceWeighted(entries){
    const total = entries.reduce((s,e)=>s+e.w,0);
    let r = Math.random()*total;
    for (const e of entries){
      if ((r-=e.w) <= 0) return e.k;
    }
    return entries[entries.length-1].k;
  }

  async function waitForPromiseWithTimeout(promise, options = {}) {
    if (!promise) {
      return { completed: true, timedOut: false };
    }

    const { timeoutMs = (window.PROGRESS_PROMISE_TIMEOUT_MS ?? (window.SD_CONFIG?.PROGRESS_PROMISE_TIMEOUT_MS) ?? 3500), label = 'async operation' } = options;
    const timeoutToken = Symbol('progress-timeout');
    let timeoutId = null;

    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve(timeoutToken), Math.max(0, timeoutMs));
    });

    const wrappedPromise = promise.then(
      (value) => ({ status: 'fulfilled', value }),
      (error) => ({ status: 'rejected', error })
    );

    try {
      const result = await Promise.race([wrappedPromise, timeoutPromise]);
      if (result === timeoutToken) {
        console.warn(`[progress] ${label} timed out after ${timeoutMs}ms`);
        return { completed: false, timedOut: true };
      }
      if (result.status === 'rejected') {
        console.warn(`[progress] ${label} failed`, result.error);
        return { completed: true, timedOut: false, error: result.error };
      }
      return { completed: true, timedOut: false, value: result.value };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  const exported = {
    clamp,
    hudFontSize,
    abbr,
    formatScore,
    rand,
    choiceWeighted,
    waitForPromiseWithTimeout,
  };

  window.SD_UTILS = exported;
  Object.assign(window, exported);
})();
