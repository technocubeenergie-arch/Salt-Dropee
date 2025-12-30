# LISTE DES AMÉLIORATIONS — Salt Droppee

Ce document contient des prompts d'amélioration destinés à être exécutés par une IA de développement. Chaque amélioration est autonome et inclut les vérifications anti-régression.

---

## LÉGENDE PRIORITÉ

- 🔴 **CRITIQUE** : Impact performance/sécurité immédiat
- 🟠 **HAUTE** : Améliore significativement la qualité
- 🟡 **MOYENNE** : Optimisation recommandée
- 🟢 **BASSE** : Nice-to-have, refactoring cosmétique

---

## CATÉGORIE 1 : ARCHITECTURE & REFACTORING

### 1.1 🟠 Décomposer la classe Game monolithique

```
CONTEXTE:
La classe Game dans www/js/main.js fait 460+ lignes (lignes 1471-1933) et gère trop de responsabilités : rendu, état, UI, audio, spawning, collisions.

FICHIERS CONCERNÉS:
- www/js/main.js (lecture + modification)
- www/js/gameRenderer.js (création)
- www/js/gameUI.js (création)
- www/js/gameState.js (création)

AMÉLIORATION:
1. Créer www/js/gameRenderer.js contenant :
   - Méthode render() principale
   - Méthodes renderTitle(), renderPause(), renderGameOver(), renderInterLevel()
   - Toute la logique de dessin canvas

2. Créer www/js/gameUI.js contenant :
   - Méthodes showInterLevelScreen(), hideInterLevelScreen()
   - Gestion des overlays HTML
   - Mise à jour du HUD

3. Créer www/js/gameState.js contenant :
   - Machine d'états (title, playing, paused, inter, over)
   - Transitions d'états avec callbacks
   - Validation des transitions

4. Modifier la classe Game pour déléguer à ces modules

VÉRIFICATIONS ANTI-RÉGRESSION:
□ Le jeu démarre correctement depuis l'écran titre
□ La transition playing → paused fonctionne (touche Espace ou visibilitychange)
□ La transition playing → inter fonctionne (objectif atteint)
□ Les overlays s'affichent/masquent correctement
□ Le HUD se met à jour pendant le jeu
□ Le rendu des entités (wallet, arm, items) est identique
□ Les effets visuels (FX) s'affichent correctement
□ L'audio se joue aux bons moments
□ La sauvegarde de progression fonctionne toujours
```

---

### 1.2 🟡 Éliminer les variables globales implicites

```
CONTEXTE:
Plusieurs variables sont déclarées sans const/let et polluent le scope global :
- main.js:491-495 : score, streak, combo, lives, etc.
- Risque de collisions de noms et bugs difficiles à tracer

FICHIERS CONCERNÉS:
- www/js/main.js

AMÉLIORATION:
1. Identifier toutes les variables sans déclaration explicite :
   - Rechercher les assignations de la forme "variableName = value" sans const/let/var

2. Pour chaque variable trouvée, déterminer son scope approprié :
   - Si utilisée uniquement dans une fonction → const/let local
   - Si partagée entre fonctions → propriété de l'objet game ou module export

3. Ajouter "use strict" en haut de chaque module IIFE si absent

4. Variables à convertir spécifiquement :
   - score → game.score (déjà partiellement fait)
   - streak, combo → game.combo.streak, game.combo.multiplier
   - lives → game.lives
   - timeLeft → game.timeLeft

VÉRIFICATIONS ANTI-RÉGRESSION:
□ Ouvrir la console navigateur, aucune ReferenceError au démarrage
□ Le score s'incrémente correctement lors de la collecte
□ Le combo monte et descend selon les règles
□ Les vies diminuent lors des collisions négatives
□ Le timer fonctionne et déclenche la fin de niveau
□ Tester avec "use strict" activé dans la console
```

---

### 1.3 🟡 Centraliser les constantes magiques

