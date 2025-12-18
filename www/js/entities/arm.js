(function (global) {
  const { CONFIG } = global.SD_CONFIG || {};
  const { clamp, rand } = global.SD_UTILS || {};
  const BASE_W = (global.SD_CANVAS?.BASE_W ?? global.SD_CONFIG?.portraitBase?.w);
  const BASE_H = (global.SD_CANVAS?.BASE_H ?? global.SD_CONFIG?.portraitBase?.h);

  const HAND_RIGHT_OVERFLOW_RATIO = 0.6;

  class Arm {
    constructor(game) { this.g = game; this.t = 0; this.frame = 0; this.handX = BASE_W / 2; this.spriteHCapPx = 0; this.targetX = BASE_W / 2; this.baseMoveSpeed = 120; this.moveSpeed = this.baseMoveSpeed; this.level = 1; this.retarget = 0; this.baseRetargetMin = 0.6; this.baseRetargetMax = 1.8; this.baseMaxStep = 140; this.baseJitter = 0.05; this.activityFactor = 1; this.minRetarget = this.baseRetargetMin; this.maxRetarget = this.baseRetargetMax; this.maxStep = this.baseMaxStep; this.maxIdleAtTarget = Infinity; this.jitterAmt = this.baseJitter; this._drawW = 90; this._drawH = 90; this._x = 0; this._y = 0; }
    applyCaps() { const maxH = Math.floor(BASE_H * CONFIG.maxTopActorH); this.h = Math.min(Math.floor(BASE_H * 0.21), maxH); }
    applyLevelSpeed(levelNumber) {
      const numeric = Number(levelNumber);
      const lvl = Number.isFinite(numeric) ? Math.max(1, Math.floor(numeric)) : 1;
      const multiplier = 1 + 0.05 * (lvl - 1);
      this.level = lvl;
      this.activityFactor = multiplier;
      this.moveSpeed = this.baseMoveSpeed * multiplier;
      this.maxStep = this.baseMaxStep * this.activityFactor;
      const intervalScale = 1 / this.activityFactor;
      this.minRetarget = Math.max(0.25, this.baseRetargetMin * intervalScale);
      this.maxRetarget = Math.max(this.minRetarget + 0.1, this.baseRetargetMax * intervalScale);
      this.jitterAmt = this.baseJitter * (0.6 + 0.4 * this.activityFactor);
      this.maxIdleAtTarget = (lvl > 1) ? Math.max(0.15, 0.45 * intervalScale) : Infinity;
      if (this.retarget > this.maxRetarget) { this.retarget = this.maxRetarget; }
    }
    update(dt) { this.t += dt; if (this.t > 0.2) { this.t = 0; this.frame = (this.frame + 1) % 2; } this.retarget -= dt; const padding = 16; const approxW = this._drawW || 90; const halfW = approxW / 2; const minX = padding + halfW; const rightOverflow = approxW * HAND_RIGHT_OVERFLOW_RATIO; const maxX = BASE_W - (padding + halfW) + rightOverflow; if (this.retarget <= 0) { const maxStep = this.maxStep; const next = clamp(this.handX + rand(-maxStep, maxStep), minX, maxX); this.targetX = next; this.retarget = rand(this.minRetarget, this.maxRetarget); } const dir = Math.sign(this.targetX - this.handX); this.handX += dir * this.moveSpeed * dt; this.handX = clamp(this.handX + rand(-this.jitterAmt, this.jitterAmt), minX, maxX); if (Math.abs(this.targetX - this.handX) < 2) { this.handX = this.targetX; if (Number.isFinite(this.maxIdleAtTarget)) this.retarget = Math.min(this.retarget, this.maxIdleAtTarget); } }
    draw(g) { const maxH = Math.floor(BASE_H * CONFIG.maxTopActorH); const targetH = Math.min(this.h, maxH); const y = Math.max(0, CONFIG.topActorOffsetY ?? 13); const img = (this.frame === 0 ? Hand.open : Hand.pinch); if (!Hand.ready || !img || !(img.naturalWidth > 0)) { this._drawW = 90; this._drawH = targetH; const w = this._drawW; const overflow = w * HAND_RIGHT_OVERFLOW_RATIO; const x = clamp(this.handX - w / 2, 10, BASE_W - w - 10 + overflow); this._x = x; this._y = y; return; }
      const natW = img.naturalWidth, natH = img.naturalHeight; const scale = targetH / natH; const drawW = natW * scale, drawH = natH * scale; const overflow = drawW * HAND_RIGHT_OVERFLOW_RATIO; const x = clamp(this.handX - drawW / 2, 10, BASE_W - drawW - 10 + overflow);
      g.save(); g.imageSmoothingEnabled = true; const drawX = Math.round(x), drawY = Math.round(y); g.drawImage(img, drawX, drawY, drawW, drawH); g.restore(); this._drawW = drawW; this._drawH = drawH; this._x = drawX; this._y = drawY; }
    spawnX() { return clamp((this._x || 0) + (this._drawW || 90) - 103, 16, BASE_W - 16); }
    spawnY() { return (this._y || 0) + (this._drawH || 48) - 88; }
  }

  global.SD_ENTITIES = {
    ...(global.SD_ENTITIES || {}),
    Arm,
  };

  global.Arm = Arm;
})(window);
