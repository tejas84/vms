import { loadEnv } from "../src/env.js";

loadEnv();

const args = Object.fromEntries(
  process.argv.slice(2).map((part) => {
    const [key, value] = part.replace(/^--/, "").split("=");
    return [key, value ?? ""];
  }),
);

if (!args.name || !args.email || !args.password) {
  console.error("Usage: node backend/scripts/create-admin.mjs --name \"Your Name\" --email you@company.com --password \"AtLeast10Chars1\"");
  process.exit(1);
}

const { one, run, initDb } = await import("../src/db.js");
const { assertPasswordStrength, generateTotpSecret, hashPassword, newId, otpauthUrl } = await import("../src/security.js");

const problem = assertPasswordStrength(args.password);
if (problem) {
  console.error(problem);
  process.exit(1);
}

await initDb();
const email = args.email.trim().toLowerCase();
if (await one("SELECT id FROM users WHERE lower(email) = lower(?)", [email])) {
  console.error("A user with this email already exists.");
  process.exit(1);
}

const secret = generateTotpSecret();
const id = newId("user");
await run(
  `INSERT INTO users (id, email, password_hash, name, role, site_id, visitor_id, mfa_required, totp_secret, disabled, created_at)
   VALUES (?, ?, ?, ?, 'system_admin', NULL, NULL, 1, ?, 0, ?)`,
  [id, email, hashPassword(args.password), args.name.trim(), secret, new Date().toISOString()],
);

console.log("System administrator created.");
console.log(`Email: ${email}`);
console.log("MFA is required. Add this secret to an authenticator app. It is shown once.");
console.log(`Secret: ${secret}`);
console.log(otpauthUrl(email, secret));
process.exit(0);