```
CONTEXTE:
Des nombres "magiques" sont disséminés dans le code sans nom explicite :
- main.js:1385 : bumpStrength = 0.65, 0.55, 0.40
- fallingItem.js:70 : fallDuration = 2.5
- fx.js:93 : duration hardcodées
- Difficile à maintenir et ajuster

FICHIERS CONCERNÉS:
- www/js/config.js (modification)
- www/js/main.js (modification)
- www/js/entities/fallingItem.js (modification)
- www/js/fx.js (modification)
- www/js/powerups.js (modification)

AMÉLIORATION:
1. Ajouter dans config.js une section GAMEPLAY_TUNING :

```javascript
const GAMEPLAY_TUNING = {
  collision: {
    bumpStrength: { bomb: 0.65, anvil: 0.55, default: 0.40 },
    inversionDuration: 5000, // ms
  },
  spawning: {
    baseInterval: 0.8,
    minInterval: 0.3,
    rampDuration: 45, // secondes avant vitesse max
  },
  combo: {
    decayTime: 2.0, // secondes avant perte de combo
    tiers: [
      { min: 0, mult: 1.0 },
      { min: 5, mult: 1.5 },
      { min: 10, mult: 2.0 },
      { min: 20, mult: 3.0 },
      { min: 35, mult: 4.0 },
    ],
  },
  powerups: {
    magnetDuration: 3000,
    x2Duration: 5000,
    shieldHits: 1,
    timeShardBonus: 5,
  },
};
```

2. Remplacer chaque magic number par sa référence CONFIG.GAMEPLAY_TUNING.*

3. Documenter chaque constante avec un commentaire inline

VÉRIFICATIONS ANTI-RÉGRESSION:
□ Le comportement de collision est identique (tester bomb, anvil, shitcoin)
□ La vitesse de spawn augmente progressivement comme avant
□ Les paliers de combo se déclenchent aux mêmes seuils
□ La durée des powerups est inchangée
□ Modifier une valeur dans config.js et vérifier que l'effet est immédiat
```

---

## CATÉGORIE 2 : PERFORMANCE

### 2.1 🔴 Implémenter le pooling des FallingItem

```
CONTEXTE:
Chaque objet tombant crée une nouvelle instance FallingItem avec `new FallingItem()`.
Sur un niveau chargé, des dizaines d'objets sont créés/détruits, causant :
- Allocations mémoire fréquentes
- Garbage collection (micro-freezes)
- Problème visible sur appareils bas de gamme

FICHIERS CONCERNÉS:
- www/js/entities/fallingItem.js (modification)
- www/js/main.js (modification des appels de spawn)

AMÉLIORATION:
1. Créer une classe ItemPool dans fallingItem.js :

```javascript
class ItemPool {
  constructor(initialSize = 30) {
    this.pool = [];
    this.active = new Set();
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this._createRaw());
    }
  }

  _createRaw() {
    const item = Object.create(FallingItem.prototype);
    item._pooled = true;
    return item;
  }

  acquire(game, kind, subtype, x, y) {
    let item = this.pool.pop();
    if (!item) {
      item = this._createRaw();
    }
    // Réinitialiser l'état
    FallingItem.call(item, game, kind, subtype, x, y);
    this.active.add(item);
    return item;
  }

  release(item) {
    if (!item._pooled) return;
    this.active.delete(item);
    item.alive = false;
    item._dead = true;
    if (item._tween) {
      item._tween.kill();
      item._tween = null;
    }
    this.pool.push(item);
  }

  releaseAll() {
    for (const item of this.active) {
      this.release(item);
    }
  }
}
```

2. Exposer une instance globale : `global.itemPool = new ItemPool(50);`

3. Modifier spawnItem() dans main.js pour utiliser `itemPool.acquire()`

4. Modifier la logique de cleanup pour utiliser `itemPool.release(item)`

5. Appeler `itemPool.releaseAll()` lors de resetLevel()

VÉRIFICATIONS ANTI-RÉGRESSION:
□ Les items apparaissent et tombent normalement
□ Les items sont correctement réinitialisés (position, scale, alive)
□ La collision fonctionne identiquement
□ Pas de "ghost items" (items réutilisés avec ancien état)
□ Profiler Chrome : moins d'allocations dans le heap
□ Tester 5 niveaux consécutifs sans memory leak
□ Le magnet attire toujours les bons items
```

---

### 2.2 🟠 Optimiser les calculs de collision

```
CONTEXTE:
Les collisions sont calculées à chaque frame pour chaque item actif.
La méthode actuelle vérifie tous les items même ceux hors zone.

FICHIERS CONCERNÉS:
- www/js/main.js (méthode de collision)
- www/js/entities/fallingItem.js (getBounds)

AMÉLIORATION:
1. Ajouter un early-exit basé sur la position Y :

```javascript
function checkCollisions() {
  const walletTop = wallet.y;
  const walletBottom = wallet.y + wallet.h;

  for (const item of items) {
    if (!item.alive) continue;

    // Early exit : item trop haut, pas encore dans la zone
    if (item.y + item.getBaseSize() * item.scale < walletTop - 20) continue;

    // Early exit : item trop bas, déjà passé
    if (item.y > walletBottom + 10) continue;

    // Collision détaillée seulement si dans la bande Y
    if (checkAABBCollision(item.getBounds(), wallet.getBounds())) {
      handleCollision(item);
    }
  }
}
```

2. Réutiliser l'objet bounds au lieu d'en créer un nouveau :

```javascript
// Pré-allouer un objet réutilisable
const _itemBounds = { x: 0, y: 0, w: 0, h: 0 };

