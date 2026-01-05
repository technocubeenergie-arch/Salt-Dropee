import {
  getSupabaseClient,
  isSupabaseEnabledInConfig,
  isSupabaseReady,
} from './supabaseClient.js';
import authFacade, { saltAuth } from './authController.js';

const scoreLogger = (typeof window !== 'undefined' && window.SD_LOG?.createLogger)
  ? window.SD_LOG.createLogger('score')
  : null;
const logDebug = (...args) => (scoreLogger?.debug ? scoreLogger.debug(...args) : undefined);
const logInfo = (...args) => (scoreLogger?.info ? scoreLogger.info(...args) : undefined);
const logWarn = (...args) => (scoreLogger?.warn ? scoreLogger.warn(...args) : undefined);
const logError = (...args) => (scoreLogger?.error ? scoreLogger.error(...args) : undefined);

const globalRef = typeof window !== 'undefined' ? window : globalThis;

const PENDING_STORAGE_KEY = 'pendingLegendScores';
const MAX_PENDING_SCORES = 20;

function isNavigatorOffline() {
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  } catch (_) {
    return false;
  }
}

function getAuthSnapshot() {
  if (saltAuth && typeof saltAuth.getState === 'function') {
    return saltAuth.getState();
  }
  if (authFacade && typeof authFacade.getState === 'function') {
    return authFacade.getState();
  }
  if (typeof window !== 'undefined' && window.SaltAuth?.getState) {
    try {
      return window.SaltAuth.getState();
    } catch (error) {
      logDebug?.('[score] failed to read auth state from window', error);
    }
  }
  return null;
}

async function getSupabase() {
  if (!isSupabaseEnabledInConfig()) {
    return null;
  }
  const ready = await isSupabaseReady();
  if (!ready) {
    return null;
  }
  return getSupabaseClient();
}

function describeError(error) {
  if (!error) {
    return null;
  }
  return {
    code: error.code || null,
    message: error.message || null,
    details: error.details || null,
  };
}

function coerceScore(value) {
  if (Number.isFinite(value)) {
    return Math.floor(value);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
}

function isTransientError(error) {
  if (!error) {
    return false;
  }

  if (isNavigatorOffline()) {
    return true;
  }

  const status = Number(error.status ?? error.statusCode);
  if (Number.isFinite(status) && (status === 0 || status === 408 || status === 425 || status === 429 || status >= 500)) {
    return true;
  }

  const code = typeof error.code === 'string' ? error.code.toUpperCase() : '';
  const transientCodes = new Set([
    'ETIMEDOUT',
    'ECONNABORTED',
    'FETCH_ERROR',
    'NETWORK_ERROR',
    'TIMEOUT',
    'ABORT_ERR',
  ]);
  if (transientCodes.has(code)) {
    return true;
  }

  const message = (error.message || '').toLowerCase();
  if (
    message.includes('failed to fetch')
    || message.includes('network error')
    || message.includes('network request failed')
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('abort')
  ) {
    return true;
  }

  return false;
}

function isPermanentAuthOrConfigError(error) {
  if (!error) {
    return false;
  }
  const status = Number(error.status ?? error.statusCode);
  if (Number.isFinite(status) && (status === 401 || status === 403 || status === 404)) {
    return true;
  }
  const code = typeof error.code === 'string' ? error.code.toUpperCase() : '';
  return code === '401' || code === '403' || code === '404';
}

function getLegendSeedFromLocation() {
  try {
    const search = globalRef.location?.search || '';
    if (!search) return null;
    const params = new URLSearchParams(search);
    const seed = params.get('seed');
    return seed || null;
  } catch (_) {
    return null;
  }
}

function wait(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, delayMs));
  });
}

function loadPendingLegendScoresFromStorage() {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: item.id || null,
        createdAt: Number(item.createdAt) || Date.now(),
        score: coerceScore(item.score),
        durationSeconds: Number.isFinite(item.durationSeconds) ? Number(item.durationSeconds) : null,
        level: Number.isFinite(item.level) ? Math.max(0, Math.floor(item.level)) : 6,
        mode: item.mode || 'legend',
        seed: item.seed || null,
        userId: item.userId || null,
        payload: item.payload || null,
      }))
      .filter((item) => Number.isFinite(item.score) && item.score > 0 && item.id);
  } catch (error) {
    logDebug?.('[score] failed to read pending legend scores', error);
    return [];
  }
}

let pendingLegendScoresCache = loadPendingLegendScoresFromStorage();

