import { InputHTMLAttributes, ReactNode, RefObject, useRef, useState } from 'react';
import { Box, Flex } from '@strapi/design-system';
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
  min-width: 220px;
  min-height: 4rem;
  flex: 0 0 auto;

  &:focus-within {
    border-color: ${({ theme }) => theme.colors.primary600};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primary100};
  }
`;

const TagStyledInput = styled.input.attrs({ autocomplete: 'off' })`
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

interface UseTagStateOptions {
  value: string[];
  onChange: (next: string[]) => void;
}

export function useTagState({ value, onChange }: UseTagStateOptions) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tag: string, predicate?: (t: string) => boolean) => {
    const trimmed = tag.trim();
    if (trimmed && !value.includes(trimmed) && (!predicate || predicate(trimmed))) {
      onChange([...value, trimmed]);
    }
    setInputValue('');
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  return { inputValue, setInputValue, inputRef, addTag, removeTag };
}

interface TagInputShellProps {
  value: string[];
  onRemoveTag: (tag: string) => void;
  placeholder?: string;
  startIcon?: ReactNode;
  inputRef: RefObject<HTMLInputElement>;
  wrapperRef?: RefObject<HTMLDivElement>;
  inputProps: InputHTMLAttributes<HTMLInputElement>;
  children?: ReactNode;
}

export function TagInputShell({
  value,
  onRemoveTag,
  placeholder,
  startIcon,
  inputRef,
  wrapperRef,
  inputProps,
  children,
}: TagInputShellProps) {
  return (
    <TagInputWrapper ref={wrapperRef} onClick={() => inputRef.current?.focus()}>
      <Flex gap={2} wrap="wrap" alignItems="center" style={{ flex: 1, minWidth: 0 }}>
        {startIcon && <StartIconSlot>{startIcon}</StartIconSlot>}
        {value.map((tag) => (
          <TagChip key={tag} label={tag} onRemove={() => onRemoveTag(tag)} />
        ))}
        <TagStyledInput
          ref={inputRef}
          type="text"
          autoComplete="off"
          placeholder={value.length === 0 ? placeholder : ''}
          aria-label={placeholder}
          {...inputProps}
        />
      </Flex>
      {children}
    </TagInputWrapper>
  );
}
