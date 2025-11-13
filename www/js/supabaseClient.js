import {
  SUPABASE_ANON_KEY,
  SUPABASE_ENABLED,
  SUPABASE_URL,
} from './config.remote.js';

let supabaseInstance = null;
let initializationError = null;

const initializationPromise = (async () => {
  if (!SUPABASE_ENABLED) {
    console.info('[data] Supabase disabled via configuration. Falling back to local storage.');
    return;
  }

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    console.info('[data] Supabase client initialised.');
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
