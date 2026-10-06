/**
 * Pure business rules from the VMS SDD:
 * visit state machine (section 6) and gate access decision (section 8).
 * Face recognition is one input. It never authorizes entry by itself.
 */

export const STATES = [
  "Draft",
  "Pending Approval",
  "Approved",
  "Expected",
  "Waiting at Reception",
  "Checked-In",
  "Inside",
  "On Hold",
  "Checked-Out",
  "Expired",
  "Cancelled",
];

export const TRANSITIONS = {
  Draft: ["Pending Approval", "Approved", "Cancelled"],
  "Pending Approval": ["Approved", "Cancelled", "On Hold"],
  Approved: ["Expected", "Cancelled"],
  Expected: ["Waiting at Reception", "Checked-In", "Expired", "Cancelled", "On Hold"],
  "Waiting at Reception": ["Checked-In", "On Hold", "Cancelled", "Expired"],
  "Checked-In": ["Inside", "Checked-Out"],
  Inside: ["Checked-Out", "On Hold"],
  "On Hold": ["Pending Approval", "Expected", "Cancelled"],
  "Checked-Out": [],
  Expired: ["Expected", "Cancelled"],
  Cancelled: [],
};

export const ENTRY_STATES = ["Approved", "Expected", "Waiting at Reception"];

export const ACTIVE_STATUSES = [
  "Draft",
  "Pending Approval",
  "Approved",
  "Expected",
  "Waiting at Reception",
  "Checked-In",
  "Inside",
  "On Hold",
];

export const ROLE_PERMISSIONS = {
  visitor: ["invitation.complete", "visits.read.own", "dashboard.read"],
  host: ["visits.create", "visits.read.own", "visits.cancel.own", "dashboard.read"],
  approver: ["approvals.decide", "visits.read", "dashboard.read", "reports.read"],
  reception: [
    "visits.read",
    "visits.walkin",
    "gate.validate",
    "gate.checkin",
    "gate.checkout",
    "badges.issue",
    "dashboard.read",
    "reports.read",
  ],
  security: [
    "visits.read",
    "gate.validate",
    "gate.checkin",
    "gate.checkout",
    "gate.override",
    "alerts.read",
    "dashboard.read",
    "reports.read",
  ],
  security_admin: [
    "visits.read",
    "watchlist.admin",
    "alerts.review",
    "alerts.read",
    "audit.read",
    "gate.override",
    "retention.run",
    "dashboard.read",
    "reports.read",
  ],
  system_admin: ["*"],
  auditor: ["audit.read", "reports.read", "dashboard.read", "visits.read"],
};

export const ROLE_LABELS = {
  visitor: "Visitor",
  host: "Host / Employee",
  reception: "Reception",
  security: "Security / Gate Officer",
  approver: "Approver",
  security_admin: "Security Administrator",
  system_admin: "System Administrator",
  auditor: "Management / Auditor",
};

let permissionSource = null;

/** Optional database-backed role map. Return null to use the in-code catalog. */
export function usePermissionSource(source) {
  permissionSource = source;
}

export function hasPermission(role, permission) {
  const fromSource = permissionSource ? permissionSource(role) : null;
  const list = fromSource?.length ? fromSource : ROLE_PERMISSIONS[role] || [];
  return list.includes("*") || list.includes(permission);
}

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

