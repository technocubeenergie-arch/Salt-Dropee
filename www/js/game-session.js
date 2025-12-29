(function initializeGameSession(global){
  if (!global) return;

  const createGameSession = (deps = {}) => {
    const { Game = global.Game, getGameState = () => undefined } = deps;

    const game = typeof Game === 'function' ? new Game() : null;
    if (game) {
      global.game = game;
      if (typeof Game === 'function') {
        global.Game = Game;
        global.Game.instance = game;
      }
    }
    if (game && game.wallet) global.targetX = game.wallet.x + game.wallet.w / 2;

    const tick = (...args) => (typeof game?.step === 'function' ? game.step(...args) : undefined);
    const draw = (...args) => (typeof game?.render === 'function' ? game.render(...args) : undefined);
    const getState = () => ({
      state: game?.state,
      gameState: typeof getGameState === 'function' ? getGameState() : undefined,
    });

    return { game, tick, draw, getState };
  };

  global.SD_GAME_SESSION = global.SD_GAME_SESSION || {};
  if (typeof global.SD_GAME_SESSION.createGameSession !== 'function') {
    global.SD_GAME_SESSION.createGameSession = createGameSession;
  }
})(typeof window !== 'undefined' ? window : null);
