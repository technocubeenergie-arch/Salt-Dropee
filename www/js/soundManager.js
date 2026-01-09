// --- Gestionnaire audio simple ---
const sounds = {
  coin: new Audio("assets/sounds/coin.mp3"),
  click: new Audio("assets/sounds/click.mp3"),
  wrong: new Audio("assets/sounds/wrong.mp3"),
  magnetat: new Audio("assets/sounds/magnetat.mp3"),
  bonusok: new Audio("assets/sounds/bonusok.mp3"),
  off: new Audio("assets/sounds/off.mp3"),
  forcefield: new Audio("assets/sounds/forcefield.mp3"),
  zap: new Audio("assets/sounds/zap.mp3"),
  thunder: new Audio("assets/sounds/thunder.mp3"),
  thunder1: new Audio("assets/sounds/thunder1.mp3")
};

const audioState = window.SD_AUDIO_STATE || (window.SD_AUDIO_STATE = {});
if (!audioState.trackedAudio) {
  audioState.trackedAudio = new Set();
}
if (!audioState.trackedMeta) {
  audioState.trackedMeta = new Map();
}
Object.values(sounds).forEach((aud) => {
  if (!aud) return;
  audioState.trackedAudio.add(aud);
  audioState.trackedMeta.set(aud, { role: 'sfx' });
});

let soundEnabled = true; // ON par défaut (prévoir un toggle plus tard)

function playSound(name) {
  if (!soundEnabled) return;
  if (audioState.audioPausedByGamePause) return;
  if (window.SD_AUDIO?.isAudioPausedByGamePause?.()) return;
  const s = sounds[name];
  if (!s) return;
  try {
    s.currentTime = 0;
    s.play();
  } catch (_) {}
}

function setSoundEnabled(enabled) {
  soundEnabled = !!enabled;
}

function isSoundEnabled() {
  return soundEnabled;
}

// --- Déverrouillage audio mobile ---
function unlockAudioOnce() {
  const tryUnlock = () => {
    for (const k in sounds) {
      try {
        sounds[k].play().then(() => sounds[k].pause());
      } catch (_) {}
    }
    window.removeEventListener("pointerdown", tryUnlock);
    window.removeEventListener("touchstart", tryUnlock);
    window.removeEventListener("mousedown", tryUnlock);
  };

  window.addEventListener("pointerdown", tryUnlock, { once: true });
  window.addEventListener("touchstart", tryUnlock, { once: true });
  window.addEventListener("mousedown", tryUnlock, { once: true });
}

window.playSound = window.playSound || playSound;
window.unlockAudioOnce = window.unlockAudioOnce || unlockAudioOnce;
window.setSoundEnabled = window.setSoundEnabled || setSoundEnabled;
window.isSoundEnabled = window.isSoundEnabled || isSoundEnabled;
