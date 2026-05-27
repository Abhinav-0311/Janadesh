# Project 2 Research: EPICS-Janadesh

**Project name:** EPICS-Janadesh  
**Domain:** Secure digital voting for college elections  
**Prepared on:** May 22, 2026  

## 1. Project Meaning and Identity

The word **Janadesh** is commonly understood as the people's mandate or public verdict. This name fits the project because the system is designed to collect, protect, and represent voters' choices in a digital college election environment.

EPICS-Janadesh is not positioned as a national public-election system. Its realistic and defensible scope is a **controlled institutional voting platform** for colleges, clubs, departments, student councils, and campus committees.

## 2. Problem Background

College elections often depend on manual registers, paper ballots, informal counting, or semi-digital forms. These methods can create practical problems:

- voter verification may be slow or inconsistent,
- duplicate voting can be hard to prevent,
- election status and candidate information may not be transparent,
- counting can be delayed,
- audit trails may be weak,
- students may not be able to vote conveniently from different devices.

Janadesh addresses this by providing a structured digital workflow: registration, OTP verification, election browsing, candidate selection, vote casting, result handling, persistent storage, and blockchain-based rule validation.

## 3. Existing Project Summary

From the local project documentation and source files, Janadesh is implemented as a full-stack platform:

- **Frontend:** React, Vite, TypeScript, Material UI
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL
- **Mobile:** Capacitor Android app generated from the web frontend
- **Blockchain module:** Solidity smart contracts tested with Hardhat
- **Testing:** Jest/Supertest for backend, Vitest/Testing Library for frontend, Hardhat tests for contracts

Core implemented features include:

- email OTP-based registration and login,
- election listing and filtering,
- candidate display,
- vote submission,
- admin/creator election lifecycle controls,
- PostgreSQL-backed vote and election storage,
- audit-related database tables,
- blockchain tests for election creation, voter registration, candidate registration, vote casting, double-vote prevention, and result gating.

## 4. Research Context: What Secure E-Voting Requires

Secure e-voting systems are difficult because they must satisfy multiple goals at the same time:

- **Eligibility:** only eligible voters should vote.
- **Uniqueness:** one eligible voter should vote only once.
- **Ballot secrecy:** nobody should be able to link a voter to their choice.
- **Integrity:** votes should not be modified, deleted, or added illegally.
- **Auditability:** the system should support verification after the election.
- **Availability:** the platform should remain usable during the election window.
- **Accessibility:** users should be able to vote clearly and independently.
- **Transparency:** stakeholders should understand the election process and trust the outcome.

The U.S. Election Assistance Commission's VVSG describes voting-system evaluation around functionality, accessibility, and security. It also emphasizes auditability and software independence, where a hidden software error should not be able to silently change election outcomes. For cryptographic systems, the EAC/NIST process discusses approved end-to-end verifiable voting protocols.

For Janadesh, this means the project should not only "store votes"; it should also demonstrate how votes are protected, how duplicate votes are stopped, how administrators are controlled, and how election results can be checked.

## 5. Authentication Research

Janadesh currently uses email OTP for registration and login. This is understandable for a college demo because email is easy to distribute and test. However, security research and guidelines show that email OTP has limitations:

- if a student's email account is compromised, the voting account may also be compromised,
- email delivery may be delayed or blocked,
- email is not a strong possession factor unless the email account itself is strongly protected,
- OTP endpoints need strict rate limiting and lockout controls.

NIST's digital identity guidance treats authentication as proof of possession of secrets and authenticators. NIST's FAQ specifically warns that email should not be used as a single or multi-factor out-of-band authentication channel for high-assurance systems. OWASP also recommends anti-brute-force protections, rate limiting, secure token handling, re-authentication for sensitive operations, and MFA for privileged users.

For Janadesh, the practical conclusion is:

- email OTP is acceptable for a controlled academic prototype,
- admin accounts should use stronger MFA,
- production versions should move toward TOTP, passkeys/WebAuthn, or institution SSO,
- OTP attempts should be rate-limited per account, IP, and election action.

## 6. Blockchain Research

Blockchain is useful in e-voting mainly for **integrity, transparency, and tamper-evident records**. A smart contract can enforce rules such as:

- only authorized creators can create elections,
- candidates must be registered before voting,
- voters cannot vote twice,
- results are available only after the election ends.

However, blockchain does not automatically solve every voting problem. Research on blockchain e-voting repeatedly identifies open challenges:

- preserving voter anonymity,
- preventing coercion and vote selling,
- scaling to large elections,
- protecting private data,
- handling authentication outside the blockchain,
- avoiding public exposure of vote patterns,
- managing gas costs and transaction delays.

This matters for Janadesh because the current blockchain module is best described as a **verification and integrity layer**, not the sole voting authority. The PostgreSQL backend remains the main operational system, while Solidity/Hardhat tests demonstrate election-rule correctness.

## 7. Privacy and Legal Considerations

Janadesh processes personal data such as student identity details, email addresses, OTP records, eligibility status, and voting participation records. In India, the Digital Personal Data Protection Act, 2023 provides the legal framework for processing digital personal data while recognizing individual privacy rights and lawful data processing needs.

