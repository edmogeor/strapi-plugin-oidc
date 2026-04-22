import { errorCodes, getErrorDetail } from '../../error-strings';
import { userFacingMessages } from '../../audit-error-strings';
import { negotiateLocale } from '../../i18n';
import { OidcError, OIDC_ERROR_DISPATCH } from '../../oidc-errors';
import { getClientIp } from '../../utils/ip';
import { toMessage } from './shared';
import type {
  StrapiContext,
  OidcUserInfo,
  OAuthService,
  AuditAction,
  AuditLogService,
} from '../../types';

type OidcErrorInfo = {
  action: AuditAction;
  code: (typeof errorCodes)[keyof typeof errorCodes];
  key?: string;
  params?: Record<string, string | number>;
};

export function classifyOidcError(e: unknown, userInfo?: OidcUserInfo): OidcErrorInfo {
  const kind = e instanceof OidcError ? e.kind : 'unknown';
  const dispatch = OIDC_ERROR_DISPATCH[kind];
  const msg = toMessage(e);

  let params: Record<string, string | number> | undefined;
  if (kind === 'id_token_parse_failed' || kind === 'id_token_invalid' || kind === 'unknown') {
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

  await auditLog.log({
    action: errorInfo.action,
    email: userInfo?.email,
    ip: getClientIp(ctx),
    detailsKey: errorInfo.action,
    detailsParams: errorInfo.action === 'login_failure' ? { message } : undefined,
  });
  strapi.log.error({
    code: errorInfo.code,
    phase: 'oidc_callback',
    message: e instanceof Error ? e.message : 'Unknown sign-in error',
    detail: errorInfo.key ? getErrorDetail(errorInfo.key, errorInfo.params) : undefined,
    email: userInfo?.email,
  });
  const locale = negotiateLocale(ctx.request.headers['accept-language'] as string | undefined);
  ctx.send(oauthService.renderSignUpError(userFacingMessages(locale).signInError, locale));
}
