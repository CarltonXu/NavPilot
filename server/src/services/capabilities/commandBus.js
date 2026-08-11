const { PERMISSIONS, assertPermission } = require("../authorizationService");

function capabilityError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

class CommandBus {
  constructor() {
    this.tools = new Map();
  }

  register(definition, handler) {
    const name = String(definition?.name || "").trim();
    if (!/^[a-z][a-z0-9_.-]+$/.test(name))
      throw capabilityError("CAPABILITY_NAME_INVALID", `无效能力名称: ${name}`);
    if (this.tools.has(name))
      throw capabilityError("CAPABILITY_CONFLICT", `能力已注册: ${name}`, 409);
    this.tools.set(name, {
      definition:{
        name,
        description:String(definition.description || "").slice(0, 500),
        readOnly:definition.readOnly !== false,
        approval:definition.approval || "none",
        permission:definition.permission || PERMISSIONS.AUTHENTICATED,
        inputSchema:definition.inputSchema || { type:"object" },
        outputSchema:definition.outputSchema || { type:"object" },
      },
      handler,
    });
    return this;
  }

  catalog() {
    return [...this.tools.values()].map((entry) => entry.definition);
  }

  async invoke(name, args = {}, context = {}) {
    const entry = this.tools.get(name);
    if (!entry) throw capabilityError("CAPABILITY_NOT_FOUND", `平台能力不存在: ${name}`, 404);
    if (!context.actor?.id)
      throw capabilityError("AUTH_REQUIRED", "调用平台能力前必须登录", 401);
    assertPermission(context.actor, entry.definition.permission, context);
    if (!entry.definition.readOnly && context.approved !== true)
      throw capabilityError("CAPABILITY_APPROVAL_REQUIRED", "该平台能力需要用户授权", 400);
    const started = Date.now();
    const data = await entry.handler(args && typeof args === "object" ? args : {}, context);
    return {
      ok:true,
      tool:name,
      readOnly:entry.definition.readOnly,
      durationMs:Date.now() - started,
      data,
    };
  }
}

module.exports = { CommandBus, capabilityError };
