import type { PluginConfig } from '../types';

const PLUGIN_UID = 'plugin::strapi-plugin-oidc';
const DEFAULT_RETENTION_DAYS = 90;

export function getPluginConfig(): PluginConfig {
  return strapi.config.get(PLUGIN_UID) as PluginConfig;
}

// fallow-ignore-next-line unused-exports
export function getPublicConfig(): Record<string, unknown> {
  const config = getPluginConfig();
  return {
    OIDC_SSO_BUTTON_TEXT: config.OIDC_SSO_BUTTON_TEXT,
  };
}

export function getRetentionDays(): number {
  const config = getPluginConfig();
  return Number(config.AUDIT_LOG_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
}

export function isAuditLogEnabled(): boolean {
  return getRetentionDays() !== 0;
}
