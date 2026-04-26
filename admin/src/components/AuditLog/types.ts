import type { DateSelection } from '../shared';
import { AUDIT_LOG_DEFAULTS } from '../../../shared/constants';

// fallow-ignore-next-line duplicate-exports
export interface AuditLogRecord {
  id: number;
  action: string;
  email?: string;
  ip?: string;
  details?: string;
  createdAt: string;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface FilterState {
  action?: string[];
  email?: string[];
  ip?: string[];
  createdAt?: DateSelection[];
}

export const PAGE_SIZE = AUDIT_LOG_DEFAULTS.ADMIN_PAGE_SIZE;
