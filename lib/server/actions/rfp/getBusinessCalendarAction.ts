'use server';
import { requireBuyerActor } from '../_session';
import { getBusinessCalendarRepo } from '@/lib/server/repositories/factory';
import { kstDateOf } from '@/lib/utils/deadline';

export type BusinessCalendarDto = {
  enabled: boolean;
  coveredFrom: string;
  coveredThrough: string;
  holidays: string[];
  version: string;
};

export async function getBusinessCalendarAction(requestedAt?: string): Promise<BusinessCalendarDto> {
  const actor = await requireBuyerActor();
  if (!actor.ok) throw new Error('FORBIDDEN_BUYER');
  const enabled = process.env.BUSINESS_DEADLINES_ENABLED === 'true';
  const unavailable = { enabled, coveredFrom: '', coveredThrough: '', holidays: [], version: '' };
  if (!enabled) return unavailable;
  const now = requestedAt ? new Date(requestedAt) : new Date();
  if (!Number.isFinite(now.getTime())) return unavailable;
  const from = kstDateOf(now);
  const end = kstDateOf(new Date(now.getTime() + 30 * 86_400_000));
  const repo = await getBusinessCalendarRepo();
  const calendar = await repo.read(from, end) ?? await repo.read(from, `${from.slice(0, 4)}-12-31`);
  return calendar ? {
    enabled, coveredFrom: calendar.coveredFrom ?? '', coveredThrough: calendar.coveredThrough,
    holidays: [...calendar.holidays].sort(), version: calendar.version ?? '',
  } : unavailable;
}
