import { Box, Flex, Typography } from '@strapi/design-system';
import { ReactNode, useState } from 'react';
import { Download, Trash } from '@strapi/icons';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useIntl } from 'react-intl';
import getTrad from '../../utils/getTrad';
import { ConfirmDialog, SizedButton, TablePagination } from '../shared';
import { FilterBar } from './FilterBar';
import { LogTable } from './LogTable';
import { useAuditLogs } from './useAuditLogs';
import { buildQueryString } from './queryString';
import type { FilterState } from './types';

export default function AuditLog({ title }: { title?: ReactNode } = {}) {
  const { formatMessage } = useIntl();
  const { del } = useFetchClient();
  const { toggleNotification } = useNotification();

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FilterState>({});
  const { records, pagination, loading } = useAuditLogs(page, filters);

  const handleClearAll = async () => {
    try {
      await del('/strapi-plugin-oidc/audit-logs');
      toggleNotification({
        type: 'success',
        message: formatMessage(getTrad('auditlog.clear.success')),
      });
      setFilters({});
      setPage(1);
    } catch {
      toggleNotification({
        type: 'danger',
        message: formatMessage(getTrad('auditlog.clear.error')),
      });
    }
  };

  const handleExport = async () => {
    try {
      const cookieMatch = document.cookie.match(/(?:^|;\s*)jwtToken=([^;]+)/);
      const token = cookieMatch ? decodeURIComponent(cookieMatch[1]) : '';
      const queryString = buildQueryString({ filters });
      const response = await fetch(`/strapi-plugin-oidc/audit-logs/export?${queryString}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        toggleNotification({
          type: 'danger',
          message: formatMessage(getTrad('auditlog.export.error')),
        });
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oidc-audit-log-${new Date().toISOString().slice(0, 10)}.ndjson`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toggleNotification({
        type: 'danger',
        message: formatMessage(getTrad('auditlog.export.error')),
      });
    }
  };

  const clearFilters = () => {
    setFilters({});
    setPage(1);
  };

  const hasActiveFilters = !!(
    filters.action?.length ||
    filters.email?.length ||
    filters.ip?.length ||
    filters.createdAt?.length
  );

  return (
    <Box>
      <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
        {title ?? <span />}
        <Flex gap={2}>
          <SizedButton
            size="S"
            variant="tertiary"
            startIcon={<Download />}
            onClick={handleExport}
            disabled={pagination.total === 0}
          >
            {formatMessage(getTrad('button.export'))}
          </SizedButton>
          <ConfirmDialog
            trigger={
              <SizedButton
                size="S"
                variant="danger-light"
                startIcon={<Trash />}
                disabled={pagination.total === 0}
              >
                {formatMessage(getTrad('button.clear'))}
              </SizedButton>
            }
            title={formatMessage(getTrad('auditlog.clear.title'))}
            body={
              <Flex justifyContent="center">
                <Typography textColor="neutral800" textAlign="center">
                  {formatMessage(getTrad('auditlog.clear.description'), {
                    count: pagination.total,
                  })}
                </Typography>
              </Flex>
            }
            confirmLabel={formatMessage(getTrad('button.clear'))}
            onConfirm={handleClearAll}
          />
        </Flex>
      </Flex>

      <FilterBar
        filters={filters}
        hasActiveFilters={hasActiveFilters}
        onFiltersChange={setFilters}
        onResetPage={() => setPage(1)}
        onClear={clearFilters}
      />

      <LogTable records={records} loading={loading} hasActiveFilters={hasActiveFilters} />

      <TablePagination
        page={page}
        pageCount={pagination.pageCount}
        onPageChange={setPage}
        total={pagination.total}
      />
    </Box>
  );
}
