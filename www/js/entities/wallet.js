(function (global) {
  const gsap = global.gsap;
  const { CONFIG } = global.SD_CONFIG || {};
  const { clamp } = global.SD_UTILS || {};
  const { getEffectiveHorizontalAxis = () => 0, input = {} } = global.SD_INPUT || {};
  const { getWalletImage = () => null } = global.SD_LEVELS || {};

  const BASE_W = (global.SD_CANVAS?.BASE_W ?? global.SD_CONFIG?.portraitBase?.w);
  const BASE_H = (global.SD_CANVAS?.BASE_H ?? global.SD_CONFIG?.portraitBase?.h);

  const initialTargetX = Number.isFinite(global.targetX)
    ? global.targetX
    : (typeof BASE_W === 'number' ? BASE_W : 0) / 2;

  function setTargetX(value) {
    global.targetX = value;
  }

  setTargetX(initialTargetX);

  function computeWalletCenterBounds(wallet) {
    const overflow = 60;
    if (!wallet) {
      return { overflow, minCenter: overflow, maxCenter: BASE_W - overflow };
    }
    const halfWidth = wallet.w / 2;
    return {
      overflow,
      minCenter: -overflow + halfWidth,
      maxCenter: BASE_W - wallet.w + overflow + halfWidth,
    };
  }

  function animateWalletToCenter(wallet, center, duration) {
    if (!wallet) return;
    const bounds = computeWalletCenterBounds(wallet);
    const clampedCenter = clamp(center, bounds.minCenter, bounds.maxCenter);
    setTargetX(clampedCenter);
    const destX = clampedCenter - wallet.w / 2;
    const tweenDuration = (typeof duration === 'number') ? duration : CONFIG.control.easeDuration;
    if (gsap && typeof gsap.to === 'function') {
      gsap.to(wallet, {
        x: destX,
        duration: tweenDuration,
        ease: CONFIG.control.easeFunction,
        overwrite: 'auto',
      });
    } else {
      wallet.x = destX;
    }
  }

  class Wallet {
    constructor(game) {
      this.g = game; this.level = 1; this.x = BASE_W / 2; this.y = BASE_H - 40; this.w = 48; this.h = 40; this.slowTimer = 0; this.dashCD = 0; this.spriteHCapPx = 0; this.impact = 0; this.impactDir = 'vertical'; this.squashTimer = 0; this.visualScale = 1; setTargetX(this.x + this.w / 2);
    }
    bump(strength = 0.35, dir = 'vertical') { this.impact = Math.min(1, this.impact + strength); this.impactDir = dir; }
    applyCaps() {
      const walletImg = typeof getWalletImage === 'function' ? getWalletImage() : null;
      const maxH = Math.floor(BASE_H * CONFIG.maxWalletH);
      this.spriteHCapPx = maxH;
      const baseWidth = CONFIG.wallet?.width ?? this.w;
      const ratio = (walletImg && walletImg.naturalWidth > 0)
        ? (walletImg.naturalHeight / walletImg.naturalWidth)
        : 1;
      let targetWidth = baseWidth || 0;
      let targetHeight = targetWidth * ratio;
      if (maxH > 0 && targetHeight > maxH) {
        const clampScale = maxH / targetHeight;
        targetHeight = maxH;
        targetWidth *= clampScale;
      }
      this.w = targetWidth;
      this.h = targetHeight;
      this.y = BASE_H - this.h - CONFIG.wallet.bottomOffset;
      setTargetX(this.x + this.w / 2);
    }
    update(dt) {
      const sens = this.g.settings.sensitivity || 1.0;
      const bounds = computeWalletCenterBounds(this);
      const axis = getEffectiveHorizontalAxis();
      const moveDir = Math.sign(axis);

      if (input.dash && this.dashCD <= 0 && moveDir !== 0) {
        const effectiveSpeed = CONFIG.wallet.dashSpeed * (this.slowTimer > 0 ? 0.6 : 1.0) * sens;
        const dashDuration = Math.max(0.08, CONFIG.control.easeDuration * 0.5);
        const dashDistance = moveDir * effectiveSpeed * dashDuration;
        const desiredCenter = clamp(this.x + this.w / 2 + dashDistance, bounds.minCenter, bounds.maxCenter);
        animateWalletToCenter(this, desiredCenter, dashDuration);
        this.dashCD = CONFIG.wallet.dashCD;
        input.dash = false;
        this.bump(0.25, 'horizontal');
      }

      if (this.dashCD > 0) this.dashCD -= dt;
      this.impact = Math.max(0, this.impact - 3 * dt);
      const slowMul = this.slowTimer > 0 ? 0.6 : 1.0;
      const moveSpeed = CONFIG.wallet.speed * slowMul * sens;
      if (axis !== 0) {
        this.x += axis * moveSpeed * dt;
      }
      const overflow = 60;
      this.x = clamp(this.x, -overflow, BASE_W - this.w + overflow);
      if (this.slowTimer > 0) this.slowTimer -= dt;
      if (this.squashTimer > 0) this.squashTimer -= dt;
    }
    draw(g) {
      const walletImg = typeof getWalletImage === 'function' ? getWalletImage() : null;
      if (!walletImg || !walletImg.complete) return;

      const aspectRatio = (walletImg.naturalWidth > 0)
        ? walletImg.naturalHeight / walletImg.naturalWidth
        : 1;
      let drawWidth = CONFIG.wallet?.width ?? this.w;
      let drawHeight = drawWidth * aspectRatio;
      const maxH = this.spriteHCapPx || drawHeight;
      if (drawHeight > maxH) {
        const clampScale = maxH / drawHeight;
        drawHeight = maxH;
        drawWidth *= clampScale;
      }

      const x = this.x;
      const y = this.y;
      let sx = 1;
      let sy = 1;
      if (this.impactDir === 'vertical') {
        sx = 1 + 0.18 * this.impact;
        sy = 1 - 0.28 * this.impact;
      } else {
        sx = 1 + 0.25 * this.impact;
        sy = 1 - 0.12 * this.impact;
      }

      g.save();
      const cx = Math.round(x + drawWidth / 2);
      const cy = Math.round(y + drawHeight / 2);
      g.translate(cx, cy);
      g.scale(sx * (this.visualScale || 1), sy * (this.visualScale || 1));
      g.translate(-cx, -cy);

      g.shadowColor = 'rgba(0,0,0,0.25)';
      g.shadowBlur = 6;
      g.shadowOffsetY = 2;

      g.drawImage(walletImg, x, y, drawWidth, drawHeight);

      g.restore();
    }
  }

  global.SD_ENTITIES = {
    ...(global.SD_ENTITIES || {}),
    Wallet,
    computeWalletCenterBounds,
    animateWalletToCenter,
  };

  global.Wallet = Wallet;
  global.computeWalletCenterBounds = computeWalletCenterBounds;
  global.animateWalletToCenter = animateWalletToCenter;
})(window);
