# Implementation status

Last updated: 2026-10-06.

## This increment (Phase 1 foundation)

- Requirements baseline is in `docs/`.
- MySQL migration `001_rbac_and_security` creates roles, permissions, role assignments, revoked tokens, login attempts, visitor categories, and audit IP/user-agent columns. It does not insert visitors or users.
- Sign-in failures are stored and limited to 10 in 15 minutes.
- Logout revokes the token identifier.
- Password reset returns 503 when email is not configured.
- `GET /health` and `GET /ready` exist.
- Buildings, departments, gates, and visitor categories can be created by `admin.config`. Categories start empty.
- The administration form no longer submits a built-in password. An administrator password is entered in the form. A TOTP secret is shown once when the new user requires MFA.
- Unit tests: 14 passed (`npm test`). API flow against a dedicated test database is not part of that run.

## Not production-ready

Critical biometric, device, privacy, and non-functional sign-offs are still open. Do not treat this build as a production release.

## Implemented

- MySQL schema for the SDD domains, with foreign keys and the indexes listed in `database-design.md`.
- Express API under `/api/v1` with correlation IDs and sanitized 500 errors.
- Password hashing, login, administrator TOTP, disabled users, and server-side permissions.
- First administrator created only by `backend/scripts/create-admin.mjs`.
- Visit state machine and access decision engine in `backend/src/domain.js`.
- Visitor and visit as separate records.
- Host create, approval, visitor registration, reception, gate validation, check-in, check-out, watchlist, audit search, policy configuration, and retention deletion of enrollment rows.
- Face HTTP adapter. Unavailable service becomes HOLD.
- Unit tests for the decision engine, token handling, and the face-service contract.

## Partially implemented

- RBAC is stored in `roles`, `permissions`, and `role_permissions`, and the API uses those rows after startup. The matrix is not signed off (OD-04).
- Master data APIs cover sites, buildings, departments, gates, zones, and visitor categories. A new database has no sites until an administrator creates them.
- Notifications are logged. Email delivery is not a real provider.
- Badge printing is the browser.
- Reporting numbers are queried, not hardcoded. Export permission and export audit are incomplete.
- Frontend is a React application with a shared Material UI theme, role-filtered navigation, and live API calls. Empty, loading, and error states are on the data screens.
- Sign-in rate limiting is stored in MySQL but enforced in the API process that handles the request. It is not a shared edge limiter.
- Layering is domain module plus route module, not a full controller/service/repository split.

## Not implemented

- OpenAPI document.
- CI pipeline that blocks production.
- Automated browser end-to-end tests.
- Cookie session and CSRF (not used while tokens are bearer tokens).
- Field-level encryption.
- Immutable audit store.

## Blocked by external integration or a business decision

- Production face model and threshold (OD-06).
- SSO, SMS, WhatsApp, printer appliance, camera appliance, barrier, CCTV, HR, BI (OD-07).
- Legal retention period (OD-08).
- RPO, RTO, SLA, load targets (OD-09).
- Approval matrix beyond the zone flag (OD-10).
- Password reset delivery until an email provider exists.

## Configuration

Copy `.env.example` to `.env`. Set database credentials and `JWT_SECRET`. Load `backend/sql/schema.sql`. Create one administrator with the script. Do not insert sample visitors.

## Known limitations

- The Node face service compares a center crop. It is for contract testing, not for a real gate.
- README text that mentioned shared demo passwords is obsolete and must not be followed.
- `ADDITIONAL_APPROVAL` is returned by the engine. It does not open a gate.
