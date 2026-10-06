# Architecture

Sources: SDD sections 3 and 13, implementation guide sections 1, 21, and 26.

## Principle

One VMS platform. Visitor, host, reception, gate, security, and administration screens are interfaces. They call one backend. The backend owns authentication, authorization, business rules, workflow, database transactions, access decisions, and audit. Face, devices, and external systems connect through adapters.

The frontend may request an operation. It must not make the final access decision, write MySQL, or command a barrier directly.

## Layers

| Layer | Responsibility | This repository |
| --- | --- | --- |
| Presentation | React + Vite screens | `frontend/` |
| API | Express REST under `/api/v1` | `backend/src/server.js` |
| Domain | State machine and access decision | `backend/src/domain.js` |
| Data | MySQL, parameterized queries, transactions | `backend/src/db.js`, `backend/sql/schema.sql` |
| Biometric | Separate HTTP service | `face-service/` |
| Integration | SSO, notifications, printer, camera, barrier, CCTV, HR, BI | Adapter boundaries; most are not connected |
| Observability | Correlation ID, health, audit | Partial |

The current API is still a single route module. Phase 1 keeps that module working and adds security and master-data controls. Splitting into controllers, services, and repositories is the target structure and is tracked in `implementation-status.md`. A second parallel API will not be added.

## Logical flow

Host creates a visit, the API validates it, approval runs when required, an authorized visit can receive a pass, the visitor completes registration, arrival runs lookup and verification, the access decision engine returns a decision, only ALLOW may call the access-controller adapter, entry and exit update occupancy, and audit and reports read the stored events.

## Boundaries

- Normal APIs do not return raw biometric templates. MySQL stores a template reference, quality, liveness result, consent reference, and policy version.
- External failure does not silently change authorization. Face-service outage is HOLD. Notification failure is recorded and does not change the visit decision.
- Gate hardware is behind an adapter. If the controller is not configured, the API must not report that a physical gate opened.
- Mocks of external devices are not the production path. The integration rows state that the provider is not connected.

## Environments

DEV, QA/SIT, UAT, Pilot, and Production, as named in the SDD. This workstation is a development environment. Production sizing in the SDD (application 8 vCPU / 16 GB, database 8 vCPU / 16–32 GB, face service 4–8 vCPU / 8–16 GB, object storage 500 GB+) is a planning baseline and must be validated by load testing (OD-09).

## Deployment shape

```text
Client -- HTTPS --> Nginx --> React static files
                         \--> Node.js API --> MySQL
                                        \--> Face service
                                        \--> Access controller adapter (when configured)
                                        \--> Notification adapter (when configured)
```

Details are in `deployment.md`.
