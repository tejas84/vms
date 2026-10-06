# Access control flow

Sources: SDD section 8 and implementation guide section 16.

The backend is the authority. A face match does not open a gate.

## Checks, in order

| Check | Required condition | Failure in this baseline |
| --- | --- | --- |
| Visit exists | A visit is loaded from the pass or identifier | DENY |
| Status | Approved, Expected, or Waiting at Reception | DENY, HOLD if On Hold, ADDITIONAL APPROVAL if Pending Approval |
| Time window | Now is inside the schedule plus configured tolerance | DENY |
| Pass | Active pass linked to that visit | DENY |
| Watchlist | No active match, unless an authorized clearance exists | HOLD and an alert |
| Consent | Present when policy requires it | DENY |
| Document | Present when policy requires it | DENY |
| Face | When zone and policy require it: enrollment exists, capture is usable, liveness passes if enabled, 1:1 match | DENY, or HOLD if the face service is unavailable |
| Capacity | Occupancy is under the site limit | HOLD |

The first blocking severity wins in this order: any DENY, else any HOLD, else ADDITIONAL APPROVAL, else ALLOW.

## Outcomes

| Outcome | Physical access |
| --- | --- |
| ALLOW | The access-controller adapter may be called. |
| DENY | Must not activate the controller. |
| HOLD | Must not activate the controller. A person reviews it. |
| ADDITIONAL APPROVAL | Must not activate the controller. |

## Physical sequence

1. Persist the decision and audit event.
2. If the outcome is ALLOW, call the access-controller adapter.
3. If the adapter is not configured, report that the controller is unavailable. Do not report that the gate opened.
4. Record entry only after a stored ALLOW, then update occupancy and notify the host when a recipient exists.
5. On exit, record the exit, revoke the pass, update occupancy, and move the visit to Checked-Out.

## Override

Security officer or security administrator, with a written reason. The original failed decision remains. The override is a new audited decision. The current baseline requires a reason of at least 8 characters. That length is an engineering default, not an SDD number.

## Degraded mode

Camera, network, or face-service failure does not become a silent allow. Face-service unavailability is HOLD. Manual completion still requires an authorized actor, a reason, and an audit event.
