import type { PluginConfig } from '../../shared/config';
import { DEFAULT_RETENTION_DAYS } from '../../shared/constants';

export function getPluginConfig(): PluginConfig {
  return strapi.config.get('plugin::strapi-plugin-oidc') as PluginConfig;
}

export function getRetentionDays(): number {
  const config = getPluginConfig();
  return Number(config.AUDIT_LOG_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
}

export function isAuditLogEnabled(): boolean {
  return getRetentionDays() !== 0;
}
