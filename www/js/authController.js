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
  profile: null,
  lastError: null,
});

const EMAIL_CONFIRMATION_MESSAGE = 'Vérifiez votre boîte mail pour confirmer votre inscription.';
const USERNAME_CONFLICT_MESSAGE = 'Ce pseudo est déjà utilisé. Merci d’en choisir un autre.';

function normalizeUsername(candidate) {
  if (typeof candidate !== 'string') {
    return '';
  }
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : '';
}

function mapProfileRow(row, fallbackUserId) {
  if (!row) {
    return null;
  }
  return {
    id: row.id || null,
    authUserId: row.auth_user_id || fallbackUserId || null,
    username: row.username || null,
    referralCode: row.referral_code || null,
  };
}

function collectErrorTexts(error) {
  if (!error) {
    return [];
  }

  const texts = [];
  const pushIfString = (value) => {
    if (typeof value === 'string' && value.trim()) {
      texts.push(value.toLowerCase());
    }
  };

  pushIfString(error.message);
  pushIfString(error.code);
  pushIfString(error.details);
  pushIfString(error.hint);

  const cause = error.cause;
  if (cause) {
    if (typeof cause === 'string') {
      pushIfString(cause);
    } else if (typeof cause === 'object') {
      texts.push(...collectErrorTexts(cause));
    }
  }

  return texts;
}

function isUsernameConflictError(error) {
  if (!error) {
    return false;
  }
  const code = error.code ? String(error.code).toUpperCase() : '';
  if (code === '23505' || code === '409') {
    const texts = collectErrorTexts(error);
    return texts.some((text) => text.includes('username') || text.includes('players_username_key'));
  }
  const texts = collectErrorTexts(error);
  return texts.some((text) =>
    text.includes('username already')
    || text.includes('username exist')
    || text.includes('duplicate key value')
    || text.includes('pseudo déjà pris')
    || text.includes('players_username_key')
  );
}

