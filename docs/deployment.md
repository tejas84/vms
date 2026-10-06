# Deployment

Source: SDD section 13. Sizes are planning baselines.

## Topology

```text
Internet or corporate client
        |
      HTTPS 443
        |
      Nginx
        |
        +-- React build (static)
        |
        +-- Node.js API
                |
                +-- MySQL 8
                +-- Face service (private network)
                +-- Device network (only when adapters are configured)
```

## Environments

| Environment | Purpose |
| --- | --- |
| DEV | Active development |
| QA/SIT | Integration, regression, security, devices |
| UAT | Business validation |
| PILOT | One site or gate |
| PROD | Live operation |

## Release path

Feature branch, pull request, review, automated install, lint, unit tests, API tests, migration check, frontend build, then promotion through DEV, QA/SIT, UAT or Pilot, and Production. Production deploy is a manual approval. Untested builds are not auto-deployed.

## Configuration

Environment variables, never committed secrets. See `.env.example`.

Required before any shared use:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET` of at least 16 random characters
- `FACE_SERVICE_URL` only if that service is actually running

## Database

```sql
CREATE DATABASE vms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Load `backend/sql/schema.sql`, then start the API so versioned migrations apply.

Create the first administrator:

```powershell
node backend/scripts/create-admin.mjs --name "Your Name" --email you@company.com --password "AtLeast10Chars1"
```

Store the printed TOTP secret in an authenticator. It is not shown again.

## Nginx

Terminate TLS, proxy `/api/` to the API, serve the frontend build, and forward `X-Forwarded-For` only from trusted proxies. Do not expose MySQL or the face service port on the public interface.

## Health

- `GET /health` — process up, no secrets.
- `GET /ready` — database accepts a query. Not ready when the schema is missing.

## Rollback

Keep the previous release artifact and the previous migration. Do not run a destructive down-migration in production without a tested restore. Application rollback does not undo data migrations that already committed.

## CI checks

1. Install dependencies
2. Lint when configured
3. Unit tests
4. API tests
5. Migration validation
6. Frontend build
7. API start against a test database
8. Production approval gate

A pipeline file is not yet the production approval system. See `implementation-status.md`.
