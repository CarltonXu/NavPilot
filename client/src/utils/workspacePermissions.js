export function workspaceCapabilities({
  space,
  authenticated,
  isAdmin,
  mustChangePassword,
  ready,
  publicEditMode,
  personalEditMode,
  recognizing,
}) {
  const isPersonalOwner = space === "personal" && authenticated && ready;
  const canEditPublic =
    space === "public" && isAdmin && !mustChangePassword && ready;
  const canUseSpaceTools = isPersonalOwner || canEditPublic;

  return {
    isPersonalOwner,
    canEditPublic,
    canUseSpaceTools,
    // Context-menu mutations are intentionally available outside edit mode.
    canConfigureItems: canUseSpaceTools && !recognizing,
    // Edit mode only controls inline controls, dragging and bulk selection.
    canManage:
      (canEditPublic && publicEditMode) ||
      (isPersonalOwner && personalEditMode),
  };
}
