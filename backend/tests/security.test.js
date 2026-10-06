import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET = process.env.JWT_SECRET || "unit-test-secret-value";

const { assertPasswordStrength, signToken, verifyToken } = await import("../src/security.js");
const { hasPermission, usePermissionSource } = await import("../src/domain.js");

test("password policy rejects short and numberless passwords", () => {
  assert.match(assertPasswordStrength("short1"), /10 characters/);
  assert.match(assertPasswordStrength("longpassword"), /letter and a number/);
  assert.equal(assertPasswordStrength("longpassword1"), null);
});

test("expired tokens are rejected", () => {
  const token = signToken({ sub: "user_test" }, -30);
  assert.equal(verifyToken(token), null);
});

test("signed tokens verify and carry a revocation id", () => {
  const token = signToken({ sub: "user_test", role: "host" }, 60);
  const payload = verifyToken(token);
  assert.equal(payload.sub, "user_test");
  assert.equal(typeof payload.jti, "string");
});

test("database permission source overrides the code catalog when present", () => {
  usePermissionSource((role) => (role === "host" ? ["visits.read.own"] : null));
  assert.equal(hasPermission("host", "visits.create"), false);
  assert.equal(hasPermission("host", "visits.read.own"), true);
  assert.equal(hasPermission("auditor", "audit.read"), true);
  usePermissionSource(null);
});
