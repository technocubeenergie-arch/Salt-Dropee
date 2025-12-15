# Solution Définitive : Problème Gradle sur Windows 11

## 🎯 Résumé du problème

**Situation actuelle :**
- Gradle 9.1.0 installé globalement via Chocolatey
- Conflit avec le Gradle Wrapper interne de Cordova (Android 12.0.1)
- Erreur : `Could not compile script 'cordova.gradle' - unable to resolve class XmlParser`
- Tentative de désinstallation bloquée par le Gradle Daemon (processus Java verrouillant des centaines de fichiers JAR)

**Cause racine :**
Cordova Android 12.0.1 utilise son propre Gradle Wrapper (`platforms\android\gradlew.bat`) mais le Gradle global installé par Chocolatey prend la priorité, causant des incompatibilités de version.

---

## 🔧 Solution complète (Windows 11 PowerShell)

### Prérequis
Ouvrir PowerShell **en tant qu'Administrateur**

---

### **Étape 1 : Arrêter le Gradle Daemon**

Le Gradle Daemon est un processus Java en arrière-plan qui verrouille les fichiers.

```powershell
# Méthode 1 : Trouver et tuer les processus Java Gradle
Get-Process java -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        $process = $_
        $modules = $process.Modules | Where-Object { $_.FileName -like "*gradle*" }
        if ($modules) {
            Write-Host "Processus Gradle trouvé : PID $($process.Id)" -ForegroundColor Yellow
            Stop-Process -Id $process.Id -Force
            Write-Host "✓ Processus $($process.Id) arrêté" -ForegroundColor Green
        }
    } catch {
        # Ignorer les erreurs d'accès aux modules
    }
}
```

**Alternative si aucun processus n'est trouvé :**
```powershell
# Tuer tous les processus Java (ATTENTION : cela fermera aussi IntelliJ, Eclipse, etc.)
Get-Process java -ErrorAction SilentlyContinue | Stop-Process -Force
```

**Vérification :**
```powershell
# Aucun résultat = succès
Get-Process java -ErrorAction SilentlyContinue | Select-Object Id, ProcessName
```

---

### **Étape 2 : Supprimer le dossier Gradle de Chocolatey**

Une fois le Daemon arrêté, les fichiers ne sont plus verrouillés.

```powershell
# Supprimer le dossier complet
Remove-Item -Path "C:\ProgramData\chocolatey\lib\gradle" -Recurse -Force -ErrorAction Continue

# Vérifier la suppression
if (Test-Path "C:\ProgramData\chocolatey\lib\gradle") {
    Write-Host "✗ Le dossier existe encore" -ForegroundColor Red
} else {
    Write-Host "✓ Dossier Gradle supprimé avec succès" -ForegroundColor Green
}
```

**Si des fichiers résistent encore :**
```powershell
# Forcer la suppression avec cmd
cmd /c "rd /s /q C:\ProgramData\chocolatey\lib\gradle"
```

---

### **Étape 3 : Nettoyer les variables d'environnement**

```powershell
# Vérifier si Gradle est dans le PATH
$gradlePaths = $env:Path -split ';' | Where-Object { $_ -like "*gradle*" }

if ($gradlePaths) {
    Write-Host "⚠ Entrées Gradle trouvées dans le PATH :" -ForegroundColor Yellow
    $gradlePaths | ForEach-Object { Write-Host "  - $_" }
    Write-Host "`nSuppression manuelle requise via :" -ForegroundColor Cyan
    Write-Host "  Paramètres Windows > Système > Informations système avancées > Variables d'environnement"
} else {
    Write-Host "✓ Aucune entrée Gradle dans le PATH" -ForegroundColor Green
}
```

**Vérifier GRADLE_HOME :**
```powershell
if ($env:GRADLE_HOME) {
    Write-Host "⚠ GRADLE_HOME est défini : $env:GRADLE_HOME" -ForegroundColor Yellow
    Write-Host "Supprimez cette variable via les Paramètres système"
} else {
    Write-Host "✓ GRADLE_HOME n'est pas défini" -ForegroundColor Green
}
```

---

### **Étape 4 : Vérifier le Gradle Wrapper de Cordova**

Cordova Android 12.0.1 inclut son propre Gradle Wrapper qu'il faut utiliser exclusivement.

```powershell
# Aller dans le dossier du projet
cd "C:\Votre\Chemin\Vers\Salt-Dropee"

# Vérifier que le Gradle Wrapper existe
if (Test-Path "platforms\android\gradlew.bat") {
    Write-Host "✓ Gradle Wrapper de Cordova trouvé" -ForegroundColor Green

    # Tester la version
    .\platforms\android\gradlew.bat --version
} else {
    Write-Host "✗ Gradle Wrapper absent - réinstaller la plateforme Android" -ForegroundColor Red
    Write-Host "Commande : cordova platform rm android && cordova platform add android@12.0.1"
}
```

**Sortie attendue :**
```
Gradle 8.x
Groovy: 3.x
JVM: ...
```

---

### **Étape 5 : Builder l'APK Android**

Une fois Gradle nettoyé, utiliser la commande Cordova standard.

```powershell
# Build debug (par défaut)
cordova build android

