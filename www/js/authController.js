import {
  getSupabaseClient,
  getSupabaseInitializationError,
  isSupabaseEnabledInConfig,
  isSupabaseReady,
} from './supabaseClient.js';

const DEFAULT_STATE = Object.freeze({
  enabled: isSupabaseEnabledInConfig(),
  ready: false,
  loading: true,
  user: null,
  lastError: null,
});

const EMAIL_CONFIRMATION_MESSAGE = 'Vérifiez votre boîte mail pour confirmer votre inscription.';
const USERNAME_CONFLICT_MESSAGE = 'Ce pseudo est déjà utilisé. Merci d’en choisir un autre.';

function isUsernameConflictError(error) {
  if (!error) {
    return false;
  }
  const code = error.code ? String(error.code).toUpperCase() : '';
  if (code === '23505' || code === '409') {
    const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
    return message.includes('username') || message.includes('players_username_key');
  }
  const lower = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return lower.includes('username already')
    || lower.includes('username exist')
    || lower.includes('duplicate key value')
    || lower.includes('pseudo déjà pris');
}

function describeSupabaseError(error) {
  if (!error) {
    return 'Une erreur inattendue est survenue.';
  }
  if (isUsernameConflictError(error)) {
    return USERNAME_CONFLICT_MESSAGE;
  }
  const message = typeof error.message === 'string' ? error.message : '';
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'Email ou mot de passe incorrect.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Merci de confirmer votre email avant de vous connecter.';
  }
  if (lower.includes('user already registered') || lower.includes('already registered')) {
    return 'Un compte existe déjà avec cet email.';
  }
  if (lower.includes('password')) {
    return 'Mot de passe invalide (6 caractères minimum).';
  }
  if (lower.includes('too many requests')) {
    return 'Trop de tentatives. Réessayez dans quelques instants.';
  }
  return message || 'Opération impossible pour le moment.';
}

class AuthController {
  constructor() {
    this.supabase = null;
    this.listeners = new Set();
    this.state = { ...DEFAULT_STATE };
    this.authSubscription = null;
    this.init();
  }

  getState() {
    return { ...this.state };
  }

