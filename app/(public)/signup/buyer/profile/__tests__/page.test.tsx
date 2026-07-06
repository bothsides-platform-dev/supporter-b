import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => ({
    email: 'buyer@example.com',
    password: 'pw-123456',
    wsName: '구매사',
    bizProfile: { bizNo: '1234567890', taxType: 'general', status: 'active' },
  }),
  writeSignupDraft: vi.fn(),
  isSignupStorageAvailable: () => true,
}));

vi.mock('@/lib/stores/signup-draft', () => ({
  useSignupDraftStore: () => ({ setProfile: vi.fn() }),
}));

vi.mock('@/components/auth/SignupStepper', () => ({
  SignupStepper: () => null,
}));

vi.mock('@/components/auth/PhoneVerificationField', () => ({
  PhoneVerificationField: ({ onVerified }: { onVerified: (p: string, v: string) => void }) => (
    <button type="button" onClick={() => onVerified('01012345678', 'vid-test')}>
      전화인증
    </button>
  ),
}));

const finalizeMock = vi.fn();
vi.mock('@/lib/auth/finalize-signup', () => ({
  finalizeSignup: () => finalizeMock(),
}));

import BuyerProfilePage from '../page';

let assignSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockReset();
  finalizeMock.mockReset();
  assignSpy = vi.fn();
  Object.defineProperty(window, 'location', {
    value: { assign: assignSpy, href: '' },
    writable: true,
    configurable: true,
  });
});

afterEach(() => cleanup());

describe('BuyerProfilePage — 가입 완료 후 리디렉션', () => {
  it('finalizeSignup이 상대 경로를 반환하면 window.location.assign으로 이동한다', async () => {
    finalizeMock.mockResolvedValue({ ok: true, redirectTo: '/pending-approval' });
    const user = userEvent.setup();
    render(<BuyerProfilePage />);

    await user.type(screen.getByLabelText('이름'), '홍길동');
    await user.click(screen.getByRole('button', { name: '전화인증' }));
    await user.click(screen.getByRole('button', { name: '가입 완료' }));

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith('/pending-approval');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('finalizeSignup이 절대 URL을 반환해도 window.location.assign으로 이동한다', async () => {
    finalizeMock.mockResolvedValue({ ok: true, redirectTo: 'https://partner.support-b.com/inbox' });
    const user = userEvent.setup();
    render(<BuyerProfilePage />);

    await user.type(screen.getByLabelText('이름'), '홍길동');
    await user.click(screen.getByRole('button', { name: '전화인증' }));
    await user.click(screen.getByRole('button', { name: '가입 완료' }));

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith('https://partner.support-b.com/inbox');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
