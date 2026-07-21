import * as client from 'openid-client';
import type { Configuration, ClientAuth } from 'openid-client';
import * as jose from 'jose';
import type { PluginConfig } from '../../shared/config';
import { parseClientAssertion } from '../../shared/config';
import { OIDC_DISCOVERY_TIMEOUT_MS } from '../../shared/constants';

let configPromise: Promise<Configuration> | null = null;

function tryDiscovery(
  issuer: string,
  clientId: string,
  metadata: string | undefined,
  clientAuthentication: ClientAuth | undefined,
  options: { timeout: number },
): Promise<Configuration> {
  return client
    .discovery(new URL(issuer), clientId, metadata, clientAuthentication, options)
    .catch((err) => {
      const isIssuerMismatch =
        err instanceof client.ClientError &&
        err.code === 'OAUTH_JSON_ATTRIBUTE_COMPARISON_FAILED' &&
        err.message.includes('issuer');

      if (!isIssuerMismatch) throw err;

      const altIssuer = issuer.endsWith('/') ? issuer.slice(0, -1) : `${issuer}/`;

      return client.discovery(
        new URL(altIssuer),
        clientId,
        metadata,
        clientAuthentication,
        options,
      );
    });
}

export function getOidcConfig(): Promise<Configuration> {
  if (!configPromise) {
    const config = strapi.config.get('plugin::strapi-plugin-oidc') as PluginConfig;
    const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET } = config;

    configPromise = (async () => {
      let clientAuthentication: ClientAuth | undefined;
      let metadata: string | undefined;

      const assertionConfig = parseClientAssertion(config.OIDC_CLIENT_ASSERTION);
      if (assertionConfig) {
        const cryptoKey = await jose.importPKCS8(
          assertionConfig.privateKey,
          assertionConfig.algorithm,
        );
        clientAuthentication = client.PrivateKeyJwt({ key: cryptoKey, kid: assertionConfig.keyId });
      } else {
        metadata = OIDC_CLIENT_SECRET;
      }

      return tryDiscovery(OIDC_ISSUER, OIDC_CLIENT_ID, metadata, clientAuthentication, {
        timeout: OIDC_DISCOVERY_TIMEOUT_MS,
      });
    })().catch((err) => {
      configPromise = null;
      throw err;
    });
  }
  return configPromise;
}

export function resetOidcConfig(): void {
  configPromise = null;
}
