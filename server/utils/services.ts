import type {
  OAuthService,
  RoleService,
  WhitelistService,
  AuditLogService,
  AdminUserService,
} from '../types';

export const PLUGIN_NAME = 'strapi-plugin-oidc';

export const getOauthService = (): OAuthService =>
  strapi.plugin(PLUGIN_NAME).service('oauth') as OAuthService;

export const getRoleService = (): RoleService =>
  strapi.plugin(PLUGIN_NAME).service('role') as RoleService;

export const getWhitelistService = (): WhitelistService =>
  strapi.plugin(PLUGIN_NAME).service('whitelist') as WhitelistService;

export const getAuditLogService = (): AuditLogService =>
  strapi.plugin(PLUGIN_NAME).service('auditLog') as AuditLogService;

export const getAdminUserService = (): AdminUserService =>
  strapi.service('admin::user') as AdminUserService;
