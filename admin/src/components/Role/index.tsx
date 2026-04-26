import { Flex, MultiSelect, MultiSelectOption, Box, Typography } from '@strapi/design-system';
import getTrad from '../../utils/getTrad';
import { useIntl } from 'react-intl';

import type { OIDCRole, RoleDef } from '../../types';

interface RoleProps {
  oidcRoles: OIDCRole[];
  roles: RoleDef[];
  onChangeRole: (values: string[], oidcId: string) => void;
}

export default function Role({ oidcRoles, roles, onChangeRole }: RoleProps) {
  const { formatMessage } = useIntl();
  return (
    <>
      <Typography tag="p" variant="omega" textColor="neutral600" marginBottom={4}>
        {formatMessage(getTrad('roles.notes'))}
      </Typography>
      <Flex direction="column" alignItems="stretch" gap={4} marginBottom={4}>
        {oidcRoles.map((oidcRole) => (
          <Box key={oidcRole.oauth_type}>
            <MultiSelect
              withTags
              placeholder={formatMessage(getTrad('roles.placeholder'))}
              value={oidcRole.role ? oidcRole.role.map((r) => String(r)) : []}
              onChange={(value: string[]) => {
                if (value && value.length > 0) onChangeRole(value, oidcRole.oauth_type);
              }}
            >
              {roles.map((role) => (
                <MultiSelectOption key={role.id} value={String(role.id)}>
                  {role.name}
                </MultiSelectOption>
              ))}
            </MultiSelect>
          </Box>
        ))}
      </Flex>
    </>
  );
}
