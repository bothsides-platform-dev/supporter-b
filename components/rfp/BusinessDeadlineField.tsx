'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { getBusinessCalendarAction } from '@/lib/server/actions/rfp/getBusinessCalendarAction';
import { BusinessDeadlinePicker, DeadlineGroup } from './BusinessDeadlinePicker';
import type { BusinessCalendarDto } from '@/lib/server/actions/rfp/getBusinessCalendarAction';
import type { DeadlineChoice } from '@/lib/rfp/deadline-choice';

export function BusinessDeadlineField({ label, labelAddon, value, onChange, choice, onValidityChange, fixtureCalendar, afterDeadline, refreshKey = 0 }: { label: string; labelAddon?: ReactNode; value: string; onChange: (value: string, choice: DeadlineChoice) => void; choice?: DeadlineChoice; onValidityChange?: (valid: boolean) => void; fixtureCalendar?: BusinessCalendarDto; afterDeadline?: string; refreshKey?: number }) {
  const [calendar, setCalendar] = useState<BusinessCalendarDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadedKey, setLoadedKey] = useState(-1);
  useEffect(() => {
    if (fixtureCalendar) return;
    let alive = true;
    onValidityChange?.(false);
    getBusinessCalendarAction().then(result => { if (alive) { setCalendar(result); setFailed(false); setLoadedKey(refreshKey); } }).catch(() => { if (alive) { setFailed(true); setLoadedKey(refreshKey); } });
    return () => { alive = false; };
  // onValidityChange identity is set by the parent; it must not restart a calendar fetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtureCalendar, refreshKey]);
  const currentCalendar = fixtureCalendar ?? (loadedKey === refreshKey ? calendar : null);
  if (failed && loadedKey === refreshKey) return <DeadlineGroup label={label} labelAddon={labelAddon}><p role="alert" className="text-[13px] text-[var(--md-sys-color-error)]">영업일 달력을 불러오지 못했어요. 화면을 새로고침해 주세요.</p></DeadlineGroup>;
  if (!currentCalendar) return <DeadlineGroup label={label} labelAddon={labelAddon}><p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">영업일 달력을 불러오는 중이에요…</p></DeadlineGroup>;
  return <BusinessDeadlinePicker label={label} labelAddon={labelAddon} value={value} onChange={onChange} choice={choice} calendar={currentCalendar} onValidityChange={onValidityChange} afterDeadline={afterDeadline} />;
}