  onChange(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    this.listeners.add(listener);
    try {
      listener(this.getState());
    } catch (error) {
      console.error('[auth] listener execution failed', error);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(partial = {}) {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      try {
        listener(this.getState());
      } catch (error) {
        console.error('[auth] listener error', error);
      }
    }
  }

  async fetchUsernameForUser(userId) {
    if (!this.supabase || !userId) {
      return null;
    }
    try {
      const { data, error } = await this.supabase
        .from('players')
        .select('username')
        .eq('auth_user_id', userId)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      return data?.username || null;
    } catch (error) {
      console.warn('[auth] failed to load player username', { error, userId });
      return null;
    }
  }

  async enrichUserWithProfile(user, options = {}) {
    if (!user) {
      return null;
    }
    const enriched = { ...user };
    if (options.usernameHint) {
      enriched.username = options.usernameHint;
      return enriched;
    }
    const username = await this.fetchUsernameForUser(user.id);
    if (username) {
      enriched.username = username;
    }
    return enriched;
  }

  async init() {
    if (!this.state.enabled) {
      this.notify({ loading: false, ready: false });
      return;
    }

    try {
      const ready = await isSupabaseReady();
      if (!ready) {
        const initError = getSupabaseInitializationError();
        this.notify({
          loading: false,
          ready: false,
          lastError: initError?.message || 'Initialisation Supabase impossible.',
        });
        return;
      }

      this.supabase = await getSupabaseClient();
      if (!this.supabase) {
        this.notify({
          loading: false,
          ready: false,
          lastError: 'Client Supabase indisponible.',
        });
        return;
      }

      await this.hydrateCurrentUser();
      this.notify({ ready: true, loading: false, lastError: null });

      const { data } = this.supabase.auth.onAuthStateChange(async (_event, session) => {
        const user = session?.user || null;
        const enrichedUser = await this.enrichUserWithProfile(user);
        this.notify({ user: enrichedUser, ready: true, loading: false, lastError: null });
      });
      this.authSubscription = data;
    } catch (error) {
      console.error('[auth] init failed', error);
      this.notify({
        loading: false,
        ready: false,
        lastError: error?.message || 'Initialisation impossible.',
      });
    }
  }

  async hydrateCurrentUser() {
    if (!this.supabase) {
      return;
    }
    try {
      const { data, error } = await this.supabase.auth.getUser();
      if (error) {
        console.warn('[auth] getUser error', error);
        this.notify({ lastError: error.message });
        return;
      }
      const enrichedUser = await this.enrichUserWithProfile(data?.user || null);
      this.state.user = enrichedUser;
    } catch (error) {
      console.error('[auth] hydrate user failed', error);
    }
  }

  ensureAuthAvailable() {
    if (!this.state.enabled) {
      return { available: false, message: 'Authentification désactivée pour cette version.' };
    }
    if (!this.supabase) {
      return { available: false, message: 'Service d’authentification indisponible.' };
    }
    return { available: true };
  }

  async signIn({ email, password }) {
    const availability = this.ensureAuthAvailable();
    if (!availability.available) {
      return { success: false, message: availability.message };
    }
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { success: false, message: describeSupabaseError(error) };
      }
      const user = data?.user || null;
      const enrichedUser = await this.enrichUserWithProfile(user);
      if (enrichedUser) {
        this.notify({ user: enrichedUser, lastError: null });
      }
      return { success: true, user: enrichedUser };
    } catch (error) {
      console.error('[auth] signIn failed', error);
      return { success: false, message: 'Connexion impossible pour le moment.' };
    }
  }

  async signUp({ email, password, username }) {
    const availability = this.ensureAuthAvailable();
    if (!availability.available) {
      return { success: false, message: availability.message };
    }
    const trimmedUsername = typeof username === 'string' ? username.trim() : '';
    if (!trimmedUsername) {
      return { success: false, message: 'Pseudo requis.', reason: 'USERNAME_REQUIRED' };
    }
    try {
      const redirectTo = (() => {
        if (typeof window === 'undefined') {
          return undefined;
        }
        const { origin, pathname } = window.location || {};
        if (!origin) {
          return undefined;
        }
        return `${origin}${pathname || ''}`;
      })();
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { username: trimmedUsername },
        },
      });
      if (error) {
        console.error('[auth] signUp failed (supabase.auth.signUp)', { error });
        const usernameTaken = isUsernameConflictError(error);
        return {
          success: false,
          message: usernameTaken ? USERNAME_CONFLICT_MESSAGE : describeSupabaseError(error),
          reason: usernameTaken ? 'USERNAME_TAKEN' : undefined,
        };
      }
      const user = data?.user || null;
      const requiresEmailConfirmation = !data?.session;
      const enrichedUser = await this.enrichUserWithProfile(user, { usernameHint: trimmedUsername });
      if (enrichedUser && !requiresEmailConfirmation) {
        this.notify({ user: enrichedUser, lastError: null });
      }
      return {
        success: true,
        user: enrichedUser,
        requiresEmailConfirmation,
        message: requiresEmailConfirmation ? EMAIL_CONFIRMATION_MESSAGE : null,
      };
    } catch (error) {
      console.error('[auth] signUp unexpected failure', { error });
      return { success: false, message: 'Création de compte impossible pour le moment.' };
    }
  }

  async signOut() {
    const availability = this.ensureAuthAvailable();
    if (!availability.available) {
      return { success: false, message: availability.message };
    }
    try {
      const { error } = await this.supabase.auth.signOut();
      if (error) {
        return { success: false, message: describeSupabaseError(error) };
      }
      this.notify({ user: null, lastError: null });
      return { success: true };
    } catch (error) {
      console.error('[auth] signOut failed', error);
      return { success: false, message: 'Déconnexion impossible pour le moment.' };
    }
  }
}

const authController = new AuthController();

function buildFacade(controller) {
  return {
    getState: () => controller.getState(),
    onChange: (listener) => controller.onChange(listener),
    signIn: (payload) => controller.signIn(payload || {}),
    signUp: (payload) => controller.signUp(payload || {}),
    signOut: () => controller.signOut(),
  };
}

const facade = buildFacade(authController);

if (typeof window !== 'undefined') {
  window.SaltAuth = facade;
}

export const saltAuth = authController;
export default facade;
