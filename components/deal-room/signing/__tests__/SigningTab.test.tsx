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
const embedMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, iframeUrl: 'https://app.snowsign.example/e', sessionId: 's1' }) as
    { ok: boolean; error?: string; iframeUrl?: string; sessionId?: string; claimedAt?: string }),
);
vi.mock('@/lib/server/actions/signing/issueSigningSendEmbedSessionAction', () => ({
  issueSigningSendEmbedSessionAction: embedMock,
}));
const attachMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true }) as { ok: boolean; error?: string; participantMismatch?: boolean }),
);
vi.mock('@/lib/server/actions/signing/attachSigningContractAction', () => ({
  attachSigningContractAction: attachMock,
}));
const releaseMock = vi.hoisted(() => vi.fn(async () => ({ ok: true }) as { ok: boolean; error?: string }));
vi.mock('@/lib/server/actions/signing/releaseSigningSendEmbedAction', () => ({
  releaseSigningSendEmbedAction: releaseMock,
}));
const renewMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, claimedAt: '2026-08-01T12:01:00.000Z' }) as
    { ok: boolean; error?: string; claimedAt?: string }),
);
vi.mock('@/lib/server/actions/signing/renewSigningSendEmbedAction', () => ({
  renewSigningSendEmbedAction: renewMock,
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
    expect(screen.queryByRole('button', { name: '계약서 올리기' })).not.toBeInTheDocument();
  });

  it('awaiting_pg_template — PG는 계약서 업로드 안내를 본다', () => {
    render(<SigningTab rfpCode="P-2607-0001" signing={view('awaiting_pg_template')} side="pg" />);
    expect(screen.getByText('계약서를 올리고 보내요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계약서 올리기' })).toBeInTheDocument();
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

describe('SigningTab — 계약서 업로드 발송 (PG)', () => {
  const EMBED_ORIGIN = 'https://app.snowsign.example';

  function renderPg() {
    render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('awaiting_pg_template')}
        side="pg"
        buyerSigner={{ name: '김구매', email: 'buyer@corp.com' }}
      />,
    );
  }

  function postCompletion(contractId = 'ct_abc12345') {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'snowsign.embed.contract.sent', contract_id: contractId },
        origin: EMBED_ORIGIN,
      }),
    );
  }

  it('업로드 버튼을 누르면 임베드 세션을 발급받아 iframe 을 띄운다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({ ok: true, iframeUrl: `${EMBED_ORIGIN}/e`, sessionId: 's1' });
    renderPg();
    // 임베드는 서버가 리스를 잡으므로 버튼을 누른 시점에만 발급한다.
    expect(screen.queryByTitle('스노우싸인 계약서 발송')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await waitFor(() =>
      expect(screen.getByTitle('스노우싸인 계약서 발송')).toHaveAttribute(
        'src',
        `${EMBED_ORIGIN}/e`,
      ),
    );
    expect(embedMock).toHaveBeenCalledWith({ rfpCode: 'P-2607-0001' });
  });

  it('리스를 다른 담당자가 쥐고 있으면 iframe 을 열지 않고 알린다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({ ok: false, error: 'CONTRACT_BUSY' });
    renderPg();

    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(screen.queryByTitle('스노우싸인 계약서 발송')).not.toBeInTheDocument();
  });

  it('임베드가 완료를 알리면 계약을 바인딩하고 새로고침한다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({ ok: true, iframeUrl: `${EMBED_ORIGIN}/e`, sessionId: 's1' });
    attachMock.mockResolvedValue({ ok: true });
    renderPg();
    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

    postCompletion();
    await waitFor(() =>
      expect(attachMock).toHaveBeenCalledWith({
        rfpCode: 'P-2607-0001',
        providerContractId: 'ct_abc12345',
      }),
    );
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
  });

  // 이미 발송된 계약이라 막지 않는다 — 잘못 갔다는 사실을 알리고 취소로 유도한다.
  it('구매사 담당자가 수신자에 없으면 경고 토스트를 띄운다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({ ok: true, iframeUrl: `${EMBED_ORIGIN}/e`, sessionId: 's1' });
    attachMock.mockResolvedValue({ ok: true, participantMismatch: true });
    renderPg();
    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

    postCompletion();
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('구매사 담당자'), {
        type: 'error',
      }),
    );
  });

  it('바인딩에 실패하면 새로고침하지 않는다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({ ok: true, iframeUrl: `${EMBED_ORIGIN}/e`, sessionId: 's1' });
    attachMock.mockResolvedValue({ ok: false, error: 'CONTRACT_CHANGED' });
    renderPg();
    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

    postCompletion();
    await waitFor(() => expect(attachMock).toHaveBeenCalled());
    expect(nav.refresh).not.toHaveBeenCalled();
  });


  // 닫기가 리스를 반납하지 않으면, 닫은 본인이 30분 동안 다시 못 연다.
  // (실사용 회귀: 닫기 → 계약서 올리기 → '다른 작업이 처리 중이에요' 토스트)
  it('임베드를 닫으면 리스를 반납한다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({
      ok: true,
      iframeUrl: `${EMBED_ORIGIN}/e`,
      sessionId: 's1',
      claimedAt: '2026-08-01T12:00:00.000Z',
    });
    renderPg();
    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

    await user.click(screen.getByRole('button', { name: '닫기' }));
    await waitFor(() =>
      expect(releaseMock).toHaveBeenCalledWith({
        rfpCode: 'P-2607-0001',
        claimedAt: '2026-08-01T12:00:00.000Z',
      }),
    );
    // 패널이 닫히고 버튼이 다시 눌린다.
    expect(screen.queryByTitle('스노우싸인 계약서 발송')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계약서 올리기' })).toBeEnabled();
  });

  // 발송이 성공하면 리스는 markSentIfAwaiting 이 상태로 끝낸다 — 반납할 게 없다.
  it('발송이 성공하면 반납하지 않는다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({
      ok: true,
      iframeUrl: `${EMBED_ORIGIN}/e`,
      sessionId: 's1',
      claimedAt: '2026-08-01T12:00:00.000Z',
    });
    attachMock.mockResolvedValue({ ok: true });
    renderPg();
    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

    postCompletion();
    await waitFor(() => expect(attachMock).toHaveBeenCalled());
    expect(releaseMock).not.toHaveBeenCalled();
  });


  // 하트비트 — 리스를 5분으로 줄인 대신 열려 있는 동안 연장한다. 연장이 멎으면
  // (탭 닫기·크래시·이탈) 리스가 스스로 만료돼 유령이 남지 않는다.
  it('임베드가 열려 있는 동안 리스를 연장한다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      embedMock.mockResolvedValue({
        ok: true,
        iframeUrl: `${EMBED_ORIGIN}/e`,
        sessionId: 's1',
        claimedAt: '2026-08-01T12:00:00.000Z',
      });
      renderPg();
      await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
      await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));
      expect(renewMock).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(60_000);
      await waitFor(() =>
        expect(renewMock).toHaveBeenCalledWith({
          rfpCode: 'P-2607-0001',
          claimedAt: '2026-08-01T12:00:00.000Z',
        }),
      );

      // 연장이 돌려준 새 토큰을 다음 연장에 쓴다 — 옛 토큰으로는 서버가 거절한다.
      await vi.advanceTimersByTimeAsync(60_000);
      await waitFor(() =>
        expect(renewMock).toHaveBeenLastCalledWith({
          rfpCode: 'P-2607-0001',
          claimedAt: '2026-08-01T12:01:00.000Z',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('리스를 뺏기면 하트비트를 멈추고 패널을 닫는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      embedMock.mockResolvedValue({
        ok: true,
        iframeUrl: `${EMBED_ORIGIN}/e`,
        sessionId: 's1',
        claimedAt: '2026-08-01T12:00:00.000Z',
      });
      renewMock.mockResolvedValue({ ok: false, error: 'CONTRACT_BUSY' });
      renderPg();
      await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
      await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

      await vi.advanceTimersByTimeAsync(60_000);
      // 그대로 두면 뺏긴 리스로 발송해 계약이 두 건 살아난다.
      await waitFor(() =>
        expect(screen.queryByTitle('스노우싸인 계약서 발송')).not.toBeInTheDocument(),
      );
      const before = renewMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(180_000);
      expect(renewMock.mock.calls.length).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  // 봉인 경계 — 구매사에게는 업로드 경로가 아예 없다. buyerSigner 를 **줘도**
  // 안 그려야 진짜 가드다(뷰모델의 isPg 게이트를 지워도 통과하면 공허하다).
  it('구매사 화면에는 buyerSigner 를 줘도 업로드 버튼이 없다', () => {
    render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('awaiting_pg_template')}
        side="buyer"
        buyerSigner={{ name: '김구매', email: 'buyer@corp.com' }}
      />,
    );
    expect(screen.queryByRole('button', { name: '계약서 올리기' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('스노우싸인 계약서 발송')).not.toBeInTheDocument();
    expect(screen.queryByText('buyer@corp.com')).not.toBeInTheDocument();
  });
});
