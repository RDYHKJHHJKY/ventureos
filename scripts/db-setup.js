#!/usr/bin/env node
/**
 * VentureOS Database Setup Script
 * Initialize PostgreSQL database and run migrations
 * Usage: node scripts/db-setup.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '../db/schema.sql');

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('📦 Reading schema file...');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    console.log('🚀 Running database migration...');
    await client.query(schema);

    console.log('✅ Database migration completed successfully!');
    console.log('');
    console.log('📊 Created tables:');
    console.log('  • users');
    console.log('  • workspaces');
    console.log('  • workspace_members');
    console.log('  • sessions');
    console.log('  • assets');
    console.log('  • scan_runs');
    console.log('  • findings');
    console.log('  • passports');
    console.log('  • projects');
    console.log('  • artifacts');
    console.log('  • signals');
    console.log('  • msps');
    console.log('  • msp_members');
    console.log('  • msp_workspaces');
    console.log('  • billing_events');
    console.log('  • events');
    console.log('  • webhooks');
    console.log('  • webhook_deliveries');
    console.log('  • jobs');
    console.log('  • audit_logs');
    console.log('');
    console.log('🎉 Database is ready to use!');
  } catch (error) {
    console.error('❌ Database migration failed:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Ensure PostgreSQL is running');
    console.error('2. Check DATABASE_URL in .env file');
    console.error('3. Verify database user has CREATE TABLE permissions');
    console.error('4. Try connecting directly: psql $DATABASE_URL');
    process.exit(1);
  } finally {
    client.release();
  }
}

async function checkConnection() {
  try {
    console.log('🔍 Checking database connection...');
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Connected to database');
    return true;
  } catch (error) {
    console.error('❌ Cannot connect to database:', error.message);
    console.error('');
    console.error('Set DATABASE_URL environment variable:');
    console.error('  export DATABASE_URL=postgresql://user:password@localhost:5432/ventureos');
    return false;
  }
}

async function main() {
  console.log('🌟 VentureOS Database Setup');
  console.log('=============================');
  console.log('');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable not set');
    console.error('');
    console.error('Create a .env file with:');
    console.error('  DATABASE_URL=postgresql://user:password@localhost:5432/ventureos');
    process.exit(1);
  }

  const connected = await checkConnection();
  if (!connected) {
    process.exit(1);
  }

  console.log('');
  await runMigration();
  await pool.end();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
