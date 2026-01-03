// ================================
// Salt Droppee — Progress (save/load/hydration)
// ================================

(function initProgressModule(global) {
  if (!global) return;

  const config = global.SD_CONFIG || {};
  const utils = global.SD_UTILS || {};
  const inputApi = global.SD_INPUT || {};

  const {
    LEVELS = [],
    PROGRESS_LOAD_TIMEOUT_MS = 3500,
    TITLE_START_PROGRESS_EAGER_WAIT_MS = 1200,
  } = config;

  const waitForPromiseWithTimeout = typeof utils.waitForPromiseWithTimeout === 'function'
    ? utils.waitForPromiseWithTimeout
    : async (promise) => {
        if (!promise) return { completed: true, timedOut: false };
        try {
          const value = await promise;
          return { completed: true, timedOut: false, value };
        } catch (error) {
          return { completed: true, timedOut: false, error };
        }
      };

  const debugFormatContext = typeof inputApi.debugFormatContext === 'function'
    ? inputApi.debugFormatContext
    : () => '';

  const progressRuntime = {
    phase: 'idle', // idle | loading | applying
    pending: null,
    inFlight: null,
    requestId: 0,
    lastAppliedPlayerId: null,
  };
  let isProgressApplicationEnabled = false;
  let hasAppliedProgressSnapshot = false;

  let host = {};

  const setHostContext = (nextHost = {}) => {
    host = { ...(host || {}), ...nextHost };
  };

  const getHostFn = (key) => {
    const fn = host?.[key];
    return typeof fn === 'function' ? fn : null;
  };

  const getGame = () => (typeof host?.getGame === 'function' ? host.getGame() : null);
  const getCurrentLevelIndex = () => {
    const getter = getHostFn('getCurrentLevelIndex');
    const value = getter ? getter() : 0;
    return Number.isFinite(value) ? value : 0;
  };
  const setCurrentLevelIndex = (value) => {
    const setter = getHostFn('setCurrentLevelIndex');
    if (setter) {
      setter(value);
    }
  };
  const getScoreValue = () => {
    const getter = getHostFn('getScore');
    if (getter) {
      return getter();
    }
    return 0;
  };
  const setScoreValue = (value) => {
    const setter = getHostFn('setScore');
    if (setter) {
      setter(value);
    }
  };
  const setGameState = (value) => {
    const setter = getHostFn('setGameState');
    if (setter) {
      setter(value);
    }
  };
  const getGameState = () => {
    const getter = getHostFn('getGameState');
    return getter ? getter() : null;
  };
  const getLastInterLevelResult = () => {
    const getter = getHostFn('getLastInterLevelResult');
    return getter ? getter() : null;
  };
  const setLevelEnded = (value) => {
    const setter = getHostFn('setLevelEnded');
    if (setter) {
      setter(value);
    }
  };
  const setSpawningEnabled = (value) => {
    const setter = getHostFn('setSpawningEnabled');
    if (setter) {
      setter(value);
    }
  };
  const isActiveGameplayInProgress = () => {
    const fn = getHostFn('isActiveGameplayInProgress');
    return fn ? fn() : false;
  };
  const getAuthStateSnapshot = () => {
    const getter = getHostFn('getAuthStateSnapshot');
    return getter ? getter() : null;
  };
  const getProgressService = () => {
    if (typeof global !== 'undefined' && global.ProgressController) {
      return global.ProgressController;
    }
    return null;
  };

  function normalizeProgressLevel(level) {
    const numeric = Number.isFinite(level) ? level : Number(level) || 1;
    const clamped = Math.min(Math.max(Math.floor(numeric), 1), LEVELS.length);
    return clamped;
  }

  function getActivePlayerId() {
    const auth = getAuthStateSnapshot();
    return auth?.profile?.id || null;
  }

  function resetProgressRuntime(reason = 'reset') {
    progressRuntime.pending = null;
    progressRuntime.inFlight = null;
    progressRuntime.phase = 'idle';
    progressRuntime.requestId += 1; // invalidate late promises
    progressRuntime.lastAppliedPlayerId = null;
    if (reason) {
      console.info(`[progress] runtime reset${debugFormatContext({ reason })}`);
    }
  }

  function selectNewestSnapshot(existingMeta, nextMeta) {
    if (!nextMeta?.snapshot) return existingMeta || null;
    if (!existingMeta?.snapshot) return nextMeta;
    const existingTs = Date.parse(existingMeta.updatedAt || existingMeta.snapshot.updatedAt || '') || 0;
    const nextTs = Date.parse(nextMeta.updatedAt || nextMeta.snapshot.updatedAt || '') || 0;
    return nextTs >= existingTs ? nextMeta : existingMeta;
  }

  async function applyProgressSnapshot(snapshot, playerId, meta = {}) {
    const game = getGame();
    if (!snapshot || !game) return;

    const levelNumber = normalizeProgressLevel(snapshot.level || 1);
    const snapshotState = snapshot.state || {};
    const storedResult = typeof snapshotState.lastResult === 'string'
      ? snapshotState.lastResult
      : typeof snapshotState.result === 'string'
        ? snapshotState.result
        : null;
    const canAdvanceFlag = typeof snapshotState.canAdvance === 'boolean' ? snapshotState.canAdvance : null;
    const derivedInterLevelResult = storedResult === 'lose' || canAdvanceFlag === false
      ? 'lose'
      : 'win';
    const canAdvance = canAdvanceFlag === false
      ? false
      : canAdvanceFlag === true
        ? true
        : derivedInterLevelResult === 'win';
    const lastClearedLevel = Number.isFinite(snapshotState.lastClearedLevel)
      ? Math.max(1, Math.floor(snapshotState.lastClearedLevel))
      : canAdvance
        ? levelNumber
        : Math.max(1, levelNumber - 1);
    const currentLevelNumber = Math.max(1, Math.floor(getCurrentLevelIndex()) + 1);
    if (currentLevelNumber > levelNumber) {
      console.info('[progress] ignoring older snapshot', debugFormatContext({ levelNumber, currentLevelNumber }));
      return;
    }

    const levelIndex = Math.max(0, levelNumber - 1);
    const loadLevel = getHostFn('loadLevel');
    if (typeof loadLevel === 'function') {
      try {
        await loadLevel(levelIndex, { applyBackground: false, playMusic: false });
      } catch (error) {
        console.warn('[progress] unable to preload level for hydration', { error, levelIndex });
      }
    }

    const restoredScore = Number.isFinite(snapshot.score)
      ? snapshot.score
      : Number(snapshot.score) || 0;

    setCurrentLevelIndex(levelIndex);
    setScoreValue(restoredScore);

    if (game) {
      game.score = restoredScore;
      game.levelReached = Math.max(game.levelReached || 1, lastClearedLevel);
      game.state = 'inter';
      if (typeof game.render === 'function') {
        game.render();
      }
    }

    const setHUDScore = getHostFn('setHUDScore');
    if (setHUDScore) setHUDScore(restoredScore);

    setGameState('inter');
    setLevelEnded(true);
    setSpawningEnabled(false);
    const disablePlayerInput = getHostFn('disablePlayerInput');
    disablePlayerInput?.('progress-apply');

    hasAppliedProgressSnapshot = true;
    progressRuntime.lastAppliedPlayerId = playerId || getActivePlayerId();

    const showInterLevelScreen = getHostFn('showInterLevelScreen');
    showInterLevelScreen?.(derivedInterLevelResult, { replaySound: false });

    console.info('[progress] applied saved snapshot', debugFormatContext({
      levelNumber,
      restoredScore,
      source: meta.source || 'unknown',
      reason: meta.reason || 'unspecified',
    }));
    console.info('[progress] restore decision', debugFormatContext({
      snapshotLevel: levelNumber,
      derivedInterLevelResult,
      canAdvance,
      lastClearedLevel,
      source: meta.source || 'unknown',
      reason: meta.reason || 'unspecified',
    }));
  }

  async function applyPendingProgressIfPossible() {
    const pending = progressRuntime.pending;
    if (!pending || !getGame()) return;
    if (!isProgressApplicationEnabled) return;
    if (isActiveGameplayInProgress()) {
      console.info('[progress] deferring snapshot application during active gameplay', debugFormatContext({
        reason: pending.reason || 'active-gameplay',
        source: pending.source || 'unknown',
      }));
      return;
    }

    progressRuntime.pending = null;
    progressRuntime.phase = 'applying';

    try {
      await applyProgressSnapshot(pending.snapshot, pending.playerId, pending);
    } catch (error) {
      console.warn('[progress] hydration failed', error);
    } finally {
      progressRuntime.phase = 'idle';
    }
  }

  function isProgressRequestCurrent(requestId, playerId) {
    return progressRuntime.requestId === requestId && playerId === getActivePlayerId();
  }

  function queueProgressSnapshot(snapshot, playerId, reason = 'unspecified', meta = {}) {
    const activePlayerId = getActivePlayerId();
    if (!playerId || playerId !== activePlayerId) {
      if (snapshot) {
        console.info(
          `[progress] ignoring snapshot${debugFormatContext({ reason, playerId, activePlayerId })}`
        );
      }
      return;
    }

    if (!snapshot) {
      progressRuntime.pending = null;
      return;
    }

    const nextMeta = {
      snapshot,
      playerId,
      reason,
      source: meta.source || 'unknown',
      updatedAt: snapshot?.updatedAt || snapshot?.state?.updatedAt || null,
    };

    progressRuntime.pending = selectNewestSnapshot(progressRuntime.pending, nextMeta);

    // Do not disrupt a running game; application is attempted when safe.
    applyPendingProgressIfPossible();
  }

  function startProgressLoadForPlayer(playerId, reason = 'auth-sync') {
    const service = getProgressService();
    if (!service || !playerId) {
      return null;
    }

    const requestId = progressRuntime.requestId + 1;
    progressRuntime.requestId = requestId;
    progressRuntime.phase = 'loading';

    console.info('[progress] fetch requested', debugFormatContext({
      source: 'supabase',
      requestId,
      playerId,
      reason,
    }));

    const promise = Promise.resolve()
      .then(() => service.loadProgress())
      .catch((error) => {
        throw error;
      });

    progressRuntime.inFlight = { requestId, promise, label: reason };

    promise
      .then((result) => {
        if (!isProgressRequestCurrent(requestId, playerId)) {
          console.info('[progress] late snapshot ignored', debugFormatContext({ reason, playerId }));
          return;
        }
        const snapshot = result?.snapshot || null;
        const source = result?.source || 'unknown';
        const fallbackReason = result?.reason || reason;
        if (!snapshot) {
          console.info('[progress] no snapshot available', debugFormatContext({
            reason: fallbackReason,
            source,
            playerId,
          }));
        } else {
          console.info('[progress] snapshot received', debugFormatContext({
            reason: fallbackReason,
            source,
            playerId,
            levelNumber: snapshot?.level,
            restoredScore: snapshot?.score,
          }));
        }
        queueProgressSnapshot(snapshot, playerId, fallbackReason, { source });
      })
      .catch((error) => {
        if (isProgressRequestCurrent(requestId, playerId)) {
          console.warn('[progress] failed to load progression', error);
        } else {
          console.info('[progress] late progression load ignored', debugFormatContext({ reason, playerId }));
        }
      })
      .finally(() => {
        if (progressRuntime.inFlight?.requestId === requestId) {
          progressRuntime.inFlight = null;
        }
        if (progressRuntime.phase === 'loading' && progressRuntime.requestId === requestId) {
          progressRuntime.phase = 'idle';
        }
      });

    return promise;
  }

  async function syncProgressFromAuthState(state) {
    const service = getProgressService();
    const playerId = state?.profile?.id || null;

    if (!service || !playerId || !state?.user) {
      console.info('[progress] auth evaluated', debugFormatContext({
        authState: state?.user ? 'authenticated' : 'guest',
        playerId,
        reason: !service ? 'no-service' : !playerId ? 'no-player' : 'no-user',
      }));
      resetProgressRuntime('auth-missing');
      return;
    }

    if (progressRuntime.inFlight && progressRuntime.inFlight.requestId && isProgressRequestCurrent(progressRuntime.inFlight.requestId, playerId)) {
      return;
    }

    console.info('[progress] auth evaluated', debugFormatContext({
      authState: state?.user ? 'authenticated' : 'guest',
      playerId,
      requestId: progressRuntime.requestId,
    }));

    startProgressLoadForPlayer(playerId, 'auth-sync');
  }

  async function waitForInitialProgressHydration() {
    const inFlightPromise = progressRuntime.inFlight?.promise || null;
    const hydrationOutcome = await waitForPromiseWithTimeout(inFlightPromise, {
      label: 'initial progress hydration',
    });

    if (!hydrationOutcome.completed && progressRuntime.phase === 'loading') {
      progressRuntime.phase = 'idle';
    }

    await applyPendingProgressIfPossible();
  }

  async function persistProgressSnapshot(reason = 'unspecified') {
    const service = getProgressService();
    if (!service) return;

    const levelNumber = Math.max(1, Math.floor(getCurrentLevelIndex()) + 1);
    const rawScore = getScoreValue();
    const lastResultRaw = getLastInterLevelResult();
    const lastResult = lastResultRaw === 'lose' ? 'lose' : 'win';
    const canAdvance = lastResult === 'win';
    const lastClearedLevel = canAdvance ? levelNumber : Math.max(1, levelNumber - 1);
    const snapshot = {
      level: levelNumber,
      score: Number.isFinite(rawScore) ? rawScore : Number(rawScore) || 0,
      state: {
        reason,
        level: levelNumber,
        gameState: getGameState(),
        lastResult,
        lastClearedLevel,
        canAdvance,
        updatedAt: new Date().toISOString(),
      },
    };

    try {
      console.info(`[progress] save requested${debugFormatContext({
        reason,
        level: levelNumber,
        score: snapshot.score,
        result: lastResult,
        lastClearedLevel,
        canAdvance,
      })}`);
      await service.saveProgress(snapshot);
      console.info(`[progress] save completed${debugFormatContext({ reason, level: levelNumber })}`);
    } catch (error) {
      console.warn('[progress] failed to save progression', error);
    }
  }

  async function refreshProgressSnapshotForTitleStart(options = {}) {
    const auth = getAuthStateSnapshot?.();
    const playerId = auth?.profile?.id || null;
    const eagerWaitRaw = Number.isFinite(options.eagerWaitMs) ? options.eagerWaitMs : null;
    const eagerWaitMs = eagerWaitRaw !== null ? Math.max(0, eagerWaitRaw) : PROGRESS_LOAD_TIMEOUT_MS;
    const effectiveTimeout = Math.min(PROGRESS_LOAD_TIMEOUT_MS, eagerWaitMs);

    if (!playerId || !auth?.user) {
      console.info('[progress] skip title refresh', debugFormatContext({
        reason: 'auth-missing',
        authState: auth?.user ? 'authenticated' : 'guest',
        playerId,
      }));
      return;
    }

    await waitForPromiseWithTimeout(progressRuntime.inFlight?.promise, {
      label: 'title-start sync wait',
    });

    await applyPendingProgressIfPossible();

    const loadPromise = startProgressLoadForPlayer(playerId, 'title-refresh');
    if (!loadPromise) {
      return;
    }

    const loadOutcome = await waitForPromiseWithTimeout(loadPromise, {
      label: 'title-start snapshot load',
      timeoutMs: effectiveTimeout,
    });

    if (!loadOutcome.completed) {
      console.info(
        `[progress] continuing title start without snapshot${debugFormatContext({ playerId, waitedMs: effectiveTimeout })}`
      );
      loadPromise
        .then(() => applyPendingProgressIfPossible())
        .catch((error) => console.warn('[progress] failed to refresh progression on title start (late)', error));
      return;
    }

    if (loadOutcome.error) {
      console.warn('[progress] failed to refresh progression on title start', loadOutcome.error);
      return;
    }

    try {
      await applyPendingProgressIfPossible();
    } catch (error) {
      console.warn('[progress] failed to apply refreshed progression', error);
    }
  }

  const exported = {
    applyPendingProgressIfPossible,
    refreshProgressSnapshotForTitleStart,
    persistProgressSnapshot,
    syncProgressFromAuthState,
    waitForInitialProgressHydration,
    setProgressApplicationEnabled(value = false) {
      isProgressApplicationEnabled = !!value;
    },
    getHasAppliedProgressSnapshot() {
      return hasAppliedProgressSnapshot;
    },
    setHostContext,
  };

  global.SD_PROGRESS = exported;
  Object.assign(global, exported);
})(typeof window !== 'undefined' ? window : this);
