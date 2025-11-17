import {
  getSupabaseClient,
  isSupabaseEnabledInConfig,
  isSupabaseReady,
} from './supabaseClient.js';
import authFacade, { saltAuth } from './authController.js';

// Le tableau "progress" de Supabase est sécurisé par RLS :
// l'accès passe uniquement via player_id et Supabase vérifie que
// players.auth_user_id correspond à auth.uid().
// Ce contrôleur ne fait donc rien si Supabase est désactivé ou si
// aucun joueur connecté n'est disponible.

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
      console.warn('[progress] failed to read auth state from window', error);
    }
  }
  return null;
}

async function getSupabaseContext() {
  if (!isSupabaseEnabledInConfig()) {
    return { enabled: false };
  }

  const ready = await isSupabaseReady();
  if (!ready) {
    return { enabled: false };
  }

  const supabase = await getSupabaseClient();
  const authState = getAuthSnapshot();
  const playerId = authState?.profile?.id || null;
  const user = authState?.user || null;

  if (!supabase || !playerId || !user) {
    return { enabled: false };
  }

  return { enabled: true, supabase, playerId };
}

async function loadProgress() {
  try {
    const context = await getSupabaseContext();
    if (!context.enabled) {
      return null;
    }

    const { supabase, playerId } = context;
    const { data, error } = await supabase
      .from('progress')
      .select('level, score, lives, time_left, state, updated_at')
      .eq('player_id', playerId)
      // on lit toujours la ligne la plus récente
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('[progress] load failed', error);
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      level: data.level ?? null,
      score: data.score ?? null,
      lives: data.lives ?? null,
      timeLeft: data.time_left ?? null,
      state: data.state ?? null,
      updatedAt: data.updated_at || null,
    };
  } catch (error) {
    console.warn('[progress] unexpected load error', error);
    return null;
  }
}

async function saveProgress(snapshot = {}) {
  try {
    const context = await getSupabaseContext();
    if (!context.enabled) {
      return null;
    }

    const { supabase, playerId } = context;
    const payload = {
      player_id: playerId,
      level: snapshot.level ?? null,
      score: snapshot.score ?? null,
      lives: snapshot.lives ?? null,
      time_left: snapshot.timeLeft ?? null,
      state: snapshot.state ?? null,
    };

    const { error } = await supabase
      .from('progress')
      .insert(payload);

    if (error) {
      console.warn('[progress] save failed', { error, payload });
      return null;
    }

    return payload;
  } catch (error) {
    console.warn('[progress] unexpected save error', error);
    return null;
  }
}

const ProgressController = {
  loadProgress,
  saveProgress,
};

if (typeof window !== 'undefined') {
  window.ProgressController = ProgressController;
}

export default ProgressController;
