import type { RfpStatus } from '@/lib/types/rfp';

const ALLOWED: Partial<Record<RfpStatus, RfpStatus[]>> = {
  draft: ['sent'],
  sent: ['closed', 'cancelled', 'awarded'],
};

export function canTransition(from: RfpStatus, to: RfpStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertTransition(from: RfpStatus, to: RfpStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid RFP transition: ${from} → ${to}`);
  }
}
