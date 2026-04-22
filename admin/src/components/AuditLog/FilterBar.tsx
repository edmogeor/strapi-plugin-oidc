import { Box, Flex, Typography } from '@strapi/design-system';
import { Calendar, Mail, Trash } from '@strapi/icons';
import { ClipboardList, Filter, Server } from 'lucide-react';
import { useIntl } from 'react-intl';
import getTrad from '../../utils/getTrad';
import { Icon, SizedButton, TagDateInput, TagInput } from '../shared';
import { AUDIT_ACTIONS } from '../../../../shared/audit-actions';
import type { FilterState } from './types';

const IP_REGEX =
  /^(?:(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?::[0-9a-fA-F]{1,4}){1,7}|::))$/;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FilterBarProps {
  filters: FilterState;
  hasActiveFilters: boolean;
  onFiltersChange: (updater: (prev: FilterState) => FilterState) => void;
  onResetPage: () => void;
  onClear: () => void;
}

export function FilterBar({
  filters,
  hasActiveFilters,
  onFiltersChange,
  onResetPage,
  onClear,
}: FilterBarProps) {
  const { formatMessage } = useIntl();

  return (
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
      <Flex gap={2} wrap="wrap">
        <TagDateInput
          placeholder={formatMessage(getTrad('auditlog.filters.createdAt'))}
          value={filters.createdAt ?? []}
          onChange={(selections) => {
            onFiltersChange((prev) => {
              if (selections.length === 0) {
                const { createdAt: _removed, ...rest } = prev;
                return rest;
              }
              return { ...prev, createdAt: selections };
            });
            onResetPage();
          }}
          startIcon={
            <Icon>
              <Calendar width="1.4rem" height="1.4rem" />
            </Icon>
          }
        />
        <TagInput
          value={filters.action ?? []}
          onChange={(value) => onFiltersChange((prev) => ({ ...prev, action: value }))}
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
          onChange={(value) => onFiltersChange((prev) => ({ ...prev, email: value }))}
          placeholder={formatMessage(getTrad('auditlog.filters.email'))}
          startIcon={
            <Icon>
              <Mail width="1.4rem" height="1.4rem" />
            </Icon>
          }
          validate={(v) => EMAIL_REGEX.test(v)}
        />
        <TagInput
          value={filters.ip ?? []}
          onChange={(value) => onFiltersChange((prev) => ({ ...prev, ip: value }))}
          placeholder={formatMessage(getTrad('auditlog.filters.ip'))}
          startIcon={
            <Icon>
              <Server size="1.4rem" />
            </Icon>
          }
          validate={(v) => IP_REGEX.test(v)}
        />
        {hasActiveFilters && (
          <SizedButton size="S" variant="danger-light" startIcon={<Trash />} onClick={onClear}>
            {formatMessage(getTrad('auditlog.filters.clear'))}
          </SizedButton>
        )}
      </Flex>
    </Box>
  );
}
