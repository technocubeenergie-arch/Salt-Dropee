(function initUiCore(global) {
  const SD_UI_CORE = global.SD_UI_CORE || {};

  let titleAccountAnchor = null;
  let pendingBadgeCount = 0;
  let pendingBadgeInitialized = false;
  let noticeTimer = null;
  let noticeEl = null;

  function getWrapper() {
    return typeof document !== 'undefined' ? document.getElementById('gameWrapper') : null;
  }

  function getOrCreateNoticeElement() {
    if (noticeEl && noticeEl.isConnected) return noticeEl;
    const wrapper = getWrapper();
    if (!wrapper) return null;
    const el = document.createElement('div');
    el.id = 'globalNotice';
    el.className = 'global-notice';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    wrapper.appendChild(el);
    noticeEl = el;
    return el;
  }

  function showTransientNotice(text, options = {}) {
    const el = getOrCreateNoticeElement();
    if (!el) return;
    const variant = typeof options.variant === 'string' ? options.variant : 'info';
    const durationMs = Number.isFinite(options.durationMs) ? options.durationMs : 3600;
    el.textContent = text || '';
    el.dataset.variant = variant;
    el.hidden = false;
    el.classList.add('is-visible');
    if (noticeTimer) {
      clearTimeout(noticeTimer);
    }
    noticeTimer = setTimeout(() => {
      el.classList.remove('is-visible');
      el.hidden = true;
    }, Math.max(1200, durationMs));
  }

  function applyPendingBadgeState(target) {
    if (!target) return;
    const hasPending = pendingBadgeCount > 0;
    const dot = target.querySelector('[data-pending-badge-dot]');
    const baseLabel = target.dataset.baseLabel || target.textContent?.trim() || '';
    target.dataset.baseLabel = baseLabel;
    target.dataset.pendingCount = hasPending ? String(pendingBadgeCount) : '';
    target.dataset.hasPending = hasPending ? 'yes' : 'no';
    if (dot) {
      dot.hidden = !hasPending;
      dot.textContent = hasPending ? String(pendingBadgeCount) : '';
      dot.setAttribute('aria-hidden', hasPending ? 'false' : 'true');
      dot.setAttribute('title', hasPending ? `${pendingBadgeCount} score(s) en attente` : '');
    }
    if (hasPending && baseLabel) {
      target.setAttribute('aria-label', `${baseLabel} (scores en attente)`);
    } else if (baseLabel) {
      target.setAttribute('aria-label', baseLabel);
    }
  }

  function refreshPendingBadges() {
    if (typeof document === 'undefined') return;
    const targets = document.querySelectorAll('[data-pending-badge="legend"]');
    targets.forEach((el) => applyPendingBadgeState(el));
  }

  function setPendingBadgeCount(count = 0) {
    const normalized = Math.max(0, Number(count) || 0);
    pendingBadgeCount = normalized;
    refreshPendingBadges();
  }

  function initPendingBadgeListeners() {
    if (pendingBadgeInitialized) return;
    pendingBadgeInitialized = true;
    const scoreService = typeof global.ScoreController === 'object' ? global.ScoreController : null;
    if (scoreService?.getPendingLegendScoreCount) {
      setPendingBadgeCount(scoreService.getPendingLegendScoreCount());
    }
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('sd:pending-legend-scores-changed', (event) => {
        const count = Number(event?.detail?.count ?? pendingBadgeCount) || 0;
        setPendingBadgeCount(count);
      });
    }
    if (scoreService?.onPendingLegendScoresChange) {
      scoreService.onPendingLegendScoresChange((count) => setPendingBadgeCount(count));
    }
  }

  function getOrCreateTitleAccountAnchor() {
    if (typeof document === 'undefined') return null;
    if (titleAccountAnchor && titleAccountAnchor.isConnected) return titleAccountAnchor;
    const wrapper = getWrapper();
    if (!wrapper) return null;
    const anchor = document.createElement('div');
    anchor.id = 'titleAccountAnchor';
    anchor.className = 'title-account-anchor title-account-bar account-status-wrapper';
    anchor.innerHTML = `
      <div class="title-account-card">
        <span id="titleAccountStatus" class="title-account-status">Connexion en cours…</span>
        <button id="btnAccount" type="button" class="title-account-button" data-pending-badge="legend">
          <span class="btn-label">Compte</span>
          <span class="pending-badge-dot" data-pending-badge-dot aria-hidden="true"></span>
        </button>
      </div>`;
    wrapper.appendChild(anchor);
    titleAccountAnchor = anchor;
    refreshPendingBadges();
    return anchor;
  }

  function setTitleAccountAnchorVisible(isVisible = false) {
    const anchor = titleAccountAnchor || (isVisible ? getOrCreateTitleAccountAnchor() : null);
    if (!anchor) return;
    anchor.classList.toggle('is-visible', Boolean(isVisible));
  }

  SD_UI_CORE.getOrCreateTitleAccountAnchor = getOrCreateTitleAccountAnchor;
  SD_UI_CORE.setTitleAccountAnchorVisible = setTitleAccountAnchorVisible;
  SD_UI_CORE.showTransientNotice = showTransientNotice;
  SD_UI_CORE.refreshPendingBadges = refreshPendingBadges;

  global.SD_UI_CORE = SD_UI_CORE;

  initPendingBadgeListeners();
})(typeof window !== 'undefined' ? window : globalThis);
