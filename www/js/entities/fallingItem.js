(function (global) {
  const { CONFIG = {} } = global.SD_CONFIG || {};
  const { clamp = (v) => v } = global.SD_UTILS || {};
  const BASE_W = global.SD_CANVAS?.BASE_W ?? global.SD_CONFIG?.portraitBase?.w;
  const BASE_H = global.SD_CANVAS?.BASE_H ?? global.SD_CONFIG?.portraitBase?.h;
  const getCurrentIntraLevelSpeedMultiplier = global.getCurrentIntraLevelSpeedMultiplier || (() => 1);
  const NEGATIVE_TYPES = global.NEGATIVE_TYPES || new Set();

  const ITEM_ASSETS = {
    good: {
      bronze: { getImg: () => global.BronzeImg, ready: () => global.bronzeReady, fallback: (g, x, y, w, h) => { g.fillStyle = '#c07a45'; g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); g.fill(); } },
      silver: { getImg: () => global.SilverImg, ready: () => global.silverReady, fallback: (g, x, y, w, h) => { g.fillStyle = '#cfd6e6'; g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); g.fill(); } },
      gold: { getImg: () => global.GoldImg, ready: () => global.goldReady, fallback: (g, x, y, w, h) => { g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); g.fill(); } },
      diamond: { getImg: () => global.DiamondImg, ready: () => global.diamondReady, fallback: (g, x, y, w, h) => { g.fillStyle = '#a8e6ff'; g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); g.fill(); } },
    },
    bad: {
      bomb: { getImg: () => global.BombImg, ready: () => global.bombReady, fallback: (g, x, y, w, h) => { g.fillStyle = '#333'; g.fillRect(x, y, w, h); } },
      shitcoin: { getImg: () => global.ShitcoinImg, ready: () => global.shitcoinReady, fallback: (g, x, y, w, h) => { g.fillStyle = '#8a6b3a'; g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); g.fill(); } },
      rugpull: { getImg: () => global.RugpullImg, ready: () => global.rugpullReady, fallback: (g, x, y, w, h) => { g.fillStyle = '#4a3d7a'; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill(); } },
      fakeAirdrop: { getImg: () => global.FakeADImg, ready: () => global.fakeADReady, fallback: (g, x, y, w, h) => { g.fillStyle = '#6b7cff'; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.fillRect(x + w / 2 - 3, y + h / 2 - 3, 6, 6); } },
      anvil: { getImg: () => global.AnvilImg, ready: () => global.anvilReady, fallback: (g, x, y, w, h) => { g.fillStyle = '#60656f'; g.beginPath(); g.moveTo(x + 2, y + h * 0.7); g.lineTo(x + w - 2, y + h * 0.7); g.lineTo(x + w * 0.7, y + h * 0.4); g.lineTo(x + w * 0.3, y + h * 0.4); g.closePath(); g.fill(); } },
    },
    power: {
      magnet: { getImg: () => global.MagnetImg, ready: () => global.magnetReady, fallback: (g, x, y, w, h) => { g.fillStyle = '#00d1ff'; g.fillRect(x, y, w, h); } },
      x2: { getImg: () => global.X2Img, ready: () => global.x2Ready, fallback: (g, x, y, w, h) => { g.fillStyle = '#00d1ff'; g.fillRect(x, y, w, h); } },
      shield: { getImg: () => global.ShieldImg, ready: () => global.shieldReady, fallback: (g, x, y, w, h) => { g.fillStyle = '#00d1ff'; g.fillRect(x, y, w, h); } },
      timeShard: { getImg: () => global.TimeImg, ready: () => global.timeReady, fallback: (g, x, y, w, h) => { g.fillStyle = '#00d1ff'; g.fillRect(x, y, w, h); } },
    },
  };

  function drawItemSprite(g, kind, subtype, x, y, w, h) {
    const entry = ITEM_ASSETS[kind]?.[subtype];
    if (entry) {
      const im = (typeof entry.getImg === 'function') ? entry.getImg() : entry.img;
      const ready = (typeof entry.ready === 'function') ? entry.ready() : undefined;
      if (im && (ready ?? im.complete)) {
        g.drawImage(im, x, y, w, h);
      } else {
        entry.fallback?.(g, x, y, w, h);
      }
      return;
    }
    g.fillStyle = '#00d1ff';
    g.fillRect(x, y, w, h);
  }

  class FallingItem {
    constructor(game, kind, subtype, x, y) {
      this.g = game;
      this.kind = kind;
      this.subtype = subtype;
      this.type = subtype;
      this.x = x;
      this.y = y;
      this.spawnScale = (CONFIG.items?.spawnScale != null) ? CONFIG.items.spawnScale : 0.30;
      this.maxScale = 1;
      this.scale = this.spawnScale;
      this.alive = true;
      this._dead = false;
      this._tween = null;
      this.vx = 0;
      this.isNegative = NEGATIVE_TYPES.has(subtype);

      this.startY = y;
      this.endY = BASE_H - 80;
      this.fallDuration = Math.max(0.35, CONFIG.fallDuration ?? 2.5);
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

      if (this.kind === 'good' && global.activeBonuses?.magnet?.active) {
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
      const base = CONFIG.itemSize?.[this.subtype] ?? 64;
      const mul = CONFIG.items?.scale ?? 1;
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

  global.SD_ENTITIES = {
    ...(global.SD_ENTITIES || {}),
    FallingItem,
  };

  global.FallingItem = FallingItem;
  global.drawItemSprite = drawItemSprite;
  global.ITEM_ASSETS = ITEM_ASSETS;
})(window);
