import type { Filters, SearchInputProps } from '@strapi/strapi/admin';
import { AUDIT_ACTIONS } from '../../../../server/audit-log-filters';

export const auditLogFilters: Filters.Filter[] = [
  {
    name: 'action',
    label: 'Action',
    type: 'enumeration',
    options: AUDIT_ACTIONS.map((value) => ({ value, label: value })),
  },
  {
    name: 'email',
    label: 'Email',
    type: 'string',
  },
  {
    name: 'ip',
    label: 'IP address',
    type: 'string',
  },
  {
    name: 'createdAt',
    label: 'Timestamp',
    type: 'datetime',
  },
];

export const searchInputLabel = 'Search audit logs';
export const searchInputPlaceholder = 'Search by email or IP address';
