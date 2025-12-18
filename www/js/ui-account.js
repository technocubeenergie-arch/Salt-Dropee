(function initUiAccount(global) {
  const SD_UI_ACCOUNT = global.SD_UI_ACCOUNT || {};

  const {
    LOGOUT_WATCHDOG_TIMEOUT_MS = 0,
  } = global.SD_CONFIG || {};

  const {
    setTitleAccountAnchorVisible = () => {},
    getOrCreateTitleAccountAnchor = () => null,
  } = global.SD_UI_CORE || {};

  const {
    addEvent = () => {},
    INPUT = {},
  } = global.SD_INPUT || {};

  const {
    showExclusiveOverlay = () => {},
  } = global.SD_RENDER || {};

  const {
    updateInterLevelSaveButtonState = () => {},
  } = global.SD_UI_OVERLAYS || {};

  const {
    syncProgressFromAuthState = () => {},
  } = global.SD_PROGRESS || {};

  const DEFAULT_AUTH_FRONT_STATE = Object.freeze({
    enabled: false,
    ready: false,
    loading: true,
    user: null,
    profile: null,
    lastError: null,
  });

  const HTML_ESCAPE_LOOKUP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const EMAIL_VALIDATION_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
  const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,15}$/;
  const REFERRAL_URL_PARAM = 'ref';

  let authState = { ...DEFAULT_AUTH_FRONT_STATE };
  let authFacade = null;
  let authUnsubscribe = null;
  let authBridgeAttempts = 0;
  let authBridgeTimer = null;
  let logoutInFlight = false;
  let logoutWatchdogTimer = null;

  function getAuthService() {
    if (authFacade) return authFacade;
    if (typeof global !== 'undefined' && global.SaltAuth) {
      authFacade = global.SaltAuth;
    }
    return authFacade;
  }

  function getReferralService() {
    if (typeof global !== 'undefined' && global.ReferralController) {
      return global.ReferralController;
    }
    if (typeof global !== 'undefined' && typeof global.getReferralService === 'function') {
      try {
        return global.getReferralService();
      } catch (error) {
        console.warn('[referral] failed to read service from window', error);
      }
    }
    return null;
  }

  function escapeHtml(value) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPE_LOOKUP[char] || char);
  }

  function isValidEmail(value) {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    return trimmed.length > 3 && EMAIL_VALIDATION_PATTERN.test(trimmed);
  }

  function isValidPassword(value) {
    return typeof value === 'string' && value.length >= 6;
  }

  function isValidUsername(value) {
    if (typeof value !== 'string') {
      return false;
    }
    const trimmed = value.trim();
    return USERNAME_PATTERN.test(trimmed);
  }

  function getAuthStateSnapshot() {
    return authState;
  }

  function normalizeReferralCodeFromInput(code) {
    if (typeof code !== 'string') return '';
    const trimmed = code.trim();
    return trimmed ? trimmed.toUpperCase() : '';
  }

  function reconcilePendingReferralCode(state) {
    const referralService = getReferralService();
    if (!referralService || typeof referralService.getPendingReferralCode !== 'function') return;
    const pending = referralService.getPendingReferralCode();
    const hasReferrer = !!state?.profile?.referredBy;
    if (pending && hasReferrer && typeof referralService.setPendingReferralCode === 'function') {
      referralService.setPendingReferralCode(null);
    }
  }

  function captureReferralCodeFromUrl() {
    if (typeof global === 'undefined') return null;
    try {
      const url = new URL(global.location.href);
      const refFromUrl = url.searchParams.get(REFERRAL_URL_PARAM);
      const normalized = normalizeReferralCodeFromInput(refFromUrl);
      if (!normalized) {
        return null;
      }

      const state = getAuthStateSnapshot();
      if (state?.profile?.referredBy) {
        return null;
      }

      const referralService = getReferralService();
      if (referralService?.setPendingReferralCode) {
        referralService.setPendingReferralCode(normalized);
        console.info(`[referral] captured code from URL: ${normalized}`);
      }

      return normalized;
    } catch (error) {
      console.warn('[referral] failed to read referral code from URL', error);
      return null;
    }
  }

  function handleAuthStateUpdate(nextState) {
    authState = { ...DEFAULT_AUTH_FRONT_STATE, ...(nextState || {}) };
    reconcilePendingReferralCode(authState);
    updateTitleAccountStatus();
    refreshAccountPanelIfVisible();
    syncProgressFromAuthState(authState);
    updateInterLevelSaveButtonState();
  }

  function tryConnectAuthFacade() {
    if (authFacade || typeof global === 'undefined') return;
    const candidate = global.SaltAuth;
    if (candidate && typeof candidate.onChange === 'function') {
      authFacade = candidate;
      if (typeof candidate.getState === 'function') {
        try {
          authState = { ...DEFAULT_AUTH_FRONT_STATE, ...candidate.getState() };
        } catch (error) {
          console.warn('[auth] failed to read initial state', error);
        }
      }
      authUnsubscribe = candidate.onChange(handleAuthStateUpdate);
      syncProgressFromAuthState(authState);
      updateTitleAccountStatus();
      return;
    }
    if (authBridgeAttempts > 20) {
      return;
    }
    authBridgeAttempts += 1;
    if (authBridgeTimer) {
      clearTimeout(authBridgeTimer);
    }
    authBridgeTimer = setTimeout(tryConnectAuthFacade, 350);
  }

  function updateTitleAccountStatus() {
    if (typeof global.document === 'undefined') return;
    const statusEl = global.document.getElementById('titleAccountStatus');
    const buttonEl = global.document.getElementById('btnAccount');
    if (!statusEl && !buttonEl) return;
    const state = getAuthStateSnapshot();
    const username = state?.profile?.username || state?.user?.username || '';
    let statusText = 'Connexion en cours…';
    if (!state.enabled && !state.loading) {
      statusText = 'Compte indisponible';
    } else if (state.user) {
      statusText = username || 'Connecté';
    } else if (state.ready) {
      statusText = 'Non connecté';
    } else if (state.lastError) {
      statusText = 'Service indisponible';
    }
    if (statusEl) {
      statusEl.textContent = statusText;
    }
    if (buttonEl) {
      buttonEl.dataset.accountState = state.user ? 'signed-in' : 'signed-out';
      buttonEl.disabled = false;
    }
  }

  function refreshAccountPanelIfVisible() {
    const overlayEl = typeof global.document !== 'undefined'
      ? global.document.getElementById('overlay')
      : null;
    if (!overlayEl || typeof overlayEl.querySelector !== 'function') return;
    const isAccountPanel = overlayEl.querySelector('[data-account-panel]');
    if (!isAccountPanel) return;
    const instance = (typeof global.Game !== 'undefined' && global.Game.instance)
      ? global.Game.instance
      : null;
    if (!instance || typeof instance.renderAccountPanel !== 'function') return;
    instance.renderAccountPanel({ keepMode: true });
  }

  function bindTitleAccountButton(options = {}) {
    const onOpenAccount = typeof options.onOpenAccount === 'function'
      ? options.onOpenAccount
      : () => {};
    const playSound = typeof options.playSound === 'function' ? options.playSound : () => {};
    const accountAnchor = getOrCreateTitleAccountAnchor();
    const accountBtn = typeof global.document !== 'undefined'
      ? global.document.getElementById('btnAccount')
      : null;
    if (accountBtn) {
      if (!accountBtn.dataset.titleAccountBound) {
        addEvent(accountBtn, INPUT.tap, (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          playSound("click");
          onOpenAccount();
        }, { passive: false });
        accountBtn.dataset.titleAccountBound = 'true';
      }
      if (accountAnchor) {
        accountAnchor.classList.add('is-ready');
      }
    }
    updateTitleAccountStatus();
  }

  async function renderAccountPanel(options = {}) {
    const overlay = options.overlay
      || (typeof global.document !== 'undefined' ? global.document.getElementById('overlay') : null);
    if (!overlay) return;
    const playSound = typeof options.playSound === 'function' ? options.playSound : () => {};
    const setActiveScreen = typeof options.setActiveScreen === 'function'
      ? options.setActiveScreen
      : () => {};
    const accountFlashMessage = options.accountFlashMessage || null;
    const clearAccountFlashMessage = typeof options.clearAccountFlashMessage === 'function'
      ? options.clearAccountFlashMessage
      : () => {};
    const setAccountFlashMessage = typeof options.setAccountFlashMessage === 'function'
      ? options.setAccountFlashMessage
      : () => {};
    const setAccountMode = typeof options.setAccountMode === 'function'
      ? options.setAccountMode
      : () => {};
    const onReturnToTitle = typeof options.onReturnToTitle === 'function'
      ? options.onReturnToTitle
      : () => {};
    const onRerender = typeof options.onRerender === 'function'
      ? options.onRerender
      : () => {};
    const logLogoutClickIgnored = typeof options.logLogoutClickIgnored === 'function'
      ? options.logLogoutClickIgnored
      : () => {};
    const currentScreen = options.activeScreen;
    const watchdogMs = Number.isFinite(options.LOGOUT_WATCHDOG_TIMEOUT_MS)
      ? options.LOGOUT_WATCHDOG_TIMEOUT_MS
      : LOGOUT_WATCHDOG_TIMEOUT_MS;

    const service = getAuthService();
    let mode = options.keepMode
      ? (options.accountMode || 'signin')
      : (options.mode === 'signup' ? 'signup' : options.mode === 'signin' ? 'signin' : (options.accountMode || 'signin'));
    if (!mode) {
      mode = 'signin';
    }
    setAccountMode(mode);
    overlay.classList.remove('overlay-title', 'overlay-rules');
    overlay.innerHTML = `
      <div class="panel panel-shell account-panel" role="dialog" aria-modal="true" aria-labelledby="accountTitle" data-account-panel="true">
        <div class="panel-header">
          <h1 id="accountTitle"></h1>
          <p class="panel-subtitle">Gestion du profil et des récompenses.</p>
        </div>
        <div class="panel-grid account-panel-body" data-account-body></div>
        <div class="panel-footer">
          <p class="account-message" data-account-message role="status" aria-live="polite"></p>
        </div>
      </div>`;
    showExclusiveOverlay(overlay);
    setActiveScreen('account', { via: 'renderAccountPanel', mode });
    const state = getAuthStateSnapshot();
    const body = overlay.querySelector('[data-account-body]');
    const messageEl = overlay.querySelector('[data-account-message]');
    const titleEl = overlay.querySelector('#accountTitle');

    const setAccountTitle = (text = '') => {
      if (!titleEl) return;
      titleEl.textContent = text || '';
    };

    setAccountTitle(state?.profile?.username || 'Compte');

    const setMessage = (text = '', variant = 'info') => {
      if (!messageEl) return;
      messageEl.textContent = text || '';
      messageEl.classList.remove('is-error', 'is-success');
      if (variant === 'error') messageEl.classList.add('is-error');
      if (variant === 'success') messageEl.classList.add('is-success');
    };

    if (accountFlashMessage) {
      setMessage(accountFlashMessage.text, accountFlashMessage.variant || 'info');
      clearAccountFlashMessage();
    }

    const wireCloseButtons = () => {
      const closeButtons = overlay.querySelectorAll('[data-account-close]');
      closeButtons.forEach((btn) => {
        addEvent(btn, INPUT.tap, (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          playSound("click");
          onReturnToTitle();
        }, { passive: false });
      });
    };

    if (!state.enabled) {
      if (body) {
        body.innerHTML = `
          <section class="panel-section panel-card">
            <h2 class="panel-title">Service indisponible</h2>
            <p>Le service de compte est désactivé sur cette version.</p>
          </section>
          <div class="panel-footer">
            <div class="btnrow panel-actions"><button type="button" data-account-close>Retour</button></div>
          </div>`;
      }
      setMessage('Authentification indisponible.', 'error');
      wireCloseButtons();
      return;
    }

    if (!state.ready) {
      if (body) {
        body.innerHTML = `
          <section class="panel-section panel-card">
            <h2 class="panel-title">Connexion en cours</h2>
            <p>Connexion au service d’authentification…</p>
          </section>
          <div class="panel-footer">
            <div class="btnrow panel-actions"><button type="button" data-account-close>Retour</button></div>
          </div>`;
      }
      if (state.lastError) {
        setMessage(state.lastError, 'error');
      } else {
        setMessage('Initialisation en cours…', 'info');
      }
      wireCloseButtons();
      return;
    }

    if (state.user) {
      let referralStats = { ok: true, creditedCount: 0 };
      const referralService = getReferralService();
      if (referralService && typeof referralService.fetchReferralStatsForCurrentPlayer === 'function') {
        try {
          const result = await referralService.fetchReferralStatsForCurrentPlayer();
          if (result) {
            referralStats = result;
          }
        } catch (error) {
          console.warn('[referral] failed to fetch referral stats for account panel', error);
        }
      }

      const creditedCount = referralStats?.ok ? Math.max(0, referralStats.creditedCount || 0) : 0;
      const referralStatsLine = referralStats?.ok
        ? (creditedCount > 0
          ? `<p class="account-field-note account-field-readonly">Tu as déjà parrainé ${creditedCount === 1 ? '1 joueur.' : `${creditedCount} joueurs.`}</p>`
          : '<p class="account-field-note account-field-readonly account-referral-empty">Tu n’as pas encore parrainé de joueur.</p>')
        : '';

      const profileUsername = state.profile?.username || '';
      const safeProfileUsername = escapeHtml(profileUsername);
      const safeUsername = escapeHtml(state.user.username || '');
      const safeEmail = escapeHtml(state.user.email || '');
      const accountTitle = profileUsername || state.user.username || state.user.email || 'Compte';
      setAccountTitle(accountTitle);
      const pendingReferralCode = !state.profile?.referredBy && referralService?.getPendingReferralCode
        ? referralService.getPendingReferralCode()
        : null;
      const referralCodeRaw = state.profile?.referralCode || '';
      const referralLink = `${global.location.origin}${global.location.pathname}${referralCodeRaw ? `?${REFERRAL_URL_PARAM}=${encodeURIComponent(referralCodeRaw)}` : ''}`;
      const safeReferralLink = escapeHtml(referralLink);
      const referralCopyButton = referralCodeRaw
        ? `<div class="btnrow panel-actions account-referral-actions account-referral-copy">\n                <button type="button" class="btn btn-secondary" data-referral-copy>Copier le lien</button>\n              </div>`
        : '';
      const referralSection = `
          <div class="account-referral-section panel-grid">
            <div class="panel-section panel-card account-referral-link-block">
              <h2 class="panel-title">🔗 Mon lien de parrainage</h2>
              <p class="account-field-note account-field-readonly account-referral-link">${safeReferralLink}</p>
              ${referralCopyButton}
            </div>
            <div class="panel-section panel-card account-referral-stats">
              <h2 class="panel-title">👥 Mes filleuls</h2>
              ${referralStatsLine}
            </div>
            <div class="panel-section panel-card account-referral-redeem">
              <h2 class="panel-title">🎁 Utiliser un code de parrainage</h2>
              ${state.profile?.referredBy
                ? '<p class="account-field-note account-field-readonly">Ton code de parrainage a bien été pris en compte.</p>'
                : `<label class="panel-field">Code de parrainage (optionnel)
                    <input type="text" name="referralCode" data-referral-input autocomplete="off" spellcheck="false" maxlength="24" value="${escapeHtml(pendingReferralCode || '')}" />
                  </label>
                  <div class="btnrow panel-actions account-referral-actions">
                    <button type="button" data-referral-submit>Valider</button>
                  </div>
                  <p class="account-field-note account-field-error" data-referral-feedback role="status" aria-live="polite"></p>`}
            </div>
          </div>`;
      if (body) {
        body.innerHTML = `
          ${referralSection}
          <div class="panel-footer">
            <div class="btnrow panel-actions">
              <button type="button" id="btnAccountSignOut">Se déconnecter</button>
              <button type="button" data-account-close>Fermer</button>
            </div>
          </div>`;
      }
      wireCloseButtons();
      const signOutBtn = global.document?.getElementById('btnAccountSignOut');
      if (signOutBtn) {
        addEvent(signOutBtn, INPUT.tap, async (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          playSound("click");
          signOutBtn.disabled = true;

          if (logoutInFlight) {
            logLogoutClickIgnored('in-flight', { screen: currentScreen });
            signOutBtn.disabled = false;
            return;
          }

          const liveService = getAuthService();
          if (!liveService || typeof liveService.signOut !== 'function') {
            logLogoutClickIgnored('service-unavailable', { screen: currentScreen });
            setMessage('Service indisponible.', 'error');
            signOutBtn.disabled = false;
            return;
          }

          logoutInFlight = true;
          if (logoutWatchdogTimer) {
            clearTimeout(logoutWatchdogTimer);
            logoutWatchdogTimer = null;
          }
          setMessage('Déconnexion en cours…');

          try {
            const timeoutToken = Symbol('logout-timeout');
            const signOutPromise = liveService.signOut();
            const watchdogPromise = new Promise((resolve) => {
              logoutWatchdogTimer = setTimeout(() => {
                console.warn('[auth] logout watchdog triggered after timeout');
                setMessage('Déconnexion trop longue. Réessayez.', 'error');
                logoutWatchdogTimer = null;
                resolve(timeoutToken);
              }, watchdogMs);
            });

            const result = await Promise.race([signOutPromise, watchdogPromise]);
            if (result === timeoutToken) {
              if (typeof liveService.forceLocalSignOut === 'function') {
                try {
                  await liveService.forceLocalSignOut({ reason: 'watchdog-timeout' });
                } catch (error) {
                  console.warn('[auth] local logout fallback failed', error);
                }
              }
              if (signOutPromise && typeof signOutPromise.then === 'function') {
                signOutPromise
                  .then((lateResult) => {
                    if (lateResult?.success) {
                      console.info('[auth] remote signOut confirmed after local fallback');
                    } else if (lateResult) {
                      console.warn('[auth] remote signOut reported failure after local fallback', lateResult);
                    }
                  })
                  .catch((error) => console.warn('[auth] remote signOut rejected after local fallback', error));
              }
              console.warn('[auth] Supabase signOut not confirmed in time. Forced local logout.');
              return;
            }

            if (!result?.success) {
              setMessage(result?.message || 'Déconnexion impossible.', 'error');
            } else if (typeof onRerender === 'function') {
              await onRerender({ mode: 'signin' });
            }
          } catch (error) {
            console.error('[auth] logout handler failed', error);
            setMessage('Déconnexion impossible pour le moment.', 'error');
          } finally {
            logoutInFlight = false;
            if (logoutWatchdogTimer) {
              clearTimeout(logoutWatchdogTimer);
              logoutWatchdogTimer = null;
            }
            signOutBtn.disabled = false;
          }
        }, { passive: false });
      }

      const referralInput = overlay.querySelector('[data-referral-input]');
      const referralSubmit = overlay.querySelector('[data-referral-submit]');
      const referralFeedback = overlay.querySelector('[data-referral-feedback]');
      const setReferralFeedback = (text = '', variant = 'info') => {
        if (!referralFeedback) return;
        referralFeedback.textContent = text || '';
        referralFeedback.classList.remove('is-error', 'is-success');
        if (variant === 'error') referralFeedback.classList.add('is-error');
        if (variant === 'success') referralFeedback.classList.add('is-success');
      };

      if (referralSubmit) {
        addEvent(referralSubmit, INPUT.tap, async (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          playSound("click");

          const serviceRef = getReferralService();
          if (!serviceRef || typeof serviceRef.applyReferralCode !== 'function') {
            setMessage('Service de parrainage indisponible.', 'error');
            return;
          }

          const clearPendingReferral = () => {
            if (serviceRef?.setPendingReferralCode) {
              serviceRef.setPendingReferralCode(null);
            }
            if (referralInput) {
              referralInput.value = '';
            }
          };

          const currentAuthState = getAuthStateSnapshot();
          const alreadyReferred = !!currentAuthState?.profile?.referredBy;

          if (alreadyReferred) {
            setMessage('Un code de parrainage est déjà associé à ton compte.', 'error');
            setReferralFeedback('Tu ne peux pas appliquer un second code.', 'error');
            clearPendingReferral();
            return;
          }

          const rawCode = (referralInput?.value || '').trim();
          setReferralFeedback('');
          setMessage('Vérification du code…');

          referralSubmit.disabled = true;
          if (referralInput) referralInput.disabled = true;

          try {
            const result = await serviceRef.applyReferralCode({ code: rawCode });
            if (!result?.ok) {
              switch (result?.reason) {
                case 'EMPTY_CODE':
                  setMessage('Merci de saisir un code avant de valider.', 'error');
                  setReferralFeedback('Code manquant.', 'error');
                  break;
                case 'CODE_NOT_FOUND':
                  setMessage('Ce code de parrainage est invalide.', 'error');
                  setReferralFeedback('Code invalide ou inexistant.', 'error');
                  clearPendingReferral();
                  break;
                case 'SELF_REFERRAL_NOT_ALLOWED':
                  setMessage('Tu ne peux pas utiliser ton propre code.', 'error');
                  setReferralFeedback('Choisis le code d’un autre joueur.', 'error');
                  break;
                case 'ALREADY_REFERRED':
                  setMessage('Un code de parrainage est déjà associé à ton compte.', 'error');
                  setReferralFeedback('Tu ne peux pas appliquer un second code.', 'error');
                  clearPendingReferral();
                  break;
                case 'AUTH_REQUIRED':
                  setMessage('Connexion requise pour appliquer un code.', 'error');
                  setReferralFeedback('Reconnecte-toi puis réessaie.', 'error');
                  break;
                default:
                  setMessage('Impossible d’appliquer le code pour le moment.', 'error');
                  setReferralFeedback('Réessaie dans quelques instants.', 'error');
                  console.warn('[referral] applyReferralCode failed', result);
                  break;
              }
              return;
            }

            setAccountFlashMessage({ text: 'Code de parrainage appliqué avec succès 🎉', variant: 'success' });

            setReferralFeedback('Code appliqué avec succès.', 'success');

            const liveService = getAuthService();
            if (liveService?.refreshProfile) {
              await liveService.refreshProfile();
            } else if (typeof serviceRef.refreshProfileSnapshotFromSupabase === 'function') {
              await serviceRef.refreshProfileSnapshotFromSupabase();
            }

            onRerender({ keepMode: true });
          } catch (error) {
            console.warn('[referral] applyReferralCode handler failed', error);
            setMessage('Code impossible à valider pour le moment.', 'error');
            setReferralFeedback('Réessaie dans quelques instants.', 'error');
          } finally {
            referralSubmit.disabled = false;
            if (referralInput) referralInput.disabled = false;
          }
        }, { passive: false });
      }

      const referralCopyButtonEl = overlay.querySelector('[data-referral-copy]');
      if (referralCopyButtonEl && referralLink) {
        addEvent(referralCopyButtonEl, INPUT.tap, async (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          playSound("click");

          const showCopyError = (error) => {
            console.warn('[referral] clipboard copy failed', error);
            setMessage('Impossible de copier le lien pour le moment.', 'error');
          };

          const showCopySuccess = () => {
            setMessage('Lien de parrainage copié dans le presse-papiers ✅', 'success');
          };

          if (!referralLink) {
            showCopyError(new Error('referral link unavailable'));
            return;
          }

          try {
            if (global.navigator?.clipboard?.writeText) {
              await global.navigator.clipboard.writeText(referralLink);
              showCopySuccess();
              return;
            }

            const textarea = global.document.createElement('textarea');
            textarea.value = referralLink;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            global.document.body.appendChild(textarea);

            textarea.select();
            textarea.setSelectionRange(0, referralLink.length);

            const succeeded = global.document.execCommand && global.document.execCommand('copy');
            global.document.body.removeChild(textarea);

            if (succeeded) {
              showCopySuccess();
            } else {
              showCopyError(new Error('execCommand copy failed'));
            }
          } catch (error) {
            showCopyError(error);
          }
        }, { passive: false });
      }
      return;
    }

    if (body) {
      body.innerHTML = `
        <section class="panel-section panel-card account-auth-card">
          <div class="account-auth-header">
            <h2 class="panel-title">${mode === 'signup' ? 'Créer un compte' : 'Connexion'}</h2>
            <p class="panel-subline">${mode === 'signup' ? 'Crée ton profil pour sauvegarder tes progrès.' : 'Connecte-toi pour retrouver tes scores.'}</p>
          </div>
          <form class="account-form" data-account-form novalidate>
            <label>Adresse e-mail
              <input type="email" name="email" required autocomplete="email" inputmode="email" />
            </label>
            ${mode === 'signup' ? `
            <label>Pseudo
              <input type="text" name="username" required minlength="3" maxlength="15" autocomplete="username" spellcheck="false" />
              <p class="account-field-note account-field-error" data-account-username-error role="status" aria-live="polite" hidden></p>
            </label>` : ''}
            <label>Mot de passe
              <input type="password" name="password" required minlength="6" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" />
            </label>
            ${mode === 'signup' ? `
            <label>Confirmer le mot de passe
              <input type="password" name="confirmPassword" required minlength="6" autocomplete="new-password" />
            </label>` : ''}
            <div class="btnrow account-button-row">
              <button type="submit" data-account-submit>${mode === 'signup' ? 'Créer mon compte' : 'Se connecter'}</button>
              <button type="button" data-account-close>Retour</button>
            </div>
            <button type="button" class="account-switch" data-account-switch>
              ${mode === 'signup' ? 'Déjà un compte ? Se connecter' : 'Pas encore de compte ? S’inscrire'}
            </button>
          </form>
        </section>`;
    }
    wireCloseButtons();
    const form = overlay.querySelector('[data-account-form]');
    const switchBtn = overlay.querySelector('[data-account-switch]');
    const submitBtn = overlay.querySelector('[data-account-submit]');
    const usernameErrorEl = overlay.querySelector('[data-account-username-error]');
    const setUsernameError = (message = '') => {
      if (!usernameErrorEl) return;
      usernameErrorEl.textContent = message;
      if (message) {
        usernameErrorEl.hidden = false;
      } else {
        usernameErrorEl.hidden = true;
      }
    };
    setUsernameError('');
    const formInputs = form ? Array.from(form.querySelectorAll('input')) : [];
    const toggleFormDisabled = (disabled) => {
      formInputs.forEach((input) => { input.disabled = disabled; });
      if (submitBtn) submitBtn.disabled = disabled;
      if (switchBtn) switchBtn.disabled = disabled;
    };

    setMessage('Connectez-vous pour sauvegarder vos progrès.', 'info');

    if (switchBtn) {
      addEvent(switchBtn, INPUT.tap, (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        playSound("click");
        setAccountMode(mode === 'signup' ? 'signin' : 'signup');
        onRerender({ keepMode: true });
      }, { passive: false });
    }

    if (form) {
      addEvent(form, 'submit', async (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        if (!service) {
          setMessage('Service indisponible.', 'error');
          return;
        }
        const formData = new FormData(form);
        const email = String(formData.get('email') || '').trim();
        const password = String(formData.get('password') || '');
        const confirmPassword = mode === 'signup' ? String(formData.get('confirmPassword') || '') : '';
        const username = mode === 'signup' ? String(formData.get('username') || '').trim() : '';
        if (!isValidEmail(email)) {
          setMessage('Merci de saisir un email valide.', 'error');
          return;
        }
        if (!isValidPassword(password)) {
          setMessage('Mot de passe trop court (6 caractères minimum).', 'error');
          return;
        }
        if (mode === 'signup' && !isValidUsername(username)) {
          setUsernameError('Choisissez un pseudo de 3 à 15 caractères (lettres, chiffres ou _).');
          setMessage('Pseudo invalide.', 'error');
          return;
        }
        if (mode === 'signup' && password !== confirmPassword) {
          setMessage('Les mots de passe ne correspondent pas.', 'error');
          return;
        }
        if (mode === 'signup') {
          setUsernameError('');
        }
        playSound("click");
        toggleFormDisabled(true);
        setMessage(mode === 'signup' ? 'Création du compte…' : 'Connexion…');
        try {
          const action = mode === 'signup' ? service.signUp : service.signIn;
          const payload = mode === 'signup' ? { email, password, username } : { email, password };
          const result = await action(payload);
          if (!result?.success) {
            setMessage(result?.message || 'Opération impossible.', 'error');
            if (mode === 'signup') {
              if (result?.reason === 'USERNAME_TAKEN') {
                setUsernameError(result?.message || 'Ce pseudo est déjà utilisé.');
              } else {
                setUsernameError('');
              }
            }
            return;
          }
          if (result.requiresEmailConfirmation) {
            setMessage(result.message || 'Vérifiez votre email pour confirmer votre compte.', 'success');
            if (mode === 'signup') {
              setUsernameError('');
            }
          } else {
            setMessage('Connexion réussie.', 'success');
            if (typeof onRerender === 'function') {
              await onRerender({ keepMode: true });
            }
          }
        } catch (error) {
          console.error('[auth] form submit failed', error);
          setMessage('Une erreur inattendue est survenue.', 'error');
        } finally {
          toggleFormDisabled(false);
        }
      }, { passive: false });
    }
  }

  SD_UI_ACCOUNT.DEFAULT_AUTH_FRONT_STATE = DEFAULT_AUTH_FRONT_STATE;
  SD_UI_ACCOUNT.getAuthStateSnapshot = getAuthStateSnapshot;
  SD_UI_ACCOUNT.captureReferralCodeFromUrl = captureReferralCodeFromUrl;
  SD_UI_ACCOUNT.tryConnectAuthFacade = tryConnectAuthFacade;
  SD_UI_ACCOUNT.handleAuthStateUpdate = handleAuthStateUpdate;
  SD_UI_ACCOUNT.updateTitleAccountStatus = updateTitleAccountStatus;
  SD_UI_ACCOUNT.refreshAccountPanelIfVisible = refreshAccountPanelIfVisible;
  SD_UI_ACCOUNT.renderAccountPanel = renderAccountPanel;
  SD_UI_ACCOUNT.bindTitleAccountButton = bindTitleAccountButton;
  SD_UI_ACCOUNT.getReferralService = getReferralService;

  global.SD_UI_ACCOUNT = SD_UI_ACCOUNT;
})(typeof window !== 'undefined' ? window : globalThis);
