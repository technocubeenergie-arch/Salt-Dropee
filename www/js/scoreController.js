import {
  getSupabaseClient,
  isSupabaseEnabledInConfig,
  isSupabaseReady,
} from './supabaseClient.js';
import authFacade, { saltAuth } from './authController.js';

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
      console.warn('[score] failed to read auth state from window', error);
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

async function submitLegendScore({ playerId, score, durationSeconds, level } = {}) {
  try {
    console.info('[score] submitLegendScore called', { playerId, score, durationSeconds, level });

    if (Number.isFinite(level) && Math.floor(level) !== 6) {
      console.info('[score] submitLegendScore skipped', { reason: 'notLegendLevel', level });
      return { success: false, reason: 'NOT_LEGEND_LEVEL' };
    }

    if (!isSupabaseEnabledInConfig()) {
      console.info('[score] submitLegendScore skipped', { reason: 'disabled' });
      return { success: false, reason: 'DISABLED' };
    }

    const supabase = await getSupabase();
    if (!supabase) {
      console.info('[score] submitLegendScore skipped', { reason: 'notReady' });
      return { success: false, reason: 'NOT_READY' };
    }

    const authState = getAuthSnapshot();
    const user = authState?.user || null;
    const resolvedPlayerId = playerId || authState?.profile?.id || null;

    if (!user || !user.id || !resolvedPlayerId) {
      console.info('[score] submitLegendScore skipped', {
        reason: 'missingAuth',
        hasUser: Boolean(user?.id),
        playerId: resolvedPlayerId,
      });
      return { success: false, reason: 'MISSING_AUTH' };
    }

    const numericScore = coerceScore(score);

    if (!Number.isFinite(numericScore) || numericScore <= 0) {
      console.info('[score] submitLegendScore skipped', { reason: 'invalidScore', score });
      return { success: false, reason: 'INVALID_SCORE' };
    }
    const durationPayload = Number.isFinite(durationSeconds)
      ? Math.max(0, Math.floor(durationSeconds))
      : null;

    console.info('[score] legend score write starting', {
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
      console.warn('[score] read best legend score failed', describeError(selectError));
      // continue and try insert anyway
    } else if (!existingBest) {
      console.info('[score] no existing legend score found for player');
    } else {
      console.info('[score] existing legend score for player', {
        id: existingBest?.id || null,
        bestScore: coerceScore(existingBest.score),
      });
    }

    const bestScore = coerceScore(existingBest?.score);
    const hasExistingBest = Number.isFinite(bestScore);

    if (existingBest && hasExistingBest) {
      if (numericScore <= bestScore) {
        console.info('[score] new legend score <= existing, keeping existing', {
          score: numericScore,
          existing: bestScore,
        });
        return { success: true, skipped: true, payload: { score: numericScore, bestScore } };
      }

      console.info('[score] new legend score > existing, updating', {
        score: numericScore,
        existing: bestScore,
      });

      const { error: updateError } = await supabase
        .from('scores')
        .update({
          score: numericScore,
          duration_seconds: durationPayload,
        })
        .eq('id', existingBest.id)
        .eq('player_id', resolvedPlayerId)
        .eq('level', 6);

      if (updateError) {
        console.warn('[score] update best legend score failed', describeError(updateError));
        return { success: false, reason: updateError.code || 'UPDATE_FAILED' };
      }

      console.info('[score] legend best score updated', { score: numericScore });

      return { success: true, payload: { ...existingBest, score: numericScore, duration_seconds: durationPayload } };
    }

    const payload = {
      player_id: resolvedPlayerId,
      level: 6,
      score: numericScore,
      duration_seconds: durationPayload,
    };

    const { error } = await supabase.from('scores').insert(payload);

    if (error) {
      console.warn('[score] insert legend score failed', describeError(error));
      return { success: false, reason: error.code || 'INSERT_FAILED' };
    }

    console.info('[score] legend best score inserted', { score: numericScore });

    return { success: true, payload };
  } catch (error) {
    console.error('[score] unexpected submitLegendScore error', error);
    return { success: false, reason: 'UNEXPECTED_ERROR' };
  }
}

async function fetchLegendTop(limit = 5) {
  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return { entries: [], error: 'NOT_READY' };
    }

    const finalLimit = Math.max(1, Math.min(Number(limit) || 5, 25));

    const { data, error } = await supabase
      .from('leaderboard_top')
      .select('level, username, best_score, player_id')
      .eq('level', 6)
      .order('best_score', { ascending: false })
      .limit(finalLimit);

    if (error) {
      console.warn('[score] fetchLegendTop failed', describeError(error));
      return { entries: [], error };
    }

    return { entries: Array.isArray(data) ? data : [], error: null };
  } catch (error) {
    console.warn('[score] unexpected fetchLegendTop error', error);
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
      console.warn('[score] fetchMyLegendRank best score failed', describeError(bestError));
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
      console.warn('[score] fetchMyLegendRank rank query failed', describeError(rankError));
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
    console.warn('[score] unexpected fetchMyLegendRank error', error);
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
      console.warn('[score] fetchLegendReferralCounts failed', describeError(error));
      return { rows: [], error };
    }

    return { rows: Array.isArray(data) ? data : [], error: null };
  } catch (error) {
    console.warn('[score] unexpected fetchLegendReferralCounts error', error);
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
