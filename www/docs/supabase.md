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

## Provisioning côté Supabase

Le client JavaScript se base sur le schéma SQL fourni (tables `players`, `progress`, `scores`, etc.) avec RLS activé. Pour relier un compte Supabase Auth à un profil joueur et stocker le pseudo unique, créez un trigger `AFTER INSERT` sur `auth.users` qui insère la ligne correspondante dans `public.players`. Exemple minimal :

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

Le pseudo reste soumis à la contrainte d'unicité `players_username_key`. Le client vérifie désormais la disponibilité du pseudo avant d'appeler `supabase.auth.signUp`, mais le trigger continue de faire foi en dernier ressort (en cas de course, l'erreur est capturée et un message compréhensible est affiché à l'utilisateur).
