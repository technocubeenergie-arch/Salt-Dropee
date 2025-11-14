import {
  getSupabaseClient,
  getSupabaseInitializationError,
  isSupabaseEnabledInConfig,
  isSupabaseReady,
} from './supabaseClient.js';

const STORAGE_KEYS = {
  profile: 'sd_profile',
  progress: 'sd_progress',
  scores: 'sd_scores',
};

function logInfo(message, ...args) {
  console.info(`[data] ${message}`, ...args);
}

function logError(message, error) {
  if (error) {
    console.error(`[data] ${message}`, error);
  } else {
    console.error(`[data] ${message}`);
  }
}

function hasLocalStorage() {
  try {
    return typeof window !== 'undefined' && 'localStorage' in window && window.localStorage !== null;
  } catch (error) {
    logError('Local storage not accessible.', error);
    return false;
  }
}

function readFromStorage(key, fallback = null) {
  if (!hasLocalStorage()) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    logError(`Unable to read key ${key} from local storage.`, error);
    return fallback;
  }
}

function writeToStorage(key, value) {
  if (!hasLocalStorage()) {
    return false;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    logError(`Unable to write key ${key} to local storage.`, error);
    return false;
  }
}

function removeFromStorage(key) {
  if (!hasLocalStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    logError(`Unable to remove key ${key} from local storage.`, error);
  }
}

function getStoredProfile() {
  return readFromStorage(STORAGE_KEYS.profile);
}

function storeProfile(profile) {
  if (!profile) {
    removeFromStorage(STORAGE_KEYS.profile);
    return;
  }
  writeToStorage(STORAGE_KEYS.profile, profile);
}

function ensureLocalProfile(username) {
  const existing = getStoredProfile();
  if (existing && existing.username === username) {
    return existing;
  }

  const profile = {
    id: existing?.id || generateLocalId(),
    username,
    source: 'local',
    createdAt: new Date().toISOString(),
  };
  storeProfile(profile);
  return profile;
}

function generateLocalId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `local-${crypto.randomUUID()}`;
    }
  } catch (error) {
    logError('Unable to generate UUID via crypto.', error);
  }
  return `local-${Math.random().toString(36).slice(2, 12)}`;
}

function getStoredProgress() {
  return readFromStorage(STORAGE_KEYS.progress);
}

function storeProgress(progress) {
  writeToStorage(STORAGE_KEYS.progress, progress);
}

function getStoredScores() {
  return readFromStorage(STORAGE_KEYS.scores, []);
}

function storeScores(scores) {
  writeToStorage(STORAGE_KEYS.scores, scores);
}

async function registerPlayer(username) {
  const trimmedUsername = (username || '').trim();
  if (!trimmedUsername) {
    return {
      success: false,
      error: 'Pseudo requis',
      reason: 'MISSING_USERNAME',
    };
  }

  let supabaseAvailable = false;
  try {
    supabaseAvailable = await isSupabaseReady();
    if (supabaseAvailable) {
      logInfo(
        'registerPlayer called while Supabase is ready – player rows are managed via auth triggers. Creating local shadow profile.'
      );
    }
  } catch (error) {
    logError('registerPlayer failed, switching to local fallback.', error);
  }

  const profile = ensureLocalProfile(trimmedUsername);
  const fallback = supabaseAvailable
    ? 'supabase-managed'
    : !isSupabaseEnabledInConfig()
      ? 'disabled'
      : getSupabaseInitializationError()
        ? 'init-error'
        : 'runtime-error';
  return {
    success: true,
    profileId: profile.id,
    username: profile.username,
    source: 'local',
    fallback,
  };
}

async function saveProgress(progressObj) {
  const progress = progressObj || {};
  const profile = getStoredProfile();
  if (!profile) {
    return {
      success: false,
      error: 'Aucun joueur enregistré',
      reason: 'NO_PROFILE',
    };
  }

  try {
    if (await isSupabaseReady()) {
      const supabase = await getSupabaseClient();
      const payload = {
        profile_id: profile.id,
        data: progress,
      };
      const { error } = await supabase
        .from('progress')
        .upsert(payload, { onConflict: 'profile_id' });

      if (error) {
        throw error;
      }
      storeProgress(progress);
      logInfo(`Progress saved remotely for profile ${profile.id}.`);
      return {
        success: true,
        progress,
        source: 'supabase',
      };
    }
  } catch (error) {
    logError('saveProgress failed, using local storage.', error);
  }

  storeProgress(progress);
  return {
    success: true,
    progress,
    source: 'local',
  };
}

