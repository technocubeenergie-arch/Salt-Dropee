(function initLegendResult(global) {
  const SD_LEGEND_RESULT = global.SD_LEGEND_RESULT || {};

  function bindLegendResultButtons() {
    const btnHome = global.document?.getElementById("legendHomeButton");
    const btnRetry = global.document?.getElementById("legendRetryButton");

    if (btnHome){
      btnHome.onclick = async () => {
        if (typeof global.playSound === "function") global.playSound("click");
        global.hideLegendResultScreen?.();
        const instance = global.Game?.instance;
        global.currentLevelIndex = 0;
        if (instance && typeof instance.reset === "function") {
          instance.reset({ showTitle: true });
        } else {
          global.hardResetRuntime?.();
          await global.loadLevel?.(0, { applyBackground: false, playMusic: false });
        }
      };
    }

    if (btnRetry){
      btnRetry.onclick = async () => {
        if (typeof global.playSound === "function") global.playSound("click");
        global.hideLegendResultScreen?.({ immediate: true });
        global.hardResetRuntime?.();
        const legendIndex = (global.LEGEND_LEVEL_INDEX >= 0) ? global.LEGEND_LEVEL_INDEX : global.currentLevelIndex;
        await global.loadLevel?.(legendIndex, { immediateBackground: true });
        global.resumeGameplay?.();
      };
    }
  }

  SD_LEGEND_RESULT.bindLegendResultButtons = bindLegendResultButtons;
  global.SD_LEGEND_RESULT = SD_LEGEND_RESULT;
})(typeof window !== 'undefined' ? window : globalThis);
