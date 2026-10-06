# Visitor Management System

Local implementation of the Visitor Management System (VMS) with face recognition, built from the Software Design Document v1.0.

A visitor moves from invitation, through approval, identity checks, entry, time on site, and exit. Face recognition checks identity. It does not, by itself, open the gate. Entry is allowed only when the configured business rules also pass: visit status, time window, pass code, consent, identity document, access zone, site capacity, and watchlist.

This repository is the runnable baseline. The design document treats the technology stack, physical database, device contracts, face model, and threshold as items to confirm during architecture sign-off. Those items are implemented here so the product can be used locally, and they are listed as open decisions inside the Administration screen.

## What you need

- Windows, with PowerShell
- Node.js 20 or newer (`node -v`)
- A browser

You need MySQL 8 running locally, with a database named `vms`. Python is optional.

Python 3.11+ is optional. If Python and the packages in `face-service/requirements.txt` are installed, `npm run dev` starts the Python face service. Otherwise it starts the Node face service, which uses the same API.

## Run it on this computer

Open PowerShell and run:

```powershell
cd "C:\Users\Tejas Dhamdhere\Projects\vms"
npm run install:all
npm run dev
```

`npm run install:all` is only needed the first time, or after dependencies change. Leave the PowerShell window open while you use the app. Stop it with `Ctrl+C`.

Then open:

| Service | Address | What it is |
| --- | --- | --- |
| Web app | http://127.0.0.1:5173 | Screens for every role |
| API | http://127.0.0.1:4000 | Business rules, visits, gate decisions |
| Face service | http://127.0.0.1:8090 | Enrollment and 1:1 verification |

The browser talks only to the web app. The web app calls the API. The API calls the face service on localhost. The browser never receives a face template.

## Sign in

The database does not contain a built-in account. After the tables exist, create the first system administrator:

```powershell
node backend/scripts/create-admin.mjs --name "Your Name" --email you@company.com --password "AtLeast10Chars1"
```

The command prints a one-time MFA secret. Add it to an authenticator app. System administrators and security administrators must enter that 6-digit code at sign-in.

**Sign in with SSO** returns a clear outage. The SSO adapter exists, and no identity provider is configured.

Do not use a shared or permanent password. There is no `admin/admin` account.

## A short tour

A new database has policies and integration status rows only. It does not contain sites, visitors, or visits. Sign in as the system administrator and add a site, a zone, and the users each role needs. Empty screens show that no records were found.

Zones that do not require approval issue a pass when the host submits the visit. Zones that require approval stay at Pending Approval until an approver approves them. Rejection cancels the visit. Checkout revokes the pass.

1. As a host, open **Invitations** and submit a visit.
2. As an approver, open **Approvals** when the zone requires approval.
3. As the visitor, open **My pass**, enter the pass code, record consent, and complete any required document or face enrollment.
4. As security, open **Gate**, enter the pass code, and click **Validate access**. Record entry only when the result is **ALLOW**.
5. Open **Reports** and **Audit** to see stored visits and events.
6. Open **Administration** to change policies, add a zone, or run retention.

## How a visit moves

Only the server changes visit status. The screen cannot set an arbitrary status.

| Status | Meaning |
| --- | --- |
| Draft | Created, not yet submitted |
| Pending Approval | Waiting for the approver |
| Approved | Workflow has authorized the visit |
| Expected | Pass issued, visitor has not arrived |
| Waiting at Reception | Walk-in is at the desk |
| Checked-In | Identity and policy checks passed |
| Inside | Visitor is on site |
| On Hold | Escalated or otherwise blocked |
| Checked-Out | Exit recorded, pass revoked |
| Expired | The visit window ended |
| Cancelled | Host, approver, or another authorized user cancelled it |

A Lobby-style zone, one with approval turned off, goes to **Expected** immediately. A zone with approval required stays at **Pending Approval** until an approver approves it. Approval then issues the QR pass. Rejection cancels the visit. Checkout revokes the pass.

Entry is accepted from **Approved**, **Expected**, or **Waiting at Reception**. A second entry while the visitor is inside is denied. An expired visit can be extended by an approver, reception, or an administrator.

## How the gate decides

**Validate access** does not trust the browser. The API loads the visit and checks, in order:

1. The visit exists and its status allows entry.
2. The current time is inside the visit window, plus the configured tolerance (default 30 minutes).
3. The pass code is active and linked to that visit.
4. The visitor is not an active watchlist match. A match produces **HOLD** and an alert. It does not silently deny.
5. Required consent and document details are present.
6. If the zone and policy require a face: an enrollment exists, the capture is usable, liveness passes, and the face matches the stored template.
7. The site is under its occupancy limit.

Possible results:

| Result | Meaning |
| --- | --- |
| ALLOW | Every configured check passed. The officer can record entry. |
| DENY | A blocking rule failed, such as a face mismatch, missing consent, or an expired visit. |
| HOLD | A person must review it. Watchlist, face-service outage, full site, or an on-hold visit. |
| ADDITIONAL APPROVAL | The visit is still waiting for approval. |

Recording entry is a second API call. It runs only when the stored decision is **ALLOW**. That includes an override. An override requires the security or security-administrator role and a written reason of at least 8 characters. The original failed decision stays in the audit log.

If the face service is down, the decision is **HOLD**. The visit is not silently allowed or denied.

Checkout finds the active visit, records the exit, revokes the pass, and updates occupancy. If the visitor is still inside after the scheduled end, the exit is marked as an overstay.

## Face recognition

The face service is separate from the main API.

