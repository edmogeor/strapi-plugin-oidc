import React, { useState, useRef, useEffect, useId, FocusEvent, KeyboardEvent } from 'react';
import { Flex } from '@strapi/design-system';
import styled from 'styled-components';
import { useIntl } from 'react-intl';
import getTrad from '../../utils/getTrad';
import { StartIconSlot, TagChip, TagInputWrapper } from './tagPrimitives';

export interface DateSelection {
  dates: string[];
  display: string;
}

const PlaceholderText = styled.span`
  font-size: 1.4rem;
  color: ${({ theme }) => theme.colors.neutral500};
  line-height: 2.2rem;
`;

const CalendarHeader = styled(Flex)`
  padding: 8px 4px;
  justify-content: space-between;
  align-items: center;
`;

const MonthNavButton = styled.button<{ $disabled?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  border-radius: 4px;
  color: ${({ $disabled, theme }) =>
    $disabled ? theme.colors.neutral300 : theme.colors.neutral600};
  font-size: 1.6rem;
  transition: background-color 0.15s;

  &:hover {
    background: ${({ $disabled, theme }) => ($disabled ? 'transparent' : theme.colors.neutral200)};
    color: ${({ $disabled, theme }) =>
      $disabled ? theme.colors.neutral300 : theme.colors.neutral800};
  }
`;

const CalendarGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  width: 100%;
`;

const DayButton = styled.button<{
  $selected?: boolean;
  $today?: boolean;
  $inRange?: boolean;
  $pending?: boolean;
  $future?: boolean;
  $alreadySelected?: boolean;
}>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1;
  border: none;
  background: ${({ $selected, $inRange, $pending, theme }) =>
    $pending
      ? theme.colors.warning200
      : $selected
        ? theme.colors.primary600
        : $inRange
          ? theme.colors.primary100
          : 'transparent'};
  color: ${({
    $selected,
    $inRange,
    $pending,
    $future: _future,
    $alreadySelected: _alreadySelected,
    theme,
  }) =>
    $pending
      ? theme.colors.warning600
      : $selected
        ? theme.colors.neutral0
        : $inRange
          ? theme.colors.primary600
          : theme.colors.neutral800};
  opacity: ${({ $future, $alreadySelected }) => ($future || $alreadySelected ? 0.4 : 1)};
  border-radius: 4px;
  cursor: pointer;
  font-size: 1.2rem;
  transition: background-color 0.15s;
  font-weight: ${({ $today }) => ($today ? 'bold' : 'normal')};

  &:disabled {
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background: ${({ $selected, $inRange, $pending, theme }) =>
      $pending
        ? theme.colors.warning200
        : $selected
          ? theme.colors.primary600
          : $inRange
            ? theme.colors.primary200
            : theme.colors.neutral200};
  }
`;

const DayName = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  font-size: 1.1rem;
  color: ${({ theme }) => theme.colors.neutral500};
  font-weight: 500;
`;

const PopoverContainer = styled.div`
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  padding: 8px;
  background: ${({ theme }) => theme.colors.neutral0};
  border: 1px solid ${({ theme }) => theme.colors.neutral200};
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  min-width: 280px;
  z-index: 100;
`;

const ConfirmButton = styled.button`
  width: 100%;
  padding: 8px;
  margin-top: 8px;
  border: none;
  background: ${({ theme }) => theme.colors.primary600};
  color: ${({ theme }) => theme.colors.neutral0};
  border-radius: 4px;
  cursor: pointer;
  font-size: 1.3rem;
  font-weight: 500;
  transition: background-color 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.primary700};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.neutral200};
    color: ${({ theme }) => theme.colors.neutral500};
    cursor: not-allowed;
  }
`;

interface TagDateInputProps {
  value: DateSelection[];
  onChange: (value: DateSelection[]) => void;
  placeholder?: string;
  startIcon?: React.ReactNode;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isInRange(date: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  const d = date.getTime();
  const s = start.getTime();
  const e = end.getTime();
  return d > Math.min(s, e) && d < Math.max(s, e);
}

function getDatesBetween(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const current = new Date(Math.min(start.getTime(), end.getTime()));
  const endDate = new Date(Math.max(start.getTime(), end.getTime()));
  while (current <= endDate) {
    dates.push(toUtcMidnightIso(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

const userLocale = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
const MONTH_FORMATTER = new Intl.DateTimeFormat(userLocale, { month: 'long' });
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat(userLocale, { weekday: 'short' });
const DATE_FORMATTER = new Intl.DateTimeFormat(userLocale, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

function formatRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();

  const startStr = DATE_FORMATTER.format(start);
  const endStr = DATE_FORMATTER.format(end);

  if (sameMonth) {
    return `${start.getDate()} – ${endStr}`;
  }
  if (sameYear) {
    return `${startStr.split(' ').slice(0, 2).join(' ')} – ${endStr}`;
  }
  return `${startStr} – ${endStr}`;
}

// Mirror Strapi's admin (`FormInputs/Date.js`): treat the picked calendar day as
// UTC midnight and serialise with `toISOString()`. This is the wire format used
// across Strapi's admin for date/datetime fields.
function toUtcMidnightIso(date: Date): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString();
}

// Jan 2, 2000 — a Sunday; iterate 7 days for locale-aware weekday labels.
const DAY_NAMES = Array.from({ length: 7 }, (_, i) =>
  WEEKDAY_FORMATTER.format(new Date(2000, 0, 2 + i)),
);

export function TagDateInput({ value = [], onChange, placeholder, startIcon }: TagDateInputProps) {
  const { formatMessage } = useIntl();
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [pendingDates, setPendingDates] = useState<Date[]>([]);
  const today = new Date();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const dialogLabelId = useId();

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const isFutureMonth = viewDate > new Date(today.getFullYear(), today.getMonth(), 1);

  const selectedIsoSet = new Set(value.flatMap((s) => s.dates));
  const pendingSorted =
    pendingDates.length >= 2
      ? [...pendingDates].sort((a, b) => a.getTime() - b.getTime())
      : pendingDates;
  const rangeStart = pendingSorted[0] ?? null;
  const rangeEnd = pendingSorted[pendingSorted.length - 1] ?? null;
  const stateLabel = {
    today: formatMessage(getTrad('auditlog.calendar.state.today')),
    selected: formatMessage(getTrad('auditlog.calendar.state.selected')),
    alreadyAdded: formatMessage(getTrad('auditlog.calendar.state.alreadyAdded')),
    future: formatMessage(getTrad('auditlog.calendar.state.future')),
  };

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => {
    if (!isFutureMonth) {
      setViewDate(new Date(year, month + 1, 1));
    }
  };

  const handleDayClick = (date: Date) => {
    if (pendingDates.some((d) => isSameDay(d, date))) {
      setPendingDates(pendingDates.filter((d) => !isSameDay(d, date)));
    } else {
      setPendingDates([...pendingDates, date]);
    }
  };

  const handleConfirm = () => {
    if (pendingDates.length === 0) return;

    const sortedPending = [...pendingDates].sort((a, b) => a.getTime() - b.getTime());
    const display =
      sortedPending.length === 1
        ? DATE_FORMATTER.format(sortedPending[0])
        : formatRange(sortedPending[0], sortedPending[sortedPending.length - 1]);

    const datesStr =
      sortedPending.length === 1
        ? [toUtcMidnightIso(sortedPending[0])]
        : getDatesBetween(sortedPending[0], sortedPending[sortedPending.length - 1]);

    const selection: DateSelection = { dates: datesStr, display };
    onChange([...value, selection]);
    setPendingDates([]);
    setIsOpen(false);
  };

  const removeTag = (indexToRemove: number) => {
    onChange(value.filter((_, i) => i !== indexToRemove));
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setPendingDates([]);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <TagInputWrapper
      ref={wrapperRef}
      as="div"
      tabIndex={0}
      data-filter-input
      role="button"
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-controls={isOpen ? dialogId : undefined}
      aria-label={placeholder}
      onFocus={() => {
        setViewDate(new Date());
        setIsOpen(true);
      }}
      onBlur={(e: FocusEvent<HTMLDivElement>) => {
        if (!wrapperRef.current?.contains(e.relatedTarget as Node)) {
          setIsOpen(false);
          setPendingDates([]);
        }
      }}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape' && isOpen) {
          e.stopPropagation();
          setIsOpen(false);
          setPendingDates([]);
        } else if (
          (e.key === 'Enter' || e.key === ' ') &&
          !isOpen &&
          e.target === wrapperRef.current
        ) {
          e.preventDefault();
          setViewDate(new Date());
          setIsOpen(true);
        }
      }}
    >
      <Flex gap={2} wrap="wrap" alignItems="center" style={{ flex: 1, minWidth: 0 }}>
        {startIcon && <StartIconSlot>{startIcon}</StartIconSlot>}
        {value.map((selection, index) => (
          <TagChip
            key={selection.display + index}
            label={selection.display}
            onRemove={() => removeTag(index)}
          />
        ))}
        {value.length === 0 && <PlaceholderText>{placeholder}</PlaceholderText>}
        {isOpen && (
          <PopoverContainer
            id={dialogId}
            role="dialog"
            aria-modal="false"
            aria-labelledby={dialogLabelId}
            onClick={(e) => e.stopPropagation()}
          >
            <CalendarHeader gap={2}>
              <MonthNavButton
                type="button"
                onClick={prevMonth}
                aria-label={formatMessage(getTrad('auditlog.calendar.prevMonth'))}
              >
                <span aria-hidden="true">‹</span>
              </MonthNavButton>
              <span
                id={dialogLabelId}
                aria-live="polite"
                style={{ fontSize: '1.4rem', fontWeight: 500 }}
              >
                {MONTH_FORMATTER.format(new Date(year, month, 1))} {year}
              </span>
              <MonthNavButton
                type="button"
                $disabled={isFutureMonth}
                disabled={isFutureMonth}
                onClick={nextMonth}
                aria-label={formatMessage(getTrad('auditlog.calendar.nextMonth'))}
              >
                <span aria-hidden="true">›</span>
              </MonthNavButton>
            </CalendarHeader>
            <CalendarGrid role="grid" aria-labelledby={dialogLabelId}>
              {DAY_NAMES.map((name) => (
                <DayName key={name} role="columnheader">
                  {name}
                </DayName>
              ))}
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div key={`empty-${i}`} role="gridcell" />
              ))}
              {daysInMonth.map((date) => {
                const iso = toUtcMidnightIso(date);
                const isPending = pendingDates.some((d) => isSameDay(d, date));
                const isToday = isSameDay(date, today);
                const isFuture = date > today;
                const isAlreadySelected = selectedIsoSet.has(iso);
                const inRange = pendingDates.length >= 2 && isInRange(date, rangeStart, rangeEnd);
                const disabled = isFuture || isAlreadySelected;
                const stateParts: string[] = [];
                if (isToday) stateParts.push(stateLabel.today);
                if (isPending) stateParts.push(stateLabel.selected);
                if (isAlreadySelected) stateParts.push(stateLabel.alreadyAdded);
                if (isFuture) stateParts.push(stateLabel.future);
                const dateStr = DATE_FORMATTER.format(date);
                const label = stateParts.length
                  ? formatMessage(getTrad('auditlog.calendar.dayWithState'), {
                      date: dateStr,
                      state: stateParts.join(', '),
                    })
                  : dateStr;

                return (
                  <DayButton
                    key={iso}
                    type="button"
                    role="gridcell"
                    $today={isToday}
                    $pending={isPending}
                    $inRange={inRange}
                    $future={isFuture}
                    $alreadySelected={isAlreadySelected}
                    disabled={disabled}
                    aria-pressed={isPending}
                    aria-current={isToday ? 'date' : undefined}
                    onClick={() => !disabled && handleDayClick(date)}
                    aria-label={label}
                  >
                    {date.getDate()}
                  </DayButton>
                );
              })}
            </CalendarGrid>
            {pendingDates.length > 0 && (
              <ConfirmButton type="button" onClick={handleConfirm}>
                {formatMessage(getTrad('page.add'))}
              </ConfirmButton>
            )}
          </PopoverContainer>
        )}
      </Flex>
    </TagInputWrapper>
  );
}
