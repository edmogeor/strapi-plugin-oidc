import React from 'react';
import styled from 'styled-components';
import { Flex, Typography } from '@strapi/design-system';

const SwitchContainer = styled.label<{ $disabled?: boolean }>`
  position: relative;
  display: inline-block;
  width: 40px;
  height: 24px;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
`;

const SwitchInput = styled.input`
  opacity: 0;
  width: 0;
  height: 0;

  &:checked + span {
    background-color: ${({ theme }) => theme.colors.primary600};
  }

  &:focus + span {
    box-shadow: 0 0 1px ${({ theme }) => theme.colors.primary600};
  }

  &:checked + span:before {
    transform: translateX(16px);
  }

  &:disabled + span {
    pointer-events: none;
  }
`;

const SwitchSlider = styled.span`
  position: absolute;
  cursor: inherit;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${({ theme }) => theme.colors.neutral300};
  transition: 0.4s;
  border-radius: 24px;

  &:before {
    position: absolute;
    content: '';
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.4s;
    border-radius: 50%;
  }
`;

export default function CustomSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <Flex gap={3}>
      <SwitchContainer $disabled={disabled}>
        <SwitchInput type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
        <SwitchSlider />
      </SwitchContainer>
      {label && (
        <Typography
          variant="pi"
          fontWeight="bold"
          textColor={disabled ? 'neutral500' : 'neutral800'}
        >
          {label}
        </Typography>
      )}
    </Flex>
  );
}
