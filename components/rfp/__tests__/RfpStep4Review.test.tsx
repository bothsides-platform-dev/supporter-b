// components/rfp/__tests__/RfpStep4Review.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpStep4Review } from '../RfpStep4Review';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

function resetStore() {
  useRfpDraftStore.setState({
    title: '테스트 제안건',
    deadline: '',
    allowedPgWorkspaceIds: [
      { id: 'pg-1', displayName: '나이스페이먼츠' },
      { id: 'pg-2', displayName: 'KG이니시스' },
    ],
    websiteUrl: 'https://example.com',
    annualPgVolume: '10억',
    currentSolution: 'cafe24',
  });
}

describe('RfpStep4Review', () => {
  beforeEach(resetStore);

  it('마감일 없으면 발송 버튼이 비활성화된다', () => {
    render(
      <RfpStep4Review
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        submitting={false}
        serverError=""
      />,
    );
    expect(screen.getByRole('button', { name: /발송/ })).toBeDisabled();
  });

  it('제안 제목이 요약에 표시된다', () => {
    render(
      <RfpStep4Review
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        submitting={false}
        serverError=""
      />,
    );
    expect(screen.getByText('테스트 제안건')).toBeInTheDocument();
  });

  it('선택된 PG 수가 발송 버튼 텍스트에 표시된다', () => {
    useRfpDraftStore.setState({ deadline: '2026-06-30T23:59:59Z' });
    render(
      <RfpStep4Review
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        submitting={false}
        serverError=""
      />,
    );
    expect(screen.getByRole('button', { name: '2개 PG사에 발송' })).toBeInTheDocument();
  });

  it('serverError가 있으면 에러 메시지를 표시한다', () => {
    render(
      <RfpStep4Review
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        submitting={false}
        serverError="INVALID_INPUT"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('INVALID_INPUT');
  });

  it('발송 버튼 클릭 시 onSubmit이 호출된다', async () => {
    useRfpDraftStore.setState({ deadline: '2026-06-30T23:59:59Z' });
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <RfpStep4Review
        onBack={vi.fn()}
        onSubmit={onSubmit}
        submitting={false}
        serverError=""
      />,
    );
    await user.click(screen.getByRole('button', { name: '2개 PG사에 발송' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('submitting=true면 버튼이 비활성화되고 "발송 중…"을 표시한다', () => {
    useRfpDraftStore.setState({ deadline: '2026-06-30T23:59:59Z' });
    render(
      <RfpStep4Review
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        submitting={true}
        serverError=""
      />,
    );
    expect(screen.getByRole('button', { name: '발송 중…' })).toBeDisabled();
  });
});
