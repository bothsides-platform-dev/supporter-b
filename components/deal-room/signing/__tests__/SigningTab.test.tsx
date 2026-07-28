import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/server/actions/signing/remindSigningAction', () => ({
  remindSigningAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/server/actions/signing/cancelSigningAction', () => ({
  cancelSigningAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/server/actions/signing/resendSigningAction', () => ({
  resendSigningAction: vi.fn(async () => ({ ok: false, error: 'CONTRACT_BUSY' })),
}));
vi.mock('@/lib/observability/capture', () => ({ captureActionError: vi.fn() }));

import { SigningTab } from '../SigningTab';
import { toast } from '@/lib/toast';
import { captureActionError } from '@/lib/observability/capture';
import { remindSigningAction } from '@/lib/server/actions/signing/remindSigningAction';
import { cancelSigningAction } from '@/lib/server/actions/signing/cancelSigningAction';
import { resendSigningAction } from '@/lib/server/actions/signing/resendSigningAction';
import type {
  SigningContractStatus,
  SigningParticipant,
  SigningParticipantRole,
  SigningParticipantStatus,
  SigningView,
} from '@/lib/types/signing';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function part(
  role: SigningParticipantRole,
  status: SigningParticipantStatus,
  over: Partial<SigningParticipant> = {},
): SigningParticipant {
  return {
    id: role,
    contractId: 'c1',
    name: role === 'buyer' ? '김구매' : '이대행',
    email: `${role}@x.com`,
    role,
    securityMethod: 'easy_cert',
    status,
    ...over,
  };
}

function view(status: SigningContractStatus, participants: SigningParticipant[] = []): SigningView {
  return {
    contract: {
      id: 'c1',
      rfpId: 'r1',
      status,
      round: 1,
      createdBy: 'u',
      createdAt: '2026-07-20T04:40:00Z',
      sentAt: '2026-07-20T05:02:00Z',
      ...(status === 'completed' ? { completedAt: '2026-07-21T01:24:00Z' } : {}),
    },
    participants,
  };
}

