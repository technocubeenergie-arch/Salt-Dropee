# Système de parrainage avec validation Legend

## Objectif
- Bloquer les récompenses de parrainage tant que le filleul n’a pas atteint le mode Legend (niveau 6), afin de limiter les abus de comptes jetables ou les parties abandonnées.
- Centraliser l’intégralité de la validation dans PostgreSQL (Supabase) pour supprimer toute logique sensible côté client : le serveur reste la seule source de vérité et applique les contrôles d’éligibilité.

## Tables impliquées
- `referrals` : relie un parrain à un filleul.
  - `referrer_id` : identifiant du parrain qui recevra la récompense lorsque la validation est confirmée.
  - `referee_id` : identifiant du filleul dont le parcours Legend déclenche la validation.
  - `referee_validated_at` : horodatage de la première validation Legend pour ce filleul ; utilisé pour déclencher la récompense et empêcher toute double comptabilisation.
- `scores` : registre des scores Legend.
  - Seuls les enregistrements avec `level = 6` attestent d’un run Legend éligible à la validation.
- `referral_rewards` : suivi du crédit de récompenses par parrain.
  - `credited_count` : compteur de validations déjà créditées pour un parrain ; sert à calculer les gains et à éviter les doublons.

## Fonction SQL principale : `validate_referral_on_legend_run(p_referee_id uuid)`
- **Quand elle est appelée** : immédiatement après qu’un run Legend (niveau 6) du joueur `p_referee_id` a été enregistré dans `scores`. Le client déclenche un RPC Supabase vers cette fonction dès que le score est persistant.
- **Rôle exact** :
  1) Vérifier l’existence du lien de parrainage (`referrals.referee_id = p_referee_id`).
  2) Contrôler qu’un score Legend éligible est présent (`scores.level = 6` pour ce joueur).
  3) Si les conditions sont réunies et que `referee_validated_at` est encore `NULL`, marquer la validation en renseignant l’horodatage.
- **Valeur de retour** : `1` lorsque la validation vient d’être effectuée (transition de `NULL` à une date), `0` lorsqu’aucune mise à jour n’a été nécessaire (absence de lien, score Legend manquant ou validation déjà effectuée).
- **Idempotence** : un appel répété sur un filleul déjà validé ne modifie rien (`referee_validated_at` reste renseigné), et la fonction renvoie alors `0`. Les répétitions réseau sont donc neutres.

## Trigger de récompense
- **Déclenchement** : trigger sur `referrals` lorsque `referee_validated_at` passe de `NULL` à une valeur non nulle.
- **Effet** : incrémenter `referral_rewards.credited_count` pour le `referrer_id` associé afin de créditer exactement une récompense.
- **Garantie de singularité** : la condition « ancien `referee_validated_at` = `NULL` » et « nouveau `referee_validated_at` ≠ `NULL` » ne peut être vraie qu’une seule fois par filleul, ce qui rend impossible un double crédit.

## Garanties anti-triche
- Un filleul ne peut être validé qu’une seule fois grâce au couple fonction + trigger qui verrouille la transition de `referee_validated_at`.
- Les retries réseau ou les rafraîchissements côté client sont inoffensifs : la fonction idempotente renvoie `0` après la première validation.
- Aucune logique sensible (comptage, horodatage, calcul de récompense) n’est exposée au client ; seule la base applique les règles et demeure la source de vérité.

## Responsabilités du client (jeu)
- **À faire** :
  - Enregistrer un score Legend (niveau 6) dans `scores` après un run réussi.
  - Appeler `validate_referral_on_legend_run(p_referee_id)` via Supabase juste après la persistance du score.
- **À ne pas faire** :
  - Comptabiliser les validations ou décrémenter/incrémenter des compteurs.
  - Implémenter une logique de validation, de filtrage ou de déduplication côté application.
  - Tenter de contourner les protections anti-doublons ou de créditer manuellement des récompenses.

## Philosophie générale
- Séparation stricte client / backend : le client se limite à envoyer des faits (score Legend) et à demander la validation ; la base applique la décision.
- Logique métier atomique, transactionnelle et testable dans PostgreSQL (fonction + trigger) pour assurer auditabilité et prédictibilité.
- Simplification du client : aucune surface d’attaque via le front, toutes les protections sont centralisées dans la couche base de données.

## Résumé très court
- Validation uniquement après un score Legend (niveau 6) réel et stocké.
- Fonction SQL idempotente qui marque une seule fois `referee_validated_at`.
- Trigger créditant `credited_count` exactement une fois par filleul.
- Réseau instable ou appels répétés ne changent pas le résultat.
- Le client enregistre le score et appelle la fonction, tout le reste est en base.
