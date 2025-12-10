# 🚀 Raining Bud - Quick Start

Guide rapide pour builder votre première APK ou IPA en 5 minutes.

## ⚡ Installation express

### 1. Prérequis minimum

**Pour Android (APK) :**
```bash
# Installer Node.js 16+ depuis https://nodejs.org
# Installer Android Studio depuis https://developer.android.com/studio
# Installer Cordova CLI
npm install -g cordova
```

**Pour iOS (IPA) - Mac uniquement :**
```bash
# Installer Xcode depuis l'App Store
# Installer Cordova CLI
npm install -g cordova
```

### 2. Setup du projet

```bash
# Cloner et entrer dans le repo
cd Salt-Dropee

# Installer les dépendances
npm install

# Ajouter la plateforme Android
cordova platform add android

# (Optionnel) Ajouter iOS si vous êtes sur Mac
cordova platform add ios
```

### 3. Build !

**Android :**
```bash
./build.sh android debug
```

Votre APK sera dans : `platforms/android/app/build/outputs/apk/debug/app-debug.apk`

**iOS (Mac seulement) :**
```bash
./build.sh ios debug
open platforms/ios/Raining\ Bud.xcworkspace
# Puis cliquer sur Run dans Xcode
```

---

## 📱 Tester sur votre téléphone

### Android

**Via USB :**
1. Activer "Mode développeur" sur votre Android
2. Activer "Débogage USB"
3. Brancher le téléphone
4. `cordova run android`

**Via fichier APK :**
1. Copier `app-debug.apk` sur votre téléphone
2. Ouvrir le fichier et installer
3. Autoriser l'installation depuis sources inconnues si demandé

### iOS (Mac + iPhone)

1. Brancher votre iPhone
2. Ouvrir le projet : `open platforms/ios/Raining\ Bud.xcworkspace`
3. Dans Xcode : Signing & Capabilities → choisir votre Apple ID
4. Sélectionner votre iPhone comme cible
5. Cliquer sur Run (▶️)

---

## 🆘 Problèmes courants

**"ANDROID_HOME not set"**
```bash
export ANDROID_HOME=$HOME/Android/Sdk
```

**"cordova: command not found"**
```bash
npm install -g cordova
```

**L'app crashe au démarrage**
- Vérifier que vous avez bien fait `npm install`
- Vérifier que `cordova prepare` a été exécuté

---

## 📖 Documentation complète

Pour plus de détails (builds release, signatures, App Store, etc.) :
👉 **[README-CORDOVA.md](./README-CORDOVA.md)**

---

## ✅ Checklist avant release

- [ ] Icône en 1024x1024 px (actuellement 64x64)
- [ ] Splash screen en haute résolution
- [ ] Version correcte dans `config.xml`
- [ ] Bundle ID unique configuré
- [ ] Credentials Supabase en variables d'environnement (pas hardcodées)
- [ ] Tester sur appareil réel
- [ ] Générer clé de signature (Android)
- [ ] Configurer Apple Developer account (iOS)

---

**Besoin d'aide ?** Ouvrez une issue sur GitHub ! 🙌