getBounds() {
  const size = this.getBaseSize() * this.scale;
  _itemBounds.x = this.x - size / 2;
  _itemBounds.y = this.y - size / 2;
  _itemBounds.w = size;
  _itemBounds.h = size;
  return _itemBounds;
}
```

3. Utiliser un seul objet pour le wallet bounds (déjà partiellement fait avec WR)

VÉRIFICATIONS ANTI-RÉGRESSION:
□ Tous les items dans la zone de collision sont détectés
□ Pas de "miss" sur les bords du wallet
□ Le score augmente correctement à chaque collecte
□ Les items négatifs déclenchent bien les malus
□ Tester avec items rapides (niveau 5-6)
□ Profiler : réduction du temps CPU dans checkCollisions
```

---

### 2.3 🟡 Lazy loading des assets de niveaux non immédiats

```
CONTEXTE:
Au démarrage, tous les assets de tous les niveaux pourraient être préchargés.
Actuellement, le préchargement est fait niveau par niveau mais pourrait être optimisé.

FICHIERS CONCERNÉS:
- www/js/levels.js
- www/js/main.js (startLevel)

AMÉLIORATION:
1. Précharger uniquement niveau 1 au boot

2. Pendant le gameplay du niveau N, précharger niveau N+1 en arrière-plan :

```javascript
async function startLevel(levelIndex) {
  // Charger le niveau actuel
  const assets = await ensureLevelAssets(levelIndex);

  // Précharger le suivant en background (non-bloquant)
  if (levelIndex + 1 < LEVELS.length) {
    ensureLevelAssets(levelIndex + 1).catch(() => {
      // Silencieux, on réessaiera plus tard
    });
  }

  // Continuer avec le niveau actuel...
}
```

3. Ajouter un indicateur de chargement si le niveau suivant n'est pas prêt

VÉRIFICATIONS ANTI-RÉGRESSION:
□ Le niveau 1 se charge rapidement au démarrage
□ La transition niveau 1 → 2 est fluide
□ La musique du niveau suivant joue sans délai
□ Le fond d'écran change instantanément
□ Tester avec connexion lente (DevTools throttling)
```

---

## CATÉGORIE 3 : QUALITÉ DU CODE

### 3.1 🟠 Ajouter des types JSDoc pour l'autocomplétion

```
CONTEXTE:
Le code est en JavaScript vanilla sans types.
L'IDE ne peut pas aider à détecter les erreurs de type.
Les développeurs doivent lire le code pour comprendre les structures.

FICHIERS CONCERNÉS:
- www/js/config.js
- www/js/entities/*.js
- www/js/main.js

AMÉLIORATION:
1. Ajouter un fichier www/js/types.js avec les typedefs :

```javascript
/**
 * @typedef {Object} GameConfig
 * @property {number} BASE_W - Largeur de base du canvas
 * @property {number} BASE_H - Hauteur de base du canvas
 * @property {LevelConfig[]} LEVELS - Configuration des niveaux
 */

/**
 * @typedef {Object} LevelConfig
 * @property {string} name - Nom du niveau
 * @property {number} target - Score cible
 * @property {number} time - Durée en secondes
 * @property {string} background - URL du fond
 * @property {string} walletSprite - URL du sprite wallet
 * @property {string} music - URL de la musique
 */

/**
 * @typedef {Object} Bounds
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {'good'|'bad'|'power'} ItemKind
 */

/**
 * @typedef {'bronze'|'silver'|'gold'|'diamond'|'bomb'|'shitcoin'|'rugpull'|'fakeAirdrop'|'anvil'|'magnet'|'x2'|'shield'|'timeShard'} ItemSubtype
 */

/**
 * @typedef {'title'|'playing'|'paused'|'inter'|'over'} GameState
 */
```

2. Ajouter les annotations @type et @param dans les fonctions clés :

```javascript
/**
 * Spawn un nouvel item tombant
 * @param {ItemKind} kind
 * @param {ItemSubtype} subtype
 * @param {number} x
 * @param {number} y
 * @returns {FallingItem}
 */
function spawnItem(kind, subtype, x, y) { ... }
```

3. Configurer jsconfig.json pour activer la vérification TypeScript en mode JS :

```json
{
  "compilerOptions": {
    "checkJs": true,
    "allowJs": true,
    "target": "ES2020",
    "moduleResolution": "node"
  },
  "include": ["www/js/**/*"]
}
```

VÉRIFICATIONS ANTI-RÉGRESSION:
□ Aucune erreur de syntaxe dans les annotations
□ L'IDE propose l'autocomplétion sur les objets typés
□ Le jeu fonctionne identiquement (les types sont des commentaires)
□ npm start ne génère pas d'erreur
```

---

### 3.2 🟡 Éliminer la duplication du code de rendu des bonus

