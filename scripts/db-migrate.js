#!/usr/bin/env node

/**
 * Database Migration Runner
 * Applies SQL migrations from db/migrations directory in sequence
 * Usage: node scripts/db-migrate.js [--reset]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "pg";
const { Client } = pkg;

// Load .env file if available
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable not set");
  process.exit(1);
}

const migrationsDir = path.join(__dirname, "..", "db", "migrations");

async function runMigration(client, migrationFile) {
  const migrationPath = path.join(migrationsDir, migrationFile);
  let sql = fs.readFileSync(migrationPath, "utf-8");

  console.log(`\n🔄 Running migration: ${migrationFile}`);
  try {
    // Remove comment-only lines and leading/trailing whitespace
    const lines = sql
      .split("\n")
      .map((line) => {
        // Remove inline comments
        const commentIdx = line.indexOf("--");
        return commentIdx >= 0 ? line.substring(0, commentIdx) : line;
      })
      .join("\n");

    // Split by semicolons and execute each statement
    const statements = lines
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("--"));

    for (const statement of statements) {
      await client.query(statement);
    }

    console.log(`✅ Completed: ${migrationFile}`);
    return true;
  } catch (error) {
    console.error(`❌ Migration failed: ${migrationFile}`);
    console.error(`   Error: ${error.message}`);
    throw error;
  }
}

async function resetDatabase(client) {
  console.log("\n⚠️  RESET MODE: Dropping all tables...");
  try {
    // Drop all tables in correct order due to foreign keys
    const tables = [
      "spr_restricted_tokens",
      "spr_audit_logs",
      "spr_passports",
      "spr_signals",
      "spr_evidence",
      "spr_software",
      "spr_vendors",
      "passports",
      "evidence_items",
      "scan_findings",
      "scan_runs",
      "assets",
      "workspace_members",
      "workspaces",
      "sessions",
      "users",
    ];

    for (const table of tables) {
      try {
        await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        console.log(`  Dropped: ${table}`);
      } catch (error) {
        // Table might not exist, ignore
      }
    }
    console.log("✅ All tables dropped");
  } catch (error) {
    console.error("❌ Reset failed:", error.message);
    throw error;
  }
}

async function main() {
  const shouldReset = process.argv.includes("--reset");

  if (!fs.existsSync(migrationsDir)) {
    console.error(`ERROR: Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log("✅ Connected to PostgreSQL");

    if (shouldReset) {
      await resetDatabase(client);
    }

    // Get all migration files in order
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      console.log("ℹ️  No migration files found");
      process.exit(0);
    }

    console.log(`Found ${files.length} migration(s):`);
    files.forEach((f) => console.log(`  - ${f}`));

    for (const file of files) {
      await runMigration(client, file);
    }

    console.log("\n✅ All migrations completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration process failed:", error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
