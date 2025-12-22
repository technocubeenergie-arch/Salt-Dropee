(function (scope) {
  const { CONFIG = {} } = scope.SD_CONFIG || {};
  const FX_NS = scope.SD_FX || {};
  const RENDER_NS = scope.SD_RENDER || {};

  const BombImg = new Image(); let bombReady = false; BombImg.onload = () => bombReady = true; BombImg.src = 'assets/bombe.png';
  const ShitcoinImg = new Image(); let shitcoinReady = false; ShitcoinImg.onload = () => shitcoinReady = true; ShitcoinImg.src = 'assets/shitcoin.png';
  const RugpullImg = new Image(); let rugpullReady = false; RugpullImg.onload = () => rugpullReady = true; RugpullImg.src = 'assets/rugpull.png';
  const FakeADImg = new Image(); let fakeADReady = false; FakeADImg.onload = () => fakeADReady = true; FakeADImg.src = 'assets/fakeairdrop.png';
  const AnvilImg = new Image(); let anvilReady = false; AnvilImg.onload = () => anvilReady = true; AnvilImg.src = 'assets/anvil.png';

  const MagnetImg = new Image(); let magnetReady = false; MagnetImg.onload = () => magnetReady = true; MagnetImg.src = 'assets/magnet.png';
  const X2Img = new Image(); let x2Ready = false; X2Img.onload = () => x2Ready = true; X2Img.src = 'assets/x2.png';
  const x2Image = new Image(); x2Image.src = 'assets/x2.png';
  const ShieldImg = new Image(); let shieldReady = false; ShieldImg.onload = () => shieldReady = true; ShieldImg.src = 'assets/shield.png';
  const shieldIconImage = new Image(); shieldIconImage.src = 'assets/shield.png';
  const TimeImg = new Image(); let timeReady = false; TimeImg.onload = () => timeReady = true; TimeImg.src = 'assets/time.png';

  const NEGATIVE_TYPES = new Set([
    'bomb',
    'shitcoin',
    'rugpull',
    'fakeAirdrop',
    'anvil'
  ]);

  const BonusIcons = {
    magnet: MagnetImg,
    x2: X2Img,
    shield: ShieldImg,
    fakeAirdrop: FakeADImg,
    anvil: AnvilImg,
  };

  const POWERUP_PICKUP_ASSETS = {
    magnet: { image: MagnetImg, ready: () => magnetReady },
    x2: { image: x2Image, ready: () => x2Image.complete },
    shield: { image: shieldIconImage, ready: () => shieldIconImage.complete },
    timeShard: { image: TimeImg, ready: () => timeReady }
  };

  const activeBonuses = {
    magnet: { active: false, timeLeft: 0 },
    x2: { active: false, timeLeft: 0 },
  };

  const shield = {
    count: 0,
    active: false,
    _effect: null,
  };

  const shieldRuntimeState = { consumedThisFrame: false };

  const controlInversionState = {
    active: false,
    timeLeft: 0,
  };

  function applyLegendShieldBoost(extraCount = 0) {
    const additional = Number.isFinite(extraCount) ? Math.max(0, Math.floor(extraCount)) : 0;
    if (additional <= 0) return;

    shield.count = Math.max(0, shield.count) + additional;
    shield.active = shield.count > 0;

    if (shield.active) {
      FX_NS.startShieldEffect?.();
      updateShieldHUD();
    }
  }

  function activateBonus(type, duration) {
    if (type === 'shield') {
      collectShield();
      return;
    }

    const bonus = activeBonuses[type];
    if (!bonus) return;

    const wasActive = bonus.active;

    const extra = Math.max(0, Number(duration) || 0);
    if (bonus.active) {
      bonus.timeLeft += extra;
      if (extra > 0) {
        scope.playSound?.('bonusok');
      }
    } else if (extra > 0) {
      bonus.active = true;
      bonus.timeLeft = extra;
      scope.playSound?.('bonusok');
      FX_NS.startBonusEffect?.(type);
    }

    if (!wasActive && bonus.active) {
      if (type === 'magnet' && scope?.location?.search?.includes('debug')) {
        console.debug(`[magnet] activated (timeLeft=${bonus.timeLeft.toFixed(2)}s)`);
      }
      RENDER_NS.triggerHudBonusPop?.(type);
    }
  }

  function updateActiveBonuses(dt) {
    for (const type in activeBonuses) {
      const bonus = activeBonuses[type];
      if (!bonus.active) continue;
      bonus.timeLeft -= dt;
      if (bonus.timeLeft <= 0) {
        bonus.active = false;
        bonus.timeLeft = 0;
        FX_NS.stopBonusEffect?.(type);
      }
    }
  }

  function beginFrame() {
    shieldRuntimeState.consumedThisFrame = false;
  }

  function resetActiveBonuses() {
    for (const type in activeBonuses) {
      if (activeBonuses[type].active) {
        FX_NS.stopBonusEffect?.(type);
      }
      activeBonuses[type].active = false;
      activeBonuses[type].timeLeft = 0;
    }
  }

  function updateShieldHUD() {
    if (!scope.game || typeof scope.game.render !== 'function') return;
    if (scope.game.state === 'playing') return;
    scope.game.render();
  }

  function collectShield() {
    const wasActive = shield.count > 0;
    shield.count += 1;
    scope.playSound?.('bonusok');

    if (!wasActive) {
      if (typeof scope.requestAnimationFrame === 'function') {
        requestAnimationFrame(() => scope.playSound?.('forcefield'));
      } else {
        scope.playSound?.('forcefield');
      }
    }

    if (!shield.active) {
      shield.active = true;
      FX_NS.startShieldEffect?.();
    } else if (shield._effect?.aura && scope.gsap?.fromTo) {
      scope.gsap.fromTo(
        shield._effect.aura,
        { scale: 1.3, opacity: 0.35 },
        {
          scale: 1.2,
          opacity: 0.2,
          duration: 0.6,
          ease: 'sine.out',
          overwrite: 'auto'
        }
      );
    }

    if (!wasActive) {
      RENDER_NS.triggerHudBonusPop?.('shield');
    }

    FX_NS.showPowerupPickup?.('shield');
    updateShieldHUD();
  }

  function getControlInversionDuration(duration) {
    const custom = Number(duration);
    if (Number.isFinite(custom) && custom > 0) {
      return custom;
    }
    const configValue = Number(CONFIG?.malus?.fakeAirdropDuration);
    if (Number.isFinite(configValue) && configValue > 0) {
      return configValue;
    }
    return 5;
  }

  function resetControlInversion(options = {}) {
    void options;
    const instance = scope.game || scope.Game?.instance || null;
    if (instance?.effects) {
      instance.effects.invert = 0;
    }
    controlInversionState.active = false;
    controlInversionState.timeLeft = 0;
  }

  function applyControlInversion(gameInstance, duration) {
    const instance = gameInstance || scope.game || scope.Game?.instance || null;
    if (!instance) return;

    if (!instance.effects) {
      instance.effects = {};
    }

    const totalDuration = getControlInversionDuration(duration);
    instance.effects.invert = totalDuration;
    controlInversionState.timeLeft = totalDuration;
    controlInversionState.active = true;
  }

  function controlsAreInverted() {
    const instance = scope.game || scope.Game?.instance || null;
    if (!instance?.effects) return false;
    return (Number(instance.effects.invert) || 0) > 0;
  }

  function updateControlInversionTimer(gameInstance, dt) {
    if (!gameInstance?.effects) return;

    let remaining = Number(gameInstance.effects.invert) || 0;
    if (remaining <= 0) {
      gameInstance.effects.invert = 0;
      if (controlInversionState.active) {
        controlInversionState.active = false;
        controlInversionState.timeLeft = 0;
      }
      return;
    }

    remaining = Math.max(0, remaining - dt);
    gameInstance.effects.invert = remaining;
    controlInversionState.timeLeft = remaining;
    if (remaining <= 0 && controlInversionState.active) {
      controlInversionState.active = false;
      controlInversionState.timeLeft = 0;
    }
  }

  function resetShieldState(options = {}) {
    const { silent = false } = options;
    if (shield.active || shield.count > 0 || shield._effect) {
      shield.count = 0;
      shield.active = false;
      FX_NS.stopShieldEffect?.({ silent });
    } else {
      shield.count = 0;
      shield.active = false;
    }
    shield._effect = null;
    shieldRuntimeState.consumedThisFrame = false;
    updateShieldHUD();
  }

  function getBadItemAssets() {
    return {
      bomb: { image: BombImg, ready: () => bombReady },
      shitcoin: { image: ShitcoinImg, ready: () => shitcoinReady },
      rugpull: { image: RugpullImg, ready: () => rugpullReady },
      fakeAirdrop: { image: FakeADImg, ready: () => fakeADReady },
      anvil: { image: AnvilImg, ready: () => anvilReady },
    };
  }

  function getPowerItemAssets() {
    return {
      magnet: { image: MagnetImg, ready: () => magnetReady },
      x2: { image: X2Img, ready: () => x2Ready },
      shield: { image: ShieldImg, ready: () => shieldReady },
      timeShard: { image: TimeImg, ready: () => timeReady },
    };
  }

  function getPowerupWarmupImages() {
    return [
      BombImg,
      ShitcoinImg,
      RugpullImg,
      FakeADImg,
      AnvilImg,
      MagnetImg,
      X2Img,
      ShieldImg,
      TimeImg,
      shieldIconImage,
      x2Image,
    ];
  }

  const API = {
    NEGATIVE_TYPES,
    BonusIcons,
    POWERUP_PICKUP_ASSETS,
    activeBonuses,
    shield,
    shieldRuntimeState,
    controlInversionState,
    applyLegendShieldBoost,
    activateBonus,
    updateActiveBonuses,
    beginFrame,
    resetActiveBonuses,
    updateShieldHUD,
    collectShield,
    resetShieldState,
    getControlInversionDuration,
    resetControlInversion,
    applyControlInversion,
    controlsAreInverted,
    updateControlInversionTimer,
    getBadItemAssets,
    getPowerItemAssets,
    getPowerupWarmupImages,
  };

  scope.SD_POWERUPS = API;
  scope.NEGATIVE_TYPES = NEGATIVE_TYPES;
  scope.POWERUP_PICKUP_ASSETS = POWERUP_PICKUP_ASSETS;
  scope.activeBonuses = activeBonuses;
  scope.shieldIconImage = shieldIconImage;
})(window);