- Enrollment stores a template reference. The API saves that reference, a quality score, the consent version, and the policy version. It does not save or return the template itself.
- Verification is 1:1 against that reference.
- Liveness, while enabled, needs two frames of the same person that are not identical. Capture frame A, then frame B after a small natural movement. Uploading the same file twice is rejected.
- The default match threshold is `0.82`.

On this computer the running service is `face-service/server.mjs`. It uses a center-crop proof-of-concept comparison. That is enough to practice enrollment and matching. It is not a production face-recognition model.

`face-service/app.py` is the same contract in Python. Install its requirements, and optionally OpenCV from `face-service/requirements-detection.txt`, if you want Haar face detection. `FACE_DETECTOR=auto` uses Haar when OpenCV is present and the center crop otherwise.

## Where data is stored

Application data is in the MySQL database named `vms` on this computer. Create that database, then load the tables:

```sql
CREATE DATABASE vms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE vms;
SOURCE C:/Users/Tejas Dhamdhere/Projects/vms/backend/sql/schema.sql;
```

Copy `.env.example` to `.env` and set `DB_USER`, `DB_PASSWORD`, and `JWT_SECRET` to match the MySQL account that can use `vms`.

The database starts with policies and integration rows only. It does not contain demo visitors or demo passwords. Create the first administrator after the tables exist:

```powershell
node backend/scripts/create-admin.mjs --name "Your Name" --email you@company.com --password "AtLeast10Chars1"
```

That command prints a one-time MFA secret. Add it to an authenticator app. System administrators and security administrators must enter that 6-digit code at sign-in.

Face templates are not in that file. They are in:

`C:\Users\Tejas Dhamdhere\Projects\vms\face-service\data\templates.json`

Uploaded identity documents, when used, go in `backend\data\documents`. Both `backend\data` and `face-service\data` are local runtime data and are not meant to be committed.

Face templates stay outside MySQL, in `face-service\data\templates.json`. Uploaded identity documents go in `backend\data\documents`.

## Project folders

```text
vms
├── frontend          React screens (login, host, visitor, reception, gate, reports, audit, admin)
├── backend           Express API, visit rules, MySQL access
│   ├── src/domain.js     State machine and access decision
│   ├── src/server.js     HTTP routes
│   ├── src/db.js         Schema and demo seed
│   └── src/security.js   Passwords, session token, demo MFA
├── face-service      Face enroll and verify
│   ├── server.mjs        Node runtime used on this machine
│   └── app.py            Python/FastAPI runtime
├── scripts/dev.mjs   Starts the API, face service, and web app together
└── README.md         This file
```

## Screens and who sees them

The menu is filtered by role. Hiding a menu item is not the security control. Every protected API checks the role on the server.

| Screen | Roles |
| --- | --- |
| Home | Everyone who can sign in |
| Invitations | Host |
| Approvals | Approver |
| My pass | Visitor |
| Reception | Reception |
| Gate | Security officer, and reception for the selected visit |
| Watchlist | Security administrator |
| Reports | Approver, reception, security, security administrator, auditor, system administrator |
| Audit | Security administrator, auditor, system administrator |
| Administration | System administrator |

## Policies an administrator can change

On **Administration**, these policies are stored in the database:

| Policy | Default | Effect |
| --- | --- | --- |
| time_tolerance_minutes | 30 | How early or late a visitor may still enter |
| require_consent | true | Entry needs a recorded consent |
| require_document | true | Entry needs a document number |
| liveness_enabled | true | Two different frames are required |
| face_required | true | Combined with the zone setting. Both must require a face |
| retention_days | 365 | Age at which **Run retention deletion** removes old enrollments |
| consent_version | privacy-notice-1.0 | Version stored with the consent event |

**Run retention deletion** removes enrollments older than that policy and writes a deletion audit event. Demo data is newer than 365 days, so a normal run deletes nothing.

Integration rows for SSO, email, SMS, printer, camera, barrier, CCTV, HR, and BI are visible as stubs. Email and SMS are written to the notification log. A failed notification does not change whether the visitor is allowed in. Badge printing uses the browser print dialog. The barrier command is recorded as `activate-temporary-access` or `disable-temporary-access`. No physical hardware is attached.

## Tests

From the project folder:

```powershell
npm test
```

The tests cover the state machine, the rule that a face match cannot override a failed business check, watchlist hold, face-service outage, administrator MFA, approval, denied check-in, and face enroll/match/mismatch.

## Environment variables

| Variable | Default | Used by |
| --- | --- | --- |
| PORT | 4000 | API |
| FACE_SERVICE_URL | http://127.0.0.1:8090 | API, when it calls the face service |
| JWT_SECRET | a development-only value | API session tokens |
| DB_HOST | 127.0.0.1 | MySQL server |
| DB_PORT | 3306 | MySQL port |
| DB_USER | set in .env | MySQL account |
| DB_PASSWORD | set in .env | MySQL password |
| DB_NAME | vms | Database you created |
| NODE_ENV | unset | production hides the demo MFA helper |
| ALLOW_DEMO_MFA | enabled outside production | shows the admin MFA code |
| MATCH_THRESHOLD | 0.82 | Face service |
| FACE_DETECTOR | auto | Python face service |
| FACE_PORT | 8090 | Node face service |
| FACE_DATA_DIR | face-service/data | Template file location |

## What this baseline does not include

- A MySQL server. The schema follows the design domains and can be moved to MySQL later.
- A production face model, vendor SDK, or tuned threshold.
- A real SSO issuer, SMS gateway, email gateway, badge printer, camera appliance, turnstile, CCTV, HR, or BI connection.
- Final legal retention periods. The retention job is implemented. The number of days still needs privacy sign-off.

Those gaps match the open decisions in the design document. They are listed in the Administration screen under **Decisions still open from the design baseline**.
