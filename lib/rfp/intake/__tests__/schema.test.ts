// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createRfpInputSchema } from '@/lib/rfp/intake/schema';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const PG_ID = '22222222-2222-4222-8222-222222222222';

const sendable = () => ({
  title: '견적 요청',
  deadline: '2099-01-01T23:59:59+09:00',
  allowedPgWorkspaceIds: [PG_ID],
  requiredPaymentMethods: ['card' as const],
  websiteUrl: 'example.com',
  contractType: 'new' as const,
  mainProducts: '의류',
  industryGroupId: GROUP_ID,
  productInfo: { cashConvertible: false, maximumPrice: 'under_100k' as const, salesMethods: ['none' as const] },
  deliveryServicePeriod: 'D+3',
  send: true,
});

function failedRules(input: unknown): string[] {
  const parsed = createRfpInputSchema.safeParse(input);
  if (parsed.success) return [];
  return parsed.error.issues.map(
    (issue) => (issue as { params?: { rule?: string } }).params?.rule ?? `${issue.code}:${issue.path.join('.')}`,
  );
}

describe('createRfpInputSchema 발송 전제', () => {
  it('발송 가능한 입력은 통과한다', () => {
    expect(createRfpInputSchema.safeParse(sendable()).success).toBe(true);
  });

  it('드래프트 저장(send=false)은 발송 전제를 묻지 않는다', () => {
    expect(createRfpInputSchema.safeParse({ title: '초안', deadline: '2099-01-01T23:59:59+09:00', allowedPgWorkspaceIds: [] }).success).toBe(true);
  });

  it('발송 전제 미충족은 규칙 이름을 params.rule 로 싣는다', () => {
    expect(failedRules({ ...sendable(), title: '   ', websiteUrl: undefined, contractType: 'renewal' })).toEqual([
      'title',
      'website-required',
      'current-pgs',
      'monthly-avg-volume',
    ]);
    expect(failedRules({ ...sendable(), industryGroupId: undefined })).toEqual(['industry']);
  });

  it('단계 3(마감·PG)은 스키마가 아니라 서비스가 판정하므로 빈 PG 목록도 통과한다', () => {
    expect(createRfpInputSchema.safeParse({ ...sendable(), allowedPgWorkspaceIds: [] }).success).toBe(true);
  });

  it('존재하지 않는 TLD 는 발송 여부와 무관하게 필드 refine 이 거부한다', () => {
    expect(failedRules({ ...sendable(), send: false, websiteUrl: 'example.notatld' })).toEqual(['custom:websiteUrl']);
  });
});
