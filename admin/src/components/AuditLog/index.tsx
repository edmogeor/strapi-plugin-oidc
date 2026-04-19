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
} from '@strapi/design-system';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Calendar, Download, Information, Mail, Trash } from '@strapi/icons';
import { ClipboardList, Filter, Server } from 'lucide-react';
import styled from 'styled-components';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useIntl } from 'react-intl';
import qs from 'qs';
import getTrad from '../../utils/getTrad';
import {
  ConfirmDialog,
  CustomTable,
  type DateSelection,
  Icon,
  LocalizedDate,
  TablePagination,
  TagDateInput,
  TagInput,
} from '../shared';
import { AUDIT_ACTIONS } from '../../../../shared/audit-actions';

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
  action?: string[];
  email?: string[];
  ip?: string[];
  createdAt?: DateSelection[];
}

function toWireFilters(f: FilterState) {
  const out: Record<string, unknown> = {};
  if (f.action?.length) out.action = { $or: f.action.map((v) => ({ $eq: v })) };
  if (f.email?.length) out.email = { $or: f.email.map((v) => ({ $contains: v })) };
  if (f.ip?.length) out.ip = { $or: f.ip.map((v) => ({ $contains: v })) };
  if (f.createdAt?.length) {
    const allDates = f.createdAt.flatMap((s) => s.dates);
    const deduped = [...new Set(allDates)];
    out.createdAt = { $in: deduped };
  }
  return out;
}

function buildQueryString(params: { filters?: FilterState; page?: number; pageSize?: number }) {
  const { filters, ...rest } = params;
  return qs.stringify(
    { ...rest, filters: filters ? toWireFilters(filters) : undefined },
    {
      encodeValuesOnly: true,
    },
  );
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function AuditLog({ title }: { title?: ReactNode } = {}) {
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

  const debouncedFilters = useDebounced(filters);

  const fetchLogs = useCallback(
    async (p: number, f: FilterState) => {
      setLoading(true);
      try {
        const queryString = buildQueryString({
          filters: f,
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
    fetchLogs(page, debouncedFilters);
  }, [fetchLogs, page, debouncedFilters]);

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
      const queryString = buildQueryString({
        filters,
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
    setPage(1);
  };

  const hasActiveFilters = !!(
    filters.action?.length ||
    filters.email?.length ||
    filters.ip?.length ||
    filters.createdAt?.length
  );

  const filterRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = filterRowRef.current;
    if (!el) return;

    let rafId: number;

    const measure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const children = Array.from(el.querySelectorAll<HTMLElement>('[data-filter-input]'));
        if (children.length === 0) return;
        const containerWidth = el.getBoundingClientRect().width;
        const gap = parseFloat(getComputedStyle(el).gap) || 8;
        const wasExpanded = el.classList.contains('expanded');
        if (wasExpanded) el.classList.remove('expanded');
        const totalRequired = children.reduce((sum, c) => sum + c.offsetWidth + gap, -gap);
        const fits = totalRequired <= containerWidth;
        el.classList.toggle('expanded', fits);
      });
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(el, { box: 'border-box' });

    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(el, { childList: true, subtree: true });

    measure();
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <Box>
      <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
        {title ?? <span />}
        <Flex gap={2}>
          <Button
            size="S"
            variant="tertiary"
            startIcon={<Download />}
            onClick={handleExport}
            disabled={pagination.total === 0}
            style={{ paddingTop: '1.1rem', paddingBottom: '1.1rem', height: 'auto' }}
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
                style={{ paddingTop: '1.1rem', paddingBottom: '1.1rem', height: 'auto' }}
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

      <Box
        background="neutral100"
        hasRadius
        padding={4}
        marginBottom={4}
        borderColor="neutral200"
        borderWidth="1px"
        borderStyle="solid"
      >
        <Flex gap={2} alignItems="center" marginBottom={3}>
          <Icon>
            <Filter size="1.6rem" />
          </Icon>
          <Typography variant="delta" tag="h3">
            {formatMessage(getTrad('auditlog.filters'))}
          </Typography>
        </Flex>
        <Flex gap={2} wrap="wrap" ref={filterRowRef} className="filter-row">
          <TagDateInput
            placeholder={formatMessage(getTrad('auditlog.filters.createdAt'))}
            value={filters.createdAt ?? []}
            onChange={(selections) => {
              setFilters((prev) => {
                if (selections.length === 0) {
                  const { createdAt: _removed, ...rest } = prev;
                  return rest;
                }
                return { ...prev, createdAt: selections };
              });
              setPage(1);
            }}
            startIcon={
              <Icon>
                <Calendar width="1.4rem" height="1.4rem" />
              </Icon>
            }
          />
          <TagInput
            value={filters.action ?? []}
            onChange={(value) => setFilters((prev) => ({ ...prev, action: value }))}
            options={AUDIT_ACTIONS}
            placeholder={formatMessage(getTrad('auditlog.filters.action'))}
            startIcon={
              <Icon>
                <ClipboardList size="1.4rem" />
              </Icon>
            }
          />
          <TagInput
            value={filters.email ?? []}
            onChange={(value) => setFilters((prev) => ({ ...prev, email: value }))}
            placeholder={formatMessage(getTrad('auditlog.filters.email'))}
            startIcon={
              <Icon>
                <Mail width="1.4rem" height="1.4rem" />
              </Icon>
            }
            validate={(v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
          />
          <TagInput
            value={filters.ip ?? []}
            onChange={(value) => setFilters((prev) => ({ ...prev, ip: value }))}
            placeholder={formatMessage(getTrad('auditlog.filters.ip'))}
            startIcon={
              <Icon>
                <Server size="1.4rem" />
              </Icon>
            }
            validate={(v) =>
              /^(?:(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?::[0-9a-fA-F]{1,4}){1,7}|::))$/.test(
                v,
              )
            }
          />
          {hasActiveFilters && (
            <Button
              size="S"
              variant="danger-light"
              startIcon={<Trash />}
              onClick={clearFilters}
              style={{ height: '4rem' }}
            >
              {formatMessage(getTrad('auditlog.filters.clear'))}
            </Button>
          )}
        </Flex>
      </Box>

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

      <TablePagination
        page={page}
        pageCount={pagination.pageCount}
        onPageChange={setPage}
        total={pagination.total}
      />
    </Box>
  );
}
