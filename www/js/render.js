// Rendu & helpers visuels pour Salt Droppee
(function initRenderModule(global) {
  if (!global) return;

  const utils = global.SD_UTILS || {};
  const clamp = typeof utils.clamp === 'function' ? utils.clamp : (n, a, b) => Math.max(a, Math.min(b, n));
  const hudFontSize = typeof utils.hudFontSize === 'function' ? utils.hudFontSize : (() => 0);
  const formatScore = typeof utils.formatScore === 'function' ? utils.formatScore : ((v) => String(v ?? ''));

  const config = global.SD_CONFIG || {};
  const HUD_CONFIG = config.HUD_CONFIG || global.HUD_CONFIG || {};
  const portraitBase = config.CONFIG?.portraitBase || config.portraitBase || {};
  const BASE_W = portraitBase.w || global.BASE_W || 0;
  const BASE_H = portraitBase.h || global.BASE_H || 0;

  // --- Fond (HTML) ---
  const backgroundState = {
    hasBackgroundImage: false,
    currentBackgroundSrc: '',
  };

  function getBackgroundState() {
    return { ...backgroundState };
  }

  function setBackgroundImageSrc(src, options = {}) {
    const el = global.document?.getElementById('bgLayer');
    if (!el) return;

    const { immediate = false } = options;

    const enableNoTransition = () => {
      if (immediate && el.classList) {
        el.classList.add('no-transition');
      }
    };

    const disableNoTransition = () => {
      if (immediate && el.classList) {
        if (typeof global.requestAnimationFrame === 'function') {
          global.requestAnimationFrame(() => el.classList.remove('no-transition'));
        } else {
          el.classList.remove('no-transition');
        }
      }
    };

    if (typeof src !== 'string' || !src.trim()) {
      el.style.backgroundImage = 'none';
      backgroundState.hasBackgroundImage = false;
      backgroundState.currentBackgroundSrc = '';
      return;
    }

    enableNoTransition();
    el.style.backgroundImage = `url("${src}")`;
    if (immediate) {
      el.style.opacity = 1;
      disableNoTransition();
    } else if (typeof global.requestAnimationFrame === 'function') {
      global.requestAnimationFrame(() => {
        el.style.opacity = 1;
      });
    } else {
      el.style.opacity = 1;
    }
    backgroundState.hasBackgroundImage = true;
    backgroundState.currentBackgroundSrc = src;
  }

  function fadeOutBgThen(next, options = {}) {
    const el = global.document?.getElementById('bgLayer');
    const { immediate = false } = options;
    const applyNext = () => {
      if (typeof next === 'function') {
        next();
      } else if (typeof next === 'string') {
        setBackgroundImageSrc(next);
      }
    };

    if (!el || !backgroundState.hasBackgroundImage || immediate) {
      applyNext();
      return;
    }

    el.style.opacity = 0;
    setTimeout(applyNext, 250);
  }

  function applyLevelBackground(src, options = {}) {
    if (!src) return;

    const { immediate = false } = options;

    if (backgroundState.currentBackgroundSrc === src) {
      setBackgroundImageSrc(src, { immediate });
      return;
    }

    if (immediate || !backgroundState.hasBackgroundImage) {
      setBackgroundImageSrc(src, { immediate: true });
    } else {
      fadeOutBgThen(() => setBackgroundImageSrc(src), { immediate: false });
    }
  }

  // --- HUD helpers ---
  function setHUDScore(v) {
    const el = global.document?.getElementById('hudScore');
    if (el) el.textContent = formatScore(v);
  }

  function setHUDCombo(mult, streak) {
    const multEl = global.document?.getElementById('hudComboMult');
    const streakEl = global.document?.getElementById('hudComboStreak');
    if (multEl) multEl.textContent = 'x' + Number(mult ?? 0).toFixed(1);
    if (streakEl) {
      streakEl.textContent = '(' + Math.max(0, Math.floor(Number(streak) || 0)) + ')';
    }
  }

  function setHUDComboProgress(p) { // p: 0..1
    const fill = global.document?.getElementById('hudComboFill');
    if (!fill) return;
    const pct = (Math.max(0, Math.min(1, Number.isFinite(p) ? p : Number(p) || 0)) * 100).toFixed(0) + '%';
    fill.style.width = pct;
  }

  function setHUDLives(n) {
    const livesEl = global.document?.getElementById('hudLives');
    if (livesEl) livesEl.textContent = '♥'.repeat(Math.max(0, (Number.isFinite(n) ? n : Number(n) || 0) | 0));
  }

  function setHUDTime(s) {
    const timeEl = global.document?.getElementById('hudTime');
    if (timeEl) timeEl.textContent = Math.max(0, (Number.isFinite(s) ? s : Number(s) || 0) | 0) + 's';
  }

  function setHUDLegendBoost(level, shouldShow, color) {
    const container = global.document?.getElementById('hudLegendBoost');
    const badgeEl = global.document?.getElementById('hudLegendBoostBadge');
    if (!container || !badgeEl) return;

    const safeLevel = Math.max(0, Math.floor(Number(level) || 0));
    const visible = safeLevel > 0 && shouldShow !== false;
    container.style.display = visible ? 'flex' : 'none';

    if (visible) {
      container.style.color = color || '#fff';
      badgeEl.src = `assets/badge${safeLevel}.png`;
      badgeEl.alt = `Badge boost niveau ${safeLevel}`;
    } else {
      badgeEl.removeAttribute('src');
      badgeEl.alt = 'Badge boost indisponible';
    }
  }

  const comboVis = {
    scale: 1,
    flash: 0,
  };

  const hudBonusPopState = {};
  const HUD_BONUS_POP_DEFAULTS = {
    // Pop-in départ plus large pour que l'icône soit bien visible avant de revenir à 1
    fromScale: 4,
    duration: 0.8,
    ease: "back.out(2.2)",
  };

  function getHudBonusState(type) {
    if (!hudBonusPopState[type]) {
      hudBonusPopState[type] = { scale: 1, tween: null };
    }
    return hudBonusPopState[type];
  }

  function triggerHudBonusPop(type, options = {}) {
    const state = getHudBonusState(type);
    const { fromScale, duration, ease } = { ...HUD_BONUS_POP_DEFAULTS, ...options };

    if (state.tween?.kill) {
      state.tween.kill();
    }

    state.scale = fromScale;

    if (global.gsap?.to) {
      state.tween = global.gsap.to(state, {
        scale: 1,
        duration,
        ease,
        overwrite: "auto",
      });
    } else {
      state.scale = 1;
    }
  }

  function getHudBonusScale(type) {
    const state = hudBonusPopState[type];
    return state?.scale || 1;
  }

  function updateComboChipVisual(color) {
    const chip = global.document?.getElementById('hudComboChip');
    if (chip) {
      const scale = Number.isFinite(comboVis.scale) ? comboVis.scale : 1;
      chip.style.transform = `scale(${scale.toFixed(3)})`;
      const flash = clamp(Number.isFinite(comboVis.flash) ? comboVis.flash : 0, 0, 1);
      const base = 0.12;
      const bgAlpha = clamp(base + flash * 0.35, base, 0.6);
      chip.style.backgroundColor = `rgba(255,255,255,${bgAlpha.toFixed(3)})`;
      chip.style.boxShadow = flash > 0.01 ? `0 0 ${Math.round(12 + flash * 10)}px rgba(255,255,255,${(0.45 * flash).toFixed(2)})` : '';
    }
    const fill = global.document?.getElementById('hudComboFill');
    if (fill && color) fill.style.background = color;
    const multEl = global.document?.getElementById('hudComboMult');
    if (multEl && color) multEl.style.color = color;
  }

  function drawCompactHUD(ctx, g, options = {}) {
    if (!g) return null;

    const {
      HUD_CONFIG: hudConfig = HUD_CONFIG,
      baseWidth = BASE_W,
      baseHeight = BASE_H,
      comboTiers = global.comboTiers || [],
      progressToNext = global.progressToNext,
      comboVis: comboVisualState = comboVis,
      activeBonuses = {},
      controlInversionState = {},
      shield = {},
      bonusIcons = {},
      shieldIconImage = global.shieldIconImage,
      isLegendLevel = global.isLegendLevel || (() => false),
    } = options;

    const W = baseWidth;
    const H = baseHeight;

    const desired = H * 0.08;
    const barH = Math.round(clamp(desired, H * hudConfig.barHFracMin, H * hudConfig.barHFracMax));
    const topFrac = g.maxTopActorH || config.CONFIG?.maxTopActorH || 0.14;
    const y = Math.round(Math.floor(H * topFrac));
    const x = hudConfig.padX;
    const w = W - hudConfig.padX * 2;
    const h = barH;

    const scoreValue = Math.round(g.score ?? 0);
    setHUDScore(scoreValue);

    const streakValue = Math.max(0, Math.floor(g.comboStreak ?? 0));
    const cur = comboTiers.filter((t) => streakValue >= t.min).pop() || comboTiers[0];
    const comboMult = cur?.mult ?? 1;
    setHUDCombo(comboMult, streakValue);
    if (typeof progressToNext === 'function') {
      setHUDComboProgress(progressToNext(streakValue));
    }

    const color =
      hudConfig.comboColors[String(comboMult)] ||
      (comboMult >= 3.0 ? hudConfig.comboColors?.['3.0'] : hudConfig.comboColors?.['1.0']);

    updateComboChipVisual(color);

    const heartsCount = Math.max(0, Math.round(g.lives ?? 0));
    setHUDLives(heartsCount);

    const timeSeconds = Math.max(0, Math.floor(g.timeLeft ?? 0));
    setHUDTime(timeSeconds);

    const legendBoostLevel = Math.max(0, Math.floor(Number(g?.legendBoostLevel) || 0));
    setHUDLegendBoost(legendBoostLevel, true, color);

    const metrics = { x, y, w, h };

    const bonusX = hudConfig.padX + 2;
    let bonusY = y + h + hudConfig.padY;
    const iconSize = hudConfig.bonusIconSize;
    const iconSpacing = hudConfig.gap;
    const timerFontSize = Math.max(hudConfig.fontMin, Math.round(hudFontSize(baseWidth) * 0.85));

    const drawBonusIcon = (type, timeLeft) => {
      const icon = bonusIcons[type];
      if (!icon) return;
      const timer = Math.max(0, timeLeft);
      const scale = getHudBonusScale(type);
      if (icon.complete) {
        const cx = bonusX + iconSize / 2;
        const cy = bonusY + iconSize / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.drawImage(icon, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
        ctx.restore();
      }
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.font = `${timerFontSize}px "Roboto Mono", "Inter", monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.ceil(timer)}s`, bonusX + iconSize + 6, bonusY + iconSize / 2);
      ctx.restore();
      bonusY += iconSize + iconSpacing;
    };

    for (const type in activeBonuses) {
      const bonus = activeBonuses[type];
      if (bonus?.active) {
        drawBonusIcon(type, bonus.timeLeft);
      }
    }

    if (controlInversionState.active && controlInversionState.timeLeft > 0) {
      drawBonusIcon("fakeAirdrop", controlInversionState.timeLeft);
    }

    const slowTimer = Math.max(0, Number(g?.wallet?.slowTimer) || 0);
    if (slowTimer > 0) {
      drawBonusIcon("anvil", slowTimer);
    }

    const drawShieldIcon = (count) => {
      if (!shieldIconImage?.complete) return;
      const size = iconSize;
      const bx = bonusX;
      const by = bonusY;
      const scale = getHudBonusScale("shield");

      const cx = bx + size / 2;
      const cy = by + size / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.drawImage(shieldIconImage, -size / 2, -size / 2, size, size);
      ctx.restore();
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.font = `${timerFontSize}px "Roboto Mono", "Inter", monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillText(`x${count}`, bx + size + 6, by + size / 2);
      ctx.restore();
      bonusY += size + iconSpacing;
    };

    if (shield.count > 0) {
      drawShieldIcon(shield.count);
    }

    // expose comboVis updates for external animations
    comboVis.scale = comboVisualState?.scale ?? comboVis.scale;
    comboVis.flash = comboVisualState?.flash ?? comboVis.flash;

    return metrics;
  }

  // --- Overlays ---
  function showOverlay(el) {
    if (!el) return;
    el.classList.add("show");
    if (typeof el.setAttribute === "function") {
      el.setAttribute("aria-hidden", "false");
    }
    if (typeof el.removeAttribute === "function") {
      try {
        el.removeAttribute("inert");
      } catch (err) {
        void err;
      }
    }
    if (el?.style) {
      el.style.pointerEvents = "auto";
    }
  }

  function hideOverlay(el, options = {}) {
    if (!el) return;
    const { immediate = false } = options;
    const shouldSkipTransition = Boolean(immediate && el.classList);
    if (shouldSkipTransition) {
      el.classList.add('no-transition');
    }
    el.classList.remove("show");
    if (typeof el.setAttribute === "function") {
      el.setAttribute("aria-hidden", "true");
    }
    if (typeof el.setAttribute === "function") {
      try {
        el.setAttribute("inert", "");
      } catch (err) {
        void err;
      }
    }
    if (el?.style) {
      el.style.pointerEvents = "none";
    }
    if (typeof global.document !== 'undefined' && typeof el.contains === 'function') {
      const active = global.document.activeElement;
      if (active && el.contains(active) && typeof active.blur === 'function') {
        active.blur();
      }
    }
    if (shouldSkipTransition && typeof global.requestAnimationFrame === 'function') {
      global.requestAnimationFrame(() => {
        if (el?.classList) {
          el.classList.remove('no-transition');
        }
      });
    } else if (shouldSkipTransition && el?.classList) {
      el.classList.remove('no-transition');
    }
  }

  function getOverlayElements() {
    if (typeof global.document === 'undefined') return [];
    const ids = ['overlay', 'interLevelScreen', 'legendResultScreen'];
    return ids
      .map((id) => global.document.getElementById(id))
      .filter((node) => !!node);
  }

  function deactivateOtherOverlays(activeEl) {
    const overlays = getOverlayElements();
    overlays.forEach((node) => {
      if (!node || node === activeEl) return;
      hideOverlay(node);
      if (node?.classList) {
        node.classList.remove('overlay-title', 'overlay-rules');
      }
    });
  }

  function showExclusiveOverlay(el) {
    if (!el) return;
    deactivateOtherOverlays(el);
    showOverlay(el);
  }

  function clearMainOverlay(except) {
    const mainOverlay = global.document?.getElementById("overlay");
    if (!mainOverlay || mainOverlay === except) return mainOverlay || null;

    mainOverlay.innerHTML = "";
    hideOverlay(mainOverlay);
    mainOverlay.classList.remove("overlay-title", "overlay-rules");
    return mainOverlay;
  }

  const api = {
    getBackgroundState,
    setBackgroundImageSrc,
    fadeOutBgThen,
    applyLevelBackground,
    setHUDScore,
    setHUDCombo,
    setHUDComboProgress,
    setHUDLives,
    setHUDTime,
    setHUDLegendBoost,
    updateComboChipVisual,
    drawCompactHUD,
    comboVis,
    triggerHudBonusPop,
    getHudBonusScale,
    showOverlay,
    hideOverlay,
    getOverlayElements,
    deactivateOtherOverlays,
    showExclusiveOverlay,
    clearMainOverlay,
  };

  global.SD_RENDER = api;
  Object.assign(global, api);
})(typeof window !== 'undefined' ? window : null);