```
CONTEXTE:
Le code de rendu des indicateurs de bonus actifs est dupliqué :
- main.js lignes ~1370-1420 dans render()
- render.js contient aussi du code de HUD
Maintenance difficile, risque de divergence.

FICHIERS CONCERNÉS:
- www/js/main.js
- www/js/render.js

AMÉLIORATION:
1. Identifier toutes les occurrences de rendu de bonus

2. Créer une fonction unique dans render.js :

```javascript
/**
 * Dessine les indicateurs de bonus actifs sur le canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} activeBonuses - État des bonus actifs
 * @param {number} x - Position X de départ
 * @param {number} y - Position Y de départ
 */
function drawActiveBonusIndicators(ctx, activeBonuses, x, y) {
  const indicators = [];

  if (activeBonuses.magnet?.active) {
    indicators.push({ icon: '🧲', time: activeBonuses.magnet.remaining });
  }
  if (activeBonuses.x2?.active) {
    indicators.push({ icon: 'x2', time: activeBonuses.x2.remaining });
  }
  if (activeBonuses.shield?.active) {
    indicators.push({ icon: '🛡️', time: null }); // Permanent
  }

  indicators.forEach((ind, i) => {
    const posY = y + i * 28;
    ctx.fillStyle = '#fff';
    ctx.font = '16px monospace';
    ctx.fillText(ind.icon, x, posY);
    if (ind.time !== null) {
      ctx.fillText(`${ind.time.toFixed(1)}s`, x + 30, posY);
    }
  });
}
```

3. Supprimer le code dupliqué dans main.js et appeler la fonction centralisée

VÉRIFICATIONS ANTI-RÉGRESSION:
□ Les icônes de bonus s'affichent quand un bonus est actif
□ Le timer des bonus décompte correctement
□ Le bouclier n'affiche pas de timer (permanent)
□ Les indicateurs disparaissent quand le bonus expire
□ Plusieurs bonus simultanés s'affichent en colonne
```

---

## CATÉGORIE 4 : ROBUSTESSE & SÉCURITÉ

### 4.1 🔴 Sécuriser la configuration Supabase

```
CONTEXTE:
Les credentials Supabase sont exposées dans config.remote.js :
- SUPABASE_URL visible
- SUPABASE_ANON_KEY visible
Risque : abus de l'API, spam de la base de données.

FICHIERS CONCERNÉS:
- www/js/config.remote.js

AMÉLIORATION:
1. La ANON_KEY est conçue pour être publique (Row Level Security protège les données)

2. Vérifier que les RLS sont correctement configurées côté Supabase :

```sql
-- Vérifier ces politiques existent
-- Table: players
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON players
  FOR SELECT USING (auth.uid() = auth_user_id);

CREATE POLICY "Users can update own profile" ON players
  FOR UPDATE USING (auth.uid() = auth_user_id);

-- Table: progress
CREATE POLICY "Users can manage own progress" ON progress
  FOR ALL USING (auth.uid() = user_id);
```

3. Ajouter une validation côté client pour les données envoyées :

```javascript
function validateScoreSubmission(score) {
  if (typeof score !== 'number') return false;
  if (!Number.isFinite(score)) return false;
  if (score < 0 || score > 999999) return false; // Cap raisonnable
  return true;
}
```

4. Ajouter un rate limiting côté Supabase (Edge Functions ou middleware)

VÉRIFICATIONS ANTI-RÉGRESSION:
□ La connexion/inscription fonctionne toujours
□ La sauvegarde de progression fonctionne
□ Le leaderboard affiche les scores
□ Un utilisateur ne peut pas voir les données d'un autre
□ Tester avec un token invalide → erreur propre
```

---

### 4.2 🟠 Ajouter une validation des entrées utilisateur

```
CONTEXTE:
Les champs de formulaire (pseudo, email) sont peu validés côté client.
Risque d'envoi de données malformées au backend.

FICHIERS CONCERNÉS:
- www/js/authController.js
- www/js/ui-account.js

AMÉLIORATION:
1. Créer un module de validation www/js/validation.js :

```javascript
const VALIDATION = {
  username: {
    minLength: 3,
    maxLength: 20,
    pattern: /^[a-zA-Z0-9_-]+$/,
    validate(value) {
      if (!value || typeof value !== 'string') {
        return { valid: false, error: 'Pseudo requis' };
      }
      const trimmed = value.trim();
      if (trimmed.length < this.minLength) {
        return { valid: false, error: `Minimum ${this.minLength} caractères` };
      }
      if (trimmed.length > this.maxLength) {
        return { valid: false, error: `Maximum ${this.maxLength} caractères` };
      }
      if (!this.pattern.test(trimmed)) {
        return { valid: false, error: 'Lettres, chiffres, _ et - uniquement' };
      }
      return { valid: true, value: trimmed };
    }
  },

  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    validate(value) {
      if (!value || typeof value !== 'string') {
        return { valid: false, error: 'Email requis' };
      }
      const trimmed = value.trim().toLowerCase();
      if (!this.pattern.test(trimmed)) {
        return { valid: false, error: 'Email invalide' };
      }
      return { valid: true, value: trimmed };
    }
  },

  password: {
    minLength: 6,
    validate(value) {
      if (!value || typeof value !== 'string') {
        return { valid: false, error: 'Mot de passe requis' };
      }
      if (value.length < this.minLength) {
        return { valid: false, error: `Minimum ${this.minLength} caractères` };
      }
      return { valid: true, value };
    }
  }
};
```

2. Utiliser ces validations dans authController.js avant tout appel API

3. Afficher les erreurs de validation en temps réel dans les formulaires

VÉRIFICATIONS ANTI-RÉGRESSION:
□ L'inscription avec données valides fonctionne
□ L'inscription avec pseudo trop court affiche une erreur
□ L'inscription avec email invalide affiche une erreur
□ Les erreurs s'affichent sous le champ concerné
□ Les espaces en début/fin sont supprimés automatiquement
```

