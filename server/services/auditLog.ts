import type { AuditEntry, AuditLogRecord } from '../types';

export default function auditLogService({ strapi }) {
  return {
    async log({ action, email, ip, metadata }: AuditEntry): Promise<void> {
      const config = strapi.config.get('plugin::strapi-plugin-oidc') as Record<string, unknown>;
      if (Number(config.AUDIT_LOG_RETENTION_DAYS ?? 90) === 0) return;

      await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').create({
        data: {
          action,
          email: email ?? null,
          ip: ip ?? null,
          metadata: metadata ?? null,
        },
      });

      const eventHub = strapi.serviceMap?.get?.('eventHub') ?? strapi.eventHub;
      if (eventHub) {
        eventHub.emit(`strapi-plugin-oidc::auth.${action}`, {
          email,
          ip,
          metadata,
          provider: 'strapi-plugin-oidc',
        });
      }
    },

    async find({ page = 1, pageSize = 25 }: { page?: number; pageSize?: number } = {}): Promise<{
      results: AuditLogRecord[];
      pagination: { page: number; pageSize: number; total: number; pageCount: number };
    }> {
      return strapi.db.query('plugin::strapi-plugin-oidc.audit-log').findPage({
        sort: { createdAt: 'desc' },
        page,
        pageSize,
      });
    },

    async findAll(): Promise<AuditLogRecord[]> {
      return strapi.db.query('plugin::strapi-plugin-oidc.audit-log').findMany({
        orderBy: { createdAt: 'desc' },
      });
    },

    async clearAll(): Promise<void> {
      await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').deleteMany({});
    },

    async cleanup(retentionDays: number): Promise<void> {
      const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
      await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').deleteMany({
        where: { createdAt: { $lt: cutoff } },
      });
    },
  };
}
