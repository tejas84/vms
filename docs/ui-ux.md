# UI and UX

Source: SDD section 12.

## Screens

| Screen | Users | Job |
| --- | --- | --- |
| Login | Employees and administrators | Sign in. SSO shows an unavailable state until configured. Administrators enter a TOTP code. |
| Visitor registration | Visitor | Profile, consent, documents, invitation and pass. Mobile-friendly. |
| Host | Host | Create visits, status, history. |
| Approval queue | Approver | Approve, reject, escalate. |
| Reception | Reception | Search, walk-in, ID, face, badge, check-in and check-out. Few clicks, large status. |
| Gate | Security | Pass and face validation, decision, alerts, override. |
| Security alerts | Security administrator | Watchlist and exceptions. |
| Administration | System administrator | Sites, gates, users, policies, retention, integrations. |
| Dashboard and reports | Management, auditor, and other roles with `reports.read` | Occupancy, expected visitors, denials, overstays, history. |
| Audit viewer | Roles with `audit.read` | Search events. |

## Rules

- One Material UI theme is used for every portal.
- Empty lists say that no records were found. They do not show sample visitors.
- Loading and error states are required on data screens.
- Blocked operations show the server reason.
- Privileged actions stay distinct.
- Biometric images and templates are not shown as reusable secrets.
- Client validation is repeated on the server.
- Gate and reception layouts favor speed, contrast, and keyboard use.
- Success messages are shown only after the API confirms the write.

## Accessibility

Labels, focus, semantic controls, and contrast are required. A formal accessibility test pass has not been signed off.
