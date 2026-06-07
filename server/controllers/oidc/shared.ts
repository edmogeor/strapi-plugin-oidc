import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose';
import type { JWTPayload } from 'jose';
import { errorMessages } from '../../error-strings';
import { OidcError } from '../../oidc-errors';
import { toMessage } from '../../../shared/utils';
import { OIDC_CALLBACK_PATH } from '../../../shared/constants';
import type { PluginConfig } from '../../../shared/config';

const REQUIRED_CONFIG_KEYS = [
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_SCOPE',
  'OIDC_FAMILY_NAME_FIELD',
  'OIDC_GIVEN_NAME_FIELD',
  // Populated at bootstrap from OIDC_ISSUER — checked here as a runtime safety net
  'OIDC_TOKEN_ENDPOINT',
  'OIDC_USERINFO_ENDPOINT',
  'OIDC_AUTHORIZATION_ENDPOINT',
] as const;

export function resolveRedirectUri(config: PluginConfig): string {
  const publicUrl = config.OIDC_PUBLIC_URL || process.env.PUBLIC_URL || '';
  return `${publicUrl}${OIDC_CALLBACK_PATH}`;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
let jwksDisabledWarned = false;

function getJwks(uri: string) {
  let jwks = jwksCache.get(uri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(uri));
    jwksCache.set(uri, jwks);
  }
  return jwks;
}

export async function verifyIdToken(
  idToken: string,
  config: PluginConfig,
): Promise<JWTPayload | null> {
  const jwksUri = config.OIDC_JWKS_URI;
  const issuer = config.OIDC_ISSUER;
  if (!jwksUri) {
    if (!jwksDisabledWarned) {
      jwksDisabledWarned = true;
      strapi.log.warn(errorMessages.JWKS_URI_NOT_CONFIGURED);
    }
    return null;
  }

  try {
    const jwks = getJwks(jwksUri);
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: issuer || undefined,
      audience: config.OIDC_CLIENT_ID,
    });
    return payload;
  } catch (e) {
    if (
      e instanceof joseErrors.JWTClaimValidationFailed ||
      e instanceof joseErrors.JWSSignatureVerificationFailed ||
      e instanceof joseErrors.JWTExpired ||
      e instanceof joseErrors.JWTInvalid ||
      e instanceof joseErrors.JWSInvalid
    ) {
      const msg = toMessage(e);
      throw new OidcError('id_token_invalid', msg, e);
    }
    throw e;
  }
}

export function configValidation(): PluginConfig {
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as PluginConfig;

  const missing = REQUIRED_CONFIG_KEYS.filter((key) => !config[key]);
  if (missing.length === 0) {
    return config;
  }
  throw new Error(errorMessages.MISSING_CONFIG(missing.join(', ')));
}
