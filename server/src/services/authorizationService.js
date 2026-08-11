const PERMISSIONS = Object.freeze({
  AUTHENTICATED: "authenticated",
  PUBLIC_READ: "public.read",
  PUBLIC_INTERACT: "public.interact",
  PUBLIC_ANALYZE: "public.analyze",
  PUBLIC_MANAGE: "public.manage",
  PERSONAL_READ: "personal.read",
  PERSONAL_MANAGE: "personal.manage",
  ADMIN_MANAGE: "admin.manage",
});

const REALM_PERMISSIONS = Object.freeze({
  public: Object.freeze({
    read: PERMISSIONS.PUBLIC_READ,
    interact: PERMISSIONS.PUBLIC_INTERACT,
    analyze: PERMISSIONS.PUBLIC_ANALYZE,
    manage: PERMISSIONS.PUBLIC_MANAGE,
  }),
  personal: Object.freeze({
    read: PERMISSIONS.PERSONAL_READ,
    interact: PERMISSIONS.PERSONAL_MANAGE,
    analyze: PERMISSIONS.PERSONAL_READ,
    manage: PERMISSIONS.PERSONAL_MANAGE,
  }),
});

function authorizationError(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

function authenticated(actor) {
  return Boolean(actor?.id) && actor.status !== "disabled";
}

function hasPermission(actor, permission, context = {}) {
  const signedIn = authenticated(actor);
  switch (permission) {
    case PERMISSIONS.PUBLIC_READ:
    case PERMISSIONS.PUBLIC_INTERACT:
      return true;
    case PERMISSIONS.AUTHENTICATED:
    case PERMISSIONS.PUBLIC_ANALYZE:
      return signedIn;
    case PERMISSIONS.PUBLIC_MANAGE:
    case PERMISSIONS.ADMIN_MANAGE:
      return signedIn && actor.role === "admin";
    case PERMISSIONS.PERSONAL_READ:
    case PERMISSIONS.PERSONAL_MANAGE:
      return signedIn && Boolean(context.ownerId) && context.ownerId === actor.id;
    default:
      return false;
  }
}

function assertPermission(actor, permission, context = {}) {
  if (hasPermission(actor, permission, context)) return true;
  if (!authenticated(actor))
    throw authorizationError("AUTH_REQUIRED", "请先登录", 401);
  throw authorizationError("FORBIDDEN", "没有执行该操作的权限", 403);
}

function permissionForRealm(scope, access = "manage") {
  const permissions = REALM_PERMISSIONS[scope];
  if (!permissions)
    throw authorizationError("INVALID_SCOPE", "无效空间范围", 400);
  const permission = permissions[access];
  if (!permission)
    throw authorizationError("INVALID_PERMISSION", "无效权限类型", 400);
  return permission;
}

function assertRealmPermission(actor, current, access = "manage") {
  const scope = current?.scope;
  const permission = permissionForRealm(scope, access);
  return assertPermission(actor, permission, {
    scope,
    ownerId: current?.ownerId ?? current?.owner_id ?? null,
  });
}

module.exports = {
  PERMISSIONS,
  REALM_PERMISSIONS,
  authenticated,
  hasPermission,
  assertPermission,
  permissionForRealm,
  assertRealmPermission,
  authorizationError,
};
