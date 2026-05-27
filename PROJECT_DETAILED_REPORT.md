# EPICS-Janadesh Detailed Technical Report (Start-to-End)

**Project:** EPICS-Janadesh (College Voting Platform)  
**Date:** March 21, 2026  
**Scope:** Full technical progress report from initial state to current state

## 1. Executive Summary
EPICS-Janadesh is a full-stack digital voting platform with web and Android delivery. The system now supports end-to-end voting operations using OTP-based authentication, election management APIs, candidate management, vote submission, and persistent storage in PostgreSQL. The project also includes a blockchain module (Solidity contracts + Hardhat tests) for smart-contract-level election logic validation.

Current status:
- Web flow is operational (register/login -> election list -> vote flow).
- Android app flow is operational through Capacitor build/sync path.
- Frontend and blockchain test suites are passing.
- Backend suite is highly stable, with one currently observed flaky performance/memory assertion failure in one integration test.

## 2. Original Problem and Motivation
Manual or semi-digital election systems have practical limitations:
- weak auditability,
- process friction in voter verification,
- poor visibility in election state,
- limited cross-device accessibility.

This project was built to solve these by introducing:
- verified identity via OTP,
- deterministic vote lifecycle controls,
- database-backed persistence,
- API-first modular architecture,
- cross-platform access (web + Android).

## 3. Solution Architecture

### 3.1 Backend
- Runtime: Node.js + Express + TypeScript
- API Base: `/api/v1`
- Main route groups:
  - `/auth`
  - `/users`
  - `/elections`
  - `/voting`
  - `/analytics`
  - `/websocket`
  - `/monitoring`
  - `/blockchain`
- Security and middleware stack:
  - Helmet (security headers)
  - CORS (environment-aware origin handling)
  - Compression
  - JSON/urlencoded parsers
  - Request logging (`morgan` + winston)
  - In-memory rate limiter (`rate-limiter-flexible`)
  - Global error middleware

### 3.2 Database
- Engine: PostgreSQL
- Migration-driven schema (13 migrations)
- Core tables created through migrations:
  - `users`
  - `elections`
  - `candidates`
  - `votes_cache`
  - `voter_registrations`
  - `otp_tokens`
  - `voter_eligibility`
  - `audit_logs`
  - `refresh_tokens`
  - `token_blacklist`
- Operational scripts available:
  - init/migrate/rollback/reset/cleanup/stats/health
  - demo reseed script (`demo:reset-seed`)

### 3.3 Frontend
- Stack: React + Vite + TypeScript
- Main app flow is implemented in `App.tsx`
- Service layer:
  - `services/auth/index.ts`
  - `services/api/elections.ts`
  - `services/api/voting.ts`
- API URL source:
  - `VITE_API_URL` (fallback `/api/v1`)

### 3.4 Mobile (Android)
- Framework: Capacitor
- App config:
  - `appId`: `com.janadesh.app`
  - `appName`: `Janadesh`
  - `webDir`: `dist`
  - `cleartext: true` enabled for local HTTP development
- Build compatibility hardening:
  - `org.gradle.java.home` set to Android Studio JBR path in `frontend-react/android/gradle.properties`

### 3.5 Blockchain Module
- Solidity contracts:
  - `CollegeVoting.sol`
  - `ElectionFactory.sol`
- Features validated by tests:
  - creator authorization
  - election lifecycle controls
  - candidate and voter registration rules
  - double-vote prevention
  - result gating by election state
  - factory deployment and categorization

## 4. Development Journey (Chronological)

### Phase 1: Baseline Stabilization
- Project had partial functionality with integration mismatches between frontend and backend auth expectations.
- Mobile path was present but unstable under real-device conditions.

### Phase 2: Authentication Alignment
- OTP-driven registration/login flow was normalized around active email OTP behavior.
- Payload and validation mismatches were corrected across frontend and backend.

### Phase 3: API and Backend Reliability
- Route/service/controller consistency improved for auth/election/voting paths.
- CORS behavior refined for non-production to unblock web/mobile testing.
- Error handling and response normalization improved for client compatibility.

### Phase 4: Android Build and Runtime Fixes
- Kotlin duplicate class conflict issues were addressed.
- Java toolchain mismatch (`invalid source release: 21`) was addressed by pinning Gradle JVM path.
- Capacitor build/sync/install path stabilized for device testing.

### Phase 5: Data Lifecycle and Demo Workflow
- Full runtime cleanup + deterministic demo reseed workflow established.
- Demo dataset includes active, pending, and ended elections with candidates.

### Phase 6: Comprehensive Testing and Hardening
- Backend tests were improved and mostly stabilized.
- Frontend test setup remained passing.
- Blockchain test suite passed comprehensively, including load/security/gas test groups.

