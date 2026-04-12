import { Alert } from '@strapi/design-system';
import getTrad from '../../utils/getTrad';
import { useIntl } from 'react-intl';
import styled from 'styled-components';

const AlertMessage = styled.div`
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  top: 2.875rem;
  z-index: 10;
  width: 31.25rem;
`;

export function SuccessAlertMessage({ onClose }: { onClose: () => void }) {
  const { formatMessage } = useIntl();
  return (
    <AlertMessage>
      <Alert
        title={formatMessage(getTrad('alert.title.success'))}
        variant={'success'}
        closeLabel={''}
        onClose={onClose}
      >
        {formatMessage(getTrad('page.save.success'))}
      </Alert>
    </AlertMessage>
  );
}

export function ErrorAlertMessage({ onClose }: { onClose: () => void }) {
  const { formatMessage } = useIntl();
  return (
    <AlertMessage>
      <Alert
        title={formatMessage(getTrad('alert.title.error'))}
        variant={'danger'}
        closeLabel={''}
        onClose={onClose}
      >
        {formatMessage(getTrad('page.save.error'))}
      </Alert>
    </AlertMessage>
  );
}

function MatchedUserAlertMessage({ onClose, count }: { onClose: () => void; count: number }) {
  const { formatMessage } = useIntl();
  const id = count > 1 ? 'whitelist.users_exists' : 'whitelist.user_exists';
  return (
    <AlertMessage>
      <Alert
        title={formatMessage(getTrad('alert.title.info'))}
        variant={'default'}
        closeLabel={''}
        onClose={onClose}
      >
        {formatMessage(getTrad(id))}
      </Alert>
    </AlertMessage>
  );
}
