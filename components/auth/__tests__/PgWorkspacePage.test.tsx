/**
 * PG 가입 2단계 (워크스페이스).
 *
 *  - 초대 경로 skip 가드
 *  - 사업자 인증: 구매사처럼 국세청(NTS) 자동 조회로 인증한 뒤에만 진행 가능
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

// writeSignupDraft / lookupBizNoAction 을 hoisted 스파이로 노출 — 호출 단언용.
const { mockWriteSignupDraft, mockLookupBizNo } = vi.hoisted(() => ({
  mockWriteSignupDraft: vi.fn(),
  mockLookupBizNo: vi.fn(),
}));

let mockDraftData: Record<string, unknown> = {};
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => mockDraftData,
  writeSignupDraft: mockWriteSignupDraft,
}));

vi.mock('@/lib/server/actions/rfp', () => ({
  lookupBizNoAction: mockLookupBizNo,
}));

import PgWorkspacePage from '@/app/(public)/signup/pg/workspace/page';

describe('PgWorkspacePage — 초대 경로 skip 가드', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
  });

  it('wsInviteToken이 있으면 /signup/pg/profile로 redirect한다', () => {
    mockDraftData = {
      email: 'sales@toss.im',
      password: 'Password123!',
      wsInviteToken: 'invite-token-abc',
    };

    render(<PgWorkspacePage />);

    expect(mockReplace).toHaveBeenCalledWith('/signup/pg/profile');
    expect(mockReplace).not.toHaveBeenCalledWith('/signup/pg');
  });

  it('wsInviteToken 없고 email+password 없으면 /signup/pg로 redirect한다', () => {
    mockDraftData = {}; // 빈 draft

    render(<PgWorkspacePage />);

    expect(mockReplace).toHaveBeenCalledWith('/signup/pg');
  });
});

describe('PgWorkspacePage — 사업자 인증 (NTS 자동 조회)', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockWriteSignupDraft.mockReset();
    mockLookupBizNo.mockReset();
    mockLookupBizNo.mockResolvedValue({
      ok: true,
      valid: true,
      taxType: 'general',
      status: 'active',
    });
    mockDraftData = { email: 'sales@toss.im', password: 'Password123!' };
  });

  it('국세청 사업자 조회 UI(조회 버튼 + 사업자 등록번호 입력)를 보여준다', () => {
    render(<PgWorkspacePage />);

    expect(screen.getByLabelText('사업자 등록번호')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '조회' })).toBeInTheDocument();
  });

  it('NTS 조회로 확인하기 전에는 제출 버튼이 비활성이다', async () => {
    const user = userEvent.setup();
    render(<PgWorkspacePage />);

    await user.type(
      screen.getByPlaceholderText('예: 서포터 B 페이 영업팀'),
      '토스페이먼츠 영업팀',
    );

    // 워크스페이스 이름은 채웠지만 사업자 인증 전이므로 제출 불가.
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });

  it('사업자 조회 성공 후 제출하면 digits-only bizNo를 draft에 저장하고 profile로 이동한다', async () => {
    const user = userEvent.setup();
    render(<PgWorkspacePage />);

    await user.type(
      screen.getByPlaceholderText('예: 서포터 B 페이 영업팀'),
      '토스페이먼츠 영업팀',
    );
    await user.type(screen.getByLabelText('사업자 등록번호'), '1248100998');
    await user.click(screen.getByRole('button', { name: '조회' }));

    // 국세청 확인 패널 노출.
    await waitFor(() =>
      expect(screen.getByText('NTS — 국세청 자동 조회')).toBeInTheDocument(),
    );
    expect(mockLookupBizNo).toHaveBeenCalledWith('124-81-00998');

    const submit = screen.getByRole('button', { name: '다음' });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(mockWriteSignupDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        wsName: '토스페이먼츠 영업팀',
        bizNo: '1248100998', // 하이픈 제거된 10자리
      }),
    );
    expect(mockPush).toHaveBeenCalledWith('/signup/pg/profile');
  });

  it('사업자 조회 실패 시 제출 버튼이 비활성으로 유지된다', async () => {
    mockLookupBizNo.mockResolvedValue({ ok: true, valid: false });
    const user = userEvent.setup();
    render(<PgWorkspacePage />);

    await user.type(
      screen.getByPlaceholderText('예: 서포터 B 페이 영업팀'),
      '토스페이먼츠 영업팀',
    );
    await user.type(screen.getByLabelText('사업자 등록번호'), '9999999999');
    await user.click(screen.getByRole('button', { name: '조회' }));

    expect(
      await screen.findByText(/사업자번호를 찾지 못했어요/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
