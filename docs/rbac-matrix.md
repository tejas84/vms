# RBAC matrix

Sources: SDD section 2 and module M01. Permission names are an engineering catalog for those responsibilities. They are not a signed matrix (OD-04).

Server enforcement uses `hasPermission`. The system administrator permission `*` covers administration. UI checks use the same permission names and are not sufficient on their own.

| Permission | Visitor | Host | Reception | Security | Approver | Security admin | System admin | Auditor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dashboard.read | yes | yes | yes | yes | yes | yes | yes | yes |
| invitation.complete | yes | | | | | | yes | |
| visits.create | | yes | | | | | yes | |
| visits.read.own | yes | yes | | | | | yes | |
| visits.cancel.own | | yes | | | | | yes | |
| visits.read | | | yes | yes | yes | yes | yes | yes |
| visits.walkin | | | yes | | | | yes | |
| approvals.decide | | | | | yes | | yes | |
| badges.issue | | | yes | | | | yes | |
| gate.validate | | | yes | yes | | | yes | |
| gate.checkin | | | yes | yes | | | yes | |
| gate.checkout | | | yes | yes | | | yes | |
| gate.override | | | | yes | | yes | yes | |
| alerts.read | | | | yes | | yes | yes | |
| alerts.review | | | | | | yes | yes | |
| watchlist.admin | | | | | | yes | yes | |
| audit.read | | | | | | yes | yes | yes |
| reports.read | | | yes | yes | yes | yes | yes | yes |
| retention.run | | | | | | yes | yes | |
| admin.config | | | | | | | yes | |

`admin.config` covers sites, buildings, departments, gates, zones, categories, users, policies, and integration settings.

## Authentication rules

- Passwords are hashed with scrypt. They are never returned.
- Administrators (`system_admin`, `security_admin`) require TOTP.
- Disabled users cannot sign in.
- Expired or revoked tokens are rejected.
- SSO returns 503 until an issuer is configured. It does not pretend to sign the user in.
- There is no built-in user such as admin/admin.

## Privileged actions

Manual override, watchlist changes, retention deletion, and user or policy changes require the permission above and write an audit event.