---

### 4.3 🟡 Gérer gracieusement les erreurs réseau

```
CONTEXTE:
Les erreurs réseau (fetch failed, timeout) ne sont pas toujours bien gérées.
L'utilisateur peut voir des écrans bloqués ou des comportements erratiques.

FICHIERS CONCERNÉS:
- www/js/supabaseClient.js
- www/js/dataService.js
- www/js/scoreController.js
- www/js/progressController.js

AMÉLIORATION:
1. Créer un wrapper pour les appels réseau avec retry :

```javascript
async function fetchWithRetry(operation, options = {}) {
  const { maxRetries = 3, baseDelay = 1000, timeout = 5000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const result = await operation({ signal: controller.signal });
      clearTimeout(timeoutId);
      return result;

    } catch (error) {
      clearTimeout(timeoutId);

      const isRetryable =
        error.name === 'AbortError' ||
        error.message?.includes('fetch') ||
        error.message?.includes('network');

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```

2. Afficher un indicateur visuel pendant les opérations réseau

3. Proposer un bouton "Réessayer" en cas d'échec définitif

4. Basculer automatiquement en mode offline si le réseau est indisponible

VÉRIFICATIONS ANTI-RÉGRESSION:
□ La sauvegarde fonctionne en conditions normales
□ Une coupure réseau temporaire ne bloque pas le jeu
□ Le mode offline utilise localStorage
□ La reconnexion resynchronise automatiquement
□ L'utilisateur voit un feedback visuel pendant les chargements
```

---

## CATÉGORIE 5 : UX & GAMEPLAY

### 5.1 🟠 Ajouter un tutoriel interactif pour les nouveaux joueurs

```
CONTEXTE:
Les nouveaux joueurs doivent comprendre les mécaniques seuls.
L'écran "Règles" est statique et peu engageant.

FICHIERS CONCERNÉS:
- www/js/main.js
- www/js/ui-overlays.js (création ou modification)
- www/assets/style.css

AMÉLIORATION:
1. Créer un système de tutoriel étape par étape :

```javascript
const TUTORIAL_STEPS = [
  {
    id: 'move',
    message: 'Glisse ton doigt pour déplacer le wallet',
    highlight: 'wallet', // Element à mettre en évidence
    condition: () => playerMoved, // Condition pour passer à l'étape suivante
  },
  {
    id: 'collect',
    message: 'Attrape les pièces pour gagner des points !',
    highlight: 'goodItems',
    condition: () => score >= 50,
  },
  {
    id: 'avoid',
    message: 'Évite les bombes et objets rouges',
    highlight: 'badItems',
    condition: () => tutorialBadItemsSpawned,
  },
  {
    id: 'combo',
    message: 'Enchaîne les collectes pour un multiplicateur !',
    highlight: 'comboBar',
    condition: () => comboStreak >= 5,
  },
  {
    id: 'powerup',
    message: 'Les bonus bleus t\'aident. Attrape-les !',
    highlight: 'powerItems',
    condition: () => powerupCollected,
  },
];
```

2. Afficher une overlay semi-transparente avec le message et une flèche vers l'élément

3. Sauvegarder la complétion du tutoriel dans localStorage

4. Permettre de skip le tutoriel

VÉRIFICATIONS ANTI-RÉGRESSION:
□ Le tutoriel se lance uniquement à la première partie
□ Chaque étape attend la condition avant de passer
□ Le skip fonctionne et marque le tutoriel comme complété
□ Le tutoriel ne réapparaît pas après complétion
□ Les joueurs existants ne voient pas le tutoriel
□ Le jeu fonctionne normalement après le tutoriel
```

---

### 5.2 🟡 Améliorer le feedback visuel des collisions

```
CONTEXTE:
Les collisions sont peu visibles, surtout pour les objets négatifs.
Les joueurs peuvent ne pas comprendre pourquoi ils perdent des points/vies.

FICHIERS CONCERNÉS:
- www/js/fx.js
- www/js/main.js (handleCollision)

AMÉLIORATION:
1. Ajouter un effet de particules lors des collectes positives :

```javascript
class FxCoinBurst {
  constructor(x, y, color = '#FFD700') {
    this.particles = [];
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 200,
        vy: -Math.random() * 150 - 50,
        life: 0.5,
        size: 4 + Math.random() * 4,
        color,
      });
    }
    this.dead = false;
  }

  update(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt; // Gravité
      p.life -= dt;
      if (p.life <= 0) p.dead = true;
    }
    this.particles = this.particles.filter(p => !p.dead);
    if (this.particles.length === 0) this.dead = true;
  }

  draw(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = p.life * 2;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
```

2. Ajouter un flash rouge du bord de l'écran pour les dégâts :

```javascript
function flashDamage() {
  const overlay = document.getElementById('damageOverlay');
  overlay.style.opacity = '0.3';
  gsap.to(overlay, { opacity: 0, duration: 0.3 });
}
```

3. Ajouter un popup "+50" / "-20" au point de collision

VÉRIFICATIONS ANTI-RÉGRESSION:
□ L'effet de particules apparaît sur les collectes
□ Le flash rouge apparaît sur les dégâts
□ Les popups de score s'affichent au bon endroit
□ Les effets ne ralentissent pas le jeu (profiler)
□ Les effets disparaissent après leur durée
```

---

### 5.3 🟡 Ajouter des statistiques de fin de partie

```
CONTEXTE:
L'écran de fin (game over ou victoire Legend) affiche seulement le score.
Les joueurs veulent des statistiques détaillées sur leur performance.

FICHIERS CONCERNÉS:
- www/js/main.js (tracking stats)
- www/js/ui-overlays.js (affichage)
- www/assets/style.css

AMÉLIORATION:
1. Tracker les statistiques pendant la partie :

```javascript
const gameStats = {
  itemsCollected: { bronze: 0, silver: 0, gold: 0, diamond: 0 },
  itemsAvoided: { bomb: 0, shitcoin: 0, rugpull: 0, fakeAirdrop: 0, anvil: 0 },
  itemsMissed: { positive: 0, negative: 0 },
  powerupsUsed: { magnet: 0, x2: 0, shield: 0, timeShard: 0 },
  maxCombo: 0,
  totalComboTime: 0,
  accuracyRate: 0, // items collectés / items tombés positifs
  damagesTaken: 0,
  timePlayed: 0,
};

function updateStats(event, data) {
  switch (event) {
    case 'collect':
      gameStats.itemsCollected[data.subtype]++;
      break;
    case 'damage':
      gameStats.damagesTaken++;
      break;
    case 'combo':
      gameStats.maxCombo = Math.max(gameStats.maxCombo, data.streak);
      break;
    // etc.
  }
}
```

2. Afficher un résumé en fin de partie :

```html
<div class="stats-summary">
  <h2>Résumé de la partie</h2>
  <div class="stat-row">
    <span>Meilleur combo</span>
    <span class="stat-value">x23</span>
  </div>
  <div class="stat-row">
    <span>Précision</span>
    <span class="stat-value">87%</span>
  </div>
  <div class="stat-row">
    <span>Diamants collectés</span>
    <span class="stat-value">5</span>
  </div>
</div>
```

VÉRIFICATIONS ANTI-RÉGRESSION:
□ Le tracking fonctionne pendant le jeu
□ Les stats s'affichent à la fin de partie
□ Les valeurs correspondent au gameplay réel
□ Le bouton "Rejouer" réinitialise les stats
□ Les stats ne sont pas envoyées au serveur (local uniquement)
```

---

## CATÉGORIE 6 : ACCESSIBILITÉ

### 6.1 🟡 Ajouter le support des préférences de mouvement réduit

```
CONTEXTE:
Certains utilisateurs préfèrent réduire les animations (mal des transports, épilepsie).
Le jeu utilise beaucoup d'animations GSAP.

FICHIERS CONCERNÉS:
- www/js/fx.js
- www/js/config.js
- www/assets/style.css

AMÉLIORATION:
1. Détecter la préférence utilisateur :

```javascript
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

// Écouter les changements en temps réel
window.matchMedia('(prefers-reduced-motion: reduce)')
  .addEventListener('change', (e) => {
    CONFIG.reducedMotion = e.matches;
  });
```

2. Modifier les effets pour respecter la préférence :

```javascript
function createEffect(type, x, y) {
  if (CONFIG.reducedMotion) {
    // Version simplifiée : juste un flash de couleur
    return new FxSimpleFlash(x, y, type === 'positive' ? 'gold' : 'red');
  }
  return type === 'positive'
    ? new FxCoinBurst(x, y)
    : new FxDamageFlash(x, y);
}
```

3. Ajouter une option dans les paramètres pour forcer le mode

4. Réduire également les animations CSS :

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }

  .combo-chip {
    transform: none !important;
  }
}
```

VÉRIFICATIONS ANTI-RÉGRESSION:
□ Le jeu fonctionne avec reduced-motion activé
□ Les effets simplifiés sont visibles mais pas animés
□ L'option dans les paramètres fonctionne
□ La préférence système est détectée automatiquement
□ Le gameplay reste identique (timing, collisions)
```

---

### 6.2 🟢 Améliorer le contraste des éléments UI

```
CONTEXTE:
Certains textes ont un contraste faible, difficile à lire en plein soleil.
Le ratio de contraste minimum recommandé est 4.5:1 (WCAG AA).

FICHIERS CONCERNÉS:
- www/assets/style.css

AMÉLIORATION:
1. Auditer les contrastes actuels :

| Élément | Couleur texte | Couleur fond | Ratio actuel |
|---------|--------------|--------------|--------------|
| HUD score | #fff | rgba(0,0,0,0.28) | ~4.2:1 ⚠️ |
| Panel subtitle | var(--ui2) #a7f070 | rgba(14,16,28,0.9) | ~8:1 ✓ |
| Button disabled | opacity 0.5 | - | ~2.1:1 ❌ |

2. Corriger les éléments problématiques :

```css
/* Améliorer le fond du HUD */
#hud {
  background: rgba(0, 0, 0, 0.55); /* Augmenté de 0.28 */
}

/* Améliorer les boutons désactivés */
button:disabled {
  opacity: 0.7; /* Augmenté de 0.5 */
  color: #b0b0b0;
}

/* Ajouter une ombre aux textes sur images */
.hud-score-value,
.hud-lives,
.hud-time {
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
```

3. Tester avec un outil d'audit (Lighthouse, axe DevTools)

VÉRIFICATIONS ANTI-RÉGRESSION:
□ Tous les textes restent lisibles
□ Le style visuel global est cohérent
□ Les textes sont lisibles sur fond clair (soleil)
□ Lighthouse Accessibility score ≥ 90
```

---

## CATÉGORIE 7 : TESTING & DOCUMENTATION

### 7.1 🟠 Ajouter des tests unitaires pour les modules critiques

```
CONTEXTE:
Aucun test automatisé n'existe actuellement.
Les régressions ne sont détectées que manuellement.

FICHIERS CONCERNÉS:
- package.json (ajout dépendances)
- www/js/__tests__/ (création)
- vitest.config.js (création)

AMÉLIORATION:
1. Installer Vitest comme framework de test :

```bash
npm install -D vitest jsdom @vitest/coverage-v8
```

2. Configurer vitest.config.js :

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['www/js/__tests__/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
```

3. Créer des tests pour les modules critiques :

```javascript
// www/js/__tests__/collision.test.js
import { describe, it, expect } from 'vitest';

describe('Collision Detection', () => {
  it('should detect overlapping rectangles', () => {
    const a = { x: 0, y: 0, w: 50, h: 50 };
    const b = { x: 25, y: 25, w: 50, h: 50 };
    expect(checkAABBCollision(a, b)).toBe(true);
  });

  it('should not detect separated rectangles', () => {
    const a = { x: 0, y: 0, w: 50, h: 50 };
    const b = { x: 100, y: 100, w: 50, h: 50 };
    expect(checkAABBCollision(a, b)).toBe(false);
  });
});

// www/js/__tests__/combo.test.js
describe('Combo System', () => {
  it('should calculate correct multiplier for streak', () => {
    expect(getComboMultiplier(0)).toBe(1.0);
    expect(getComboMultiplier(5)).toBe(1.5);
    expect(getComboMultiplier(10)).toBe(2.0);
    expect(getComboMultiplier(35)).toBe(4.0);
    expect(getComboMultiplier(100)).toBe(4.0); // Cap
  });
});

// www/js/__tests__/validation.test.js
describe('Input Validation', () => {
  it('should validate correct usernames', () => {
    expect(validateUsername('Player1').valid).toBe(true);
    expect(validateUsername('user_name').valid).toBe(true);
  });

  it('should reject invalid usernames', () => {
    expect(validateUsername('ab').valid).toBe(false); // Too short
    expect(validateUsername('a b c').valid).toBe(false); // Spaces
    expect(validateUsername('<script>').valid).toBe(false); // Special chars
  });
});
```

4. Ajouter le script dans package.json :

```json
{
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest --coverage"
  }
}
```

VÉRIFICATIONS ANTI-RÉGRESSION:
□ npm test s'exécute sans erreur
□ Tous les tests passent
□ La couverture couvre les fonctions critiques
□ Les tests peuvent être exécutés en CI
```

---

### 7.2 🟢 Documenter l'API des modules

```
CONTEXTE:
Les développeurs doivent lire le code source pour comprendre les modules.
Pas de documentation API structurée.

FICHIERS CONCERNÉS:
- www/docs/API.md (création)
- www/js/*.js (ajout de JSDoc)

AMÉLIORATION:
1. Créer www/docs/API.md avec la structure :

```markdown
# API Documentation — Salt Droppee

## Modules

### SD_CONFIG
Configuration globale du jeu.

#### Propriétés
| Nom | Type | Description |
|-----|------|-------------|
| BASE_W | number | Largeur de base du canvas (360) |
| BASE_H | number | Hauteur de base du canvas (640) |
| LEVELS | LevelConfig[] | Configuration des niveaux |

### SD_INPUT
Gestion des entrées utilisateur.

#### Méthodes
##### addEvent(target, type, handler, options?)
Ajoute un écouteur d'événement avec gestion automatique du cleanup.

| Paramètre | Type | Description |
|-----------|------|-------------|
| target | EventTarget | Élément cible |
| type | string | Type d'événement |
| handler | Function | Callback |
| options | object? | Options addEventListener |

##### removeEvent(target, type, handler, options?)
Supprime un écouteur d'événement.

### SD_AUDIO
Gestion de la musique et des effets sonores.

#### Méthodes
##### playMenuMusic()
Lance la musique du menu principal.

##### setLevelMusic(audio)
Définit la musique du niveau en cours avec fade-in.

##### playInterLevelAudioForLevel(levelIndex)
Joue le son de transition de niveau.

[...]
```

2. Générer automatiquement avec JSDoc si les annotations sont ajoutées

VÉRIFICATIONS ANTI-RÉGRESSION:
□ La documentation correspond au code actuel
□ Les exemples de code fonctionnent
□ Aucune fonction publique n'est omise
```

---

## ORDRE D'EXÉCUTION RECOMMANDÉ

Pour minimiser les risques de régression, exécuter les améliorations dans cet ordre :

### Phase 1 : Fondations (aucune modification de comportement)
1. ✅ 3.1 Ajouter des types JSDoc
2. ✅ 1.3 Centraliser les constantes magiques
3. ✅ 7.2 Documenter l'API

### Phase 2 : Tests (filet de sécurité)
4. ✅ 7.1 Ajouter des tests unitaires

### Phase 3 : Refactoring (comportement identique)
5. ✅ 1.2 Éliminer les variables globales
6. ✅ 3.2 Éliminer la duplication du rendu bonus
7. ✅ 1.1 Décomposer la classe Game

### Phase 4 : Performance (optimisation)
8. ✅ 2.1 Pooling des FallingItem
9. ✅ 2.2 Optimiser les collisions
10. ✅ 2.3 Lazy loading des assets

### Phase 5 : Robustesse (gestion d'erreurs)
11. ✅ 4.2 Validation des entrées
12. ✅ 4.3 Gestion des erreurs réseau
13. ✅ 4.1 Sécuriser Supabase (vérification)

### Phase 6 : UX (nouvelles fonctionnalités)
14. ✅ 5.2 Feedback visuel collisions
15. ✅ 5.3 Statistiques fin de partie
16. ✅ 5.1 Tutoriel interactif

### Phase 7 : Accessibilité (polish)
17. ✅ 6.1 Support reduced-motion
18. ✅ 6.2 Améliorer le contraste

---

## CHECKLIST GLOBALE ANTI-RÉGRESSION

Après chaque amélioration, vérifier systématiquement :

### Gameplay
- [ ] Le jeu démarre depuis le menu
- [ ] Le wallet se déplace (swipe et zones)
- [ ] Les items tombent et sont collectables
- [ ] Le score s'incrémente correctement
- [ ] Le combo fonctionne
- [ ] Les vies diminuent sur dégât
- [ ] Le timer fonctionne
- [ ] Les powerups sont actifs
- [ ] La transition de niveau fonctionne
- [ ] Le mode Legend fonctionne

### Audio
- [ ] La musique du menu joue
- [ ] La musique du niveau joue
- [ ] Les effets sonores jouent
- [ ] Le mute/unmute fonctionne

### UI
- [ ] Le HUD s'affiche
- [ ] Les overlays s'affichent/masquent
- [ ] Les boutons sont cliquables
- [ ] Les formulaires fonctionnent

### Backend
- [ ] La connexion fonctionne
- [ ] L'inscription fonctionne
- [ ] La sauvegarde de progression fonctionne
- [ ] Le leaderboard s'affiche

### Performance
- [ ] 60 FPS stable sur mobile milieu de gamme
- [ ] Pas de memory leak (profiler 10 minutes)
- [ ] Temps de chargement < 3s sur 4G

---

*Document généré automatiquement — Dernière mise à jour : 2025-12-30*
