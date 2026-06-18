/**
 * PgWorkspaceStep — PG 가입 2단계 (워크스페이스 선택/직접 입력).
 *
 *  - 기본: canonical PG사 카드 그리드 표시
 *  - 카드 클릭 시 selectedPgWorkspaceId를 draft에 저장하고 /profile로 이동
 *  - "직접 입력" 클릭 시 기존 워크스페이스 이름 + 사업자번호 폼 표시
 *  - 초대 경로 skip 가드
 *  - 아바타 렌더링: hasLogo=true면 WorkspaceAvatar 프로필 사진(<img>), false면 이니셜
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

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

import PgWorkspaceStep from '@/app/(public)/signup/pg/workspace/PgWorkspaceStep';

const CANONICAL_COMPANIES = [
  { id: 'ws-toss-id', name: '토스페이먼츠', canonicalPgKey: 'tosspayments', hasLogo: false },
  { id: 'ws-kginicis-id', name: 'KG이니시스', canonicalPgKey: 'kginicis', hasLogo: false },
];

describe('PgWorkspaceStep — 초대 경로 skip 가드', () => {
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

    render(<PgWorkspaceStep canonicalCompanies={CANONICAL_COMPANIES} />);

    expect(mockReplace).toHaveBeenCalledWith('/signup/pg/profile');
    expect(mockReplace).not.toHaveBeenCalledWith('/signup/pg');
  });

  it('wsInviteToken 없고 email+password 없으면 /signup/pg로 redirect한다', () => {
    mockDraftData = {};

    render(<PgWorkspaceStep canonicalCompanies={CANONICAL_COMPANIES} />);

    expect(mockReplace).toHaveBeenCalledWith('/signup/pg');
  });
});

describe('PgWorkspaceStep — canonical PG 선택 모드', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockWriteSignupDraft.mockReset();
    mockDraftData = { email: 'sales@toss.im', password: 'Password123!' };
  });

  it('canonical 회사 카드 목록을 보여준다', () => {
    render(<PgWorkspaceStep canonicalCompanies={CANONICAL_COMPANIES} />);

    expect(screen.getByText('토스페이먼츠')).toBeInTheDocument();
    expect(screen.getByText('KG이니시스')).toBeInTheDocument();
  });

  it('카드 클릭 시 selectedPgWorkspaceId를 draft에 저장하고 /profile로 이동', async () => {
    const user = userEvent.setup();
    render(<PgWorkspaceStep canonicalCompanies={CANONICAL_COMPANIES} />);

    await user.click(screen.getByText('토스페이먼츠'));

    expect(mockWriteSignupDraft).toHaveBeenCalledWith(
      expect.objectContaining({ selectedPgWorkspaceId: 'ws-toss-id' }),
    );
    expect(mockPush).toHaveBeenCalledWith('/signup/pg/profile');
  });

  it('"직접 입력" 클릭 시 수동 입력 폼을 보여준다', async () => {
    const user = userEvent.setup();
    render(<PgWorkspaceStep canonicalCompanies={CANONICAL_COMPANIES} />);

    await user.click(screen.getByRole('button', { name: /직접 입력/ }));

    expect(screen.getByLabelText('사업자 등록번호')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('예: 서포터 B 페이 영업팀')).toBeInTheDocument();
  });
});

describe('PgWorkspaceStep — 워크스페이스 아바타 렌더링', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockWriteSignupDraft.mockReset();
    mockDraftData = { email: 'sales@toss.im', password: 'Password123!' };
  });

  it('hasLogo=true인 회사 버튼에 WorkspaceAvatar 프로필 사진 <img>가 렌더된다', () => {
    const companies = [
      { id: 'ws-toss-id', name: '토스페이먼츠', canonicalPgKey: 'tosspayments', hasLogo: true },
      { id: 'ws-kginicis-id', name: 'KG이니시스', canonicalPgKey: 'kginicis', hasLogo: false },
    ];
    render(<PgWorkspaceStep canonicalCompanies={companies} />);

    const tossBtn = screen.getByRole('button', { name: /토스페이먼츠/ });
    const img = tossBtn.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('/api/workspace/ws-toss-id/avatar');
  });

  it('hasLogo=false인 회사 버튼에는 <img>가 없고 이니셜 아바타가 표시된다', () => {
    const companies = [
      { id: 'ws-kginicis-id', name: 'KG이니시스', canonicalPgKey: 'kginicis', hasLogo: false },
    ];
    render(<PgWorkspaceStep canonicalCompanies={companies} />);

    const btn = screen.getByRole('button', { name: /KG이니시스/ });
    expect(btn.querySelector('img')).toBeNull();
    // WorkspaceAvatar 이니셜 폴백은 role="img"인 div
    expect(btn.querySelector('[role="img"]')).not.toBeNull();
  });

  it('hasLogo=true인 아바타 img의 alt는 워크스페이스 이름이다', () => {
    const companies = [
      { id: 'ws-toss-id', name: '토스페이먼츠', canonicalPgKey: 'tosspayments', hasLogo: true },
    ];
    render(<PgWorkspaceStep canonicalCompanies={companies} />);

    const tossBtn = screen.getByRole('button', { name: /토스페이먼츠/ });
    const img = tossBtn.querySelector('img');
    expect(img!.getAttribute('alt')).toBe('토스페이먼츠');
  });

  it('아바타 img 로드 실패 시 이니셜 아바타로 대체된다', () => {
    const companies = [
      { id: 'ws-toss-id', name: '토스페이먼츠', canonicalPgKey: 'tosspayments', hasLogo: true },
    ];
    render(<PgWorkspaceStep canonicalCompanies={companies} />);

    const tossBtn = screen.getByRole('button', { name: /토스페이먼츠/ });
    const img = tossBtn.querySelector('img')!;
    expect(img).not.toBeNull();

    // 이미지 로드 실패 → WorkspaceAvatar가 imgError=true로 상태 전환 → 이니셜 div 렌더
    fireEvent.error(img);

    expect(tossBtn.querySelector('img')).toBeNull();
    expect(tossBtn.querySelector('[role="img"]')).not.toBeNull();
  });
});

describe('PgWorkspaceStep — 직접 입력 모드 (사업자 인증)', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockWriteSignupDraft.mockReset();
    mockLookupBizNo.mockReset();
    mockLookupBizNo.mockResolvedValue({
      ok: true, valid: true, taxType: 'general', status: 'active',
    });
    mockDraftData = { email: 'sales@toss.im', password: 'Password123!' };
  });

  async function openManualMode(user: ReturnType<typeof userEvent.setup>) {
    render(<PgWorkspaceStep canonicalCompanies={CANONICAL_COMPANIES} />);
    await user.click(screen.getByRole('button', { name: /직접 입력/ }));
  }

  it('NTS 조회로 확인하기 전에는 제출 버튼이 비활성이다', async () => {
    const user = userEvent.setup();
    await openManualMode(user);

    await user.type(screen.getByPlaceholderText('예: 서포터 B 페이 영업팀'), '토스페이먼츠 영업팀');

    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });

  it('사업자 조회 성공 후 제출하면 bizNo를 draft에 저장하고 profile로 이동', async () => {
    const user = userEvent.setup();
    await openManualMode(user);

    await user.type(screen.getByPlaceholderText('예: 서포터 B 페이 영업팀'), '토스페이먼츠 영업팀');
    await user.type(screen.getByLabelText('사업자 등록번호'), '1248100998');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(screen.getByText('NTS — 국세청 자동 조회')).toBeInTheDocument(),
    );

    const submit = screen.getByRole('button', { name: '다음' });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(mockWriteSignupDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        wsName: '토스페이먼츠 영업팀',
        bizNo: '1248100998',
        selectedPgWorkspaceId: undefined,
      }),
    );
    expect(mockPush).toHaveBeenCalledWith('/signup/pg/profile');
  });

  it('사업자 조회 실패 시 제출 버튼이 비활성으로 유지된다', async () => {
    mockLookupBizNo.mockResolvedValue({ ok: true, valid: false });
    const user = userEvent.setup();
    await openManualMode(user);

    await user.type(screen.getByPlaceholderText('예: 서포터 B 페이 영업팀'), '토스페이먼츠 영업팀');
    await user.type(screen.getByLabelText('사업자 등록번호'), '9999999999');
    await user.click(screen.getByRole('button', { name: '조회' }));

    expect(
      await screen.findByText(/사업자번호를 찾지 못했어요/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
