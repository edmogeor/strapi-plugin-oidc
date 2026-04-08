import type { AuditEntry, AuditLogRecord } from '../types';
import { isAuditLogEnabled } from '../utils/pluginConfig';

export default function auditLogService({ strapi }) {
  return {
    async log({ action, email, ip }: AuditEntry): Promise<void> {
      if (!isAuditLogEnabled()) return;

      await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').create({
        data: {
          action,
          email: email ?? null,
          ip: ip ?? null,
        },
      });

      const eventHub = strapi.serviceMap?.get?.('eventHub') ?? strapi.eventHub;
      if (eventHub) {
        eventHub.emit(`strapi-plugin-oidc::auth.${action}`, {
          email,
          ip,
          provider: 'strapi-plugin-oidc',
        });
      }
    },

    async findAll(): Promise<AuditLogRecord[]> {
      return strapi.db.query('plugin::strapi-plugin-oidc.audit-log').findMany({
        orderBy: { createdAt: 'desc' },
      });
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

    async clearAll(): Promise<void> {
      const BATCH_SIZE = 1000;
      let deletedCount: number;
      do {
        const result = await strapi.db
          .query('plugin::strapi-plugin-oidc.audit-log')
          .deleteMany({ limit: BATCH_SIZE });
        deletedCount = result.count;
      } while (deletedCount === BATCH_SIZE);
    },

    async cleanup(retentionDays: number): Promise<void> {
      const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
      await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').deleteMany({
        where: { createdAt: { $lt: cutoff } },
      });
    },
  };
}
