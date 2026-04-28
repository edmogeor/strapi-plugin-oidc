import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import { buildQueryString } from './queryString';
import { PAGE_SIZE, type AuditLogEntry, type FilterState, type PaginationInfo } from './types';
import { UI_DEFAULTS } from '../../../../shared/constants';

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function useAuditLogs(page: number, filters: FilterState) {
  const { get } = useFetchClient();
  const [records, setRecords] = useState<AuditLogEntry[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    pageCount: 1,
  });
  const [loading, setLoading] = useState(true);
  const fetchGenRef = useRef(0);
  const debouncedFilters = useDebounced(filters);

  const fetchLogs = useCallback(
    async (p: number, f: FilterState) => {
      const gen = ++fetchGenRef.current;
      setLoading(true);
      const startTime = Date.now();
      let newRecords: AuditLogEntry[] = [];
      let newPagination = { page: p, pageSize: PAGE_SIZE, total: 0, pageCount: 1 };
      try {
        const queryString = buildQueryString({ filters: f, page: p, pageSize: PAGE_SIZE });
        const response = await get(`/strapi-plugin-oidc/audit-logs?${queryString}`);
        newRecords = response.data.results ?? [];
        newPagination = response.data.pagination ?? {
          page: p,
          pageSize: PAGE_SIZE,
          total: 0,
          pageCount: 1,
        };
      } catch {
        // ignored — newRecords stays []
      }
      const remaining = UI_DEFAULTS.MIN_SPINNER_MS - (Date.now() - startTime);
      if (remaining > 0) await new Promise<void>((r) => setTimeout(r, remaining));
      if (gen !== fetchGenRef.current) return;
      // Update records and clear loading in one render so old rows never flash between states.
      setRecords(newRecords);
      setPagination(newPagination);
      setLoading(false);
    },
    [get],
  );

  useEffect(() => {
    fetchLogs(page, debouncedFilters);
  }, [fetchLogs, page, debouncedFilters]);

  return { records, pagination, loading };
}
