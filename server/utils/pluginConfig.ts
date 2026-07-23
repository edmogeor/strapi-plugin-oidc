import { pluginConfigSchema, type PluginConfig } from '../../shared/config';
import { DEFAULT_RETENTION_DAYS } from '../../shared/constants';
import type { StrapiConfig } from '../types';

export function getPluginConfig(strapi: StrapiConfig): PluginConfig {
  return pluginConfigSchema.parse(strapi.config.get('plugin::strapi-plugin-oidc') ?? {});
}

export function getRetentionDays(strapi: StrapiConfig): number {
  const config = getPluginConfig(strapi);
  return Number(config.AUDIT_LOG_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
}

export function isAuditLogEnabled(strapi: StrapiConfig): boolean {
  return getRetentionDays(strapi) !== 0;
}
