import {
  SUPABASE_ANON_KEY,
  SUPABASE_ENABLED,
  SUPABASE_URL,
} from './config.remote.js';

const SUPABASE_MODULE_SOURCES = [
  { url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm', label: 'jsdelivr-+esm' },
  { url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/esm/index.js', label: 'jsdelivr-esm' },
  { url: 'https://unpkg.com/@supabase/supabase-js@2.45.4/dist/esm/index.js', label: 'unpkg-esm' },
  { url: 'https://esm.sh/@supabase/supabase-js@2', label: 'esm.sh' },
];

let supabaseInstance = null;
let initializationError = null;

async function loadSupabaseModule() {
  let lastError = null;

  for (const source of SUPABASE_MODULE_SOURCES) {
    try {
      const module = await import(/* webpackIgnore: true */ source.url);
      console.info(`[data] Supabase module loaded from ${source.label}.`);
      return { module, source };
    } catch (error) {
      lastError = error;
      console.warn(`[data] Failed to load Supabase module from ${source.label}`, error);
    }
  }

  const aggregatedError = new Error('Unable to load supabase-js from configured sources');
  aggregatedError.cause = lastError;
  throw aggregatedError;
}

const initializationPromise = (async () => {
  if (!SUPABASE_ENABLED) {
    console.info('[data] Supabase disabled via configuration. Falling back to local storage.');
    return;
  }

  try {
    const { module, source } = await loadSupabaseModule();
    const { createClient } = module || {};
    if (typeof createClient !== 'function') {
      throw new Error('supabase-js module does not expose createClient');
    }

    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    console.info(`[data] Supabase client initialised via ${source?.label || 'unknown source'}.`);
  } catch (error) {
    initializationError = error;
    console.error('[data] Failed to initialise Supabase client:', error);
  }
})();

export async function getSupabaseClient() {
  await initializationPromise;
  return supabaseInstance;
}

export async function isSupabaseReady() {
  await initializationPromise;
  return Boolean(SUPABASE_ENABLED && supabaseInstance && !initializationError);
}

export function getSupabaseInitializationError() {
  return initializationError;
}

export function isSupabaseEnabledInConfig() {
  return SUPABASE_ENABLED;
}
