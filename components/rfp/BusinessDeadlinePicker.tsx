'use client';

import { useEffect, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { CalendarDays } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { ko } from 'react-day-picker/locale';
import 'react-day-picker/style.css';
import './business-deadline-calendar.css';
import { businessDeadline, validateBusinessDeadline } from '@/lib/rfp/business-deadline';
import { kstDateOf } from '@/lib/utils/deadline';
import type { BusinessCalendarDto } from '@/lib/server/actions/rfp/getBusinessCalendarAction';
import type { DeadlineChoice } from '@/lib/rfp/deadline-choice';

export type CalendarDto = BusinessCalendarDto;
const DAY_MS = 86_400_000;
const safeDate = (value: string) => value && Number.isFinite(new Date(value).getTime()) ? kstDateOf(new Date(value)) : '';
const calendarDate = (date: string) => new Date(`${date}T12:00:00`);
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const deadlineForDate = (date: string) => new Date(`${date}T09:00:00.000Z`).toISOString();
const dateAfter = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export function BusinessDeadlinePicker({ label, value, onChange, calendar, now: givenNow, choice, onValidityChange, afterDeadline }: {
  label: string; value: string; onChange: (value: string, choice: DeadlineChoice) => void;
  calendar: CalendarDto; now?: Date; choice?: DeadlineChoice;
  onValidityChange?: (valid: boolean) => void; afterDeadline?: string;
}) {
  const [validationNow, setValidationNow] = useState(() => givenNow ?? new Date());
  const [selectionOverride, setSelectionOverride] = useState<{ baseValue: string; value: string; choice: DeadlineChoice } | null>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => calendarDate(safeDate(value) || kstDateOf(givenNow ?? new Date())));
  const cal = { ...calendar, holidays: new Set(calendar.holidays) };
  const activeChoice = selectionOverride && value === selectionOverride.baseValue
    ? selectionOverride.choice : choice ?? (value ? { mode: 'date' as const } : { mode: 'period' as const, days: 5 });
  const today = kstDateOf(validationNow);
  const lastDate = dateAfter(today, 30);
  let firstDate = '';
  try { firstDate = kstDateOf(new Date(businessDeadline(validationNow, 3, cal))); } catch { /* Incomplete calendar: no choices. */ }

  const selectable = (date: string, at = validationNow) => {
    let earliest = '';
    try { earliest = kstDateOf(new Date(businessDeadline(at, 3, cal))); } catch { return false; }
    if (!date || date < earliest || date > dateAfter(kstDateOf(at), 30)) return false;
    try {
      const candidate = deadlineForDate(date);
      return !validateBusinessDeadline(at, new Date(candidate), cal)
        && (!afterDeadline || Date.parse(candidate) > Date.parse(afterDeadline));
    } catch { return false; }
  };
  let firstSelectableDate = '';
  for (let day = 0; day <= 30 && !firstSelectableDate; day++) {
    const candidate = dateAfter(today, day);
    if (selectable(candidate)) firstSelectableDate = candidate;
  }
  let defaultValue = '';
  if (calendar.enabled && !value && activeChoice.mode === 'period' && !selectionOverride) {
    try {
      const candidate = businessDeadline(validationNow, activeChoice.days, cal);
      if (selectable(kstDateOf(new Date(candidate)))) defaultValue = candidate;
    } catch { /* The calendar does not cover the default period. */ }
  }
  const displayValue = selectionOverride && value === selectionOverride.baseValue
    ? selectionOverride.value : value || defaultValue;
  const selectedDate = safeDate(displayValue);
  const selectedProblem = calendar.enabled && selectedDate
    ? validateBusinessDeadline(validationNow, new Date(displayValue), cal) : null;
  const afterProblem = !!afterDeadline && !!displayValue && Date.parse(displayValue) <= Date.parse(afterDeadline);
  const valid = calendar.enabled
    ? !!selectedDate && !selectedProblem && !afterProblem && !!firstDate
    : !!selectedDate && Date.parse(displayValue) > validationNow.getTime();

  useEffect(() => {
    if (defaultValue && activeChoice.mode === 'period') onChange(defaultValue, activeChoice);
  // Only initialize an empty field. A calendar refresh must never replace a saved date.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { onValidityChange?.(valid); }, [onValidityChange, valid]);
  useEffect(() => {
    if (givenNow) return;
    const current = new Date();
    const nextMidnight = Date.parse(`${dateAfter(kstDateOf(current), 1)}T00:00:00+09:00`);
    const timer = setTimeout(() => setValidationNow(new Date()), Math.max(1000, nextMidnight - current.getTime() + 50));
    return () => clearTimeout(timer);
  }, [givenNow, validationNow]);

  const updatePeriod = (days: number) => {
    const pickedAt = givenNow ?? new Date();
    let candidate = '';
    try { candidate = businessDeadline(pickedAt, days, cal); } catch { return; }
    if (!selectable(kstDateOf(new Date(candidate)), pickedAt)) return;
    const next = { mode: 'period' as const, days };
    setValidationNow(pickedAt);
    setSelectionOverride({ baseValue: value, value: candidate, choice: next });
    onChange(candidate, next);
  };
  const updateDate = (date: Date | undefined) => {
    if (!date) return;
    const key = dateKey(date);
    if (!selectable(key, givenNow ?? new Date())) return;
    const candidate = deadlineForDate(key);
    const next = { mode: 'date' as const };
    setSelectionOverride({ baseValue: value, value: candidate, choice: next });
    onChange(candidate, next);
    setOpen(false);
  };
  const readable = selectedDate ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(displayValue)) : '';
  const openCalendar = (next: boolean) => {
    if (next) setMonth(calendarDate(selectedDate >= firstDate && selectedDate <= lastDate ? selectedDate : firstSelectableDate || firstDate || today));
    setOpen(next);
  };

  return <div className="space-y-2">
    <span className="md-label-medium text-[var(--md-sys-color-on-surface)]">{label}</span>
    {calendar.enabled ? <>
      {!firstDate && <p role="alert" className="text-[13px] text-[var(--md-sys-color-error)]">영업일 달력을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>}
      {firstDate && <>
        <div className="flex flex-wrap gap-2" role="group" aria-label="영업일 기간">
          {[3, 5, 10].map(days => {
            let available = false;
            try { available = selectable(kstDateOf(new Date(businessDeadline(validationNow, days, cal)))); } catch { /* Calendar not covered. */ }
            return <button type="button" key={days} disabled={!available} aria-pressed={activeChoice.mode === 'period' && activeChoice.days === days} onClick={() => updatePeriod(days)} className="min-h-9 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] px-3 text-[14px] hover:bg-[var(--md-sys-color-surface-container)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)] aria-pressed:border-[var(--md-sys-color-primary)] aria-pressed:text-[var(--md-sys-color-primary)] disabled:cursor-not-allowed disabled:opacity-45">{days}영업일</button>;
          })}
        </div>
        <Popover.Root open={open} onOpenChange={openCalendar}>
          <Popover.Trigger type="button" disabled={!firstSelectableDate} aria-label={`${label} 날짜 선택. ${readable || '날짜 미선택'} 오후 6시 마감`} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 text-left text-[14px] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)] disabled:cursor-not-allowed disabled:opacity-45">
            <span>{readable ? <><span className="md-numeric">{readable}</span> · 오후 6시 마감</> : '날짜 선택 · 오후 6시 마감'}</span>
            <CalendarDays size={18} aria-hidden className="shrink-0 text-[var(--md-sys-color-on-surface-variant)]" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={12} className="isolate z-50 w-[min(22rem,calc(100vw-2rem))]">
              <Popover.Popup aria-label={`${label} 달력`} className="w-full rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-3 text-[var(--md-sys-color-on-surface)] shadow-md focus:outline-none">
                <DayPicker mode="single" required locale={ko} month={month} onMonthChange={setMonth} today={calendarDate(today)} autoFocus selected={selectedDate ? calendarDate(selectedDate) : undefined} onSelect={updateDate} disabled={(day) => !selectable(dateKey(day))} startMonth={calendarDate(firstDate)} endMonth={calendarDate(lastDate)} navLayout="around" className="business-deadline-calendar" classNames={{ day_button: 'rdp-day_button md-numeric', month_caption: 'rdp-month_caption md-numeric' }} />
                <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]"><span className="md-numeric">{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(calendarDate(firstSelectableDate || firstDate))}</span>부터 선택할 수 있어요. 주말·공휴일·근로자의 날은 제외해요.</p>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
        {afterProblem && <p role="alert" className="text-[13px] text-[var(--md-sys-color-error)]">현재 가장 늦은 마감일보다 뒤로 선택해 주세요.</p>}
        {selectedProblem && <p role="alert" className="text-[13px] text-[var(--md-sys-color-error)]">{selectedProblem === 'TOO_SOON' ? '저장된 날짜가 지금은 3영업일보다 가까워요. 새 날짜를 선택해 주세요.' : selectedProblem === 'TOO_LATE' ? '저장된 날짜가 요청일로부터 30일을 넘어요. 새 날짜를 선택해 주세요.' : selectedProblem === 'HOLIDAY' ? '저장된 날짜가 한국 영업일이 아니에요. 새 날짜를 선택해 주세요.' : '저장된 날짜를 다시 선택해 주세요.'}</p>}
        {!firstSelectableDate && <p role="alert" className="text-[13px] text-[var(--md-sys-color-error)]">선택할 수 있는 마감일이 없어요. 현재 마감일을 확인해 주세요.</p>}
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">요청일을 제외하고 최소 3영업일, 최대 30일 안에서 선택해요.</p>
      </>}
    </> : <input aria-label={label} type="date" value={selectedDate} onChange={event => { const next = event.target.value ? new Date(`${event.target.value}T14:59:59.999Z`).toISOString() : ''; setSelectionOverride({ baseValue: value, value: next, choice: { mode: 'date' } }); onChange(next, { mode: 'date' }); }} className="md-numeric" />}
  </div>;
}
