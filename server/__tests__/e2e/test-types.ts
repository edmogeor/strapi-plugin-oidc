import type { Core } from '@strapi/types';
import type {
  WhitelistEntry,
  WhitelistSettings,
  WhitelistService,
  RoleService,
  OAuthService,
  AdminRole,
  AuditLogService,
} from '../../types';

export type {
  WhitelistEntry,
  WhitelistSettings,
  WhitelistService,
  RoleService,
  OAuthService,
  AdminRole,
  AuditLogService,
};

// Typed global used by setup.ts and all test files.
declare global {
  // eslint-disable-next-line no-var
  var strapiInstance: Core.Strapi;
}

export type { Core };

// A role record as stored by the plugin's roles content-type.
export interface OidcRole {
  id: number;
  oauth_type: string;
  role: number[];
}

// Minimal mock context used in controller unit-style tests.
export interface MockCtx {
  request?: {
    body?: unknown;
    secure?: boolean;
  };
  params?: Record<string, unknown>;
  status?: number;
  body?: unknown;
  redirectedTo?: string;
  send?: (data: unknown, status?: number) => void;
  cookies?: {
    get: (name: string) => string | undefined;
    set: (name: string, value: string | null, opts?: Record<string, unknown>) => void;
    calls: Array<{ name: string; value: string; opts?: Record<string, unknown> }>;
  };
  redirect?: (url: string) => void;
}

export interface WhitelistController {
  info(ctx: MockCtx): Promise<void>;
  updateSettings(ctx: MockCtx): Promise<void>;
  register(ctx: MockCtx): Promise<void>;
  removeEmail(ctx: MockCtx): Promise<void>;
  importUsers(ctx: MockCtx): Promise<void>;
  syncUsers(ctx: MockCtx): Promise<void>;
  deleteAll(ctx: MockCtx): Promise<void>;
  publicSettings(ctx: MockCtx): Promise<void>;
}

export interface RoleController {
  find(ctx: MockCtx): Promise<void>;
  update(ctx: MockCtx): Promise<void>;
}

export interface OidcController {
  logout(ctx: MockCtx): Promise<void>;
}
