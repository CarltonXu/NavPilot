#!/usr/bin/env node
/* SQLite -> PostgreSQL migration utility.
 * Usage: DATABASE_URL=postgres://... NAVPILOT_DB_PATH=... npm run migrate:postgres
 * The migration is idempotent and keeps numeric ids so existing links remain valid.
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const { Client } = require('pg');
const path = require('path');
const crypto = require('crypto');

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
function pgDefault(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (/^\(?datetime\('now'\)\)?$/i.test(text)) return "to_char((now() at time zone 'UTC'),'YYYY-MM-DD HH24:MI:SS')";
  return text;
}
function indexName(table, columns) {
  const base = `uq_${table}_${columns.join('_')}`.replace(/[^a-zA-Z0-9_]/g,'_');
  return base.length <= 60 ? base : `${base.slice(0,51)}_${crypto.createHash('sha1').update(base).digest('hex').slice(0,8)}`;
}
function constraintName(prefix, table, suffix) {
  const base = `${prefix}_${table}_${suffix}`.replace(/[^a-zA-Z0-9_]/g,'_');
  return base.length <= 60 ? base : `${base.slice(0,51)}_${crypto.createHash('sha1').update(base).digest('hex').slice(0,8)}`;
}

async function migrate() {
  const sqlite = new Database(sqlitePath, { readonly: true });
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
    if (String(process.env.MIGRATION_RESET_TARGET || 'false') === 'true') {
      await client.query('DROP SCHEMA public CASCADE');
      await client.query('CREATE SCHEMA public');
      console.log('[migrate] target public schema reset');
    }
    await client.query('BEGIN');
    await client.query('SET session_replication_role = replica');
    for (const table of tables) {
      const columns = sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all();
      if (!columns.length) continue;
      const primary = columns.filter(c => c.pk).sort((a,b) => a.pk - b.pk).map(c => quote(c.name));
      const defs = columns.map(c => `${quote(c.name)} ${pgType(c.type)}${pgDefault(c.dflt_value) == null ? '' : ` DEFAULT ${pgDefault(c.dflt_value)}`}`);
      if (primary.length === 1) defs[columns.findIndex(c => c.pk)] += ' PRIMARY KEY';
      if (primary.length > 1) defs.push(`PRIMARY KEY (${primary.join(',')})`);
      await client.query(`CREATE TABLE IF NOT EXISTS ${quote(table)} (${defs.join(',')})`);
      for (const column of columns) {
        const fallback = pgDefault(column.dflt_value);
        if (fallback != null) await client.query(`ALTER TABLE ${quote(table)} ALTER COLUMN ${quote(column.name)} SET DEFAULT ${fallback}`);
      }
      const rows = sqlite.prepare(`SELECT * FROM ${quote(table)}`).all();
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
      const indexes = sqlite.prepare(`PRAGMA index_list(${quote(table)})`).all().filter(i => i.unique);
      for (const index of indexes) {
        const info = sqlite.prepare(`PRAGMA index_info(${quote(index.name)})`).all().sort((a,b) => a.seqno - b.seqno);
        // Expression and partial indexes need schema-specific translation;
        // never turn a NULL expression name into a fictitious "null" column.
        if (!info.length || info.some(c => !c.name) || index.partial) continue;
        const names = info.map(c => c.name);
        const indexColumns = names.map(quote);
        const targetName = String(index.name).startsWith('sqlite_autoindex') ? indexName(table,names) : index.name;
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${quote(targetName)} ON ${quote(table)} (${indexColumns.join(',')})`);
      }
      for (const column of columns.filter(c => c.notnull)) await client.query(`ALTER TABLE ${quote(table)} ALTER COLUMN ${quote(column.name)} SET NOT NULL`);
      const primaryColumns = columns.filter(c => c.pk);
      const idColumn = primaryColumns.length === 1 && primaryColumns[0].name === 'id' ? primaryColumns[0] : null;
      if (idColumn && pgType(idColumn.type) === 'BIGINT') {
        const seq = `${table}_${idColumn.name}_seq`;
        await client.query(`CREATE SEQUENCE IF NOT EXISTS ${quote(seq)}`);
        await client.query(`SELECT setval($1, COALESCE((SELECT MAX(${quote(idColumn.name)}) FROM ${quote(table)}), 0) + 1, false)`, [seq]);
        await client.query(`ALTER TABLE ${quote(table)} ALTER COLUMN ${quote(idColumn.name)} SET DEFAULT nextval('${seq}')`);
      }
      console.log(`[migrate] ${table}: ${rows.length} rows`);
    }
    for (const table of tables) {
      const foreignKeys = sqlite.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all();
      const groups = new Map();
      for (const row of foreignKeys) {
        const group = groups.get(row.id) || { target:row.table,onDelete:row.on_delete,onUpdate:row.on_update,from:[],to:[] };
        group.from[row.seq] = row.from; group.to[row.seq] = row.to; groups.set(row.id,group);
      }
      for (const [id,foreign] of groups) {
        const name = constraintName('fk',table,id);
        const exists = await client.query('SELECT 1 FROM pg_constraint WHERE conname=$1',[name]);
        if (exists.rowCount) continue;
        const action = value => ['CASCADE','RESTRICT','SET NULL','SET DEFAULT','NO ACTION'].includes(String(value).toUpperCase()) ? String(value).toUpperCase() : 'NO ACTION';
        await client.query(`ALTER TABLE ${quote(table)} ADD CONSTRAINT ${quote(name)} FOREIGN KEY (${foreign.from.map(quote).join(',')}) REFERENCES ${quote(foreign.target)} (${foreign.to.map(quote).join(',')}) ON DELETE ${action(foreign.onDelete)} ON UPDATE ${action(foreign.onUpdate)} NOT VALID`);
        await client.query(`ALTER TABLE ${quote(table)} VALIDATE CONSTRAINT ${quote(name)}`);
      }
    }
    await client.query("CREATE UNIQUE INDEX IF NOT EXISTS categories_public_sibling_name_uq ON categories(COALESCE(parent_id,0),LOWER(name)) WHERE scope='public'");
    await client.query("CREATE UNIQUE INDEX IF NOT EXISTS categories_personal_sibling_name_uq ON categories(owner_id,COALESCE(parent_id,0),LOWER(name)) WHERE scope='personal'");
    await client.query("CREATE UNIQUE INDEX IF NOT EXISTS users_username_nocase_uq ON users(LOWER(username)) WHERE username IS NOT NULL");
    await client.query("CREATE UNIQUE INDEX IF NOT EXISTS access_groups_name_nocase_uq ON access_groups(LOWER(name))");
    await client.query('SET session_replication_role = DEFAULT');
    await client.query('COMMIT');
    console.log(`[migrate] completed ${tables.length} tables`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { sqlite.close(); await client.end(); }
}

migrate().catch(error => { console.error('[migrate] failed:', error.message); process.exit(1); });
