import { useState, useRef, KeyboardEvent, ReactNode } from 'react';
import { Box, Flex } from '@strapi/design-system';
import styled from 'styled-components';
import { Cross } from '@strapi/icons';
import { useIntl } from 'react-intl';
import getTrad from '../../utils/getTrad';

const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  background-color: ${({ theme }) => theme.colors.neutral200};
  color: ${({ theme }) => theme.colors.neutral800};
  font-size: 1.4rem;
  line-height: 2.2rem;
  box-sizing: border-box;
`;

const TagRemove = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.neutral600};
  transition: color 0.2s;

  &:hover {
    color: ${({ theme }) => theme.colors.neutral800};
  }
`;

const InputWrapper = styled(Box)`
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

const StyledInput = styled.input`
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

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  startIcon?: ReactNode;
  validate?: (input: string) => boolean;
}

export function TagInput({
  value = [],
  onChange,
  placeholder,
  startIcon,
  validate = () => true,
}: TagInputProps) {
  const { formatMessage } = useIntl();
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !value.includes(trimmed) && validate(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInputValue('');
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputValue && validate(inputValue.trim())) {
        addTag(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <InputWrapper as="div" data-filter-input onClick={() => inputRef.current?.focus()}>
      <Flex gap={2} wrap="wrap" alignItems="center">
        {startIcon && (
          <span
            aria-hidden="true"
            style={{ display: 'flex', alignItems: 'center', marginRight: '8px' }}
          >
            {startIcon}
          </span>
        )}
        {value.map((tag) => (
          <Tag key={tag}>
            {tag}
            <TagRemove
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={formatMessage(getTrad('common.remove'), { label: tag })}
            >
              <Cross aria-hidden="true" />
            </TagRemove>
          </Tag>
        ))}
        <StyledInput
          ref={inputRef}
          type="text"
          autoComplete="off"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          aria-label={placeholder}
        />
      </Flex>
    </InputWrapper>
  );
}
