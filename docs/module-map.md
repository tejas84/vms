# Module map

Sources: SDD section 4 (M01–M15) and implementation guide sections 5–20.

Build order follows the implementation guide, not the circular SDD dependency column. See OD-C2.

| ID | Module | Build phase | Depends on for a working flow | Status |
| --- | --- | --- | --- | --- |
| M01 | Authentication and RBAC | 1 | None | Partial. Login, administrator TOTP, logout revocation, failed-attempt limit, and database-backed permissions. Password reset waits on email. |
| M13 | Administration and master data | 1 | M01 | Partial. Sites, buildings, departments, gates, zones, users, policies, integration status, retention job. Visitor categories start empty. |
| M06 | Visitor and visit management | 2 | M01, M13 | Partial. Separate visitor and visit records and status history exist. |
| M03 | Host portal | 3 | M06 | Partial. Create, view, cancel. Recurring rules are unspecified (OD-17). |
| M02 | Visitor portal | 3 | M06, pass | Partial. Invitation completion, consent, document, enrollment. |
| M05 | Approval and workflow | 4 | M06 | Partial. Single-step approval by role. Full matrix is OD-10. |
| M10 | Notifications | 4 | M06 | Partial. In-app log and email stub. Provider failure does not change authorization. SMS and WhatsApp are not connected. |
| M11 | Badge and pass | 4 | M06 | Partial. Pass code, validity, revocation on exit. Printer is the browser print path. |
| M04 | Reception | 5 | M06, M11, M07 | Partial. Search, walk-in, check-in and check-out. |
| M07 | Face recognition | 5 | Adapter | Boundary exists. Local service is a proof of concept (OD-06). |
| M09 | Watchlist | 6 | M06 | Partial. Entries, match, alert, review. Match yields HOLD (OD-15). |
| M08 | Gate and access | 6 | M07, M09, decision engine | Partial. Validate, entry, exit, override. Physical controller is not attached. |
| M14 | Audit and compliance | 7, and cross-cutting | Services write events | Partial. Search exists. Tamper protection beyond database privileges is not implemented. |
| M12 | Dashboard and reporting | 7 | Operational data | Partial. Counts come from SQL. Export audit is incomplete. |
| M15 | Integration layer | 8 | Contracts | Not connected, except the face HTTP client and notification log. |

## Portal to API

Every portal uses the same API. There is no portal-specific database.

| Portal | Primary modules |
| --- | --- |
| Visitor | M02, M11 |
| Host | M03, M06, M05 |
| Reception | M04, M06, M07, M11 |
| Gate | M08, M07, M09 |
| Security | M09, M14 |
| Administration | M13, M01 |
| Management dashboard | M12 |
| Audit | M14 |

## Definition of done

A module is complete only when the applicable items in the SDD section 14.2 and the project instruction are true: UI, API, server validation, server authorization, persistence, migration, business rules, audit, error paths, tests, and documentation. UI presence alone is not completion.
