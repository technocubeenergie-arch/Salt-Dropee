# Configuration Supabase

## 🔐 Sécurité des credentials

Les credentials Supabase **NE SONT PAS** versionnées dans git pour des raisons de sécurité.

## 📋 Setup pour développeurs

### 1. Créer le fichier de configuration local

Copiez le fichier d'exemple :

```bash
cp www/js/config.remote.example.js www/js/config.local.js
```

### 2. Remplir vos credentials

Éditez `www/js/config.local.js` et remplacez les valeurs d'exemple par vos vraies credentials Supabase :

```javascript
export const SUPABASE_ENABLED = true;
export const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';
```

### 3. Où trouver vos credentials ?

1. Allez sur [Supabase Dashboard](https://app.supabase.com)
2. Sélectionnez votre projet
3. Allez dans **Settings** → **API**
4. Copiez :
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`

## ⚠️ Important

- **NE JAMAIS** committer le fichier `config.local.js`
- Ce fichier est déjà dans `.gitignore`
- Utilisez le fichier d'exemple (`config.remote.example.js`) comme référence

## 🔒 Sécurité additionnelle recommandée

Pour une sécurité maximale en production :

1. **Row Level Security (RLS)** : Activez RLS sur toutes vos tables Supabase
2. **Rate Limiting** : Configurez des limites de requêtes dans Supabase
3. **Email validation** : Gardez la validation email activée
4. **Domaines autorisés** : Limitez les domaines autorisés dans Supabase Auth

## 📚 Documentation

- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase API Settings](https://supabase.com/docs/guides/api)
