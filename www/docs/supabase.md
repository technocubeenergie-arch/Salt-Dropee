# Intégration Supabase

## Activation

La configuration par défaut (fichier `www/js/config.remote.js`) active Supabase et pointe vers le projet distant fourni. Pour désactiver totalement l'utilisation du backend distant (ex. développement hors ligne), définissez `SUPABASE_ENABLED = false` dans ce fichier. Le jeu basculera automatiquement sur un stockage local (`localStorage`).

## Tests rapides via la console

Ouvrez les outils de développement de votre navigateur et utilisez l'API exposée :

```js
await api.ping();
await api.registerPlayer('MonPseudoTest');
await api.saveProgress({ level: 2, lives: 3, score: 420 });
await api.loadProgress();
await api.submitScore(1, 900);
await api.getLeaderboard(1);
```

Chaque fonction renvoie un objet `{ success, ... }` avec des informations sur la source utilisée (`supabase` ou `local`). En mode dégradé, les données sont conservées via `localStorage`.
