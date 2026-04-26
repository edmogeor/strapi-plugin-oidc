import type { Context } from 'koa';
import type { AuditEntry, AuditLogRecord } from '../shared/audit-actions';
import type { GroupRoleMap } from '../shared/constants';
export { AuditAction, AuditEntry, AuditLogRecord } from '../shared/audit-actions';

export interface StrapiContext extends Context {
  send(body: unknown, status?: number): void;
}

export interface WhitelistSettings {
  useWhitelist: boolean;
  enforceOIDC: boolean;
}

export interface WhitelistEntry {
  id: number;
  email: string;
}

export interface StrapiAdminUser {
  id: number;
  email: string;
  firstname?: string;
  lastname?: string;
  password?: string;
  roles?: Array<{ id: number; name: string; code: string }>;
}

export interface OidcUserInfo {
  email: string;
  [key: string]: unknown;
}

export interface OAuthService {
  createUser(
    email: string,
    familyName: string,
    givenName: string,
    locale: string,
    roles: string[],
  ): Promise<StrapiAdminUser>;
  generateToken(user: StrapiAdminUser, ctx: StrapiContext): Promise<string>;
  localeFindByHeader(headers: Record<string, string>): string;
  triggerWebHook(user: StrapiAdminUser): Promise<void>;
  triggerSignInSuccess(user: StrapiAdminUser): void;
  renderSignUpSuccess(
    jwtToken: string,
    user: StrapiAdminUser,
    nonce: string,
    locale?: string,
  ): string;
  renderSignUpError(message: string, locale?: string): string;
  addGmailAlias(email: string, alias: string): string;
}

export interface AdminRole {
  id: number;
  name: string;
  code: string;
  [key: string]: unknown;
}

export interface RoleService {
  oidcRoles(): Promise<{ roles: string[] } | null>;
  getOidcRoles(): AdminRole[];
  find(): Promise<AdminRole[]>;
  update(roles: unknown): Promise<void>;
}

export interface WhitelistService {
  getSettings(): Promise<WhitelistSettings>;
  setSettings(settings: WhitelistSettings): Promise<void>;
  getUsers(): Promise<WhitelistEntry[]>;
  registerUser(email: string): Promise<void>;
  removeUser(email: string): Promise<void>;
  checkWhitelistForEmail(email: string): Promise<WhitelistEntry | null>;
  hasUser(email: string): Promise<boolean>;
  deleteAllUsers(): Promise<void>;
}

export interface AdminUserService {
  findOneByEmail(email: string, populate?: string[]): Promise<StrapiAdminUser | null>;
}

export interface AuditLogService {
  log(entry: AuditEntry): Promise<void>;
  find(opts?: {
    page?: number;
    pageSize?: number;
    filters?: import('./audit-log-filters').AuditLogFilters;
  }): Promise<{
    results: AuditLogRecord[];
    pagination: { page: number; pageSize: number; total: number; pageCount: number };
  }>;
  clearAll(): Promise<void>;
  cleanup(retentionDays: number): Promise<void>;
}
