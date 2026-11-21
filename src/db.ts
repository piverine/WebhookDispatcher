import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

const { Pool } = pg;

function shouldUseSsl(connectionString: string): boolean {
  if (!connectionString) return false;
  const isLocal =
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1");
  return !isLocal;
}

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: shouldUseSsl(config.databaseUrl) ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export async function checkDbHealth(): Promise<boolean> {
  try {
    const res = await pool.query("SELECT 1");
    return res.rowCount !== null && res.rowCount > 0;
  } catch {
    return false;
  }
}

export async function runMigrations(logger?: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void }) {
  const migrationsDir = path.join(process.cwd(), "migrations");
  try {
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();

    for (const file of sqlFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, "utf-8");
      await pool.query(sql);
      logger?.info(`Applied migration: ${file}`);
    }
  } catch (err) {
    logger?.error("Failed to run migrations", err);
    throw err;
  }
}

