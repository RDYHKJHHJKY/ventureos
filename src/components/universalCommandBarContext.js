export const getSafeCommandContext = (context) => ({
  workspaceId: '',
  ...context,
});

export const isCommandContextAvailable = (context, cmd) => {
  const safeContext = getSafeCommandContext(context);

  if (!cmd) return false;

  if (cmd.requiresEntity) {
    const requiredEntities = Array.isArray(cmd.requiresEntity) ? cmd.requiresEntity : [cmd.requiresEntity];
    if (!safeContext.activeEntity) return false;
    if (!requiredEntities.includes(safeContext.activeEntity.entityType)) return false;
  }

  if (!cmd.requiredContext || cmd.requiredContext.length === 0) return true;

  return cmd.requiredContext.every((scope) => {
    switch (scope) {
      case 'passport':
        return Boolean(safeContext.activePassportId || safeContext.activeEntity?.entityType === 'passport');
      case 'evidence':
        return Boolean(safeContext.activeEvidenceId || safeContext.activeEntity?.entityType === 'evidence');
      case 'file':
        return Boolean(safeContext.activeFileId || safeContext.activeEntity?.entityType === 'file');
      case 'integration':
        return Boolean(safeContext.activeIntegrationId || safeContext.activeEntity?.entityType === 'integration');
      case 'user':
        return Boolean(safeContext.activeUserId || safeContext.activeEntity?.entityType === 'user');
      case 'workspace':
        return Boolean(safeContext.workspaceId);
      case 'system':
        return true;
      default:
        return true;
    }
  });
};
