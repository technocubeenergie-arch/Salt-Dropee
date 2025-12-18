// Canvas, viewport & projection helpers for Salt Droppee
(function initCanvasModule(global) {
  if (!global) return;

  const config = global.SD_CONFIG || {};
  const portraitBase = config.CONFIG?.portraitBase || config.portraitBase || {};
  const BASE_W = portraitBase.w || 0;
  const BASE_H = portraitBase.h || 0;

  const state = {
    canvas: null,
    ctx: null,
    DPR: 1,
    SS: 1,
    SCALE_FACTOR: 1,
    SCALE: 1,
    VIEW_W: BASE_W,
    VIEW_H: BASE_H,
  };

  function updateCanvasReferences(canvasEl) {
    if (canvasEl) {
      state.canvas = canvasEl;
      state.ctx = (typeof canvasEl.getContext === 'function')
        ? canvasEl.getContext('2d')
        : state.ctx;
    }
    if (state.canvas) {
      global.canvas = state.canvas;
    }
    if (state.ctx) {
      global.ctx = state.ctx;
    }
    return { canvas: state.canvas, ctx: state.ctx };
  }

  function initCanvasContext(options = {}) {
    const opts = (options && typeof options === 'object') ? options : {};
    const fromOptions = opts.canvas;
    const canvasId = typeof opts.canvasId === 'string' ? opts.canvasId : 'gameCanvas';
    const node = fromOptions || global.document?.getElementById(canvasId);
    return updateCanvasReferences(node || state.canvas);
  }

  function computeSupersample() {
    if (typeof global.location?.search === 'string') {
      const params = new URLSearchParams(global.location.search);
      const parsed = parseFloat(params.get('ss'));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    const renderCfg = config.CONFIG?.render || config.render || {};
    if (typeof renderCfg.supersample === 'number' && renderCfg.supersample > 0) {
      return renderCfg.supersample;
    }
    return 1;
  }

  function setupHiDPI() {
    if (!state.canvas || !state.ctx) return;
    state.DPR = Math.max(1, global.devicePixelRatio || 1);
    state.SS = computeSupersample();
    state.SCALE_FACTOR = Math.min(4, state.DPR * state.SS);
    state.canvas.width = BASE_W * state.SCALE_FACTOR;
    state.canvas.height = BASE_H * state.SCALE_FACTOR;
    state.ctx.setTransform(state.SCALE_FACTOR, 0, 0, state.SCALE_FACTOR, 0, 0);
    state.ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in state.ctx) {
      state.ctx.imageSmoothingQuality = 'high';
    }
  }

  function positionHUD() {
    const canvasEl = state.canvas || global.document?.getElementById('gameCanvas');
    const hud = global.document?.getElementById('hud');
    if (!canvasEl || !hud) return;

    const rect = canvasEl.getBoundingClientRect();
    const offsetPx = Math.round(rect.height * 0.21);

    hud.style.setProperty('--hud-top', offsetPx + 'px');
  }

  function resizeCanvas() {
    if (!state.canvas) return;
    const vw = global.innerWidth;
    const vh = global.innerHeight;
    const scale = Math.min(vw / BASE_W, vh / BASE_H);
    state.SCALE = scale;
    state.VIEW_W = Math.floor(BASE_W * scale);
    state.VIEW_H = Math.floor(BASE_H * scale);
    state.canvas.style.width = state.VIEW_W + 'px';
    state.canvas.style.height = state.VIEW_H + 'px';
    setupHiDPI();
    positionHUD();
  }

  function projectClientToCanvas(clientX, clientY) {
    if (!state.canvas) return { x: 0, y: 0 };
    const rect = state.canvas.getBoundingClientRect();
    const width = rect.width || 0;
    const height = rect.height || 0;
    if (width === 0 || height === 0) {
      return { x: BASE_W / 2, y: BASE_H / 2 };
    }
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return { x: BASE_W / 2, y: BASE_H / 2 };
    }
    return {
      x: ((clientX - rect.left) / width) * BASE_W,
      y: ((clientY - rect.top) / height) * BASE_H,
    };
  }

  function getPrimaryPoint(evt) {
    const getPrimary = global.SD_INPUT?.getPrimaryPoint;
    if (typeof getPrimary === 'function') {
      return getPrimary(evt);
    }
    if (evt?.touches && evt.touches.length > 0) {
      return evt.touches[0];
    }
    if (evt?.changedTouches && evt.changedTouches.length > 0) {
      return evt.changedTouches[0];
    }
    return evt || null;
  }

  function getCanvasPoint(evt) {
    if (!state.canvas) return { x: 0, y: 0 };
    const point = getPrimaryPoint(evt);
    if (!point) return { x: 0, y: 0 };
    return projectClientToCanvas(point.clientX, point.clientY);
  }

  const api = {
    BASE_W,
    BASE_H,
    initCanvasContext,
    setupHiDPI,
    resizeCanvas,
    positionHUD,
    projectClientToCanvas,
    getCanvasPoint,
    getCanvas: () => state.canvas,
    getContext: () => state.ctx,
    getScale: () => state.SCALE,
    getScaleFactor: () => state.SCALE_FACTOR,
    getSupersample: () => state.SS,
    getDevicePixelRatio: () => state.DPR,
    getViewSize: () => ({ width: state.VIEW_W, height: state.VIEW_H }),
  };

  global.SD_CANVAS = api;
  global.BASE_W = BASE_W;
  global.BASE_H = BASE_H;
})(typeof window !== 'undefined' ? window : null);
