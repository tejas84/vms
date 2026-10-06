# Requirement traceability

Source documents: SDD v1.0 and Implementation Guide v1.0.

Status values: Implemented, Partial, Not implemented, Blocked.

| Requirement | Module | UI | API | Backend | Database | Integration | Audit | Test | UAT |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Server-side authentication | M01 | Login | `/api/v1/auth/login` | Token verification | `users` | SSO 503 | auth.success / auth.failure | Partial | Not started |
| RBAC | M01 | Menu filter | `requirePerm` | `hasPermission` | role catalog | — | admin.user | Partial | Not started |
| Admin MFA | M01 | MFA field | login body `mfaCode` | TOTP | `totp_secret` | Authenticator app | auth.mfa_failure | Partial | Not started |
| No default credentials | M01 | — | — | create-admin script | no user seed | — | admin.user | Manual | Not started |
| Sites, zones, gates | M13 | Admin | `/sites`, `/zones`, `/gates` | services in `server.js` | organization tables | — | admin.site / admin.zone | Partial | Not started |
| Policies and retention | M13 | Admin | `/policies`, `/retention/run` | policy reader | `policies` | face delete on retention | data.deletion | Partial | Not started |
| Visitor separate from visit | M06 | Host, visitor | visit create | visit service | `visitors`, `visits` | — | visit.status | Partial | Not started |
| State machine | M05, M06 | Status labels | transitions | `domain.js` | `visit_status_history` | — | visit.status | Unit | Not started |
| Host invitation | M03 | Host | `POST /visits` | validation | `visits` | notification log | visit create | Flow | Not started |
| Visitor consent and documents | M02 | Visitor | invitation complete, documents | consent required | visitor columns | filesystem storage | visitor.consent | Partial | Not started |
| Approval | M05 | Approvals | approve/reject | state checks | `approvals` | notification log | approval | Partial | Not started |
| QR / pass | M11 | Host, visitor, gate | badge issue | pass code | `badges` | printer not connected | badge events | Partial | Not started |
| Face enroll and verify | M07 | Visitor, gate | face client | adapter | `biometric_enrollments` | face-service PoC | face.enroll / verify | Partial | Not started |
| Access decision ALLOW/DENY/HOLD/ADDITIONAL APPROVAL | M08 | Gate | `/gate/validate` | `decideAccess` | `access_decisions` | — | access decision | Unit | Not started |
| Gate only on ALLOW | M08 | Gate | check-in | stored decision | `gate_transactions` | controller not connected | gate entry | Partial | Not started |
| Watchlist HOLD | M09 | Security | watchlist | match before allow | `watchlist`, `alerts` | — | watchlist | Partial | Not started |
| Override audited | M08 | Gate | override | role + reason | decisions | — | override | Partial | Not started |
| Checkout revokes access | M08 | Reception, gate | checkout | transaction | badges revoked | — | exit | Partial | Not started |
| Notifications do not change auth | M10 | — | notify helper | status separate | `notifications` | email stub | — | Partial | Not started |
| Dashboard from database | M12 | Reports | report routes | SQL aggregates | visits | — | — | Partial | Not started |
| Audit search | M14 | Audit | `/audit` | query | `audit_events` | — | — | Partial | Not started |
| Real SSO, SMS, barrier, CCTV, HR, BI | M15 | Admin status | 503 or status row | adapters | `integrations` | Blocked | — | Not run | Blocked |
| Production face model | M07 | — | — | — | — | Blocked OD-06 | — | Not run | Blocked |
| Signed RPO/RTO and load test | NFR | — | — | — | — | — | — | Not run | Blocked |

Traceability is updated when a module changes. UAT evidence does not exist.
