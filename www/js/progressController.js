import {
  getSupabaseClient,
  isSupabaseEnabledInConfig,
  isSupabaseReady,
} from './supabaseClient.js';
import authFacade, { saltAuth } from './authController.js';

const LOCAL_STORAGE_KEY = 'sd_progress_snapshot';

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

function hasLocalStorage() {
  try {
    return typeof window !== 'undefined' && window.localStorage;
  } catch (error) {
    console.warn('[progress] local storage unavailable', { error });
    return false;
  }
}

function readLocalSnapshot() {
  if (!hasLocalStorage()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('[progress] failed to read local snapshot', { error });
    return null;
  }
}

function writeLocalSnapshot(snapshot) {
  if (!hasLocalStorage()) {
    return;
  }
  try {
    if (!snapshot) {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('[progress] failed to persist local snapshot', { error });
  }
}

async function getSupabaseContext() {
  if (!isSupabaseEnabledInConfig()) {
    return { enabled: false, reason: 'config-disabled' };
  }

  const ready = await isSupabaseReady();
  if (!ready) {
    return { enabled: false, reason: 'not-ready' };
  }

  const supabase = await getSupabaseClient();
  const authState = getAuthSnapshot();
  const playerId = authState?.profile?.id || null;
  const user = authState?.user || null;

  if (!supabase || !playerId || !user) {
    return {
      enabled: false,
      reason: 'auth-missing',
      authState,
    };
  }

  return { enabled: true, supabase, playerId, authState };
}

async function loadProgress() {
  try {
    const context = await getSupabaseContext();
    if (!context.enabled) {
      const fallback = readLocalSnapshot();
      if (fallback) {
        console.info('[progress] using local snapshot fallback', {
          source: 'localStorage',
          reason: context.reason || 'unknown',
        });
      }
      return {
        snapshot: fallback,
        source: fallback ? 'local' : 'none',
        reason: context.reason || 'supabase-unavailable',
      };
    }

    const { supabase, playerId } = context;
    const { data, error } = await supabase
      .from('progress')
      .select('level, score, state, updated_at')
      .eq('player_id', playerId)
      // on lit toujours la ligne la plus récente
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('[progress] load failed', {
        source: 'supabase',
        code: error.code,
        message: error.message,
      });
      const fallback = readLocalSnapshot();
      return {
        snapshot: fallback,
        source: fallback ? 'local' : 'none',
        reason: 'supabase-error',
      };
    }

    if (!data) {
      return {
        snapshot: null,
        source: 'supabase',
        reason: 'no-remote-data',
      };
    }

    const snapshot = {
      level: data.level ?? null,
      score: data.score ?? null,
      state: data.state ?? null,
      updatedAt: data.updated_at || null,
    };

    writeLocalSnapshot(snapshot);

    return {
      snapshot,
      source: 'supabase',
      reason: 'ok',
    };
  } catch (error) {
    console.warn('[progress] unexpected load error', error);
    const fallback = readLocalSnapshot();
    return {
      snapshot: fallback,
      source: fallback ? 'local' : 'none',
      reason: 'unexpected-error',
    };
  }
}

async function saveProgress(snapshot = {}) {
  try {
    const context = await getSupabaseContext();
    writeLocalSnapshot(snapshot);

    if (!context.enabled) {
      return { source: 'local', snapshot };
    }

    const { supabase, playerId } = context;
    const payload = {
      player_id: playerId,
      level: snapshot.level ?? null,
      score: snapshot.score ?? null,
      state: snapshot.state ?? null,
    };

    const { error } = await supabase
      .from('progress')
      .upsert(payload, { onConflict: 'player_id' });

    if (error) {
      console.warn('[progress] save failed', {
        error: { message: error.message, code: error.code, details: error.details },
        payload,
      });
      return { source: 'local', snapshot };
    }

    return { source: 'supabase', snapshot: payload };
  } catch (error) {
    console.warn('[progress] unexpected save error', error);
    return { source: 'local', snapshot };
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
