# Backup and recovery

Source: SDD section 13. RPO and RTO are not signed (OD-09). The schedule below is an operations proposal until those targets exist.

## What must be recoverable

- MySQL database `vms`
- Face-service template store (`face-service/data`)
- Uploaded documents (`backend/data/documents`)
- Environment configuration, stored outside git
- Nginx and systemd or service unit files

## Proposed schedule

| Item | Proposal until OD-09 is signed |
| --- | --- |
| Database | Daily logical backup with `mysqldump`, plus binary logs if point-in-time recovery is required |
| Files | Daily copy of the template store and document directory |
| Retention of backups | 30 days online, then according to the same privacy review as application retention |
| Restore test | At least once before pilot, and after every recovery-procedure change |

These numbers are not SDD requirements.

## Restore

1. Stop the API and face service so they do not write during restore.
2. Restore MySQL into a database with the same name and character set.
3. Restore template files and documents to the paths in the environment.
4. Start MySQL, then the API, and confirm `GET /ready`.
5. Confirm a known visit and an enrollment reference still resolve. Do not treat a missing template file as a successful face match.
6. Record the restore in the operations log.

## Disaster recovery

A second site, replica, and formal RTO are not designed. Production HA is called out by the SDD as “if required” and remains OD-01 and OD-09.

## Application and configuration recovery

Redeploy the tagged build. Restore `.env` from the secrets store, not from git. Run migrations only forward. If a migration was the failure, restore the database backup taken before that migration.

## What this document does not claim

Backups are not automated in this repository. No restore test evidence exists yet.
