const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'navpilot.db');

function createLatestSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT COLLATE NOCASE UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT,
      password_salt TEXT,
      password_params TEXT,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled','pending_claim')),
      must_change_password INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      password_changed_at TEXT,
      last_login_at TEXT,
      avatar_url TEXT,
      phone TEXT,
      email TEXT,
      preferences_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS ai_domain_policies (
      hostname TEXT PRIMARY KEY,
      allow_content INTEGER NOT NULL DEFAULT 0,
      updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      idle_expires_at INTEGER NOT NULL,
      absolute_expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      user_agent TEXT,
      ip_prefix TEXT
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'icon:folder',
      scope TEXT NOT NULL DEFAULT 'public' CHECK(scope IN ('public','personal')),
      owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      default_visibility TEXT CHECK(default_visibility IS NULL OR default_visibility IN ('public','authenticated','restricted')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK((scope='public' AND owner_id IS NULL) OR (scope='personal' AND owner_id IS NOT NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS categories_public_sibling_name_uq ON categories(COALESCE(parent_id,0), name COLLATE NOCASE) WHERE scope='public';
    CREATE UNIQUE INDEX IF NOT EXISTS categories_personal_sibling_name_uq ON categories(owner_id, COALESCE(parent_id,0), name COLLATE NOCASE) WHERE scope='personal';
    CREATE INDEX IF NOT EXISTS categories_realm_order_idx ON categories(scope, owner_id, parent_id, sort_order, id);
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'icon:link',
      description TEXT NOT NULL DEFAULT '',
      ai_summary TEXT,
      content_hash TEXT,
      content_analyzed_at_ms INTEGER,
      tags_json TEXT NOT NULL DEFAULT '[]',
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      click_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unknown' CHECK(status IN ('online','offline','unknown')),
      latency_ms INTEGER,
      last_checked_at TEXT,
      alert_failure_count INTEGER NOT NULL DEFAULT 0,
      alert_active INTEGER NOT NULL DEFAULT 0,
      alert_last_triggered_at_ms INTEGER,
      check_enabled INTEGER NOT NULL DEFAULT 1,
      check_method TEXT NOT NULL DEFAULT 'http' CHECK(check_method IN ('http','tcp','none')),
      check_target TEXT,
      scope TEXT NOT NULL DEFAULT 'public' CHECK(scope IN ('public','personal')),
      owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','authenticated','restricted')),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK((scope='public' AND owner_id IS NULL) OR (scope='personal' AND owner_id IS NOT NULL))
    );
    CREATE INDEX IF NOT EXISTS items_realm_order_idx ON items(scope, owner_id, category_id, sort_order, id);
    CREATE TABLE IF NOT EXISTS access_groups (
      id TEXT PRIMARY KEY,
      name TEXT COLLATE NOCASE NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS access_group_members (
      group_id TEXT NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      added_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at_ms INTEGER NOT NULL,
      PRIMARY KEY(group_id,user_id)
    );
    CREATE INDEX IF NOT EXISTS access_group_members_user_idx ON access_group_members(user_id,group_id);
    CREATE TABLE IF NOT EXISTS item_access_group_grants (
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
      expires_at_ms INTEGER,
      granted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at_ms INTEGER NOT NULL,
      PRIMARY KEY(item_id,group_id)
    );
    CREATE INDEX IF NOT EXISTS item_access_group_grants_group_idx ON item_access_group_grants(group_id,item_id,expires_at_ms);
    CREATE TABLE IF NOT EXISTS item_access_user_grants (
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at_ms INTEGER,
      granted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at_ms INTEGER NOT NULL,
      PRIMARY KEY(item_id,user_id)
    );
    CREATE INDEX IF NOT EXISTS item_access_user_grants_user_idx ON item_access_user_grants(user_id,item_id,expires_at_ms);
    CREATE TABLE IF NOT EXISTS category_access_group_defaults (
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
      expires_at_ms INTEGER,
      PRIMARY KEY(category_id,group_id)
    );
    CREATE TABLE IF NOT EXISTS category_access_user_defaults (
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at_ms INTEGER,
      PRIMARY KEY(category_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS access_control_state (
      id INTEGER PRIMARY KEY CHECK(id=1),
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at_ms INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO access_control_state(id,revision,updated_at_ms) VALUES(1,1,0);
    CREATE TABLE IF NOT EXISTS user_favorites (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      created_at_ms INTEGER NOT NULL,
      PRIMARY KEY(user_id,item_id)
    );
    CREATE INDEX IF NOT EXISTS user_favorites_user_time_idx ON user_favorites(user_id,created_at_ms DESC);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS legacy_spaces (
      id TEXT PRIMARY KEY,
      legacy_owner_key TEXT NOT NULL UNIQUE,
      pending_user_id TEXT NOT NULL REFERENCES users(id),
      observed_label TEXT,
      item_count INTEGER NOT NULL DEFAULT 0,
      assigned_to_user_id TEXT REFERENCES users(id),
      assigned_at TEXT,
      assigned_by_user_id TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS security_audit_events (
      id TEXT PRIMARY KEY,
      occurred_at_ms INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK(outcome IN ('success','failure','denied')),
      actor_user_id TEXT REFERENCES users(id),
      actor_username TEXT,
      actor_role TEXT,
      target_type TEXT,
      target_id TEXT,
      ip_prefix TEXT,
      browser_family TEXT,
      os_family TEXT,
      device_class TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      occurred_at_ms INTEGER NOT NULL,
      event_name TEXT NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      item_id INTEGER,
      category_id INTEGER,
      scope TEXT,
      surface TEXT,
      view_mode TEXT,
      browser_family TEXT,
      os_family TEXT,
      device_class TEXT,
      ip_prefix TEXT,
      country_code TEXT,
      country_source TEXT,
      city_name TEXT,
      city_source TEXT,
      item_name TEXT,
      item_url TEXT,
      item_description TEXT,
      item_icon TEXT,
      item_owner_id TEXT,
      properties_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS resource_health_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER,
      item_name TEXT,
      scope TEXT NOT NULL CHECK(scope IN ('public','personal')),
      owner_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('online','offline','unknown')),
      latency_ms INTEGER,
      checked_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS resource_health_daily (
      item_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      item_name TEXT,
      item_url TEXT,
      scope TEXT NOT NULL CHECK(scope IN ('public','personal')),
      owner_id TEXT,
      checks INTEGER NOT NULL DEFAULT 0,
      online_count INTEGER NOT NULL DEFAULT 0,
      offline_count INTEGER NOT NULL DEFAULT 0,
      unknown_count INTEGER NOT NULL DEFAULT 0,
      latency_sum INTEGER NOT NULL DEFAULT 0,
      latency_samples INTEGER NOT NULL DEFAULT 0,
      min_latency_ms INTEGER,
      max_latency_ms INTEGER,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY(item_id,day)
    );
    CREATE TABLE IF NOT EXISTS resource_health_incidents (
      id TEXT PRIMARY KEY,
      item_id INTEGER NOT NULL,
      item_name TEXT,
      item_url TEXT,
      scope TEXT NOT NULL CHECK(scope IN ('public','personal')),
      owner_id TEXT,
      started_at_ms INTEGER NOT NULL,
      ended_at_ms INTEGER,
      duration_ms INTEGER,
      failure_count INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL CHECK(status IN ('open','resolved')),
      last_error TEXT,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS command_executions (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL CHECK(action IN ('execute','undo')),
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('succeeded','failed')),
      result_json TEXT,
      created_at_ms INTEGER NOT NULL,
      completed_at_ms INTEGER,
      UNIQUE(actor_user_id,idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS ai_plans (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL REFERENCES users(id),
      realm_scope TEXT NOT NULL CHECK(realm_scope IN ('public','personal')),
      realm_owner_id TEXT REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('draft','executed','undone','expired','failed')),
      locale TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      provider_model TEXT,
      summary TEXT,
      suggestions_json TEXT NOT NULL DEFAULT '[]',
      operations_json TEXT NOT NULL,
      warnings_json TEXT NOT NULL DEFAULT '[]',
      expected_versions_json TEXT NOT NULL DEFAULT '{}',
      inverse_operations_json TEXT,
      result_json TEXT,
      created_at_ms INTEGER NOT NULL,
      expires_at_ms INTEGER NOT NULL,
      executed_at_ms INTEGER,
      undone_at_ms INTEGER,
      CHECK((realm_scope='public' AND realm_owner_id IS NULL) OR (realm_scope='personal' AND realm_owner_id=actor_user_id))
    );
    CREATE TABLE IF NOT EXISTS resource_shares (
      id TEXT PRIMARY KEY,
      sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      snapshot_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
      result_json TEXT,
      created_at_ms INTEGER NOT NULL,
      responded_at_ms INTEGER
    );
    CREATE TABLE IF NOT EXISTS ai_jobs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('organize','embedding_index','report')),
      realm_scope TEXT NOT NULL CHECK(realm_scope IN ('public','personal')),
      realm_owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed')),
      progress INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      input_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT,
      error_code TEXT,
      error_message TEXT,
      created_at_ms INTEGER NOT NULL,
      started_at_ms INTEGER,
      completed_at_ms INTEGER,
      updated_at_ms INTEGER NOT NULL,
      CHECK((realm_scope='public' AND realm_owner_id IS NULL) OR (realm_scope='personal' AND realm_owner_id=actor_user_id))
    );
    CREATE TABLE IF NOT EXISTS resource_embeddings (
      item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      source_hash TEXT NOT NULL,
      provider_model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      vector_json TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      realm_scope TEXT NOT NULL CHECK(realm_scope IN ('public','personal')),
      realm_owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      CHECK((realm_scope='public' AND realm_owner_id IS NULL) OR (realm_scope='personal' AND realm_owner_id=actor_user_id))
    );
    CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      plan_id TEXT REFERENCES ai_plans(id) ON DELETE SET NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_reports (
      id TEXT PRIMARY KEY,
      recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      realm_scope TEXT NOT NULL CHECK(realm_scope IN ('public','personal')),
      realm_owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      findings_json TEXT NOT NULL DEFAULT '[]',
      created_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      read_at_ms INTEGER,
      created_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alert_channels (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL CHECK(owner_type IN ('user','space')),
      owner_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('email','webhook')),
      name TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS alert_channels_owner_idx ON alert_channels(owner_type,owner_id,enabled);
    CREATE TABLE IF NOT EXISTS alert_policies (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL CHECK(owner_type IN ('user','space')),
      owner_id TEXT NOT NULL,
      failure_threshold INTEGER NOT NULL DEFAULT 3,
      cooldown_minutes INTEGER NOT NULL DEFAULT 30,
      notify_recovery INTEGER NOT NULL DEFAULT 1,
      title_template TEXT NOT NULL DEFAULT '[NavPilot] {status} · {resource}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      UNIQUE(owner_type,owner_id)
    );
    CREATE TABLE IF NOT EXISTS alert_events (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL CHECK(owner_type IN ('user','space')),
      owner_id TEXT NOT NULL,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK(event_type IN ('down','recovered')),
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      resolved_at_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS alert_events_owner_time_idx ON alert_events(owner_type,owner_id,created_at_ms DESC);
    CREATE TABLE IF NOT EXISTS alert_deliveries (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES alert_events(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES alert_channels(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('sent','failed')),
      error TEXT,
      attempted_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_usage_events (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      run_id TEXT REFERENCES ai_runs(id) ON DELETE SET NULL,
      feature TEXT NOT NULL,
      provider_model TEXT,
      success INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      first_token_ms INTEGER,
      realm_scope TEXT,
      realm_owner_id TEXT,
      error_code TEXT,
      created_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_runs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE SET NULL,
      mode TEXT NOT NULL CHECK(mode IN ('discussion','instruction','plan')),
      realm_scope TEXT NOT NULL CHECK(realm_scope IN ('public','personal')),
      realm_owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed','cancelled')),
      stage TEXT NOT NULL DEFAULT 'started',
      provider_model TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_input_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_output_tokens INTEGER NOT NULL DEFAULT 0,
      model_calls INTEGER NOT NULL DEFAULT 0,
      tool_calls INTEGER NOT NULL DEFAULT 0,
      first_token_ms INTEGER,
      estimated_cost_micros INTEGER,
      result_kind TEXT,
      error_code TEXT,
      summary_json TEXT NOT NULL DEFAULT '{}',
      started_at_ms INTEGER NOT NULL,
      completed_at_ms INTEGER,
      updated_at_ms INTEGER NOT NULL,
      CHECK((realm_scope='public' AND realm_owner_id IS NULL) OR (realm_scope='personal' AND realm_owner_id=actor_user_id))
    );
    CREATE TABLE IF NOT EXISTS ai_run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ai_plans_actor_status_idx ON ai_plans(actor_user_id,status,expires_at_ms);
    CREATE INDEX IF NOT EXISTS command_executions_plan_idx ON command_executions(plan_id,created_at_ms);
    CREATE INDEX IF NOT EXISTS security_audit_time_idx ON security_audit_events(occurred_at_ms DESC,id DESC);
    CREATE INDEX IF NOT EXISTS security_audit_type_idx ON security_audit_events(event_type,occurred_at_ms DESC);
    CREATE INDEX IF NOT EXISTS security_audit_actor_idx ON security_audit_events(actor_user_id,occurred_at_ms DESC);
    CREATE INDEX IF NOT EXISTS analytics_event_time_idx ON analytics_events(event_name,occurred_at_ms);
    CREATE INDEX IF NOT EXISTS analytics_item_time_idx ON analytics_events(item_id,event_name,occurred_at_ms);
    CREATE INDEX IF NOT EXISTS analytics_user_time_idx ON analytics_events(user_id,occurred_at_ms);
    CREATE INDEX IF NOT EXISTS resource_health_time_idx ON resource_health_events(checked_at_ms,status);
    CREATE INDEX IF NOT EXISTS resource_health_realm_time_idx ON resource_health_events(scope,owner_id,checked_at_ms);
    CREATE INDEX IF NOT EXISTS resource_health_item_time_idx ON resource_health_events(item_id,checked_at_ms);
    CREATE INDEX IF NOT EXISTS resource_health_daily_time_idx ON resource_health_daily(day,item_id);
    CREATE INDEX IF NOT EXISTS resource_health_daily_realm_time_idx ON resource_health_daily(scope,owner_id,day);
    CREATE INDEX IF NOT EXISTS resource_health_incident_item_time_idx ON resource_health_incidents(item_id,started_at_ms DESC);
    CREATE INDEX IF NOT EXISTS resource_health_incident_realm_time_idx ON resource_health_incidents(scope,owner_id,started_at_ms DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS resource_health_incident_open_uq ON resource_health_incidents(item_id) WHERE ended_at_ms IS NULL;
    CREATE INDEX IF NOT EXISTS audit_log_time_idx ON audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log(action,created_at DESC);
    CREATE INDEX IF NOT EXISTS sessions_lookup_idx ON sessions(token_hash, revoked_at);
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS resource_shares_sender_idx ON resource_shares(sender_user_id,created_at_ms DESC);
    CREATE INDEX IF NOT EXISTS resource_shares_recipient_idx ON resource_shares(recipient_user_id,status,created_at_ms DESC);
    CREATE INDEX IF NOT EXISTS ai_jobs_actor_time_idx ON ai_jobs(actor_user_id,created_at_ms DESC);
    CREATE INDEX IF NOT EXISTS ai_jobs_status_idx ON ai_jobs(status,updated_at_ms);
    CREATE INDEX IF NOT EXISTS ai_conversations_actor_time_idx ON ai_conversations(actor_user_id,updated_at_ms DESC);
    CREATE INDEX IF NOT EXISTS ai_messages_conversation_time_idx ON ai_messages(conversation_id,created_at_ms);
    CREATE INDEX IF NOT EXISTS notifications_user_time_idx ON notifications(user_id,read_at_ms,created_at_ms DESC);
    CREATE INDEX IF NOT EXISTS ai_usage_time_idx ON ai_usage_events(created_at_ms DESC,feature);
    CREATE INDEX IF NOT EXISTS ai_runs_actor_time_idx ON ai_runs(actor_user_id,started_at_ms DESC);
    CREATE INDEX IF NOT EXISTS ai_runs_conversation_idx ON ai_runs(conversation_id,started_at_ms DESC);
    CREATE INDEX IF NOT EXISTS ai_run_events_run_time_idx ON ai_run_events(run_id,created_at_ms,id);
  `);
}

function seedFreshDatabase(db) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM categories').get().count;
  if (count) return;
  const insertCategory = db.prepare("INSERT INTO categories(name,icon,scope,owner_id,sort_order) VALUES(?,?,'public',NULL,?)");
  const common = Number(insertCategory.run('常用工具', 'icon:tools', 0).lastInsertRowid);
  const engineering = Number(insertCategory.run('研发', 'icon:code', 1).lastInsertRowid);
  const office = Number(insertCategory.run('办公', 'icon:docs', 2).lastInsertRowid);
  const insertItem = db.prepare("INSERT INTO items(name,url,icon,description,category_id,sort_order,check_method,scope,owner_id) VALUES(?,?,?,?,?,0,'http','public',NULL)");
  insertItem.run('公司官网', 'https://www.anthropic.com', 'icon:globe', '公司对外官网', common);
  insertItem.run('GitHub', 'https://github.com', 'icon:code', '代码托管平台', engineering);
  insertItem.run('内部 Wiki', 'https://example.com/wiki', 'icon:docs', '团队知识库(示例链接，请替换)', office);
}

function migrateLegacyDatabase(db) {
  const hasItems = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='items'").get();
  const categoryColumns = db.prepare("PRAGMA table_info(categories)").all();
  const alreadyScoped = categoryColumns.some((column) => column.name === 'scope');
  if (!hasItems || alreadyScoped) return;

  db.pragma('foreign_keys = OFF');
  const migrate = db.transaction(() => {
    db.exec('ALTER TABLE categories RENAME TO categories_legacy; ALTER TABLE items RENAME TO items_legacy;');
    createLatestSchema(db);

    const owners = db.prepare("SELECT owner_id, MAX(owner_name) AS owner_name, COUNT(*) AS item_count FROM items_legacy WHERE scope='personal' AND owner_id IS NOT NULL GROUP BY owner_id").all();
    const ownerMap = new Map();
    const insertUser = db.prepare("INSERT INTO users(id,username,display_name,role,status,must_change_password) VALUES(?,NULL,?,'user','pending_claim',1)");
    const insertLegacy = db.prepare('INSERT INTO legacy_spaces(id,legacy_owner_key,pending_user_id,observed_label,item_count) VALUES(?,?,?,?,?)');
    for (const owner of owners) {
      const pendingId = crypto.randomUUID();
      ownerMap.set(owner.owner_id, pendingId);
      insertUser.run(pendingId, `Legacy space ${String(owner.owner_id).slice(0, 8)}`);
      insertLegacy.run(crypto.randomUUID(), owner.owner_id, pendingId, owner.owner_name || null, owner.item_count);
    }

    const categories = db.prepare('SELECT * FROM categories_legacy ORDER BY sort_order,id').all();
    const categoryMap = new Map();
    const insertCategory = db.prepare('INSERT INTO categories(name,icon,scope,owner_id,sort_order,created_at) VALUES(?,?,?,?,?,COALESCE(?,datetime(\'now\')))');
    for (const category of categories) {
      const refs = db.prepare('SELECT scope, owner_id, COUNT(*) AS count FROM items_legacy WHERE category_id=? GROUP BY scope,owner_id').all(category.id);
      const publicRef = refs.some((ref) => ref.scope !== 'personal');
      if (publicRef || refs.length === 0) {
        const id = Number(insertCategory.run(category.name, category.icon || 'icon:folder', 'public', null, category.sort_order || 0, category.created_at).lastInsertRowid);
        categoryMap.set(`${category.id}:public:`, id);
      }
      for (const ref of refs.filter((entry) => entry.scope === 'personal' && entry.owner_id)) {
        const pendingId = ownerMap.get(ref.owner_id);
        if (!pendingId) continue;
        const id = Number(insertCategory.run(category.name, category.icon || 'icon:folder', 'personal', pendingId, category.sort_order || 0, category.created_at).lastInsertRowid);
        categoryMap.set(`${category.id}:personal:${ref.owner_id}`, id);
      }
    }

    const legacyItems = db.prepare('SELECT * FROM items_legacy ORDER BY id').all();
    const insertItem = db.prepare(`INSERT INTO items(id,name,url,icon,description,category_id,sort_order,click_count,status,latency_ms,last_checked_at,check_enabled,check_method,check_target,scope,owner_id,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const item of legacyItems) {
      const scope = item.scope === 'personal' && item.owner_id && ownerMap.has(item.owner_id) ? 'personal' : 'public';
      const ownerId = scope === 'personal' ? ownerMap.get(item.owner_id) : null;
      const categoryId = item.category_id ? categoryMap.get(`${item.category_id}:${scope}:${scope === 'personal' ? item.owner_id : ''}`) || null : null;
      insertItem.run(item.id, item.name, item.url, item.icon || 'icon:link', item.description || '', categoryId, item.sort_order || 0, item.click_count || 0, ['online','offline','unknown'].includes(item.status) ? item.status : 'unknown', item.latency_ms, item.last_checked_at, scope === 'personal' ? 0 : (item.check_enabled ? 1 : 0), ['http','tcp','none'].includes(item.check_method) ? item.check_method : 'http', item.check_target, scope, ownerId, item.created_at);
    }
    db.exec('DROP TABLE items_legacy; DROP TABLE categories_legacy;');
    db.prepare('INSERT INTO schema_migrations(version) VALUES(1)').run();
    if (!db.prepare("SELECT 1 FROM settings WHERE key='ai_personal_enabled'").get()) db.prepare("INSERT INTO settings(key,value) VALUES('ai_personal_enabled','false')").run();
  });
  migrate();
  db.pragma('foreign_keys = ON');
}

function addColumnIfMissing(db, table, definition) {
  const name = definition.trim().split(/\s+/)[0];
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

function migrateCurrentSchema(db) {
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version));
  if (!applied.has(2)) {
    db.transaction(() => {
      addColumnIfMissing(db, 'categories', 'version INTEGER NOT NULL DEFAULT 1');
      addColumnIfMissing(db, 'categories', 'updated_at TEXT');
      addColumnIfMissing(db, 'items', 'version INTEGER NOT NULL DEFAULT 1');
      addColumnIfMissing(db, 'items', 'updated_at TEXT');
      db.exec(`
        UPDATE categories SET updated_at=COALESCE(updated_at,created_at,datetime('now'));
        UPDATE items SET updated_at=COALESCE(updated_at,created_at,datetime('now'));
      `);
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(2)').run();
    })();
  }
  if (!applied.has(3)) {
    db.transaction(() => {
      addColumnIfMissing(db, 'categories', 'parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE');
      db.exec(`
        UPDATE categories SET icon='icon:folder' WHERE icon IS NULL OR trim(icon)='';
        DROP INDEX IF EXISTS categories_public_name_uq;
        DROP INDEX IF EXISTS categories_personal_name_uq;
        DROP INDEX IF EXISTS categories_realm_order_idx;
        CREATE UNIQUE INDEX IF NOT EXISTS categories_public_sibling_name_uq ON categories(COALESCE(parent_id,0), name COLLATE NOCASE) WHERE scope='public';
        CREATE UNIQUE INDEX IF NOT EXISTS categories_personal_sibling_name_uq ON categories(owner_id, COALESCE(parent_id,0), name COLLATE NOCASE) WHERE scope='personal';
        CREATE INDEX IF NOT EXISTS categories_realm_order_idx ON categories(scope, owner_id, parent_id, sort_order, id);
      `);
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(3)').run();
    })();
  }
  if (!applied.has(4)) {
    db.transaction(() => {
      addColumnIfMissing(db, 'users', 'avatar_url TEXT');
      addColumnIfMissing(db, 'users', 'phone TEXT');
      addColumnIfMissing(db, 'users', 'email TEXT');
      addColumnIfMissing(db, 'users', "preferences_json TEXT NOT NULL DEFAULT '{}'");
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(4)').run();
    })();
  }
  if (!applied.has(5)) {
    db.transaction(() => {
      addColumnIfMissing(db, 'analytics_events', 'ip_prefix TEXT');
      addColumnIfMissing(db, 'analytics_events', 'country_code TEXT');
      addColumnIfMissing(db, 'analytics_events', 'item_name TEXT');
      addColumnIfMissing(db, 'analytics_events', 'item_url TEXT');
      addColumnIfMissing(db, 'analytics_events', 'item_description TEXT');
      addColumnIfMissing(db, 'analytics_events', 'item_icon TEXT');
      db.exec(`
        UPDATE analytics_events
        SET item_name=COALESCE(item_name,(SELECT name FROM items WHERE items.id=analytics_events.item_id)),
            item_url=COALESCE(item_url,(SELECT url FROM items WHERE items.id=analytics_events.item_id)),
            item_description=COALESCE(item_description,(SELECT description FROM items WHERE items.id=analytics_events.item_id)),
            item_icon=COALESCE(item_icon,(SELECT icon FROM items WHERE items.id=analytics_events.item_id))
        WHERE item_id IS NOT NULL;
        UPDATE analytics_events
        SET item_name=COALESCE(item_name,(SELECT json_extract(metadata_json,'$.before.name') FROM security_audit_events WHERE event_type='item.deleted' AND target_id=CAST(analytics_events.item_id AS TEXT) ORDER BY occurred_at_ms DESC LIMIT 1)),
            item_url=COALESCE(item_url,(SELECT json_extract(metadata_json,'$.before.url') FROM security_audit_events WHERE event_type='item.deleted' AND target_id=CAST(analytics_events.item_id AS TEXT) ORDER BY occurred_at_ms DESC LIMIT 1)),
            item_description=COALESCE(item_description,(SELECT json_extract(metadata_json,'$.before.description') FROM security_audit_events WHERE event_type='item.deleted' AND target_id=CAST(analytics_events.item_id AS TEXT) ORDER BY occurred_at_ms DESC LIMIT 1)),
            item_icon=COALESCE(item_icon,(SELECT json_extract(metadata_json,'$.before.icon') FROM security_audit_events WHERE event_type='item.deleted' AND target_id=CAST(analytics_events.item_id AS TEXT) ORDER BY occurred_at_ms DESC LIMIT 1))
        WHERE item_id IS NOT NULL AND item_name IS NULL;
      `);
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(5)').run();
    })();
  }
  if (!applied.has(6)) {
    db.transaction(() => {
      addColumnIfMissing(db, 'items', "tags_json TEXT NOT NULL DEFAULT '[]'");
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(6)').run();
    })();
  }
  if (!applied.has(7)) {
    db.transaction(() => {
      addColumnIfMissing(db, 'ai_plans', 'summary TEXT');
      addColumnIfMissing(db, 'ai_plans', "suggestions_json TEXT NOT NULL DEFAULT '[]'");
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(7)').run();
    })();
  }
  if (!applied.has(8)) {
    db.transaction(() => {
      createLatestSchema(db);
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(8)').run();
    })();
  }
  if (!applied.has(9)) {
    db.transaction(() => {
      addColumnIfMissing(db, 'items', 'ai_summary TEXT');
      addColumnIfMissing(db, 'items', 'content_hash TEXT');
      addColumnIfMissing(db, 'items', 'content_analyzed_at_ms INTEGER');
      createLatestSchema(db);
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(9)').run();
    })();
  }
  if (!applied.has(10)) {
    db.transaction(() => {
      addColumnIfMissing(db, 'analytics_events', 'item_owner_id TEXT');
      addColumnIfMissing(db, 'ai_usage_events', 'first_token_ms INTEGER');
      addColumnIfMissing(db, 'ai_usage_events', 'realm_scope TEXT');
      addColumnIfMissing(db, 'ai_usage_events', 'realm_owner_id TEXT');
      db.exec(`
        UPDATE analytics_events
        SET item_owner_id=(SELECT owner_id FROM items WHERE items.id=analytics_events.item_id)
        WHERE item_id IS NOT NULL AND item_owner_id IS NULL;
        CREATE INDEX IF NOT EXISTS analytics_owner_time_idx ON analytics_events(item_owner_id,event_name,occurred_at_ms);
        CREATE INDEX IF NOT EXISTS ai_usage_realm_time_idx ON ai_usage_events(realm_scope,realm_owner_id,created_at_ms DESC);
      `);
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(10)').run();
    })();
  }
  if (!applied.has(11)) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_favorites (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          created_at_ms INTEGER NOT NULL,
          PRIMARY KEY(user_id,item_id)
        );
        CREATE INDEX IF NOT EXISTS user_favorites_user_time_idx ON user_favorites(user_id,created_at_ms DESC);
      `);
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(11)').run();
    })();
  }
  if (!applied.has(12)) {
    db.transaction(() => {
      createLatestSchema(db);
      addColumnIfMissing(db, 'ai_usage_events', 'run_id TEXT REFERENCES ai_runs(id) ON DELETE SET NULL');
      db.exec('CREATE INDEX IF NOT EXISTS ai_usage_run_idx ON ai_usage_events(run_id,created_at_ms)');
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(12)').run();
    })();
  }
  if (!applied.has(13)) {
    db.transaction(() => {
      addColumnIfMissing(db, 'analytics_events', 'country_source TEXT');
      db.prepare("UPDATE analytics_events SET country_source='legacy' WHERE country_code IS NOT NULL AND country_code!='' AND country_source IS NULL").run();
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(13)').run();
    })();
  }
  if (!applied.has(14)) {
    db.transaction(() => {
      createLatestSchema(db);
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(14)').run();
    })();
  }
  if (!applied.has(15)) {
    db.transaction(() => {
      addColumnIfMissing(db, 'analytics_events', 'city_name TEXT');
      addColumnIfMissing(db, 'analytics_events', 'city_source TEXT');
      db.exec('CREATE INDEX IF NOT EXISTS analytics_city_time_idx ON analytics_events(country_code,city_name,event_name,occurred_at_ms)');
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(15)').run();
    })();
  }
  if (!applied.has(16)) {
    db.transaction(() => {
      db.exec(`
        UPDATE categories SET icon=CASE icon
          WHEN '📁' THEN 'icon:folder'
          WHEN '🗂️' THEN 'icon:layers'
          WHEN '🧭' THEN 'icon:compass'
          WHEN '📚' THEN 'icon:book'
          WHEN '💻' THEN 'icon:code'
          WHEN '🛠️' THEN 'icon:tools'
          WHEN '🌐' THEN 'icon:globe'
          WHEN '🏢' THEN 'icon:building'
          WHEN '🔒' THEN 'icon:lock'
          WHEN '⭐' THEN 'icon:star'
          ELSE 'icon:folder' END
        WHERE icon IS NULL OR trim(icon)='' OR icon NOT LIKE 'icon:%';
      `);
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(16)').run();
    })();
  }
  if (!applied.has(17)) {
    db.transaction(() => {
      addColumnIfMissing(db, 'items', "visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','authenticated','restricted'))");
      addColumnIfMissing(db, 'categories', "default_visibility TEXT CHECK(default_visibility IS NULL OR default_visibility IN ('public','authenticated','restricted'))");
      createLatestSchema(db);
      db.prepare("UPDATE items SET visibility='public' WHERE visibility IS NULL OR visibility NOT IN ('public','authenticated','restricted')").run();
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(17)').run();
    })();
  }
  if (!applied.has(18)) {
    db.transaction(() => {
      // Administrators bypass resource ACLs, so retaining group membership only
      // creates misleading authorization records in the management UI.
      db.prepare("DELETE FROM access_group_members WHERE user_id IN (SELECT id FROM users WHERE role='admin')").run();
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(18)').run();
    })();
  }
  if (!applied.has(19)) {
    db.transaction(() => {
      addColumnIfMissing(db, 'items', 'alert_failure_count INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(db, 'items', 'alert_active INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(db, 'items', 'alert_last_triggered_at_ms INTEGER');
      createLatestSchema(db);
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(19)').run();
    })();
  }
  if (!applied.has(20)) {
    db.transaction(() => {
      addColumnIfMissing(db, 'alert_policies', "title_template TEXT NOT NULL DEFAULT '[NavPilot] {status} · {resource}'");
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(20)').run();
    })();
  }
  if (!applied.has(21)) {
    db.transaction(() => {
      createLatestSchema(db);
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(21)').run();
    })();
  }
}

function createDatabase(filename = DEFAULT_DB_PATH) {
  const isMemory = filename === ':memory:';
  if (!isMemory) fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma('busy_timeout = 5000');
  if (!isMemory) db.pragma('journal_mode = WAL');
  const hasTables = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get());
  if (hasTables) migrateLegacyDatabase(db);
  if (hasTables && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='categories'").get()) {
    addColumnIfMissing(db, 'categories', 'parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE');
  }
  createLatestSchema(db);
  migrateCurrentSchema(db);
  db.pragma('foreign_keys = ON');
  if (!hasTables) {
    db.transaction(() => {
      seedFreshDatabase(db);
      db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('ai_personal_enabled','false')").run();
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(1)').run();
    })();
  }
  const integrity = db.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') throw new Error(`Database integrity check failed: ${integrity}`);
  return db;
}

const usePostgres = String(process.env.NAVPILOT_DB_DRIVER || '').toLowerCase() === 'postgres';
const db = usePostgres
  ? require('./db/postgresCompat').createPostgresDatabase()
  : createDatabase(process.env.NAVPILOT_DB_PATH || DEFAULT_DB_PATH);
db.createDatabase = createDatabase;
db.DEFAULT_DB_PATH = DEFAULT_DB_PATH;
module.exports = db;
