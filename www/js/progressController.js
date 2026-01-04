import {
  getSupabaseClient,
  isSupabaseEnabledInConfig,
  isSupabaseReady,
} from './supabaseClient.js';
import authFacade, { saltAuth } from './authController.js';

const LOCAL_STORAGE_KEY = 'sd_progress_snapshot';
const progressLogger = (window.SD_LOG?.createLogger
  ? window.SD_LOG.createLogger('progress')
  : null) || null;
const logInfo = (...args) => (progressLogger?.info ? progressLogger.info(...args) : undefined);
const logWarn = (...args) => (progressLogger?.warn ? progressLogger.warn(...args) : console.warn?.(...args));
const logError = (...args) => (progressLogger?.error ? progressLogger.error(...args) : console.error?.(...args));

const RETRY_DELAYS_MS = [500, 1000, 2000];

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

function getErrorDescription(error) {
  if (!error) return 'unknown';
  if (error.message) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch (_) {
    return String(error);
  }
}

function normalizeStatus(value) {
  if (value === 0) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTransientSupabaseError(error) {
  if (!error) return false;
  const status = normalizeStatus(error.status || error.code);
  if (status !== null) {
    if (status === 408) return true; // request timeout
    if (status === 0) return true; // network failure
    if (status >= 500) return true; // server side/transient
    if (status >= 400 && status < 500) return false; // logical/auth/permission issues
  }

  const code = typeof error.code === 'string' ? error.code : null;
  if (code === 'PGRST116') {
    return false; // aucune ligne, pas une erreur réseau
  }

  const message = getErrorDescription(error).toLowerCase();
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('abort') ||
    message.includes('connection')
  ) {
    return true;
  }

  if (error.name === 'TypeError') {
    return true; // souvent "Failed to fetch"
  }

  return false;
}

async function withSupabaseRetry(operationName, operation) {
  let attempt = 0;
  let lastError = null;

  while (attempt < RETRY_DELAYS_MS.length) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      if (!isTransientSupabaseError(error)) {
        throw error;
      }
      lastError = error;
      const nextDelay = attempt < RETRY_DELAYS_MS.length
        ? RETRY_DELAYS_MS[attempt - 1]
        : null;
      logInfo?.(`[progress] ${operationName} attempt ${attempt} failed`, {
        reason: getErrorDescription(error),
        nextDelayMs: attempt >= RETRY_DELAYS_MS.length ? null : nextDelay,
      });
      if (!nextDelay) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, nextDelay));
    }
  }

  throw lastError;
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
    const { data } = await withSupabaseRetry('load', async () => {
      const result = await supabase
        .from('progress')
        .select('level, score, state, updated_at')
        .eq('player_id', playerId)
        // on lit toujours la ligne la plus récente
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (result.error && result.error.code !== 'PGRST116') {
        throw result.error;
      }

      return result;
    });

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
    logWarn?.('[progress] unexpected load error', error);
    const fallback = readLocalSnapshot();
    const fallbackReason = isTransientSupabaseError(error) ? 'supabase-transient-error' : 'supabase-error';
    return {
      snapshot: fallback,
      source: fallback ? 'local' : 'none',
      reason: fallbackReason,
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

    await withSupabaseRetry('save', async () => {
      const { error } = await supabase
        .from('progress')
        .upsert(payload, { onConflict: 'player_id' });

      if (error) {
        throw error;
      }
    });

    return { source: 'supabase', snapshot: payload };
  } catch (error) {
    logWarn?.('[progress] unexpected save error', error);
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
