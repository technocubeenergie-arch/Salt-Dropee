# Audit & micro-optimisations

## Problèmes corrigés
- Items retirés du jeu qui conservaient leur tween GSAP actif → ajout d'un passage `gsap.killTweensOf` lors du nettoyage et utilisation d'une liste tampon pour ne garder que les éléments vivants. Justification : évite les tweens orphelins et stabilise le cycle de rendu sans impacter le gameplay.
- Rect de collision portefeuille reconstruit à chaque frame → réutilisation d'une structure partagée. Justification : supprime l'allocation récurrente dans la boucle serrée.
- Possibilité théorique de lancer plusieurs boucles `requestAnimationFrame` simultanées (reprise/relance) → garde-fou global remis à zéro à chaque arrêt. Justification : garantit une seule boucle active comme demandé, sans modifier la cadence.

## Vérifié et laissé en l'état
- `index.html` : meta viewport, ordre de chargement (GSAP puis main), inclusion conditionnelle de cordova.js et attribut `defer` déjà conformes.
- Styles HUD/canvas : uniquement rendu côté canvas, aucune ombre coûteuse persistante supplémentaire détectée.
- Gestion des bonus (aimant/bouclier/x2) : tweens déjà arrêtés via `finish()/kill()` et `FxManager.clear`, références actives nettoyées.
- Chargement wallet : swap effectué via `onload`, ratio inchangé, aucun flash.
- Aucun `new Image()` dans les boucles runtime, uniquement au démarrage.

## Validation
Aucun changement visuel ou de gameplay observé (revue sur desktop, vérification des chemins/événements tactiles pour mobile).

## Points d'attention
- [x] Progression d’échelle des items avec aimant reste correcte.
- [x] Transitions de wallet sans flash (swap en onload).
- [x] Bonus aimant/bouclier/x2 sans fuite (timelines stoppées).
- [x] HUD (icônes+timers) sans reflow DOM.
- [x] Une seule source requestAnimationFrame.
- [x] Aucun new Image() dans des boucles.
- [x] Chemins 100% relatifs (Cordova / Pages OK).
