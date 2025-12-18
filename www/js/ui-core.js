(function initUiCore(global) {
  const SD_UI_CORE = global.SD_UI_CORE || {};

  let titleAccountAnchor = null;

  function getOrCreateTitleAccountAnchor() {
    if (typeof document === 'undefined') return null;
    if (titleAccountAnchor && titleAccountAnchor.isConnected) return titleAccountAnchor;
    const wrapper = document.getElementById('gameWrapper');
    if (!wrapper) return null;
    const anchor = document.createElement('div');
    anchor.id = 'titleAccountAnchor';
    anchor.className = 'title-account-anchor title-account-bar account-status-wrapper';
    anchor.innerHTML = `
      <div class="title-account-card">
        <span id="titleAccountStatus" class="title-account-status">Connexion en cours…</span>
        <button id="btnAccount" type="button" class="title-account-button">Compte</button>
      </div>`;
    wrapper.appendChild(anchor);
    titleAccountAnchor = anchor;
    return anchor;
  }

  function setTitleAccountAnchorVisible(isVisible = false) {
    const anchor = titleAccountAnchor || (isVisible ? getOrCreateTitleAccountAnchor() : null);
    if (!anchor) return;
    anchor.classList.toggle('is-visible', Boolean(isVisible));
  }

  SD_UI_CORE.getOrCreateTitleAccountAnchor = getOrCreateTitleAccountAnchor;
  SD_UI_CORE.setTitleAccountAnchorVisible = setTitleAccountAnchorVisible;

  global.SD_UI_CORE = SD_UI_CORE;
})(typeof window !== 'undefined' ? window : globalThis);