async function loadProgress() {
  const profile = getStoredProfile();
  if (!profile) {
    return {
      success: true,
      progress: null,
      source: 'local',
    };
  }

  try {
    if (await isSupabaseReady()) {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase
        .from('progress')
        .select('data')
        .eq('profile_id', profile.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      const progress = data?.data ?? null;
      if (progress) {
        storeProgress(progress);
      }

      return {
        success: true,
        progress,
        source: 'supabase',
      };
    }
  } catch (error) {
    logError('loadProgress failed, reading from local storage.', error);
  }

  return {
    success: true,
    progress: getStoredProgress() || null,
    source: 'local',
  };
}

async function submitScore(level, score) {
  const profile = getStoredProfile();
  if (!profile) {
    return {
      success: false,
      error: 'Aucun joueur enregistré',
      reason: 'NO_PROFILE',
    };
  }

  const entry = {
    level: Number(level) || 0,
    score: Number(score) || 0,
    profileId: profile.id,
    username: profile.username,
    createdAt: new Date().toISOString(),
  };

  try {
    if (await isSupabaseReady()) {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.from('scores').insert({
        profile_id: profile.id,
        level: entry.level,
        score: entry.score,
      });

      if (error) {
        throw error;
      }

      logInfo(`Score submitted to Supabase for profile ${profile.id}.`);
      return {
        success: true,
        source: 'supabase',
        entry,
      };
    }
  } catch (error) {
    logError('submitScore failed, storing locally.', error);
  }

  const scores = getStoredScores();
  scores.push(entry);
  storeScores(scores);
  return {
    success: true,
    source: 'local',
    entry,
  };
}

async function getLeaderboard(level, limit = 50) {
  const parsedLevel = Number(level) || 0;
  const parsedLimit = Math.max(1, Math.min(Number(limit) || 50, 100));

  try {
    if (await isSupabaseReady()) {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase
        .from('leaderboard_top')
        .select('*')
        .eq('level', parsedLevel)
        .order('score', { ascending: false })
        .limit(parsedLimit);

      if (error) {
        throw error;
      }

      return {
        success: true,
        source: 'supabase',
        entries: Array.isArray(data) ? data : [],
      };
    }
  } catch (error) {
    logError('getLeaderboard failed, returning local results.', error);
  }

  const scores = getStoredScores();
  const filtered = scores
    .filter((item) => item.level === parsedLevel)
    .sort((a, b) => b.score - a.score)
    .slice(0, parsedLimit)
    .map((item, index) => ({
      rank: index + 1,
      username: item.username,
      score: item.score,
      level: item.level,
      profile_id: item.profileId,
      source: 'local',
      created_at: item.createdAt,
    }));

  return {
    success: true,
    source: 'local',
    entries: filtered,
  };
}

async function ping() {
  try {
    if (await isSupabaseReady()) {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase
        .from('players')
        .select('id')
        .limit(1);

      if (error) {
        throw error;
      }

      return {
        success: true,
        source: 'supabase',
        now: new Date().toISOString(),
        rows: Array.isArray(data) ? data.length : 0,
      };
    }
  } catch (error) {
    logError('ping failed, responding from local mode.', error);
  }

  return {
    success: true,
    source: 'local',
    now: new Date().toISOString(),
    message: isSupabaseEnabledInConfig()
      ? 'Supabase indisponible, mode local actif.'
      : 'Supabase désactivé, mode local actif.',
  };
}

const api = {
  registerPlayer,
  saveProgress,
  loadProgress,
  submitScore,
  getLeaderboard,
  ping,
};

if (typeof window !== 'undefined') {
  window.api = Object.assign({}, window.api || {}, api);
  logInfo('window.api initialised with data service functions.');
}

export {
  registerPlayer,
  saveProgress,
  loadProgress,
  submitScore,
  getLeaderboard,
  ping,
};

export default api;
