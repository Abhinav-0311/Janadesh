# CV and GitHub Checklist

Use this checklist before publishing Janadesh publicly or adding it to a resume.

## Must Do Before GitHub

- Confirm real `.env` files are not committed.
- Replace any real database passwords, SMTP passwords, JWT secrets, API keys, and private keys.
- Keep only `.env.example` files in Git.
- Run `git status --ignored` and verify generated folders such as `node_modules`, `dist`, `build`, `coverage`, Android build outputs, Hardhat artifacts, and IDE folders are ignored.
- Add screenshots or a short demo video to the README.
- Run backend, frontend, and blockchain checks.
- Mention that the project is demo-ready and institution-focused, not production-ready for public elections.

## Suggested Screenshots

- Landing/auth screen
- Email OTP verification
- Election list
- Candidate detail view
- Vote confirmation screen
- Vote success/result state
- Admin election management
- Android app running on emulator or phone

## Strong Resume Bullet

Built Janadesh, a full-stack secure college voting platform using React, TypeScript, Node.js, Express, PostgreSQL, Capacitor, and Solidity. Implemented OTP authentication, election and candidate management, vote submission, audit-friendly persistence, Android packaging, and smart-contract tests for double-vote prevention and election lifecycle rules.

## Short GitHub Description

Secure college voting platform with React, Express, PostgreSQL, Capacitor Android support, and Solidity smart-contract validation.

## Honest Limitations to Mention

- Email OTP is suitable for a prototype but should be replaced with stronger MFA or institution SSO for production.
- A stable HTTPS backend and release-signed Android build are still required for deployment.
- The current blockchain module validates integrity rules but is not a complete privacy-preserving on-chain voting protocol.
- A production voting system needs stronger privacy separation between voter identity and ballot choice.
