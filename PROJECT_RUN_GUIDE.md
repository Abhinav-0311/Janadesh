# EPICS-Janadesh Complete Run Guide (Web + Android)

This guide is the operational manual for running the project from zero to full demo.

## 1. What This Project Includes

- Backend API: Node.js + Express + TypeScript + PostgreSQL
- Frontend Web App: React + Vite + TypeScript
- Android App: Capacitor wrapper around the frontend
- Authentication: email register + email verification OTP + email login OTP

## 2. Folder Map

- `Backend` -> API, DB scripts, auth, voting services
- `frontend-react` -> web app and Android/iOS wrappers
- `Docs`, `Frontend`, `Springboot` -> legacy/other project folders (not needed for current run path)

## 3. Prerequisites

- Node.js (LTS recommended)
- npm
- PostgreSQL running locally
- Android Studio installed
- Android phone with USB debugging enabled
- Java 21 from Android Studio JBR
- Optional: cloudflared (for network tunnel when phone cannot access local backend over Wi-Fi)

## 4. One-Time Install

## 4.1 Backend

```powershell
cd "Backend"
npm install
```

## 4.2 Frontend

```powershell
cd "frontend-react"
npm install
```

## 5. Backend Environment Setup

Configure `Backend/.env` with at least:

- `PORT=3001`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `EMAIL_ENABLED=true`
- SMTP values:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `FROM_EMAIL`

Recommended dev CORS override while running:

- `CORS_ORIGIN=*`
- `CORS_CREDENTIALS=false`

## 6. Start Backend

```powershell
cd "Backend"
$env:CORS_ORIGIN="*"
$env:CORS_CREDENTIALS="false"
npm run dev
```

Keep this terminal running.

## 7. Seed Demo Data (Required for visible elections)

If DB is empty or you want a fresh demo dataset:

```powershell
cd "Backend"
npm run demo:reset-seed
```

Inserted data includes:

- demo users (`admin`, `creator1`, `demo_voter`)
- active/upcoming/ended elections
- candidates and sample vote counts

## 8. Run Frontend on Web

```powershell
cd "frontend-react"
$env:VITE_API_URL="http://localhost:3001/api/v1"
npm run dev -- --host 127.0.0.1 --port 5173
```

Open: `http://127.0.0.1:5173`

## 9. Android Build and Run

## 9.1 Java 21 requirement

Project is configured with:

- `frontend-react/android/gradle.properties`
- `org.gradle.java.home=C:\\Program Files\\Android\\Android Studio\\jbr`

Optional terminal setup:

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
java -version
```

Expected major version: `21`.

## 9.2 Build app assets + sync Android

```powershell
cd "frontend-react"
npm run mobile:build
```

## 9.3 Run on a specific phone

Check device ID:

```powershell
adb devices
```

Run:

```powershell
npx cap run android --target RZCW60MRD4N
```

Use your own ID if different.

## 10. Network Options for Phone API Access

## Option A: Direct LAN (preferred if available)

Set API URL to your PC IP:

```powershell
$env:VITE_API_URL="http://<PC_IP>:3001/api/v1"
```

Common issue: many networks block peer-to-peer traffic.

## Option B: Cloudflare Quick Tunnel (most reliable in restricted networks)

Start tunnel:

```powershell
cloudflared tunnel --url http://localhost:3001
```

Use generated URL:

```powershell
$env:VITE_API_URL="https://<subdomain>.trycloudflare.com/api/v1"
npm run mobile:build
npx cap run android --target RZCW60MRD4N
```

Important:

- tunnel URL changes on restart
- rebuild app every time URL changes

Verify URL embedded in built app:

```powershell
Select-String -Path ".\android\app\src\main\assets\public\assets\*.js" -Pattern "trycloudflare.com"
```

## 11. Email OTP Flow (Current Auth Logic)

1. Register user with email + username
2. Receive email verification OTP
3. Verify email
4. Request login OTP
5. Login with email OTP

If OTP not received:

- check SMTP credentials
- check spam folder
- check backend logs for mail send error

## 12. Common Errors and Fixes

## 12.1 `invalid source release: 21`

- Cause: wrong Java runtime for Gradle
- Fix: ensure Android Studio JBR path is set in `gradle.properties` and/or terminal env

## 12.2 `Failed to fetch` on phone

- Cause candidates:
  - backend not running
  - wrong/stale `VITE_API_URL`
  - tunnel URL changed
  - app not rebuilt after env change
- Fix:
  - restart backend
  - verify tunnel URL opens `/api/v1` on phone browser
  - rebuild app and reinstall

## 12.3 App builds but no elections visible

- Cause: empty DB
- Fix: `npm run demo:reset-seed`

## 13. Validation Checklist Before Demo

1. Backend running without startup errors
2. `npm run demo:reset-seed` executed
3. Frontend opens and lists elections
4. Registration + OTP email works
5. Login works
6. Vote can be cast successfully
7. Android app opens and calls API without fetch errors

## 14. Useful Commands

Backend:

```powershell
npm run build
npm run demo:reset-seed
npm run db:status
```

Frontend:

```powershell
npm run test:run
npm run build
npm run mobile:build
npx cap run android --target <device-id>
```

ADB:

```powershell
adb devices
adb -s <device-id> uninstall com.janadesh.app
adb -s <device-id> reverse --remove-all
adb -s <device-id> reverse --list
```

