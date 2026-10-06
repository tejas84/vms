# Integration design

Source: SDD module M15 and section 3. Each external system has an adapter. Core visit logic does not call a vendor SDK directly.

| Integration | Contract status | Production behavior now |
| --- | --- | --- |
| Face recognition | HTTP enroll, verify, delete template | Local proof-of-concept service. Outage returns unavailable to the decision engine, which yields HOLD. |
| Liveness | Part of the face contract | Two different frames when policy `liveness_enabled` is true. Not a certified liveness product. |
| SSO | OIDC or SAML not configured | `POST /api/v1/auth/sso` returns 503. |
| Email | No SMTP provider | Messages are stored in `notifications` with a stub or failed status. Password reset returns 503. |
| SMS | Not configured | Not sent. |
| WhatsApp | Not in the SDD module list as a named provider; the project instruction lists it | Not configured. No fake delivery. |
| Printer | Not configured | Browser print only. The API does not claim a badge printer succeeded. |
| Camera / kiosk | Browser capture | No appliance is attached. |
| Access controller / barrier | Adapter not connected | Commands are not reported as a successful physical open. |
| CCTV, HR, BI | Not connected | Integration row status is not connected. |

## Rules

- Mocks may exist only for automated tests.
- A failed notification does not change ALLOW or DENY.
- The face service must not open a gate.
- Template bytes stay in the face service data directory. The API stores `template_ref`.

## Face HTTP boundary

- `POST /face/enroll`
- `POST /face/verify`
- `DELETE /face/templates/:ref`
- `GET /health`

The API treats `available: false` as service unavailable. It does not convert that into a match.
