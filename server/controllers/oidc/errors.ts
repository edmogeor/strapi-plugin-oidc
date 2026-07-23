import { randomUUID } from 'node:crypto';
import { errorCodes, getErrorDetail } from '../../error-strings';
import { getLocaleFromContext, t } from '../../i18n';
import { OidcError, OIDC_ERROR_DISPATCH } from '../../oidc-errors';
import { getClientIp } from '../../utils/ip';
import { toMessage } from '../../../shared/utils';
import type {
  StrapiContext,
  OidcUserInfo,
  OAuthService,
  AuditAction,
  AuditLogService,
} from '../../types';

export function sendErrorResponse(
  ctx: StrapiContext,
  oauthService: OAuthService,
  message: string,
  locale: string,
): void {
  const nonce = randomUUID();
  ctx.state.oidcCsp = `script-src 'nonce-${nonce}'`;
  ctx.send(oauthService.renderSignUpError(message, locale));
}

type OidcErrorInfo = {
  action: AuditAction;
  code: (typeof errorCodes)[keyof typeof errorCodes];
  key?: string;
  // String-only to stay aligned with AuditEntry.detailsParams. getErrorDetail
  // accepts string | number, but OidcErrorInfo only ever carries strings, so
  // narrowing here keeps the log path from drifting into the audit contract.
  params?: Record<string, string>;
};

function classifyOidcError(e: unknown, userInfo?: OidcUserInfo): OidcErrorInfo {
  const kind = e instanceof OidcError ? e.kind : 'unknown';
  const dispatch = OIDC_ERROR_DISPATCH[kind];
  const msg = toMessage(e);

  let params: Record<string, string> | undefined;
  if (kind === 'unknown') {
    params = { error: msg };
  } else if (kind === 'user_creation_failed' && userInfo?.email) {
    params = { email: userInfo.email, error: msg };
  }

  return {
    action: dispatch.action,
    code: dispatch.code,
    key: dispatch.key,
    params,
  };
}

export async function handleCallbackError(
  e: unknown,
  userInfo: OidcUserInfo | undefined,
  auditLog: AuditLogService,
  oauthService: OAuthService,
  ctx: StrapiContext,
): Promise<void> {
  const errorInfo = classifyOidcError(e, userInfo);
  const message = toMessage(e);

  let detailsParams: Record<string, string> | undefined;
  if (errorInfo.action === 'login_failure') {
    detailsParams = { message };
  } else if (errorInfo.action === 'whitelist_rejected' && userInfo?.email) {
    detailsParams = { email: userInfo.email };
  } else if (errorInfo.action === 'email_not_verified' && userInfo?.email) {
    detailsParams = { email: userInfo.email };
  }

  await auditLog.log({
    action: errorInfo.action,
    email: userInfo?.email,
    ip: getClientIp(strapi, ctx),
    detailsKey: errorInfo.action,
    detailsParams,
  });
  strapi.log.error({
    code: errorInfo.code,
    phase: 'oidc_callback',
    message: e instanceof Error ? e.message : 'Unknown sign-in error',
    detail: errorInfo.key ? getErrorDetail(errorInfo.key, errorInfo.params) : undefined,
    email: userInfo?.email,
  });
  const locale = getLocaleFromContext(ctx);
  sendErrorResponse(ctx, oauthService, t(locale, 'user.signInError'), locale);
}
