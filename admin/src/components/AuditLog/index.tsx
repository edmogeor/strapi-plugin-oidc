import {
  Box,
  Button,
  Flex,
  Tbody,
  Td,
  Th,
  Thead,
  Tooltip,
  Tr,
  Typography,
  TextInput,
  Combobox,
  ComboboxOption,
} from '@strapi/design-system';
import { useCallback, useEffect, useState } from 'react';
import { Download, Information, Trash } from '@strapi/icons';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useIntl } from 'react-intl';
import qs from 'qs';
import getTrad from '../../utils/getTrad';
import { ConfirmDialog, CustomTable, LocalizedDate, TablePagination } from '../shared';
import { AUDIT_ACTIONS } from './constants';

interface AuditLogRecord {
  id: number;
  action: string;
  email?: string;
  ip?: string;
  details?: string;
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

const PAGE_SIZE = 10;

const DETAILS_TEXT_STYLE = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '180px',
  cursor: 'help',
} as const;

interface FilterState {
  action?: string;
  email?: string;
  ip?: string;
  createdAt?: string;
}

function buildQueryString(params: {
  filters?: FilterState;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  return qs.stringify(params, { encodeValuesOnly: true });
}

export default function AuditLog() {
  const { formatMessage } = useIntl();
  const { get, del } = useFetchClient();
  const { toggleNotification } = useNotification();

  const [records, setRecords] = useState<AuditLogRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    pageCount: 1,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = useCallback(
    async (p: number, f: FilterState, q: string) => {
      setLoading(true);
      try {
        const queryString = buildQueryString({
          filters: f,
          q: q || undefined,
          page: p,
          pageSize: PAGE_SIZE,
        });
        const response = await get(`/strapi-plugin-oidc/audit-logs?${queryString}`);
        setRecords(response.data.results ?? []);
        setPagination(
          response.data.pagination ?? { page: p, pageSize: PAGE_SIZE, total: 0, pageCount: 1 },
        );
      } catch {
        setRecords([]);
      } finally {
        setLoading(false);
      }
    },
    [get],
  );

  useEffect(() => {
    fetchLogs(page, filters, searchQuery);
  }, [fetchLogs, page, filters, searchQuery]);

  const handleFilterChange = (name: keyof FilterState, value: string) => {
    setFilters((prev) => {
      if (!value) {
        const { [name]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [name]: value };
    });
    setPage(1);
  };

  const handleClearAll = async () => {
    try {
      await del('/strapi-plugin-oidc/audit-logs');
      toggleNotification({
        type: 'success',
        message: formatMessage(getTrad('auditlog.clear.success')),
      });
      fetchLogs(1, {}, '');
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
      const queryString = buildQueryString({
        filters,
        q: searchQuery || undefined,
      });
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
    setSearchQuery('');
    setPage(1);
  };

  const hasActiveFilters = Object.keys(filters).length > 0 || searchQuery.length > 0;

  return (
    <Box>
      <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
        <Typography variant="pi" textColor="neutral600">
          {pagination.total} {pagination.total === 1 ? 'entry' : 'entries'}
        </Typography>
        <Flex gap={2}>
          <Button
            size="S"
            variant="tertiary"
            startIcon={<Download />}
            onClick={handleExport}
            disabled={pagination.total === 0}
          >
            {formatMessage(getTrad('auditlog.export'))}
          </Button>
          <ConfirmDialog
            trigger={
              <Button
                size="S"
                variant="danger-light"
                startIcon={<Trash />}
                disabled={pagination.total === 0}
              >
                {formatMessage(getTrad('auditlog.clear'))}
              </Button>
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
            confirmLabel={formatMessage(getTrad('auditlog.clear'))}
            onConfirm={handleClearAll}
          />
        </Flex>
      </Flex>

      <Flex justifyContent="space-between" alignItems="center" marginBottom={4} gap={4}>
        <Flex gap={2} alignItems="flex-end" wrap="wrap" style={{ flex: 1 }}>
          <Combobox
            value={filters.action ?? ''}
            onChange={(value) => handleFilterChange('action', value ?? '')}
            placeholder={formatMessage(getTrad('auditlog.filters.action'))}
            clearLabel={formatMessage(getTrad('auditlog.filters.clear'))}
            onClear={() => handleFilterChange('action', '')}
          >
            {AUDIT_ACTIONS.map((action) => (
              <ComboboxOption key={action} value={action}>
                {action}
              </ComboboxOption>
            ))}
          </Combobox>
          <TextInput
            placeholder={formatMessage(getTrad('auditlog.filters.email'))}
            value={filters.email ?? ''}
            onChange={(e) => handleFilterChange('email', e.target.value)}
          />
          <TextInput
            placeholder={formatMessage(getTrad('auditlog.filters.ip'))}
            value={filters.ip ?? ''}
            onChange={(e) => handleFilterChange('ip', e.target.value)}
          />
          <TextInput
            type="datetime-local"
            placeholder={formatMessage(getTrad('auditlog.filters.createdAt'))}
            value={filters.createdAt ?? ''}
            onChange={(e) => handleFilterChange('createdAt', e.target.value)}
          />
          {hasActiveFilters && (
            <Button size="S" variant="danger-light" onClick={clearFilters}>
              {formatMessage(getTrad('auditlog.filters.clear'))}
            </Button>
          )}
        </Flex>
      </Flex>

      <Flex justifyContent="flex-end" marginBottom={4}>
        <TextInput
          placeholder={formatMessage(getTrad('auditlog.search.placeholder'))}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
        />
      </Flex>

      <CustomTable colCount={5} rowCount={records.length}>
        <Thead>
          <Tr>
            <Th>{formatMessage(getTrad('auditlog.table.timestamp'))}</Th>
            <Th>{formatMessage(getTrad('auditlog.table.action'))}</Th>
            <Th>{formatMessage(getTrad('auditlog.table.email'))}</Th>
            <Th>{formatMessage(getTrad('auditlog.table.ip'))}</Th>
            <Th>{formatMessage(getTrad('auditlog.table.details'))}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {loading && (
            <Tr>
              <Td colSpan={5}>
                <Flex justifyContent="center" padding={4}>
                  <Typography textColor="neutral600">
                    {formatMessage(getTrad('auditlog.loading'))}
                  </Typography>
                </Flex>
              </Td>
            </Tr>
          )}
          {!loading && records.length === 0 && (
            <Tr>
              <Td colSpan={5}>
                <Flex justifyContent="center" padding={4}>
                  <Typography textColor="neutral600">
                    {hasActiveFilters
                      ? formatMessage(getTrad('auditlog.filters.empty'))
                      : formatMessage(getTrad('auditlog.table.empty'))}
                  </Typography>
                </Flex>
              </Td>
            </Tr>
          )}
          {!loading &&
            records.map((record) => (
              <Tr key={record.id}>
                <Td>
                  <Typography variant="omega">
                    <LocalizedDate date={record.createdAt} options={{ second: '2-digit' }} />
                  </Typography>
                </Td>
                <Td>
                  <Flex gap={2} alignItems="center">
                    <Typography variant="omega">{record.action}</Typography>
                    <Tooltip label={formatMessage(getTrad(`auditlog.action.${record.action}`))}>
                      <Information
                        aria-hidden
                        style={{ cursor: 'help' }}
                        width="1.4rem"
                        height="1.4rem"
                        fill="primary600"
                      />
                    </Tooltip>
                  </Flex>
                </Td>
                <Td>
                  <Typography variant="omega">{record.email ?? '—'}</Typography>
                </Td>
                <Td>
                  <Typography variant="omega">{record.ip ?? '—'}</Typography>
                </Td>
                <Td style={{ maxWidth: '200px' }}>
                  {record.details ? (
                    <Tooltip label={record.details} side="top">
                      <Typography variant="omega" textColor="neutral600" style={DETAILS_TEXT_STYLE}>
                        {record.details}
                      </Typography>
                    </Tooltip>
                  ) : (
                    <Typography variant="omega" textColor="neutral600">
                      —
                    </Typography>
                  )}
                </Td>
              </Tr>
            ))}
        </Tbody>
      </CustomTable>

      <TablePagination page={page} pageCount={pagination.pageCount} onPageChange={setPage} />
    </Box>
  );
}
