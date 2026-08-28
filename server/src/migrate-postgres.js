#!/usr/bin/env node
/* SQLite -> PostgreSQL migration utility.
 * Usage: DATABASE_URL=postgres://... NAVPILOT_DB_PATH=... npm run migrate:postgres
 * The migration is idempotent and keeps numeric ids so existing links remain valid.
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const { Client } = require('pg');
const path = require('path');

const sqlitePath = process.env.NAVPILOT_DB_PATH || path.join(__dirname, '..', 'data', 'navpilot.db');
const databaseUrl = process.env.DATABASE_URL || process.env.NAVPILOT_DATABASE_URL;
if (!databaseUrl) { console.error('DATABASE_URL is required'); process.exit(2); }

function quote(value) { return '"' + String(value).replace(/"/g, '""') + '"'; }
function pgType(type) {
  const t = String(type || '').toUpperCase();
  if (t.includes('INT')) return 'BIGINT';
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'DOUBLE PRECISION';
  if (t.includes('BLOB')) return 'BYTEA';
  return 'TEXT';
}

async function migrate() {
  const sqlite = new Database(sqlitePath, { readonly: true });
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
    await client.query('BEGIN');
    await client.query('SET session_replication_role = replica');
    for (const table of tables) {
      const columns = sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all();
      if (!columns.length) continue;
      const primary = columns.filter(c => c.pk).sort((a,b) => a.pk - b.pk).map(c => quote(c.name));
      const defs = columns.map(c => `${quote(c.name)} ${pgType(c.type)}`);
      if (primary.length === 1) defs[columns.findIndex(c => c.pk)] += ' PRIMARY KEY';
      if (primary.length > 1) defs.push(`PRIMARY KEY (${primary.join(',')})`);
      await client.query(`CREATE TABLE IF NOT EXISTS ${quote(table)} (${defs.join(',')})`);
      const rows = sqlite.prepare(`SELECT * FROM ${quote(table)}`).all();
      if (!rows.length) continue;
      const names = columns.map(c => c.name);
      const chunkSize = 200;
      for (let offset = 0; offset < rows.length; offset += chunkSize) {
        const chunk = rows.slice(offset, offset + chunkSize);
        const values = []; const tuples = [];
        chunk.forEach(row => {
          const tuple = names.map(name => { values.push(row[name]); return `$${values.length}`; });
          tuples.push(`(${tuple.join(',')})`);
        });
        await client.query(`INSERT INTO ${quote(table)} (${names.map(quote).join(',')}) VALUES ${tuples.join(',')} ON CONFLICT DO NOTHING`, values);
      }
      const indexes = sqlite.prepare(`PRAGMA index_list(${quote(table)})`).all().filter(i => i.unique && !String(i.name).startsWith('sqlite_autoindex'));
      for (const index of indexes) {
        const info = sqlite.prepare(`PRAGMA index_info(${quote(index.name)})`).all().sort((a,b) => a.seqno - b.seqno);
        // Expression and partial indexes need schema-specific translation;
        // never turn a NULL expression name into a fictitious "null" column.
        if (!info.length || info.some(c => !c.name) || index.partial) continue;
        const indexColumns = info.map(c => quote(c.name));
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${quote(index.name)} ON ${quote(table)} (${indexColumns.join(',')})`);
      }
      const idColumn = columns.find(c => c.pk && /^(id|.*_id)$/.test(c.name));
      if (idColumn && pgType(idColumn.type) === 'BIGINT') {
        const seq = `${table}_${idColumn.name}_seq`;
        await client.query(`CREATE SEQUENCE IF NOT EXISTS ${quote(seq)}`);
        await client.query(`SELECT setval($1, COALESCE((SELECT MAX(${quote(idColumn.name)}) FROM ${quote(table)}), 0) + 1, false)`, [seq]);
        await client.query(`ALTER TABLE ${quote(table)} ALTER COLUMN ${quote(idColumn.name)} SET DEFAULT nextval('${seq}')`);
      }
      console.log(`[migrate] ${table}: ${rows.length} rows`);
    }
    await client.query('SET session_replication_role = DEFAULT');
    await client.query('COMMIT');
    console.log(`[migrate] completed ${tables.length} tables`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { sqlite.close(); await client.end(); }
}

migrate().catch(error => { console.error('[migrate] failed:', error.message); process.exit(1); });
