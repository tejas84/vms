# Database design

Sources: SDD section 9 and implementation guide sections 4.2, 21, and 23.

The SDD defines logical domains, not a signed physical ERD (OD-02). The schema in `backend/sql/schema.sql` is the physical baseline. Keys are application-generated strings. Timestamps are stored as UTC ISO-8601 strings. That representation is an implementation choice and should be reviewed at ERD sign-off.

## Domains and tables

| Domain | Tables | Notes |
| --- | --- | --- |
| Identity | `users` | Email unique. Password hash only. TOTP secret for administrators. Disabled flag. |
| Identity (Phase 1) | `roles`, `permissions`, `role_permissions`, `revoked_tokens`, `login_attempts` | Catalog and security controls. Not business demo data. |
| Organization | `sites`, `buildings`, `departments`, `gates`, `zones` | Zone carries `approval_required` and `face_required`. |
| Configuration | `policies`, `integrations`, `visitor_categories` | Policy defaults are configuration. Categories start empty (OD-11). Integration rows describe connection status. |
| Visitor | `visitors` | Profile, contact, document reference, consent timestamp and version. Separate from visits. |
| Visit | `visits`, `visit_status_history` | Host, site, zone, purpose, schedule, status. |
| Approval | `approvals` | Step, role, decision, remarks, time. |
| Biometric | `biometric_enrollments` | Template reference only. No raw template. |
| Access | `badges`, `access_decisions`, `gate_transactions`, `idempotency_keys` | Pass validity. Decision outcome and reasons. Entry and exit. Unique idempotency key. |
| Security | `watchlist`, `watchlist_clearances`, `alerts` | |
| Notification | `notifications` | Delivery status, including failed and stub. |
| Audit | `audit_events` | Actor, type, entity, old and new values, correlation ID. |

## Relationship rules from the SDD

- A visitor has many visits.
- A visit links to one host user, one site, one zone, one purpose, and one schedule.
- A visit can have approvals, enrollments (via the visitor), badges, gate transactions, notifications, and audit events.
- A watchlist evaluation can create an alert.

Foreign keys enforce the core links above. `users.visitor_id` is not a foreign key in the current schema because the visitor row may be created after the user. That gap is recorded for ERD sign-off.

## Indexes

Present or required for the SDD lookup paths:

- Visitor email and name.
- Visit status and schedule, visitor id.
- Gate idempotency key.
- Audit time and event type.
- Alert status and time.
- Notification recipient and time.

## Rules

- Migrations are versioned. `schema.sql` remains the full baseline for a new database. Later changes go in `backend/migrations/` and are applied by startup when the migration table exists.
- Duplicate entry and exit are blocked with an idempotency key unique constraint plus status checks.
- Biometric template bytes stay in the face service store, not in MySQL.
- No seed visitors, hosts, visits, or passwords. Policy keys and integration status rows are configuration, not visitor data.
- The first administrator is created with `backend/scripts/create-admin.mjs` and is not inserted by the schema.

## Retention

`retention_days` drives deletion of enrollment metadata older than the policy and a delete call to the face service. The legal period is OD-08. The default of 365 days is configurable and not a legal determination.
