import { useState, KeyboardEvent, useRef, useEffect, useId, ReactNode } from 'react';
import { Typography } from '@strapi/design-system';
import styled from 'styled-components';
import { TagInputShell, useTagState } from './tagPrimitives';

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

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  startIcon?: ReactNode;
  options?: readonly string[];
  validate?: (input: string) => boolean;
}

export function TagInput({
  value = [],
  onChange,
  placeholder,
  startIcon,
  options,
  validate,
}: TagInputProps) {
  return options ? (
    <ComboboxTagInput
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      startIcon={startIcon}
      options={options}
    />
  ) : (
    <FreeformTagInput
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      startIcon={startIcon}
      validate={validate}
    />
  );
}

interface FreeformProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  startIcon?: ReactNode;
  validate?: (input: string) => boolean;
}

function FreeformTagInput({ value, onChange, placeholder, startIcon, validate }: FreeformProps) {
  const { inputValue, setInputValue, inputRef, addTag, removeTag } = useTagState({
    value,
    onChange,
  });

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue, validate);
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <TagInputShell
      value={value}
      onRemoveTag={removeTag}
      placeholder={placeholder}
      startIcon={startIcon}
      inputRef={inputRef}
      inputProps={{
        value: inputValue,
        onChange: (e) => setInputValue(e.target.value),
        onKeyDown: handleKeyDown,
      }}
    />
  );
}

interface ComboboxProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  startIcon?: ReactNode;
  options: readonly string[];
}

function ComboboxTagInput({ value, onChange, placeholder, startIcon, options }: ComboboxProps) {
  const { inputValue, setInputValue, inputRef, addTag, removeTag } = useTagState({
    value,
    onChange,
  });
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const optionIdPrefix = useId();

  const filteredOptions = options.filter(
    (opt) => !value.includes(opt) && opt.toLowerCase().includes(inputValue.toLowerCase()),
  );

  const closeDropdown = () => {
    setShowDropdown(false);
    setActiveIndex(-1);
  };

  const selectTag = (tag: string) => {
    addTag(tag);
    closeDropdown();
  };

  const moveActive = (delta: 1 | -1) => {
    if (filteredOptions.length === 0) return;
    setShowDropdown(true);
    setActiveIndex((i) => {
      const len = filteredOptions.length;
      return delta === 1 ? (i + 1) % len : i <= 0 ? len - 1 : i - 1;
    });
  };

  const commitSelection = () => {
    if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
      selectTag(filteredOptions[activeIndex]);
      return;
    }
    const match = options.find((opt) => opt.toLowerCase() === inputValue.toLowerCase());
    if (match) selectTag(match);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveActive(1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        moveActive(-1);
        return;
      case 'Home':
        if (showDropdown && filteredOptions.length > 0) {
          e.preventDefault();
          setActiveIndex(0);
        }
        return;
      case 'End':
        if (showDropdown && filteredOptions.length > 0) {
          e.preventDefault();
          setActiveIndex(filteredOptions.length - 1);
        }
        return;
      case 'Enter':
      case ',':
        e.preventDefault();
        commitSelection();
        return;
      case 'Backspace':
        if (!inputValue && value.length > 0) removeTag(value[value.length - 1]);
        return;
      case 'Escape':
        closeDropdown();
        return;
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

  const dropdownOpen = showDropdown && filteredOptions.length > 0;
  const activeDescendant =
    dropdownOpen && activeIndex >= 0 && activeIndex < filteredOptions.length
      ? `${optionIdPrefix}-${activeIndex}`
      : undefined;

  return (
    <TagInputShell
      value={value}
      onRemoveTag={removeTag}
      placeholder={placeholder}
      startIcon={startIcon}
      inputRef={inputRef}
      wrapperRef={wrapperRef}
      inputProps={{
        value: inputValue,
        onChange: handleInputChange,
        onKeyDown: handleKeyDown,
        onFocus: () => setShowDropdown(true),
        role: 'combobox',
        'aria-autocomplete': 'list',
        'aria-expanded': dropdownOpen,
        'aria-controls': listboxId,
        'aria-activedescendant': activeDescendant,
        autoComplete: 'off',
      }}
    >
      {dropdownOpen && (
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
              onClick={() => selectTag(opt)}
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
    </TagInputShell>
  );
}
