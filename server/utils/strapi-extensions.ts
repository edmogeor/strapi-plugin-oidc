import type { Core } from '@strapi/types';

interface StrapiServiceMap {
  get(name: string): unknown;
}

interface EventHub {
  emit(event: string, data: unknown): void;
}

interface SessionManager {
  hasOrigin(origin: string): boolean;
  (origin: string): {
    generateRefreshToken(
      userId: string,
      deviceId: string,
      opts: { type: 'refresh' | 'session' },
    ): Promise<{ token: string; absoluteExpiresAt: string }>;
    generateAccessToken(refreshToken: string): Promise<{ token: string } | { error: string }>;
    invalidateRefreshToken(id: string): Promise<void>;
  };
}

interface WebhookStore {
  allowedEvents: { get(event: string): string };
}

type AugmentedStrapi = Core.Strapi & {
  serviceMap?: StrapiServiceMap;
  sessionManager?: SessionManager;
};

function augment(strapi: Core.Strapi): AugmentedStrapi {
  return strapi as AugmentedStrapi;
}

export function getEventHub(strapi: Core.Strapi): EventHub | undefined {
  const s = augment(strapi);
  const service = s.serviceMap?.get('eventHub') as EventHub | undefined;
  return service ?? ((strapi as { eventHub?: unknown }).eventHub as EventHub | undefined);
}

export function getSessionManager(strapi: Core.Strapi): SessionManager | undefined {
  return augment(strapi).sessionManager;
}

export function getWebhookStore(strapi: Core.Strapi): WebhookStore | undefined {
  return augment(strapi).serviceMap?.get('webhookStore') as WebhookStore | undefined;
}
