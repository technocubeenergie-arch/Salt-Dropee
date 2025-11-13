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

function describeSupabaseError(error) {
  if (!error) {
    return 'Une erreur inattendue est survenue.';
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

      const { data } = this.supabase.auth.onAuthStateChange((_event, session) => {
        const user = session?.user || null;
        this.notify({ user, ready: true, loading: false, lastError: null });
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
      this.state.user = data?.user || null;
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
      if (user) {
        this.notify({ user, lastError: null });
      }
      return { success: true, user };
    } catch (error) {
      console.error('[auth] signIn failed', error);
      return { success: false, message: 'Connexion impossible pour le moment.' };
    }
  }

  async signUp({ email, password }) {
    const availability = this.ensureAuthAvailable();
    if (!availability.available) {
      return { success: false, message: availability.message };
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
        },
      });
      if (error) {
        return { success: false, message: describeSupabaseError(error) };
      }
      const requiresEmailConfirmation = !data?.session;
      const user = data?.user || null;
      if (user && !requiresEmailConfirmation) {
        this.notify({ user, lastError: null });
      }
      return {
        success: true,
        user,
        requiresEmailConfirmation,
        message: requiresEmailConfirmation ? EMAIL_CONFIRMATION_MESSAGE : null,
      };
    } catch (error) {
      console.error('[auth] signUp failed', error);
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
