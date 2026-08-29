const path = require('path');
const { Worker } = require('worker_threads');
const { translateSql } = require('./postgresSql');

const BUFFER_BYTES = Math.max(8,Number(process.env.NAVPILOT_PG_SYNC_BUFFER_MB) || 128) * 1024 * 1024;
const QUERY_TIMEOUT_MS = Math.max(1000,Number(process.env.NAVPILOT_PG_SYNC_TIMEOUT_MS) || 120000);

function createPostgresDatabase(connectionString = process.env.DATABASE_URL || process.env.NAVPILOT_DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required when NAVPILOT_DB_DRIVER=postgres');
  const shared = new SharedArrayBuffer(BUFFER_BYTES + 16), control = new Int32Array(shared,0,4), bytes = new Uint8Array(shared,16);
  const worker = new Worker(path.join(__dirname,'postgresWorker.js'),{workerData:{connectionString,applicationName:`navpilot-${process.pid}`}});
  let transactionDepth = 0, savepoint = 0;

  function request(payload) {
    Atomics.store(control,0,0); Atomics.store(control,1,0);
    worker.postMessage({...payload,shared});
    const state = Atomics.wait(control,0,0,QUERY_TIMEOUT_MS);
    if (state === 'timed-out') throw Object.assign(new Error('PostgreSQL synchronous bridge timed out'),{code:'POSTGRES_BRIDGE_TIMEOUT'});
    const result = JSON.parse(Buffer.from(bytes.subarray(0,Atomics.load(control,1))).toString('utf8'));
    if (!result.ok) {
      const details = result.error || {};
      const code = /^23/.test(String(details.code || '')) ? `SQLITE_CONSTRAINT_${details.code}` : details.code;
      throw Object.assign(new Error(details.message || 'PostgreSQL query failed'),details,{ postgresCode:details.code,code });
    }
    return result.value;
  }
  function command(value) { return request({op:'command',command:value}); }
  command('SELECT 1');

  const database = {
    dialect:'postgres',
    prepare(source) {
      return {
        all(...params) { const query=translateSql(source); return request({op:'query',...query,params}).rows; },
        get(...params) { const query=translateSql(source); return request({op:'query',...query,params}).rows[0]; },
        run(...params) {
          const query=translateSql(source,{returning:true}), result=request({op:'query',...query,params});
          return { changes:result.rowCount,lastInsertRowid:result.rows[0]?.id ?? 0 };
        },
        iterate(...params) { return this.all(...params)[Symbol.iterator](); },
      };
    },
    transaction(fn) {
      return (...args) => {
        const nested = transactionDepth > 0, point = `navpilot_sp_${++savepoint}`;
        command(nested ? `SAVEPOINT ${point}` : 'BEGIN'); transactionDepth += 1;
        try {
          const value = fn(...args); transactionDepth -= 1;
          command(nested ? `RELEASE SAVEPOINT ${point}` : 'COMMIT'); return value;
        } catch (error) {
          transactionDepth -= 1;
          try { command(nested ? `ROLLBACK TO SAVEPOINT ${point}` : 'ROLLBACK'); } catch { /* preserve original */ }
          throw error;
        }
      };
    },
    exec(source) {
      // PostgreSQL accepts a simple-query string containing multiple statements.
      const query = translateSql(source);
      request({op:'query',...query,params:[]}); return database;
    },
    pragma(name,options={}) {
      if (String(name).startsWith('integrity_check')) return options.simple ? 'ok' : [{integrity_check:'ok'}];
      return undefined;
    },
    close() { try { request({op:'close'}); } finally { worker.terminate(); } },
  };
  return database;
}

module.exports = { createPostgresDatabase };
