function policyError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

const PUBLIC_SCOPE = /公共空间|公共区|public\s+space/i;
const PERSONAL_SCOPE = /个人空间|我的空间|本人空间|personal\s+space|my\s+space/i;
const READ_INTENT = /查询|搜索|查找|看看|多少|统计|汇总|分析|报告|报表|网页|图表|列表|展示|列出|find|query|search|count|summarize|analyse|analyze|report|dashboard|list/i;
const ACTION = /删除|移除|清空|新增|添加|创建|修改|更新|编辑|重命名|移动|归类|开启|关闭|启用|禁用|探测|识别|导入|恢复|撤销|排序|设置|打标签|标记|收藏|delete|remove|clear|create|add|update|edit|rename|move|enable|disable|import|restore|undo|reorder|set|tag/i;
const RESOURCE_ACTION = /(?:链接|资源|分类|目录|标签|条目|探测|监控|link|resource|category|folder|tag|item|monitor).{0,48}(?:删除|移除|清空|新增|添加|创建|修改|更新|编辑|重命名|移动|归类|开启|关闭|启用|禁用|探测|识别|导入|恢复|撤销|排序|设置|打标签|标记|delete|remove|clear|create|add|update|edit|rename|move|enable|disable|import|restore|undo|reorder|set|tag)/i;
const DIRECT_ACTION = /^(?:(?:帮我|请|执行|立即|批量|需要|我要|替我|please)\s*)*(?:删除|移除|清空|新增|添加|创建|修改|更新|编辑|重命名|移动|归类|开启|关闭|启用|禁用|探测|识别|导入|恢复|撤销|排序|设置|打标签|标记|收藏|delete|remove|clear|create|add|update|edit|rename|move|enable|disable|import|restore|undo|reorder|set|tag)/i;
const OBJECT_ACTION = /(?:(?:帮我|请|替我|please)\s*)?(?:把|将)\s*.{1,100}?(?:删除|移除|清空|新增|添加|创建|修改|更新|编辑|重命名|移动|归类|开启|关闭|启用|禁用|探测|识别|导入|恢复|撤销|排序|设置|打标签|标记|收藏|delete|remove|clear|create|add|update|edit|rename|move|enable|disable|import|restore|undo|reorder|set|tag)/i;
const CHAINED_ACTION = /(?:并且?|然后|随后|后再|同时|\band\b|\bthen\b).{0,32}(?:删除|移除|清空|新增|添加|创建|修改|更新|编辑|重命名|移动|归类|开启|关闭|启用|禁用|探测|识别|导入|恢复|撤销|排序|设置|打标签|标记|收藏|delete|remove|clear|create|add|update|edit|rename|move|enable|disable|import|restore|undo|reorder|set|tag)/i;

function mutationIntent(value) {
  const text = String(value || "").trim();
  if (!text || !ACTION.test(text)) return false;
  if (DIRECT_ACTION.test(text) || OBJECT_ACTION.test(text) || CHAINED_ACTION.test(text)) return true;
  return !READ_INTENT.test(text) && RESOURCE_ACTION.test(text);
}

function instructionPreflight({ text, scope, actor, locale = "zh-CN" }) {
  const value = String(text || "").trim(), mutation = mutationIntent(value);
  const referencesPublic = PUBLIC_SCOPE.test(value), referencesPersonal = PERSONAL_SCOPE.test(value);
  const crossSpaceRead = !mutation && READ_INTENT.test(value);

  if (scope === "personal" && referencesPublic && !crossSpaceRead) {
    throw policyError(
      "AI_SCOPE_MISMATCH",
      locale === "en"
        ? "This command targets Public Space. Run a Personal Space command here, or switch spaces and make sure your account has the required Public Space permission."
        : "操作空间不允许，请执行个人空间相关指令；如需公共空间相关操作，请切换空间，并确保拥有公共空间相关权限。",
      400,
    );
  }
  if (scope === "public" && referencesPersonal && !crossSpaceRead) {
    throw policyError(
      "AI_SCOPE_MISMATCH",
      locale === "en"
        ? "This command targets Personal Space. Switch to Personal Space before running it."
        : "操作空间不允许，该指令涉及个人空间，请切换到个人空间后执行。",
      400,
    );
  }
  if (scope === "public" && mutation && actor?.role !== "admin") {
    throw policyError(
      "AI_PUBLIC_MANAGE_FORBIDDEN",
      locale === "en"
        ? "Your account can analyze Public Space but cannot modify it. Switch to Personal Space for personal resources, or use an administrator account for Public Space changes."
        : "当前账号只能查询和分析公共空间，不能修改公共资源。请切换到个人空间执行个人资源指令；如需修改公共空间，请使用具备公共空间管理权限的账号。",
      403,
    );
  }
  return { mutation, referencesPublic, referencesPersonal };
}

module.exports = { instructionPreflight, mutationIntent, policyError };
