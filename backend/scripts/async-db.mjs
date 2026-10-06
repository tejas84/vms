import fs from "node:fs";

const file = new URL("../src/server.js", import.meta.url);
let source = fs.readFileSync(file, "utf8");

source = source.replace(
  '  totp,\n} from "./security.js";',
  '} from "./security.js";',
);
source = source.replace("  usingDefaultJwtSecret,\n", "");
source = source.replace(
  `import {
  hashPassword,
  newId,
  passCode,
  signToken,
  verifyPassword,
  verifyToken,
  verifyTotp,
} from "./security.js";`,
  `import {
  assertPasswordStrength,
  generateTotpSecret,
  hashPassword,
  newId,
  otpauthUrl,
  passCode,
  signToken,
  verifyPassword,
  verifyToken,
  verifyTotp,
} from "./security.js";`,
);

const fns = [
  "audit",
  "notify",
  "requireAuth",
  "transition",
  "issueBadge",
  "approveVisit",
  "loadVisitView",
  "visibleVisits",
  "expireStale",
  "enrollmentFor",
  "watchlistMatch",
  "evaluateVisit",
  "findVisitByCode",
  "assertNoActiveDuplicate",
  "createVisitor",
  "createVisitRecord",
  "replay",
  "remember",
];
for (const name of fns) {
  source = source.replace(`function ${name}(`, `async function ${name}(`);
}

source = source.replaceAll("(req, res, next) =>", "async (req, res, next) =>");
source = source.replaceAll("(req, res) =>", "async (req, res) =>");
source = source.replaceAll("(_req, res, next) =>", "async (_req, res, next) =>");
source = source.replaceAll("(_req, res) =>", "async (_req, res) =>");
source = source.replaceAll("(_req, _res, next) =>", "async (_req, _res, next) =>");

const calls = fns.concat(["run", "all", "one", "policy", "transaction"]).join("|");
source = source.replace(new RegExp(`(?<!await )\\b(${calls})\\(`, "g"), "await $1(");

source = source.replace(
  "return await all(",
  "return (await all(",
);
source = source.replace(
  ").map((row) => shapeVisit(row));",
  ")).map((row) => shapeVisit(row));",
);
source = source.replace(
  'policies: await all("SELECT * FROM policies").map',
  'policies: (await all("SELECT * FROM policies")).map',
);
source = source.replaceAll("idempotency_keys WHERE key = ?", "idempotency_keys WHERE `key` = ?");
source = source.replaceAll("(key, response, created_at)", "(`key`, response, created_at)");
source = source.replaceAll("row.key", "row.policy_key");
source = source.replaceAll("SELECT key FROM policies", "SELECT policy_key FROM policies");
source = source.replaceAll("(key, value, updated_at)", "(policy_key, value, updated_at)");
source = source.replaceAll("WHERE key = ?", "WHERE policy_key = ?");

source = source.replace(
  `    if (usingDefaultJwtSecret()) {
      console.warn("JWT_SECRET is not set. Using the development secret. Set JWT_SECRET before any shared deployment.");
    }
    app.listen(PORT, () => {`,
  `    app.listen(PORT, () => {`,
);

fs.writeFileSync(file, source);
console.log("transformed");
