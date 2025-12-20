(function initNav(global) {
  const SD_NAV = global.SD_NAV || {};

  const uiPanels = global.SD_UI_PANELS || {};
  const normalizeScreenName = typeof uiPanels.normalizeScreenName === 'function'
    ? uiPanels.normalizeScreenName
    : (value) => (typeof value === 'string' && value.trim()) ? value : 'unknown';
  const getActiveScreen = typeof uiPanels.getActiveScreen === 'function'
    ? uiPanels.getActiveScreen
    : (() => 'unknown');
  const setActiveScreen = typeof uiPanels.setActiveScreen === 'function'
    ? uiPanels.setActiveScreen
    : (() => 'unknown');

  let getState = () => ({ activeScreen: getActiveScreen(), previousScreen: null, returnTo: null });
  let setState = (value = {}) => value;
  let log = null;

  function init(options = {}) {
    if (typeof options.getState === 'function') {
      getState = options.getState;
    }
    if (typeof options.setState === 'function') {
      setState = options.setState;
    }
    if (typeof options.log === 'function') {
      log = options.log;
    }

    const current = getActiveScreen();
    const state = getState() || {};
    setState({
      ...state,
      activeScreen: normalizeScreenName(state.activeScreen || current),
      previousScreen: state.previousScreen || null,
      returnTo: state.returnTo || null,
    });
  }

  function getCurrent() {
    const state = getState() || {};
    const current = normalizeScreenName(getActiveScreen());
    if (state.activeScreen !== current) {
      setState({ ...state, activeScreen: current });
    }
    return current;
  }

  function goto(screen, meta = {}) {
    const current = getCurrent();
    const next = normalizeScreenName(screen);
    const state = getState() || {};
    const nextState = {
      ...state,
      previousScreen: current,
      activeScreen: next,
      returnTo: meta && Object.prototype.hasOwnProperty.call(meta, 'returnTo') ? meta.returnTo : state.returnTo || null,
    };
    setState(nextState);
    setActiveScreen(next, meta);
    if (log) {
      log('goto', { from: current, to: next, meta, state: nextState });
    }
    return next;
  }

  function back(meta = {}) {
    const state = getState() || {};
    const current = getCurrent();
    const targetRaw = meta.to || state.returnTo || state.previousScreen || current;
    const target = normalizeScreenName(targetRaw);
    const nextState = {
      ...state,
      previousScreen: current,
      activeScreen: target,
      returnTo: null,
    };
    setState(nextState);
    setActiveScreen(target, { ...meta, via: meta.via || 'back', from: current });
    if (log) {
      log('back', { from: current, to: target, meta, state: nextState });
    }
    return target;
  }

  SD_NAV.init = init;
  SD_NAV.goto = goto;
  SD_NAV.back = back;
  SD_NAV.getCurrent = getCurrent;

  global.SD_NAV = SD_NAV;
})(typeof window !== 'undefined' ? window : globalThis);
