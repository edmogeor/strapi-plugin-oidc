import { Flex, Loader, Tbody, Td, Th, Thead, Tooltip, Tr, Typography } from '@strapi/design-system';
import { Information } from '@strapi/icons';
import { useIntl } from 'react-intl';
import getTrad from '../../utils/getTrad';
import { CustomTable, LocalizedDate } from '../shared';
import type { AuditLogRecord } from './types';

const DETAILS_TEXT_STYLE = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '180px',
  cursor: 'help',
} as const;

interface LogTableProps {
  records: AuditLogRecord[];
  loading: boolean;
  hasActiveFilters: boolean;
}

export function LogTable({ records, loading, hasActiveFilters }: LogTableProps) {
  const { formatMessage } = useIntl();

  return (
    <div style={{ position: 'relative', width: '100%' }}>
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
          {records.length === 0 && (
            <Tr>
              <Td colSpan={5}>
                <Flex justifyContent="center" alignItems="center" style={{ minHeight: '80px' }}>
                  {loading ? (
                    <Loader small />
                  ) : (
                    <Typography textColor="neutral600">
                      {hasActiveFilters
                        ? formatMessage(getTrad('auditlog.filters.empty'))
                        : formatMessage(getTrad('auditlog.table.empty'))}
                    </Typography>
                  )}
                </Flex>
              </Td>
            </Tr>
          )}
          {records.map((record) => (
            <Tr key={record.id} style={{ opacity: loading ? 0.4 : 1, transition: 'opacity 0.15s' }}>
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

      {loading && records.length > 0 && (
        <Flex
          justifyContent="center"
          alignItems="center"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <Loader small />
        </Flex>
      )}
    </div>
  );
}
