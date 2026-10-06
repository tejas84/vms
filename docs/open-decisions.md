# Open decisions

Unresolved items from SDD section 18 and conflicts between the SDD, the implementation guide, and this repository. An assumption used in code is stated here. Important business rules are not filled in silently.

## Conflicts and resolutions

### OD-C1. Technology stack

- SDD: Node.js/Express, React/Vite, a separate Python/FastAPI face service or approved vendor, and MySQL plus object storage are a **proposed** baseline until architecture sign-off.
- Implementation guide and the project instruction: use that stack.
- Decision used in this repository: Node.js/Express, React/Vite, MySQL, and a separate face-service HTTP boundary. The Python service remains an alternate runtime of the same contract. This is an engineering decision, not a business-rule invention. It still needs architecture sign-off (SDD M1).

### OD-C2. Module dependency order

- SDD module table contains circular dependencies (for example M02 depends on M05/M06/M07, and M06 depends on M02).
- Implementation guide: authentication and RBAC, then master data, then visitor and visit, then host and visitor portals, then workflow, notifications and badge, then reception and face, then watchlist and gate, then reporting, then integrations.
- Decision: follow the implementation guide sequence. The SDD dependency column is treated as “these modules interact”, not as a build order.

### OD-C3. Rejection and closed states

- SDD state table: Draft, Pending Approval, Approved, Expected, Waiting at Reception, Checked-In, Inside, On Hold, Checked-Out, Expired, Cancelled. Rejected and Closed are not listed.
- Implementation guide: the baseline flow includes APPROVED/REJECTED and CHECKED_OUT/CLOSED.
- Decision: use the SDD state names. Rejection is a workflow decision that transitions the visit to Cancelled and stores the approver, time, and remarks on the approval record. Checked-Out is the closed state. Do not add Rejected or Closed as extra states unless design sign-off adds them.

### OD-C4. Access decision outcomes

- SDD section 8.1: ALLOW, DENY, HOLD, and ADDITIONAL APPROVAL.
- Implementation guide golden flow: ALLOW, DENY, HOLD.
- Decision: the engine returns all four SDD outcomes. ADDITIONAL APPROVAL is not ALLOW and must not activate a gate.

## Decisions still required

| ID | Decision | Why the SDD requires it | Current repository position |
| --- | --- | --- | --- |
| OD-01 | Architecture and security zones | Network boundaries and production topology | Documented in `deployment.md`. Not signed off. |
| OD-02 | Physical ERD cardinality | Stable schema | Logical schema exists in MySQL. Cardinality sign-off is still required. |
| OD-03 | API payload contracts | Parallel frontend and integration work | Endpoints exist. OpenAPI is not complete. |
| OD-04 | RBAC matrix sign-off | Avoid authorization ambiguity | Baseline matrix is in `rbac-matrix.md` and in code. Not signed off. |
| OD-05 | Visit state machine sign-off | Consistent lifecycle | Implemented from the SDD table. See OD-C3. |
| OD-06 | Face-service contract, model, and threshold | Camera, lighting, and accuracy | HTTP contract exists. The local matcher is a proof of concept, not a production model. Default threshold `0.82` is a local engineering default, not an SDD value. |
| OD-07 | Real device and API availability | Integration schedule | Adapters report not configured or stub. They must not report success for hardware that did not run. |
| OD-08 | Privacy and retention | Biometric storage and deletion | `retention_days` defaults to 365 as a configurable policy. Legal sign-off is required before treating that number as lawful. |
| OD-09 | SLA, RPO, RTO, load targets | Performance acceptance | Not specified. Backup frequency in `backup-recovery.md` is an operations proposal, not an SDD commitment. |
| OD-10 | Approval matrix contents | Who must approve which zone | Zone flag `approval_required` is the only rule the documents support without inventing a matrix. Multi-step approver assignment is not specified. |
| OD-11 | Visitor category catalog | Administration includes categories | No category names are specified. The table starts empty. |
| OD-12 | Password policy and lockout numbers | Authentication strength | SDD requires stronger admin authentication and failed-login handling. Minimum length 10 with a letter and a number, 10 failures in 15 minutes, and 12-hour tokens are engineering defaults, not SDD numbers. |
| OD-13 | Session revocation | Logout | Tokens carry an identifier and can be revoked on logout. A full server-side session store is not specified. |
| OD-14 | Alternate verification after biometric failure | SDD exception matrix | Manual override exists for privileged roles with a reason. The exact retry limit before manual verification is not specified. |
| OD-15 | Watchlist match policy | HOLD or DENY | SDD failure response is “security alert/review”, which maps to HOLD, not silent DENY. A blocking deny rule is not specified. |
| OD-16 | Duplicate visitor rule | Guide lists duplicate visitor where prohibited | The SDD says prevent duplicate active transactions according to configured policy. The exact identity key (email, document, name) is not specified. |
| OD-17 | Recurring visit rules | Host module includes recurring visits | A recurrence group field exists. Frequency, end date, and exception rules are not specified. |
| OD-18 | OTP | Notifications include OTP where configured | No OTP business rule (when, length, expiry) is specified. OTP is not implemented as a success path. |
| OD-19 | Object storage | SDD data layer includes object storage | Documents are stored on the API server filesystem. S3-compatible storage is not configured. |
| OD-20 | Time tolerance default | Entry window | Default 30 minutes is a configurable policy. The SDD says “configured validity/tolerance” and does not fix 30. |

## Assumptions that are in force until sign-off

1. Stack in OD-C1.
2. Build order in OD-C2.
3. State names in OD-C3.
4. Four decision outcomes in OD-C4.
5. Watchlist match produces HOLD and an alert (OD-15).
6. A zone with approval required stays at Pending Approval until an approver with `approvals.decide` approves it. A zone without that flag can move to Expected when the host submits it.
7. No permanent default user is created by schema or startup.
