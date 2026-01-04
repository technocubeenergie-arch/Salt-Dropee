import {
  getSupabaseClient,
  isSupabaseEnabledInConfig,
  isSupabaseReady,
} from './supabaseClient.js';
import authFacade, { saltAuth } from './authController.js';

const scoreLogger = (typeof window !== 'undefined' && window.SD_LOG?.createLogger)
  ? window.SD_LOG.createLogger('score')
  : null;
const logDebug = (...args) => (scoreLogger?.debug ? scoreLogger.debug(...args) : console.debug?.(...args));
const logInfo = (...args) => (scoreLogger?.info ? scoreLogger.info(...args) : console.info?.(...args));
const logWarn = (...args) => (scoreLogger?.warn ? scoreLogger.warn(...args) : console.warn?.(...args));
const logError = (...args) => (scoreLogger?.error ? scoreLogger.error(...args) : console.error?.(...args));

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
      logWarn?.('[score] failed to read auth state from window', error);
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

function isTransientSupabaseError(error) {
  if (!error) {
    return false;
  }

  const status = Number(error.status ?? error.statusCode);
  if (Number.isFinite(status) && (status === 408 || status === 429 || status >= 500)) {
    return true;
  }

  const code = typeof error.code === 'string' ? error.code.toUpperCase() : '';
  const transientCodes = new Set(['ETIMEDOUT', 'ECONNABORTED', 'FETCH_ERROR', 'NETWORK_ERROR']);
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

function wait(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, delayMs));
  });
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
    const transient = isTransientSupabaseError(opError);
    const retryDelay = transient && attempt < maxAttempts ? baseDelayMs * 2 ** (attempt - 1) : null;

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

    const supabase = await getSupabase();
    if (!supabase) {
      logInfo?.('[score] submitLegendScore skipped', { reason: 'notReady' });
      return { success: false, reason: 'NOT_READY' };
    }

    const authState = getAuthSnapshot();
    const user = authState?.user || null;
    const resolvedPlayerId = playerId || authState?.profile?.id || null;

    if (!user || !user.id || !resolvedPlayerId) {
      logInfo?.('[score] submitLegendScore skipped', {
        reason: 'missingAuth',
        hasUser: Boolean(user?.id),
        playerId: resolvedPlayerId,
      });
      return { success: false, reason: 'MISSING_AUTH' };
    }

    const numericScore = coerceScore(score);

    if (!Number.isFinite(numericScore) || numericScore <= 0) {
      logInfo?.('[score] submitLegendScore skipped', { reason: 'invalidScore', score });
      return { success: false, reason: 'INVALID_SCORE' };
    }
    const durationPayload = Number.isFinite(durationSeconds)
      ? Math.max(0, Math.floor(durationSeconds))
      : null;

    logInfo?.('[score] legend score write starting', {
      playerId: resolvedPlayerId,
      score: numericScore,
      durationSeconds: durationPayload,
    });

    const { data: existingBest, error: selectError } = await supabase
      .from('scores')
      .select('id, score')
      .eq('player_id', resolvedPlayerId)
      .eq('level', 6)
      .order('score', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (selectError && selectError.code !== 'PGRST116') {
      logWarn?.('[score] read best legend score failed', describeError(selectError));
      // continue and try insert anyway
    } else if (!existingBest) {
      logInfo?.('[score] no existing legend score found for player');
    } else {
      logInfo?.('[score] existing legend score for player', {
        id: existingBest?.id || null,
        bestScore: coerceScore(existingBest.score),
      });
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

      logInfo?.('[score] new legend score > existing, updating', {
        score: numericScore,
        existing: bestScore,
      });

      const updateResult = await executeLegendScoreRequest(
        'update-legend-score',
        () =>
          supabase
            .from('scores')
            .update({
              score: numericScore,
              duration_seconds: durationPayload,
            })
            .eq('id', existingBest.id)
            .eq('player_id', resolvedPlayerId)
            .eq('level', 6)
      );

      if (updateResult?.error) {
        logWarn?.(
          '[score] submit score failed after retries',
          describeError(updateResult.finalError || updateResult.error)
        );
        return { success: false, reason: updateResult.error.code || 'UPDATE_FAILED' };
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
      logWarn?.(
        '[score] submit score failed after retries',
        describeError(insertResult.finalError || insertResult.error)
      );
      return { success: false, reason: insertResult.error.code || 'INSERT_FAILED' };
    }

    logInfo?.('[score] legend best score inserted', {
      score: numericScore,
      attempts: insertResult?.attempts || 1,
    });

    return { success: true, payload };
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

    const { data, error } = await supabase
      .from('leaderboard_top')
      .select('level, username, best_score, player_id')
      .eq('level', 6)
      .order('best_score', { ascending: false })
      .limit(finalLimit);

    if (error) {
      logWarn?.('[score] fetchLegendTop failed', describeError(error));
      return { entries: [], error };
    }

    return { entries: Array.isArray(data) ? data : [], error: null };
  } catch (error) {
    logWarn?.('[score] unexpected fetchLegendTop error', error);
    return { entries: [], error };
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
      logWarn?.('[score] fetchMyLegendRank best score failed', describeError(bestError));
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
      logWarn?.('[score] fetchMyLegendRank rank query failed', describeError(rankError));
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
    logWarn?.('[score] unexpected fetchMyLegendRank error', error);
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
      logWarn?.('[score] fetchLegendReferralCounts failed', describeError(error));
      return { rows: [], error };
    }

    return { rows: Array.isArray(data) ? data : [], error: null };
  } catch (error) {
    logWarn?.('[score] unexpected fetchLegendReferralCounts error', error);
    return { rows: [], error };
  }
}

const ScoreController = {
  submitLegendScore,
  fetchLegendTop,
  fetchMyLegendRank,
  fetchLegendReferralCounts,
};

if (typeof window !== 'undefined') {
  window.ScoreController = ScoreController;
}

export {
  submitLegendScore,
  fetchLegendTop,
  fetchMyLegendRank,
  fetchLegendReferralCounts,
};

export default ScoreController;
