import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../sql/schema.sql");
const sql = fs.readFileSync(schemaPath, "utf8");

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD ?? "root",
  database: process.env.DB_NAME || "vms",
  multipleStatements: true,
});

await connection.query(sql);
const [rows] = await connection.query("SHOW TABLES");
console.log(rows.map((row) => Object.values(row)[0]).join("\n"));
await connection.end();
