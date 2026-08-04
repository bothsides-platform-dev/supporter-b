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
const recoverListMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, candidates: [], truncated: false }) as {
    ok: boolean;
    error?: string;
    candidates?: Array<Record<string, unknown>>;
    truncated?: boolean;
  }),
);
vi.mock('@/lib/server/actions/signing/listSigningRecoveryCandidatesAction', () => ({
  listSigningRecoveryCandidatesAction: recoverListMock,
}));
const sendFromTemplateMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true }) as { ok: boolean; error?: string }),
);
vi.mock('@/lib/server/actions/signing/sendSigningContractFromTemplateAction', () => ({
  sendSigningContractFromTemplateAction: sendFromTemplateMock,
}));
vi.mock('@/lib/observability/capture', () => ({ captureActionError: vi.fn() }));
const takeoverMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, iframeUrl: 'https://app.snowsign.example/e2', sessionId: 's2' }) as
    { ok: boolean; error?: string; iframeUrl?: string; sessionId?: string; claimedAt?: string }),
);
vi.mock('@/lib/server/actions/signing/takeoverSigningSendEmbedAction', () => ({
  takeoverSigningSendEmbedAction: takeoverMock,
}));
const holderMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, holder: { userId: 'u-mate', name: '박담당' }, isSelf: false }) as {
    ok: boolean;
    error?: string;
    holder?: { userId: string; name: string } | null;
    isSelf?: boolean;
  }),
);
vi.mock('@/lib/server/actions/signing/getSigningSendHolderAction', () => ({
  getSigningSendHolderAction: holderMock,
}));
// 라이브 알림 버스 — 테스트가 직접 알림을 밀어 넣는다.
const liveSubs = vi.hoisted(() => new Set<(n: unknown) => void>());
vi.mock('@/lib/hooks/useNotifications', () => ({
  subscribeToLiveNotifications: (fn: (n: unknown) => void) => {
    liveSubs.add(fn);
    return () => liveSubs.delete(fn);
  },
}));

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
  vi.resetAllMocks();
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
    return render(
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


  // ── 보낸 계약서 찾기 ──────────────────────────────────────────────────
  it('보낸 계약서 찾기를 누르면 후보를 스캔한다', async () => {
    const user = userEvent.setup();
    renderPg();
    await user.click(screen.getByRole('button', { name: '보낸 계약서 찾기' }));
    await waitFor(() =>
      expect(recoverListMock).toHaveBeenCalledWith({ rfpCode: 'P-2607-0001' }),
    );
    expect(await screen.findByText('보낸 계약서를 찾지 못했어요')).toBeInTheDocument();
  });

  // 후보를 고르면 사용자가 보던 계약 행이 함께 가야 한다 — 그 사이 resend 가 새
  // 라운드를 열었으면 서버가 막는다(출처는 서버가 이 값의 유무로 도출한다).
  it('고른 후보를 이 계약 행에 연결한다', async () => {
    const user = userEvent.setup();
    recoverListMock.mockResolvedValueOnce({
      ok: true,
      truncated: false,
      candidates: [
        { providerContractId: 'ct_found', title: '가맹 계약서', participantCount: 2 },
      ],
    });
    renderPg();
    await user.click(screen.getByRole('button', { name: '보낸 계약서 찾기' }));
    await screen.findByText('이 계약서를 연결할까요?');
    await user.click(screen.getByRole('button', { name: '이 계약서로 연결해요' }));

    await waitFor(() =>
      expect(attachMock).toHaveBeenCalledWith({
        rfpCode: 'P-2607-0001',
        providerContractId: 'ct_found',
        expectedContractId: 'c1',
      }),
    );
  });

  // 임베드를 작성 중이면 스캔이 리스를 두고 다툰다.
  it('임베드가 열려 있으면 찾기 버튼이 비활성이다', async () => {
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
    // 임베드가 이제 진짜 모달이라 base-ui 가 배경 전체를 aria-hidden/inert 로 가둔다
    // (SigningSendModal 도입 전엔 같은 섹션 안 인라인 패널이라 배경이 없었다) — 접근성
    // 트리에서 제외된 요소도 조회하려면 hidden 옵션이 필요하다.
    expect(screen.getByRole('button', { name: '보낸 계약서 찾기', hidden: true })).toBeDisabled();
  });

  // 닫기가 리스를 반납하지 않으면, 닫은 본인이 리스 만료까지 다시 못 연다.
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
    await user.click(await screen.findByRole('button', { name: '그만두기' }));
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

  // 닫기와 언마운트가 둘 다 반납하므로, 닫고 나서 화면을 떠나면 죽은 토큰으로
  // 서버를 한 번 더 때릴 수 있다(무해하지만 불필요하다).
  it('닫은 뒤 언마운트해도 반납은 한 번뿐이다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({
      ok: true,
      iframeUrl: `${EMBED_ORIGIN}/e`,
      sessionId: 's1',
      claimedAt: '2026-08-01T12:00:00.000Z',
    });
    const view = renderPg();
    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

    await user.click(screen.getByRole('button', { name: '닫기' }));
    await user.click(await screen.findByRole('button', { name: '그만두기' }));
    await waitFor(() => expect(releaseMock).toHaveBeenCalledTimes(1));
    view.unmount();
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  // 닫기 버튼만 반납하면, 딜룸 탭 전환·모달 닫기로 언마운트될 때 같은 잠김이 남는다.
  // (닫기 회귀와 원인이 같다 — 리스만 남고 하트비트가 멎어 최대 5분 본인이 잠긴다.)
  it('닫기를 누르지 않고 언마운트돼도 리스를 반납한다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({
      ok: true,
      iframeUrl: `${EMBED_ORIGIN}/e`,
      sessionId: 's1',
      claimedAt: '2026-08-01T12:00:00.000Z',
    });
    const view = renderPg();
    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

    view.unmount();
    await waitFor(() =>
      expect(releaseMock).toHaveBeenCalledWith({
        rfpCode: 'P-2607-0001',
        claimedAt: '2026-08-01T12:00:00.000Z',
      }),
    );
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
    const view = renderPg();
    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

    postCompletion();
    await waitFor(() => expect(attachMock).toHaveBeenCalled());
    expect(releaseMock).not.toHaveBeenCalled();

    // 언마운트까지 가도 반납이 없어야 한다 — 발송 성공 뒤 claimRef 가 비는 것이
    // 이 테스트가 실제로 주장하는 바다(딜룸 탭 전환·모달 닫기가 이 경로다).
    view.unmount();
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

  // 뺏김(ok:false)과 일시적 장애(reject)는 다르게 다뤄야 한다 — 네트워크가 한 번
  // 끊겼다고 패널을 닫으면 작성 중이던 계약서가 날아간다. 다음 주기가 만회한다.
  it('하트비트가 네트워크 오류로 실패해도 패널을 닫지 않는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      embedMock.mockResolvedValue({
        ok: true,
        iframeUrl: `${EMBED_ORIGIN}/e`,
        sessionId: 's1',
        claimedAt: '2026-08-01T12:00:00.000Z',
      });
      renewMock.mockRejectedValueOnce(new Error('network down'));
      renderPg();
      await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
      await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

      await vi.advanceTimersByTimeAsync(60_000);
      await waitFor(() => expect(renewMock).toHaveBeenCalledTimes(1));
      // 패널이 그대로 열려 있고, 다음 주기가 계속 돈다.
      expect(screen.getByTitle('스노우싸인 계약서 발송')).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(60_000);
      await waitFor(() => expect(renewMock).toHaveBeenCalledTimes(2));
      expect(screen.getByTitle('스노우싸인 계약서 발송')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // 하트비트가 겹치면 안 된다. 연장 하나가 느리면(서버 액션 큐 대기·SnowSign 재시도)
  // 다음 틱이 **같은 옛 토큰**으로 또 나가고, 서버 CAS 는 두 번째를 거절한다 —
  // 화면은 그걸 '리스를 뺏겼다'로 읽고 패널을 닫아 작업 중인 계약서를 날린다.
  it('직전 연장이 끝나기 전에는 다음 하트비트를 보내지 않는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      embedMock.mockResolvedValue({
        ok: true,
        iframeUrl: `${EMBED_ORIGIN}/e`,
        sessionId: 's1',
        claimedAt: '2026-08-01T12:00:00.000Z',
      });
      // 첫 연장을 끝나지 않게 붙잡는다.
      let release!: (v: { ok: true; claimedAt: string }) => void;
      renewMock.mockReturnValueOnce(new Promise((res) => { release = res; }));
      renderPg();
      await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
      await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

      await vi.advanceTimersByTimeAsync(60_000);
      await waitFor(() => expect(renewMock).toHaveBeenCalledTimes(1));

      // 인플라이트인 동안 두 주기가 더 지나도 추가 요청이 나가면 안 된다.
      await vi.advanceTimersByTimeAsync(120_000);
      expect(renewMock).toHaveBeenCalledTimes(1);

      release({ ok: true, claimedAt: '2026-08-01T12:03:00.000Z' });
      await vi.advanceTimersByTimeAsync(60_000);
      await waitFor(() => expect(renewMock).toHaveBeenCalledTimes(2));
      // 갇혀 있던 응답이 준 새 토큰을 쓴다.
      expect(renewMock).toHaveBeenLastCalledWith({
        rfpCode: 'P-2607-0001',
        claimedAt: '2026-08-01T12:03:00.000Z',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  // 백그라운드 탭은 타이머가 조여진다(크롬 ~1회/분, iOS 는 아예 정지). PG 가 계약서
  // PDF 를 받으러 메일함에 다녀오는 건 아주 평범한 동작인데, 그 사이 5분 리스가
  // 만료되면 돌아온 순간 패널이 닫히고 작업이 사라진다. 복귀 즉시 연장해야 한다.
  it('탭으로 돌아오면 즉시 리스를 연장한다', async () => {
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
    expect(renewMock).not.toHaveBeenCalled();

    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() =>
      expect(renewMock).toHaveBeenCalledWith({
        rfpCode: 'P-2607-0001',
        claimedAt: '2026-08-01T12:00:00.000Z',
      }),
    );
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
      // 남이 쥐고 있다는 신호 — 이건 한 번으로 닫아야 한다(그대로 두면 뺏긴 리스로
      // 발송해 계약이 두 건 살아난다). 단순 경합인 CONTRACT_BUSY 와는 다르게 다룬다.
      renewMock.mockResolvedValue({ ok: false, error: 'SEND_TAKEN_OVER' });
      renderPg();
      await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
      await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

      await vi.advanceTimersByTimeAsync(60_000);
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

describe('SigningTab — 연결된 템플릿으로 보내기 (PG)', () => {
  // 법적 문서가 원클릭으로 나가면 안 된다 — 버튼은 확인창을 열고, 확인창이 어떤
  // 템플릿이 누구에게 가는지 보여준 뒤에야 실제 발송이 일어난다(취소 액션과 같은 패턴).
  it('버튼 클릭은 확인창만 열고, 확인해야 발송·refresh 가 일어난다', async () => {
    const user = userEvent.setup();
    sendFromTemplateMock.mockResolvedValue({ ok: true });
    render(
      <SigningTab
        rfpCode="P-2608-0001"
        signing={view('awaiting_pg_template')}
        side="pg"
        linkedSigningTemplateName="표준 계약서"
        buyerSigner={{ name: '김구매', email: 'buyer@corp.com' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: '연결된 템플릿으로 보내기' }));

    // 클릭만으로는 아무것도 나가지 않는다 — 확인창이 템플릿 이름과 수신자를 보여준다.
    // (확인창 쿼리는 ContractTemplateList 테스트와 같은 텍스트 관례를 따른다.)
    expect(sendFromTemplateMock).not.toHaveBeenCalled();
    expect(await screen.findByText('연결된 템플릿으로 보낼까요?')).toBeInTheDocument();
    expect(screen.getByText(/김구매\(buyer@corp\.com\)/)).toBeInTheDocument();
    // PG 측 서명자는 서버가 "버튼 누른 사람"으로 지정한다 — 발송 전에 그 사실을
    // 눈으로 확인할 수 있어야 한다(수신자 프리필이 없는 경로라 이 확인창이 유일한 검문소).
    expect(screen.getByText(/PG사 서명 요청은 지금 로그인한 내 이메일로 와요/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() =>
      expect(sendFromTemplateMock).toHaveBeenCalledWith({ rfpCode: 'P-2608-0001' }),
    );
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
  });

  it('확인창에서 취소하면 발송되지 않는다', async () => {
    const user = userEvent.setup();
    sendFromTemplateMock.mockResolvedValue({ ok: true });
    render(
      <SigningTab
        rfpCode="P-2608-0001"
        signing={view('awaiting_pg_template')}
        side="pg"
        linkedSigningTemplateName="표준 계약서"
      />,
    );

    await user.click(screen.getByRole('button', { name: '연결된 템플릿으로 보내기' }));
    await screen.findByText('연결된 템플릿으로 보낼까요?');
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(sendFromTemplateMock).not.toHaveBeenCalled();
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it('awaiting_pg_template + linked template: failure shows the failMsg toast without refreshing', async () => {
    const user = userEvent.setup();
    // 알려지지 않은 에러 코드 — signingErrorMessage 가 fallback(failMsg)으로 떨어진다.
    sendFromTemplateMock.mockResolvedValue({ ok: false, error: 'CONTRACT_TEMPLATE_LINK_LOST' });
    render(
      <SigningTab
        rfpCode="P-2608-0001"
        signing={view('awaiting_pg_template')}
        side="pg"
        linkedSigningTemplateName="표준 계약서"
      />,
    );

    await user.click(screen.getByRole('button', { name: '연결된 템플릿으로 보내기' }));
    await screen.findByText('연결된 템플릿으로 보낼까요?');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    // toast 는 vi.fn() 목이라 DOM 에 렌더되지 않는다 — 호출 인자로 failMsg 를 확인한다
    // (다른 실패 케이스들과 같은 관례, 예: '다시 발송하지 못했어요' 케이스).
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('계약서를 보내지 못했어요', { type: 'error' }),
    );
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  // 동료 탭이 하트비트로 리스를 영영 쥐고 있으면 임베드·복구 진입점은 이어받기를
  // 제안하는데, 지름길 발송만 평면 토스트로 끝나면 이 경로가 유일한 막다른 길이 된다.
  it('SEND_HELD_BY_TEAMMATE 면 토스트 대신 이어받기 확인창을 연다', async () => {
    const user = userEvent.setup();
    sendFromTemplateMock.mockResolvedValue({ ok: false, error: 'SEND_HELD_BY_TEAMMATE' });
    holderMock.mockResolvedValue({
      ok: true,
      holder: { userId: 'u-mate', name: '박담당' },
      isSelf: false,
    });
    render(
      <SigningTab
        rfpCode="P-2608-0001"
        signing={view('awaiting_pg_template')}
        side="pg"
        linkedSigningTemplateName="표준 계약서"
      />,
    );

    await user.click(screen.getByRole('button', { name: '연결된 템플릿으로 보내기' }));
    await screen.findByText('연결된 템플릿으로 보낼까요?');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    expect(await screen.findByText('박담당 님의 작성을 이어받을까요?')).toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  // 이 흐름은 확인창 하나가 닫히면서 다른 하나가 열린다. 닫히는 쪽이 자기 트리거로
  // 포커스를 되돌리면, 포커스가 **배경**(그 사이 aria-hidden 이 된 영역)의 발송 버튼에
  // 앉는다 — 스크린리더는 아무것도 읽지 못하는데 사용자는 '동료 화면을 닫는' 비가역
  // 확인을 요구받고 있고, 거기서 Enter 를 치면 발송 확인창이 다시 열려 확인창이 둘이 된다.
  // 마우스 사용자는 백드롭에 막혀 못 겪는다 — 키보드·스크린리더 전용 실패라 클릭만 하는
  // 기존 테스트로는 절대 잡히지 않는다.
  it('이어받기 확인창이 열릴 때 포커스가 배경 발송 버튼으로 새지 않는다', async () => {
    const user = userEvent.setup();
    sendFromTemplateMock.mockResolvedValue({ ok: false, error: 'SEND_HELD_BY_TEAMMATE' });
    holderMock.mockResolvedValue({
      ok: true,
      holder: { userId: 'u-mate', name: '박담당' },
      isSelf: false,
    });
    render(
      <SigningTab
        rfpCode="P-2608-0001"
        signing={view('awaiting_pg_template')}
        side="pg"
        linkedSigningTemplateName="표준 계약서"
      />,
    );

    const trigger = screen.getByRole('button', { name: '연결된 템플릿으로 보내기' });
    await user.click(trigger);
    await screen.findByText('연결된 템플릿으로 보낼까요?');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await screen.findByText('박담당 님의 작성을 이어받을까요?');

    // ① 포커스가 배경으로 새지 않았다.
    expect(document.activeElement).not.toBe(trigger);
    // ② 포커스가 살아 있는 확인창 안에 있다 — 화면 밖으로 떨어지지도 않았다.
    const alive = screen.getByText('박담당 님의 작성을 이어받을까요?').closest('[role="dialog"]');
    expect(alive).not.toBeNull();
    expect(alive!.contains(document.activeElement)).toBe(true);
    // ③ 발송 확인창은 하나뿐이고 이미 닫혔다 — 확인창 둘이 겹쳐 있지 않다.
    expect(screen.queryByText('연결된 템플릿으로 보낼까요?')).not.toBeInTheDocument();
  });

  // 강제 취득은 *경합*만 무시하고 상태 조건(`awaiting_pg_template`)은 그대로 본다.
  // 그래서 확인 다이얼로그를 읽는 동안 동료가 발송을 끝내면 이어받기도 SEND_HELD 로
  // 막힌다 — 그때 '다른 담당자가 작성하고 있어요'라고 말하면 **이미 나간 계약**을 두고
  // 기다리게 되고, 화면은 낡은 발송 버튼을 계속 내민다.
  it('이어받았는데도 막히면(그 사이 발송 완료) 화면을 새로 읽어 온다', async () => {
    const user = userEvent.setup();
    sendFromTemplateMock.mockResolvedValue({ ok: false, error: 'SEND_HELD_BY_TEAMMATE' });
    holderMock.mockResolvedValue({
      ok: true,
      holder: { userId: 'u-mate', name: '박담당' },
      isSelf: false,
    });
    render(
      <SigningTab
        rfpCode="P-2608-0001"
        signing={view('awaiting_pg_template')}
        side="pg"
        linkedSigningTemplateName="표준 계약서"
      />,
    );

    await user.click(screen.getByRole('button', { name: '연결된 템플릿으로 보내기' }));
    await screen.findByText('연결된 템플릿으로 보낼까요?');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await screen.findByText('박담당 님의 작성을 이어받을까요?');
    expect(nav.refresh).not.toHaveBeenCalled(); // 여기까지는 새로고침 없음

    await user.click(screen.getByRole('button', { name: '이어받기' }));

    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
  });

  it('이어받기를 확인하면 takeOver 로 다시 발송한다', async () => {
    const user = userEvent.setup();
    sendFromTemplateMock
      .mockResolvedValueOnce({ ok: false, error: 'SEND_HELD_BY_TEAMMATE' })
      .mockResolvedValueOnce({ ok: true });
    holderMock.mockResolvedValue({
      ok: true,
      holder: { userId: 'u-mate', name: '박담당' },
      isSelf: false,
    });
    render(
      <SigningTab
        rfpCode="P-2608-0001"
        signing={view('awaiting_pg_template')}
        side="pg"
        linkedSigningTemplateName="표준 계약서"
      />,
    );

    await user.click(screen.getByRole('button', { name: '연결된 템플릿으로 보내기' }));
    await screen.findByText('연결된 템플릿으로 보낼까요?');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await screen.findByText('박담당 님의 작성을 이어받을까요?');

    await user.click(screen.getByRole('button', { name: '이어받기' }));

    await waitFor(() =>
      expect(sendFromTemplateMock).toHaveBeenCalledWith({
        rfpCode: 'P-2608-0001',
        takeOver: true,
      }),
    );
    // 임베드 이어받기 액션이 아니라 템플릿 발송 액션으로 가야 한다.
    expect(takeoverMock).not.toHaveBeenCalled();
    await waitFor(() => expect(toast).toHaveBeenCalledWith('계약서를 보냈어요', { type: 'success' }));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
  });

  // 쥔 게 자기 자신이면 이어받을 것이 없다 — 임베드 경로와 같은 안내 토스트.
  it('자기 리스면 이어받기 대신 다른 탭 안내 토스트를 띄운다', async () => {
    const user = userEvent.setup();
    sendFromTemplateMock.mockResolvedValue({ ok: false, error: 'SEND_HELD_BY_TEAMMATE' });
    holderMock.mockResolvedValue({ ok: true, holder: null, isSelf: true });
    render(
      <SigningTab
        rfpCode="P-2608-0001"
        signing={view('awaiting_pg_template')}
        side="pg"
        linkedSigningTemplateName="표준 계약서"
      />,
    );

    await user.click(screen.getByRole('button', { name: '연결된 템플릿으로 보내기' }));
    await screen.findByText('연결된 템플릿으로 보낼까요?');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        '다른 탭에서 계약서를 작성하고 있어요. 그 탭에서 이어서 하거나 닫아 주세요.',
        { type: 'info' },
      ),
    );
    expect(screen.queryByText(/작성을 이어받을까요/)).not.toBeInTheDocument();
  });

  // 임베드(계약서 올리기)를 이미 열어 둔 채 지름길 버튼을 또 누르면 서버 CAS 가
  // 막긴 하지만("다른 담당자가 작성 중" 메시지가 본인 탭을 가리키는 나쁜 UX) —
  // upload/recover 와 같은 원칙으로 임베드가 열려 있는 동안은 아예 눌리지 않아야 한다.
  it('임베드가 열려 있으면 연결된 템플릿으로 보내기 버튼이 비활성이다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({
      ok: true,
      iframeUrl: 'https://app.snowsign.example/e',
      sessionId: 's1',
      claimedAt: '2026-08-01T12:00:00.000Z',
    });
    render(
      <SigningTab
        rfpCode="P-2608-0001"
        signing={view('awaiting_pg_template')}
        side="pg"
        linkedSigningTemplateName="표준 계약서"
      />,
    );

    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

    // 임베드가 진짜 모달이라 base-ui 가 배경을 aria-hidden/inert 로 가둔다 —
    // 기본 getByRole 은 이 버튼을 못 본다('보낸 계약서 찾기' 케이스와 같은 관례).
    expect(
      screen.getByRole('button', { name: '연결된 템플릿으로 보내기', hidden: true }),
    ).toBeDisabled();
  });
});

describe('SigningTab — 재발송 degraded 토스트', () => {
  // degraded 는 "직전 계약서가 사라져 아무것도 발송되지 않았다"는 뜻 — 다음 행동이
  // 보는 사람·연결된 템플릿 유무에 따라 다르다. PG 본인에게 3인칭('PG사가')으로
  // 말하거나, 템플릿 지름길이 있는데 '다시 올려야' 한다고 말하면 안 된다.
  it('PG + 연결된 템플릿: 템플릿 지름길을 함께 안내한다', async () => {
    const user = userEvent.setup();
    vi.mocked(resendSigningAction).mockResolvedValue({ ok: true, degraded: true });
    render(
      <SigningTab
        rfpCode="P-2608-0001"
        signing={view('declined')}
        side="pg"
        linkedSigningTemplateName="표준 계약서"
      />,
    );

    await user.click(screen.getByRole('button', { name: '다시 발송' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('연결된 템플릿으로 바로 보내거나, 계약서를 다시 올려 주세요', {
        type: 'info',
      }),
    );
  });

  it('PG + 템플릿 없음: 본인에게 직접 말한다', async () => {
    const user = userEvent.setup();
    vi.mocked(resendSigningAction).mockResolvedValue({ ok: true, degraded: true });
    render(<SigningTab rfpCode="P-2608-0001" signing={view('declined')} side="pg" />);

    await user.click(screen.getByRole('button', { name: '다시 발송' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('계약서를 다시 올려 주세요', { type: 'info' }),
    );
  });

  it('구매사: 기존 3인칭 안내를 유지한다', async () => {
    const user = userEvent.setup();
    vi.mocked(resendSigningAction).mockResolvedValue({ ok: true, degraded: true });
    render(<SigningTab rfpCode="P-2608-0001" signing={view('declined')} side="buyer" />);

    await user.click(screen.getByRole('button', { name: '다시 발송' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('PG사가 계약서를 다시 올려야 해요', { type: 'info' }),
    );
  });
});

describe('SigningTab — 발송 리스 강제 이어받기 (PG)', () => {
  const EMBED_ORIGIN = 'https://app.snowsign.example';

  function renderPg() {
    return render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('awaiting_pg_template')}
        side="pg"
        buyerSigner={{ name: '김구매', email: 'buyer@corp.com' }}
      />,
    );
  }

  function pushLive(n: Record<string, unknown>) {
    for (const fn of liveSubs) fn(n);
  }

  const takenOver = (code = 'P-2607-0001') => ({
    id: 'n-1',
    type: 'signing.send_taken_over',
    title: '이어받았어요',
    linkUrl: `/inbox/${code}`,
  });

  // 막혔을 때 토스트만 띄우면 사용자가 할 수 있는 게 없다 — 그게 이 기능 이전의 상태다.
  it('동료가 쥐고 있으면 토스트가 아니라 확인 다이얼로그를 열고 이름을 보여준다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({ ok: false, error: 'SEND_HELD_BY_TEAMMATE' });
    holderMock.mockResolvedValue({ ok: true, holder: { userId: 'u-mate', name: '박담당' }, isSelf: false });
    renderPg();

    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    expect(await screen.findByText(/박담당 님의 작성을 이어받을까요\?/)).toBeInTheDocument();
    expect(screen.queryByTitle('스노우싸인 계약서 발송')).not.toBeInTheDocument();
  });

  it('취소하면 이어받기 액션이 호출되지 않는다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({ ok: false, error: 'SEND_HELD_BY_TEAMMATE' });
    takeoverMock.mockClear();
    renderPg();

    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await screen.findByText(/이어받을까요\?/);
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(takeoverMock).not.toHaveBeenCalled();
  });

  // 이름을 못 얻는다고 이어받기를 막을 이유는 없다. 다만 raw 코드는 절대 못 나온다.
  it('이름 조회가 실패해도 다른 담당자 로 열리고 raw 코드가 안 나온다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({ ok: false, error: 'SEND_HELD_BY_TEAMMATE' });
    holderMock.mockResolvedValue({ ok: false, error: 'CONTRACT_NOT_FOUND' });
    renderPg();

    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    expect(await screen.findByText(/다른 담당자 님의 작성을 이어받을까요\?/)).toBeInTheDocument();
    expect(screen.queryByText(/CONTRACT_NOT_FOUND/)).not.toBeInTheDocument();
  });

  it('확인하면 이어받기 액션으로 임베드를 연다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({ ok: false, error: 'SEND_HELD_BY_TEAMMATE' });
    holderMock.mockResolvedValue({ ok: true, holder: { userId: 'u-mate', name: '박담당' }, isSelf: false });
    takeoverMock.mockResolvedValue({ ok: true, iframeUrl: `${EMBED_ORIGIN}/e2`, sessionId: 's2' });
    renderPg();

    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await screen.findByText(/이어받을까요\?/);
    await user.click(screen.getByRole('button', { name: '이어받기' }));

    await waitFor(() =>
      expect(screen.getByTitle('스노우싸인 계약서 발송')).toHaveAttribute(
        'src',
        `${EMBED_ORIGIN}/e2`,
      ),
    );
    expect(takeoverMock).toHaveBeenCalledWith({ rfpCode: 'P-2607-0001' });
  });

  // 이 기능의 요점 — 시간을 진전시키지 않고(하트비트를 기다리지 않고) 닫혀야 한다.
  it('이어받기 알림이 도착하면 하트비트를 기다리지 않고 패널이 닫힌다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({ ok: true, iframeUrl: `${EMBED_ORIGIN}/e`, sessionId: 's1' });
    renderPg();
    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

    pushLive(takenOver());
    await waitFor(() =>
      expect(screen.queryByTitle('스노우싸인 계약서 발송')).not.toBeInTheDocument(),
    );
  });

  it('다른 딜의 이어받기 알림은 패널을 닫지 않는다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({ ok: true, iframeUrl: `${EMBED_ORIGIN}/e`, sessionId: 's1' });
    renderPg();
    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

    pushLive(takenOver('P-2607-0999'));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTitle('스노우싸인 계약서 발송')).toBeInTheDocument();
  });

  // 뺏긴 리스로는 반납도 하면 안 된다 — 지금 쥔 사람의 리스를 푸는 꼴이다.
  it('알림으로 닫힐 때 리스를 반납하지 않는다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({
      ok: true,
      iframeUrl: `${EMBED_ORIGIN}/e`,
      sessionId: 's1',
      claimedAt: '2026-08-01T12:00:00.000Z',
    });
    releaseMock.mockClear();
    const { unmount } = renderPg();
    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

    pushLive(takenOver());
    await waitFor(() =>
      expect(screen.queryByTitle('스노우싸인 계약서 발송')).not.toBeInTheDocument(),
    );
    // 언마운트까지 가야 진짜 확인이 된다 — 반납은 언마운트 정리에서도 나간다.
    // (닫힘 자체로는 아무 요청도 없으므로 단언이 공짜로 통과한다.)
    unmount();
    expect(releaseMock).not.toHaveBeenCalled();
  });
});

