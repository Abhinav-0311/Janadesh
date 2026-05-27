# GPT Codex Handoff (Deep Detail) - EPICS-Janadesh

Purpose: a complete context-transfer document for any new AI/human contributor to continue work, prepare reports, or build a presentation without losing project history.

## 1) Executive Summary

EPICS-Janadesh is a secure digital voting platform with web and Android delivery. The stack is:

- Backend: Node.js, Express, TypeScript, PostgreSQL
- Frontend: React + Vite + TypeScript
- Mobile: Capacitor Android wrapper
- Auth: email-based registration + email verification OTP + email login OTP

During this phase, the project was stabilized end-to-end: auth behavior aligned, mobile build blockers fixed, network debugging completed, runtime DB reset/seed workflow finalized, and documentation consolidated.

## 2) Initial Problems Observed

1. Auth direction drifted between phone OTP and email OTP.
2. Frontend and backend auth payload expectations diverged.
3. Android builds failed due to:
   - Kotlin duplicate classes
   - Java source release mismatch (21)
4. Mobile app frequently showed `Failed to fetch`.
5. Project had multiple stale docs and generated artifacts causing context clutter.

## 3) Architecture Snapshot

## 3.1 Backend

- API routes under `/api/v1`
- Key concerns:
  - auth controllers/services
  - election and voting controllers/services
  - DB repositories
  - email service for OTP delivery

Core backend files touched in this phase:

- `Backend/src/controllers/AuthController.ts`
- `Backend/src/services/AuthService.ts`
- `Backend/src/app.ts`

## 3.2 Frontend

- Single-page app with stages:
  - landing
  - auth
  - verify-email
  - OTP login
  - election/voting/result journey

Core frontend files touched:

- `frontend-react/src/App.tsx`
- `frontend-react/src/services/auth/index.ts`

## 3.3 Mobile

- Capacitor config + Android project under `frontend-react/android`
- Build + sync flows controlled via npm scripts in `frontend-react/package.json`

Files touched:

- `frontend-react/capacitor.config.ts`
- `frontend-react/android/build.gradle`
- `frontend-react/android/gradle.properties`
- `frontend-react/android/app/src/main/AndroidManifest.xml`

## 4) Functional Outcomes Achieved

## 4.1 Auth Stabilization (Email OTP)

- Register path expects email and user profile data.
- Email verification step is active.
- Login OTP is email-driven.
- Frontend and backend payload formats are aligned.

## 4.2 Data Lifecycle

- Full runtime cleanup capability tested.
- Demo reseed script used to restore elections/candidates/users quickly.

Primary script:

- `Backend/scripts/reset-seed-demo-data.js`
- command: `npm run demo:reset-seed`

## 4.3 Mobile Integration

- Capacitor integrated for hybrid Android.
- Android app build path now repeatable.
- Java toolchain pinned to Android Studio JBR for compatibility.

## 5) Important Fixes and Rationale

## 5.1 Kotlin Duplicate Class Conflict

Symptom:

- Duplicate classes between `kotlin-stdlib` and older `kotlin-stdlib-jdk7/jdk8`.

Fix:

- Updated Android Gradle resolution strategy in root build config to force consistent Kotlin stdlib and exclude old artifacts.

## 5.2 Java 21 Build Error

Symptom:

- `Execution failed for task ':capacitor-android:compileDebugJavaWithJavac'`
- `invalid source release: 21`

Fix:

- Set `org.gradle.java.home` in `frontend-react/android/gradle.properties` to:
  - `C:\\Program Files\\Android\\Android Studio\\jbr`

## 5.3 Mobile API Fetch Failures

Primary causes:

1. LAN reachability issues in network environment
2. stale build with old `VITE_API_URL`
3. tunnel URL change without rebuild
4. restrictive origin behavior before CORS improvement

Applied fixes:

- Dev-friendly CORS logic in backend non-production path
- Android cleartext support path for local HTTP testing
- strict rebuild guidance when tunnel URL changes

## 6) Documentation and Cleanup Performed

Removed:

- stale status reports
- duplicate handoff/history notes
- old test output markdowns
- generated frontend `dist`

Kept:

- run guide
- detailed handoff
- presentation outline
- mobile setup guide
- core readmes

Added/updated:

- `PROJECT_RUN_GUIDE.md`
- `GPT_CODEX_HANDOFF_DETAILED.md` (this file)
- `PRESENTATION_SLIDES_OUTLINE.md`
- `LAST.md`

## 7) Current Known-Good Flow

1. Start backend (`npm run dev`) with dev CORS env overrides.
2. Seed demo dataset if needed (`npm run demo:reset-seed`).
3. Start tunnel if LAN access is unreliable.
4. Set `VITE_API_URL` to active backend/tunnel URL.
5. Rebuild mobile app (`npm run mobile:build`).
6. Run on phone target (`npx cap run android --target <device-id>`).

## 8) Validation Evidence (Operational)

Validated in this cycle:

- backend builds successfully
- frontend builds successfully
- frontend tests pass
- android debug build succeeds after Java/Kotlin fixes
- election list visibility restored via reseed
- authentication and app navigation functioning in current flow

## 9) Risks and Constraints

1. Cloudflare quick tunnel URL changes every restart.
2. App must be rebuilt each time URL changes.
3. SMTP must remain valid for OTP delivery.
4. Distribution-grade Android signing and store release flow not fully formalized yet.

## 10) Recommended Next Milestones

1. Deploy backend to stable HTTPS domain and remove tunnel dependency.
2. Build signed release APK/AAB.
3. Add CI checks for:
   - backend build
   - frontend build/tests
   - android assembleDebug smoke
4. Add E2E test script for:
   - register -> verify email -> login -> fetch elections -> vote

## 11) Key Paths for New Contributor

- Auth backend:
  - `Backend/src/controllers/AuthController.ts`
  - `Backend/src/services/AuthService.ts`
- Backend app middleware:
  - `Backend/src/app.ts`
- Frontend flow:
  - `frontend-react/src/App.tsx`
  - `frontend-react/src/services/auth/index.ts`
- Mobile:
  - `frontend-react/capacitor.config.ts`
  - `frontend-react/android/build.gradle`
  - `frontend-react/android/gradle.properties`
  - `frontend-react/android/app/src/main/AndroidManifest.xml`

## 12) Suggested Prompt for New ChatGPT Session

Use this prompt:

> "Read `LAST.md`, `PROJECT_RUN_GUIDE.md`, and `GPT_CODEX_HANDOFF_DETAILED.md`. Continue from current working state, prioritize stable production deployment (backend HTTPS domain + signed Android release), and preserve existing email OTP auth behavior."

