// ================================
// Salt Droppee — gameplay math utils
// ================================

(function initSaltDroppeeGameMath(){
  function checkAABB(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  const exported = {
    checkAABB,
  };

  window.SD_GAME_MATH = Object.assign({}, window.SD_GAME_MATH, exported);
  Object.assign(window, exported);
})();
