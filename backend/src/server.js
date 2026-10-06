import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { all, initDb, one, policy, run, transaction } from "./db.js";
import {
  ACTIVE_STATUSES,
  OPEN_DECISIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  canTransition,
  decideAccess,
  hasPermission,
  usePermissionSource,
} from "./domain.js";
import {
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
} from "./security.js";

const PORT = Number(process.env.PORT || 4000);
const FACE_URL = process.env.FACE_SERVICE_URL || "http://127.0.0.1:8090";
const DOC_DIR = path.resolve(process.env.VMS_DOC_DIR || path.join(process.cwd(), "data", "documents"));

const app = express();
app.use(cors({ origin: true, exposedHeaders: ["x-correlation-id"] }));
app.use(express.json({ limit: "8mb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

app.use(async (req, res, next) => {
  const id = req.header("x-correlation-id") || newId("cor");
  req.correlationId = id;
  res.setHeader("x-correlation-id", id);
  if (!permissionCache) {
    try {
      await loadPermissionCache();
    } catch (error) {
      if (req.path === "/health") return next();
      return next(error);
    }
  }
  next();
});

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 10;
let permissionCache = null;

async function loadPermissionCache() {
  const rows = await all("SELECT role_code, permission_code FROM role_permissions");
  const map = {};
  for (const row of rows) {
    map[row.role_code] = map[row.role_code] || [];
    map[row.role_code].push(row.permission_code);
  }
  permissionCache = map;
  usePermissionSource((role) => permissionCache[role] || null);
}

async function tooManyLogins(email) {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  const rows = await all("SELECT id FROM login_attempts WHERE email = ? AND created_at >= ?", [email, since]);
  return rows.length >= LOGIN_LIMIT;
}

async function recordLogin(email) {
  await run("INSERT INTO login_attempts (id, email, created_at) VALUES (?, ?, ?)", [
    newId("login"),
    email,
    new Date().toISOString(),
  ]);
}

async function audit({ type, actorId, entityType, entityId, oldValue, newValue, checkpoint, device, correlationId, ipAddress, userAgent }) {
  await run(
    `INSERT INTO audit_events
      (id, event_type, actor_id, entity_type, entity_id, checkpoint, device, old_value, new_value, correlation_id, created_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId("aud"),
      type,
      actorId || null,
      entityType || null,
      entityId || null,
      checkpoint || null,
      device || null,
      oldValue == null ? null : JSON.stringify(oldValue),
      newValue == null ? null : JSON.stringify(newValue),
      correlationId || null,
      new Date().toISOString(),
      ipAddress || null,
      userAgent ? String(userAgent).slice(0, 255) : null,
    ],
  );
}

async function notify({ visitId, template, recipient, message }) {
  const created = new Date().toISOString();
  const valid = recipient && String(recipient).includes("@");
  await run(
    `INSERT INTO notifications (id, visit_id, template, recipient, channel, status, message, created_at)
     VALUES (?, ?, ?, ?, 'in-app', ?, ?, ?)`,
    [newId("ntf"), visitId || null, template, recipient || null, valid ? "sent" : "failed", message, created],
  );
  await run(
    `INSERT INTO notifications (id, visit_id, template, recipient, channel, status, message, created_at)
     VALUES (?, ?, ?, ?, 'email', ?, ?, ?)`,
    [
      newId("ntf"),
      visitId || null,
      template,
      recipient || null,
      valid ? "sent_stub" : "failed",
      valid ? message : "Invalid recipient. Delivery failure is recorded and does not change visit authorization.",
      created,
    ],
  );
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    roleLabel: ROLE_LABELS[row.role] || row.role,
    siteId: row.site_id,
    visitorId: row.visitor_id,
    mfaRequired: !!row.mfa_required,
    permissions: permissionsFor(row.role),
  };
}

function permissionsFor(role) {
  if (permissionCache?.[role]?.length) return permissionCache[role];
  return ROLE_PERMISSIONS[role] || [];
}

async function requireAuth(req, _res, next) {
  try {
    const header = req.header("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const payload = verifyToken(token);
    if (!payload?.sub) throw new HttpError(401, "AUTH_FAILED", "Authentication failed or the session has expired.");
    if (payload.jti) {
      const revoked = await one("SELECT jti FROM revoked_tokens WHERE jti = ?", [payload.jti]);
      if (revoked) throw new HttpError(401, "AUTH_FAILED", "Authentication failed or the session has expired.");
    }
    const user = await one("SELECT * FROM users WHERE id = ?", [payload.sub]);
    if (!user) throw new HttpError(401, "AUTH_FAILED", "Authentication failed or the session has expired.");
    if (user.disabled) throw new HttpError(401, "DISABLED_USER", "This user is disabled.");
    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch (error) {
    next(error);
  }
}

function requirePerm(...perms) {
  return (req, _res, next) => {
    const ok = perms.some((perm) => hasPermission(req.user.role, perm));
    if (!ok) return next(new HttpError(403, "FORBIDDEN", "Insufficient permission."));
    next();
  };
}

async function transition(visit, to, actorId, note, correlationId) {
  if (!canTransition(visit.status, to)) {
    throw new HttpError(409, "INVALID_TRANSITION", `Cannot move a visit from ${visit.status} to ${to}.`);
  }
  const now = new Date().toISOString();
  await run("UPDATE visits SET status = ?, updated_at = ? WHERE id = ?", [to, now, visit.id]);
  await run(
    `INSERT INTO visit_status_history (id, visit_id, from_status, to_status, actor_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [newId("hist"), visit.id, visit.status, to, actorId || null, note || null, now],
  );
  await audit({
    type: "visit.status",
    actorId,
    entityType: "visit",
    entityId: visit.id,
    oldValue: { status: visit.status },
    newValue: { status: to, note },
    correlationId,
  });
  visit.status = to;
  visit.updated_at = now;
  return visit;
}

async function issueBadge(visit) {
  await run("UPDATE badges SET status = 'revoked' WHERE visit_id = ? AND status = 'active'", [visit.id]);
  const code = passCode();
  const now = new Date().toISOString();
  await run(
    `INSERT INTO badges (id, visit_id, code, status, zone_id, issued_at, expires_at)
     VALUES (?, ?, ?, 'active', ?, ?, ?)`,
    [newId("badge"), visit.id, code, visit.zone_id, now, visit.scheduled_end],
  );
  return code;
}

async function approveVisit(visit, actor, remarks, correlationId) {
  await transition(visit, "Approved", actor.id, remarks, correlationId);
  await transition(visit, "Expected", actor.id, "Approval complete", correlationId);
  const code = await issueBadge(visit);
  const visitor = await one("SELECT * FROM visitors WHERE id = ?", [visit.visitor_id]);
  const host = await one("SELECT * FROM users WHERE id = ?", [visit.host_id]);
  await notify({
    visitId: visit.id,
    template: "approval",
    recipient: visitor?.email,
    message: `Visit approved. Pass code ${code}. Complete registration before arrival.`,
  });
  await notify({
    visitId: visit.id,
    template: "approval",
    recipient: host?.email,
    message: `Visit for ${visitor?.full_name} was approved.`,
  });
  return code;
}

async function loadVisitView(id) {
  return await one(
    `SELECT v.*, vis.full_name AS visitor_name, vis.email AS visitor_email, vis.phone AS visitor_phone,
            vis.organization, vis.document_type, vis.document_ref, vis.consent_at,
            u.name AS host_name, s.name AS site_name, z.name AS zone_name,
            z.approval_required, z.face_required, z.active AS zone_active,
            b.code AS pass_code, b.status AS pass_status, b.expires_at AS pass_expires
     FROM visits v
     JOIN visitors vis ON vis.id = v.visitor_id
     JOIN users u ON u.id = v.host_id
     JOIN sites s ON s.id = v.site_id
     JOIN zones z ON z.id = v.zone_id
     LEFT JOIN badges b ON b.visit_id = v.id AND b.status = 'active'
     WHERE v.id = ?`,
    [id],
  );
}

function shapeVisit(row, { includePass = true } = {}) {
  if (!row) return null;
  const authorized = ["Approved", "Expected", "Waiting at Reception", "Checked-In", "Inside"].includes(row.status);
  return {
    id: row.id,
    purpose: row.purpose,
    status: row.status,
    atReception: !!row.at_reception,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    visitor: {
      id: row.visitor_id,
      name: row.visitor_name,
      email: row.visitor_email,
      phone: row.visitor_phone,
      organization: row.organization,
      documentType: row.document_type,
      documentPresent: !!row.document_ref,
      consentAt: row.consent_at,
    },
    host: { id: row.host_id, name: row.host_name },
    site: { id: row.site_id, name: row.site_name },
    zone: {
      id: row.zone_id,
      name: row.zone_name,
      approvalRequired: !!row.approval_required,
      faceRequired: !!row.face_required,
    },
    pass: includePass && authorized && row.pass_code
      ? { code: row.pass_code, status: row.pass_status, expiresAt: row.pass_expires }
      : null,
    overstay: row.status === "Inside" && new Date(row.scheduled_end).getTime() < Date.now(),
    updatedAt: row.updated_at,
  };
}

async function visibleVisits(user, { q, status } = {}) {
  const clauses = [];
  const params = [];
  if (user.role === "visitor") {
    clauses.push("v.visitor_id = ?");
    params.push(user.visitor_id || "");
  } else if (user.role === "host") {
    clauses.push("v.host_id = ?");
    params.push(user.id);
  } else if (user.site_id && user.role !== "system_admin" && user.role !== "auditor" && user.role !== "security_admin") {
    clauses.push("v.site_id = ?");
    params.push(user.site_id);
  }
  if (status) {
    clauses.push("v.status = ?");
    params.push(status);
  }
  if (q) {
    clauses.push("(vis.full_name LIKE ? OR vis.email LIKE ? OR b.code LIKE ? OR v.purpose LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return (await all(
    `SELECT v.*, vis.full_name AS visitor_name, vis.email AS visitor_email, vis.phone AS visitor_phone,
            vis.organization, vis.document_type, vis.document_ref, vis.consent_at,
            u.name AS host_name, s.name AS site_name, z.name AS zone_name,
            z.approval_required, z.face_required, z.active AS zone_active,
            b.code AS pass_code, b.status AS pass_status, b.expires_at AS pass_expires
     FROM visits v
     JOIN visitors vis ON vis.id = v.visitor_id
     JOIN users u ON u.id = v.host_id
     JOIN sites s ON s.id = v.site_id
     JOIN zones z ON z.id = v.zone_id
     LEFT JOIN badges b ON b.visit_id = v.id AND b.status = 'active'
     ${where}
     ORDER BY v.scheduled_start DESC`,
    params,
  )).map((row) => shapeVisit(row));
}

async function expireStale() {
  const rows = await all(
    `SELECT * FROM visits WHERE status IN ('Expected', 'Approved', 'Waiting at Reception')`,
  );
  const tolerance = await policy("time_tolerance_minutes", 30) * 60 * 1000;
  for (const visit of rows) {
    if (Date.now() > new Date(visit.scheduled_end).getTime() + tolerance) {
      const current = { ...visit, status: visit.status };
      await transition(current, "Expired", null, "Validity ended", null);
      await run("UPDATE badges SET status = 'revoked' WHERE visit_id = ? AND status = 'active'", [visit.id]);
    }
  }
}

async function physicalAccessStatus(command) {
  const row = await one("SELECT status, detail FROM integrations WHERE id = 'barrier'");
  const status = String(row?.status || "not_configured").toLowerCase();
  const connected = row && !["stub", "unavailable", "not_configured", "down"].includes(status);
  if (!connected) {
    return { activated: false, command, message: "Gate controller unavailable." };
  }
  return { activated: false, command, message: "Gate controller adapter is not connected to a device." };
}

async function callFace(pathname, body) {
  const response = await fetch(`${FACE_URL}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.detail?.message || data?.detail || "Face service rejected the capture.";
    throw new HttpError(response.status === 400 ? 400 : 502, "FACE_ERROR", String(message));
  }
  return data;
}

function mapFace(data) {
  if (!data) return null;
  const reason = data.reason || (data.match ? "MATCH" : "FACE_MISMATCH");
  const qualityPassed = !["NO_FACE", "POOR_QUALITY"].includes(reason);
  return {
    available: true,
    match: !!data.match,
    score: data.score ?? null,
    qualityScore: data.quality_score ?? null,
    qualityPassed,
    livenessPassed: !!data.liveness_passed,
    reason,
    threshold: data.threshold ?? null,
    policyVersion: data.policy_version ?? null,
  };
}

async function enrollmentFor(visitorId) {
  return await one(
    `SELECT * FROM biometric_enrollments WHERE visitor_id = ? ORDER BY created_at DESC LIMIT 1`,
    [visitorId],
  );
}

async function watchlistMatch(visitor) {
  const name = (visitor.full_name || "").trim().toLowerCase();
  const doc = (visitor.document_ref || "").trim().toLowerCase();
  const entries = await all("SELECT * FROM watchlist WHERE active = 1");
  for (const entry of entries) {
    const cleared = await one(
      "SELECT id FROM watchlist_clearances WHERE watchlist_id = ? AND visitor_id = ?",
      [entry.id, visitor.id],
    );
    if (cleared) continue;
    const entryName = entry.full_name.trim().toLowerCase();
    const entryDoc = (entry.document_ref || "").trim().toLowerCase();
    if ((doc && entryDoc && doc === entryDoc) || (name && name === entryName)) return entry;
  }
  return null;
}

async function evaluateVisit(visitRow, { gateId, faceResult, actor, correlationId }) {
  const visitor = await one("SELECT * FROM visitors WHERE id = ?", [visitRow.visitor_id]);
  const zone = await one("SELECT * FROM zones WHERE id = ?", [visitRow.zone_id]);
  const site = await one("SELECT * FROM sites WHERE id = ?", [visitRow.site_id]);
  const badge = await one("SELECT * FROM badges WHERE visit_id = ? AND status = 'active'", [visitRow.id]);
  const enrollment = await enrollmentFor(visitRow.visitor_id);
  const hit = await watchlistMatch(visitor);
  const occupancy = Number((await one("SELECT COUNT(*) AS n FROM visits WHERE status = 'Inside' AND site_id = ?", [visitRow.site_id]))?.n || 0);
  const faceRequired = !!(await policy("face_required", true) && zone?.face_required);
  const decision = decideAccess({
    visit: {
      status: visitRow.status,
      scheduledStart: visitRow.scheduled_start,
      scheduledEnd: visitRow.scheduled_end,
    },
    badgeActive: !!badge && new Date(badge.expires_at).getTime() >= Date.now() - await policy("time_tolerance_minutes", 30) * 60000,
    now: new Date(),
    toleranceMinutes: await policy("time_tolerance_minutes", 30),
    faceRequired,
    livenessRequired: !!await policy("liveness_enabled", true),
    consentRequired: !!await policy("require_consent", true),
    documentRequired: !!await policy("require_document", true),
    consentPresent: !!visitor?.consent_at,
    documentPresent: !!visitor?.document_ref,
    enrollmentPresent: !!enrollment,
    face: faceRequired ? faceResult : { available: true, match: true, qualityPassed: true, livenessPassed: true },
    watchlistHit: !!hit,
    occupancy,
    capacity: site?.max_occupancy ?? 0,
  });

  if (!faceRequired) {
    decision.reasons = decision.reasons.filter((reason) => reason.code !== "FACE_NOT_PROVIDED");
    if (!decision.reasons.some((reason) => reason.severity === "deny" || reason.severity === "hold" || reason.severity === "approval")) {
      decision.decision = "ALLOW";
    }
  }

  const decisionId = newId("dec");
  const faceMeta = faceResult
    ? {
        match: !!faceResult.match,
        score: faceResult.score ?? null,
        qualityScore: faceResult.qualityScore ?? null,
        livenessPassed: !!faceResult.livenessPassed,
        reason: faceResult.reason || null,
        threshold: faceResult.threshold ?? null,
        policyVersion: faceResult.policyVersion ?? null,
      }
    : null;
  await run(
    `INSERT INTO access_decisions
      (id, visit_id, gate_id, outcome, reasons, face_metadata, correlation_id, actor_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      decisionId,
      visitRow.id,
      gateId || null,
      decision.decision,
      JSON.stringify(decision.reasons),
      faceMeta ? JSON.stringify(faceMeta) : null,
      correlationId || null,
      actor?.id || null,
      new Date().toISOString(),
    ],
  );
  await audit({
    type: "access.decision",
    actorId: actor?.id,
    entityType: "visit",
    entityId: visitRow.id,
    checkpoint: gateId,
    newValue: { outcome: decision.decision, reasons: decision.reasons.map((r) => r.code), face: faceMeta },
    correlationId,
  });

  if (hit) {
    const existing = await one(
      "SELECT id FROM alerts WHERE visit_id = ? AND watchlist_id = ? AND status = 'open'",
      [visitRow.id, hit.id],
    );
    if (!existing) {
      await run(
        `INSERT INTO alerts (id, watchlist_id, visit_id, gate_id, status, created_at)
         VALUES (?, ?, ?, ?, 'open', ?)`,
        [newId("alert"), hit.id, visitRow.id, gateId || null, new Date().toISOString()],
      );
      await audit({
        type: "watchlist.alert",
        actorId: actor?.id,
        entityType: "watchlist",
        entityId: hit.id,
        newValue: { visitId: visitRow.id },
        correlationId,
      });
    }
  }

  return { ...decision, decisionId, face: faceMeta, watchlist: hit ? { id: hit.id, reason: hit.reason } : null };
}

async function findVisitByCode(code) {
  const badge = await one("SELECT * FROM badges WHERE code = ?", [String(code || "").trim().toUpperCase()]);
  if (!badge) return null;
  return await one("SELECT * FROM visits WHERE id = ?", [badge.visit_id]);
}

function assertSchedule(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) {
    throw new HttpError(400, "INVALID_SCHEDULE", "The visit end must be after the start.");
  }
  if (e.getTime() - s.getTime() > 14 * 86400000) {
    throw new HttpError(400, "INVALID_SCHEDULE", "A single visit window cannot exceed 14 days.");
  }
}

async function assertNoActiveDuplicate(visitorId) {
  const row = await one(
    `SELECT id, status FROM visits WHERE visitor_id = ? AND status IN (${ACTIVE_STATUSES.map(() => "?").join(",")}) LIMIT 1`,
    [visitorId, ...ACTIVE_STATUSES],
  );
  if (row) throw new HttpError(409, "DUPLICATE_VISIT", "This visitor already has an active visit.");
}

async function createVisitor({ name, email, phone, organization }) {
  const existing = email ? await one("SELECT * FROM visitors WHERE lower(email) = lower(?)", [email]) : null;
  if (existing) return existing;
  const id = newId("vis");
  await run(
    `INSERT INTO visitors (id, full_name, email, phone, organization, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, name, email || null, phone || null, organization || null, new Date().toISOString()],
  );
  return await one("SELECT * FROM visitors WHERE id = ?", [id]);
}

async function createVisitRecord({ visitor, hostId, siteId, zone, purpose, start, end, actor, atReception, correlationId, skipDuplicate = false }) {
  if (!skipDuplicate) await assertNoActiveDuplicate(visitor.id);
  const visit = {
    id: newId("visit"),
    visitor_id: visitor.id,
    host_id: hostId,
    site_id: siteId,
    zone_id: zone.id,
    purpose,
    scheduled_start: start,
    scheduled_end: end,
    status: "Draft",
    at_reception: atReception ? 1 : 0,
    recurrence_group: null,
    created_by: actor.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await run(
    `INSERT INTO visits
      (id, visitor_id, host_id, site_id, zone_id, purpose, scheduled_start, scheduled_end, status, at_reception, recurrence_group, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?, ?)`,
    [
      visit.id,
      visit.visitor_id,
      visit.host_id,
      visit.site_id,
      visit.zone_id,
      visit.purpose,
      visit.scheduled_start,
      visit.scheduled_end,
      visit.at_reception,
      null,
      visit.created_by,
      visit.created_at,
      visit.updated_at,
    ],
  );
  await audit({
    type: "visit.create",
    actorId: actor.id,
    entityType: "visit",
    entityId: visit.id,
    newValue: { purpose, zoneId: zone.id, start, end },
    correlationId,
  });
  if (zone.approval_required) {
    await transition(visit, "Pending Approval", actor.id, "Submitted to approval matrix", correlationId);
    await run(
      `INSERT INTO approvals (id, visit_id, step, approver_role) VALUES (?, ?, 1, 'approver')`,
      [newId("appr"), visit.id],
    );
    await notify({
      visitId: visit.id,
      template: "approval",
      recipient: (await one("SELECT email FROM users WHERE role = 'approver' AND disabled = 0 LIMIT 1"))?.email,
      message: `${visitor.full_name} needs approval for ${zone.name}.`,
    });
  } else {
    await transition(visit, "Approved", actor.id, "Zone does not require extra approval", correlationId);
    const next = atReception ? "Waiting at Reception" : "Expected";
    await transition(visit, "Expected", actor.id, "Authorized", correlationId);
    if (next === "Waiting at Reception") {
      await transition(visit, "Waiting at Reception", actor.id, "Walk-in at reception", correlationId);
    }
    const code = await issueBadge(visit);
    await notify({
      visitId: visit.id,
      template: "invitation",
      recipient: visitor.email,
      message: `Your visit is authorized. Pass code ${code}.`,
    });
  }
  return await loadVisitView(visit.id);
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/ready", async (_req, res) => {
  try {
    await one("SELECT 1 AS ok");
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not_ready" });
  }
});

app.get("/api/v1/health", async (_req, res) => {
  let face = "down";
  try {
    const response = await fetch(`${FACE_URL}/health`);
    face = response.ok ? "up" : "down";
  } catch {
    face = "down";
  }
  res.json({ status: "ok", face, api: "v1" });
});

app.post("/api/v1/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (await tooManyLogins(email)) throw new HttpError(429, "AUTH_FAILED", "Too many sign-in attempts. Try again later.");
    const user = await one("SELECT * FROM users WHERE lower(email) = ?", [email]);
    const requestMeta = { ipAddress: req.socket?.remoteAddress, userAgent: req.header("user-agent"), correlationId: req.correlationId };
    if (!user || !verifyPassword(password, user.password_hash)) {
      if (email) await recordLogin(email);
      await audit({ type: "auth.failure", entityType: "user", entityId: email, ...requestMeta });
      throw new HttpError(401, "AUTH_FAILED", "Email or password is incorrect.");
    }
    if (user.disabled) throw new HttpError(401, "DISABLED_USER", "This user is disabled.");
    if (user.mfa_required) {
      if (!verifyTotp(user.totp_secret, req.body?.mfaCode)) {
        await audit({ type: "auth.mfa_failure", actorId: user.id, entityType: "user", entityId: user.id, ...requestMeta });
        throw new HttpError(401, "MFA_REQUIRED", "Administrator sign-in requires a valid MFA code.");
      }
    }
    await run("DELETE FROM login_attempts WHERE email = ?", [email]);
    await audit({ type: "auth.success", actorId: user.id, entityType: "user", entityId: user.id, ...requestMeta });
    res.json({ token: signToken({ sub: user.id, role: user.role }), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/auth/sso", async (_req, _res, next) => {
  next(new HttpError(503, "SSO_OUTAGE", "SSO issuer is not configured. Use local sign-in until the identity adapter is connected."));
});

app.post("/api/v1/auth/logout", requireAuth, async (req, res, next) => {
  try {
    const payload = req.tokenPayload;
    if (payload?.jti) {
      await run(
        "INSERT IGNORE INTO revoked_tokens (jti, user_id, expires_at, revoked_at) VALUES (?, ?, ?, ?)",
        [payload.jti, req.user.id, new Date(payload.exp * 1000).toISOString(), new Date().toISOString()],
      );
    }
    await audit({
      type: "auth.logout",
      actorId: req.user.id,
      entityType: "user",
      entityId: req.user.id,
      correlationId: req.correlationId,
      ipAddress: req.socket?.remoteAddress,
      userAgent: req.header("user-agent"),
    });
    res.json({ signedOut: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/auth/password-reset", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email.includes("@")) throw new HttpError(400, "INVALID_CONFIGURATION", "A valid email address is required.");
    const provider = process.env.EMAIL_PROVIDER;
    if (!provider || provider === "none") {
      await audit({
        type: "auth.password_reset_unavailable",
        entityType: "user",
        entityId: "redacted",
        correlationId: req.correlationId,
        ipAddress: req.socket?.remoteAddress,
        userAgent: req.header("user-agent"),
      });
      throw new HttpError(
        503,
        "EMAIL_NOT_CONFIGURED",
        "Email delivery is not configured. Password reset cannot be completed until an email provider is connected.",
      );
    }
    throw new HttpError(503, "EMAIL_NOT_CONFIGURED", "The configured email provider is not connected.");
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/auth/me", requireAuth, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get("/api/v1/public/invitations/:code", async (req, res, next) => {
  try {
    const visit = await findVisitByCode(req.params.code);
    if (!visit) throw new HttpError(404, "INVITATION_NOT_FOUND", "This invitation code was not found.");
    const view = shapeVisit(await loadVisitView(visit.id));
    const enrollment = await enrollmentFor(visit.visitor_id);
    res.json({
      invitation: view,
      enrollmentPresent: !!enrollment,
      consentRequired: !!await policy("require_consent", true),
      documentRequired: !!await policy("require_document", true),
      consentVersion: await policy("consent_version", "privacy-notice-1.0"),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/public/invitations/:code/complete", async (req, res, next) => {
  try {
    const visit = await findVisitByCode(req.params.code);
    if (!visit) throw new HttpError(404, "INVITATION_NOT_FOUND", "This invitation code was not found.");
    if (!["Expected", "Waiting at Reception", "Approved"].includes(visit.status)) {
      throw new HttpError(409, "INVITATION_NOT_READY", "This invitation is not open for registration.");
    }
    if (!req.body?.consent) throw new HttpError(400, "CONSENT_REQUIRED", "Consent must be recorded before enrollment.");
    const visitor = await one("SELECT * FROM visitors WHERE id = ?", [visit.visitor_id]);
    const version = await policy("consent_version", "privacy-notice-1.0");
    const now = new Date().toISOString();
    await run(
      `UPDATE visitors SET full_name = ?, phone = ?, organization = ?, document_type = ?, document_ref = ?, consent_at = ?, consent_version = ? WHERE id = ?`,
      [
        req.body.fullName || visitor.full_name,
        req.body.phone || visitor.phone,
        req.body.organization || visitor.organization,
        req.body.documentType || null,
        req.body.documentRef || null,
        now,
        version,
        visitor.id,
      ],
    );
    await audit({
      type: "visitor.consent",
      entityType: "visitor",
      entityId: visitor.id,
      newValue: { consentVersion: version, documentType: req.body.documentType || null },
      correlationId: req.correlationId,
    });
    let enrollment = null;
    if (req.body.imageA && req.body.imageB) {
      const face = await callFace("/face/enroll", {
        image_a: req.body.imageA,
        image_b: req.body.imageB,
        subject_ref: visitor.id,
        liveness_required: !!await policy("liveness_enabled", true),
      });
      if (!face.accepted) {
        throw new HttpError(422, face.reason || "FACE_ERROR", "Face enrollment was not accepted. Retry the capture.");
      }
      await run(
        `INSERT INTO biometric_enrollments
          (id, visitor_id, template_ref, quality_score, liveness_passed, consent_ref, channel, policy_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId("bio"),
          visitor.id,
          face.template_ref,
          face.quality_score,
          face.liveness_passed ? 1 : 0,
          version,
          "visitor-portal",
          face.policy_version,
          now,
        ],
      );
      await audit({
        type: "face.enroll",
        entityType: "visitor",
        entityId: visitor.id,
        newValue: { channel: "visitor-portal", quality: face.quality_score, policyVersion: face.policy_version, consent: version },
        correlationId: req.correlationId,
      });
      enrollment = { qualityScore: face.quality_score, policyVersion: face.policy_version };
    }
    res.json({ visit: shapeVisit(await loadVisitView(visit.id)), enrollment });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/hosts", requireAuth, requirePerm("visits.walkin", "visits.create"), async (_req, res) => {
  res.json({
    hosts: await all("SELECT id, name, email FROM users WHERE role = 'host' AND disabled = 0 ORDER BY name"),
  });
});

app.get("/api/v1/sites", requireAuth, async (req, res, next) => {
  if (req.user.role === "visitor") return next(new HttpError(403, "FORBIDDEN", "Insufficient permission."));
  res.json({
    sites: await all("SELECT * FROM sites ORDER BY name"),
    buildings: await all("SELECT * FROM buildings ORDER BY name"),
    departments: await all("SELECT * FROM departments ORDER BY name"),
    gates: await all("SELECT * FROM gates ORDER BY name"),
    zones: await all("SELECT * FROM zones ORDER BY name"),
  });
});

app.post("/api/v1/sites", requireAuth, requirePerm("admin.config"), async (req, res, next) => {
  try {
    if (!req.body?.name) throw new HttpError(400, "INVALID_CONFIGURATION", "A site name is required.");
    const id = newId("site");
    await run("INSERT INTO sites (id, name, city, max_occupancy, created_at) VALUES (?, ?, ?, ?, ?)", [
      id,
      req.body.name,
      req.body.city || null,
      Number(req.body.maxOccupancy || 200),
      new Date().toISOString(),
    ]);
    await audit({ type: "admin.site", actorId: req.user.id, entityType: "site", entityId: id, newValue: req.body, correlationId: req.correlationId });
    res.status(201).json({ site: await one("SELECT * FROM sites WHERE id = ?", [id]) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/zones", requireAuth, requirePerm("admin.config"), async (req, res, next) => {
  try {
    const site = await one("SELECT id FROM sites WHERE id = ?", [req.body?.siteId]);
    if (!site || !req.body?.name) throw new HttpError(400, "INVALID_CONFIGURATION", "Site and zone name are required.");
    const id = newId("zone");
    await run(
      "INSERT INTO zones (id, site_id, name, approval_required, face_required, active) VALUES (?, ?, ?, ?, ?, 1)",
      [id, site.id, req.body.name, req.body.approvalRequired ? 1 : 0, req.body.faceRequired === false ? 0 : 1],
    );
    await audit({ type: "admin.zone", actorId: req.user.id, entityType: "zone", entityId: id, newValue: req.body, correlationId: req.correlationId });
    res.status(201).json({ zone: await one("SELECT * FROM zones WHERE id = ?", [id]) });
  } catch (error) {
    next(error);
  }
});

async function createOrgChild(req, res, next, { table, prefix, auditType, extra }) {
  try {
    const site = await one("SELECT id FROM sites WHERE id = ?", [req.body?.siteId]);
    if (!site || !req.body?.name) throw new HttpError(400, "INVALID_CONFIGURATION", "Site and name are required.");
    const id = newId(prefix);
    const columns = extra ? extra.columns : ["id", "site_id", "name"];
    const values = extra ? extra.values(id, site.id, req.body) : [id, site.id, String(req.body.name).trim()];
    await run(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`, values);
    await audit({
      type: auditType,
      actorId: req.user.id,
      entityType: table,
      entityId: id,
      newValue: { name: req.body.name, siteId: site.id },
      correlationId: req.correlationId,
    });
    res.status(201).json({ item: await one(`SELECT * FROM ${table} WHERE id = ?`, [id]) });
  } catch (error) {
    next(error);
  }
}

app.post("/api/v1/buildings", requireAuth, requirePerm("admin.config"), (req, res, next) => {
  createOrgChild(req, res, next, { table: "buildings", prefix: "bldg", auditType: "admin.building" });
});

app.post("/api/v1/departments", requireAuth, requirePerm("admin.config"), (req, res, next) => {
  createOrgChild(req, res, next, { table: "departments", prefix: "dept", auditType: "admin.department" });
});

app.post("/api/v1/gates", requireAuth, requirePerm("admin.config"), (req, res, next) => {
  createOrgChild(req, res, next, {
    table: "gates",
    prefix: "gate",
    auditType: "admin.gate",
    extra: {
      columns: ["id", "site_id", "name", "kind"],
      values: (id, siteId, body) => [id, siteId, String(body.name).trim(), String(body.kind || "pedestrian").slice(0, 40)],
    },
  });
});

app.get("/api/v1/visitor-categories", requireAuth, requirePerm("admin.config", "visits.create", "visits.walkin"), async (_req, res) => {
  res.json({ categories: await all("SELECT id, name, active, created_at FROM visitor_categories ORDER BY name") });
});

app.post("/api/v1/visitor-categories", requireAuth, requirePerm("admin.config"), async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) throw new HttpError(400, "INVALID_CONFIGURATION", "A category name is required.");
    if (await one("SELECT id FROM visitor_categories WHERE lower(name) = lower(?)", [name])) {
      throw new HttpError(409, "DUPLICATE_VISIT", "A visitor category with this name already exists.");
    }
    const id = newId("cat");
    await run("INSERT INTO visitor_categories (id, name, active, created_at) VALUES (?, ?, 1, ?)", [
      id,
      name,
      new Date().toISOString(),
    ]);
    await audit({
      type: "admin.category",
      actorId: req.user.id,
      entityType: "visitor_category",
      entityId: id,
      newValue: { name },
      correlationId: req.correlationId,
    });
    res.status(201).json({ category: await one("SELECT id, name, active, created_at FROM visitor_categories WHERE id = ?", [id]) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/users", requireAuth, requirePerm("admin.config"), async (_req, res) => {
  res.json({
    users: (await all("SELECT id, email, name, role, site_id, disabled, mfa_required, created_at FROM users ORDER BY name")).map((user) => ({
      ...user,
      roleLabel: ROLE_LABELS[user.role] || user.role,
    })),
  });
});

app.post("/api/v1/users", requireAuth, requirePerm("admin.config"), async (req, res, next) => {
  try {
    const { email, name, role, password, siteId } = req.body || {};
    if (!email || !name || !role || !password) throw new HttpError(400, "INVALID_CONFIGURATION", "Name, email, role, and password are required.");
    if (!ROLE_LABELS[role]) throw new HttpError(400, "INVALID_CONFIGURATION", "Unknown role.");
    const weak = assertPasswordStrength(password);
    if (weak) throw new HttpError(400, "WEAK_PASSWORD", weak);
    if (await one("SELECT id FROM users WHERE lower(email) = lower(?)", [email])) {
      throw new HttpError(409, "DUPLICATE_VISIT", "A user with this email already exists.");
    }
    const id = newId("user");
    const mfa = role === "system_admin" || role === "security_admin";
    const secret = mfa ? generateTotpSecret() : null;
    await run(
      `INSERT INTO users (id, email, password_hash, name, role, site_id, mfa_required, totp_secret, disabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [id, email.toLowerCase(), hashPassword(password), name, role, siteId || null, mfa ? 1 : 0, secret, new Date().toISOString()],
    );
    await audit({ type: "admin.user", actorId: req.user.id, entityType: "user", entityId: id, newValue: { email, role }, correlationId: req.correlationId });
    res.status(201).json({
      user: publicUser(await one("SELECT * FROM users WHERE id = ?", [id])),
      mfaSetup: secret ? { secret, otpauth: otpauthUrl(email.toLowerCase(), secret) } : null,
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/v1/users/:id", requireAuth, requirePerm("admin.config"), async (req, res, next) => {
  try {
    const user = await one("SELECT * FROM users WHERE id = ?", [req.params.id]);
    if (!user) throw new HttpError(404, "NOT_FOUND", "User not found.");
    const disabled = req.body?.disabled == null ? user.disabled : req.body.disabled ? 1 : 0;
    await run("UPDATE users SET disabled = ? WHERE id = ?", [disabled, user.id]);
    await audit({
      type: "admin.user",
      actorId: req.user.id,
      entityType: "user",
      entityId: user.id,
      oldValue: { disabled: user.disabled },
      newValue: { disabled },
      correlationId: req.correlationId,
    });
    res.json({ user: publicUser(await one("SELECT * FROM users WHERE id = ?", [user.id])) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/policies", requireAuth, requirePerm("admin.config", "reports.read"), async (_req, res) => {
  res.json({
    policies: (await all("SELECT * FROM policies")).map((row) => ({ key: row.policy_key, value: JSON.parse(row.value), updatedAt: row.updated_at })),
  });
});

app.put("/api/v1/policies/:key", requireAuth, requirePerm("admin.config"), async (req, res, next) => {
  try {
    const allowed = ["time_tolerance_minutes", "require_consent", "require_document", "liveness_enabled", "face_required", "retention_days", "consent_version"];
    if (!allowed.includes(req.params.key)) throw new HttpError(400, "INVALID_CONFIGURATION", "Unknown policy.");
    const previous = await policy(req.params.key, null);
    const updatedAt = new Date().toISOString();
    const encoded = JSON.stringify(req.body?.value);
    if (await one("SELECT policy_key FROM policies WHERE policy_key = ?", [req.params.key])) {
      await run("UPDATE policies SET value = ?, updated_at = ? WHERE policy_key = ?", [encoded, updatedAt, req.params.key]);
    } else {
      await run("INSERT INTO policies (policy_key, value, updated_at) VALUES (?, ?, ?)", [req.params.key, encoded, updatedAt]);
    }
    await audit({
      type: "admin.policy",
      actorId: req.user.id,
      entityType: "policy",
      entityId: req.params.key,
      oldValue: previous,
      newValue: req.body?.value,
      correlationId: req.correlationId,
    });
    res.json({ key: req.params.key, value: req.body?.value });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/visits", requireAuth, async (req, res, next) => {
  try {
    if (!hasPermission(req.user.role, "visits.read") && !hasPermission(req.user.role, "visits.read.own") && !hasPermission(req.user.role, "visits.create")) {
      throw new HttpError(403, "FORBIDDEN", "Insufficient permission.");
    }
    await expireStale();
    res.json({ visits: await visibleVisits(req.user, { q: req.query.q, status: req.query.status }) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/visits/:id", requireAuth, async (req, res, next) => {
  try {
    const visits = (await visibleVisits(req.user)).filter((visit) => visit.id === req.params.id);
    if (!visits[0] && req.user.role !== "system_admin") throw new HttpError(404, "NOT_FOUND", "Visit not found.");
    const view = shapeVisit(await loadVisitView(req.params.id));
    if (!view) throw new HttpError(404, "NOT_FOUND", "Visit not found.");
    const history = await all("SELECT * FROM visit_status_history WHERE visit_id = ? ORDER BY created_at", [req.params.id]);
    const approvals = await all("SELECT * FROM approvals WHERE visit_id = ? ORDER BY step", [req.params.id]);
    res.json({ visit: view, history, approvals, enrollmentPresent: !!await enrollmentFor(view.visitor.id) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/visits", requireAuth, requirePerm("visits.create"), async (req, res, next) => {
  try {
    const { visitorName, visitorEmail, visitorPhone, organization, purpose, siteId, zoneId, scheduledStart, scheduledEnd, recurrenceCount } = req.body || {};
    if (!visitorName || !purpose || !zoneId || !scheduledStart || !scheduledEnd) {
      throw new HttpError(400, "VALIDATION", "Visitor, purpose, zone, and schedule are required.");
    }
    const zone = await one("SELECT * FROM zones WHERE id = ? AND active = 1", [zoneId]);
    if (!zone) throw new HttpError(400, "UNAUTHORIZED_ZONE", "That access zone is not available.");
    const site = siteId || zone.site_id;
    if (zone.site_id !== site) throw new HttpError(400, "UNAUTHORIZED_ZONE", "The zone does not belong to the selected site.");
    const count = Math.min(Math.max(Number(recurrenceCount || 1), 1), 8);
    const created = [];
    await transaction(async () => {
      for (let index = 0; index < count; index += 1) {
        const start = new Date(scheduledStart);
        const end = new Date(scheduledEnd);
        start.setDate(start.getDate() + index * 7);
        end.setDate(end.getDate() + index * 7);
        assertSchedule(start.toISOString(), end.toISOString());
        const visitor = await createVisitor({ name: visitorName, email: visitorEmail, phone: visitorPhone, organization });
        const row = await createVisitRecord({
          visitor,
          hostId: req.user.id,
          siteId: site,
          zone,
          purpose,
          start: start.toISOString(),
          end: end.toISOString(),
          actor: req.user,
          atReception: false,
          correlationId: req.correlationId,
          skipDuplicate: index > 0,
        });
        created.push(shapeVisit(row));
      }
    });
    res.status(201).json({ visits: created });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/visits/walk-in", requireAuth, requirePerm("visits.walkin"), async (req, res, next) => {
  try {
    const { visitorName, visitorEmail, visitorPhone, organization, purpose, hostId, zoneId, scheduledStart, scheduledEnd, documentType, documentRef } = req.body || {};
    const host = await one("SELECT * FROM users WHERE id = ? AND role = 'host' AND disabled = 0", [hostId]);
    if (!host) throw new HttpError(400, "HOST_UNAVAILABLE", "Select an available host.");
    const zone = await one("SELECT * FROM zones WHERE id = ? AND active = 1", [zoneId]);
    if (!zone) throw new HttpError(400, "UNAUTHORIZED_ZONE", "That access zone is not available.");
    const start = scheduledStart || new Date().toISOString();
    const end = scheduledEnd || new Date(Date.now() + 8 * 3600000).toISOString();
    assertSchedule(start, end);
    const visitor = await createVisitor({ name: visitorName, email: visitorEmail, phone: visitorPhone, organization });
    if (documentRef) {
      await run("UPDATE visitors SET document_type = ?, document_ref = ? WHERE id = ?", [documentType || "ID", documentRef, visitor.id]);
    }
    const row = await createVisitRecord({
      visitor,
      hostId: host.id,
      siteId: zone.site_id,
      zone,
      purpose: purpose || "Walk-in",
      start,
      end,
      actor: req.user,
      atReception: true,
      correlationId: req.correlationId,
    });
    res.status(201).json({ visit: shapeVisit(row) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/visits/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    const visit = await one("SELECT * FROM visits WHERE id = ?", [req.params.id]);
    if (!visit) throw new HttpError(404, "NOT_FOUND", "Visit not found.");
    const own = visit.host_id === req.user.id || visit.created_by === req.user.id;
    if (!(hasPermission(req.user.role, "visits.cancel.own") && own) && !hasPermission(req.user.role, "visits.read") && req.user.role !== "system_admin") {
      throw new HttpError(403, "FORBIDDEN", "Insufficient permission.");
    }
    if (["Inside", "Checked-In"].includes(visit.status)) {
      throw new HttpError(409, "INVALID_TRANSITION", "Check the visitor out before closing an in-progress visit.");
    }
    await transition(visit, "Cancelled", req.user.id, req.body?.remarks || "Cancelled", req.correlationId);
    await run("UPDATE badges SET status = 'revoked' WHERE visit_id = ? AND status = 'active'", [visit.id]);
    const visitor = await one("SELECT * FROM visitors WHERE id = ?", [visit.visitor_id]);
    await notify({ visitId: visit.id, template: "rejection", recipient: visitor?.email, message: "This visit was cancelled." });
    res.json({ visit: shapeVisit(await loadVisitView(visit.id)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/visits/:id/extend", requireAuth, requirePerm("approvals.decide", "visits.walkin", "admin.config"), async (req, res, next) => {
  try {
    const visit = await one("SELECT * FROM visits WHERE id = ?", [req.params.id]);
    if (!visit) throw new HttpError(404, "NOT_FOUND", "Visit not found.");
    const end = req.body?.scheduledEnd;
    assertSchedule(visit.scheduled_start, end);
    if (visit.status === "Expired") await transition(visit, "Expected", req.user.id, "Authorized extension", req.correlationId);
    else if (!["Expected", "Approved", "Waiting at Reception"].includes(visit.status)) {
      throw new HttpError(409, "INVALID_TRANSITION", "Only an expected or expired visit can be extended.");
    }
    await run("UPDATE visits SET scheduled_end = ?, updated_at = ? WHERE id = ?", [new Date(end).toISOString(), new Date().toISOString(), visit.id]);
    await run("UPDATE badges SET expires_at = ?, status = 'active' WHERE visit_id = ?", [new Date(end).toISOString(), visit.id]);
    await audit({
      type: "visit.extend",
      actorId: req.user.id,
      entityType: "visit",
      entityId: visit.id,
      newValue: { scheduledEnd: end },
      correlationId: req.correlationId,
    });
    res.json({ visit: shapeVisit(await loadVisitView(visit.id)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/approvals/:visitId", requireAuth, requirePerm("approvals.decide"), async (req, res, next) => {
  try {
    const visit = await one("SELECT * FROM visits WHERE id = ?", [req.params.visitId]);
    if (!visit) throw new HttpError(404, "NOT_FOUND", "Visit not found.");
    const approval = await one("SELECT * FROM approvals WHERE visit_id = ? AND decision IS NULL ORDER BY step LIMIT 1", [visit.id]);
    if (!approval && req.body?.decision !== "escalate") throw new HttpError(409, "INVALID_TRANSITION", "There is no open approval step.");
    const decision = req.body?.decision;
    const remarks = String(req.body?.remarks || "").trim();
    if (!["approve", "reject", "escalate"].includes(decision)) throw new HttpError(400, "VALIDATION", "Decision must be approve, reject, or escalate.");
    if (decision !== "approve" && remarks.length < 3) throw new HttpError(400, "VALIDATION", "A remark is required.");
    const now = new Date().toISOString();
    if (decision === "approve") {
      await run("UPDATE approvals SET decision = 'approved', approver_id = ?, remarks = ?, decided_at = ? WHERE id = ?", [
        req.user.id,
        remarks,
        now,
        approval.id,
      ]);
      await audit({ type: "approval.decision", actorId: req.user.id, entityType: "visit", entityId: visit.id, newValue: { decision, remarks }, correlationId: req.correlationId });
      await approveVisit(visit, req.user, remarks, req.correlationId);
    } else if (decision === "reject") {
      await run("UPDATE approvals SET decision = 'rejected', approver_id = ?, remarks = ?, decided_at = ? WHERE id = ?", [
        req.user.id,
        remarks,
        now,
        approval.id,
      ]);
      await transition(visit, "Cancelled", req.user.id, remarks, req.correlationId);
      const visitor = await one("SELECT * FROM visitors WHERE id = ?", [visit.visitor_id]);
      await notify({ visitId: visit.id, template: "rejection", recipient: visitor?.email, message: `Visit rejected: ${remarks}` });
      await audit({ type: "approval.decision", actorId: req.user.id, entityType: "visit", entityId: visit.id, newValue: { decision, remarks }, correlationId: req.correlationId });
    } else {
      if (visit.status === "Pending Approval") await transition(visit, "On Hold", req.user.id, remarks, req.correlationId);
      await notify({
        visitId: visit.id,
        template: "approval",
        recipient: (await one("SELECT email FROM users WHERE role = 'security_admin' AND disabled = 0 LIMIT 1"))?.email,
        message: `Approval escalated: ${remarks}`,
      });
      await audit({ type: "approval.escalate", actorId: req.user.id, entityType: "visit", entityId: visit.id, newValue: { remarks }, correlationId: req.correlationId });
    }
    res.json({ visit: shapeVisit(await loadVisitView(visit.id)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/face/enroll", requireAuth, requirePerm("visits.walkin", "badges.issue", "invitation.complete"), async (req, res, next) => {
  try {
    const visit = await one("SELECT * FROM visits WHERE id = ?", [req.body?.visitId]);
    if (!visit) throw new HttpError(404, "NOT_FOUND", "Visit not found.");
    if (req.user.role === "visitor" && req.user.visitor_id !== visit.visitor_id) {
      throw new HttpError(403, "FORBIDDEN", "Insufficient permission.");
    }
    const visitor = await one("SELECT * FROM visitors WHERE id = ?", [visit.visitor_id]);
    if (await policy("require_consent", true) && !visitor.consent_at && !req.body?.consent) {
      throw new HttpError(400, "CONSENT_REQUIRED", "Consent must be recorded before enrollment.");
    }
    if (req.body?.consent && !visitor.consent_at) {
      const version = await policy("consent_version", "privacy-notice-1.0");
      await run("UPDATE visitors SET consent_at = ?, consent_version = ? WHERE id = ?", [new Date().toISOString(), version, visitor.id]);
    }
    const face = await callFace("/face/enroll", {
      image_a: req.body.imageA,
      image_b: req.body.imageB,
      subject_ref: visitor.id,
      liveness_required: !!await policy("liveness_enabled", true),
    });
    if (!face.accepted) throw new HttpError(422, face.reason || "FACE_ERROR", "Face enrollment was not accepted.");
    await run(
      `INSERT INTO biometric_enrollments
        (id, visitor_id, template_ref, quality_score, liveness_passed, consent_ref, channel, policy_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId("bio"),
        visitor.id,
        face.template_ref,
        face.quality_score,
        face.liveness_passed ? 1 : 0,
        visitor.consent_version || await policy("consent_version", "privacy-notice-1.0"),
        req.user.role,
        face.policy_version,
        new Date().toISOString(),
      ],
    );
    await audit({
      type: "face.enroll",
      actorId: req.user.id,
      entityType: "visitor",
      entityId: visitor.id,
      newValue: { channel: req.user.role, quality: face.quality_score, policyVersion: face.policy_version },
      correlationId: req.correlationId,
    });
    res.json({ accepted: true, qualityScore: face.quality_score, policyVersion: face.policy_version });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/gate/validate", requireAuth, requirePerm("gate.validate"), async (req, res, next) => {
  try {
    await expireStale();
    const visit = req.body?.code
      ? await findVisitByCode(req.body.code)
      : await one("SELECT * FROM visits WHERE id = ?", [req.body?.visitId]);
    if (!visit) throw new HttpError(404, "VISIT_NOT_FOUND", "No active pass matches that code.");
    let faceResult = null;
    const zone = await one("SELECT * FROM zones WHERE id = ?", [visit.zone_id]);
    const faceRequired = !!(await policy("face_required", true) && zone?.face_required);
    if (faceRequired) {
      const enrollment = await enrollmentFor(visit.visitor_id);
      if (enrollment && req.body?.imageA) {
        try {
          const data = await callFace("/face/verify", {
            image_a: req.body.imageA,
            image_b: req.body.imageB || null,
            template_ref: enrollment.template_ref,
            liveness_required: !!await policy("liveness_enabled", true),
          });
          faceResult = mapFace(data);
        } catch (error) {
          if (error.code === "FACE_ERROR") {
            faceResult = { available: true, match: false, qualityPassed: false, livenessPassed: false, reason: "POOR_QUALITY" };
          } else faceResult = { available: false, reason: "FACE_SERVICE_UNAVAILABLE" };
        }
      } else if (!req.body?.imageA) {
        faceResult = null;
      } else {
        faceResult = null;
      }
    }
    const result = await evaluateVisit(visit, {
      gateId: req.body?.gateId,
      faceResult,
      actor: req.user,
      correlationId: req.correlationId,
    });
    res.json({
      ...result,
      correlationId: req.correlationId,
      visit: shapeVisit(await loadVisitView(visit.id)),
    });
  } catch (error) {
    next(error);
  }
});

async function replay(key) {
  if (!key) return null;
  const row = await one("SELECT response FROM idempotency_keys WHERE `key` = ?", [key]);
  return row ? JSON.parse(row.response) : null;
}

async function remember(key, payload) {
  if (!key) return;
  await run("INSERT INTO idempotency_keys (`key`, response, created_at) VALUES (?, ?, ?)", [key, JSON.stringify(payload), new Date().toISOString()]);
}

app.post("/api/v1/gate/check-in", requireAuth, requirePerm("gate.checkin"), async (req, res, next) => {
  try {
    const idem = req.header("idempotency-key") || req.body?.idempotencyKey;
    const cached = await replay(idem);
    if (cached) return res.json(cached);
    const prior = await one("SELECT * FROM access_decisions WHERE id = ?", [req.body?.decisionId]);
    if (!prior || prior.outcome !== "ALLOW") {
      throw new HttpError(409, "ACCESS_DENIED", "Check-in requires a current ALLOW decision. Validate again.");
    }
    const visit = await one("SELECT * FROM visits WHERE id = ?", [prior.visit_id]);
    const override = String(prior.reasons || "").includes("MANUAL_OVERRIDE");
    if (["Checked-Out", "Cancelled", "Inside", "Checked-In"].includes(visit.status)) {
      throw new HttpError(409, "DUPLICATE_ENTRY", "This visit is not waiting for entry.");
    }
    if (visit.status === "On Hold" && override) await transition(visit, "Expected", req.user.id, "Override released hold", req.correlationId);
    if (visit.status === "Pending Approval" && override) {
      await transition(visit, "Approved", req.user.id, "Override", req.correlationId);
      await transition(visit, "Expected", req.user.id, "Override", req.correlationId);
    }
    if (visit.status === "Expired" && override) await transition(visit, "Expected", req.user.id, "Override extension", req.correlationId);
    if (visit.status === "Approved") await transition(visit, "Expected", req.user.id, "Entry", req.correlationId);
    if (!["Expected", "Waiting at Reception"].includes(visit.status)) {
      throw new HttpError(409, "ACCESS_DENIED", "This visit status cannot enter without a permitted decision.");
    }
    await transition(visit, "Checked-In", req.user.id, "Identity and policy checks passed", req.correlationId);
    await transition(visit, "Inside", req.user.id, "Entry recorded", req.correlationId);
    const txId = newId("gtx");
    await run(
      `INSERT INTO gate_transactions
        (id, visit_id, gate_id, direction, decision, method, decision_id, actor_id, correlation_id, idempotency_key, created_at)
       VALUES (?, ?, ?, 'entry', 'ALLOW', 'validation', ?, ?, ?, ?, ?)`,
      [txId, visit.id, prior.gate_id, prior.id, req.user.id, req.correlationId, idem || null, new Date().toISOString()],
    );
    await audit({
      type: "access.entry",
      actorId: req.user.id,
      entityType: "visit",
      entityId: visit.id,
      checkpoint: prior.gate_id,
      device: "gate",
      newValue: { transactionId: txId },
      correlationId: req.correlationId,
    });
    const host = await one("SELECT * FROM users WHERE id = ?", [visit.host_id]);
    const visitor = await one("SELECT * FROM visitors WHERE id = ?", [visit.visitor_id]);
    await notify({
      visitId: visit.id,
      template: "arrival",
      recipient: host.email,
      message: `${visitor.full_name} has entered.`,
    });
    const payload = {
      visit: shapeVisit(await loadVisitView(visit.id)),
      transactionId: txId,
      physicalAccess: await physicalAccessStatus("activate-temporary-access"),
    };
    await remember(idem, payload);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/gate/check-out", requireAuth, requirePerm("gate.checkout"), async (req, res, next) => {
  try {
    const idem = req.header("idempotency-key") || req.body?.idempotencyKey;
    const cached = await replay(idem);
    if (cached) return res.json(cached);
    const visit = req.body?.code
      ? await findVisitByCode(req.body.code)
      : await one("SELECT * FROM visits WHERE id = ?", [req.body?.visitId]);
    if (!visit) throw new HttpError(404, "VISIT_NOT_FOUND", "No visit matches that pass.");
    if (!["Inside", "Checked-In"].includes(visit.status)) {
      throw new HttpError(409, "INVALID_TRANSITION", "Only a visitor who is inside can be checked out.");
    }
    const overstay = new Date(visit.scheduled_end).getTime() < Date.now();
    if (visit.status === "Checked-In") await transition(visit, "Inside", req.user.id, "Normalize before exit", req.correlationId);
    await transition(visit, "Checked-Out", req.user.id, overstay ? "Exit with overstay" : "Exit", req.correlationId);
    await run("UPDATE badges SET status = 'revoked' WHERE visit_id = ? AND status = 'active'", [visit.id]);
    const txId = newId("gtx");
    await run(
      `INSERT INTO gate_transactions
        (id, visit_id, gate_id, direction, decision, method, reason, actor_id, correlation_id, idempotency_key, created_at)
       VALUES (?, ?, ?, 'exit', 'ALLOW', 'checkout', ?, ?, ?, ?, ?)`,
      [txId, visit.id, req.body?.gateId || null, overstay ? "overstay" : null, req.user.id, req.correlationId, idem || null, new Date().toISOString()],
    );
    await audit({
      type: "access.exit",
      actorId: req.user.id,
      entityType: "visit",
      entityId: visit.id,
      checkpoint: req.body?.gateId,
      newValue: { transactionId: txId, overstay },
      correlationId: req.correlationId,
    });
    const payload = {
      visit: shapeVisit(await loadVisitView(visit.id)),
      transactionId: txId,
      overstay,
      physicalAccess: await physicalAccessStatus("disable-temporary-access"),
    };
    await remember(idem, payload);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/gate/override", requireAuth, requirePerm("gate.override"), async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 8) throw new HttpError(400, "VALIDATION", "Override requires a reason of at least 8 characters.");
    const failed = await one("SELECT * FROM access_decisions WHERE id = ?", [req.body?.decisionId]);
    if (!failed) throw new HttpError(400, "VALIDATION", "Override must reference the failed validation.");
    if (failed.outcome === "ALLOW") throw new HttpError(409, "INVALID_TRANSITION", "This decision already allows entry.");
    const visit = await one("SELECT * FROM visits WHERE id = ?", [failed.visit_id]);
    if (!visit) throw new HttpError(404, "NOT_FOUND", "Visit not found.");
    if (["Checked-Out", "Cancelled"].includes(visit.status)) {
      throw new HttpError(409, "INVALID_TRANSITION", "This visit cannot be overridden into entry.");
    }
    const decisionId = newId("dec");
    await run(
      `INSERT INTO access_decisions (id, visit_id, gate_id, outcome, reasons, face_metadata, correlation_id, actor_id, created_at)
       VALUES (?, ?, ?, 'ALLOW', ?, ?, ?, ?, ?)`,
      [
        decisionId,
        visit.id,
        req.body?.gateId || failed.gate_id,
        JSON.stringify([{ code: "MANUAL_OVERRIDE", message: reason, severity: "info", failedDecisionId: failed.id, failedOutcome: failed.outcome }]),
        failed.reasons,
        req.correlationId,
        req.user.id,
        new Date().toISOString(),
      ],
    );
    await audit({
      type: "access.override",
      actorId: req.user.id,
      entityType: "visit",
      entityId: visit.id,
      checkpoint: req.body?.gateId || failed.gate_id,
      oldValue: { decisionId: failed.id, outcome: failed.outcome, reasons: JSON.parse(failed.reasons) },
      newValue: { decisionId, reason },
      correlationId: req.correlationId,
    });
    res.json({ decisionId, outcome: "ALLOW", failedDecisionId: failed.id, note: "The failed validation is retained. Check in with this new decision." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/watchlist", requireAuth, requirePerm("watchlist.admin", "alerts.read"), async (_req, res) => {
  res.json({ entries: await all("SELECT * FROM watchlist ORDER BY created_at DESC") });
});

app.post("/api/v1/watchlist", requireAuth, requirePerm("watchlist.admin"), async (req, res, next) => {
  try {
    if (!req.body?.fullName || !req.body?.reason) throw new HttpError(400, "VALIDATION", "Name and reason are required.");
    const id = newId("wl");
    await run(
      "INSERT INTO watchlist (id, full_name, document_ref, reason, active, created_by, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
      [id, req.body.fullName, req.body.documentRef || null, req.body.reason, req.user.id, new Date().toISOString()],
    );
    await audit({ type: "watchlist.create", actorId: req.user.id, entityType: "watchlist", entityId: id, newValue: { name: req.body.fullName, reason: req.body.reason }, correlationId: req.correlationId });
    res.status(201).json({ entry: await one("SELECT * FROM watchlist WHERE id = ?", [id]) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/v1/watchlist/:id", requireAuth, requirePerm("watchlist.admin"), async (req, res, next) => {
  try {
    const entry = await one("SELECT * FROM watchlist WHERE id = ?", [req.params.id]);
    if (!entry) throw new HttpError(404, "NOT_FOUND", "Watchlist entry not found.");
    const active = req.body?.active === false ? 0 : 1;
    await run("UPDATE watchlist SET active = ? WHERE id = ?", [active, entry.id]);
    await audit({
      type: "watchlist.update",
      actorId: req.user.id,
      entityType: "watchlist",
      entityId: entry.id,
      oldValue: { active: entry.active },
      newValue: { active },
      correlationId: req.correlationId,
    });
    res.json({ entry: await one("SELECT * FROM watchlist WHERE id = ?", [entry.id]) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/alerts", requireAuth, requirePerm("alerts.read", "alerts.review"), async (_req, res) => {
  res.json({
    alerts: await all(
      `SELECT a.*, w.full_name, w.reason AS watchlist_reason, vis.full_name AS visitor_name
       FROM alerts a
       LEFT JOIN watchlist w ON w.id = a.watchlist_id
       LEFT JOIN visits v ON v.id = a.visit_id
       LEFT JOIN visitors vis ON vis.id = v.visitor_id
       ORDER BY a.created_at DESC`,
    ),
  });
});

app.post("/api/v1/alerts/:id/review", requireAuth, requirePerm("alerts.review"), async (req, res, next) => {
  try {
    const alert = await one("SELECT * FROM alerts WHERE id = ?", [req.params.id]);
    if (!alert) throw new HttpError(404, "NOT_FOUND", "Alert not found.");
    const disposition = req.body?.disposition;
    if (!["confirmed", "cleared"].includes(disposition)) throw new HttpError(400, "VALIDATION", "Disposition must be confirmed or cleared.");
    const note = String(req.body?.reason || "").trim();
    if (note.length < 3) throw new HttpError(400, "VALIDATION", "A review note is required.");
    await run(
      "UPDATE alerts SET status = ?, disposition = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?",
      [disposition, note, req.user.id, new Date().toISOString(), alert.id],
    );
    if (disposition === "cleared") {
      const visit = await one("SELECT * FROM visits WHERE id = ?", [alert.visit_id]);
      if (visit) {
        await run(
          "INSERT INTO watchlist_clearances (id, watchlist_id, visitor_id, reason, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [newId("clr"), alert.watchlist_id, visit.visitor_id, note, req.user.id, new Date().toISOString()],
        );
      }
    }
    await audit({
      type: "watchlist.review",
      actorId: req.user.id,
      entityType: "alert",
      entityId: alert.id,
      newValue: { disposition, note },
      correlationId: req.correlationId,
    });
    res.json({ alert: await one("SELECT * FROM alerts WHERE id = ?", [alert.id]) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/notifications", requireAuth, async (req, res) => {
  const email = req.user.email;
  res.json({
    notifications: await all(
      `SELECT * FROM notifications WHERE recipient = ? OR recipient IS NULL ORDER BY created_at DESC LIMIT 100`,
      [email],
    ),
  });
});

app.get("/api/v1/dashboard", requireAuth, requirePerm("dashboard.read"), async (req, res) => {
  await expireStale();
  if (req.user.role === "visitor" || req.user.role === "host") {
    return res.json({ scope: "own", visits: await visibleVisits(req.user) });
  }
  const inside = await all(
    `SELECT v.id, vis.full_name AS visitor_name, z.name AS zone_name, v.scheduled_end, v.status
     FROM visits v JOIN visitors vis ON vis.id = v.visitor_id JOIN zones z ON z.id = v.zone_id
     WHERE v.status = 'Inside'`,
  );
  res.json({
    scope: "operations",
    counts: {
      expected: await one("SELECT COUNT(*) AS n FROM visits WHERE status = 'Expected'")?.n || 0,
      pending: await one("SELECT COUNT(*) AS n FROM visits WHERE status = 'Pending Approval'")?.n || 0,
      inside: inside.length,
      deniedToday: await one("SELECT COUNT(*) AS n FROM access_decisions WHERE outcome = 'DENY' AND created_at >= ?", [
        new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
      ])?.n || 0,
      overstay: inside.filter((row) => new Date(row.scheduled_end).getTime() < Date.now()).length,
      openAlerts: await one("SELECT COUNT(*) AS n FROM alerts WHERE status = 'open'")?.n || 0,
    },
    occupancy: inside,
    byZone: await all(
      `SELECT z.name, COUNT(v.id) AS inside
       FROM zones z LEFT JOIN visits v ON v.zone_id = z.id AND v.status = 'Inside'
       GROUP BY z.id ORDER BY z.name`,
    ),
  });
});

app.get("/api/v1/audit", requireAuth, requirePerm("audit.read"), async (req, res) => {
  const clauses = [];
  const params = [];
  if (req.query.type) {
    clauses.push("event_type = ?");
    params.push(req.query.type);
  }
  if (req.query.q) {
    clauses.push("(entity_id LIKE ? OR event_type LIKE ? OR new_value LIKE ?)");
    const like = `%${req.query.q}%`;
    params.push(like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  res.json({ events: await all(`SELECT * FROM audit_events ${where} ORDER BY created_at DESC LIMIT 300`, params) });
});

app.get("/api/v1/integrations", requireAuth, requirePerm("admin.config", "reports.read"), async (_req, res) => {
  res.json({ integrations: await all("SELECT * FROM integrations ORDER BY name") });
});

app.post("/api/v1/retention/run", requireAuth, requirePerm("retention.run", "admin.config"), async (req, res, next) => {
  try {
    const days = Number(await policy("retention_days", 365));
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const old = await all("SELECT * FROM biometric_enrollments WHERE created_at < ?", [cutoff]);
    for (const row of old) {
      try {
        await fetch(`${FACE_URL}/face/templates/${row.template_ref}`, { method: "DELETE" });
      } catch {
        /* deletion audit still records the attempt */
      }
      await run("DELETE FROM biometric_enrollments WHERE id = ?", [row.id]);
    }
    await audit({
      type: "data.deletion",
      actorId: req.user.id,
      entityType: "biometric",
      entityId: "retention",
      newValue: { category: "biometric-enrollment", method: "policy-job", policyDays: days, deleted: old.length },
      correlationId: req.correlationId,
    });
    res.json({ deleted: old.length, policyDays: days });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/governance/decisions", requireAuth, requirePerm("admin.config", "audit.read"), async (_req, res) => {
  res.json({ decisions: OPEN_DECISIONS });
});

app.post("/api/v1/documents", requireAuth, async (req, res, next) => {
  try {
    const visit = await one("SELECT * FROM visits WHERE id = ?", [req.body?.visitId]);
    if (!visit) throw new HttpError(404, "NOT_FOUND", "Visit not found.");
    const allowed = req.user.role === "visitor" ? req.user.visitor_id === visit.visitor_id : hasPermission(req.user.role, "visits.walkin") || hasPermission(req.user.role, "visits.create");
    if (!allowed) throw new HttpError(403, "FORBIDDEN", "Insufficient permission.");
    const content = String(req.body?.contentBase64 || "");
    const buffer = Buffer.from(content, "base64");
    if (!buffer.length || buffer.length > 1_500_000) throw new HttpError(400, "INVALID_DOCUMENT", "Document must be present and under 1.5 MB.");
    fs.mkdirSync(DOC_DIR, { recursive: true });
    const safeName = `${visit.visitor_id}-${Date.now()}`;
    fs.writeFileSync(path.join(DOC_DIR, safeName), buffer);
    await run("UPDATE visitors SET document_type = ?, document_ref = ?, document_path = ? WHERE id = ?", [
      req.body.documentType || "ID",
      req.body.documentRef || safeName,
      safeName,
      visit.visitor_id,
    ]);
    await audit({
      type: "visitor.document",
      actorId: req.user.id,
      entityType: "visitor",
      entityId: visit.visitor_id,
      newValue: { documentType: req.body.documentType || "ID" },
      correlationId: req.correlationId,
    });
    res.json({ stored: true });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, _next) => {
  const status = error.status || 500;
  if (!error.status) console.error(req.correlationId, error);
  res.status(status).json({
    error: {
      code: error.code || "INTERNAL",
      message: status >= 500 ? "The service could not complete that request." : error.message,
      correlationId: req.correlationId,
    },
  });
});

const isMain = process.argv[1] && process.argv[1].endsWith("server.js");

if (isMain) {
  initDb()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`VMS API listening on http://127.0.0.1:${PORT}`);
      });
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}

export { app, initDb };
