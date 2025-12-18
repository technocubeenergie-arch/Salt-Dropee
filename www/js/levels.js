// ================================
// Salt Droppee — niveaux & assets
// ================================

(function initLevelsModule(global){
  if (!global) return;

  const config = global.SD_CONFIG || {};
  const LEVELS = config.LEVELS || global.LEVELS || [];
  const LEGEND_LEVEL_INDEX = Number.isFinite(config.LEGEND_LEVEL_INDEX)
    ? config.LEGEND_LEVEL_INDEX
    : (Number.isFinite(global.LEGEND_LEVEL_INDEX) ? global.LEGEND_LEVEL_INDEX : -1);

  // --- Cache d'assets par niveau ---
  const levelAssets = {}; // index -> { bg:Image, wallet:Image, music:HTMLAudioElement|null }

  // Précharge et renvoie {bg, wallet, music}
  function preloadLevelAssets(levelCfg) {
    const tasks = [];

    // Image de fond
    const bg = new Image();
    bg.src = levelCfg.background;
    tasks.push(new Promise(res => { bg.onload = res; bg.onerror = res; }));

    // Image de wallet
    const wallet = new Image();
    wallet.src = levelCfg.walletSprite;
    tasks.push(new Promise(res => { wallet.onload = res; wallet.onerror = res; }));

    // Musique (préparée mais non jouée ici)
    let music = null;
    if (levelCfg.music) {
      music = new Audio(levelCfg.music);
      music.loop = true;
      music.preload = "auto";
      tasks.push(Promise.resolve());
    }

    return Promise.all(tasks).then(() => ({ bg, wallet, music }));
  }

  async function ensureLevelAssets(index) {
    if (!levelAssets[index]) {
      const levelCfg = LEVELS[index];
      if (!levelCfg) return { bg: null, wallet: null, music: null };
      levelAssets[index] = await preloadLevelAssets(levelCfg);
    }
    return levelAssets[index];
  }

  function waitForImageReady(img) {
    if (!img) return Promise.resolve();

    if (img.complete && img.naturalWidth > 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const done = () => resolve();

      if (img.complete) {
        resolve();
        return;
      }

      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  }

  // --- Wallet ---
  let walletImage = null;

  const legendWalletSrc = LEGEND_LEVEL_INDEX >= 0 ? LEVELS[LEGEND_LEVEL_INDEX]?.walletSprite : null;
  const legendWalletImage = legendWalletSrc ? (() => {
    const img = new Image();
    img.src = legendWalletSrc;
    img.decode?.().catch(() => {});
    return img;
  })() : null;

  function setWalletSprite(img, options = {}) {
    if (!img) return;
    walletImage = img;

    const { skipAnimation = false } = options;

    const runtimeWallet = (typeof global !== 'undefined' && global.wallet)
      ? global.wallet
      : (typeof global.game !== 'undefined' ? global.game?.wallet : null);

    if (runtimeWallet?.applyCaps) {
      runtimeWallet.applyCaps();
    }

    if (skipAnimation || !global.gsap || !runtimeWallet) return;

    if (Object.prototype.hasOwnProperty.call(runtimeWallet, 'visualScale')) {
      runtimeWallet.visualScale = 1;
      global.gsap.fromTo(runtimeWallet, { visualScale: 0.95 }, { visualScale: 1, duration: 0.25, ease: "back.out(2)" });
    } else {
      global.gsap.fromTo(runtimeWallet, { scale: 0.95 }, { scale: 1, duration: 0.25, ease: "back.out(2)" });
    }
  }

  async function applyWalletForLevel(levelNumber) {
    const numeric = Math.floor(Number(levelNumber) || 1);
    const index = Math.max(0, Math.min(LEVELS.length - 1, numeric - 1));
    const assets = await ensureLevelAssets(index);
    if (assets.wallet) {
      setWalletSprite(assets.wallet);
    }
    return assets;
  }

  function getWalletImage() {
    return walletImage;
  }

  function getLegendWalletImage() {
    return legendWalletImage;
  }

  const exported = {
    LEVELS,
    LEGEND_LEVEL_INDEX,
    levelAssets,
    preloadLevelAssets,
    ensureLevelAssets,
    waitForImageReady,
    setWalletSprite,
    applyWalletForLevel,
    getWalletImage,
    getLegendWalletImage,
  };

  global.SD_LEVELS = exported;
  Object.assign(global, exported);
})(window);
