import { KeyboardEvent, ReactNode } from 'react';
import { TagInputShell, useTagState } from './tagPrimitives';

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
  validate,
}: TagInputProps) {
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