For a college deployment, Janadesh should follow these privacy principles:

- collect only the student data needed for election eligibility,
- clearly inform users why their data is being collected,
- separate voter identity from ballot choice wherever possible,
- avoid storing raw OTPs,
- expire and delete OTP tokens,
- restrict admin access to personal data,
- log administrative actions,
- define a retention policy after elections end.

## 8. Comparison With Real Election Systems

Public election systems usually require stronger safeguards than college election systems. For example, India's Election Commission emphasizes EVM/VVPAT transparency, where VVPAT is intended to improve voter confidence and auditability. The EAC's VVSG similarly stresses accessibility, security, auditability, and verifiability.

Janadesh can borrow these ideas at a college scale:

- provide a clear confirmation screen before vote submission,
- give a non-transferable vote receipt or status confirmation without revealing vote choice,
- maintain audit logs for election setup and administrative actions,
- allow independent result verification by authorized election officers,
- publish anonymized final tallies after election closure.

## 9. Strengths of Janadesh

- Complete end-to-end user flow from login to vote submission.
- Web and Android delivery improve accessibility.
- PostgreSQL provides durable storage and queryable records.
- Backend API structure separates authentication, elections, voting, analytics, and monitoring.
- Blockchain tests strengthen confidence in election lifecycle rules.
- Existing test coverage is strong for a student project.
- Documentation already includes run guides, final reports, and PPT outline material.

## 10. Current Limitations

- Email OTP is convenient but not high-assurance authentication.
- Mobile connectivity depends on correct backend URL, LAN, or tunnel setup.
- Production HTTPS deployment is not finalized.
- Release-grade Android signing is pending.
- Full automated end-to-end testing is still pending.
- Blockchain integration should be clearly explained as a validation layer unless every production vote is committed through a privacy-preserving on-chain design.
- The system needs a stronger privacy model for separating voter identity from ballot choice.

## 11. Recommended Improvements

Short-term improvements:

- stabilize backend tests and remove flaky memory/open-handle issues,
- add E2E tests for register, verify, login, vote, and result flow,
- add stricter OTP attempt limits,
- add admin MFA,
- add better election audit-log views,
- deploy backend on stable HTTPS.

Medium-term improvements:

- integrate institution SSO or verified student database import,
- improve privacy separation between voter identity and ballot,
- add role-based admin permissions,
- add exportable election audit reports,
- add signed Android APK/AAB pipeline,
- add CI for backend, frontend, blockchain, and Android smoke builds.

Advanced improvements:

- explore end-to-end verifiable voting protocols,
- use cryptographic commitments or hashes for vote integrity checks,
- build a public bulletin board for anonymized election proofs,
- design coercion-resistant receipt behavior,
- introduce independent election-officer review workflows.

## 12. Suggested Research Statement for Report

EPICS-Janadesh is a secure digital voting platform designed for controlled college elections. It combines OTP-based user verification, structured election management, PostgreSQL-backed vote persistence, a React web interface, Android delivery through Capacitor, and Solidity smart-contract tests for rule integrity. Research into e-voting shows that trustworthy systems must balance eligibility, uniqueness, ballot secrecy, auditability, accessibility, and availability. Janadesh addresses these requirements at a prototype and institutional scale, while future production use should strengthen authentication, privacy separation, end-to-end verification, deployment security, and audit workflows.

## 13. Suggested Viva Answer

Janadesh means the people's mandate. Our project uses that idea to build a secure college voting platform where students can verify themselves, view elections, select candidates, and cast votes digitally. The system uses React for the user interface, Node/Express for backend APIs, PostgreSQL for persistent storage, Capacitor for Android support, and Solidity smart contracts to validate election rules such as double-vote prevention and result visibility. The main research challenge in e-voting is not only collecting votes but preserving trust, privacy, auditability, and fairness. Janadesh solves these at a college-election scale and gives a foundation for stronger production features like MFA, HTTPS deployment, CI, privacy-preserving vote records, and end-to-end verifiable election proofs.

## 14. Sources

- U.S. Election Assistance Commission, Voluntary Voting System Guidelines: https://www.eac.gov/voting-equipment/voluntary-voting-system-guidelines
- U.S. Election Assistance Commission, E2E Protocol Evaluation Process: https://www.eac.gov/voting-equipment/end-end-e2e-protocol-evaluation-process
- NIST SP 800-63B Digital Identity Guidelines: https://pages.nist.gov/800-63-4/sp800-63b.html
- NIST SP 800-63 FAQ on email authentication: https://pages.nist.gov/800-63-FAQ/
- OWASP API Security, Broken Authentication: https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/
- OWASP MFA Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
- India Code, Digital Personal Data Protection Act, 2023: https://www.indiacode.nic.in/handle/123456789/22037
- Election Commission of India, EVM/VVPAT information: https://www.eci.gov.in/evm/
- MDPI Symmetry, systematic review of blockchain e-voting challenges and opportunities: https://www.mdpi.com/2073-8994/12/8/1328
- MDPI Sensors, systematic review on scalable blockchain-based e-voting: https://www.mdpi.com/1424-8220/22/19/7585
