import type { ReactNode, MouseEvent } from 'react';
import {
  Box,
  Button,
  Dialog,
  Flex,
  NextLink,
  PageLink,
  Pagination,
  PreviousLink,
  Table,
  Typography,
} from '@strapi/design-system';
import styled from 'styled-components';
import { WarningCircle } from '@strapi/icons';
import { useIntl } from 'react-intl';
import getTrad from '../../utils/getTrad';

export const Icon = styled.span<{ $size?: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.neutral500};
  flex-shrink: 0;
  font-size: ${({ $size }) => $size ?? '1.4rem'};
  svg {
    display: block;
    width: 1em;
    height: 1em;
  }
`;

export { TagInput } from './TagInput';
export { TagDateInput, type DateSelection } from './TagDateInput';

export function LocalizedDate({
  date,
  options,
}: {
  date: string;
  options?: Intl.DateTimeFormatOptions;
}) {
  const userLocale = navigator.language || 'en-US';
  return new Intl.DateTimeFormat(userLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  }).format(new Date(date));
}

export const CustomTable = styled(Table)`
  th,
  td,
  th span,
  td span {
    font-size: 1.3rem !important;
  }
`;

interface ConfirmDialogProps {
  trigger: ReactNode;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  confirmVariant?: 'danger' | 'danger-light';
}

export function ConfirmDialog({
  trigger,
  title,
  body,
  confirmLabel,
  onConfirm,
  confirmVariant = 'danger',
}: ConfirmDialogProps) {
  const { formatMessage } = useIntl();
  return (
    <Dialog.Root>
      <Dialog.Trigger>{trigger}</Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Header>{title}</Dialog.Header>
        <Dialog.Body icon={<WarningCircle fill="danger600" />}>{body}</Dialog.Body>
        <Dialog.Footer>
          <Dialog.Cancel>
            <Button fullWidth variant="tertiary">
              {formatMessage(getTrad('page.cancel'))}
            </Button>
          </Dialog.Cancel>
          <Dialog.Action>
            <Button fullWidth variant={confirmVariant} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </Dialog.Action>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}

interface TablePaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  total?: number;
}

export function TablePagination({ page, pageCount, onPageChange, total }: TablePaginationProps) {
  const { formatMessage } = useIntl();

  const handleClick = (e: MouseEvent, num: number) => {
    e.preventDefault();
    onPageChange(num);
  };

  const pageLink = (num: number) => (
    <PageLink key={num} number={num} href="#" onClick={(e) => handleClick(e, num)}>
      {formatMessage(getTrad('pagination.page'), { page: num })}
    </PageLink>
  );

  const Ellipsis = () => (
    <Typography textColor="neutral600" paddingLeft={2} paddingRight={2}>
      …
    </Typography>
  );

  let pages: ReactNode;
  if (pageCount <= 10) {
    pages = Array.from({ length: pageCount }, (_, i) => pageLink(i + 1));
  } else if (page <= 6) {
    pages = (
      <>
        {Array.from({ length: 9 }, (_, i) => pageLink(i + 1))}
        <Ellipsis />
        {pageLink(pageCount)}
      </>
    );
  } else if (page >= pageCount - 5) {
    pages = (
      <>
        {pageLink(1)}
        <Ellipsis />
        {Array.from({ length: 9 }, (_, i) => pageLink(pageCount - 8 + i))}
      </>
    );
  } else {
    pages = (
      <>
        {pageLink(1)}
        <Ellipsis />
        {Array.from({ length: 7 }, (_, i) => pageLink(page - 3 + i))}
        <Ellipsis />
        {pageLink(pageCount)}
      </>
    );
  }

  return (
    <Box paddingTop={4}>
      <Flex justifyContent="space-between" alignItems="center">
        {total !== undefined && (
          <Typography variant="pi" textColor="neutral600">
            {formatMessage(getTrad('pagination.total'), { count: total })}
          </Typography>
        )}
        {pageCount > 1 ? (
          <Pagination activePage={page} pageCount={pageCount}>
            <PreviousLink href="#" onClick={(e) => handleClick(e, Math.max(1, page - 1))}>
              {formatMessage(getTrad('pagination.previous'))}
            </PreviousLink>
            {pages}
            <NextLink href="#" onClick={(e) => handleClick(e, Math.min(pageCount, page + 1))}>
              {formatMessage(getTrad('pagination.next'))}
            </NextLink>
          </Pagination>
        ) : (
          <Box />
        )}
      </Flex>
    </Box>
  );
}