# Build release (pour production)
cordova build android --release
```

**Emplacement de l'APK :**
- Debug : `platforms\android\app\build\outputs\apk\debug\app-debug.apk`
- Release : `platforms\android\app\build\outputs\apk\release\app-release-unsigned.apk`

---

## 🛡️ Prévention des conflits futurs

### **Règle #1 : Ne jamais installer Gradle globalement**

Cordova gère Gradle automatiquement via son Gradle Wrapper. Une installation globale cause des conflits de version.

**Si vous avez besoin de Gradle pour d'autres projets :**
```powershell
# Utiliser un Gradle Wrapper local par projet (recommandé)
# Chaque projet aura son propre gradlew.bat

# OU installer via SDKMAN sur WSL (isolation complète)
```

### **Règle #2 : Vérifier le PATH avant chaque build**

Créer un script de vérification `check-env.ps1` :

```powershell
# check-env.ps1
Write-Host "`n=== Vérification environnement Cordova ===" -ForegroundColor Cyan

# Vérifier que Gradle n'est PAS dans le PATH
$hasGradle = $env:Path -split ';' | Where-Object { $_ -like "*gradle*" }
if ($hasGradle) {
    Write-Host "✗ ERREUR : Gradle trouvé dans le PATH" -ForegroundColor Red
    exit 1
} else {
    Write-Host "✓ PATH propre (pas de Gradle global)" -ForegroundColor Green
}

# Vérifier Cordova
if (Get-Command cordova -ErrorAction SilentlyContinue) {
    Write-Host "✓ Cordova installé : $(cordova -v)" -ForegroundColor Green
} else {
    Write-Host "✗ Cordova non trouvé" -ForegroundColor Red
    exit 1
}

# Vérifier le Gradle Wrapper
if (Test-Path "platforms\android\gradlew.bat") {
    Write-Host "✓ Gradle Wrapper présent" -ForegroundColor Green
} else {
    Write-Host "✗ Gradle Wrapper absent" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Environnement OK pour builder ===" -ForegroundColor Green
```

**Usage :**
```powershell
.\check-env.ps1 && cordova build android
```

### **Règle #3 : Workflow standard Windows 11**

```powershell
# 1. Vérifier l'environnement
.\check-env.ps1

# 2. Build Android
cordova build android

# 3. Localiser l'APK
explorer platforms\android\app\build\outputs\apk\debug
```

---

## 📋 Checklist de résolution

Cochez au fur et à mesure :

- [ ] Étape 1 : Gradle Daemon arrêté (aucun processus Java Gradle actif)
- [ ] Étape 2 : Dossier `C:\ProgramData\chocolatey\lib\gradle` supprimé
- [ ] Étape 3 : PATH vérifié (aucune entrée Gradle)
- [ ] Étape 3 : GRADLE_HOME non défini
- [ ] Étape 4 : Gradle Wrapper Cordova fonctionnel (`gradlew.bat --version`)
- [ ] Étape 5 : Build réussi (`cordova build android`)
- [ ] APK généré dans `platforms\android\app\build\outputs\apk\debug\`

---

## ❓ Dépannage

### Problème : "Impossible d'arrêter les processus Java"
```powershell
# Redémarrer l'ordinateur pour forcer la fermeture
Restart-Computer
```

### Problème : "Fichiers toujours verrouillés après arrêt du Daemon"
```powershell
# Utiliser Handle de Sysinternals pour identifier les processus
# Télécharger : https://learn.microsoft.com/sysinternals/downloads/handle
handle.exe gradle
```

### Problème : "cordova build android échoue encore"
```powershell
# Supprimer et réinstaller la plateforme Android
cordova platform rm android
cordova platform add android@12.0.1
cordova build android
```

### Problème : "Gradle Wrapper ne fonctionne pas"
```powershell
# Vérifier que Java est installé et dans le PATH
java -version  # Devrait afficher Java 11 ou supérieur

# Si Java manque, installer OpenJDK 17 (recommandé pour Cordova)
# https://adoptium.net/temurin/releases/
```

---

## 📚 Références

- **Cordova Android 12.0.1** : Utilise Gradle Wrapper 8.x
- **Gradle Wrapper** : `platforms\android\gradlew.bat` (ne pas toucher)
- **Config Cordova** : `config.xml` et `package.json`
- **Documentation Cordova** : https://cordova.apache.org/docs/en/latest/guide/platforms/android/

---

## 🎓 Ce qu'on a appris

1. **Cordova gère Gradle automatiquement** - Ne jamais installer Gradle globalement
2. **Le Gradle Daemon peut bloquer la désinstallation** - Toujours l'arrêter avant de nettoyer
3. **Chocolatey peut laisser des résidus** - Vérifier manuellement après désinstallation
4. **Le Gradle Wrapper est par projet** - Chaque projet Cordova a le sien
5. **Windows peut verrouiller les fichiers Java** - Utiliser `-Force` ou redémarrer si nécessaire

---

**Auteur** : Claude
**Date** : 2025-12-15
**Projet** : Raining Bud (Salt-Dropee)
**Contexte** : Résolution définitive du conflit Gradle 9.1.0 (global) vs Gradle Wrapper Cordova (8.x)
