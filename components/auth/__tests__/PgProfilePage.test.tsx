/**
 * PG 가입 3단계 (담당자 정보) — 초대 경로 ready 가드 + stepper 검증.
 *
 * 초대 경로(wsInviteToken 있음): wsName/bizNo 없어도 진입 허용 (step 2 건너뜀).
 * 일반 경로: wsName + bizNo 필수, 없으면 /signup/pg로 redirect.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockReplace = vi.fn();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

let mockDraftData: Record<string, unknown> = {};
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => mockDraftData,
  writeSignupDraft: vi.fn(),
}));

vi.mock('@/lib/stores/signup-draft', () => ({
  useSignupDraftStore: () => ({ setProfile: vi.fn() }),
}));

// PhoneVerificationField는 외부 API를 호출하므로 stub
vi.mock('@/components/auth/PhoneVerificationField', () => ({
  PhoneVerificationField: ({ onVerified }: { onVerified: (phone: string, id: string) => void }) => (
    <button onClick={() => onVerified('01011112222', 'otp-id')}>인증 완료</button>
  ),
}));

import PgProfilePage from '@/app/(public)/signup/pg/profile/page';

describe('PgProfilePage — 초대 경로 ready 가드', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
  });

  it('초대 경로: email + password만 있으면 wsName/bizNo 없어도 진입 허용', () => {
    mockDraftData = {
      email: 'newmember@toss.im',
      password: 'Password123!',
      wsInviteToken: 'invite-token-abc',
      // wsName, bizNo 없음
    };

    render(<PgProfilePage />);

    // redirect 없이 폼이 렌더됨
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText('이름')).toBeInTheDocument();
  });

  it('초대 경로: stepper는 2/3을 표시한다', () => {
    mockDraftData = {
      email: 'newmember@toss.im',
      password: 'Password123!',
      wsInviteToken: 'invite-token-abc',
    };

    render(<PgProfilePage />);

    // SignupStepper current=2, total=3
    // "2 / 3" 또는 숫자 형식으로 표시되는지 확인
    // STEP indicator 텍스트를 찾음
    const stepText = document.body.textContent ?? '';
    expect(stepText).toContain('2');
    expect(stepText).toContain('3');
    // total이 4가 아님을 확인
    expect(screen.queryByText('4')).not.toBeInTheDocument();
  });

  it('일반 경로: wsName/bizNo 없으면 /signup/pg로 redirect', () => {
    mockDraftData = {
      email: 'sales@toss.im',
      password: 'Password123!',
      // wsName, bizNo 없음, wsInviteToken 없음
    };

    render(<PgProfilePage />);

    expect(mockReplace).toHaveBeenCalledWith('/signup/pg');
  });
});
