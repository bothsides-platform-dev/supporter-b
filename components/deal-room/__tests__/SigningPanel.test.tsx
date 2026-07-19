import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/server/actions/signing/remindSigningAction', () => ({
  remindSigningAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/server/actions/signing/cancelSigningAction', () => ({
  cancelSigningAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/server/actions/signing/resendSigningAction', () => ({
  resendSigningAction: vi.fn(async () => ({ ok: true })),
}));

import { SigningPanel } from '../SigningPanel';
import { remindSigningAction } from '@/lib/server/actions/signing/remindSigningAction';
import { resendSigningAction } from '@/lib/server/actions/signing/resendSigningAction';
import type {
  SigningContractStatus,
  SigningParticipant,
  SigningParticipantRole,
  SigningParticipantStatus,
  SigningView,
} from '@/lib/types/signing';

afterEach(cleanup);

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
      createdAt: '2026-04-02T00:00:00Z',
      ...(status === 'completed' ? { completedAt: '2026-04-02T06:40:00Z' } : {}),
    },
    participants,
  };
}

describe('SigningPanel', () => {
  it('renders nothing when there is no signing contract', () => {
    const { container } = render(<SigningPanel rfpCode="P-1" signing={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('awaiting_pg_template → PG 준비 중 대기 안내', () => {
    render(<SigningPanel rfpCode="P-1" signing={view('awaiting_pg_template')} />);
    expect(screen.getByText('PG사가 계약서 준비 중')).toBeInTheDocument();
    expect(screen.getByText(/계약서를 준비하고 있어요/)).toBeInTheDocument();
  });

  it('in_progress → 참여자 타임라인 + 리마인더 발신', async () => {
    render(
      <SigningPanel
        rfpCode="P-1"
        signing={view('in_progress', [
          part('buyer', 'signed', { signedAt: '2026-04-02T05:30:00Z' }),
          part('pg', 'pending'),
        ])}
      />,
    );
    expect(screen.getByText(/김구매/)).toBeInTheDocument();
    expect(screen.getByText(/이대행/)).toBeInTheDocument();
    expect(screen.getByText('서명 대기')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '리마인더 보내기' }));
    expect(remindSigningAction).toHaveBeenCalledWith({ contractId: 'c1' });
  });

  it('completed → 완료 안내 + 다운로드 버튼', () => {
    render(<SigningPanel rfpCode="P-1" signing={view('completed')} />);
    expect(screen.getByText('모든 서명이 완료됐어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계약서 PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '감사추적인증서' })).toBeInTheDocument();
  });

  it('declined → 거절 안내 + 다시 발송', () => {
    render(<SigningPanel rfpCode="P-1" signing={view('declined')} />);
    expect(screen.getByText('서명이 거절됐어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 발송' })).toBeInTheDocument();
  });

  it('send_failed → 시작 실패 안내 + 다시 시작(resend) (U3)', async () => {
    render(<SigningPanel rfpCode="P-1" signing={view('send_failed')} />);
    expect(screen.getByText('전자서명을 시작하지 못했어요')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '다시 시작' }));
    expect(resendSigningAction).toHaveBeenCalledWith({ rfpCode: 'P-1' });
  });
});
