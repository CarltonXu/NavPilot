const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
process.env.NAVPILOT_DB_PATH = ":memory:";
const db = require("../src/db");
const {
  createNavigationService,
  realm,
} = require("../src/services/navigationService");
const { validateEnvelope } = require("../src/services/ai/commandSchema");
const { canonicalize, createPlan } = require("../src/services/ai/planService");
const { executePlan, undoPlan } = require("../src/services/ai/commandExecutor");

function user(id = "domain-user") {
  db.prepare(
    "INSERT OR IGNORE INTO users(id,username,display_name,role,status,must_change_password) VALUES(?,?,?,'user','active',0)",
  ).run(id, id, "Domain User");
  return id;
}

test("latest schema includes versions and AI execution tables", () => {
  const itemColumns = db
    .prepare("PRAGMA table_info(items)")
    .all()
    .map((x) => x.name);
  const categoryColumns = db
    .prepare("PRAGMA table_info(categories)")
    .all()
    .map((x) => x.name);
  const analyticsColumns = db
    .prepare("PRAGMA table_info(analytics_events)")
    .all()
    .map((x) => x.name);
  assert.ok(itemColumns.includes("version"));
  assert.ok(itemColumns.includes("updated_at"));
  assert.ok(categoryColumns.includes("version"));
  assert.ok(categoryColumns.includes("updated_at"));
  assert.ok(categoryColumns.includes("parent_id"));
  assert.ok(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_plans'",
      )
      .get(),
  );
  assert.ok(
    db.prepare("SELECT 1 FROM schema_migrations WHERE version=3").get(),
  );
  assert.ok(
    db.prepare("SELECT 1 FROM schema_migrations WHERE version=5").get(),
  );
  assert.ok(
    db.prepare("SELECT 1 FROM schema_migrations WHERE version=6").get(),
  );
  assert.ok(itemColumns.includes("tags_json"));
  assert.ok(
    [
      "ip_prefix",
      "country_code",
      "item_name",
      "item_url",
      "item_description",
      "item_icon",
    ].every((column) => analyticsColumns.includes(column)),
  );
});

test("navigation service moves items and rejects stale updates", () => {
  const owner = user(),
    service = createNavigationService(db),
    current = realm("personal", owner);
  const a = service.createCategory(current, { name: "A" }).value,
    b = service.createCategory(current, { name: "B" }).value;
  const first = service.createItem(current, {
    name: "One",
    url: "https://one.example",
    category_id: a.id,
  }).value;
  service.createItem(current, {
    name: "Two",
    url: "https://two.example",
    category_id: a.id,
  });
  const moved = service.updateItem(current, first.id, {
    category_id: b.id,
    expectedVersion: first.version,
  }).value;
  assert.equal(moved.category_id, b.id);
  assert.deepEqual(
    service
      .listItems(current)
      .filter((x) => x.category_id === a.id)
      .map((x) => x.sort_order),
    [0],
  );
  assert.throws(
    () =>
      service.updateItem(current, first.id, {
        name: "Stale",
        expectedVersion: first.version,
      }),
    (error) => error.code === "ENTITY_STALE",
  );
});

test("resources normalize tags and AI plans can update tags", () => {
  const owner = user("tag-user"),
    service = createNavigationService(db),
    current = realm("personal", owner);
  const created = service.createItem(current, {
    name: "Tagged",
    url: "https://tagged.example",
    tags: ["Docs", "#AI", "docs", ""],
  }).value;
  assert.deepEqual(created.tags, ["Docs", "AI"]);
  const envelope = validateEnvelope({
    operations: [
      { op: "item.update", item: "Tagged", fields: { tags: ["work", "AI"] } },
    ],
  });
  const plan = canonicalize(envelope.operations, current);
  assert.deepEqual(plan.operations[0].patch.tags, ["work", "AI"]);
  const updated = service.updateItem(current, created.id, {
    tags: ["work", "AI"],
  }).value;
  assert.deepEqual(updated.tags, ["work", "AI"]);
});

