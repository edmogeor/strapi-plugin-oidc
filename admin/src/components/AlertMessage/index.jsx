import {Alert} from "@strapi/design-system";
import getTrad from "../../utils/getTrad";
import React from "react";
import {useIntl} from "react-intl";
import styled from "styled-components";

const AlertMessage = styled.div`
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    top: 2.875rem;
    z-index: 10;
    width: 31.25rem;
`

export function SuccessAlertMessage({onClose}) {
  const {formatMessage} = useIntl();
  return (
    <AlertMessage>
      <Alert
        title="Success"
        variant={'success'}
        closeLabel={''}
        onClose={onClose}
      >
        {formatMessage(getTrad('page.save.success'))}
      </Alert>
    </AlertMessage>
  )
}

export function ErrorAlertMessage({onClose}) {
  const {formatMessage} = useIntl();
  return (
    <AlertMessage>
      <Alert
        title="Error"
        variant={'danger'}
        closeLabel={''}
        onClose={onClose}
      >
        {formatMessage(getTrad('page.save.error'))}
      </Alert>
    </AlertMessage>
  )
}

export function MatchedUserAlertMessage({onClose, count}) {
  const {formatMessage} = useIntl();
  const id = count > 1 ? 'tab.whitelist.users_exists' : 'tab.whitelist.user_exists';
  return (
    <AlertMessage>
      <Alert
        title="Info"
        variant={'default'}
        closeLabel={''}
        onClose={onClose}
      >
        {formatMessage(getTrad(id))}
      </Alert>
    </AlertMessage>
  )
}