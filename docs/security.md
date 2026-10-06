# Security

Source: SDD section 11.

## Controls in the baseline

- scrypt password hashes.
- Password strength check on create and on the admin bootstrap script.
- Bearer tokens signed with HMAC-SHA256. `JWT_SECRET` is required and must be at least 16 characters.
- Token expiry. Logout records the token identifier as revoked.
- TOTP for system administrators and security administrators. The secret is shown once at creation.
- Failed sign-in counting and 429 after the configured threshold.
- Disabled-user rejection.
- Server-side permission checks.
- Parameterized SQL.
- JSON body size limit.
- Correlation IDs.
- 500 responses hide internal errors.
- Document upload size limit.
- Audit of authentication, administration, visits, face enrollment, decisions, overrides, watchlist, and retention deletion.
- Secrets in `.env`, which is gitignored.

## Controls still incomplete

- Security response headers are added in Phase 1. A full header review against the deployment TLS terminator is still required.
- CSRF is less relevant for bearer tokens stored by the SPA. Cookie sessions are not used. If cookies are introduced, CSRF protection becomes mandatory.
- Rate limiting is process-local until a shared store exists. It does not survive multiple API instances.
- Account lockout is not a durable account flag beyond the attempt window.
- File upload checks size. MIME allow-listing is incomplete.
- Audit rows can be changed by anyone with direct database access. Application immutability and a separate audit store are not implemented.
- Encryption at rest depends on MySQL and disk configuration. The application does not add field-level encryption. That is an open infrastructure control.
- The local face matcher is not a production biometric control (OD-06).
- MFA recovery codes are not specified and are not implemented.
- Password reset cannot run until email is configured.

## Data that must not leave the server

Passwords, password hashes, TOTP secrets, JWT signing secrets, database passwords, raw templates, and stack traces.
