# Testing strategy

Source: SDD section 14 and the implementation guide definition of done.

## Layers

| Layer | What it covers | Current state |
| --- | --- | --- |
| Unit | State machine, access decision, password and token helpers | `backend/tests/domain.test.js` and security tests |
| API | Auth, RBAC, visits, gate | `backend/tests/flow.test.js` when MySQL is configured |
| Database | Migrations and constraints | Schema load script. Dedicated constraint tests are incomplete. |
| Security | Invalid login, expired token, forbidden role, disabled user | Partial in flow tests |
| Negative | Expired pass, cancelled visit, face mismatch, face service down, watchlist, duplicate entry, bad transition | Partial in domain and flow tests |
| End-to-end browser | Full portals | Not automated |
| Device, performance, biometric accuracy, failover, UAT | SDD exit criteria | Not run. Blocked by real devices, a production face model, and signed targets (OD-06, OD-07, OD-09) |

## Required negative cases

Invalid login, expired session, unauthorized API, wrong role, expired QR, invalid QR, cancelled visit, expired visit, visitor not found, face mismatch, liveness failure, face service unavailable, watchlist match, gate controller unavailable, duplicate check-in, duplicate check-out, invalid transition, unauthorized override, invalid document, missing field, duplicate visitor where a rule exists, database failure, external integration failure.

The system must fail closed: no success response after a swallowed error.

## How to run

```powershell
npm test
```

API tests need the MySQL database from `.env`. They must not insert a permanent demo population into a shared production database. Test databases should be separate from production.
