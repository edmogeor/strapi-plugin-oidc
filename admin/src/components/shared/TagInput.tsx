import { useState, useRef, KeyboardEvent, ReactNode } from 'react';
import { Flex } from '@strapi/design-system';
import { StartIconSlot, TagChip, TagInputWrapper, TagStyledInput } from './tagPrimitives';

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
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <TagInputWrapper as="div" data-filter-input onClick={() => inputRef.current?.focus()}>
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
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          aria-label={placeholder}
        />
      </Flex>
    </TagInputWrapper>
  );
}
