# Security Policy

Janadesh is an academic and portfolio project for controlled institutional voting. Please do not use it for public or high-stakes elections without a formal security review, privacy review, and production hardening.

## Supported Use

The current project is intended for:

- college election demonstrations,
- student council or club election prototypes,
- portfolio review,
- academic viva and presentation use.

It is not yet designed for national, state, municipal, or legally binding public elections.

## Do Not Commit

Never commit:

- `.env` files,
- database passwords,
- SMTP credentials,
- JWT secrets,
- private keys,
- wallet seed phrases,
- API keys,
- production logs containing user data.

Use `.env.example` files for documented configuration.

## Known Security Limitations

- Email OTP is convenient for demos but should be replaced or strengthened for production.
- OTP values should be hashed before storage in a production deployment.
- Voter identity and ballot choice need stronger privacy separation before real elections.
- The blockchain module validates election rules, but it is not a complete end-to-end verifiable or coercion-resistant voting protocol.
- A production deployment requires HTTPS, secret rotation, monitoring, backups, and stricter administrator access controls.

## Reporting Issues

If you find a security issue in this project, open a private report if the repository host supports it. If not, contact the maintainer directly before creating a public issue.
