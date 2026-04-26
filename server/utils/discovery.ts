import type { Core } from '@strapi/types';
import { errorMessages } from '../error-strings';
import type { PluginConfig } from '../../shared/config';
import { DISCOVERY_TIMEOUT_MS } from '../../shared/constants';

interface DiscoveryDocument {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
  jwks_uri?: string;
}

// Maps OIDC discovery document fields to plugin config keys.
// Individual config vars take precedence; discovery only fills in empty values.
const FIELD_MAP: [keyof DiscoveryDocument, keyof PluginConfig][] = [
  ['issuer', 'OIDC_ISSUER'],
  ['authorization_endpoint', 'OIDC_AUTHORIZATION_ENDPOINT'],
  ['token_endpoint', 'OIDC_TOKEN_ENDPOINT'],
  ['userinfo_endpoint', 'OIDC_USERINFO_ENDPOINT'],
  ['end_session_endpoint', 'OIDC_END_SESSION_ENDPOINT'],
  ['jwks_uri', 'OIDC_JWKS_URI'],
];

export async function applyDiscovery(strapi: Core.Strapi): Promise<void> {
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as PluginConfig;
  const discoveryUrl = config.OIDC_DISCOVERY_URL;
  if (!discoveryUrl) return;

  let doc: DiscoveryDocument;
  try {
    const res = await fetch(discoveryUrl, { signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    doc = (await res.json()) as DiscoveryDocument;
  } catch (e) {
    strapi.log.error(
      errorMessages.DISCOVERY_FETCH_ERROR(discoveryUrl, e instanceof Error ? e.message : String(e)),
    );
    return;
  }

  const updates: Partial<PluginConfig> = {};
  for (const [docField, configKey] of FIELD_MAP) {
    if (doc[docField]) {
      (updates as Record<string, string>)[configKey] = doc[docField] as string;
    }
  }

  if (Object.keys(updates).length > 0) {
    strapi.config.set('plugin::strapi-plugin-oidc', { ...config, ...updates });
    strapi.log.info(`[strapi-plugin-oidc] Discovery applied: ${Object.keys(updates).join(', ')}`);
  }
}