describe('SigningTab — 즉시 차단이 실제로 닿는가', () => {
  const EMBED_ORIGIN = 'https://app.snowsign.example';

  function renderPg() {
    return render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('awaiting_pg_template')}
        side="pg"
        buyerSigner={{ name: '김구매', email: 'buyer@corp.com' }}
      />,
    );
  }
  function pushLive(n: Record<string, unknown>) {
    for (const fn of liveSubs) fn(n);
  }
  const takenOver = (code = 'P-2607-0001') => ({
    id: 'n-x',
    type: 'signing.send_taken_over',
    title: '이어받았어요',
    linkUrl: `/inbox/${code}`,
  });

  // A-2. 구독이 embedOpen 에 달려 있으면, 세션 발급 왕복(스노우싸인 재시도까지 하면
  // 수십 초) 동안 도착한 알림은 청취자 0명에게 발화되고 재생은 없다. 그 사이 리스는
  // 이미 남에게 갔는데 우리 패널은 그걸 모른 채 열린다.
  it('세션 발급을 기다리는 동안 뺏기면 패널을 아예 열지 않는다', async () => {
    const user = userEvent.setup();
    let resolveIssue!: (v: { ok: true; iframeUrl: string; sessionId: string }) => void;
    embedMock.mockImplementationOnce(
      () => new Promise((r) => (resolveIssue = r as typeof resolveIssue)),
    );
    renderPg();
    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));

    // 발급이 아직 안 끝난 시점에 이어받기 알림이 도착한다.
    pushLive(takenOver());
    resolveIssue({ ok: true, iframeUrl: `${EMBED_ORIGIN}/e`, sessionId: 's1' });

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(screen.queryByTitle('스노우싸인 계약서 발송')).not.toBeInTheDocument();
  });

  // A-6. 리스를 쥔 게 자기 자신이면 이어받을 것이 없다. 이어받게 두면 같은 사람의
  // iframe 이 둘 살아나고(알림은 자기에게 안 가므로 옛 탭이 안 닫힌다), 다이얼로그는
  // "〈본인 이름〉 님의 작성을 이어받을까요?" 라는 말이 안 되는 문장을 띄운다.
  it('자기가 쥐고 있으면 이어받기를 제안하지 않는다', async () => {
    const user = userEvent.setup();
    embedMock.mockResolvedValue({ ok: false, error: 'SEND_HELD_BY_TEAMMATE' });
    holderMock.mockResolvedValue({
      ok: true,
      holder: { userId: 'me', name: '나' },
      isSelf: true,
    });
    takeoverMock.mockClear();
    renderPg();

    await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: '이어받기' })).not.toBeInTheDocument();
    expect(takeoverMock).not.toHaveBeenCalled();
  });

  // A-7. 서버는 '남이 쥐고 있다'(SEND_TAKEN_OVER)와 '그냥 경합'(CONTRACT_BUSY)을
  // 애써 구분한다. 화면이 !ok 면 무조건 닫으면, 연장 응답을 한 번 놓쳐 토큰이
  // 어긋난 것만으로 작성 중이던 계약서가 날아간다 — 리스는 멀쩡한데.
  it('CONTRACT_BUSY 한 번으로는 패널을 닫지 않는다', async () => {
    const user = userEvent.setup();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
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

      await vi.advanceTimersByTimeAsync(61_000);
      expect(screen.getByTitle('스노우싸인 계약서 발송')).toBeInTheDocument();

      // 두 번 연속이면 진짜 못 살리는 상태이므로 닫는다.
      await vi.advanceTimersByTimeAsync(61_000);
      await waitFor(() =>
        expect(screen.queryByTitle('스노우싸인 계약서 발송')).not.toBeInTheDocument(),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  // 유예의 근거는 "연장 응답을 한 번 놓쳐 **자기** 토큰이 어긋났다"(CONTRACT_BUSY)
  // 하나뿐이다. 종결 코드는 그게 아니다 — 계약이 이미 awaiting 을 벗어났다는 뜻이라
  // 60초를 더 줘도 되살아나지 않는다. 그동안 사용자는 **못 보내는 계약 위에서** 계속
  // 작성하고, 완주하면 우리가 id 를 못 받는 두 번째 계약이 살아난다(취소 핸들 없는 고아).
  it.each(['ALREADY_SENT', 'CONTRACT_NOT_FOUND', 'FORBIDDEN'])(
    '종결 코드 %s 는 유예 없이 즉시 닫는다',
    async (code) => {
      const user = userEvent.setup();
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        embedMock.mockResolvedValue({
          ok: true,
          iframeUrl: `${EMBED_ORIGIN}/e`,
          sessionId: 's1',
          claimedAt: '2026-08-01T12:00:00.000Z',
        });
        renewMock.mockResolvedValue({ ok: false, error: code });
        renderPg();
        await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
        await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

        await vi.advanceTimersByTimeAsync(61_000);
        await waitFor(() =>
          expect(screen.queryByTitle('스노우싸인 계약서 발송')).not.toBeInTheDocument(),
        );
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('SEND_TAKEN_OVER 는 한 번으로 즉시 닫는다 — 남이 쥔 리스로 발송하면 안 된다', async () => {
    const user = userEvent.setup();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      embedMock.mockResolvedValue({
        ok: true,
        iframeUrl: `${EMBED_ORIGIN}/e`,
        sessionId: 's1',
        claimedAt: '2026-08-01T12:00:00.000Z',
      });
      renewMock.mockResolvedValue({ ok: false, error: 'SEND_TAKEN_OVER' });
      renderPg();
      await user.click(screen.getByRole('button', { name: '계약서 올리기' }));
      await waitFor(() => screen.getByTitle('스노우싸인 계약서 발송'));

      await vi.advanceTimersByTimeAsync(61_000);
      await waitFor(() =>
        expect(screen.queryByTitle('스노우싸인 계약서 발송')).not.toBeInTheDocument(),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