test("navigation service renames categories and bulk moves selected items", () => {
  const owner = user("bulk-user"),
    service = createNavigationService(db),
    current = realm("personal", owner);
  const source = service.createCategory(current, { name: "Source" }).value,
    target = service.createCategory(current, { name: "Target" }).value;
  const renamed = service.updateCategory(current, target.id, {
    name: "Renamed",
    expectedVersion: target.version,
  }).value;
  assert.equal(renamed.name, "Renamed");
  const one = service.createItem(current, {
    name: "One bulk",
    url: "https://one-bulk.example",
    category_id: source.id,
  }).value;
  const two = service.createItem(current, {
    name: "Two bulk",
    url: "https://two-bulk.example",
    category_id: source.id,
  }).value;
  const moved = service.bulkUpdateItems(current, [one.id, two.id], {
    category_id: renamed.id,
  });
  assert.equal(moved.length, 2);
  assert.deepEqual(
    service
      .listItems(current)
      .filter((item) => [one.id, two.id].includes(item.id))
      .map((item) => item.category_id),
    [renamed.id, renamed.id],
  );
  const foreignOwner = user("bulk-foreign"),
    foreign = service.createItem(realm("personal", foreignOwner), {
      name: "Foreign bulk",
      url: "https://foreign-bulk.example",
    }).value;
  assert.throws(
    () => service.bulkDeleteItems(current, [one.id, foreign.id]),
    (error) => error.code === "ITEM_NOT_FOUND",
  );
  assert.equal(service.getItem(current, one.id).id, one.id);
  const deleted = service.bulkDeleteItems(current, [one.id, two.id]);
  assert.equal(deleted.value.deletedCount, 2);
  assert.deepEqual(deleted.value.deletedIds, [one.id, two.id]);
  assert.equal(
    service
      .listItems(current)
      .filter((item) => [one.id, two.id].includes(item.id)).length,
    0,
  );
});

test("category trees enforce depth and preserve items on subtree delete", () => {
  const owner = user("tree-user"),
    service = createNavigationService(db),
    current = realm("personal", owner);
  const root = service.createCategory(current, { name: "研发" }).value;
  const child = service.createCategory(current, {
    name: "后端",
    parent_id: root.id,
  }).value;
  const leaf = service.createCategory(current, {
    name: "监控",
    parent_id: child.id,
  }).value;
  assert.equal(leaf.depth, 3);
  assert.equal(leaf.path_label, "研发 / 后端 / 监控");
  assert.throws(
    () => service.createCategory(current, { name: "四级", parent_id: leaf.id }),
    (error) => error.code === "CATEGORY_DEPTH_EXCEEDED",
  );
  assert.throws(
    () => service.updateCategory(current, root.id, { parent_id: child.id }),
    (error) => error.code === "CATEGORY_CYCLE",
  );
  const otherRoot = service.createCategory(current, { name: "办公" }).value;
  assert.doesNotThrow(() =>
    service.createCategory(current, { name: "监控", parent_id: otherRoot.id }),
  );
  assert.throws(
    () =>
      service.createCategory(current, { name: "监控", parent_id: child.id }),
    (error) => error.code === "CATEGORY_SIBLING_CONFLICT",
  );
  const item = service.createItem(current, {
    name: "Grafana",
    url: "https://grafana.example",
    category_id: leaf.id,
  }).value;
  const impact = service.getCategoryImpact(current, root.id);
  assert.equal(impact.categoryCount, 3);
  assert.equal(impact.resourceCount, 1);
  assert.throws(
    () =>
      service.deleteCategory(current, root.id, {
        impactHash: "stale",
        confirmSubtree: true,
      }),
    (error) => error.code === "CATEGORY_DELETE_IMPACT_STALE",
  );
  const deleted = service.deleteCategory(current, root.id, {
    expectedVersion: root.version,
    impactHash: impact.impactHash,
    confirmSubtree: true,
  });
  assert.equal(deleted.value.categoryCount, 3);
  assert.equal(service.getItem(current, item.id).category_id, null);
  assert.equal(
    service.listCategories(current).some((category) => category.id === leaf.id),
    false,
  );
});

