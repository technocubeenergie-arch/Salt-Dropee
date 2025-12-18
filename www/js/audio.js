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
      menuMusic.loop = true;
      menuMusic.preload = "auto";
    }
    return menuMusic;
  }

  function playMenuMusic() {
    unlockMusicOnce();
    const audio = getMenuMusic();
    setLevelMusic(audio);
  }

  function stopMenuMusic() {
    if (currentMusic === menuMusic) {
      setLevelMusic(null);
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

  global.setSoundEnabled = patchedSetSoundEnabled;

  const exported = {
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
