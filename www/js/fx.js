(function(scope){
  const FX_NS = scope.SD_FX = scope.SD_FX || {};

  class FxManager {
    constructor(game) {
      this.g = game;
      this.effects = [];
      this.active = {};
    }

    add(effect) {
      if (!effect) return null;
      this.effects.push(effect);
      return effect;
    }

    // --- Méthode rétro-compatible ---
    burst(x, y, color = "gold", radius = 20) {
      const fx = new FxPositiveImpact(x, y);
      if (color) CONFIG.fx.positive.color = color;
      if (radius) CONFIG.fx.positive.radius = radius;
      this.add(fx);
    }

    update(dt) {
      for (const fx of this.effects) {
        if (fx.dead) continue;
        if (typeof fx.update === "function") {
          fx.update(dt);
        }
      }
      this.effects = this.effects.filter(fx => !fx.dead);
    }

    render(ctx) {
      if (!ctx) return;
      for (const fx of this.effects) {
        if (!fx.dead && typeof fx.draw === "function") {
          fx.draw(ctx);
        }
      }
    }

    clear(type) {
      const activeEffect = this.active[type];
      if (!activeEffect) return;
      if (typeof activeEffect.kill === "function") {
        activeEffect.kill();
      } else if (activeEffect.tween?.kill) {
        activeEffect.tween.kill();
      }
      this.effects = this.effects.filter(fx => fx !== activeEffect);
      delete this.active[type];
    }

    clearAll() {
      for (const fx of this.effects) {
        if (typeof fx.kill === "function") {
          fx.kill();
        } else if (fx.tween?.kill) {
          fx.tween.kill();
        }
        fx.dead = true;
      }
      this.effects.length = 0;
      for (const key of Object.keys(this.active)) {
        const activeEffect = this.active[key];
        if (typeof activeEffect?.kill === "function") {
          activeEffect.kill();
        } else if (activeEffect?.tween?.kill) {
          activeEffect.tween.kill();
        }
      }
      this.active = {};
    }
  }

  class FxPositiveImpact {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.scale = 0.1;
      this.opacity = 1;
      this.dead = false;
      this.color = color || CONFIG.fx.positive.color;
      this.tween = null;

      if (gsap?.to) {
        this.tween = gsap.to(this, {
          scale: 1.5,
          opacity: 0,
          duration: CONFIG.fx.positive.duration,
          ease: "power1.out",
          onComplete: () => this.finish(),
          onInterrupt: () => this.finish(),
        });
      } else {
        this.scale = 1.5;
        this.opacity = 0;
        this.dead = true;
      }
    }

    finish() {
      if (this.dead) return;
      this.dead = true;
      const tween = this.tween;
      this.tween = null;
      tween?.kill?.();
    }

    kill() {
      this.finish();
    }

    draw(ctx) {
      if (this.dead) return;
      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.beginPath();
      ctx.arc(this.x, this.y, CONFIG.fx.positive.radius * this.scale, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
      ctx.restore();
    }
  }

  class FxNegativeImpact {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.opacity = 1;
      this.dead = false;
      this.tween = null;

      if (gsap?.to) {
        this.tween = gsap.to(this, {
          opacity: 0,
          duration: CONFIG.fx.negative.duration,
          ease: "power1.out",
          onComplete: () => this.finish(),
          onInterrupt: () => this.finish(),
        });
      } else {
        this.opacity = 0;
        this.dead = true;
      }
    }

    finish() {
      if (this.dead) return;
      this.dead = true;
      const tween = this.tween;
      this.tween = null;
      tween?.kill?.();
    }

    kill() {
      this.finish();
    }

    draw(ctx) {
      if (this.dead) return;
      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.beginPath();
      ctx.arc(this.x, this.y, CONFIG.fx.negative.radius, 0, Math.PI * 2);
      ctx.fillStyle = CONFIG.fx.negative.color;
      ctx.fill();
      ctx.restore();
    }
  }

  function fxMagnetActive(wallet, fxManager) {
    if (!wallet || !fxManager) return;

    fxManager.clear("magnet");

    const ring = { scale: 0.5, opacity: 1 };
    const effect = {
      type: "magnet",
      wallet,
      ring,
      dead: false,
      tween: null,
      kill() {
        if (effect.dead) return;
        effect.dead = true;
        const tween = effect.tween;
        effect.tween = null;
        tween?.kill?.();
      },
      draw(ctx) {
        if (effect.dead) return;
        ctx.save();
        ctx.globalAlpha = ring.opacity;
        ctx.beginPath();
        ctx.arc(
          wallet.x + wallet.w / 2,
          wallet.y + wallet.h / 2,
          CONFIG.fx.magnet.radius * ring.scale,
          0,
          Math.PI * 2
        );
        ctx.strokeStyle = CONFIG.fx.magnet.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    };

    if (gsap?.to) {
      effect.tween = gsap.to(ring, {
        scale: 2,
        opacity: 0,
        duration: CONFIG.fx.magnet.duration,
        ease: "sine.out",
        repeat: -1,
        onRepeat: () => {
          ring.opacity = 1;
          ring.scale = 0.5;
        }
      });
    }

    fxManager.active.magnet = effect;
    fxManager.add(effect);
  }

  const BONUS_PICKUP_ANIM = {
    initialScale: 0.5,
    peakScale: 0.6,
    settleScale: 0.55,
    popDuration: 0.15,
    fadeDuration: 0.2,
    overlap: 0.08
  };

  function createBonusPickupTimeline(target, onFinish) {
    const timeline = gsap.timeline({ onComplete: onFinish, defaults: { overwrite: "auto" } });

    timeline
      .to(target, {
        scale: BONUS_PICKUP_ANIM.peakScale,
        duration: BONUS_PICKUP_ANIM.popDuration,
        ease: "back.out(2)"
      })
      .to(
        target,
        {
          scale: BONUS_PICKUP_ANIM.settleScale,
          opacity: 0,
          duration: BONUS_PICKUP_ANIM.fadeDuration,
          ease: "power1.inOut"
        },
        `-=${BONUS_PICKUP_ANIM.overlap}`
      );

    return timeline;
  }

  function showPowerupPickup(type) {
    const asset = POWERUP_PICKUP_ASSETS[type];
    if (!asset?.image) return;
    if (typeof asset.ready === "function" && !asset.ready()) return;
    if (!asset.image.complete) return;

    const walletRef = game?.wallet;
    const fxManager = game?.fx;
    if (!walletRef || !fxManager || !gsap?.to) return;

    const x = walletRef.x + walletRef.w / 2;
    const y = walletRef.y - 30;
    const baseSize = 80;

    const anim = { scale: BONUS_PICKUP_ANIM.initialScale, opacity: 1 };

    const effect = {
      type: `pickup-${type}`,
      dead: false,
      scale: 1,
      opacity: 1,
      image: asset.image,
      anim,
      timeline: null,
      finish() {
        if (effect.dead) return;
        effect.dead = true;
        if (effect.timeline) {
          effect.timeline.kill();
          effect.timeline = null;
        }
      },
      draw(ctx) {
        if (effect.dead || anim.opacity <= 0) return;
        ctx.save();
        ctx.globalAlpha = anim.opacity;
        ctx.translate(x, y);
        ctx.scale(anim.scale, anim.scale);
        ctx.drawImage(effect.image, -baseSize / 2, -baseSize / 2, baseSize, baseSize);
        ctx.restore();
      },
    };

    fxManager.add(effect);

    effect.timeline = createBonusPickupTimeline(anim, () => effect.finish());
  }

  function showX2Animation() {
    showPowerupPickup("x2");
  }

  function startBonusEffect(type) {
    const walletRef = game?.wallet;
    const fx = game?.fx;
    if (!walletRef || !fx) return;

    switch (type) {
      case "magnet":
        fxMagnetActive(walletRef, fx);
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => playSound("magnetat"));
        } else {
          playSound("magnetat");
        }
        showPowerupPickup("magnet");
        break;
      case "x2":
        showX2Animation();
        break;
      case "shield":
        showPowerupPickup("shield");
        break;
      case "timeShard":
        showPowerupPickup("timeShard");
        break;
    }
  }

  function stopBonusEffect(type) {
    const fx = game?.fx;
    if (!fx) return;

    switch (type) {
      case "magnet":
        fx.clear("magnet");
        playSound("off");
        break;
      case "x2":
        break;
    }
  }

  function startShieldEffect() {
    const walletRef = game?.wallet;
    const fxManager = game?.fx;
    if (!walletRef || !fxManager) return;

    fxManager.clear("shield");

    const aura = { scale: 1, opacity: 0.4 };
    const effect = {
      type: "shield",
      wallet: walletRef,
      aura,
      dead: false,
      tween: null,
      kill() {
        if (effect.dead) return;
        effect.dead = true;
        effect.tween?.kill?.();
        if (fxManager.active.shield === effect) {
          delete fxManager.active.shield;
        }
        if (shield._effect === effect) {
          shield._effect = null;
        }
      },
      draw(ctx) {
        if (effect.dead) return;
        ctx.save();
        ctx.globalAlpha = aura.opacity;
        ctx.beginPath();
        ctx.arc(
          walletRef.x + walletRef.w / 2,
          walletRef.y + walletRef.h / 2,
          (walletRef.w / 2) * aura.scale + CONFIG.fx.shield.radiusOffset,
          0,
          Math.PI * 2
        );
        ctx.strokeStyle = CONFIG.fx.shield.color;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }
    };

    if (gsap?.to) {
      effect.tween = gsap.to(aura, {
        scale: 1,
        opacity: 0.2,
        yoyo: true,
        repeat: -1,
        duration: CONFIG.fx.shield.duration,
        ease: "sine.inOut"
      });
    }

    fxManager.active.shield = effect;
    fxManager.add(effect);
    shield._effect = effect;
    shield.active = true;

  }

  function stopShieldEffect(options = {}) {
    const { silent = false } = options;
    const fxManager = game?.fx;
    const walletRef = game?.wallet;

    if (fxManager?.active?.shield) {
      const activeEffect = fxManager.active.shield;
      fxManager.clear("shield");
      if (shield._effect === activeEffect) {
        shield._effect = null;
      }
    } else if (shield._effect) {
      shield._effect.kill?.();
      shield._effect = null;
    }

    if (!silent) {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => playSound("off"));
      } else {
        playSound("off");
      }
    }

    if (!walletRef || !fxManager) return;

    const fade = { scale: 1, opacity: 1 };
    const fadeEffect = {
      type: "shieldFade",
      wallet: walletRef,
      fade,
      dead: false,
      tween: null,
      kill() {
        if (fadeEffect.dead) return;
        fadeEffect.dead = true;
        fadeEffect.tween?.kill?.();
      },
      draw(ctx) {
        if (fadeEffect.dead || fade.opacity <= 0) return;
        ctx.save();
        ctx.globalAlpha = fade.opacity;
        ctx.beginPath();
        ctx.arc(
          walletRef.x + walletRef.w / 2,
          walletRef.y + walletRef.h / 2,
          (walletRef.w / 2) * fade.scale + CONFIG.fx.shield.radiusOffset,
          0,
          Math.PI * 2
        );
        ctx.strokeStyle = "rgba(100,200,255,0.6)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }
    };

    if (gsap?.to) {
      fadeEffect.tween = gsap.to(fade, {
        scale: 1.3,
        opacity: 0,
        duration: 0.6,
        ease: "power1.in",
        onComplete: () => fadeEffect.kill(),
        onInterrupt: () => fadeEffect.kill()
      });
    } else {
      fadeEffect.dead = true;
    }

    fxManager.add(fadeEffect);
  }

  FX_NS.FxManager = FxManager;
  FX_NS.FxPositiveImpact = FxPositiveImpact;
  FX_NS.FxNegativeImpact = FxNegativeImpact;
  FX_NS.fxMagnetActive = fxMagnetActive;
  FX_NS.BONUS_PICKUP_ANIM = BONUS_PICKUP_ANIM;
  FX_NS.createBonusPickupTimeline = createBonusPickupTimeline;
  FX_NS.showPowerupPickup = showPowerupPickup;
  FX_NS.showX2Animation = showX2Animation;
  FX_NS.startBonusEffect = startBonusEffect;
  FX_NS.stopBonusEffect = stopBonusEffect;
  FX_NS.startShieldEffect = startShieldEffect;
  FX_NS.stopShieldEffect = stopShieldEffect;

  scope.FxManager = FxManager;
  scope.FxPositiveImpact = FxPositiveImpact;
  scope.FxNegativeImpact = FxNegativeImpact;
  scope.fxMagnetActive = fxMagnetActive;
  scope.BONUS_PICKUP_ANIM = BONUS_PICKUP_ANIM;
  scope.createBonusPickupTimeline = createBonusPickupTimeline;
  scope.showPowerupPickup = showPowerupPickup;
  scope.showX2Animation = showX2Animation;
  scope.startBonusEffect = startBonusEffect;
  scope.stopBonusEffect = stopBonusEffect;
  scope.startShieldEffect = startShieldEffect;
  scope.stopShieldEffect = stopShieldEffect;
})(window);
