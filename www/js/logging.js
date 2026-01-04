// ================================
// Salt Droppee — logging utilitaire
// Activer les logs verbeux en ajoutant ?debug=1 à l'URL (ou en définissant SD_CONFIG.DEBUG_LOGS).
// ================================

(function initSaltDroppeeLogging(global) {
  if (!global) return;

  const consoleRef = global.console || {};

  function parseDebugFlagFromQuery(search) {
    if (!search || typeof search !== 'string') return null;
    try {
      const params = new URLSearchParams(search);
      if (!params.has('debug')) return null;
      const raw = params.get('debug');
      if (raw === null || raw === '') return true;
      const normalized = String(raw).toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
      return true;
    } catch (_) {
      return null;
    }
  }

  function getInitialDebugEnabled() {
    const configDebug = !!(global.SD_CONFIG && global.SD_CONFIG.DEBUG_LOGS);
    const search = (() => {
      try {
        return global.location && typeof global.location.search === 'string'
          ? global.location.search
          : '';
      } catch (_) {
        return '';
      }
    })();
    const queryValue = parseDebugFlagFromQuery(search);
    if (queryValue === null) {
      return configDebug;
    }
    return queryValue;
  }

  let debugEnabled = getInitialDebugEnabled();

  const isDebugEnabled = () => debugEnabled;
  const setDebugEnabled = (enabled) => {
    debugEnabled = !!enabled;
    global.SD_DEBUG = debugEnabled;
  };

  const shouldLog = (level) =>
    debugEnabled || level === 'warn' || level === 'error';

  const logWithLevel = (level, namespace, args) => {
    if (!shouldLog(level)) return;
    const fn =
      typeof consoleRef[level] === 'function'
        ? consoleRef[level]
        : consoleRef.log;
    if (!fn) return;
    const prefix = namespace ? `[${namespace}]` : '[log]';
    try {
      fn.call(consoleRef, prefix, ...args);
    } catch (_) {
      try {
        fn(prefix, ...args);
      } catch (_) {
        // ignore logging failures
      }
    }
  };

  const createLogger = (namespace) => ({
    debug: (...args) => logWithLevel('debug', namespace, args),
    info: (...args) => logWithLevel('info', namespace, args),
    log: (...args) => logWithLevel('log', namespace, args),
    warn: (...args) => logWithLevel('warn', namespace, args),
    error: (...args) => logWithLevel('error', namespace, args),
  });

  const exported = {
    isDebugEnabled,
    setDebugEnabled,
    createLogger,
    logDebug: (...args) => logWithLevel('debug', null, args),
    logInfo: (...args) => logWithLevel('info', null, args),
    logWarn: (...args) => logWithLevel('warn', null, args),
    logError: (...args) => logWithLevel('error', null, args),
  };

  global.SD_LOG = Object.assign(global.SD_LOG || {}, exported);
  global.SD_DEBUG = debugEnabled;
})(typeof window !== 'undefined' ? window : globalThis);
