import styled from 'styled-components';
import { Flex, Typography } from '@strapi/design-system';

const SwitchContainer = styled.label`
  position: relative;
  display: inline-block;
  width: 40px;
  height: 24px;
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
`;

const SwitchSlider = styled.span`
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${({ theme }) => theme.colors.neutral300};
  transition: 0.4s;
  border-radius: 24px;

  &:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.4s;
    border-radius: 50%;
  }
`;

export default function CustomSwitch({ checked, onChange, label }: { checked: boolean, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, label?: string }) {
  return (
    <Flex gap={3}>
      <SwitchContainer>
        <SwitchInput 
          type="checkbox" 
          checked={checked} 
          onChange={onChange} 
        />
        <SwitchSlider />
      </SwitchContainer>
      {label && (
        <Typography variant="pi" fontWeight="bold" textColor="neutral800">
          {label}
        </Typography>
      )}
    </Flex>
  );
}
