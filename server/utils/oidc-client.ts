import * as client from 'openid-client';
import type { Configuration, ClientAuth } from 'openid-client';
import * as jose from 'jose';
import type { PluginConfig } from '../../shared/config';
import { parseClientAssertion } from '../../shared/config';

let configPromise: Promise<Configuration> | null = null;

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

      return client.discovery(new URL(OIDC_ISSUER), OIDC_CLIENT_ID, metadata, clientAuthentication);
    })();
  }
  return configPromise;
}

export function resetOidcConfig(): void {
  configPromise = null;
}
