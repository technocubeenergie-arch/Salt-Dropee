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
    PROGRESS_TITLE_REFRESH_APPLY_COOLDOWN_MS = 2000,
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
  const progressLogger = global.SD_LOG?.createLogger
    ? global.SD_LOG.createLogger('progress')
    : null;
  const logInfo = (...args) => (progressLogger?.info ? progressLogger.info(...args) : undefined);
  const logWarn = (...args) => (progressLogger?.warn ? progressLogger.warn(...args) : console.warn?.(...args));

  const progressRuntime = {
    phase: 'idle', // idle | loading | applying
    pending: null,
    inFlight: null,
    requestId: 0,
    lastAppliedPlayerId: null,
    lastRemoteFetchAt: null,
    lastFetchedRequestId: null,
    lastApplyAt: null,
    lastAppliedRequestId: null,
  };
  let isProgressApplicationEnabled = false;
  let hasAppliedProgressSnapshot = false;
  let lastProgressUiBusy = false;

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

  const getScoreService = () => {
    if (typeof global !== 'undefined' && global.ScoreController) {
      return global.ScoreController;
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

  function getProgressPhase() {
    return progressRuntime.phase;
  }

  function isProgressBusy(options = {}) {
    const authState = options && typeof options === 'object' && options.authState
      ? options.authState
      : getAuthStateSnapshot?.();
    const screenGetter = getHostFn('getActiveScreen');
    const screen = typeof screenGetter === 'function' ? screenGetter() : null;
    const authBusy = !!(authState?.enabled && !authState?.ready);
    const phaseBusy = progressRuntime.phase === 'loading' || progressRuntime.phase === 'applying';
    const inFlightBusy = !!progressRuntime.inFlight;
    const pendingBusy = !!progressRuntime.pending
      && !(screen === 'title' || screen === 'boot'); // Ne pas bloquer l'écran titre indéfiniment.
    return authBusy || phaseBusy || inFlightBusy || pendingBusy;
  }

  function emitProgressUiBusyChange(isBusy, context = {}) {
    const screenGetter = getHostFn('getActiveScreen');
    const payload = {
      phase: getProgressPhase(),
      screen: typeof screenGetter === 'function' ? screenGetter() : undefined,
      ...context,
    };

    const handler = getHostFn('onProgressBusyChange');
    if (typeof handler === 'function') {
      handler(isBusy, payload);
    }

    const direction = isBusy ? 'ON' : 'OFF';
    logInfo?.(`ui busy ${direction}`, payload);
  }

  function updateProgressUiBusyState(context = {}) {
    const authState = getAuthStateSnapshot?.();
    const nextBusy = isProgressBusy({ authState });
    if (nextBusy === lastProgressUiBusy) return;
    lastProgressUiBusy = nextBusy;
    emitProgressUiBusyChange(nextBusy, context);
  }

  function resetProgressRuntime(reason = 'reset') {
    const prevPhase = progressRuntime.phase;
    progressRuntime.pending = null;
    progressRuntime.inFlight = null;
    progressRuntime.phase = 'idle';
    progressRuntime.requestId += 1; // invalidate late promises
    progressRuntime.lastAppliedPlayerId = null;
    if (reason) {
      logInfo?.(`runtime reset${debugFormatContext({ reason })}`);
    }
    if (prevPhase !== progressRuntime.phase) {
      logInfo?.('phase transition', {
        from: prevPhase,
        to: progressRuntime.phase,
        reason,
      });
    }
    updateProgressUiBusyState({ reason: `${reason}-runtime-reset` });
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
      logInfo?.('ignoring older snapshot', debugFormatContext({ levelNumber, currentLevelNumber }));
      return;
    }

    const levelIndex = Math.max(0, levelNumber - 1);
    const loadLevel = getHostFn('loadLevel');
    if (typeof loadLevel === 'function') {
      try {
        await loadLevel(levelIndex, { applyBackground: false, playMusic: false });
      } catch (error) {
        logWarn?.('unable to preload level for hydration', { error, levelIndex });
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
    progressRuntime.lastApplyAt = Date.now();
    if (meta?.requestId) {
      progressRuntime.lastAppliedRequestId = meta.requestId;
    }

    const showInterLevelScreen = getHostFn('showInterLevelScreen');
    showInterLevelScreen?.(derivedInterLevelResult, { replaySound: false });

    logInfo?.('applied saved snapshot', debugFormatContext({
      levelNumber,
      restoredScore,
      source: meta.source || 'unknown',
      reason: meta.reason || 'unspecified',
    }));
    logInfo?.('restore decision', debugFormatContext({
      snapshotLevel: levelNumber,
      derivedInterLevelResult,
      canAdvance,
      lastClearedLevel,
      source: meta.source || 'unknown',
      reason: meta.reason || 'unspecified',
    }));
  }

  async function loadLegendResumeSnapshot(playerId, reason = 'resume-check') {
    const scoreService = getScoreService();
    if (!scoreService || typeof scoreService.fetchBestLegendScoreForPlayer !== 'function') {
      logInfo?.('legend resume skipped', debugFormatContext({ reason: 'missing-score-service', playerId }));
      return { snapshot: null, source: 'scores', reason: 'missing-score-service' };
    }

    const result = await scoreService.fetchBestLegendScoreForPlayer(playerId);
    if (!result?.available || !result.row) {
      logInfo?.('legend resume not available', debugFormatContext({
        reason: result?.reason || 'not-found',
        source: 'scores',
      }));
      return { snapshot: null, source: 'scores', reason: result?.reason || 'not-found' };
    }

    const row = result.row;
    const levelNumber = normalizeProgressLevel(row.level || LEVELS.length || 1);
    const snapshot = {
      level: levelNumber,
      score: Number(row.score) || 0,
      state: {
        reason: 'legend-resume',
        mode: 'legend',
        lastResult: 'win',
        canAdvance: true,
        lastClearedLevel: Math.max(1, levelNumber - 1),
        updatedAt: row.created_at || null,
      },
      updatedAt: row.created_at || null,
    };

    logInfo?.('legend resume candidate found', debugFormatContext({
      source: 'scores',
      levelNumber,
      score: snapshot.score,
      createdAt: row.created_at || null,
    }));

    return { snapshot, source: 'scores', reason: 'legend-found' };
  }

  async function loadResumeCandidate(playerId, reason = 'unspecified') {
    const legendResult = await loadLegendResumeSnapshot(playerId, reason);
    if (legendResult?.snapshot) {
      return legendResult;
    }

    const service = getProgressService();
    if (!service || typeof service.loadProgress !== 'function') {
      logWarn?.('progress resume skipped (service missing)');
      return { snapshot: null, source: 'progress', reason: 'missing-service' };
    }

    const progressResult = await service.loadProgress();
    return { snapshot: progressResult?.snapshot || null, source: 'progress', reason: progressResult?.reason || reason };
  }

  async function applyPendingProgressIfPossible() {
    const pending = progressRuntime.pending;
    if (!pending || !getGame()) return;
    if (!isProgressApplicationEnabled) return;
    if (isActiveGameplayInProgress()) {
      logInfo?.('deferring snapshot application during active gameplay', debugFormatContext({
        reason: pending.reason || 'active-gameplay',
        source: pending.source || 'unknown',
      }));
      return;
    }

    const prevPhase = progressRuntime.phase;
    progressRuntime.pending = null;
    progressRuntime.phase = 'applying';
    if (prevPhase !== progressRuntime.phase) {
      logInfo?.('phase transition', {
        from: prevPhase,
        to: progressRuntime.phase,
        reason: pending.reason || 'apply-pending-start',
      });
    }
    updateProgressUiBusyState({ reason: 'apply-pending-start' });

    try {
      await applyProgressSnapshot(pending.snapshot, pending.playerId, pending);
    } catch (error) {
      logWarn?.('hydration failed', error);
    } finally {
      const finalPrevPhase = progressRuntime.phase;
      progressRuntime.phase = 'idle';
      if (finalPrevPhase !== progressRuntime.phase) {
        logInfo?.('phase transition', {
          from: finalPrevPhase,
          to: progressRuntime.phase,
          reason: pending.reason || 'apply-pending-complete',
        });
      }
      updateProgressUiBusyState({ reason: 'apply-pending-complete' });
    }
  }

  function isProgressRequestCurrent(requestId, playerId) {
    return progressRuntime.requestId === requestId && playerId === getActivePlayerId();
  }

  function queueProgressSnapshot(snapshot, playerId, reason = 'unspecified', meta = {}) {
    const activePlayerId = getActivePlayerId();
    if (!playerId || playerId !== activePlayerId) {
      if (snapshot) {
        logInfo?.(
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
    logInfo?.('snapshot queued', debugFormatContext({
      reason,
      source: nextMeta.source,
      updatedAt: nextMeta.updatedAt,
    }));
    updateProgressUiBusyState({ reason: 'queue-snapshot' });

    // Do not disrupt a running game; application is attempted when safe.
    applyPendingProgressIfPossible();
  }

  function startProgressLoadForPlayer(playerId, reason = 'auth-sync') {
    if (!playerId) {
      return null;
    }

    if (reason === 'title-refresh' && progressRuntime.lastApplyAt) {
      const now = Date.now();
      const msSinceApply = now - progressRuntime.lastApplyAt;
      if (msSinceApply >= 0 && msSinceApply < PROGRESS_TITLE_REFRESH_APPLY_COOLDOWN_MS) {
        logInfo?.('fetch skipped', debugFormatContext({
          reason,
          because: 'recent-apply',
          msSinceApply,
          cooldownMs: PROGRESS_TITLE_REFRESH_APPLY_COOLDOWN_MS,
        }));
        updateProgressUiBusyState({ reason: 'fetch-skip-recent-apply' });
        return null;
      }
    }

    const requestId = progressRuntime.requestId + 1;
    progressRuntime.requestId = requestId;
    const prevPhase = progressRuntime.phase;
    progressRuntime.phase = 'loading';
    if (prevPhase !== progressRuntime.phase) {
      logInfo?.('phase transition', {
        from: prevPhase,
        to: progressRuntime.phase,
        reason,
      });
    }
    updateProgressUiBusyState({ reason: 'start-load' });

    logInfo?.('fetch requested', debugFormatContext({
      source: 'supabase',
      requestId,
      playerId,
      reason,
    }));

    const promise = Promise.resolve()
      .then(() => loadResumeCandidate(playerId, reason))
      .catch((error) => {
        throw error;
      });

    progressRuntime.inFlight = { requestId, promise, label: reason };

    promise
      .then((result) => {
        if (!isProgressRequestCurrent(requestId, playerId)) {
          logInfo?.('late snapshot ignored', debugFormatContext({ reason, playerId }));
          return;
        }
        progressRuntime.lastRemoteFetchAt = Date.now();
        progressRuntime.lastFetchedRequestId = requestId;
        const snapshot = result?.snapshot || null;
        const source = result?.source || 'unknown';
        const fallbackReason = result?.reason || reason;
        logInfo?.('resume source resolved', debugFormatContext({
          source,
          reason: fallbackReason,
          hasSnapshot: Boolean(snapshot),
        }));
        if (!snapshot) {
          logInfo?.('no snapshot available', debugFormatContext({
            reason: fallbackReason,
            source,
            playerId,
          }));
        } else {
          logInfo?.('snapshot received', debugFormatContext({
            reason: fallbackReason,
            source,
            playerId,
            levelNumber: snapshot?.level,
            restoredScore: snapshot?.score,
          }));
          logInfo?.('resume candidate', debugFormatContext({
            source,
            levelNumber: snapshot?.level,
            score: snapshot?.score,
          }));
        }
        logInfo?.('load finished', debugFormatContext({
          outcome: snapshot ? 'snapshot' : 'none',
          source,
          reason: fallbackReason,
          playerId,
          requestId,
        }));
        queueProgressSnapshot(snapshot, playerId, fallbackReason, { source, requestId });
      })
      .catch((error) => {
        if (isProgressRequestCurrent(requestId, playerId)) {
          logWarn?.('failed to load progression', error);
        } else {
          logInfo?.('late progression load ignored', debugFormatContext({ reason, playerId }));
        }
        logInfo?.('load finished', debugFormatContext({
          outcome: 'error',
          source: 'supabase',
          reason,
          playerId,
          requestId,
        }));
      })
      .finally(() => {
        if (progressRuntime.inFlight?.requestId === requestId) {
          progressRuntime.inFlight = null;
        }
        if (progressRuntime.phase === 'loading' && progressRuntime.requestId === requestId) {
          const prevPhaseAfterLoad = progressRuntime.phase;
          progressRuntime.phase = 'idle';
          if (prevPhaseAfterLoad !== progressRuntime.phase) {
            logInfo?.('phase transition', {
              from: prevPhaseAfterLoad,
              to: progressRuntime.phase,
              reason: 'load-finished',
            });
          }
        }
        updateProgressUiBusyState({ reason: 'load-finished' });
      });

    return promise;
  }

  async function syncProgressFromAuthState(state) {
    const service = getProgressService();
    const playerId = state?.profile?.id || null;

    if (!service || !playerId || !state?.user) {
      logInfo?.('auth evaluated', debugFormatContext({
        authState: state?.user ? 'authenticated' : 'guest',
        playerId,
        reason: !service ? 'no-service' : !playerId ? 'no-player' : 'no-user',
      }));
      resetProgressRuntime('auth-missing');
      updateProgressUiBusyState({ reason: 'auth-missing' });
      return;
    }

    if (progressRuntime.inFlight && progressRuntime.inFlight.requestId && isProgressRequestCurrent(progressRuntime.inFlight.requestId, playerId)) {
      updateProgressUiBusyState({ reason: 'auth-inflight' });
      return;
    }

    logInfo?.('auth evaluated', debugFormatContext({
      authState: state?.user ? 'authenticated' : 'guest',
      playerId,
      requestId: progressRuntime.requestId,
    }));

    updateProgressUiBusyState({ reason: 'auth-evaluated' });

    startProgressLoadForPlayer(playerId, 'auth-sync');
  }

  async function waitForInitialProgressHydration() {
    const inFlightPromise = progressRuntime.inFlight?.promise || null;
    const hydrationOutcome = await waitForPromiseWithTimeout(inFlightPromise, {
      label: 'initial progress hydration',
    });

    if (!hydrationOutcome.completed && progressRuntime.phase === 'loading') {
      const prevPhase = progressRuntime.phase;
      progressRuntime.phase = 'idle';
      if (prevPhase !== progressRuntime.phase) {
        logInfo?.('phase transition', {
          from: prevPhase,
          to: progressRuntime.phase,
          reason: 'initial-hydration-timeout',
        });
      }
    }

    await applyPendingProgressIfPossible();
    updateProgressUiBusyState({ reason: 'initial-hydration-complete' });
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
      logInfo?.(`save requested${debugFormatContext({
        reason,
        level: levelNumber,
        score: snapshot.score,
        result: lastResult,
        lastClearedLevel,
        canAdvance,
      })}`);
      const saveResult = await service.saveProgress(snapshot);
      const saveOutcomeReason = saveResult?.reason || reason;
      const saveOutcomeSource = saveResult?.source || 'unknown';
      if (saveOutcomeSource === 'supabase') {
        logInfo?.(`save completed${debugFormatContext({
          reason: saveOutcomeReason,
          level: levelNumber,
        })}`);
      } else if (saveOutcomeReason === 'supabase-unavailable') {
        logInfo?.('[progress] save stored locally (supabase unavailable)');
      } else {
        logWarn?.('[progress] save stored locally (fallback)', {
          reason: saveOutcomeReason || 'fallback',
        });
      }
    } catch (error) {
      logWarn?.('failed to save progression', error);
    }
  }

  async function refreshProgressSnapshotForTitleStart(options = {}) {
    const auth = getAuthStateSnapshot?.();
    const playerId = auth?.profile?.id || null;
    const eagerWaitRaw = Number.isFinite(options.eagerWaitMs) ? options.eagerWaitMs : null;
    const eagerWaitMs = eagerWaitRaw !== null ? Math.max(0, eagerWaitRaw) : PROGRESS_LOAD_TIMEOUT_MS;
    const effectiveTimeout = Math.min(PROGRESS_LOAD_TIMEOUT_MS, eagerWaitMs);

    if (!playerId || !auth?.user) {
      logInfo?.('skip title refresh', debugFormatContext({
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
    updateProgressUiBusyState({ reason: 'title-start-pre-refresh' });

    const loadPromise = startProgressLoadForPlayer(playerId, 'title-refresh');
    if (!loadPromise) {
      return;
    }

    const loadOutcome = await waitForPromiseWithTimeout(loadPromise, {
      label: 'title-start snapshot load',
      timeoutMs: effectiveTimeout,
    });

    if (!loadOutcome.completed) {
      logInfo?.(
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
    } finally {
      updateProgressUiBusyState({ reason: 'title-start-apply-complete' });
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
    getProgressPhase,
    isProgressBusy,
    setHostContext,
  };

  global.SD_PROGRESS = exported;
  Object.assign(global, exported);
})(typeof window !== 'undefined' ? window : this);
