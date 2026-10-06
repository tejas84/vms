import { AsyncLocalStorage } from "node:async_hooks";
import mysql from "mysql2/promise";
import { loadEnv } from "./env.js";

loadEnv();

const txStorage = new AsyncLocalStorage();
let pool;

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} in .env before starting the API. See .env.example.`);
  }
  return value;
}

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 3306),
      user: required("DB_USER"),
      password: process.env.DB_PASSWORD ?? "",
      database: process.env.DB_NAME || "vms",
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: false,
      timezone: "Z",
      supportBigNumbers: true,
      bigNumberStrings: false,
    });
  }
  return pool;
}

function executor() {
  return txStorage.getStore() || getPool();
}

export async function run(sql, params = []) {
  await executor().query(sql, params);
}

export async function all(sql, params = []) {
  const [rows] = await executor().query(sql, params);
  return rows;
}

export async function one(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0] || null;
}

export async function transaction(fn) {
  if (txStorage.getStore()) return fn();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await txStorage.run(connection, fn);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function policy(key, fallback) {
  const row = await one("SELECT value FROM policies WHERE policy_key = ?", [key]);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

async function columnExists(table, column) {
  const rows = await all(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows.length > 0;
}

export async function applyMigrations() {
  await getPool().query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(80) PRIMARY KEY,
      applied_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB`,
  );
  const applied = await one("SELECT id FROM schema_migrations WHERE id = ?", ["001_rbac_and_security"]);
  if (applied) return;

  await getPool().query(
    `CREATE TABLE IF NOT EXISTS roles (
      code VARCHAR(40) PRIMARY KEY,
      label VARCHAR(80) NOT NULL
    ) ENGINE=InnoDB`,
  );
  await getPool().query(
    `CREATE TABLE IF NOT EXISTS permissions (
      code VARCHAR(80) PRIMARY KEY,
      description VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB`,
  );
  await getPool().query(
    `CREATE TABLE IF NOT EXISTS role_permissions (
      role_code VARCHAR(40) NOT NULL,
      permission_code VARCHAR(80) NOT NULL,
      PRIMARY KEY (role_code, permission_code),
      CONSTRAINT fk_rp_role FOREIGN KEY (role_code) REFERENCES roles(code),
      CONSTRAINT fk_rp_perm FOREIGN KEY (permission_code) REFERENCES permissions(code)
    ) ENGINE=InnoDB`,
  );
  await getPool().query(
    `CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NULL,
      expires_at VARCHAR(40) NOT NULL,
      revoked_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB`,
  );
  await getPool().query(
    `CREATE TABLE IF NOT EXISTS login_attempts (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      KEY idx_login_email (email, created_at)
    ) ENGINE=InnoDB`,
  );
  await getPool().query(
    `CREATE TABLE IF NOT EXISTS visitor_categories (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at VARCHAR(40) NOT NULL,
      UNIQUE KEY uq_category_name (name)
    ) ENGINE=InnoDB`,
  );
  if (!(await columnExists("audit_events", "ip_address"))) {
    await run("ALTER TABLE audit_events ADD COLUMN ip_address VARCHAR(64) NULL");
  }
  if (!(await columnExists("audit_events", "user_agent"))) {
    await run("ALTER TABLE audit_events ADD COLUMN user_agent VARCHAR(255) NULL");
  }

  const { ROLE_LABELS, ROLE_PERMISSIONS } = await import("./domain.js");
  for (const [code, label] of Object.entries(ROLE_LABELS)) {
    await run("INSERT IGNORE INTO roles (code, label) VALUES (?, ?)", [code, label]);
  }
  const codes = new Set(["*", "admin.config"]);
  for (const list of Object.values(ROLE_PERMISSIONS)) {
    for (const code of list) codes.add(code);
  }
  for (const code of codes) {
    await run("INSERT IGNORE INTO permissions (code, description) VALUES (?, ?)", [code, code]);
  }
  for (const [role, list] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permission of list) {
      await run("INSERT IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)", [role, permission]);
    }
  }
  await run("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)", [
    "001_rbac_and_security",
    new Date().toISOString(),
  ]);
}

export async function initDb() {
  await getPool().query("SELECT 1");
  const tables = await all("SHOW TABLES LIKE 'users'");
  if (!tables.length) {
    throw new Error(
      "Connected to MySQL, but the VMS tables are missing. Create the database, then run backend/sql/schema.sql.",
    );
  }
  await applyMigrations();
}

export function dbFile() {
  return `${process.env.DB_HOST || "127.0.0.1"}/${process.env.DB_NAME || "vms"}`;
}
