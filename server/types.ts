import type { Context } from 'koa';

/**
 * Strapi augments the Koa context with a `send` helper used throughout
 * the plugin's route handlers.
 */
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
  roles: string[];
}

export interface StrapiAdminUser {
  id: number;
  email: string;
  firstname?: string;
  lastname?: string;
  password?: string;
  roles?: Array<{ id: number; name: string; code: string }>;
}

/** Minimal shape of the OIDC userinfo endpoint response. */
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
  renderSignUpSuccess(jwtToken: string, user: StrapiAdminUser, nonce: string): string;
  renderSignUpError(message: string): string;
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
}

export interface WhitelistService {
  getSettings(): Promise<WhitelistSettings>;
  setSettings(settings: WhitelistSettings): Promise<void>;
  getUsers(): Promise<WhitelistEntry[]>;
  registerUser(email: string, roles: string[]): Promise<void>;
  removeUser(id: number): Promise<void>;
  checkWhitelistForEmail(email: string): Promise<WhitelistEntry | null>;
}

export interface AdminUserService {
  findOneByEmail(email: string): Promise<StrapiAdminUser | null>;
}

export type AuditAction =
  | 'login_success'
  | 'login_failure'
  | 'missing_code'
  | 'state_mismatch'
  | 'nonce_mismatch'
  | 'token_exchange_failed'
  | 'whitelist_rejected'
  | 'logout'
  | 'session_expired'
  | 'user_created';

export interface AuditEntry {
  action: AuditAction;
  email?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogRecord extends AuditEntry {
  id: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogService {
  log(entry: AuditEntry): Promise<void>;
  find(opts?: { page?: number; pageSize?: number }): Promise<{
    results: AuditLogRecord[];
    pagination: { page: number; pageSize: number; total: number; pageCount: number };
  }>;
  findAll(): Promise<AuditLogRecord[]>;
  clearAll(): Promise<void>;
  cleanup(retentionDays: number): Promise<void>;
}