describe('SigningTab', () => {
  it('awaiting_pg_template — 구매사는 대기 안내를 본다', () => {
    render(<SigningTab rfpCode="P-2607-0001" signing={view('awaiting_pg_template')} side="buyer" />);
    expect(screen.getByText('PG사가 계약서를 준비하고 있어요')).toBeInTheDocument();
    expect(screen.getByText('PG사가 계약서 준비 중')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '서명 템플릿 등록하기' })).not.toBeInTheDocument();
  });

  it('awaiting_pg_template — PG는 템플릿 등록 화면으로 갈 수 있다', async () => {
    const user = userEvent.setup();
    render(<SigningTab rfpCode="P-2607-0001" signing={view('awaiting_pg_template')} side="pg" />);
    expect(screen.getByText('계약서 템플릿을 등록해 주세요')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '서명 템플릿 등록하기' }));
    expect(nav.push).toHaveBeenCalledWith('/signing-templates');
  });

  it('in_progress — 참여자 타임라인 + 리마인더 발신', async () => {
    const user = userEvent.setup();
    render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('in_progress', [part('buyer', 'signed'), part('pg', 'pending')])}
        side="buyer"
      />,
    );
    expect(screen.getByText(/김구매/)).toBeInTheDocument();
    expect(screen.getByText(/이대행/)).toBeInTheDocument();
    expect(screen.getByText('서명 대기')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '리마인더 보내기' }));
    expect(remindSigningAction).toHaveBeenCalledWith({ contractId: 'c1' });
  });

  it('in_progress — 취소 버튼→확인 다이얼로그 확정 시 취소 액션을 호출하고 성공 토스트를 띄운다', async () => {
    const user = userEvent.setup();
    render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('in_progress', [part('buyer', 'signed'), part('pg', 'pending')])}
        side="buyer"
      />,
    );
    await user.click(screen.getByRole('button', { name: '취소' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('전자서명을 취소할까요?')).toBeInTheDocument();
    // dismiss(취소)와 확정(취소하기)은 접근성 이름으로 구분된다 — 견적 요청 취소
    // 다이얼로그(BuyerDealRoomBody)와 같은 관례.
    await user.click(within(dialog).getByRole('button', { name: '취소하기' }));
    expect(cancelSigningAction).toHaveBeenCalledWith({ contractId: 'c1' });
    expect(toast).toHaveBeenCalledWith('전자서명을 취소했어요', { type: 'success' });
  });

  it('in_progress — 취소 버튼→확인 다이얼로그 dismiss 시 취소 액션을 호출하지 않는다', async () => {
    const user = userEvent.setup();
    render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('in_progress', [part('buyer', 'signed'), part('pg', 'pending')])}
        side="buyer"
      />,
    );
    await user.click(screen.getByRole('button', { name: '취소' }));
    const dialog = await screen.findByRole('dialog');
    // dismiss(취소)와 확정(취소하기)은 접근성 이름으로 구분된다.
    await user.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(cancelSigningAction).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('completed — 완료 안내 + 문서 다운로드 링크', () => {
    render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('completed', [part('buyer', 'signed'), part('pg', 'signed')])}
        side="buyer"
      />,
    );
    expect(screen.getByText('모든 서명이 완료됐어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /계약서/ })).toHaveAttribute(
      'href',
      '/api/signing/c1/document',
    );
    expect(screen.getByRole('link', { name: /감사추적인증서/ })).toHaveAttribute(
      'href',
      '/api/signing/c1/audit',
    );
  });

  it('completed — 다운로드 링크가 새 탭·내려받기임을 접근성 이름으로 알린다', () => {
    render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('completed', [part('buyer', 'signed'), part('pg', 'signed')])}
        side="buyer"
      />,
    );
    // target="_blank" 이고 실제로는 302 로 파일이 내려오는데, 그 사실을 시각적으로
    // 알리는 Download 아이콘은 aria-hidden 이라 접근성 이름에 실리지 않았다.
    expect(screen.getAllByRole('link', { name: /새 탭에서 내려받아요/ })).toHaveLength(2);
  });

  it('completed — 새 탭 고지는 시각적으로 숨긴다 (아이콘이 이미 알려준다)', () => {
    render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('completed', [part('buyer', 'signed'), part('pg', 'signed')])}
        side="buyer"
      />,
    );
    for (const el of screen.getAllByText('새 탭에서 내려받아요')) {
      expect(el).toHaveClass('sr-only');
    }
  });

  it('declined — 다시 발송 실패 시 친절한 문구로 알린다', async () => {
    const user = userEvent.setup();
    render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('declined', [part('buyer', 'signed'), part('pg', 'rejected')])}
        side="buyer"
      />,
    );
    expect(screen.getByText('서명이 거절됐어요')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 발송' }));
    expect(resendSigningAction).toHaveBeenCalledWith({ rfpCode: 'P-2607-0001' });
    expect(toast).toHaveBeenCalledWith('다른 작업이 처리 중이에요. 잠시 후 다시 시도해 주세요.', {
      type: 'error',
    });
  });

  it('send_failed — 다시 시작 버튼을 노출한다', () => {
    render(<SigningTab rfpCode="P-2607-0001" signing={view('send_failed')} side="pg" />);
    expect(screen.getByText('전자서명을 시작하지 못했어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시작' })).toBeInTheDocument();
  });

  it('send_failed — 다시 시작 성공 시 "다시 시작했어요" 토스트를 띄운다', async () => {
    vi.mocked(resendSigningAction).mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<SigningTab rfpCode="P-2607-0001" signing={view('send_failed')} side="pg" />);
    await user.click(screen.getByRole('button', { name: '다시 시작' }));
    expect(toast).toHaveBeenCalledWith('다시 시작했어요', { type: 'success' });
  });

  it('in_progress — 액션 처리 중엔 버튼이 비활성화되고, 끝나면 다시 활성화된다', async () => {
    let resolveRemind!: (v: { ok: true }) => void;
    vi.mocked(remindSigningAction).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRemind = resolve;
      }),
    );
    const user = userEvent.setup();
    render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('in_progress', [part('buyer', 'signed'), part('pg', 'pending')])}
        side="buyer"
      />,
    );
    const remindButton = screen.getByRole('button', { name: '리마인더 보내기' });
    const cancelButton = screen.getByRole('button', { name: '취소' });
    await user.click(remindButton);
    expect(remindButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
    resolveRemind({ ok: true });
    await waitFor(() => expect(remindButton).not.toBeDisabled());
    expect(cancelButton).not.toBeDisabled();
    expect(toast).toHaveBeenCalledWith('리마인더를 보냈어요', { type: 'success' });
  });

  it('서버 액션이 reject되면 에러 토스트를 띄우고 버튼을 다시 활성화한다', async () => {
    const boom = new Error('boom');
    vi.mocked(resendSigningAction).mockRejectedValueOnce(boom);
    const user = userEvent.setup();
    render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('declined', [part('buyer', 'signed'), part('pg', 'rejected')])}
        side="buyer"
      />,
    );
    const button = screen.getByRole('button', { name: '다시 발송' });
    await user.click(button);
    expect(toast).toHaveBeenCalledWith('다시 발송하지 못했어요', { type: 'error' });
    expect(button).not.toBeDisabled();
  });

  it('서버 액션이 throw 하면 Sentry 로 관측 신호를 보낸다(조용히 삼키지 않는다)', async () => {
    const boom = new Error('boom');
    vi.mocked(resendSigningAction).mockRejectedValueOnce(boom);
    const user = userEvent.setup();
    render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('declined', [part('buyer', 'signed'), part('pg', 'rejected')])}
        side="buyer"
      />,
    );
    await user.click(screen.getByRole('button', { name: '다시 발송' }));
    expect(captureActionError).toHaveBeenCalledWith(
      'signing.tab_action',
      boom,
      null,
      expect.objectContaining({ actionId: 'resend' }),
    );
  });

  it('취소 다이얼로그를 연 뒤 계약이 종결 상태로 바뀌어도(웹훅+refresh), 취소 확정 토스트는 처음 열었을 때의 문구를 유지한다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('in_progress', [part('buyer', 'signed'), part('pg', 'pending')])}
        side="buyer"
      />,
    );
    await user.click(screen.getByRole('button', { name: '취소' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('전자서명을 취소할까요?')).toBeInTheDocument();

    // 다이얼로그가 열린 채로 계약이 completed 로 전이(예: 웹훅 반영 후 router.refresh())
    // — 컴포넌트는 리마운트되지 않고 signing prop 만 갱신된다.
    rerender(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('completed', [part('buyer', 'signed'), part('pg', 'signed')])}
        side="buyer"
      />,
    );

    await user.click(within(dialog).getByRole('button', { name: '취소하기' }));
    expect(cancelSigningAction).toHaveBeenCalledWith({ contractId: 'c1' });
    expect(toast).toHaveBeenCalledWith('전자서명을 취소했어요', { type: 'success' });
  });
});
