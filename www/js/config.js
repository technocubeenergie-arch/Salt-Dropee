// ================================
// Salt Droppee — configuration & constantes
// ================================

(function initSaltDroppeeConfig(){
  const VERSION = '1.1.0';

  // ---- Configuration jeu et équilibrage ----
  const CONFIG = {
    portraitBase: { w: 360, h: 640 }, // 9:16
    maxTopActorH: 0.20,                // main ≤20%
    maxWalletH:  0.20,                 // wallet ≤20%
    topActorOffsetY: 6,                // marge supérieure de la main/du bras

    runSeconds: 75,
    lives: 3,

    baseSpawnPerSec: 1.25,
    spawnRampEverySec: 10,
    spawnRampFactor: 1.15,

    fallDuration: 3,

    wallet: { speed: 500, dashSpeed: 900, dashCD: 2.0,  bottomOffset: 120, width: 180 },

    control: {
      easeDuration: 0.2,
      easeFunction: 'power2.out',
    },

    magnet: {
      duration: 1.2,
      ease: 'power2.in',
      horizontalStrength: 12.0,
      scaleStart: 0.3,
      scaleEnd: 1.0,
      trailFactor: 1,
    },

    score: { bronze:10, silver:25, gold:50, diamond:100, bad:{shitcoin:-20, anvil:-10}, rugpullPct:-0.3 },
    combo: { step: 10, maxMult: 3 },

    evolveThresholds: [0,150,400,800,1400],

    powerups: { magnet:3, x2:5, shield:6, timeShard:0 },
    malus: { fakeAirdropDuration: 5 },

    rarity: { bronze:0.45, silver:0.30, gold:0.20, diamond:0.05 },
    badWeights: { bomb:0.35, shitcoin:0.25, anvil:0.20, rugpull:0.10, fakeAirdrop:0.10 },

    collision: {
      walletScaleX: 0.30,
      walletScaleY: 1.00,
      walletPadX: 0,
      walletPadY: 90
    },

    // Taille & animation des items
    items: {
      scale: 2,
      spawnScale: 0.30,
      growEase: 'outQuad',
      growDistance: 200
    },

    // Dimensions visuelles (avant scale globale) —
    // ajuste ici pour harmoniser chaque PNG sans toucher au code
    itemSize: {
      bronze:18, silver:18, gold:18, diamond:18,
      bomb:18, shitcoin:18, rugpull:18, fakeAirdrop:18, anvil:20,
      magnet:18, x2:18, shield:18, timeShard:18
    },

    render: { supersample: 1.5 },
    palette: ["#1a1c2c","#5d275d","#b13e53","#ef7d57","#ffcd75","#a7f070","#38b764","#257179"],
    fx: {
      positive: {
        color: "gold",
        duration: 0.3,
        radius: 20
      },
      negative: {
        color: "red",
        duration: 0.2,
        radius: 25
      },
      magnet: {
        color: "cyan",
        duration: 1.2,
        radius: 30
      },
      shield: {
        color: "rgba(100,200,255,0.8)",
        duration: 1.5,
        radiusOffset: 20
      },
      x2: {
        color: "violet",
        duration: 0.6,
        fontSize: 24
      }
    }
  };

  // ---- Données statiques ----
  const LEVELS = [
    {
      id: 1, name: "Level 1",
      background: "assets/fondniveau1.webp",
      walletSprite: "assets/walletniveau1.png",
      music: "assets/sounds/audioniveau1.mp3",
      targetScore: 800, timeLimit: 60, lives: 3,
    },
    {
      id: 2, name: "Level 2",
      background: "assets/fondniveau2.webp",
      walletSprite: "assets/walletniveau2.png",
      music: "assets/sounds/audioniveau2.mp3",
      targetScore: 1200, timeLimit: 60, lives: 3,
    },
    {
      id: 3, name: "Level 3",
      background: "assets/fondniveau3.webp",
      walletSprite: "assets/walletniveau3.png",
      music: "assets/sounds/audioniveau3.mp3",
      targetScore: 1600, timeLimit: 60, lives: 3,
    },
    {
      id: 4, name: "Level 4",
      background: "assets/fondniveau4.webp",
      walletSprite: "assets/walletniveau4.png",
      music: "assets/sounds/audioniveau4.mp3",
      targetScore: 2000, timeLimit: 60, lives: 3,
    },
    {
      id: 5, name: "Level 5",
      background: "assets/fondniveau5.webp",
      walletSprite: "assets/walletniveau5.png",
      music: "assets/sounds/audioniveau5.mp3",
      targetScore: 2500, timeLimit: 60, lives: 3,
    },
    {
      id: 6, name: "Level 6",
      background: "assets/fondniveau6.webp",
      walletSprite: "assets/walletniveau6.png",
      music: "assets/sounds/audioniveau6.mp3",
      targetScore: Infinity, timeLimit: 60, lives: 3,
      endless: true,
    },
  ];

  const INTER_LEVEL_BACKGROUNDS = {
    0: "assets/interlevel1.webp",
    1: "assets/interlevel2.webp",
    2: "assets/interlevel3.webp",
    3: "assets/interlevel4.webp",
    4: "assets/interlevel5.webp",
  };

  const INTER_LEVEL_SOUND_SOURCES = {
    default: "assets/sounds/tada.mp3",
    4: "assets/sounds/supertada.mp3",
  };

  const MENU_BACKGROUND_SRC = "assets/fondaccueil.webp";
  const MENU_MUSIC_SRC = "assets/sounds/audioaccueil.mp3";

  const LEGEND_LEVEL_INDEX = LEVELS.findIndex(level => level?.id === 6);

  // ---- HUD CONFIG (barre compacte) ----
  const HUD_CONFIG = {
    // Hauteur de la barre = 7–9% de l’écran
    barHFracMin: 0.07,  // 7%
    barHFracMax: 0.09,  // 9%
    padX: 12,           // marge latérale interne
    padY: 8,            // marge verticale interne
    radius: 10,         // coins arrondis
    bg: "rgba(0,0,0,0.28)",

    // Tailles de police (canvas, pas CSS clamp → on calcule)
    fontMin: 12,
    fontMax: 18,
    fontVwPct: 0.026,   // ~2.6vw

    // Taille icônes/éléments
    heartSize: 16,
    bonusIconSize: 16,
    gap: 10,

    // Combo couleurs par palier
    comboColors: {
      "1.0": "#8aa0b3", // bleu/gris
      "1.5": "#3ddc97", // vert
      "2.0": "#ffc94a", // or
      "3.0": "#ff5ad9", // magenta/néon
      "4.0": "#ff5ad9"  // cap≥3.0 = même magenta
    },

    // Jauge combo (2–3 px)
    gaugeH: 3,
    gaugeBg: "rgba(255,255,255,0.15)",

    // Animations (durées légères)
    anim: {
      popDur: 0.15,
      flashDur: 0.18
    }
  };

  // ---- Tables statiques ----
  const comboTiers = [
    { min: 0,  mult: 1.0 },
    { min: 5,  mult: 1.5 },
    { min: 10, mult: 2.0 },
    { min: 20, mult: 3.0 },
    { min: 35, mult: 4.0 } // cap
  ];

  const LS = { bestScore:'sd_bestScore', bestCombo:'sd_bestCombo', settings:'sd_settings', runs:'sd_runs' };

  const SCREEN_NAME_ALIASES = {
    playing: 'running',
    run: 'running',
    running: 'running',
    title: 'title',
    home: 'title',
    leaderboard: 'leaderboard',
    lb: 'leaderboard',
    paused: 'paused',
    pause: 'paused',
    inter: 'interLevel',
    interlevel: 'interLevel',
    settings: 'settings',
    over: 'gameover',
    gameover: 'gameover',
    legend: 'interLevel',
  };

  // ---- Progression / Auth timeouts & labels ----
  const PROGRESS_PROMISE_TIMEOUT_MS = 3500;
  const PROGRESS_LOAD_TIMEOUT_MS = 5000;
  const TITLE_START_PROGRESS_EAGER_WAIT_MS = 900;
  const LOGOUT_WATCHDOG_TIMEOUT_MS = 7000;
  const SAVE_AND_QUIT_TIMEOUT_MS = 4500;
  const SAVE_AND_QUIT_LABELS = Object.freeze({
    default: 'Sauvegarder & Quitter',
    loginRequired: 'Connexion requise (quitter sans sauvegarde)',
    unavailable: 'Quitter (sauvegarde indisponible)',
  });

  const exported = {
    VERSION,
    CONFIG,
    LEVELS,
    INTER_LEVEL_BACKGROUNDS,
    INTER_LEVEL_SOUND_SOURCES,
    MENU_BACKGROUND_SRC,
    MENU_MUSIC_SRC,
    LEGEND_LEVEL_INDEX,
    HUD_CONFIG,
    comboTiers,
    LS,
    SCREEN_NAME_ALIASES,
    PROGRESS_PROMISE_TIMEOUT_MS,
    PROGRESS_LOAD_TIMEOUT_MS,
    TITLE_START_PROGRESS_EAGER_WAIT_MS,
    LOGOUT_WATCHDOG_TIMEOUT_MS,
    SAVE_AND_QUIT_TIMEOUT_MS,
    SAVE_AND_QUIT_LABELS,
  };

  window.SD_CONFIG = exported;
  Object.assign(window, exported);
})();
