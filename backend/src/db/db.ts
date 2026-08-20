import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

let dbInstance: Database.Database | null = null;

/**
 * Returns a singleton better-sqlite3 connection, running the schema
 * migration on first access. better-sqlite3 is synchronous, which keeps
 * the DB layer simple for this assessment; a Postgres swap would replace
 * this module with a pg.Pool + a migration tool (e.g. node-pg-migrate)
 * behind the same query functions used elsewhere in the app.
 */
export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbInstance = new Database(config.dbPath);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("foreign_keys = ON");

  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  dbInstance.exec(schema);

  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
