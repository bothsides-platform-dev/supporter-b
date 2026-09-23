// 사업자번호 표기를 formatBizNoDisplay 로 감싸면서 세 화면 모두 "값이 없을 때" 분기가 새로 생겼다.
// 번호 없이 작성한 견적 요청(법인 설립 전)에서도 표시가 깨지지 않는지 본다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/components/attachments/AttachmentPreviewList', () => ({
  AttachmentPreviewList: () => null,
}));

import { RfpBriefPanel } from '@/components/inbox/RfpBriefPanel';
import { RfpStep4Review } from '../RfpStep4Review';
import { RfpStep1BizProfile } from '../RfpStep1BizProfile';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import type { RFP } from '@/lib/types/rfp';

afterEach(cleanup);

describe('사업자번호가 비어 있을 때', () => {
  it('RfpBriefPanel 은 미입력으로 보여준다', () => {
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
      bizProfile: { bizNo: '' },
    } as unknown as RFP;
    render(
      <RfpBriefPanel
        rfp={rfp}
        buyer={{ id: 'ws-buyer', name: '(주)진짜상사', type: 'buyer', logoUpdatedAt: null }}
      />,
    );
    expect(screen.getByText('미입력')).toBeInTheDocument();
  });

  it('RfpStep1BizProfile 은 번호 칸에 미입력을 보여준다', () => {
    render(
      <RfpStep1BizProfile
        bizProfile={{ bizNo: '', taxType: 'general', status: 'active' }}
        workspaceName="QA상사"
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText('미입력')).toBeInTheDocument();
  });

  describe('RfpStep4Review', () => {
    beforeEach(() => {
      useRfpDraftStore.setState({ title: '테스트', rfpFiles: [] });
    });

    it('번호가 비어 있으면 사업자번호 행에 미입력을 보여준다', () => {
      render(
        <RfpStep4Review
          pgList={[]}
          bizProfile={{ bizNo: '', taxType: 'general', status: 'active' }}
          onBack={vi.fn()}
          onSubmit={vi.fn().mockResolvedValue(undefined)}
          submitting={false}
          serverError=""
        />,
      );
      const label = screen.getByText('사업자번호');
      // ReviewRow 는 라벨 옆 형제 요소에 값을 그리고, 빈 값은 '미입력'으로 드러낸다.
      expect(label.nextElementSibling?.textContent).toBe('미입력');
    });
  });
});
