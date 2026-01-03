(function initLegendResult(global) {
  const SD_LEGEND_RESULT = global.SD_LEGEND_RESULT || {};

  function showLegendResultScreen(reason = "time"){
    void reason;
    global.hideInterLevelScreen();

    const screen = global.document.getElementById("legendResultScreen");
    const title = global.document.getElementById("legendTitle");
    const message = global.document.getElementById("legendMessage");
    if (!screen) return;

    global.clearMainOverlay(screen);

    global.gotoScreen('interLevel', { via: 'showLegendResultScreen', reason });

    // Les résultats du mode Légende sont enregistrés uniquement dans la table "scores".
    // On évite ici toute sauvegarde de progression automatique afin de ne pas écrire
    // dans la table "progress" qui est réservée aux sauvegardes manuelles.
    global.submitLegendScoreIfNeeded(reason || 'end');
    global.markLegendRunComplete();

    if (typeof global.Game !== "undefined" && global.Game.instance) {
      global.Game.instance.settingsReturnView = "legend";
    }

    if (title) {
      title.textContent = "Mode Légende";
    }

    const numericScore = Number.isFinite(global.score) ? global.score : Number(global.score) || 0;
    const formattedScore = typeof global.formatScore === "function"
      ? global.formatScore(numericScore)
      : String(numericScore | 0);

    if (message) {
      message.textContent = `Félicitations, votre score est de ${formattedScore}.`;
    }

    global.showExclusiveOverlay(screen);
  }

  function hideLegendResultScreen(options = {}){
    const screen = global.document?.getElementById("legendResultScreen");
    if (!screen) return;
    global.hideOverlay?.(screen, options);
  }

  function bindLegendResultButtons() {
    const btnHome = global.document?.getElementById("legendHomeButton");
    const btnRetry = global.document?.getElementById("legendRetryButton");

    if (btnHome){
      btnHome.onclick = async () => {
        if (typeof global.playSound === "function") global.playSound("click");
        hideLegendResultScreen();
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
        hideLegendResultScreen({ immediate: true });
        global.hardResetRuntime?.();
        const legendIndex = (global.LEGEND_LEVEL_INDEX >= 0) ? global.LEGEND_LEVEL_INDEX : global.currentLevelIndex;
        await global.loadLevel?.(legendIndex, { immediateBackground: true });
        global.resumeGameplay?.();
      };
    }
  }

  SD_LEGEND_RESULT.showLegendResultScreen = showLegendResultScreen;
  SD_LEGEND_RESULT.hideLegendResultScreen = hideLegendResultScreen;
  SD_LEGEND_RESULT.bindLegendResultButtons = bindLegendResultButtons;
  global.SD_LEGEND_RESULT = SD_LEGEND_RESULT;
})(typeof window !== 'undefined' ? window : globalThis);