test("AI command schema rejects unknown operations and planner resolves only current realm", () => {
  assert.throws(
    () => validateEnvelope({ operations: [{ op: "database.sql" }] }),
    (error) => error.code === "AI_INVALID_RESPONSE",
  );
  const owner = user("planner-user"),
    service = createNavigationService(db),
    current = realm("personal", owner);
  const category = service.createCategory(current, { name: "研发" }).value;
  const item = service.createItem(current, {
    name: "Jenkins",
    url: "https://jenkins.example",
    category_id: category.id,
  }).value;
  const plan = canonicalize(
    [{ op: "item.move", item: "Jenkins", destinationCategory: "研发" }],
    current,
  );
  assert.equal(plan.operations[0].ids[0], item.id);
  assert.equal(plan.expectedVersions[`item:${item.id}`], item.version);
});

test("AI planner refuses ambiguous item references", () => {
  const owner = user("ambiguous-user"),
    service = createNavigationService(db),
    current = realm("personal", owner);
  service.createItem(current, {
    name: "Docs One",
    url: "https://one.docs.example",
  });
  service.createItem(current, {
    name: "Docs Two",
    url: "https://two.docs.example",
  });
  assert.throws(
    () => canonicalize([{ op: "item.delete", item: "Docs" }], current),
    (error) => error.code === "AI_ENTITY_AMBIGUOUS",
  );
});

test("AI category deletion previews and confirms the full subtree impact", () => {
  const owner = user("delete-plan-user"),
    service = createNavigationService(db),
    current = realm("personal", owner);
  const root = service.createCategory(current, { name: "Delete Root" }).value;
  const child = service.createCategory(current, {
    name: "Delete Child",
    parent_id: root.id,
  }).value;
  service.createItem(current, {
    name: "Affected resource",
    url: "https://affected.example",
    category_id: child.id,
  });
  const plan = canonicalize(
    [{ op: "category.delete", category: "Delete Root" }],
    current,
  );
  assert.equal(plan.destructive, true);
  assert.deepEqual(plan.operations[0].display, {
    category: "Delete Root",
    categoryCount: 2,
    resourceCount: 1,
  });
  assert.equal(plan.operations[0].deleteOptions.confirmSubtree, true);
  assert.ok(plan.operations[0].deleteOptions.impactHash);
});

test("AI plans can create nested categories and use them later only after explicit approval", () => {
  const owner = user("dependency-user"),
    current = realm("personal", owner),
    actor = { id: owner, username: "dependency-user", role: "user" };
  const plan = createPlan({
    actor,
    current,
    locale: "zh-CN",
    text: "create nested categories and a link",
    model: "test-model",
    commands: [
      { op: "category.create", category: "学习" },
      { op: "category.create", category: "文档", parentCategory: "学习" },
      {
        op: "item.create",
        fields: {
          name: "Reference",
          url: "https://reference.example",
          category: "学习 / 文档",
        },
      },
    ],
  });
  assert.equal(
    plan.operations[1].input.parent_ref,
    plan.operations[0].createRef,
  );
  assert.equal(
    plan.operations[2].input.category_ref,
    plan.operations[1].createRef,
  );
  const req = { auth: { user: actor }, header: () => "", ip: "127.0.0.1" };
  assert.throws(
    () =>
      executePlan({
        id: plan.id,
        actor,
        req,
        idempotencyKey: "approval-required",
        confirmed: false,
      }),
    (error) => error.code === "AI_PLAN_CONFIRMATION_REQUIRED",
  );
  const result = executePlan({
    id: plan.id,
    actor,
    req,
    idempotencyKey: "approved-execution",
    confirmed: true,
  });
  assert.equal(result.affectedCount, 3);
  const service = createNavigationService(db),
    categories = service.listCategories(current),
    leaf = categories.find((category) => category.path_label === "学习 / 文档");
  assert.ok(leaf);
  assert.equal(
    service.listItems(current).find((item) => item.name === "Reference")
      .category_id,
    leaf.id,
  );
  assert.equal(
    undoPlan({ id: plan.id, actor, req, idempotencyKey: "approved-undo" })
      .status,
    "undone",
  );
  assert.equal(
    service
      .listCategories(current)
      .some((category) => category.name === "学习"),
    false,
  );
  assert.equal(
    service.listItems(current).some((item) => item.name === "Reference"),
    false,
  );
});
