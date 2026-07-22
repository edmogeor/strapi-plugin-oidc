import type { Core } from '@strapi/types';
import { pluginConfigSchema, type PluginConfig } from '../../shared/config';
import { DEFAULT_RETENTION_DAYS } from '../../shared/constants';

export function getPluginConfig(strapi: Core.Strapi): PluginConfig {
  return pluginConfigSchema.parse(strapi.config.get('plugin::strapi-plugin-oidc') ?? {});
}

export function getRetentionDays(strapi: Core.Strapi): number {
  const config = getPluginConfig(strapi);
  return Number(config.AUDIT_LOG_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
}

export function isAuditLogEnabled(strapi: Core.Strapi): boolean {
  return getRetentionDays(strapi) !== 0;
}
