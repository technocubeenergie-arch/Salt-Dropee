// ================================
// Salt Droppee — Audio (music/sfx)
// ================================

(function initAudioModule(global) {
  if (!global) return;

  const gsap = global.gsap;
  const config = global.SD_CONFIG || {};
  const {
    INTER_LEVEL_SOUND_SOURCES = {},
    MENU_MUSIC_SRC = '',
  } = config;

  const inputApi = global.SD_INPUT || {};
  const addEvt = typeof inputApi.addEvent === 'function'
    ? inputApi.addEvent
    : (target, type, handler, opts) => target?.addEventListener?.(type, handler, opts);
  const removeEvt = typeof inputApi.removeEvent === 'function'
    ? inputApi.removeEvent
    : (target, type, handler, opts) => target?.removeEventListener?.(type, handler, opts);

  const audioState = global.SD_AUDIO_STATE || (global.SD_AUDIO_STATE = {});
  if (!audioState.trackedAudio) {
    audioState.trackedAudio = new Set();
  }
  if (!audioState.trackedMeta) {
    audioState.trackedMeta = new Map();
  }
  if (!audioState.pausedSnapshot) {
    audioState.pausedSnapshot = new Map();
  }
  if (typeof audioState.audioPausedByGamePause !== 'boolean') {
    audioState.audioPausedByGamePause = false;
  }

  let currentMusic = null;
  const musicVolume = 0.6;
  let musicEnabled = true;
  let menuMusic = null;
  let musicUnlockListener = null;
  let musicUnlockCompleted = false;
  let interLevelAudio = null;

  if (typeof global.isSoundEnabled === 'function') {
    try {
      musicEnabled = !!global.isSoundEnabled();
    } catch (_) {}
  }

  function registerAudioElement(audio, meta = {}) {
    if (!audio) return;
    audioState.trackedAudio.add(audio);
    const existing = audioState.trackedMeta.get(audio) || {};
    audioState.trackedMeta.set(audio, { ...existing, ...meta });
  }

  function getAudioRole(audio) {
    return audioState.trackedMeta.get(audio)?.role || 'sfx';
  }

  function pauseAudioElement(audio, { reset = false } = {}) {
    if (!audio) return;
    try {
      if (!audio.paused) {
        audio.pause();
      }
      if (reset) {
        audio.currentTime = 0;
      }
    } catch (_) {}
  }

  function getInterLevelSoundSrc(levelIndex) {
    if (levelIndex != null && Object.prototype.hasOwnProperty.call(INTER_LEVEL_SOUND_SOURCES, levelIndex)) {
      return INTER_LEVEL_SOUND_SOURCES[levelIndex];
    }
    return INTER_LEVEL_SOUND_SOURCES.default || null;
  }

  function getInterLevelAudioForSrc(src) {
    if (!src) return null;

    if (interLevelAudio && interLevelAudio.src === src) {
      return interLevelAudio.element;
    }

    if (interLevelAudio && interLevelAudio.element) {
      try {
        interLevelAudio.element.pause();
        interLevelAudio.element.currentTime = 0;
      } catch (_) {}
    }

    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.loop = false;
    audio.volume = 0.9;

    registerAudioElement(audio, { role: 'sfx' });
    interLevelAudio = { element: audio, src };
    return audio;
  }

  function canPlayInterLevelAudio() {
    let effectsEnabled = true;
    if (typeof global.isSoundEnabled === 'function') {
      try {
        effectsEnabled = !!global.isSoundEnabled();
      } catch (_) {}
    }
    return effectsEnabled || musicEnabled;
  }

  function playInterLevelAudioForLevel(levelIndex) {
    if (audioState.audioPausedByGamePause) return;
    if (!canPlayInterLevelAudio()) return;
    const src = getInterLevelSoundSrc(levelIndex);
    if (!src) return;
    const audio = getInterLevelAudioForSrc(src);
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch (_) {}
    const maybe = audio.play();
    if (maybe && typeof maybe.catch === 'function') {
      maybe.catch(() => {});
    }
  }

  function stopInterLevelAudio() {
    if (!interLevelAudio || !interLevelAudio.element) return;
    try {
      interLevelAudio.element.pause();
      interLevelAudio.element.currentTime = 0;
    } catch (_) {}
  }

  function tryFadeOut(aud) {
    if (!aud) return;
    if (!gsap) {
      try {
        aud.pause();
        aud.currentTime = 0;
      } catch (_) {}
      return;
    }
    gsap.to(aud, {
      volume: 0,
      duration: 0.4,
      ease: "power1.out",
      onComplete: () => {
        try {
          aud.pause();
          aud.currentTime = 0;
        } catch (_) {}
      }
    });
  }

  function safePlayMusic(aud) {
    if (!aud || !musicEnabled) {
      return Promise.resolve(false);
    }
    if (audioState.audioPausedByGamePause) {
      return Promise.resolve(false);
    }

    if (gsap && typeof gsap.killTweensOf === 'function') {
      gsap.killTweensOf(aud);
    }

    try {
      aud.loop = true;
    } catch (_) {}

    aud.volume = 0;

    const playPromise = aud.play();
    if (!playPromise || typeof playPromise.then !== 'function') {
      if (gsap) {
        gsap.to(aud, { volume: musicVolume, duration: 0.6, ease: "power2.out" });
      } else {
        aud.volume = musicVolume;
      }
      return Promise.resolve(!aud.paused);
    }

    return playPromise.then(() => {
      if (gsap) {
        gsap.to(aud, { volume: musicVolume, duration: 0.6, ease: "power2.out" });
      } else {
        aud.volume = musicVolume;
      }
      return true;
    }).catch(() => false);
  }

  function setLevelMusic(audio) {
    const sameAudio = !!audio && currentMusic === audio;
    if (currentMusic && currentMusic !== audio) {
      tryFadeOut(currentMusic);
    }
    currentMusic = audio || null;
    if (!currentMusic) {
      return;
    }
    registerAudioElement(currentMusic, { role: 'music' });
    if (!sameAudio) {
      try {
        currentMusic.currentTime = 0;
      } catch (_) {}
      safePlayMusic(currentMusic);
      return;
    }
    if (currentMusic.paused && musicEnabled) {
      safePlayMusic(currentMusic);
    }
  }

  function stopLevelMusic() {
    if (!currentMusic) return;
    tryFadeOut(currentMusic);
    currentMusic = null;
  }

  function getMenuMusic() {
    if (!menuMusic) {
      menuMusic = new Audio(MENU_MUSIC_SRC);
    } else if (!menuMusic.src) {
      menuMusic.src = MENU_MUSIC_SRC;
    }
    menuMusic.loop = true;
    menuMusic.preload = "auto";
    registerAudioElement(menuMusic, { role: 'music' });
    return menuMusic;
  }

  function playMenuMusic() {
    unlockMusicOnce();
    if (audioState.audioPausedByGamePause) {
      return;
    }
    const audio = getMenuMusic();
    setLevelMusic(audio);
  }

  function stopMenuMusic() {
    if (!menuMusic) return;
    if (gsap?.killTweensOf) {
      gsap.killTweensOf(menuMusic);
    }
    try {
      menuMusic.pause();
      menuMusic.currentTime = 0;
    } catch (_) {}
    menuMusic.loop = false;
    if (menuMusic.src) {
      try {
        menuMusic.removeAttribute('src');
        menuMusic.load();
      } catch (_) {}
    }
    if (currentMusic === menuMusic) {
      currentMusic = null;
    }
  }

  function unlockMusicOnce() {
    if (musicUnlockCompleted || musicUnlockListener) return;

    const cleanup = () => {
      if (!musicUnlockListener) return;
      removeEvt(global, 'pointerdown', musicUnlockListener);
      removeEvt(global, 'touchstart', musicUnlockListener);
      removeEvt(global, 'mousedown', musicUnlockListener);
      musicUnlockListener = null;
      musicUnlockCompleted = true;
    };

    musicUnlockListener = () => {
      const audio = currentMusic || menuMusic || getMenuMusic();
      if (!audio) return;

      const maybePromise = safePlayMusic(audio);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then((played) => {
          if (played) {
            cleanup();
          }
        });
      } else if (!audio.paused) {
        cleanup();
      }
    };

    addEvt(global, 'pointerdown', musicUnlockListener);
    addEvt(global, 'touchstart', musicUnlockListener);
    addEvt(global, 'mousedown', musicUnlockListener);
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('load', unlockMusicOnce);
  }

  const originalSetSoundEnabled = typeof global.setSoundEnabled === 'function'
    ? global.setSoundEnabled
    : null;

  function patchedSetSoundEnabled(enabled) {
    if (originalSetSoundEnabled) {
      originalSetSoundEnabled(enabled);
    }
    musicEnabled = !!enabled;
    if (!musicEnabled) {
      tryFadeOut(currentMusic);
      stopInterLevelAudio();
    } else {
      safePlayMusic(currentMusic);
    }
  }

  function pauseAllAudio({ reason } = {}) {
    audioState.audioPausedByGamePause = true;
    audioState.pausedSnapshot.clear();

    for (const audio of audioState.trackedAudio) {
      if (!audio) continue;
      const role = getAudioRole(audio);
      const wasPlaying = !audio.paused;
      if (wasPlaying) {
        audioState.pausedSnapshot.set(audio, {
          role,
          time: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
        });
      }
      if (role === 'music') {
        pauseAudioElement(audio, { reset: false });
      } else {
        pauseAudioElement(audio, { reset: true });
      }
    }

    const audioContext = global.SD_AUDIO_CONTEXT || global.audioContext || null;
    if (audioContext && typeof audioContext.suspend === 'function' && audioContext.state === 'running') {
      audioContext.suspend().catch(() => {});
    }
  }

  function resumeAllAudio({ reason } = {}) {
    if (reason !== 'user-resume') return false;
    if (!audioState.audioPausedByGamePause) return false;

    audioState.audioPausedByGamePause = false;

    const audioContext = global.SD_AUDIO_CONTEXT || global.audioContext || null;
    if (audioContext && typeof audioContext.resume === 'function' && audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    const activeScreen = typeof global.getActiveScreen === 'function' ? global.getActiveScreen() : null;
    const gameState = global.gameState;
    const game = global.game;
    const isPlaying = gameState === 'playing' || game?.state === 'playing';
    const isTitle = activeScreen === 'title' || game?.state === 'title';

    if (currentMusic) {
      if (currentMusic === menuMusic) {
        if (isTitle) {
          safePlayMusic(currentMusic);
        }
      } else if (isPlaying) {
        safePlayMusic(currentMusic);
      }
    }

    return true;
  }

  global.setSoundEnabled = patchedSetSoundEnabled;

  const exported = {
    registerAudioElement,
    pauseAllAudio,
    resumeAllAudio,
    isAudioPausedByGamePause: () => audioState.audioPausedByGamePause,
    playMenuMusic,
    stopMenuMusic,
    setLevelMusic,
    stopLevelMusic,
    playInterLevelAudioForLevel,
    stopInterLevelAudio,
    unlockMusicOnce,
    safePlayMusic,
  };

  global.SD_AUDIO = exported;
})(window);
