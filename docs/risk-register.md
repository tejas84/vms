# Risk register

Source: SDD section 17.2, plus repository risks found while comparing the code with the documents.

| ID | Risk | Level | Mitigation |
| --- | --- | --- | --- |
| R1 | Face accuracy in real lighting | High | Separate service, quality and liveness checks, configurable threshold, alternate verification, pilot. Local matcher is not the production model. |
| R2 | Device and API incompatibility | High | Adapters. Do not claim hardware success. Confirm devices before integration weeks. |
| R3 | Biometric privacy and legal basis | High | Consent version stored. Retention job exists. Legal period is unsigned (OD-08). |
| R4 | Network or device outage | Medium | HOLD or explicit unavailable. Manual path requires role, reason, and audit. |
| R5 | Scope expansion | Medium | This baseline and change control. Do not mark unfinished modules complete. |
| R6 | Peak load | Medium | Indexes, pagination on the largest lists is still incomplete, connection pool. Load targets unsigned. |
| R7 | Stale documentation showing shared passwords | High | Schema does not insert users. README and the sign-in form do not offer a built-in account. |
| R8 | Proof-of-concept face service used as if it were production | High | Health and administration state that the model is not a production matcher. |
| R9 | In-memory rate limit on one process | Medium | Sufficient for a single DEV node. Not sufficient for several API instances. |
| R10 | Audit table mutable by database administrators | Medium | Application does not update audit rows. Database privilege separation is an operations control. |

No risk is closed by documentation alone.