export function decideAccess({
  visit,
  badgeActive,
  now,
  toleranceMinutes,
  faceRequired,
  livenessRequired,
  consentRequired,
  documentRequired,
  consentPresent,
  documentPresent,
  enrollmentPresent,
  face,
  watchlistHit,
  occupancy,
  capacity,
}) {
  const reasons = [];

  if (!visit) {
    reasons.push(deny("VISIT_NOT_FOUND", "No visit matches this pass."));
    return outcome(reasons);
  }

  if (visit.status === "On Hold") {
    reasons.push(hold("STATUS_ON_HOLD", "This visit is on hold pending security or approval action."));
  } else if (visit.status === "Pending Approval") {
    reasons.push(approval("APPROVAL_PENDING", "This visit is still waiting for approval."));
  } else if (visit.status === "Draft") {
    reasons.push(deny("NOT_SUBMITTED", "This visit has not been submitted."));
  } else if (visit.status === "Checked-In" || visit.status === "Inside") {
    reasons.push(deny("DUPLICATE_ENTRY", "This visitor is already checked in."));
  } else if (visit.status === "Checked-Out") {
    reasons.push(deny("ALREADY_CLOSED", "This visit is already closed."));
  } else if (visit.status === "Cancelled") {
    reasons.push(deny("CANCELLED", "This visit was cancelled."));
  } else if (visit.status === "Expired") {
    reasons.push(deny("EXPIRED", "This visit has expired. An authorized user can extend it."));
  } else if (!ENTRY_STATES.includes(visit.status)) {
    reasons.push(deny("STATUS_NOT_AUTHORIZED", "This visit status does not allow entry."));
  }

  const start = new Date(visit.scheduledStart).getTime();
  const end = new Date(visit.scheduledEnd).getTime();
  const tolerance = (toleranceMinutes ?? 30) * 60 * 1000;
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (Number.isFinite(start) && Number.isFinite(end) && (t < start - tolerance || t > end + tolerance)) {
    reasons.push(deny("OUTSIDE_WINDOW", "The current time is outside the approved visit window."));
  }

  if (!badgeActive) {
    reasons.push(deny("QR_INVALID", "The pass is missing, expired, or no longer active."));
  }

  if (watchlistHit) {
    reasons.push(hold("WATCHLIST_REVIEW", "A watchlist rule requires security review before entry."));
  }

  if (consentRequired && !consentPresent) {
    reasons.push(deny("CONSENT_MISSING", "Required consent has not been recorded."));
  }
  if (documentRequired && !documentPresent) {
    reasons.push(deny("DOCUMENT_MISSING", "A required identity document is missing."));
  }

  if (faceRequired) {
    if (!enrollmentPresent) {
      reasons.push(deny("ENROLLMENT_MISSING", "No face enrollment is on file for this visitor."));
    }
    if (!face) {
      reasons.push(deny("FACE_NOT_PROVIDED", "A face capture is required for this gate."));
    } else if (face.available === false) {
      reasons.push(hold("FACE_SERVICE_UNAVAILABLE", "The face service is unavailable. Use the controlled manual path."));
    } else {
      if (!face.qualityPassed) {
        reasons.push(deny(face.reason === "NO_FACE" ? "FACE_NOT_DETECTED" : "POOR_QUALITY", "The capture could not be used for verification."));
      } else if (livenessRequired && !face.livenessPassed) {
        reasons.push(deny("LIVENESS_FAILURE", "Liveness did not pass. Retry or use alternate verification."));
      } else if (!face.match) {
        reasons.push(deny("FACE_MISMATCH", "The face does not match the enrolled visitor."));
      }
    }
  }

  if (Number.isFinite(capacity) && capacity > 0 && occupancy >= capacity) {
    reasons.push(hold("CAPACITY", "The site is at its configured occupancy limit."));
  }

  return outcome(reasons);
}

function deny(code, message) {
  return { code, message, severity: "deny" };
}
function hold(code, message) {
  return { code, message, severity: "hold" };
}
function approval(code, message) {
  return { code, message, severity: "approval" };
}

function outcome(reasons) {
  let decision = "ALLOW";
  if (reasons.some((r) => r.severity === "deny")) decision = "DENY";
  else if (reasons.some((r) => r.severity === "hold")) decision = "HOLD";
  else if (reasons.some((r) => r.severity === "approval")) decision = "ADDITIONAL_APPROVAL";
  return { decision, reasons };
}

export const OPEN_DECISIONS = [
  {
    id: "OD-01",
    topic: "Technology stack",
    why: "Locks the engineering platform and tooling.",
    status: "Proposed",
    note: "This repository uses Node.js/Express, React/Vite, MySQL, and a separate face-service HTTP boundary. Architecture sign-off is still required.",
  },
  {
    id: "OD-02",
    topic: "Deployment architecture and security zones",
    why: "Defines network boundaries and production topology.",
    status: "Open",
    note: "Confirm during architecture sign-off. Face service is bound to localhost in this baseline.",
  },
  {
    id: "OD-03",
    topic: "Physical ERD",
    why: "Enables stable migrations.",
    status: "Baseline",
    note: "Logical domains from the SDD are implemented. Cardinality sign-off is still required.",
  },
  {
    id: "OD-04",
    topic: "Face model, vendor, and threshold",
    why: "The supplied plan does not fix the model or threshold.",
    status: "PoC",
    note: "This build ships a PoC face service: detection, quality, a two-frame liveness stand-in, and 1:1 comparison. Replace it before production.",
  },
  {
    id: "OD-05",
    topic: "Device and API availability",
    why: "Determines how long mocks remain in the integration layer.",
    status: "Open",
    note: "Email, SMS, barrier, CCTV, HR, and BI adapters record outbox or health stubs until real contracts exist.",
  },
  {
    id: "OD-06",
    topic: "Privacy retention periods",
    why: "Controls biometric storage and deletion.",
    status: "Open",
    note: "Retention days are configurable. Legal/privacy sign-off is still required.",
  },
  {
    id: "OD-07",
    topic: "SLA, RPO, RTO, and load targets",
    why: "Enables performance and availability acceptance.",
    status: "Open",
    note: "Infrastructure numbers in the SDD remain planning baselines.",
  },
];
