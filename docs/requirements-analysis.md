# Requirements analysis

Sources:

- Software Design Document (SDD), Visitor Management System with Face Recognition, Version 1.0.
- Actual Implementation and End-to-End Development Guide, Version 1.0, 05 October 2026.

The SDD is the design baseline. The implementation guide is the module-by-module build order and the rule that every portal calls one backend. Where the two documents disagree, the conflict is recorded in `open-decisions.md` and is not silently resolved in code.

## Purpose

The system manages a visitor from invitation or walk-in through approval, identity checks, entry, time on site, and exit. Face recognition verifies identity. It does not, by itself, authorize physical access.

## Design principles (SDD section 1)

| Principle | Required behavior |
| --- | --- |
| Security by design | Entry must satisfy configured business validations. Face recognition is not the sole high-risk authorization mechanism. |
| Privacy by design | Protect biometric information, restrict access, and apply policy-driven retention and deletion. |
| Auditability | Approvals, verification, entry and exit, overrides, watchlist actions, and deletion events are traceable. |
| Role separation | Distinct permissions for visitor, host, reception, security, approver, security administrator, system administrator, and management/auditor. |
| Resilience | Camera, network, and recognition failures use a controlled degraded or manual path. |
| Scalability | Multiple sites, gates, concurrent users, and growing visitor volume. |

## Functional scope

The SDD baseline scope, preserved by the implementation guide, is:

1. Authentication and RBAC (M01)
2. Visitor portal (M02)
3. Host / employee portal (M03)
4. Reception console (M04)
5. Approval and workflow (M05)
6. Visitor and visit management (M06)
7. Face recognition (M07)
8. Gate and access control (M08)
9. Watchlist / blacklist (M09)
10. Notifications (M10)
11. Badge / QR / pass (M11)
12. Dashboard and reporting (M12)
13. Administration (M13)
14. Audit and compliance (M14)
15. External and device integration (M15)

Visitor and Visit are different entities. One visitor can have many visits.

## Actors

| Role | Responsibilities from the SDD |
| --- | --- |
| Visitor | Registration, consent, identity and document information, invitation confirmation. |
| Host / Employee | Create invitations, specify purpose and access requirements, view status and history. Recurring visits are in the host module scope. |
| Reception | Walk-in registration, ID validation, face capture, badge handling, check-in and check-out. |
| Security / Gate Officer | Gate verification, alerts, manual checks, entry and exit, authorized override. |
| Approver | Approve or reject visits according to the configured workflow. Escalation is in the workflow module. |
| Security Administrator | Watchlist and blacklist administration and security review. |
| System Administrator | Sites, gates, users, roles, categories, policies, retention, and integrations. |
| Management / Auditor | Authorized dashboards, reports, and audit trail access. |

Authorization is enforced on the server. A hidden menu is not a security control.

## End-to-end lifecycle

Host authenticates and creates a visit. The backend validates site, zone, schedule, and permissions. The approval workflow runs when the zone or policy requires it. An authorized visit can produce a QR or pass. The visitor completes registration, consent, documents, and face enrollment where configured. On arrival, reception or the gate looks up the visit. Identity, QR, and face checks run where configured. The backend evaluates policy, time window, watchlist, zone, documents, and capacity. The decision is ALLOW, DENY, HOLD, or ADDITIONAL APPROVAL. Only ALLOW may activate physical access. Entry is stored, occupancy changes, and the host can be notified. Exit disables temporary access and closes the visit. Audit and reports expose the lifecycle.

Walk-ins use the same security validations before check-in. They must not bypass those rules.

## Non-functional requirements

Taken from the SDD. Numeric infrastructure sizes are planning baselines, not signed capacity commitments.

- TLS in transit. Encryption at rest for sensitive data.
- Least privilege and administrator MFA.
- Secrets outside source control.
- Versioned database migrations and foreign keys.
- Correlation IDs across the API, face service, and device adapters.
- Idempotency for retryable entry and exit.
- Notification failure must not change visit authorization.
- Raw biometric templates are not returned by normal APIs or written to ordinary logs.
- DEV, QA/SIT, UAT, Pilot, and Production environments.
- Test layers: unit, API/integration, system, device, security, performance, biometric, failover, and UAT.
- Backup, restore, and rollback before production go-live.

## Explicitly not fixed by the source documents

These are open until sign-off. They are listed in `open-decisions.md` and must not be treated as invented business rules:

- Final physical ERD keys and cardinalities.
- Final API payload schemas.
- Face model, vendor, and production threshold.
- Lawful basis, notice text, and legal retention period.
- SLA, RPO, RTO, and load targets.
- Real SSO, SMS, email, printer, camera appliance, barrier, CCTV, HR, and BI contracts.
- Approval matrix contents (who approves which zone) beyond “configured matrix”.
- Named visitor categories.
- Whether rejection is its own visit state or results in Cancelled. See `state-machine.md`.

## Acceptance criteria (SDD section 16)

- Approved visitors can be registered, verified, and checked in and out end to end.
- Face verification cannot authorize entry unless configured business validations also pass.
- Failed biometric checks have a controlled alternate verification workflow.
- Manual overrides are role-restricted and fully audited.
- Temporary access is activated only for approved visit windows and disabled on exit or expiry.
- Real-time visitor status and occupancy are available to authorized users.
- Critical events are searchable.
- Retention and deletion follow configured policy.
- Gate operation has a tested fallback for network and device outages.

The current codebase is an implementation baseline. It is not production-ready. See `implementation-status.md`.
