import { useState, KeyboardEvent, useRef, useEffect, useId, ReactNode } from 'react';
import { Flex, Typography } from '@strapi/design-system';
import styled from 'styled-components';
import { StartIconSlot, TagChip, TagInputWrapper, TagStyledInput } from './tagPrimitives';

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
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
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
  options: readonly string[];
  placeholder?: string;
  startIcon?: ReactNode;
}

export function TagInputWithOptions({
  value = [],
  onChange,
  options,
  placeholder,
  startIcon,
}: TagInputWithOptionsProps) {
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const optionIdPrefix = useId();

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
    setActiveIndex(-1);
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        setShowDropdown(true);
        setActiveIndex((i) => (i + 1) % filteredOptions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        setShowDropdown(true);
        setActiveIndex((i) => (i <= 0 ? filteredOptions.length - 1 : i - 1));
      }
    } else if (e.key === 'Home' && showDropdown && filteredOptions.length > 0) {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End' && showDropdown && filteredOptions.length > 0) {
      e.preventDefault();
      setActiveIndex(filteredOptions.length - 1);
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
        addTag(filteredOptions[activeIndex]);
        return;
      }
      const matchedOption = options.find((opt) => opt.toLowerCase() === inputValue.toLowerCase());
      if (matchedOption) {
        addTag(matchedOption);
      }
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setShowDropdown(true);
    setActiveIndex(-1);
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
    <TagInputWrapper ref={wrapperRef} data-filter-input onClick={() => inputRef.current?.focus()}>
      <Flex gap={2} wrap="wrap" alignItems="center" style={{ flex: 1, minWidth: 0 }}>
        {startIcon && <StartIconSlot>{startIcon}</StartIconSlot>}
        {value.map((tag) => (
          <TagChip key={tag} label={tag} onRemove={() => removeTag(tag)} />
        ))}
        <TagStyledInput
          ref={inputRef}
          type="text"
          autoComplete="off"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowDropdown(true)}
          placeholder={value.length === 0 ? placeholder : ''}
          role="combobox"
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-expanded={showDropdown && filteredOptions.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={
            showDropdown && activeIndex >= 0 && activeIndex < filteredOptions.length
              ? `${optionIdPrefix}-${activeIndex}`
              : undefined
          }
        />
      </Flex>
      {showDropdown && filteredOptions.length > 0 && (
        <Dropdown id={listboxId} role="listbox">
          {filteredOptions.map((opt, i) => (
            <DropdownItem
              key={opt}
              id={`${optionIdPrefix}-${i}`}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => {
                if (i !== activeIndex) setActiveIndex(i);
              }}
              onClick={() => addTag(opt)}
              style={
                i === activeIndex
                  ? { outline: '2px solid currentColor', outlineOffset: '-2px' }
                  : undefined
              }
            >
              <Typography textColor="neutral800">{opt}</Typography>
            </DropdownItem>
          ))}
        </Dropdown>
      )}
    </TagInputWrapper>
  );
}
