# Janadesh Mobile App Setup (Capacitor)

This frontend is now configured as a hybrid app using Capacitor.

## What is ready
- Capacitor initialized with:
  - `appId`: `com.janadesh.app`
  - `appName`: `Janadesh`
  - `webDir`: `dist`
- Native projects created:
  - `android/`
  - `ios/`

## Prerequisites
- Node.js and npm
- Android Studio (for Android builds)
- Xcode + CocoaPods on macOS (for iOS builds)

## Important API setting
For mobile builds, set backend URL explicitly so the app does not use relative `/api/v1`.

PowerShell example:

```powershell
$env:VITE_API_URL="https://your-backend-domain.com/api/v1"
npm run mobile:android
```

## Commands
From `frontend-react`:

```powershell
npm run mobile:build
```
- Builds web assets and syncs to native projects.

```powershell
npm run mobile:android
```
- Builds, syncs Android, and opens Android Studio.

```powershell
npm run mobile:ios
```
- Builds, syncs iOS, and opens Xcode (macOS only).

## Output
- Android app source: `frontend-react/android`
- iOS app source: `frontend-react/ios`

To create installable packages:
- Android: build APK/AAB from Android Studio.
- iOS: archive and export from Xcode.
