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

declare global {
  var strapiInstance: Core.Strapi;
  var __testOidcNonce: string | undefined;
}

export type { Core };

export interface WhitelistInfoBody {
  useWhitelist: boolean;
  enforceOIDC: boolean;
  enforceOIDCConfig: unknown;
  whitelistUsers: WhitelistEntry[];
  auditLogEnabled: boolean;
}

export interface RegisterBody {
  acceptedCount: number;
  alreadyWhitelistedCount: number;
  rejectedEmails: string[];
  message?: string;
  error?: string;
}

export interface ImportBody {
  importedCount: number;
}

export interface OidcRole {
  id: number;
  oauth_type: string;
  role: number[];
}

export interface MockCtx {
  request?: {
    body?: unknown;
    secure?: boolean;
    query?: Record<string, unknown>;
  };
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  status?: number;
  body?: unknown;
  headers?: Record<string, unknown>;
  redirectedTo?: string;
  send?(data: unknown, status?: number): void;
  set?(name: string, value: string | string[]): void;
  res?: {
    setHeader: (name: string, value: string | string[]) => void;
    getHeader: (name: string) => string | string[] | undefined;
  };
  cookies?: {
    get: (name: string) => string | undefined;
    set: (name: string, value: string | null, opts?: Record<string, unknown>) => void;
    calls: Array<{ name: string; value: string; opts?: Record<string, unknown> }>;
  };
  redirect?(url: string): void;
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

export interface AuditLogController {
  find(ctx: MockCtx): Promise<void>;
  export(ctx: MockCtx): Promise<void>;
  clearAll(ctx: MockCtx): Promise<void>;
}
