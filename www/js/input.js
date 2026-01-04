// Input & event wrappers for Salt Droppee
(function initInputModule(global){
  if (!global) return;

  const hasTouch = ('ontouchstart' in global) || global.navigator.maxTouchPoints > 0;
  const supportsPointerEvents = typeof global !== 'undefined' && 'PointerEvent' in global;
  const usePointerEventsForMouse = supportsPointerEvents && !hasTouch;

  const { clamp } = global.SD_UTILS || {};
  const clampFn = typeof clamp === 'function'
    ? clamp
    : (value, min, max) => Math.min(Math.max(value, min), max);

  const canvasAPI = global.SD_CANVAS || {};
  const inputLogger = global.SD_LOG?.createLogger
    ? global.SD_LOG.createLogger('input')
    : null;
  const logDebug = (...args) => inputLogger?.debug?.(...args);

  const DEBUG_INPUT_EVENT_TYPES = new Set([
    'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
    'mousedown', 'mousemove', 'mouseup',
    'touchstart', 'touchmove', 'touchend', 'touchcancel',
    'click', 'keydown', 'keyup',
  ]);

  const debugListenerRegistry = new WeakMap();

  function debugDescribeElement(target) {
    if (!target) return 'null';
    if (target === global) return 'window';
    if (target === global.document) return 'document';
    if (target === global.document?.body) return 'body';
    if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
      if (target.id) return `#${target.id}`;
      const tag = target.tagName ? target.tagName.toLowerCase() : 'element';
      if (target.classList && target.classList.length > 0) {
        const cls = Array.from(target.classList).join('.');
        return `${tag}.${cls}`;
      }
      return tag;
    }
    if (target && typeof target.nodeName === 'string') {
      return target.nodeName.toLowerCase();
    }
    return typeof target === 'string' ? target : 'unknown';
  }

  function debugFormatContext(context) {
    if (!context || typeof context !== 'object') return '';
    const filteredEntries = Object.entries(context).filter(([_, value]) => {
      const t = typeof value;
      return value == null || t === 'string' || t === 'number' || t === 'boolean';
    });
    if (filteredEntries.length === 0) return '';
    try {
      return ' ' + JSON.stringify(Object.fromEntries(filteredEntries));
    } catch (err) {
      void err;
      return '';
    }
  }

  function registerDebugListener(target, type, handler) {
    if (!target || typeof handler !== 'function') return { count: 0 };
    let typeMap = debugListenerRegistry.get(target);
    if (!typeMap) {
      typeMap = new Map();
      debugListenerRegistry.set(target, typeMap);
    }
    const list = typeMap.get(type) || [];
    list.push(handler);
    typeMap.set(type, list);
    return { count: list.length };
  }

  function unregisterDebugListener(target, type, handler) {
    if (!target || typeof handler !== 'function') return { count: 0 };
    const typeMap = debugListenerRegistry.get(target);
    if (!typeMap) return { count: 0 };
    const list = typeMap.get(type);
    if (!Array.isArray(list)) return { count: 0 };
    const idx = list.indexOf(handler);
    if (idx >= 0) {
      list.splice(idx, 1);
      if (list.length === 0) {
        typeMap.delete(type);
      } else {
        typeMap.set(type, list);
      }
    }
    if (typeMap.size === 0) {
      debugListenerRegistry.delete(target);
    }
    return { count: Array.isArray(list) ? list.length : 0 };
  }

  function logInputListener(action, target, type, opts, extra) {
    if (!DEBUG_INPUT_EVENT_TYPES.has(type)) return;
    const base = extra && typeof extra === 'object' ? { ...extra } : {};
    if (opts && typeof opts === 'object') {
      if (typeof opts.passive === 'boolean') base.passive = opts.passive;
      if (typeof opts.capture === 'boolean') base.capture = opts.capture;
    }
    const context = debugFormatContext(base);
    logDebug?.(`${action} ${type} -> ${debugDescribeElement(target)}${context}`);
  }

  function addEvent(el, type, handler, opts) {
    if (!el || !type || typeof handler !== 'function') return;
    const finalOpts = (opts === undefined || opts === null) ? { passive: true } : opts;
    el.addEventListener(type, handler, finalOpts);
    let count = 0;
    const info = registerDebugListener(el, type, handler);
    if (info && typeof info.count === 'number') {
      count = info.count;
    }
    logInputListener('attach', el, type, finalOpts, { count });
  }

  function removeEvent(el, type, handler, opts) {
    if (!el || !type || typeof handler !== 'function') return;
    const finalOpts = (opts === undefined || opts === null) ? false : opts;
    el.removeEventListener(type, handler, finalOpts);
    let count = 0;
    const info = unregisterDebugListener(el, type, handler);
    if (info && typeof info.count === 'number') {
      count = info.count;
    }
    const cleanOpts = typeof finalOpts === 'object' ? finalOpts : {};
    logInputListener('detach', el, type, cleanOpts, { count });
  }

  const INPUT = usePointerEventsForMouse
    ? {
      tap: 'pointerdown',
      down: 'pointerdown',
      move: 'pointermove',
      up: 'pointerup',
      cancel: 'pointercancel',
    }
    : {
      tap: hasTouch ? 'touchstart' : 'click',
      down: hasTouch ? 'touchstart' : 'mousedown',
      move: hasTouch ? 'touchmove' : 'mousemove',
      up:   hasTouch ? 'touchend'  : 'mouseup',
      cancel: hasTouch ? 'touchcancel' : null,
    };

  const input = {
    dash: false,
    dragging: false,
    pointerLastX: null,
    pointerVirtualX: null,
    pointerInvertState: false,
    pointerId: null,
  };

  const directionalSourceState = {
    keyboardLeft: false,
    keyboardRight: false,
    touchLeft: false,
    touchRight: false,
  };

  let leftPressed = false;
  let rightPressed = false;
  let activeControlMode = hasTouch ? 'swipe' : 'swipe';
  let inputEnabled = true;

  function recomputeDirectionalState() {
    leftPressed = directionalSourceState.keyboardLeft || directionalSourceState.touchLeft;
    rightPressed = directionalSourceState.keyboardRight || directionalSourceState.touchRight;
  }

  function resetDirectionalInputs() {
    directionalSourceState.keyboardLeft = false;
    directionalSourceState.keyboardRight = false;
    directionalSourceState.touchLeft = false;
    directionalSourceState.touchRight = false;
    leftPressed = false;
    rightPressed = false;
  }

  function setActiveControlMode(mode) {
    const normalized = (mode === 'zones' && hasTouch) ? 'zones' : 'swipe';
    activeControlMode = normalized;

    if (normalized === 'zones') {
      directionalSourceState.touchLeft = false;
      directionalSourceState.touchRight = false;
      recomputeDirectionalState();
      resetPointerDragState({ releaseCapture: true });
    } else if (directionalSourceState.touchLeft || directionalSourceState.touchRight) {
      directionalSourceState.touchLeft = false;
      directionalSourceState.touchRight = false;
      recomputeDirectionalState();
    }
  }

  function isTouchZoneModeActive() {
    return hasTouch && activeControlMode === 'zones';
  }

  function resetPointerDragState(options = {}) {
    const { releaseCapture = false, pointerId = null } = options;
    const activePointerId = Number.isInteger(pointerId) ? pointerId : input.pointerId;

    if (
      releaseCapture &&
      Number.isInteger(activePointerId) &&
      global.canvas &&
      typeof global.canvas.releasePointerCapture === 'function'
    ) {
      try {
        global.canvas.releasePointerCapture(activePointerId);
      } catch (err) {
        // ignore capture release errors
      }
    }

    input.dragging = false;
    input.pointerLastX = null;
    input.pointerVirtualX = null;
    input.pointerInvertState = typeof global.controlsAreInverted === 'function'
      ? global.controlsAreInverted()
      : false;
    input.pointerId = null;
  }

  function getRawHorizontalAxis() {
    if (leftPressed && !rightPressed) return -1;
    if (rightPressed && !leftPressed) return 1;
    return 0;
  }

  function getEffectiveHorizontalAxis() {
    const axis = getRawHorizontalAxis();
    return (typeof global.controlsAreInverted === 'function' && global.controlsAreInverted())
      ? -axis
      : axis;
  }

  function getWalletCenter(walletRef) {
    if (!walletRef) return (global.BASE_W || 0) / 2;
    return walletRef.x + walletRef.w / 2;
  }

  function isTouchLikeEvent(evt) {
    if (!evt) return false;
    if (typeof evt.pointerType === 'string') {
      return evt.pointerType === 'touch';
    }
    const type = evt.type;
    return typeof type === 'string' && type.startsWith('touch');
  }

  function isMatchingPointer(evt) {
    if (!evt || typeof evt.pointerId !== 'number') return true;
    if (!Number.isInteger(input.pointerId)) return true;
    return evt.pointerId === input.pointerId;
  }

  function getPrimaryPoint(evt) {
    if (hasTouch) {
      const touches = evt?.changedTouches || evt?.touches;
      if (touches && touches.length > 0) {
        return touches[0];
      }
    }
    return evt;
  }

  function describeCanvasRegionFromPoint(point) {
    if (!point || !Number.isFinite(point.y)) return '#canvas';
    const baseH = global.BASE_H || 0;
    const y = point.y;
    const wallet = global.game?.wallet;
    const walletBottom = wallet ? (wallet.y + wallet.h) : (baseH - 96);
    const footerThreshold = baseH - 4;
    if (y >= footerThreshold) {
      return '#footer';
    }
    if (y >= walletBottom) {
      return '#controlZone';
    }
    return '#canvas';
  }

  function classifyPointerTarget(evt, point) {
    if (!evt) return 'unknown';
    const target = evt.target;
    if (target === global) return 'window';
    if (target === global.document || target === global.document?.body) return 'document';
    const closest = typeof target?.closest === 'function' ? (sel) => target.closest(sel) : () => null;
    if (closest('#interLevelScreen')) return '#interLevel';
    if (closest('#legendResultScreen')) return '#interLevel';
    if (closest('#overlay')) {
      if (global.activeScreen === 'settings') return '#settings';
      if (global.activeScreen === 'paused') return '#pauseOverlay';
      if (global.activeScreen === 'title') return '#titleOverlay';
      if (global.activeScreen === 'gameover') return '#gameoverOverlay';
      if (global.activeScreen === 'legend') return '#legendOverlay';
      return '#overlay';
    }
    if (global.canvas && (target === global.canvas || closest('#gameCanvas'))) {
      return describeCanvasRegionFromPoint(point);
    }
    if (target && target.id) return `#${target.id}`;
    return debugDescribeElement(target);
  }

  function logPointerTrace(eventName, evt, meta = {}) {
    const { point, ...rest } = (meta && typeof meta === 'object') ? meta : {};
    const logicalTarget = classifyPointerTarget(evt, point);
    const info = { screen: global.activeScreen, ...rest };
    if (typeof evt?.pointerId === 'number') info.pointerId = evt.pointerId;
    if (typeof evt?.pointerType === 'string') info.pointerType = evt.pointerType;
    if (!info.pointerType && typeof evt?.type === 'string') {
      if (evt.type.startsWith('mouse')) info.pointerType = 'mouse';
      if (evt.type.startsWith('touch')) info.pointerType = 'touch';
    }
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      info.x = Math.round(point.x);
      info.y = Math.round(point.y);
    }
    logDebug?.(`${eventName} target=${logicalTarget}${debugFormatContext(info)}`);
  }

  function projectClientToCanvas(clientX, clientY) {
    if (typeof canvasAPI.projectClientToCanvas === 'function') {
      return canvasAPI.projectClientToCanvas(clientX, clientY);
    }
    if (!global.canvas) return { x: 0, y: 0 };
    const rect = global.canvas.getBoundingClientRect();
    const width = rect.width || 0;
    const height = rect.height || 0;
    if (width === 0 || height === 0) {
      return { x: (global.BASE_W || 0) / 2, y: (global.BASE_H || 0) / 2 };
    }
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return { x: (global.BASE_W || 0) / 2, y: (global.BASE_H || 0) / 2 };
    }
    return {
      x: ((clientX - rect.left) / width) * (global.BASE_W || 0),
      y: ((clientY - rect.top) / height) * (global.BASE_H || 0),
    };
  }

  function getCanvasPoint(evt){
    if (typeof canvasAPI.getCanvasPoint === 'function') {
      return canvasAPI.getCanvasPoint(evt);
    }
    if (!global.canvas) return { x:0, y:0 };
    const point = getPrimaryPoint(evt);
    if (!point) return { x:0, y:0 };
    return projectClientToCanvas(point.clientX, point.clientY);
  }

  function handleTouchZoneEvent(evt) {
    if (!isTouchZoneModeActive()) {
      if (directionalSourceState.touchLeft || directionalSourceState.touchRight) {
        directionalSourceState.touchLeft = false;
        directionalSourceState.touchRight = false;
        recomputeDirectionalState();
      }
      return false;
    }

    if (!inputEnabled) {
      if (directionalSourceState.touchLeft || directionalSourceState.touchRight) {
        directionalSourceState.touchLeft = false;
        directionalSourceState.touchRight = false;
        recomputeDirectionalState();
      }
      return true;
    }

    const wallet = global.game?.wallet;
    const touches = evt?.touches || evt?.changedTouches || (evt?.pointerType === 'touch' ? [evt] : null);
    if (!wallet || !touches) {
      if (directionalSourceState.touchLeft || directionalSourceState.touchRight) {
        directionalSourceState.touchLeft = false;
        directionalSourceState.touchRight = false;
        recomputeDirectionalState();
      }
      return true;
    }

    const zoneTop = clampFn(wallet.y + wallet.h, 0, global.BASE_H || 0);
    const zoneBottom = global.BASE_H || 0;
    const zoneHeight = zoneBottom - zoneTop;

    let leftActive = false;
    let rightActive = false;

    if (zoneHeight > 0 && global.canvas) {
      for (let i = 0; i < touches.length; i += 1) {
        const touch = touches[i];
        if (!touch) continue;
        const point = projectClientToCanvas(touch.clientX, touch.clientY);
        if (point.y < zoneTop || point.y > zoneBottom) continue;
        if (point.x < (global.BASE_W || 0) / 2) {
          leftActive = true;
        } else {
          rightActive = true;
        }
        if (leftActive && rightActive) break;
      }
    }

    directionalSourceState.touchLeft = leftActive;
    directionalSourceState.touchRight = rightActive;
    recomputeDirectionalState();

    return true;
  }

  function onKeyDown(e){
    if (typeof global.shouldBlockGameplayShortcuts === 'function' && global.shouldBlockGameplayShortcuts(e)) return;
    const allowTitleStart = (e.code === 'Enter');
    const canTriggerTitleStart = allowTitleStart && global.activeScreen === 'title';
    if (!inputEnabled && !canTriggerTitleStart) return;

    if (!inputEnabled && canTriggerTitleStart){
      const g = global.Game?.instance;
      if (g && g.state==='title'){
        if (typeof global.playSound === 'function') {
          global.playSound("click");
        }
        global.requestAnimationFrame(()=> g.uiStartFromTitle());
      }
      return;
    }

    let changed = false;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA'){
      directionalSourceState.keyboardLeft = true;
      changed = true;
    }
    if (e.code === 'ArrowRight' || e.code === 'KeyD'){
      directionalSourceState.keyboardRight = true;
      changed = true;
    }
    if (changed) recomputeDirectionalState();
    if (e.code === 'Space') input.dash = true;
    if (canTriggerTitleStart){
      const g = global.Game?.instance;
      if (g && g.state==='title'){
        if (typeof global.playSound === 'function') {
          global.playSound("click");
        }
        global.requestAnimationFrame(()=> g.uiStartFromTitle());
      }
    }
  }

  function onKeyUp(e){
    if (typeof global.shouldBlockGameplayShortcuts === 'function' && global.shouldBlockGameplayShortcuts(e)) return;
    let changed = false;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      directionalSourceState.keyboardLeft = false;
      changed = true;
    }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      directionalSourceState.keyboardRight = false;
      changed = true;
    }
    if (changed) recomputeDirectionalState();
    if (e.code === 'Space') input.dash = false;
  }

  function onPointerDown(e){
    const point = getCanvasPoint(e);
    if (isTouchLikeEvent(e) && handleTouchZoneEvent(e)) {
      logPointerTrace('pointerdown', e, { point, status: 'touch-zone-delegated' });
      return;
    }

    if (!inputEnabled) {
      logPointerTrace('pointerdown', e, { point, status: 'input-disabled' });
      resetPointerDragState({ releaseCapture: true });
      return;
    }

    logPointerTrace('pointerdown', e, { point, status: 'drag-start' });
    resetPointerDragState({ releaseCapture: true });

    if (typeof e.pointerId === 'number') {
      input.pointerId = e.pointerId;
      const target = e.target;
      if (target && typeof target.setPointerCapture === 'function') {
        try {
          target.setPointerCapture(e.pointerId);
        } catch (err) {
          // ignore capture errors
        }
      }
    } else {
      input.pointerId = null;
    }

    input.dragging = true;
    input.pointerLastX = point.x;
    input.pointerInvertState = typeof global.controlsAreInverted === 'function'
      ? global.controlsAreInverted()
      : false;
    if (global.game && global.game.wallet) {
      input.pointerVirtualX = point.x;
      if (typeof global.animateWalletToCenter === 'function') {
        global.animateWalletToCenter(global.game.wallet, input.pointerVirtualX);
      }
    } else {
      input.pointerVirtualX = point.x;
    }
  }

  function onPointerMove(e){
    if (isTouchLikeEvent(e) && handleTouchZoneEvent(e)) return;
    if (!inputEnabled || !input.dragging || !isMatchingPointer(e)) return;
    const point = getCanvasPoint(e);
    if (!global.game || !global.game.wallet) return;

    const inverted = typeof global.controlsAreInverted === 'function'
      ? global.controlsAreInverted()
      : false;
    if (!Number.isFinite(input.pointerVirtualX)) {
      input.pointerVirtualX = Number.isFinite(global.targetX)
        ? global.targetX
        : getWalletCenter(global.game.wallet);
    }

    if (inverted !== input.pointerInvertState || !Number.isFinite(input.pointerLastX)) {
      input.pointerInvertState = inverted;
      input.pointerLastX = point.x;
      input.pointerVirtualX = Number.isFinite(global.targetX)
        ? global.targetX
        : getWalletCenter(global.game.wallet);
    }

    const delta = point.x - input.pointerLastX;
    input.pointerLastX = point.x;

    const direction = inverted ? -1 : 1;
    input.pointerVirtualX += direction * delta;
    if (typeof global.animateWalletToCenter === 'function') {
      global.animateWalletToCenter(global.game.wallet, input.pointerVirtualX);
    }
  }

  function onPointerUp(e){
    const point = getCanvasPoint(e);
    if (isTouchLikeEvent(e) && handleTouchZoneEvent(e)) {
      logPointerTrace('pointerup', e, { point, status: 'touch-zone-delegated' });
      return;
    }
    if (!isMatchingPointer(e) && Number.isInteger(input.pointerId)) {
      logPointerTrace('pointerup', e, { point, status: 'non-matching-pointer' });
      return;
    }
    logPointerTrace('pointerup', e, { point, status: 'release' });
    const pointerId = typeof e.pointerId === 'number' ? e.pointerId : null;
    resetPointerDragState({ releaseCapture: true, pointerId });
  }

  function disablePlayerInput(reason = 'unspecified'){
    inputEnabled = false;
    logDebug?.(`disable player input${debugFormatContext({ reason, screen: global.activeScreen })}`);
    resetPointerDragState({ releaseCapture: true });
    input.dash = false;
    resetDirectionalInputs();
  }

  function enablePlayerInput(reason = 'unspecified'){
    inputEnabled = true;
    logDebug?.(`enable player input${debugFormatContext({ reason, screen: global.activeScreen })}`);
    resetPointerDragState({ releaseCapture: true });
    input.dash = false;
  }

  global.SD_INPUT = {
    hasTouch,
    supportsPointerEvents,
    usePointerEventsForMouse,
    DEBUG_INPUT_EVENT_TYPES,
    debugDescribeElement,
    debugFormatContext,
    addEvent,
    removeEvent,
    INPUT,
    input,
    directionalSourceState,
    recomputeDirectionalState,
    resetDirectionalInputs,
    setActiveControlMode,
    isTouchZoneModeActive,
    resetPointerDragState,
    getRawHorizontalAxis,
    getEffectiveHorizontalAxis,
    getWalletCenter,
    isTouchLikeEvent,
    isMatchingPointer,
    handleTouchZoneEvent,
    getPrimaryPoint,
    projectClientToCanvas,
    getCanvasPoint,
    classifyPointerTarget,
    describeCanvasRegionFromPoint,
    logPointerTrace,
    onKeyDown,
    onKeyUp,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    disablePlayerInput,
    enablePlayerInput,
  };
})(typeof window !== 'undefined' ? window : globalThis);
