// Regression: ISSUE-005 — 사업자번호가 화면마다 하이픈 없이(1248100998) 표시됐다
// Found by /qa on 2026-09-23
// Report: .gstack/qa-reports/qa-report-lvh-me-2026-09-23.md
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/components/attachments/AttachmentPreviewList', () => ({
  AttachmentPreviewList: () => null,
}));

import { RfpBriefPanel } from '../RfpBriefPanel';
import type { RFP } from '@/lib/types/rfp';

afterEach(cleanup);

describe('RfpBriefPanel — 사업자번호 표기', () => {
  it('저장된 숫자 10자리를 하이픈으로 끊어 보여준다', () => {
    const rfp = {
      id: 'rfp-1',
      code: 'P-2605-0042',
      buyerWsId: 'ws-buyer',
      title: '결제대행 RFP',
      memo: '',
      rfpFiles: [],
      allowedPgWorkspaceIds: [],
      requiredPaymentMethods: [],
      customPaymentMethods: [],
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      status: 'sent',
      createdBy: 'u1',
      createdAt: new Date().toISOString(),
      bizProfile: { bizNo: '1248100998' },
    } as unknown as RFP;
    render(
      <RfpBriefPanel
        rfp={rfp}
        buyer={{ id: 'ws-buyer', name: '(주)진짜상사', type: 'buyer', logoUpdatedAt: null }}
      />,
    );
    expect(screen.getByText('124-81-00998')).toBeInTheDocument();
  });
});