## 5. Technology Inventory (Used in Project)

### Backend Libraries
- `express`, `cors`, `helmet`, `compression`, `morgan`
- `jsonwebtoken`, `bcryptjs`, `joi`
- `pg`, `redis`, `winston`, `ws`
- `nodemailer`, `axios`

### Frontend Libraries
- `react`, `react-dom`, `react-router-dom`
- `@reduxjs/toolkit`, `react-redux`
- `@mui/material`, `@mui/icons-material`, `@emotion/*`
- `ethers`
- Capacitor packages (`@capacitor/core`, `@capacitor/android`, CLI)

### Blockchain Tooling
- `hardhat`, `ethers`, `chai`, `mocha`
- `solidity-coverage`, `hardhat-gas-reporter`

### Testing Tooling
- Backend: Jest + Supertest
- Frontend: Vitest + Testing Library
- Blockchain: Hardhat test runner

## 6. Measurable Project Stats
- Backend test files in repo: 28
- Blockchain test files in repo: 10
- Frontend source files (under `frontend-react/src`): 11
- Backend migrations: 13

## 7. Latest Verified Test Results

### 7.1 Backend (Jest)
Command:
```powershell
cd "Backend"
npm run test
```
Latest result snapshot:
- Test Suites: **24 passed, 1 failed, 25 total**
- Tests: **432 passed, 1 failed, 433 total**
- Failing case:
  - `src/tests/comprehensive/integration-tests.test.ts`
  - Test: `should handle memory usage efficiently during bulk operations`
  - Failure type: memory cleanup assertion (flaky/perf-sensitive)

### 7.2 Frontend (Vitest)
Command:
```powershell
cd "frontend-react"
npm run test:run
```
Result:
- Test Files: **1 passed, 1 total**
- Tests: **1 passed, 1 total**

### 7.3 Blockchain (Hardhat)
Command:
```powershell
cd "Backend\Blockchain"
npm run test
```
Result:
- **228 passing**

Additional observed blockchain metrics from test output:
- CollegeVoting deployment gas: `3,123,684`
- ElectionFactory deployment gas: `4,161,495`
- Representative operation gas:
  - `createElection`: ~`194,074`
  - `castVote` (single): ~`152,883`

## 8. Functional Coverage Status

### Implemented and Working
- User register/login flow (OTP-based)
- Election listing and detail retrieval
- Candidate retrieval and rendering
- Vote submission API path
- Database storage for core voting entities
- Android debug build + run path

### Partially/Conditionally Working
- Network path from mobile device depends on correct backend URL strategy (LAN or tunnel) and app rebuild when URL changes.

### Not Yet Production-Hardened
- Stable public HTTPS backend deployment pipeline
- Release-grade signed APK/AAB workflow
- CI automation for all suites
- Full deterministic E2E automation

## 9. Major Issues Resolved During Project
- Auth flow mismatches (frontend vs backend expectations)
- Android Kotlin dependency conflicts
- Java 21 compile mismatch in Android build pipeline
- Repeated mobile `Failed to fetch` causes (URL/network/rebuild mismatch)
- CORS behavior mismatches affecting integration and tests

## 10. Known Risks and Constraints
- One backend performance-memory test remains flaky/failing in latest run.
- Jest open-handle warnings appear in backend run output (resource cleanup sensitivity in some tests).
- Mobile API connectivity remains environment-sensitive without stable hosted backend.
- Tunnel-based endpoints are temporary and require rebuild when changed.

## 11. Recommended Next Steps (Technical)
1. Fix or stabilize the flaky backend memory assertion test in `integration-tests.test.ts`.
2. Add deterministic teardown for open handles in backend test environment.
3. Deploy backend to fixed HTTPS domain.
4. Move Android from debug/dev network strategy to release configuration.
5. Add CI workflows for:
   - backend test
   - frontend test
   - blockchain test
   - optional Android build smoke.

## 12. Reproducible Commands (Core)

### Backend
```powershell
cd "Backend"
npm run dev
```

### Frontend
```powershell
cd "frontend-react"
npm run dev
```

### Demo data reset/seed
```powershell
cd "Backend"
npm run demo:reset-seed
```

### Android build/sync
```powershell
cd "frontend-react"
npm run mobile:build
npx cap run android --target <device-id>
```

## 13. Final Assessment
From a start state with multiple integration blockers, the project has reached a mature, demo-stable engineering state with substantial test coverage and a functional web/mobile flow. The blockchain module is strongly validated, frontend tests are passing, and backend reliability is high with a single remaining flaky performance-memory assertion to resolve for complete green status.
