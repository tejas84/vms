-- Visitor Management System schema for MySQL 8.
-- Create the database yourself, then run this script inside it:
--   CREATE DATABASE vms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   USE vms;
--   SOURCE schema.sql;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS sites (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  city VARCHAR(120) NULL,
  max_occupancy INT NOT NULL DEFAULT 200,
  created_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS buildings (
  id VARCHAR(64) PRIMARY KEY,
  site_id VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  CONSTRAINT fk_buildings_site FOREIGN KEY (site_id) REFERENCES sites(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS departments (
  id VARCHAR(64) PRIMARY KEY,
  site_id VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  CONSTRAINT fk_departments_site FOREIGN KEY (site_id) REFERENCES sites(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS gates (
  id VARCHAR(64) PRIMARY KEY,
  site_id VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  kind VARCHAR(40) NOT NULL,
  CONSTRAINT fk_gates_site FOREIGN KEY (site_id) REFERENCES sites(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS zones (
  id VARCHAR(64) PRIMARY KEY,
  site_id VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  approval_required TINYINT(1) NOT NULL DEFAULT 0,
  face_required TINYINT(1) NOT NULL DEFAULT 1,
  active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_zones_site FOREIGN KEY (site_id) REFERENCES sites(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(160) NOT NULL,
  role VARCHAR(40) NOT NULL,
  site_id VARCHAR(64) NULL,
  visitor_id VARCHAR(64) NULL,
  mfa_required TINYINT(1) NOT NULL DEFAULT 0,
  totp_secret VARCHAR(128) NULL,
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT fk_users_site FOREIGN KEY (site_id) REFERENCES sites(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS visitors (
  id VARCHAR(64) PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(40) NULL,
  organization VARCHAR(160) NULL,
  document_type VARCHAR(40) NULL,
  document_ref VARCHAR(80) NULL,
  document_path VARCHAR(255) NULL,
  consent_at VARCHAR(40) NULL,
  consent_version VARCHAR(80) NULL,
  created_at VARCHAR(40) NOT NULL,
  KEY idx_visitors_email (email),
  KEY idx_visitors_name (full_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS visits (
  id VARCHAR(64) PRIMARY KEY,
  visitor_id VARCHAR(64) NOT NULL,
  host_id VARCHAR(64) NOT NULL,
  site_id VARCHAR(64) NOT NULL,
  zone_id VARCHAR(64) NOT NULL,
  purpose VARCHAR(255) NOT NULL,
  scheduled_start VARCHAR(40) NOT NULL,
  scheduled_end VARCHAR(40) NOT NULL,
  status VARCHAR(40) NOT NULL,
  at_reception TINYINT(1) NOT NULL DEFAULT 0,
  recurrence_group VARCHAR(64) NULL,
  created_by VARCHAR(64) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  KEY idx_visits_status (status, scheduled_start),
  KEY idx_visits_visitor (visitor_id),
  CONSTRAINT fk_visits_visitor FOREIGN KEY (visitor_id) REFERENCES visitors(id),
  CONSTRAINT fk_visits_host FOREIGN KEY (host_id) REFERENCES users(id),
  CONSTRAINT fk_visits_site FOREIGN KEY (site_id) REFERENCES sites(id),
  CONSTRAINT fk_visits_zone FOREIGN KEY (zone_id) REFERENCES zones(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS visit_status_history (
  id VARCHAR(64) PRIMARY KEY,
  visit_id VARCHAR(64) NOT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NOT NULL,
  actor_id VARCHAR(64) NULL,
  note VARCHAR(500) NULL,
  created_at VARCHAR(40) NOT NULL,
  KEY idx_history_visit (visit_id),
  CONSTRAINT fk_history_visit FOREIGN KEY (visit_id) REFERENCES visits(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS approvals (
  id VARCHAR(64) PRIMARY KEY,
  visit_id VARCHAR(64) NOT NULL,
  step INT NOT NULL,
  approver_role VARCHAR(40) NOT NULL,
  approver_id VARCHAR(64) NULL,
  decision VARCHAR(40) NULL,
  remarks VARCHAR(500) NULL,
  decided_at VARCHAR(40) NULL,
  KEY idx_approvals_visit (visit_id),
  CONSTRAINT fk_approvals_visit FOREIGN KEY (visit_id) REFERENCES visits(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS biometric_enrollments (
  id VARCHAR(64) PRIMARY KEY,
  visitor_id VARCHAR(64) NOT NULL,
  template_ref VARCHAR(64) NOT NULL,
  quality_score DOUBLE NULL,
  liveness_passed TINYINT(1) NULL,
  consent_ref VARCHAR(80) NULL,
  channel VARCHAR(40) NULL,
  policy_version VARCHAR(40) NULL,
  created_at VARCHAR(40) NOT NULL,
  KEY idx_bio_visitor (visitor_id, created_at),
  CONSTRAINT fk_bio_visitor FOREIGN KEY (visitor_id) REFERENCES visitors(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS badges (
  id VARCHAR(64) PRIMARY KEY,
  visit_id VARCHAR(64) NOT NULL,
  code VARCHAR(32) NOT NULL,
  status VARCHAR(20) NOT NULL,
  zone_id VARCHAR(64) NULL,
  issued_at VARCHAR(40) NOT NULL,
  expires_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uq_badges_code (code),
  KEY idx_badges_visit (visit_id, status),
  CONSTRAINT fk_badges_visit FOREIGN KEY (visit_id) REFERENCES visits(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS access_decisions (
  id VARCHAR(64) PRIMARY KEY,
  visit_id VARCHAR(64) NULL,
  gate_id VARCHAR(64) NULL,
  outcome VARCHAR(40) NOT NULL,
  reasons TEXT NOT NULL,
  face_metadata TEXT NULL,
  correlation_id VARCHAR(64) NULL,
  actor_id VARCHAR(64) NULL,
  created_at VARCHAR(40) NOT NULL,
  KEY idx_decisions_visit (visit_id),
  KEY idx_decisions_time (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS gate_transactions (
  id VARCHAR(64) PRIMARY KEY,
  visit_id VARCHAR(64) NOT NULL,
  gate_id VARCHAR(64) NULL,
  direction VARCHAR(20) NOT NULL,
  decision VARCHAR(20) NOT NULL,
  method VARCHAR(40) NOT NULL,
  reason VARCHAR(255) NULL,
  decision_id VARCHAR(64) NULL,
  actor_id VARCHAR(64) NULL,
  correlation_id VARCHAR(64) NULL,
  idempotency_key VARCHAR(80) NULL,
  created_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uq_gate_idempotency (idempotency_key),
  CONSTRAINT fk_gate_visit FOREIGN KEY (visit_id) REFERENCES visits(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS watchlist (
  id VARCHAR(64) PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  document_ref VARCHAR(80) NULL,
  reason VARCHAR(500) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(64) NULL,
  created_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS watchlist_clearances (
  id VARCHAR(64) PRIMARY KEY,
  watchlist_id VARCHAR(64) NOT NULL,
  visitor_id VARCHAR(64) NOT NULL,
  reason VARCHAR(500) NULL,
  actor_id VARCHAR(64) NULL,
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_clearance_watch FOREIGN KEY (watchlist_id) REFERENCES watchlist(id),
  CONSTRAINT fk_clearance_visitor FOREIGN KEY (visitor_id) REFERENCES visitors(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS alerts (
  id VARCHAR(64) PRIMARY KEY,
  watchlist_id VARCHAR(64) NULL,
  visit_id VARCHAR(64) NULL,
  gate_id VARCHAR(64) NULL,
  status VARCHAR(20) NOT NULL,
  disposition VARCHAR(500) NULL,
  reviewed_by VARCHAR(64) NULL,
  reviewed_at VARCHAR(40) NULL,
  created_at VARCHAR(40) NOT NULL,
  KEY idx_alerts_status (status, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  visit_id VARCHAR(64) NULL,
  template VARCHAR(40) NOT NULL,
  recipient VARCHAR(255) NULL,
  channel VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  message TEXT NULL,
  created_at VARCHAR(40) NOT NULL,
  KEY idx_notifications_recipient (recipient, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_events (
  id VARCHAR(64) PRIMARY KEY,
  event_type VARCHAR(80) NOT NULL,
  actor_id VARCHAR(64) NULL,
  entity_type VARCHAR(40) NULL,
  entity_id VARCHAR(64) NULL,
  checkpoint VARCHAR(64) NULL,
  device VARCHAR(80) NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  correlation_id VARCHAR(64) NULL,
  created_at VARCHAR(40) NOT NULL,
  KEY idx_audit_time (created_at, event_type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS policies (
  policy_key VARCHAR(80) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS integrations (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  kind VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  detail VARCHAR(500) NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  `key` VARCHAR(80) PRIMARY KEY,
  response TEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB;

INSERT INTO policies (policy_key, value, updated_at) VALUES
  ('time_tolerance_minutes', '30', UTC_TIMESTAMP()),
  ('require_consent', 'true', UTC_TIMESTAMP()),
  ('require_document', 'true', UTC_TIMESTAMP()),
  ('liveness_enabled', 'true', UTC_TIMESTAMP()),
  ('face_required', 'true', UTC_TIMESTAMP()),
  ('retention_days', '365', UTC_TIMESTAMP()),
  ('consent_version', '"privacy-notice-1.0"', UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE policy_key = policy_key;

INSERT INTO integrations (id, name, kind, status, detail) VALUES
  ('sso', 'Enterprise SSO', 'sso', 'stub', 'OIDC/SAML adapter is present. Issuer is not configured.'),
  ('email', 'Email', 'notification', 'stub', 'Messages are written to the notification log.'),
  ('sms', 'SMS', 'notification', 'stub', 'Messages are written to the notification log.'),
  ('barrier', 'Barrier / turnstile', 'access', 'stub', 'Access adapter records the command. No hardware is attached.'),
  ('camera', 'Camera / kiosk', 'device', 'stub', 'Browser capture is the approved channel in this baseline.'),
  ('printer', 'Badge printer', 'device', 'stub', 'Badge printing uses the browser print path.'),
  ('cctv', 'CCTV', 'enterprise', 'stub', 'Not connected.'),
  ('hr', 'HR', 'enterprise', 'stub', 'Not connected.'),
  ('bi', 'BI', 'enterprise', 'stub', 'Not connected.')
ON DUPLICATE KEY UPDATE id = id;
