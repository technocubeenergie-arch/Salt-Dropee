# Raining Bud - Guide de Build Cordova

Ce guide vous explique comment builder **Raining Bud** en APK (Android) et IPA (iOS) avec Apache Cordova.

## 📋 Table des matières

1. [Prérequis](#prérequis)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Build Android (APK)](#build-android-apk)
5. [Build iOS (IPA)](#build-ios-ipa)
6. [Scripts disponibles](#scripts-disponibles)
7. [Troubleshooting](#troubleshooting)
8. [Distribution](#distribution)

---

## 🛠️ Prérequis

### Pour tous les builds

- **Node.js 16+** : [Télécharger](https://nodejs.org/)
- **Cordova CLI** : `npm install -g cordova`

### Pour Android (APK)

- **Java JDK 11 ou 17** : [Télécharger](https://adoptium.net/)
- **Android Studio** : [Télécharger](https://developer.android.com/studio)
- **Android SDK** (installé avec Android Studio)
- **Gradle** (inclus avec Android Studio)

**Variables d'environnement Android :**

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk  # macOS
# ou
export ANDROID_HOME=$HOME/Android/Sdk          # Linux

export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### Pour iOS (IPA) - Mac uniquement

- **macOS 11+**
- **Xcode 14+** : [Télécharger](https://developer.apple.com/xcode/)
- **Command Line Tools for Xcode** : `xcode-select --install`
- **CocoaPods** : `sudo gem install cocoapods`
- **Compte Apple Developer** (pour distribuer sur App Store)

---

## 📦 Installation

### 1. Cloner le projet

```bash
git clone https://github.com/technocubeenergie-arch/Salt-Dropee.git
cd Salt-Dropee
```

### 2. Installer les dépendances npm

```bash
npm install
```

### 3. Ajouter les plateformes

**Android :**
```bash
cordova platform add android
```

**iOS (Mac uniquement) :**
```bash
cordova platform add ios
```

### 4. Installer les plugins Cordova

Les plugins sont automatiquement installés depuis `config.xml` :

```bash
cordova prepare
```

**Plugins inclus :**
- `cordova-plugin-device` - Informations sur l'appareil
- `cordova-plugin-statusbar` - Contrôle de la barre de statut
- `cordova-plugin-splashscreen` - Écran de démarrage
- `cordova-plugin-network-information` - État de la connexion

---

## 🔧 Configuration

### Fichiers principaux

| Fichier | Description |
|---------|-------------|
| `config.xml` | Configuration Cordova (nom, ID, plugins, permissions) |
| `package.json` | Dépendances npm et scripts |
| `www/` | Code source de l'application web |
| `www/assets/icon.png` | Icône source (64x64 - à remplacer par 1024x1024 pour production) |
| `www/assets/splash.webp` | Splash screen source (394x702) |

### Modifier les métadonnées

Éditez `config.xml` pour changer :

```xml
<widget id="com.technocube.rainingbud" version="1.0.0">
    <name>Raining Bud</name>
    <description>...</description>
    <author email="contact@technocube.com">Freedam</author>
</widget>
```

---

## 📱 Build Android (APK)

### Build de debug (pour tester)

**Méthode 1 : Script automatique**
```bash
./build.sh android debug
```

**Méthode 2 : Commande manuelle**
```bash
cordova build android
```

**Sortie :** `platforms/android/app/build/outputs/apk/debug/app-debug.apk`

### Build de release (pour publier)

**1. Générer une clé de signature**

```bash
keytool -genkey -v -keystore rainingbud-release.keystore \
  -alias rainingbud \
  -keyalg RSA -keysize 2048 -validity 10000
```

**2. Créer `build.json`**

```json
{
  "android": {
    "release": {
      "keystore": "rainingbud-release.keystore",
      "storePassword": "VOTRE_MOT_DE_PASSE",
      "alias": "rainingbud",
      "password": "VOTRE_MOT_DE_PASSE",
      "keystoreType": ""
    }
  }
}
```

**⚠️ IMPORTANT** : Ajoutez `build.json` dans `.gitignore` !

**3. Builder le release**

```bash
./build.sh android release
# ou
cordova build android --release
```

**Sortie :** `platforms/android/app/build/outputs/apk/release/app-release.apk`

### Tester l'APK sur un appareil

**Via USB :**
```bash
cordova run android
```

**Via Android Studio :**
1. Ouvrir `platforms/android/` dans Android Studio
2. Brancher un appareil Android (mode développeur activé)
3. Cliquer sur "Run"

---

## 🍎 Build iOS (IPA)

### Prérequis macOS

Vérifiez que Xcode est bien configuré :

```bash
xcode-select --print-path
# Devrait afficher: /Applications/Xcode.app/Contents/Developer
```

### Build de debug

```bash
./build.sh ios debug
# ou
cordova build ios
```

### Ouvrir le projet dans Xcode

```bash
open platforms/ios/Raining\ Bud.xcworkspace
```

**Dans Xcode :**

1. Sélectionner votre équipe de développement (Apple ID)
2. Connecter un iPhone via USB
3. Sélectionner l'appareil cible
4. Cliquer sur "Run" (▶️)

### Build de release (pour App Store)

**1. Configurer le signing dans Xcode**

- Ouvrir `platforms/ios/Raining Bud.xcworkspace`
- Sélectionner le projet → Signing & Capabilities
- Choisir "Automatically manage signing"
- Sélectionner votre équipe Apple Developer

**2. Builder l'archive**

```bash
cordova build ios --release --device
```

**3. Créer l'IPA depuis Xcode**

1. Product → Archive
2. Window → Organizer
3. Sélectionner l'archive → "Distribute App"
4. Choisir "App Store Connect" ou "Ad Hoc"
5. Suivre l'assistant

---

## 🚀 Scripts disponibles

### NPM Scripts

```bash
# Serveur de développement local
npm start                    # Lance http://localhost:8000

# Builds Cordova
npm run cordova:build        # Build toutes les plateformes
npm run cordova:build:android
npm run cordova:build:ios

# Exécution sur appareil
npm run cordova:run:android
npm run cordova:run:ios

# Releases
npm run android:release
npm run ios:release

# Gestion des plateformes
npm run add:platform:android
npm run add:platform:ios
npm run remove:platform:android
npm run remove:platform:ios

# Nettoyage
npm run clean                # Nettoie les builds
```

### Script Shell

```bash
# Build Android debug
./build.sh android debug

# Build Android release
./build.sh android release

# Build iOS debug (Mac uniquement)
./build.sh ios debug

# Build les deux plateformes
./build.sh both debug
```

---

## 🐛 Troubleshooting

### Android

**Erreur : "ANDROID_HOME not set"**
```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
```

**Erreur : "No installed build tools found"**
```bash
# Dans Android Studio → SDK Manager → SDK Tools
# Installer "Android SDK Build-Tools"
```

**Erreur : "License not accepted"**
```bash
cd $ANDROID_HOME/tools/bin
./sdkmanager --licenses
# Accepter toutes les licences
```

### iOS

**Erreur : "Xcode not found"**
```bash
sudo xcode-select --switch /Applications/Xcode.app
```

**Erreur : "Signing for requires a development team"**
```bash
# Ouvrir le projet dans Xcode
# Signing & Capabilities → Team → Sélectionner votre Apple ID
```

**Erreur : "CocoaPods not installed"**
```bash
sudo gem install cocoapods
cd platforms/ios
pod install
```

### Général

**Erreur : "cordova: command not found"**
```bash
npm install -g cordova
```

**Les plugins ne s'installent pas**
```bash
cordova plugin remove cordova-plugin-device
cordova plugin add cordova-plugin-device
cordova prepare
```

**L'app ne se lance pas**
- Vérifier que `www/index.html` contient `<script src="cordova.js"></script>`
- Vérifier que `deviceready` est bien écouté dans `www/js/main.js`

---

## 📤 Distribution

### Google Play Store (Android)

1. Créer un compte développeur : [Google Play Console](https://play.google.com/console)
2. Builder l'APK release (voir section Android)
3. Créer une nouvelle application
4. Uploader l'APK dans "Production" ou "Test interne"
5. Remplir les informations requises (description, captures, etc.)
6. Soumettre pour review

**Alternative : Android App Bundle (AAB)**
```bash
cordova build android --release -- --packageType=bundle
```
Sortie : `platforms/android/app/build/outputs/bundle/release/app-release.aab`

### Apple App Store (iOS)

1. Créer un compte Apple Developer : [developer.apple.com](https://developer.apple.com) (99$/an)
2. Créer un App ID dans [App Store Connect](https://appstoreconnect.apple.com)
3. Builder l'archive dans Xcode (voir section iOS)
4. Distribuer via Xcode → Organizer → "Distribute App"
5. Remplir les métadonnées dans App Store Connect
6. Soumettre pour review

---

## 📝 Notes importantes

### Icônes et Splash Screens

**Icône actuelle :** 64x64 px (trop petit)

**Pour production, créer :**
- `icon.png` en **1024x1024 px** (haute résolution)
- `splash.png` en **2732x2732 px** (pour iPad Pro)

**Outil recommandé :** [cordova-res](https://github.com/ionic-team/cordova-res)

```bash
npm install -g cordova-res
cordova-res android --skip-config --copy
cordova-res ios --skip-config --copy
```

### Sécurité

- ⚠️ **NE JAMAIS** committer :
  - `build.json` (contient les mots de passe)
  - `*.keystore` (clés de signature)
  - `.env` (credentials)

- ✅ **Déplacer les credentials Supabase** vers des variables d'environnement

### Performance

- Les assets `www/assets/` pèsent **41 MB** (principalement PNG)
- Considérer la compression des images pour réduire la taille de l'APK/IPA
- Envisager le lazy loading des assets par niveau

---

## 🆘 Support

**Problème avec ce projet ?**
- Ouvrir une issue : [GitHub Issues](https://github.com/technocubeenergie-arch/Salt-Dropee/issues)

**Documentation Cordova officielle :**
- [Apache Cordova Docs](https://cordova.apache.org/docs/en/latest/)
- [Android Platform Guide](https://cordova.apache.org/docs/en/latest/guide/platforms/android/)
- [iOS Platform Guide](https://cordova.apache.org/docs/en/latest/guide/platforms/ios/)

---

**Version :** 1.0.0
**Auteur :** Freedam
**Licence :** MIT
