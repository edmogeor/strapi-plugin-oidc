const PLUGIN_UID = 'plugin::strapi-plugin-oidc';
const DEFAULT_RETENTION_DAYS = 90;

function getPluginConfig(): Record<string, unknown> {
  return strapi.config.get(PLUGIN_UID) as Record<string, unknown>;
}

export function getRetentionDays(): number {
  const config = getPluginConfig();
  return Number(config.AUDIT_LOG_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
}

export function isAuditLogEnabled(): boolean {
  return getRetentionDays() !== 0;
}
