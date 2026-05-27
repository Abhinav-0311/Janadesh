# EPICS-Janadesh Detailed PPT Blueprint (20 Slides + Speaker Notes)

Use this as a ready structure for PPT/Canva + speaking flow.

## Slide 1 - Title

- Project: EPICS-Janadesh
- Subtitle: Secure Digital Voting Platform (Web + Android)
- Team members + guide name + institute

Speaker note:
- 20-30 sec intro on why digital voting matters and what was built.

## Slide 2 - Problem Context

- Manual voting has delays, errors, and low transparency.
- Tracking eligibility, audit trails, and result trust is difficult.
- Existing systems are often not mobile-friendly.

Speaker note:
- Explain practical campus-level pain points and need for modernization.

## Slide 3 - Problem Statement

- Build a secure, auditable, easy-to-use voting platform.
- Allow verified voting with one account, one vote logic.
- Provide visibility while protecting election integrity.

## Slide 4 - Project Objectives

- OTP-backed authentication
- election and candidate management
- secure vote capture and persistence
- web + Android usability
- scalable architecture for production

## Slide 5 - Proposed Solution

- Full-stack platform:
  - React frontend
  - Express API
  - PostgreSQL storage
  - Capacitor Android wrapper
- Supports complete user journey from registration to vote success.

## Slide 6 - Technology Stack

- Frontend: React, Vite, TypeScript
- Backend: Node.js, Express, TypeScript
- DB: PostgreSQL
- Mobile: Capacitor + Android Studio
- Tools: npm, ADB, Cloudflare tunnel (for constrained networks)

## Slide 7 - High-Level Architecture

- UI layer -> API layer -> DB layer
- Auth service + election service + voting service
- Token-based session and OTP verification

Speaker note:
- Mention separation of concerns and maintainability.

## Slide 8 - Authentication Design

- Register with email + profile
- Email verification OTP
- Login OTP
- token-based authenticated session

Security controls:
- OTP expiry and usage constraints
- refresh token + blacklist model

## Slide 9 - Voting Workflow

1. User logs in
2. Selects election
3. Eligibility check
4. Selects candidate
5. Submits vote
6. Vote stored and reflected in result model

## Slide 10 - Database Model Highlights

Core tables:

- users
- elections
- candidates
- votes_cache
- voter_registrations
- voter_eligibility
- otp_tokens
- refresh_tokens
- token_blacklist
- audit_logs

Speaker note:
- Emphasize auditability and lifecycle tracking.

## Slide 11 - Frontend UX Highlights

- Landing + guided journey panel
- auth/register/verify/OTP stages
- election filters (active/upcoming/ended/starred)
- localized labels/content behavior
- results visualization and vote share

## Slide 12 - Android App Enablement

- Existing web app wrapped with Capacitor
- native Android project generated and synced
- one shared codebase for web + mobile UI

## Slide 13 - Challenges Faced

- auth flow drift (email vs phone OTP)
- Kotlin dependency conflict
- Java 21 build mismatch
- mobile API fetch/network reachability issues
- stale docs/context noise

## Slide 14 - Fixes Implemented

- standardized email OTP auth flow
- aligned frontend-backend payloads
- forced compatible Kotlin dependency path
- fixed Gradle Java 21 config
- improved dev CORS and mobile testing route
- seeded reproducible demo data

## Slide 15 - Testing and Validation

- backend build checks
- frontend build + test checks
- Android debug build validation
- seeded demo flow validation:
  - register
  - verify
  - login
  - election view
  - vote submit

## Slide 16 - Demo Plan (Live)

1. Start backend
2. seed demo data
3. open web/Android app
4. login flow
5. cast vote
6. show result state

Backup demo path:
- use tunnel URL if LAN blocked

## Slide 17 - Outcomes

- secure voter flow implemented
- functional election lifecycle UI
- cross-platform capability proven
- documentation and handoff improved for maintainability

## Slide 18 - Current Limitations

- quick tunnel URL changes every restart
- release signing and Play Store path pending
- production deployment not fully finalized yet

## Slide 19 - Future Roadmap

- deploy backend to stable HTTPS domain
- signed APK/AAB release
- CI/CD and automated E2E checks
- richer admin analytics
- optional future phone OTP as a controlled feature

## Slide 20 - Conclusion + Q&A

- EPICS-Janadesh demonstrates practical secure digital voting
- ready for final deployment hardening and institutional pilot
- invite questions

---

## Optional Add-on Slides (if needed)

1. ER diagram screenshot
2. API endpoint map
3. Android build troubleshooting slide
4. sprint timeline / milestone chart
5. individual team contribution breakdown

