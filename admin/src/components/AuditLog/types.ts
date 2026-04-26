import type { DateSelection } from '../shared';

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

export const PAGE_SIZE = 10;
