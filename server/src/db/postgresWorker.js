const { parentPort, workerData } = require('worker_threads');
const { Client, types } = require('pg');

types.setTypeParser(20, Number);
types.setTypeParser(1700, Number);
const client = new Client({ connectionString:workerData.connectionString, application_name:workerData.applicationName || 'navpilot' });
const ready = client.connect();

function remapRows(rows, aliases = {}) {
  return rows.map((row) => {
    const value = {};
    for (const [key, item] of Object.entries(row)) value[aliases[key] || key] = item;
    return value;
  });
}

function respond(shared, payload) {
  const control = new Int32Array(shared,0,4), bytes = new Uint8Array(shared,16), encoded = Buffer.from(JSON.stringify(payload));
  if (encoded.length > bytes.length) {
    const fallback = Buffer.from(JSON.stringify({ ok:false,error:{message:`PostgreSQL response exceeds ${bytes.length} bytes`,code:'POSTGRES_RESPONSE_TOO_LARGE'} }));
    bytes.set(fallback); Atomics.store(control,1,fallback.length);
  } else { bytes.set(encoded); Atomics.store(control,1,encoded.length); }
  Atomics.store(control,0,1); Atomics.notify(control,0);
}

parentPort.on('message', async (message) => {
  try {
    await ready;
    if (message.op === 'close') { await client.end(); return respond(message.shared,{ok:true,value:null}); }
    if (message.op === 'command') { await client.query(message.command); return respond(message.shared,{ok:true,value:null}); }
    const result = await client.query(message.sql,(message.params || []).map(value => value === undefined ? null : value));
    respond(message.shared,{ok:true,value:{rows:remapRows(result.rows,message.aliasMap || message.aliases),rowCount:result.rowCount || 0}});
  } catch (error) {
    respond(message.shared,{ok:false,error:{message:error.message,code:error.code,detail:error.detail,constraint:error.constraint,sql:message.sql}});
  }
});
