import { ReactNode } from 'react';
import { Box } from '@strapi/design-system';
import styled from 'styled-components';
import { Cross } from '@strapi/icons';
import { useIntl } from 'react-intl';
import getTrad from '../../utils/getTrad';

const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 2.2rem;
  padding: 0 6px;
  border-radius: 4px;
  background-color: ${({ theme }) => theme.colors.neutral200};
  color: ${({ theme }) => theme.colors.neutral800};
  font-size: 1.4rem;
  line-height: 2.2rem;
  box-sizing: border-box;
  white-space: nowrap;
`;

const TagRemoveButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.neutral600};
  transition: color 0.2s;

  & svg {
    width: 1rem;
    height: 1rem;
  }

  &:hover {
    color: ${({ theme }) => theme.colors.neutral800};
  }
`;

export const TagInputWrapper = styled(Box)`
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  padding: 8px 16px;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.colors.neutral200};
  background-color: ${({ theme }) => theme.colors.neutral0};
  cursor: text;
  min-width: 180px;
  min-height: 4rem;
  flex: 0 0 auto;

  .filter-row.expanded & {
    flex: 1 0 auto;
  }

  &:focus-within {
    border-color: ${({ theme }) => theme.colors.primary600};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primary100};
  }
`;

export const TagStyledInput = styled.input`
  border: none;
  background: transparent;
  outline: none;
  flex: 1;
  min-width: 0;
  font-size: 1.4rem;
  line-height: 2.2rem;
  color: ${({ theme }) => theme.colors.neutral800};
  padding: 0;
  field-sizing: content;

  &::placeholder {
    color: ${({ theme }) => theme.colors.neutral500};
  }
`;

export function StartIconSlot({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', marginRight: '8px' }}>
      {children}
    </span>
  );
}

interface TagChipProps {
  label: string;
  onRemove: () => void;
}

export function TagChip({ label, onRemove }: TagChipProps) {
  const { formatMessage } = useIntl();
  return (
    <Tag>
      {label}
      <TagRemoveButton
        type="button"
        onClick={onRemove}
        aria-label={formatMessage(getTrad('common.remove'), { label })}
      >
        <Cross aria-hidden="true" />
      </TagRemoveButton>
    </Tag>
  );
}
