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

L'authentification charge désormais le profil joueur (`public.players`) au démarrage et après chaque connexion. L'objet exposé par `window.SaltAuth.getState()` inclut `profile` (id, authUserId, username, etc.) pour afficher le pseudo et préparer l'affichage du leaderboard.

## Provisioning côté Supabase

Le client JavaScript se base sur le schéma SQL fourni (tables `players`, `progress`, `scores`, etc.) avec RLS activé. Lorsqu'un utilisateur dispose d'une session Supabase (inscription sans confirmation ou première connexion après confirmation), le front effectue un `upsert` explicite dans `public.players` avec `auth_user_id = auth.users.id` et le pseudo saisi. Cette opération est lancée dès que l'utilisateur est authentifié (signUp avec session, signIn, restauration de session, onAuthStateChange) et alimente `window.SaltAuth.getState().profile` (id, authUserId, username…). Le pseudo suit la contrainte d'unicité `players_username_key` et toute collision est remontée côté UI.

Un trigger `AFTER INSERT` sur `auth.users` reste possible en complément (pour couvrir des inscriptions réalisées via d'autres canaux), par exemple :

```sql
create or replace function public.handle_new_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.players (auth_user_id, username)
  values (new.id, nullif(trim((new.raw_user_meta_data->>'username')::text), '')::citext)
  on conflict (auth_user_id) do update set username = excluded.username;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_player();
```

Si le trigger est absent ou différent, le client continue malgré tout d'assurer la création/synchronisation du profil lors de la connexion, sans rompre le mode hors-ligne (fallback `localStorage`).
