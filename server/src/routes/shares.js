const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { requireUser, requirePasswordChanged, recordAuthorizationDenied } = require("../middleware/auth");
const { auditWith } = require("../services/eventService");
const {
  createTransferService,
} = require("../services/resourceTransferService");
const { assertRealmPermission } = require("../services/authorizationService");

const router = express.Router();
const transfer = createTransferService(db);
router.use(requireUser, requirePasswordChanged);

function send(req, res, error) {
  if (error.status === 403) recordAuthorizationDenied(req, "public.manage", { scope:req.body?.scope });
  return res
    .status(error.status || 400)
    .json({ code: error.code || "SHARE_FAILED", error: error.message });
}
function parse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
function view(row, detail = false) {
  const snapshot = parse(row.snapshot_json, { categories: [], items: [] });
  const value = {
    id: row.id,
    status: row.status,
    createdAt: row.created_at_ms,
    respondedAt: row.responded_at_ms,
    sender: {
      id: row.sender_user_id,
      username: row.sender_username,
      displayName: row.sender_name,
    },
    recipient: {
      id: row.recipient_user_id,
      username: row.recipient_username,
      displayName: row.recipient_name,
    },
    summary: {
      categories: snapshot.categories?.length || 0,
      items: snapshot.items?.length || 0,
    },
    result: parse(row.result_json),
  };
  if (detail) value.snapshot = snapshot;
  return value;
}
const select = `SELECT s.*,sender.username sender_username,sender.display_name sender_name,recipient.username recipient_username,recipient.display_name recipient_name FROM resource_shares s JOIN users sender ON sender.id=s.sender_user_id JOIN users recipient ON recipient.id=s.recipient_user_id`;

router.get("/", (req, res) => {
  const id = req.auth.user.id;
  const sent = db
    .prepare(`${select} WHERE s.sender_user_id=? ORDER BY s.created_at_ms DESC`)
    .all(id)
    .map((row) => view(row));
  const received = db
    .prepare(
      `${select} WHERE s.recipient_user_id=? ORDER BY s.created_at_ms DESC`,
    )
    .all(id)
    .map((row) => view(row));
  res.json({ sent, received });
});

router.get("/:id", (req, res) => {
  const row = db
    .prepare(
      `${select} WHERE s.id=? AND (s.sender_user_id=? OR s.recipient_user_id=?)`,
    )
    .get(req.params.id, req.auth.user.id, req.auth.user.id);
  if (!row)
    return res
      .status(404)
      .json({ code: "SHARE_NOT_FOUND", error: "共享记录不存在" });
  auditWith(db, req, "share.detail_viewed", {
    targetType: "resource_share",
    targetId: row.id,
    metadata: {
      perspective:
        row.sender_user_id === req.auth.user.id ? "sender" : "recipient",
    },
  });
  return res.json(view(row, true));
});

router.post("/", (req, res) => {
  try {
    const recipients = Array.isArray(req.body.recipients)
      ? req.body.recipients
      : [req.body.recipient];
    const unique = [
      ...new Set(
        recipients.map((value) => String(value || "").trim()).filter(Boolean),
      ),
    ];
    if (!unique.length)
      throw Object.assign(new Error("请输入接收用户的用户名或 ID"), {
        code: "SHARE_RECIPIENT_REQUIRED",
      });
    const sourceScope = req.body.scope === "public" ? "public" : "personal";
    assertRealmPermission(req.auth.user, {
      scope:sourceScope,
      ownerId:sourceScope === "personal" ? req.auth.user.id : null,
    }, "manage");
    const snapshot = transfer.selectionSnapshot(
        { scope:sourceScope, ownerId:sourceScope === "personal" ? req.auth.user.id : null },
        req.body.selection || {},
      ),
      created = [];
    if (snapshot.items.some((item) => item.access?.visibility === 'restricted')) {
      auditWith(db, req, 'share.restricted_denied', { outcome:'denied', targetType:'navigation_realm', metadata:{ sourceScope, itemCount:snapshot.items.length } });
      throw Object.assign(new Error('指定范围资源不能复制到个人空间，请使用资源授权'), { code:'RESTRICTED_SHARE_FORBIDDEN', status:409 });
    }
    db.transaction(() => {
      for (const identity of unique) {
        const user = db
          .prepare(
            "SELECT id,username,display_name FROM users WHERE status='active' AND (id=? OR username=? COLLATE NOCASE)",
          )
          .get(identity, identity);
        if (!user)
          throw Object.assign(new Error(`未找到用户：${identity}`), {
            code: "SHARE_RECIPIENT_NOT_FOUND",
            status: 404,
          });
        if (user.id === req.auth.user.id)
          throw Object.assign(new Error("不能共享给自己"), {
            code: "SHARE_SELF_FORBIDDEN",
          });
        const id = crypto.randomUUID(),
          createdAt = Date.now();
        db.prepare(
          "INSERT INTO resource_shares(id,sender_user_id,recipient_user_id,snapshot_json,status,created_at_ms) VALUES(?,?,?,?, 'pending',?)",
        ).run(
          id,
          req.auth.user.id,
          user.id,
          JSON.stringify(snapshot),
          createdAt,
        );
        auditWith(db, req, "share.created", {
          targetType: "resource_share",
          targetId: id,
          metadata: {
            recipientUserId: user.id,
            recipientUsername: user.username,
            sourceScope,
            itemCount: snapshot.items.length,
            categoryCount: snapshot.categories.length,
          },
        });
        created.push({
          id,
          createdAt,
          recipient: {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
          },
        });
      }
    })();
    res.status(201).json({ shares: created });
  } catch (error) {
    return send(req, res, error);
  }
});

router.post("/:id/respond", (req, res) => {
  try {
    const share = db
      .prepare(
        "SELECT * FROM resource_shares WHERE id=? AND recipient_user_id=?",
      )
      .get(req.params.id, req.auth.user.id);
    if (!share)
      throw Object.assign(new Error("共享记录不存在"), {
        code: "SHARE_NOT_FOUND",
        status: 404,
      });
    if (share.status !== "pending")
      throw Object.assign(new Error("该共享已经处理"), {
        code: "SHARE_ALREADY_RESPONDED",
        status: 409,
      });
    const action = req.body.action;
    if (!["accept", "reject"].includes(action))
      throw Object.assign(new Error("请选择接受或拒绝"), {
        code: "INVALID_SHARE_RESPONSE",
      });
    let result = null;
    const respondedAt = Date.now();
    db.transaction(() => {
      if (action === "accept") {
        const snapshot = JSON.parse(share.snapshot_json);
        result = transfer.importNormalized({ scope:"personal", ownerId:req.auth.user.id }, snapshot, {
          selectedKeys: snapshot.items.map((item) => item.key),
          targetCategoryId: req.body.targetCategoryId ?? null,
          preserveStructure: req.body.preserveStructure !== false,
        });
      }
      db.prepare(
        "UPDATE resource_shares SET status=?,result_json=?,responded_at_ms=? WHERE id=?",
      ).run(
        action === "accept" ? "accepted" : "rejected",
        result ? JSON.stringify(result) : null,
        respondedAt,
        share.id,
      );
      auditWith(
        db,
        req,
        action === "accept" ? "share.accepted" : "share.rejected",
        {
          targetType: "resource_share",
          targetId: share.id,
          metadata: { senderUserId: share.sender_user_id, ...(result || {}) },
        },
      );
    })();
    res.json({
      ok: true,
      status: action === "accept" ? "accepted" : "rejected",
      respondedAt,
      result,
    });
  } catch (error) {
    return send(req, res, error);
  }
});

module.exports = router;
