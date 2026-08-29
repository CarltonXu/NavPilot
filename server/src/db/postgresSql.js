function replacePlaceholders(sql) {
  let output = '', index = 0, quote = null;
  for (let position = 0; position < sql.length; position += 1) {
    const character = sql[position];
    if (quote) {
      output += character;
      if (character === quote) {
        if (sql[position + 1] === quote) output += sql[++position];
        else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') { quote = character; output += character; continue; }
    if (character === '?') { output += `$${++index}`; continue; }
    output += character;
  }
  return output;
}

function scalarMinMax(sql) {
  let output = '';
  for (let i = 0; i < sql.length; i += 1) {
    const match = /^(MIN|MAX)\(/i.exec(sql.slice(i));
    if (!match) { output += sql[i]; continue; }
    const start = i + match[0].length, name = match[1].toUpperCase();
    let depth = 1, quote = null, comma = false, end = start;
    for (; end < sql.length; end += 1) {
      const c = sql[end];
      if (quote) { if (c === quote && sql[end + 1] !== quote) quote = null; else if (c === quote) end += 1; continue; }
      if (c === "'" || c === '"') { quote = c; continue; }
      if (c === '(') depth += 1;
      else if (c === ')' && --depth === 0) break;
      else if (c === ',' && depth === 1) comma = true;
    }
    if (!comma || end >= sql.length) { output += sql[i]; continue; }
    output += `${name === 'MIN' ? 'LEAST' : 'GREATEST'}(${sql.slice(start,end)})`;
    i = end;
  }
  return output;
}

function jsonFunctions(sql) {
  let value = sql.replace(/json_extract\(\s*([\w.]+)\s*,\s*'\$\.([\w.]+)'\s*\)/gi, (_, column, path) =>
    `(${column}::jsonb #>> '{${path.split('.').join(',')}}')`);
  value = value.replace(/json_array_length\(\s*([\w.]+)\s*,\s*'\$\.([\w.]+)'\s*\)/gi, (_, column, path) =>
    `jsonb_array_length(${column}::jsonb #> '{${path.split('.').join(',')}}')`);
  return value;
}

function dateFunctions(sql) {
  let value = sql;
  value = value.replace(/datetime\(\s*'now'\s*\)/gi, "to_char((now() at time zone 'UTC'),'YYYY-MM-DD HH24:MI:SS')");
  value = value.replace(/CAST\(strftime\('%s','now'\) AS INTEGER\)/gi, 'extract(epoch from now())::bigint');
  value = value.replace(/strftime\('%s',\s*([\w.]+)\s*\)/gi, "extract(epoch from ($1)::timestamp)::bigint");
  value = value.replace(/CAST\(strftime\('%w',\s*([^,]+),\s*'unixepoch'\) AS INTEGER\)/gi, 'extract(dow from to_timestamp($1))::integer');
  value = value.replace(/CAST\(strftime\('%H',\s*([^,]+),\s*'unixepoch'\) AS INTEGER\)/gi, 'extract(hour from to_timestamp($1))::integer');
  value = value.replace(/strftime\('%Y-%m-%d %H:%M',\s*([^,]+),\s*'unixepoch'\)/gi, "to_char(to_timestamp($1),'YYYY-MM-DD HH24:MI')");
  value = value.replace(/date\(\s*strftime\('%s',\s*([\w.]+)\s*\)\s*,\s*'unixepoch'\s*\)/gi, "to_char(($1)::timestamp,'YYYY-MM-DD')");
  value = value.replace(/date\(\s*([^,()]+(?:\([^)]*\))?[^,]*?)\s*,\s*'unixepoch'\s*\)/gi, "to_char(to_timestamp($1),'YYYY-MM-DD')");
  return value;
}

function caseInsensitive(sql) {
  let value = sql.replace(/([\w.]+)\s*=\s*\?\s+COLLATE\s+NOCASE/gi, 'LOWER($1)=LOWER(?::text)');
  value = value.replace(/ORDER\s+BY\s+([\w.]+)\s+COLLATE\s+NOCASE/gi, 'ORDER BY LOWER($1)');
  value = value.replace(/,\s*([\w.]+)\s+COLLATE\s+NOCASE/gi, ', LOWER($1)');
  return value.replace(/\s+COLLATE\s+NOCASE/gi, '');
}

function aliases(sql) {
  const map = {};
  for (const token of sql.match(/\b[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b/g) || []) map[token.toLowerCase()] = token;
  return map;
}

function quoteCamelIdentifiers(sql) {
  let output = '', quote = null;
  for (let i = 0; i < sql.length;) {
    const character = sql[i];
    if (quote) {
      output += character; i += 1;
      if (character === quote) {
        if (sql[i] === quote) { output += sql[i]; i += 1; }
        else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') { quote = character; output += character; i += 1; continue; }
    if (/[A-Za-z_]/.test(character)) {
      let end = i + 1; while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end])) end += 1;
      const token = sql.slice(i,end);
      output += /^[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*$/.test(token) ? `"${token}"` : token;
      i = end; continue;
    }
    output += character; i += 1;
  }
  return output;
}

function translateSql(source, { returning = false } = {}) {
  const aliasMap = aliases(source);
  let sql = String(source).trim().replace(/;\s*$/,'');
  sql = caseInsensitive(sql);
  sql = sql.replace(/\b([\w.]+)\s+IS\s+NOT\s+\?/gi, '$1 IS DISTINCT FROM ?');
  sql = sql.replace(/\b([\w.]+)\s+IS\s+\?/gi, '$1 IS NOT DISTINCT FROM ?');
  const ignore = /^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql);
  if (ignore) sql = sql.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i, 'INSERT INTO');
  sql = jsonFunctions(dateFunctions(scalarMinMax(sql)));
  // DAY/HOUR/MINUTE are accepted as loose aliases by SQLite but are keywords
  // in PostgreSQL. Quoting also keeps GROUP BY / ORDER BY references valid.
  sql = sql.replace(/\b(day|hour|minute)\b/gi, (value) => `"${value.toLowerCase()}"`);
  sql = quoteCamelIdentifiers(sql);
  sql = replacePlaceholders(sql);
  if (ignore && !/\bON\s+CONFLICT\b/i.test(sql)) sql += ' ON CONFLICT DO NOTHING';
  if (returning && /^\s*INSERT\b/i.test(sql) && !/\bRETURNING\b/i.test(sql)) sql += ' RETURNING *';
  return { sql, aliasMap };
}

module.exports = { translateSql, replacePlaceholders, scalarMinMax };
