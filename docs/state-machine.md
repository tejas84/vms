# Visit state machine

Source: SDD section 6. Names match the SDD table. See OD-C3 for Rejected and Closed.

| State | Meaning |
| --- | --- |
| Draft | Created, not submitted. |
| Pending Approval | Waiting for one or more approvals. |
| Approved | Workflow has authorized the visit. |
| Expected | Authorized and awaiting arrival. |
| Waiting at Reception | Visitor has arrived and further action is required. |
| Checked-In | Identity checks passed and the visit has started. |
| Inside | Visitor is recorded in the facility. |
| On Hold | Security or approval exception blocks normal progress. |
| Checked-Out | Visitor exited and temporary access is disabled. |
| Expired | Validity ended without an active authorization. |
| Cancelled | Cancelled by an authorized user, including rejection. |

## Allowed transitions

Implemented in `backend/src/domain.js`.

| From | To |
| --- | --- |
| Draft | Pending Approval, Approved, Cancelled |
| Pending Approval | Approved, Cancelled, On Hold |
| Approved | Expected, Cancelled |
| Expected | Waiting at Reception, Checked-In, Expired, Cancelled, On Hold |
| Waiting at Reception | Checked-In, On Hold, Cancelled, Expired |
| Checked-In | Inside, Checked-Out |
| Inside | Checked-Out, On Hold |
| On Hold | Pending Approval, Expected, Cancelled |
| Expired | Expected, Cancelled |
| Checked-Out | none |
| Cancelled | none |

Direct Draft to Approved is used only when the zone does not require extra approval, and the service then continues to Expected. The client cannot set an arbitrary status.

## Rules

- Illegal transitions return 409.
- Approval and rejection store actor, decision, timestamp, and remarks.
- Entry is accepted only from Approved, Expected, or Waiting at Reception.
- A second entry while Checked-In or Inside is denied.
- Expiry blocks normal entry. An authorized extension moves Expired back to Expected.
- Checkout revokes the active pass and updates occupancy.
- Rejection moves the visit to Cancelled. The approval row stores the rejection. There is no separate Rejected state.
- A manual override does not delete the failed decision. It adds another audited decision.

## Approval behavior in this baseline

If the zone requires approval, submit moves Draft to Pending Approval and creates an approval task for the approver role. If it does not, submit moves through Approved to Expected and issues a pass. That zone flag is the only approval rule specified well enough to implement (OD-10).
