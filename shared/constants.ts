const PLUGIN_UID = 'plugin::strapi-plugin-oidc';

export const CONTENT_TYPES = {
  AUDIT_LOG: `${PLUGIN_UID}.audit-log`,
  ROLES: `${PLUGIN_UID}.roles`,
  WHITELIST: `${PLUGIN_UID}.whitelists`,
} as const;

export const PERMISSIONS = {
  READ: `${PLUGIN_UID}.read`,
  WHITELIST_READ: `${PLUGIN_UID}.whitelist.read`,
  WHITELIST_WRITE: `${PLUGIN_UID}.whitelist.write`,
  WHITELIST_DELETE: `${PLUGIN_UID}.whitelist.delete`,
  AUDIT_READ: `${PLUGIN_UID}.audit.read`,
  AUDIT_DELETE: `${PLUGIN_UID}.audit.delete`,
} as const;

export const COOKIE_MAX_AGE_MS = 300000; // 5 minutes

export const LOGOUT_USERINFO_TIMEOUT_MS = 1500;

export const AUDIT_LOG_DEFAULTS = {
  PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
  EXPORT_PAGE_SIZE: 500,
  ADMIN_PAGE_SIZE: 10,
  BATCH_DELETE_SIZE: 1000,
} as const;

export const RATE_LIMIT = {
  WINDOW_MS: 60_000,
  MAX_REQUESTS: 1_000,
  MAX_MAP_SIZE: 10_000,
  PRUNE_THRESHOLD: 1_000,
} as const;

export const CACHE_TTL = {
  SETTINGS_MS: 5 * 60 * 1000, // 5 minutes
} as const;

export const DEFAULT_RETENTION_DAYS = 90;

export const DAY_MS = 86_400_000;

export const DISCOVERY_TIMEOUT_MS = 5000;

export const UI_DEFAULTS = {
  MIN_SPINNER_MS: 400,
} as const;

export type ContentTypeUid = (typeof CONTENT_TYPES)[keyof typeof CONTENT_TYPES];
// fallow-ignore-next-line unused-types
export type PermissionAction = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
