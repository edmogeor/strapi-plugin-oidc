import { useState, KeyboardEvent } from 'react';
import { Box, Flex } from '@strapi/design-system';
import styled from 'styled-components';
import { Cross } from '@strapi/icons';

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
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.colors.neutral200};
  background-color: ${({ theme }) => theme.colors.neutral0};
  cursor: text;

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
  min-width: 100px;
  font-size: 1.4rem;
  line-height: 2.2rem;
  color: ${({ theme }) => theme.colors.neutral800};
  padding: 0;

  &::placeholder {
    color: ${({ theme }) => theme.colors.neutral500};
  }
`;

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

export function TagInput({ value = [], onChange, placeholder }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !value.includes(trimmed) && isValidEmail(trimmed)) {
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
      if (inputValue && isValidEmail(inputValue.trim())) {
        addTag(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <InputWrapper as="div">
      <Flex gap={2} wrap="wrap" flex="1" minWidth={0}>
        {value.map((tag) => (
          <Tag key={tag}>
            {tag}
            <TagRemove type="button" onClick={() => removeTag(tag)} aria-label={tag}>
              <Cross />
            </TagRemove>
          </Tag>
        ))}
        <StyledInput
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
        />
      </Flex>
    </InputWrapper>
  );
}
