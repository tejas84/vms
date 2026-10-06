# API design

Sources: SDD section 10 and implementation guide sections 4.3 and 21.

Base path: `/api/v1`.

## Rules

- Protected routes require a bearer token.
- Authorization is checked on the server.
- Errors use `{ error: { code, message, correlationId } }`.
- 500 responses do not include stack traces.
- Correlation ID is accepted and returned as `x-correlation-id`.
- Entry and exit accept an idempotency key.
- Biometric template bytes are not in responses.
- Notification failure does not change visit status.

## Groups

| Group | Routes in this baseline |
| --- | --- |
| Health | `GET /health`, `GET /ready`, `GET /api/v1/health` |
| Auth | `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`, `POST /api/v1/auth/sso`, `POST /api/v1/auth/password-reset` |
| Users | `GET/POST /api/v1/users`, `PATCH /api/v1/users/:id` |
| Organization | `GET/POST /api/v1/sites`, `POST /api/v1/buildings`, `POST /api/v1/departments`, `POST /api/v1/gates`, `POST /api/v1/zones`, visitor categories |
| Visitors and visits | `POST /api/v1/visits`, visit reads, cancel, invitation complete |
| Approvals | approve, reject, escalate where implemented |
| Face | enrollment and verification are called by the API, not by the browser, at `FACE_SERVICE_URL` |
| Gate | `POST /api/v1/gate/validate`, check-in, check-out, override |
| Watchlist | watchlist and alerts |
| Reports | dashboard and report queries |
| Admin | policies, integrations, retention |
| Audit | `GET /api/v1/audit` |

OpenAPI is not published yet (OD-03). The list above is the implemented surface, not a claim that every SDD operation is complete.

## Access validation sequence

`POST /api/v1/gate/validate` authenticates the user, loads the visit, checks status, time window, and pass, calls the face service when required, evaluates watchlist, zone, documents, consent, and capacity, stores the decision and an audit event, and returns the decision, reason codes, and correlation ID. A later check-in is accepted only when the stored decision is ALLOW, including an audited override that itself becomes ALLOW.

## Status codes

| Code | Use |
| --- | --- |
| 200 / 201 | Confirmed success |
| 400 | Validation |
| 401 | Authentication failure, expired token, disabled user |
| 403 | Authenticated but not permitted |
| 404 | Missing record |
| 409 | Illegal state transition or duplicate |
| 422 | Face enrollment or verification rejected by the face service |
| 429 | Too many sign-in attempts |
| 503 | Dependency not configured or unavailable (SSO, email reset, face service where the route is the dependency itself) |

## Password reset

If no email provider is configured, the API returns 503 and does not claim that a message was sent. It does not create a reset token that the user cannot receive.
