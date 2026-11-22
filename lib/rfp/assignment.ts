export const VOLUME_BANDS = ['under10m', '10m', '30m', '50m', '100m'] as const;
export type VolumeBand = (typeof VOLUME_BANDS)[number];
export const VOLUME_LABELS: Record<VolumeBand, string> = {
  under10m: '1,000만 원 미만',
  '10m': '1,000만 원 이상 3,000만 원 미만',
  '30m': '3,000만 원 이상 5,000만 원 미만',
  '50m': '5,000만 원 이상 1억 원 미만',
  '100m': '1억 원 이상',
};

export const assignmentIntakeEnabled = () => process.env.NEXT_PUBLIC_PG_ASSIGNMENT_ENABLED === 'true';
export const websiteFirstIntake = () => assignmentIntakeEnabled() || process.env.NEXT_PUBLIC_PG_INSTANT_QUOTE_ENABLED === 'true';
export const CONTACT_CONSENT_VERSION = '2026-11-22';
export const contactConsentText = (pg: string) =>
  `${pg}의 배정 담당자에게 첫 연락을 위해 요청 작성자의 이름, 이메일, 전화번호를 제공하는 데 동의해요.`;

export type ContactConsent = { pgId: string; version: typeof CONTACT_CONSENT_VERSION };
export function hasContactConsent(consent: ContactConsent | undefined, pgId: string) {
  return consent?.pgId === pgId && consent.version === CONTACT_CONSENT_VERSION;
}

export function assignmentSize(input: {
  contractType?: string | null;
  monthlyAvgPgVolume?: string;
  expectedVolume?: VolumeBand | '' | null;
}) {
  if (input.contractType === 'renewal') {
    const amount = input.monthlyAvgPgVolume?.trim() ?? '';
    if (!/^\d+$/.test(amount)) return null;
    if (Number(amount) >= 100_000_000) return '100m';
    return Number(amount) >= 50_000_000 ? '50m' : null;
  }
  return input.expectedVolume === '50m' || input.expectedVolume === '100m'
    ? input.expectedVolume
    : null;
}

export type AssignmentSummary = {
  due: string;
  assigned: boolean;
  canSwitch: boolean;
  contactAt: string | null;
  questionId?: string;
  canReport?: boolean;
  reportAfter?: string;
};
