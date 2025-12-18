(function (global) {
  const { CONFIG } = global.SD_CONFIG || {};
  const { clamp } = global.SD_UTILS || {};
  const { BASE_W: CANVAS_BASE_W, BASE_H: CANVAS_BASE_H } = global.SD_CANVAS || {};
  const { getCurrentIntraLevelSpeedMultiplier = () => 1 } = global.SD_RENDER || {};

  const BASE_W = CANVAS_BASE_W ?? CONFIG?.portraitBase?.w;
  const BASE_H = CANVAS_BASE_H ?? CONFIG?.portraitBase?.h;

  const NEGATIVE_TYPES = new Set([
    "bomb",
    "shitcoin",
    "rugpull",
    "fakeAirdrop",
    "anvil",
  ]);

  function createImage(src, readyRef) {
    const img = new Image();
    if (readyRef) {
      img.onload = () => (readyRef.ready = true);
    }
    img.src = src;
    return img;
  }

  const bronzeState = { ready: false };
  const silverState = { ready: false };
  const goldState = { ready: false };
  const diamondState = { ready: false };
  const bombState = { ready: false };
  const shitcoinState = { ready: false };
  const rugpullState = { ready: false };
  const fakeAdState = { ready: false };
  const anvilState = { ready: false };

  const BronzeImg = createImage("assets/bronze.png", bronzeState);
  const SilverImg = createImage("assets/silver.png", silverState);
  const GoldImg = createImage("assets/gold.png", goldState);
  const DiamondImg = createImage("assets/diamond.png", diamondState);
  const BombImg = createImage("assets/bombe.png", bombState);
  const ShitcoinImg = createImage("assets/shitcoin.png", shitcoinState);
  const RugpullImg = createImage("assets/rugpull.png", rugpullState);
  const FakeADImg = createImage("assets/fakeairdrop.png", fakeAdState);
  const AnvilImg = createImage("assets/anvil.png", anvilState);

  const ITEM_ASSETS = {
    good: {
      bronze: {
        getImg: () => BronzeImg,
        ready: () => bronzeState.ready,
        fallback: (g, x, y, w, h) => {
          g.fillStyle = "#c07a45";
          g.beginPath();
          g.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
          g.fill();
        },
      },
      silver: {
        getImg: () => SilverImg,
        ready: () => silverState.ready,
        fallback: (g, x, y, w, h) => {
          g.fillStyle = "#c0c0c0";
          g.beginPath();
          g.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
          g.fill();
        },
      },
      gold: {
        getImg: () => GoldImg,
        ready: () => goldState.ready,
        fallback: (g, x, y, w, h) => {
          g.fillStyle = "gold";
          g.fillRect(x, y, w, h);
        },
      },
      diamond: {
        getImg: () => DiamondImg,
        ready: () => diamondState.ready,
        fallback: (g, x, y, w, h) => {
          g.fillStyle = "#9cf";
          g.beginPath();
          g.moveTo(x + w / 2, y);
          g.lineTo(x + w, y + h / 2);
          g.lineTo(x + w / 2, y + h);
          g.lineTo(x, y + h / 2);
          g.closePath();
          g.fill();
        },
      },
    },
    bad: {
      bomb: {
        getImg: () => BombImg,
        ready: () => bombState.ready,
        fallback: (g, x, y, w, h) => {
          g.fillStyle = "#333";
          g.fillRect(x, y, w, h);
        },
      },
      shitcoin: {
        getImg: () => ShitcoinImg,
        ready: () => shitcoinState.ready,
        fallback: (g, x, y, w, h) => {
          g.fillStyle = "#964B00";
          g.fillRect(x, y, w, h);
        },
      },
      rugpull: {
        getImg: () => RugpullImg,
        ready: () => rugpullState.ready,
        fallback: (g, x, y, w, h) => {
          g.fillStyle = "#f00";
          g.fillRect(x, y, w, h);
        },
      },
      fakeAirdrop: {
        getImg: () => FakeADImg,
        ready: () => fakeAdState.ready,
        fallback: (g, x, y, w, h) => {
          g.fillStyle = "#6b7cff";
          g.beginPath();
          g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#fff";
          g.fillRect(x + w / 2 - 3, y + h / 2 - 3, 6, 6);
        },
      },
      anvil: {
        getImg: () => AnvilImg,
        ready: () => anvilState.ready,
        fallback: (g, x, y, w, h) => {
          g.fillStyle = "#60656f";
          g.beginPath();
          g.moveTo(x + 2, y + h * 0.7);
          g.lineTo(x + w - 2, y + h * 0.7);
          g.lineTo(x + w * 0.7, y + h * 0.4);
          g.lineTo(x + w * 0.3, y + h * 0.4);
          g.closePath();
          g.fill();
        },
      },
    },
    power: {
      magnet: {
        getImg: () => global.MagnetImg,
        ready: () => global.magnetReady,
        fallback: (g, x, y, w, h) => {
          g.fillStyle = "#00d1ff";
          g.fillRect(x, y, w, h);
        },
      },
      x2: {
        getImg: () => global.X2Img,
        ready: () => global.x2Ready,
        fallback: (g, x, y, w, h) => {
          g.fillStyle = "#00d1ff";
          g.fillRect(x, y, w, h);
        },
      },
      shield: {
        getImg: () => global.ShieldImg,
        ready: () => global.shieldReady,
        fallback: (g, x, y, w, h) => {
          g.fillStyle = "#00d1ff";
          g.fillRect(x, y, w, h);
        },
      },
      timeShard: {
        getImg: () => global.TimeImg,
        ready: () => global.timeReady,
        fallback: (g, x, y, w, h) => {
          g.fillStyle = "#00d1ff";
          g.fillRect(x, y, w, h);
        },
      },
    },
  };

  function drawItemSprite(g, kind, subtype, x, y, w, h) {
    const entry = ITEM_ASSETS[kind]?.[subtype];
    const img = entry?.getImg?.();
    if (entry && img && (img.complete || entry.ready?.())) {
      g.drawImage(img, x, y, w, h);
      return;
    }
    if (entry) {
      entry.fallback?.(g, x, y, w, h);
      return;
    }
    g.fillStyle = "#00d1ff";
    g.fillRect(x, y, w, h);
  }

  function getActiveBonuses() {
    return global.__SD_ACTIVE_BONUSES || global.activeBonuses || {};
  }

  class FallingItem {
    constructor(game, kind, subtype, x, y) {
      this.g = game;
      this.kind = kind;
      this.subtype = subtype;
      this.type = subtype;
      this.x = x;
      this.y = y;
      this.spawnScale = (CONFIG?.items?.spawnScale != null) ? CONFIG.items.spawnScale : 0.30;
      this.maxScale = 1;
      this.scale = this.spawnScale;
      this.alive = true;
      this._dead = false;
      this._tween = null;
      this.vx = 0;
      this.isNegative = NEGATIVE_TYPES.has(subtype);

      this.startY = y;
      this.endY = BASE_H - 80;
      this.fallDuration = Math.max(0.35, CONFIG?.fallDuration ?? 2.5);
      this.elapsed = 0;
      this.progress = 0;
    }

    update(dt) {
      if (!this.alive || this.dead) return;

      const fallSpeedMultiplier = getCurrentIntraLevelSpeedMultiplier();
      const fallDt = dt * fallSpeedMultiplier;

      this.elapsed += fallDt;
      const duration = this.fallDuration || 1;
      const linearProgress = clamp(this.elapsed / duration, 0, 1);
      this.progress = linearProgress;

      const eased = linearProgress * linearProgress;
      this.y = this.startY + (this.endY - this.startY) * eased;
      this.updateScaleFromVerticalPosition(linearProgress);

      if (linearProgress >= 1) {
        this.dead = true;
        return;
      }

      const damping = Math.exp(-8 * dt);
      this.vx *= damping;
      if (Math.abs(this.vx) < 0.01) this.vx = 0;

      const bonuses = getActiveBonuses();
      if (this.kind === "good" && bonuses?.magnet?.active) {
        const wallet = this.g?.wallet;
        if (wallet) {
          const walletCenter = wallet.x + wallet.w / 2;
          const dx = walletCenter - this.x;
          const strength = CONFIG?.magnet?.horizontalStrength ?? 4;
          this.vx += dx * strength * dt;
        }
      }

      if (this.vx) {
        const maxSpeed = 600;
        this.vx = clamp(this.vx, -maxSpeed, maxSpeed);
        this.x += this.vx * dt;
        const halfSize = (this.getBaseSize() * this.scale) / 2;
        const minX = halfSize;
        const maxX = BASE_W - halfSize;
        this.x = clamp(this.x, minX, maxX);
      }
    }

    updateScaleFromVerticalPosition(progressOverride) {
      const denom = Math.max(0.0001, (this.endY ?? BASE_H) - (this.startY ?? 0));
      const fallbackProgress = (this.y - (this.startY ?? 0)) / denom;
      const progress = clamp(progressOverride ?? fallbackProgress, 0, 1);
      const startScale = this.spawnScale ?? 0.3;
      const endScale = this.maxScale ?? 1;
      this.scale = startScale + (endScale - startScale) * progress;
      if (this.scale > endScale) this.scale = endScale;
    }

    get dead() {
      return this._dead;
    }

    set dead(value) {
      if (value && !this._dead) {
        this._dead = true;
        this.alive = false;
        if (this._tween) this._tween.kill();
      }
    }

    getBaseSize() {
      const base = CONFIG?.itemSize?.[this.subtype] ?? 64;
      const mul = CONFIG?.items?.scale ?? 1;
      return base * mul;
    }

    getBounds() {
      const size = this.getBaseSize() * this.scale;
      return {
        x: this.x - size / 2,
        y: this.y - size / 2,
        w: size,
        h: size,
      };
    }

    getCenter() {
      return { x: this.x, y: this.y };
    }

    draw(g) {
      if (!this.alive) return;
      const bounds = this.getBounds();
      drawItemSprite(g, this.kind, this.subtype, bounds.x, bounds.y, bounds.w, bounds.h);
    }
  }

  function getItemImagesForWarmup() {
    return [GoldImg, SilverImg, BronzeImg, DiamondImg, BombImg].filter(Boolean);
  }

  global.SD_ENTITIES = {
    ...(global.SD_ENTITIES || {}),
    FallingItem,
    drawItemSprite,
    ITEM_ASSETS,
    NEGATIVE_TYPES,
    getItemImagesForWarmup,
  };

  global.FallingItem = FallingItem;
})(window);