function describeSupabaseError(error) {
  if (!error) {
    return 'Une erreur inattendue est survenue.';
  }
  if (isUsernameConflictError(error)) {
    return USERNAME_CONFLICT_MESSAGE;
  }
  const texts = collectErrorTexts(error);
  const message = typeof error.message === 'string' ? error.message : '';
  const lower = (texts[0] || message || '').toLowerCase();
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
  if (lower.includes('row-level security policy')) {
    return 'Accès refusé. Merci de vous reconnecter.';
  }
  return message || texts.find(Boolean) || 'Opération impossible pour le moment.';
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

  async loadProfileForUser(userId) {
    if (!this.supabase || !userId) {
      return null;
    }
    try {
      const { data, error } = await this.supabase
        .from('players')
        .select('id, auth_user_id, username, referral_code')
        .eq('auth_user_id', userId)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      return mapProfileRow(data, userId);
    } catch (error) {
      console.error('[auth] loadProfile failed', error);
      return null;
    }
  }

  async ensureProfileForUser(user, options = {}) {
    if (!this.supabase || !user?.id) {
      return { profile: null, error: null };
    }

    const existingProfile = await this.loadProfileForUser(user.id);
    if (existingProfile) {
      return { profile: existingProfile, error: null };
    }

    const usernameHint = normalizeUsername(options.usernameHint)
      || normalizeUsername(user.username)
      || normalizeUsername(user.user_metadata?.username);
    const payload = { auth_user_id: user.id };
    if (usernameHint) {
      payload.username = usernameHint;
    }

    try {
      const { data, error } = await this.supabase
        .from('players')
        .upsert(payload, { onConflict: 'auth_user_id' })
        .select('id, auth_user_id, username, referral_code')
        .maybeSingle();

      if (error) {
        throw error;
      }

      return { profile: mapProfileRow(data, user.id), error: null };
    } catch (error) {
      console.error('[auth] ensureProfileForUser failed', {
        error,
        userId: user.id,
        usernameAttempt: payload.username,
      });
      return { profile: existingProfile, error };
    }
  }

  async enrichUserWithProfile(user, options = {}) {
    if (!user) {
      return null;
    }
    const enriched = { ...user };
    const usernameHint = normalizeUsername(options.usernameHint)
      || normalizeUsername(user.user_metadata?.username)
      || '';
    if (options.profile && options.profile.username && !enriched.username) {
      enriched.username = options.profile.username;
    }
    if (!enriched.username && usernameHint) {
      enriched.username = usernameHint;
    }
    if (!enriched.username) {
      const profile = await this.loadProfileForUser(user.id);
      if (profile?.username) {
        enriched.username = profile.username;
      }
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
        const { profile, error } = user ? await this.ensureProfileForUser(user) : { profile: null, error: null };
        if (error) {
          console.warn('[auth] profile sync during auth state change failed', error);
        }
        const enrichedUser = await this.enrichUserWithProfile(user, { profile });
        this.notify({ user: enrichedUser, profile, ready: true, loading: false, lastError: null });
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
      const user = data?.user || null;
      const { profile, error: profileError } = user ? await this.ensureProfileForUser(user) : { profile: null, error: null };
      if (profileError) {
        console.warn('[auth] profile hydration failed', profileError);
      }
      const enrichedUser = await this.enrichUserWithProfile(user, { profile });
      this.state.user = enrichedUser;
      this.state.profile = profile;
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
      const { profile, error: profileError } = user ? await this.ensureProfileForUser(user) : { profile: null, error: null };
      if (profileError) {
        console.warn('[auth] profile sync after signIn failed', profileError);
      }
      const enrichedUser = await this.enrichUserWithProfile(user, { profile });
      if (enrichedUser) {
        this.notify({ user: enrichedUser, profile, lastError: null });
      }
      return { success: true, user: enrichedUser };
    } catch (error) {
      console.error('[auth] signIn failed', error);
      return { success: false, message: 'Connexion impossible pour le moment.' };
    }
  }

  async checkUsernameAvailability(username) {
    if (!this.supabase || !username) {
      return { available: true };
    }
    try {
      const { data, error } = await this.supabase
        .from('players')
        .select('id')
        .eq('username', username)
        .limit(1);
      if (error) {
        throw error;
      }
      const taken = Array.isArray(data) && data.length > 0;
      return { available: !taken };
    } catch (error) {
      console.warn('[auth] username availability check failed', { error, username });
      return { available: true, skipped: true };
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
    const usernameAvailability = await this.checkUsernameAvailability(trimmedUsername);
    if (!usernameAvailability.available) {
      return { success: false, message: USERNAME_CONFLICT_MESSAGE, reason: 'USERNAME_TAKEN' };
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
        console.error('[auth] signUp failed (supabase.auth.signUp)', error);
        if (error?.cause) {
          console.error('[auth] signUp error cause (supabase.auth.signUp)', error.cause);
        }
        const usernameTaken = isUsernameConflictError(error);
        return {
          success: false,
          message: usernameTaken ? USERNAME_CONFLICT_MESSAGE : describeSupabaseError(error),
          reason: usernameTaken ? 'USERNAME_TAKEN' : undefined,
        };
      }
      const user = data?.user || null;
      const requiresEmailConfirmation = !data?.session;
      const hasSession = Boolean(data?.session?.access_token);
      const { profile, error: profileError } = user && hasSession
        ? await this.ensureProfileForUser(user, { usernameHint: trimmedUsername })
        : { profile: null, error: null };
      if (profileError) {
        const usernameTaken = isUsernameConflictError(profileError);
        return {
          success: false,
          message: usernameTaken ? USERNAME_CONFLICT_MESSAGE : describeSupabaseError(profileError),
          reason: usernameTaken ? 'USERNAME_TAKEN' : undefined,
        };
      }
      const enrichedUser = await this.enrichUserWithProfile(user, { profile, usernameHint: trimmedUsername });
      if (enrichedUser && !requiresEmailConfirmation) {
        this.notify({ user: enrichedUser, profile, lastError: null });
      }
      return {
        success: true,
        user: enrichedUser,
        requiresEmailConfirmation,
        message: requiresEmailConfirmation ? EMAIL_CONFIRMATION_MESSAGE : null,
      };
    } catch (error) {
      console.error('[auth] signUp unexpected failure', error);
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
      this.notify({ user: null, profile: null, lastError: null });
      return { success: true };
    } catch (error) {
      console.error('[auth] signOut failed', error);
      return { success: false, message: 'Déconnexion impossible pour le moment.' };
    }
  }

  async forceLocalSignOut(options = {}) {
    const reason = typeof options.reason === 'string' && options.reason.trim()
      ? options.reason.trim()
      : 'local-forced';
    try {
      if (this.supabase?.auth && typeof this.supabase.auth.signOut === 'function') {
        await this.supabase.auth.signOut({ scope: 'local' });
      }
    } catch (error) {
      console.warn('[auth] local-only signOut cleanup failed', error);
    }
    this.notify({ user: null, profile: null, lastError: null });
    return { success: true, forced: true, reason };
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
    forceLocalSignOut: (payload) => controller.forceLocalSignOut(payload || {}),
  };
}

const facade = buildFacade(authController);

if (typeof window !== 'undefined') {
  window.SaltAuth = facade;
}

export const saltAuth = authController;
export default facade;