function persistPendingLegendScores(list = []) {
  pendingLegendScoresCache = Array.isArray(list) ? [...list] : [];
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(pendingLegendScoresCache));
  } catch (error) {
    logDebug?.('[score] failed to persist pending legend scores', error);
  }
}

function notifyPendingLegendScoresChange() {
  const count = pendingLegendScoresCache.length;
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(
        new CustomEvent('sd:pending-legend-scores-changed', { detail: { count } })
      );
    } catch (error) {
      logDebug?.('[score] failed to dispatch pending scores change', error);
    }
  }
}

function setPendingLegendScores(list = []) {
  const sorted = [...(list || [])].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const limited = sorted.slice(-MAX_PENDING_SCORES);
  persistPendingLegendScores(limited);
  notifyPendingLegendScoresChange();
  return limited;
}

function getPendingLegendScores() {
  return [...pendingLegendScoresCache].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function getPendingLegendScoreCount() {
  return pendingLegendScoresCache.length;
}

function addPendingLegendScore(entry = {}) {
  const id = entry.id || `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = Number(entry.createdAt) || Date.now();
  const normalized = {
    id,
    createdAt,
    score: coerceScore(entry.score),
    durationSeconds: Number.isFinite(entry.durationSeconds) ? Number(entry.durationSeconds) : null,
    level: Number.isFinite(entry.level) ? Math.max(0, Math.floor(entry.level)) : 6,
    mode: entry.mode || 'legend',
    seed: entry.seed || null,
    userId: entry.userId || null,
    payload: entry.payload || null,
  };

  if (!Number.isFinite(normalized.score) || normalized.score <= 0) {
    return null;
  }

  const pending = getPendingLegendScores();
  pending.push(normalized);
  setPendingLegendScores(pending);
  logDebug?.('[score] stored pending legend score', { id: normalized.id, count: pending.length });
  return normalized;
}

function removePendingLegendScore(id) {
  if (!id) return getPendingLegendScores();
  const next = getPendingLegendScores().filter((item) => item.id !== id);
  setPendingLegendScores(next);
  return next;
}

function showPendingScoreNotice() {
  const uiCore = globalRef?.SD_UI_CORE || {};
  const showNotice = typeof uiCore.showTransientNotice === 'function'
    ? uiCore.showTransientNotice
    : null;
  if (showNotice) {
    showNotice('Score enregistré localement. Il sera envoyé automatiquement quand la connexion reviendra.', {
      variant: 'info',
      durationMs: 4200,
    });
  }
}

async function executeLegendScoreRequest(label, operationFn, { maxAttempts = 3, baseDelayMs = 500 } = {}) {
  let attempt = 0;
  let lastError = null;
  let nextDelay = 0;

  while (attempt < maxAttempts) {
    if (nextDelay > 0) {
      await wait(nextDelay);
    }

    attempt += 1;
    let response;
    try {
      response = await operationFn();
    } catch (error) {
      response = { error };
    }

    const opError = response?.error || null;
    if (!opError) {
      logDebug?.('[score] legend score request success', { label, attempt });
      return { ...response, attempts: attempt };
    }

    lastError = opError;
    const transient = isTransientError(opError);
    const jitter = Math.floor(Math.random() * 120);
    const retryDelay = transient && attempt < maxAttempts
      ? baseDelayMs * 2 ** (attempt - 1) + jitter
      : null;

    logDebug?.('[score] legend score request attempt failed', {
      label,
      attempt,
      transient,
      retryDelayMs: retryDelay || 0,
      error: describeError(opError) || { message: opError?.message },
    });

    if (!transient || attempt >= maxAttempts) {
      logDebug?.('[score] legend score request failed', {
        label,
        attempts: attempt,
        error: describeError(opError) || { message: opError?.message },
      });
      return {
        ...response,
        attempts: attempt,
        finalError: opError,
      };
    }

    nextDelay = retryDelay || 0;
  }

  return {
    error: lastError,
    attempts: attempt,
    finalError: lastError,
  };
}

async function upsertLegendScore({ supabase, resolvedPlayerId, numericScore, durationPayload }) {
  const { data: existingBestData, error: selectError } = await supabase
    .from('scores')
    .select('id, score')
    .eq('player_id', resolvedPlayerId)
    .eq('level', 6)
    .order('score', { ascending: false })
    .limit(1)
    .maybeSingle();
  let existingBest = existingBestData;

  if (selectError && selectError.code !== 'PGRST116') {
    const selectIsTransient = isTransientError(selectError);
    const selectLog = selectIsTransient ? logDebug : logDebug;
    selectLog?.('[score] read best legend score failed', describeError(selectError));
    existingBest = null;
  }

  const bestScore = coerceScore(existingBest?.score);
  const hasExistingBest = Number.isFinite(bestScore);

  if (existingBest && hasExistingBest) {
    if (numericScore <= bestScore) {
      logInfo?.('[score] new legend score <= existing, keeping existing', {
        score: numericScore,
        existing: bestScore,
      });
      return { success: true, skipped: true, payload: { score: numericScore, bestScore } };
    }

    const payload = {
      score: numericScore,
      duration_seconds: durationPayload,
    };

    const updateResult = await executeLegendScoreRequest(
      'update-legend-score',
      () =>
        supabase
          .from('scores')
          .update(payload)
          .eq('id', existingBest.id)
          .eq('player_id', resolvedPlayerId)
          .eq('level', 6)
    );

    if (updateResult?.error) {
      return {
        success: false,
        reason: updateResult.error.code || 'UPDATE_FAILED',
        error: updateResult.error,
      };
    }

    logInfo?.('[score] legend best score updated', {
      score: numericScore,
      attempts: updateResult?.attempts || 1,
    });

    return { success: true, payload: { ...existingBest, score: numericScore, duration_seconds: durationPayload } };
  }

  const payload = {
    player_id: resolvedPlayerId,
    level: 6,
    score: numericScore,
    duration_seconds: durationPayload,
  };

  const insertResult = await executeLegendScoreRequest('insert-legend-score', () =>
    supabase.from('scores').insert(payload)
  );

  if (insertResult?.error) {
    return {
      success: false,
      reason: insertResult.error.code || 'INSERT_FAILED',
      error: insertResult.error,
    };
  }

  logInfo?.('[score] legend best score inserted', {
    score: numericScore,
    attempts: insertResult?.attempts || 1,
  });

  return { success: true, payload };
}

async function submitLegendScore({ playerId, score, durationSeconds, level } = {}) {
  try {
    logInfo?.('[score] submitLegendScore called', { playerId, score, durationSeconds, level });

    if (Number.isFinite(level) && Math.floor(level) !== 6) {
      logInfo?.('[score] submitLegendScore skipped', { reason: 'notLegendLevel', level });
      return { success: false, reason: 'NOT_LEGEND_LEVEL' };
    }

    if (!isSupabaseEnabledInConfig()) {
      logInfo?.('[score] submitLegendScore skipped', { reason: 'disabled' });
      return { success: false, reason: 'DISABLED' };
    }

    const authState = getAuthSnapshot();
    const user = authState?.user || null;
    const resolvedPlayerId = playerId || authState?.profile?.id || null;

    const numericScore = coerceScore(score);

    if (!Number.isFinite(numericScore) || numericScore <= 0) {
      logInfo?.('[score] submitLegendScore skipped', { reason: 'invalidScore', score });
      return { success: false, reason: 'INVALID_SCORE' };
    }
    const durationPayload = Number.isFinite(durationSeconds)
      ? Math.max(0, Math.floor(durationSeconds))
      : null;

    const seed = getLegendSeedFromLocation();
    const pendingMetadata = {
      score: numericScore,
      durationSeconds: durationPayload,
      level: 6,
      mode: 'legend',
      seed,
      userId: resolvedPlayerId || user?.id || null,
    };

    const supabase = await getSupabase();
    if (!supabase) {
      logDebug?.('[score] submitLegendScore deferred (supabase not ready)', { reason: 'notReady' });
      addPendingLegendScore(pendingMetadata);
      showPendingScoreNotice();
      return { success: false, reason: 'NOT_READY', queued: true };
    }

    if (!user || !user.id || !resolvedPlayerId) {
      logDebug?.('[score] submitLegendScore queued due to missing auth', {
        hasUser: Boolean(user?.id),
        playerId: resolvedPlayerId,
      });
      addPendingLegendScore(pendingMetadata);
      showPendingScoreNotice();
      return { success: false, reason: 'MISSING_AUTH', queued: true };
    }

    logInfo?.('[score] legend score write starting', {
      playerId: resolvedPlayerId,
      score: numericScore,
      durationSeconds: durationPayload,
    });

    const writeResult = await upsertLegendScore({
      supabase,
      resolvedPlayerId,
      numericScore,
      durationPayload,
    });

    if (!writeResult?.success) {
      const error = writeResult?.error || writeResult;
      if (isTransientError(error) || isNavigatorOffline()) {
        addPendingLegendScore(pendingMetadata);
        showPendingScoreNotice();
        return { success: false, reason: 'TRANSIENT_ERROR', queued: true };
      }
      return { success: false, reason: writeResult?.reason || 'UNKNOWN_ERROR', error };
    }

    return writeResult;
  } catch (error) {
    logError?.('[score] unexpected submitLegendScore error', error);
    return { success: false, reason: 'UNEXPECTED_ERROR' };
  }
}

// Top Legend étendu à 20 lignes pour l'affichage scrollable du leaderboard.
async function fetchLegendTop(limit = 20) {
  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return { entries: [], error: 'NOT_READY' };
    }

    const finalLimit = Math.max(1, Math.min(Number(limit) || 20, 25));

    const result = await executeLegendScoreRequest(
      'fetch-legend-top',
      () =>
        supabase
          .from('leaderboard_top')
          .select('level, username, best_score, player_id')
          .eq('level', 6)
          .order('best_score', { ascending: false })
          .limit(finalLimit),
      { maxAttempts: 3, baseDelayMs: 350 }
    );

    if (result?.error) {
      const error = result.finalError || result.error;
      const reason = isPermanentAuthOrConfigError(error)
        ? 'PERMANENT'
        : isTransientError(error)
          ? 'TRANSIENT'
          : 'ERROR';
      logDebug?.('[score] fetchLegendTop failed', { reason, error: describeError(error) });
      return { entries: [], error: { reason, detail: describeError(error) } };
    }

    return { entries: Array.isArray(result?.data) ? result.data : [], error: null };
  } catch (error) {
    logDebug?.('[score] unexpected fetchLegendTop error', error);
    return { entries: [], error: { reason: 'UNEXPECTED', detail: describeError(error) } };
  }
}

async function fetchMyLegendRank() {
  try {
    const supabase = await getSupabase();
    const authState = getAuthSnapshot();
    const playerId = authState?.profile?.id || null;
    const username = authState?.profile?.username || authState?.user?.username || null;

    if (!supabase || !playerId || !username) {
      return { available: false, reason: 'MISSING_CONTEXT' };
    }

    const { data: myScoreRow, error: bestError } = await supabase
      .from('scores')
      .select('score')
      .eq('player_id', playerId)
      .eq('level', 6)
      .order('score', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bestError && bestError.code !== 'PGRST116') {
      logDebug?.('[score] fetchMyLegendRank best score failed', describeError(bestError));
      return { available: false, reason: 'BEST_SCORE_ERROR' };
    }

    if (!myScoreRow) {
      return { available: false, reason: 'NO_SCORE' };
    }

    const myBestScore = coerceScore(myScoreRow.score);
    const { count: betterCount, error: rankError } = await supabase
      .from('scores')
      .select('score', { count: 'exact', head: true })
      .eq('level', 6)
      .gt('score', myBestScore);

    if (rankError) {
      logDebug?.('[score] fetchMyLegendRank rank query failed', describeError(rankError));
      return { available: false, reason: 'RANK_ERROR' };
    }

    const rank = (betterCount ?? 0) + 1;

    return {
      available: true,
      entry: {
        rank,
        username,
        player_id: playerId,
        best_score: myBestScore,
      },
    };
  } catch (error) {
    logDebug?.('[score] unexpected fetchMyLegendRank error', error);
    return { available: false, reason: 'UNEXPECTED_ERROR' };
  }
}

async function fetchLegendReferralCounts(playerIds = []) {
  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return { rows: [], error: 'NOT_READY' };
    }

    const uniqueIds = Array.from(new Set((playerIds || []).filter(Boolean)));
    if (uniqueIds.length === 0) {
      return { rows: [], error: null };
    }

    const { data, error } = await supabase
      .from('referral_rewards')
      .select('player_id, credited_count')
      .in('player_id', uniqueIds);

    if (error) {
      logDebug?.('[score] fetchLegendReferralCounts failed', describeError(error));
      return { rows: [], error };
    }

    return { rows: Array.isArray(data) ? data : [], error: null };
  } catch (error) {
    logDebug?.('[score] unexpected fetchLegendReferralCounts error', error);
    return { rows: [], error };
  }
}

async function flushPendingLegendScores(options = {}) {
  const reason = typeof options.reason === 'string' && options.reason.trim()
    ? options.reason
    : 'flush';

  const pending = getPendingLegendScores();
  if (pending.length === 0) {
    return { flushed: 0, remaining: 0, reason };
  }

  const authState = getAuthSnapshot();
  const authPlayerId = authState?.profile?.id || authState?.user?.id || null;
  const supabase = await getSupabase();
  if (!supabase) {
    logDebug?.('[score] skip flush (no supabase)', { reason });
    return { flushed: 0, remaining: pending.length, reason };
  }

  let flushed = 0;

  for (const item of pending) {
    const targetPlayerId = item.userId || authPlayerId;
    if (!targetPlayerId) {
      logDebug?.('[score] pending score missing user, waiting for auth', { id: item.id });
      break;
    }

    if (!item.userId && targetPlayerId) {
      const updated = getPendingLegendScores().map((entry) => (
        entry.id === item.id ? { ...entry, userId: targetPlayerId } : entry
      ));
      setPendingLegendScores(updated);
    }

    const writeResult = await upsertLegendScore({
      supabase,
      resolvedPlayerId: targetPlayerId,
      numericScore: coerceScore(item.score),
      durationPayload: Number.isFinite(item.durationSeconds) ? item.durationSeconds : null,
    });

    if (writeResult?.success) {
      flushed += 1;
      removePendingLegendScore(item.id);
      continue;
    }

    const error = writeResult?.error || writeResult;
    if (isPermanentAuthOrConfigError(error)) {
      logDebug?.('[score] stopping flush on permanent error', { error: describeError(error) });
      break;
    }

    if (isTransientError(error)) {
      logDebug?.('[score] stopping flush on transient error', { error: describeError(error) });
      break;
    }
  }

  return { flushed, remaining: getPendingLegendScoreCount(), reason };
}

async function fetchBestLegendScoreForPlayer(playerId) {
  try {
    const authState = getAuthSnapshot();
    const resolvedPlayerId = playerId || authState?.profile?.id || null;

    if (!resolvedPlayerId) {
      logDebug?.('[score] fetchBestLegendScoreForPlayer skipped', { reason: 'MISSING_PLAYER' });
      return { available: false, reason: 'MISSING_PLAYER' };
    }

    const supabase = await getSupabase();
    if (!supabase) {
      logDebug?.('[score] fetchBestLegendScoreForPlayer skipped', { reason: 'NOT_READY' });
      return { available: false, reason: 'NOT_READY' };
    }

    const { data, error } = await supabase
      .from('scores')
      .select('player_id, level, score, duration_seconds, created_at')
      .eq('player_id', resolvedPlayerId)
      .order('score', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      const reason = isTransientError(error) ? 'TRANSIENT_ERROR' : 'ERROR';
      logDebug?.('[score] fetchBestLegendScoreForPlayer failed', { reason, error: describeError(error) });
      return { available: false, reason, error };
    }

    if (!data) {
      logDebug?.('[score] fetchBestLegendScoreForPlayer empty', { reason: 'NOT_FOUND' });
      return { available: false, reason: 'NOT_FOUND' };
    }

    return { available: true, row: data };
  } catch (error) {
    logDebug?.('[score] fetchBestLegendScoreForPlayer unexpected error', error);
    return { available: false, reason: 'UNEXPECTED_ERROR', error };
  }
}

function onPendingLegendScoresChange(listener) {
  if (typeof listener !== 'function') return () => {};
  const handler = (event) => {
    const count = Number(event?.detail?.count ?? getPendingLegendScoreCount()) || 0;
    listener(count);
  };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('sd:pending-legend-scores-changed', handler);
  }
  try {
    listener(getPendingLegendScoreCount());
  } catch (error) {
    logDebug?.('[score] pending listener init failed', error);
  }
  return () => {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('sd:pending-legend-scores-changed', handler);
    }
  };
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => {
    flushPendingLegendScores({ reason: 'online' });
  });
}

if (saltAuth?.onChange) {
  saltAuth.onChange(() => {
    flushPendingLegendScores({ reason: 'auth-change' });
  });
}

const scheduleStartupFlush = () => {
  const run = () => flushPendingLegendScores({ reason: 'startup' });
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(run);
  } else {
    setTimeout(run, 0);
  }
};

scheduleStartupFlush();

const ScoreController = {
  submitLegendScore,
  fetchLegendTop,
  fetchMyLegendRank,
  fetchLegendReferralCounts,
  flushPendingLegendScores,
  getPendingLegendScoreCount,
  onPendingLegendScoresChange,
  fetchBestLegendScoreForPlayer,
};

if (typeof window !== 'undefined') {
  window.ScoreController = ScoreController;
}

export {
  submitLegendScore,
  fetchLegendTop,
  fetchMyLegendRank,
  fetchLegendReferralCounts,
  flushPendingLegendScores,
  getPendingLegendScoreCount,
  onPendingLegendScoresChange,
  isTransientError,
  isPermanentAuthOrConfigError,
  fetchBestLegendScoreForPlayer,
};

export default ScoreController;
