import {
  Button,
  Flex,
  MultiSelect,
  MultiSelectOption,
  Box,
  Typography
} from '@strapi/design-system';
import getTrad from "../../utils/getTrad";
import {useIntl} from "react-intl";

export default function Role({ssoRoles, roles, onChangeRole}) {
  const {formatMessage} = useIntl();
  return (
    <>
      <Typography tag="p" variant="omega" textColor="neutral600" marginBottom={4}>
        {formatMessage(getTrad('roles.notes'))}
      </Typography>
      <Flex direction="column" alignItems="stretch" gap={4} marginBottom={4}>
        {
          ssoRoles.map((ssoRole) => (
            <Box key={ssoRole['oauth_type']}>
              <MultiSelect
                withTags
                placeholder={formatMessage(getTrad('roles.placeholder'))}
                value={ssoRole['role'] ? ssoRole['role'].map(r => r.toString()) : []}
                onChange={(value) => {
                  if (value && value.length > 0) {
                    onChangeRole(value, ssoRole['oauth_type'])
                  }
                }}
              >
                {roles.map((role) => (
                  <MultiSelectOption key={role.id} value={role.id.toString()}>
                    {role.name}
                  </MultiSelectOption>
                ))}
              </MultiSelect>
            </Box>
          ))
        }
      </Flex>
    </>
  )
}
