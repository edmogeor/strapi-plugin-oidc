import { z } from 'zod';
import type { Core } from '@strapi/types';
import { errorMessages } from '../error-strings';
import type { PluginConfig } from '../../shared/config';
import { DISCOVERY_TIMEOUT_MS, OIDC_DISCOVERY_PATH } from '../../shared/constants';

const discoveryDocumentSchema = z
  .object({
    issuer: z.string().optional(),
    authorization_endpoint: z.string().optional(),
    token_endpoint: z.string().optional(),
    userinfo_endpoint: z.string().optional(),
    end_session_endpoint: z.string().optional(),
    jwks_uri: z.string().optional(),
  })
  .passthrough();

type DiscoveryDocument = z.infer<typeof discoveryDocumentSchema>;

// Maps OIDC discovery document fields to plugin config keys.
// Individual config vars take precedence; discovery only fills in empty values.
const FIELD_MAP: [
  (
    | 'authorization_endpoint'
    | 'token_endpoint'
    | 'userinfo_endpoint'
    | 'end_session_endpoint'
    | 'jwks_uri'
  ),
  keyof PluginConfig,
][] = [
  ['authorization_endpoint', 'OIDC_AUTHORIZATION_ENDPOINT'],
  ['token_endpoint', 'OIDC_TOKEN_ENDPOINT'],
  ['userinfo_endpoint', 'OIDC_USERINFO_ENDPOINT'],
  ['end_session_endpoint', 'OIDC_END_SESSION_ENDPOINT'],
  ['jwks_uri', 'OIDC_JWKS_URI'],
];

export async function applyDiscovery(strapi: Core.Strapi): Promise<void> {
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as PluginConfig;
  const issuer = config.OIDC_ISSUER;
  if (!issuer) {
    strapi.log.warn(errorMessages.OIDC_ISSUER_NOT_CONFIGURED);
    return;
  }

  let discoveryUrl: string;
  let canonicalIssuer: string;

  if (issuer.includes(OIDC_DISCOVERY_PATH)) {
    discoveryUrl = issuer;
    canonicalIssuer = issuer.replace(OIDC_DISCOVERY_PATH, '');
  } else {
    discoveryUrl = issuer.replace(/\/$/, '') + OIDC_DISCOVERY_PATH;
    canonicalIssuer = issuer.replace(/\/$/, '');
  }

  let doc: DiscoveryDocument;
  try {
    const res = await fetch(discoveryUrl, { signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parseResult = discoveryDocumentSchema.safeParse(await res.json());
    if (!parseResult.success) throw new Error('malformed discovery document');
    doc = parseResult.data;
  } catch (e) {
    strapi.log.error(
      errorMessages.DISCOVERY_FETCH_ERROR(discoveryUrl, e instanceof Error ? e.message : String(e)),
    );
    return;
  }

  const updates: Partial<PluginConfig> = { OIDC_ISSUER: canonicalIssuer };
  for (const [docField, configKey] of FIELD_MAP) {
    if (doc[docField]) {
      (updates as Record<string, string>)[configKey] = doc[docField] as string;
    }
  }

  if (Object.keys(updates).length > 1) {
    strapi.config.set('plugin::strapi-plugin-oidc', { ...config, ...updates });
    strapi.log.info(`[strapi-plugin-oidc] Discovery applied: ${Object.keys(updates).join(', ')}`);
  }
}
