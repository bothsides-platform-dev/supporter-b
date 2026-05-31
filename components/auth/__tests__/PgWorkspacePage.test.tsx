/**
 * PG 가입 2단계 (워크스페이스) — 초대 경로 skip 가드 검증.
 *
 * wsInviteToken이 draft에 있으면 workspace 단계를 건너뛰고
 * /signup/pg/profile로 redirect한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

let mockDraftData: Record<string, unknown> = {};
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => mockDraftData,
  writeSignupDraft: vi.fn(),
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

    // useEffect는 동기적으로 실행되지 않으므로 waitFor 없이도 확인 가능
    // (실제로는 React act() 내에서 실행됨)
    expect(mockReplace).toHaveBeenCalledWith('/signup/pg/profile');
    expect(mockReplace).not.toHaveBeenCalledWith('/signup/pg');
  });

  it('wsInviteToken 없고 email+password 없으면 /signup/pg로 redirect한다', () => {
    mockDraftData = {}; // 빈 draft

    render(<PgWorkspacePage />);

    expect(mockReplace).toHaveBeenCalledWith('/signup/pg');
  });
});
