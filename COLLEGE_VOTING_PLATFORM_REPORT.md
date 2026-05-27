# COLLEGE VOTING PLATFORM REPORT

## Project Title
EPICS-Janadesh: Secure College Voting Platform (Web + Android)

## Date
March 21, 2026

## 1. Introduction
This project was developed to provide a secure, transparent, and practical digital voting system for college-level elections. The platform is built to support complete voter flow from registration and verification to vote casting and result viewing, with data persistence in PostgreSQL and optional blockchain testing support.

The system is available as:
- Web application (React frontend)
- Android mobile application (Capacitor wrapper over the frontend)
- Backend REST API (Node.js + Express + TypeScript)
- Database layer (PostgreSQL)
- Smart contract test module (Hardhat + Solidity)

## 2. Problem Statement
Traditional voting methods in institutions are often time-consuming, difficult to audit, and prone to process-level inconsistencies. A digital system is needed that can:
- verify users securely,
- prevent duplicate voting,
- store votes reliably,
- provide controlled result visibility,
- and run on both web and mobile.

## 3. Objectives
- Build secure OTP-based authentication.
- Enable voter registration/login and identity verification.
- Display elections and candidates clearly.
- Allow one-voter-one-vote flow.
- Persist vote and election data in database.
- Provide a deployable path for Android usage.
- Ensure code quality through backend, frontend, and blockchain tests.

## 4. Technology Stack
- Frontend: React, Vite, TypeScript
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL
- Mobile: Capacitor, Android Studio
- Smart Contracts/Test: Solidity, Hardhat, Chai, Ethers
- Tooling: npm, Jest, Vitest, ADB, Cloudflare Tunnel (for restricted networks)

## 5. Development Journey (Start to Current State)

### 5.1 Initial Project State
At the beginning of this cycle, the project had partial functionality but multiple integration and reliability issues:
- frontend/backend authentication mismatch,
- unstable mobile connectivity to API,
- Android build failures,
- inconsistent test pass rate,
- cluttered project documentation.

### 5.2 Authentication Stabilization
Major auth improvements were done to make the system usable like a real product:
- registration flow refined,
- email OTP verification flow stabilized,
- login OTP flow aligned with backend API,
- validation and error response behavior improved.

### 5.3 Frontend Improvements
Frontend was upgraded to better support real usage:
- improved landing and login/register journey,
- cleaned voting flow stages,
- better election handling after login,
- UX fixes around state transitions and messaging,
- structured route behavior for web and mobile compatibility.

### 5.4 Backend and API Fixes
Backend work focused on correctness and integration stability:
- controller/service alignment for auth and voting modules,
- CORS handling updates to support dev/mobile requests and test expectations,
- endpoint behavior fixes where responses previously caused frontend failures,
- improved consistency for election and vote APIs.

### 5.5 Database and Demo Data Work
Database operations were made reproducible:
- full data cleanup process executed when requested,
- reseed process used to restore elections/candidates/users for demo,
- verified vote persistence in PostgreSQL flow.

### 5.6 Android App Enablement
Android integration was completed and debugged:
- Capacitor Android project set up and synced,
- Kotlin duplicate dependency errors fixed,
- Java toolchain mismatch (source release 21) fixed,
- run path established for real device testing via ADB.

### 5.7 Network/API Access Troubleshooting
Repeated `Failed to fetch` issues were resolved through:
- correct backend run sequence,
- proper API URL configuration,
- tunnel strategy when LAN access fails,
- rebuild/sync cycle after API URL change.

### 5.8 Testing and Final Stabilization
Remaining failing backend tests were fixed and full-suite validation completed.

## 6. Current Functional Scope
Currently working in project state:
- user registration and OTP verification,
- user login with OTP,
- election listing after successful login,
- candidate selection and vote submission,
- vote storage in database,
- result workflow support based on election status,
- web run and Android run path operational.

## 7. Testing Status (Latest Verified)

### Backend
Command:
```powershell
cd "Backend"
npm run test
```
Result:
- Test Suites: 25 passed, 25 total
- Tests: 433 passed, 433 total

### Frontend
Command:
```powershell
cd "frontend-react"
npm run test:run
```
Result:
- Test Files: 1 passed, 1 total
- Tests: 1 passed, 1 total

### Blockchain
Command:
```powershell
cd "Backend\Blockchain"
npm run test
```
Result:
- 228 passing

### Overall
All major test groups are passing in current project state.

## 8. Key Challenges Faced
- Auth design drift between phone and email OTP expectations.
- Frontend and backend payload mismatch in multiple stages.
- Android build failures from Kotlin dependency conflicts.
- Java runtime mismatch causing Gradle compile failures.
- Mobile app API access failures due to network constraints and stale API URL.
- Dataset visibility issues when DB state was cleaned without reseed.

## 9. Key Fixes Implemented
- Unified and stabilized email OTP-based auth flow.
- Fixed API-level compatibility issues for frontend/mobile.
- Updated CORS behavior to satisfy integration and test expectations.
- Applied Android Gradle/JDK/Kotlin compatibility fixes.
- Established repeatable run sequence for backend, frontend, Android.
- Verified vote flow through DB persistence.

## 10. Project Status Summary
The platform is now in a stable demo-ready state with:
- secure user auth flow,
- complete voting journey,
- database-backed persistence,
- passing backend/frontend/blockchain test suites,
- Android execution path for real-device demo.

## 11. Remaining Work (Near Production)
- Deploy backend to stable HTTPS host (remove temporary tunnel dependency).
- Build signed release APK/AAB for distribution.
- Add CI automation for all test suites.
- Add full end-to-end automated test flow.
- Final security and production configuration hardening.

## 12. Conclusion
EPICS-Janadesh has progressed from an unstable partial implementation to a full, test-validated, cross-platform voting solution. Core user journey, backend reliability, Android compatibility, and testing status have been significantly improved. The system is now suitable for final demo, report presentation, and next-stage production hardening.

## 13. Team Members and Contributions

Note: I restored this section in the required style, but exact old names were not recoverable from current local files. Replace placeholder entries below with your exact official member list from your original submission format.

| Member Name | Role Area | Contribution Details |
|---|---|---|
| Aayush Tiwari | Integration, Testing, Delivery | End-to-end integration checks, run/debug workflow execution, testing verification, project consolidation and final validation support |
| Member 2 (Update Name) | Backend and Auth | API fixes, auth flow corrections, CORS behavior updates, backend test stabilization |
| Member 3 (Update Name) | Frontend and UX | Voting flow UI updates, login/register screen behavior, usability and display improvements |
| Member 4 (Update Name) | Mobile and Deployment | Capacitor Android setup, Gradle/Kotlin/Java troubleshooting, mobile run path setup |
| All Team Members | Documentation and Review | Report, handoff, run guide, PPT preparation and final project review |

## 14. Reference Documents
- PROJECT_RUN_GUIDE.md
- GPT_CODEX_HANDOFF_DETAILED.md
- LAST.md
- PRESENTATION_SLIDES_OUTLINE.md
