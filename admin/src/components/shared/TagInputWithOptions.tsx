import { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Box, Flex, Typography } from '@strapi/design-system';
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
  position: relative;
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
  font-size: 1.4rem;
  line-height: 2.2rem;
  color: ${({ theme }) => theme.colors.neutral800};
  padding: 0;
  field-sizing: content;

  &::placeholder {
    color: ${({ theme }) => theme.colors.neutral500};
  }
`;

const Dropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  padding: 4px;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.colors.neutral200};
  background-color: ${({ theme }) => theme.colors.neutral0};
  box-shadow: ${({ theme }) => theme.sizes?.shadow || '0 2px 8px rgba(0,0,0,0.1)'};
  z-index: 100;
  max-height: 200px;
  overflow-y: auto;
`;

const DropdownItem = styled.button`
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 1.4rem;
  line-height: 2.2rem;
  color: ${({ theme }) => theme.colors.neutral800};
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background-color: ${({ theme }) => theme.colors.neutral100};
  }
`;

interface TagInputWithOptionsProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: string[];
  placeholder?: string;
}

export function TagInputWithOptions({
  value = [],
  onChange,
  options,
  placeholder,
}: TagInputWithOptionsProps) {
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = options.filter(
    (opt) => !value.includes(opt) && opt.toLowerCase().includes(inputValue.toLowerCase()),
  );

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInputValue('');
    setShowDropdown(false);
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const matchedOption = options.find((opt) => opt.toLowerCase() === inputValue.toLowerCase());
      if (matchedOption) {
        addTag(matchedOption);
      }
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setShowDropdown(true);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <InputWrapper ref={wrapperRef} onClick={() => inputRef.current?.focus()}>
      <Flex gap={2} wrap="wrap" alignItems="center">
        {value.map((tag) => (
          <Tag key={tag}>
            {tag}
            <TagRemove type="button" onClick={() => removeTag(tag)} aria-label={tag}>
              <Cross />
            </TagRemove>
          </Tag>
        ))}
        <StyledInput
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowDropdown(true)}
          placeholder={value.length === 0 ? placeholder : ''}
        />
      </Flex>
      {showDropdown && filteredOptions.length > 0 && (
        <Dropdown>
          {filteredOptions.map((opt) => (
            <DropdownItem key={opt} type="button" onClick={() => addTag(opt)}>
              <Typography textColor="neutral800">{opt}</Typography>
            </DropdownItem>
          ))}
        </Dropdown>
      )}
    </InputWrapper>
  );
}
