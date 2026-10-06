import assert from "node:assert/strict";
import test from "node:test";
import { canTransition, decideAccess } from "../src/domain.js";
import { totp, verifyTotp } from "../src/security.js";

const base = {
  visit: { status: "Expected", scheduledStart: "2026-10-01T00:00:00.000Z", scheduledEnd: "2026-10-01T23:00:00.000Z" },
  badgeActive: true,
  now: new Date("2026-10-01T10:00:00.000Z"),
  toleranceMinutes: 30,
  faceRequired: true,
  livenessRequired: true,
  consentRequired: true,
  documentRequired: true,
  consentPresent: true,
  documentPresent: true,
  enrollmentPresent: true,
  face: { available: true, match: true, qualityPassed: true, livenessPassed: true, reason: "MATCH" },
  watchlistHit: false,
  occupancy: 1,
  capacity: 50,
};

test("allows entry only when every configured check passes", () => {
  const result = decideAccess(base);
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.reasons.length, 0);
});

test("a face match does not override a failed business rule", () => {
  const result = decideAccess({ ...base, consentPresent: false });
  assert.equal(result.decision, "DENY");
  assert.ok(result.reasons.some((reason) => reason.code === "CONSENT_MISSING"));
});

test("watchlist match holds entry for review", () => {
  const result = decideAccess({ ...base, watchlistHit: true });
  assert.equal(result.decision, "HOLD");
  assert.equal(result.reasons[0].code, "WATCHLIST_REVIEW");
});

test("pending approval asks for another approval step", () => {
  const result = decideAccess({ ...base, visit: { ...base.visit, status: "Pending Approval" } });
  assert.equal(result.decision, "ADDITIONAL_APPROVAL");
});

test("face service outage holds instead of allowing entry", () => {
  const result = decideAccess({ ...base, face: { available: false } });
  assert.equal(result.decision, "HOLD");
  assert.equal(result.reasons[0].code, "FACE_SERVICE_UNAVAILABLE");
});

test("mismatch denies entry", () => {
  const result = decideAccess({
    ...base,
    face: { available: true, match: false, qualityPassed: true, livenessPassed: true, reason: "MISMATCH" },
  });
  assert.equal(result.decision, "DENY");
  assert.equal(result.reasons[0].code, "FACE_MISMATCH");
});

test("duplicate entry and expiry are rejected", () => {
  assert.equal(decideAccess({ ...base, visit: { ...base.visit, status: "Inside" } }).decision, "DENY");
  assert.equal(
    decideAccess({ ...base, now: new Date("2026-10-03T10:00:00.000Z") }).reasons.some((reason) => reason.code === "OUTSIDE_WINDOW"),
    true,
  );
});

test("state machine rejects illegal jumps", () => {
  assert.equal(canTransition("Draft", "Inside"), false);
  assert.equal(canTransition("Expected", "Checked-In"), true);
  assert.equal(canTransition("Checked-Out", "Inside"), false);
  assert.equal(canTransition("Expired", "Expected"), true);
});

test("totp accepts the current window", () => {
  const when = Date.parse("2026-10-01T12:00:00Z");
  const code = totp("VMS-ADMIN-TOTP-SECRET", when);
  assert.equal(verifyTotp("VMS-ADMIN-TOTP-SECRET", code, when), true);
  assert.equal(verifyTotp("VMS-ADMIN-TOTP-SECRET", "000000", when), false);
});
