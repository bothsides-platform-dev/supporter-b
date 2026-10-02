// Coverage: ISSUE-002 — 복원된 1단계 입력으로 곧바로 다음 단계로 갈 수 있고, 불완전한 draft 는 동의를 켜지 않는다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => searchParams,
}));

const mockCheckEmail = vi.fn();
vi.mock('@/lib/server/actions/auth', () => ({
  checkEmailAvailableAction: (...args: unknown[]) => mockCheckEmail(...args),
}));

const draft: Record<string, unknown> = {};
const writeMock = vi.fn();
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => ({ ...draft }),
  writeSignupDraft: (d: unknown) => writeMock(d),
}));

vi.mock('@/lib/stores/signup-draft', () => ({
  useSignupDraftStore: () => ({
    setEmail: vi.fn(),
    setAgreedAt: vi.fn(),
    setWorkspaceType: vi.fn(),
  }),
}));

import BuyerSignupEmailPage from '../page';
import PgSignupEmailPage from '@/app/(public)/signup/pg/page';
import { TEST_SIGNUP_CONSENT, TEST_SIGNUP_DOCUMENTS } from '@/lib/auth/__tests__/signup-consent-fixture';

const documentsMock = vi.fn();
vi.mock('@/lib/auth/signup-documents', () => ({ getSignupConsentDocuments: () => documentsMock() }));

beforeEach(() => {
  documentsMock.mockReturnValue(TEST_SIGNUP_DOCUMENTS);
  searchParams = new URLSearchParams();
  mockPush.mockReset();
  writeMock.mockReset();
  mockCheckEmail.mockReset();
  mockCheckEmail.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  for (const k of Object.keys(draft)) delete draft[k];
});

describe.each([
  { kind: 'buyer' as const, Page: BuyerSignupEmailPage },
  { kind: 'pg' as const, Page: PgSignupEmailPage },
])('$kind 가입 동의 초안 복원', ({ kind, Page }) => {
  it.each([false, true])('마케팅 선택 %s와 문서 판본을 복원하여 다음 단계에 전달한다', async (marketing) => {
    Object.assign(draft, {
      workspaceType: kind,
      email: 'back@example.com',
      password: 'Qa!pass12345',
      consent: { ...TEST_SIGNUP_CONSENT, marketing },
      wsName: '뒤로가기상사',
      bizProfile: { bizNo: '124-81-00998', taxType: 'general', status: 'active' },
    });
    const user = userEvent.setup();
    render(<Page />);

    await waitFor(() => expect(screen.getByLabelText('이메일')).toHaveValue('back@example.com'));
    expect(screen.getByRole('checkbox', { name: /이용약관/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /개인정보 처리방침/ })).toBeChecked();
    const marketingCheckbox = screen.getByRole('checkbox', { name: /마케팅/ });
    if (marketing) expect(marketingCheckbox).toBeChecked();
    else expect(marketingCheckbox).not.toBeChecked();
    expect(screen.getByLabelText('비밀번호')).toHaveValue('');
    await user.type(screen.getByLabelText('비밀번호'), 'Qa!pass12345');
    await user.type(screen.getByLabelText('비밀번호 확인'), 'Qa!pass12345');
    await user.click(screen.getByRole('button', { name: '다음' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/signup/${kind}/workspace`));
    expect(writeMock).toHaveBeenCalledWith(expect.objectContaining({
      consent: { ...TEST_SIGNUP_CONSENT, marketing },
      workspaceType: kind,
      wsName: '뒤로가기상사',
      bizProfile: { bizNo: '124-81-00998', taxType: 'general', status: 'active' },
    }));
  });

  it('agreedAt만 있는 오래된 draft에서 동의를 추정하지 않는다', async () => {
    Object.assign(draft, { workspaceType: kind, email: 'old@example.com', agreedAt: '2020-01-01T00:00:00Z' });
    render(<Page />);
    await waitFor(() => expect(screen.getByLabelText('이메일')).toHaveValue('old@example.com'));
    for (const name of [/이용약관/, /개인정보 처리방침/, /마케팅/]) {
      expect(screen.getByRole('checkbox', { name })).not.toBeChecked();
    }
  });

  it('낡은 문서 판본은 동의를 복원하지 않는다', async () => {
    Object.assign(draft, { workspaceType: kind, email: 'stale@example.com', consent: { ...TEST_SIGNUP_CONSENT, termsVersion: 'old', marketing: true } });
    render(<Page />);
    await waitFor(() => expect(screen.getByLabelText('이메일')).toHaveValue('stale@example.com'));
    for (const name of [/이용약관/, /개인정보 처리방침/, /마케팅/]) {
      expect(screen.getByRole('checkbox', { name })).not.toBeChecked();
    }
  });

  it('새 동의는 마케팅을 기본 false로 저장하고 필수 동의 해제와 독립적으로 처리한다', async () => {
    const user = userEvent.setup();
    render(<Page />);
    await user.type(screen.getByLabelText('이메일'), 'new@example.com');
    await user.type(screen.getByLabelText('비밀번호'), 'Qa!pass12345');
    await user.type(screen.getByLabelText('비밀번호 확인'), 'Qa!pass12345');
    await user.click(screen.getByRole('checkbox', { name: /이용약관/ }));
    await user.click(screen.getByRole('checkbox', { name: /개인정보 처리방침/ }));
    expect(screen.getByRole('checkbox', { name: /마케팅/ })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: /마케팅/ }));
    await user.click(screen.getByRole('checkbox', { name: /이용약관/ }));
    expect(screen.getByRole('checkbox', { name: /마케팅/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(mockPush).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox', { name: /이용약관/ }));
    await user.click(screen.getByRole('checkbox', { name: /마케팅/ }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(writeMock).toHaveBeenCalledWith(expect.objectContaining({ consent: TEST_SIGNUP_CONSENT })));
  });

  // Value: protects=visible choices match submitted signup consent;
  // fails_when=checkboxes remain editable during email validation;
  // why_new=existing tests resolve email validation immediately; seam=none
  it('이메일 확인 중에는 필수·선택 동의를 잠그고 표시한 값 그대로 넘긴다', async () => {
    Object.assign(draft, { workspaceType: kind, email: 'pending@example.com', consent: { ...TEST_SIGNUP_CONSENT, marketing: true } });
    let resolveEmailCheck!: (result: { ok: true }) => void;
    mockCheckEmail.mockImplementation(() => new Promise<{ ok: true }>((resolve) => { resolveEmailCheck = resolve; }));
    const user = userEvent.setup();
    render(<Page />);
    await user.type(screen.getByLabelText('비밀번호'), 'Qa!pass12345');
    await user.type(screen.getByLabelText('비밀번호 확인'), 'Qa!pass12345');
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(mockCheckEmail).toHaveBeenCalledWith({ email: 'pending@example.com' });
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /이용약관/ }));
    await user.click(screen.getByRole('checkbox', { name: /마케팅/ }));
    expect(screen.getByRole('checkbox', { name: /이용약관/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /마케팅/ })).toBeChecked();
    expect(screen.getByRole('link', { name: '이용약관' })).toHaveAttribute('href', TEST_SIGNUP_DOCUMENTS.terms.url);

    resolveEmailCheck({ ok: true });
    await waitFor(() => expect(writeMock).toHaveBeenCalledWith(expect.objectContaining({
      consent: { ...TEST_SIGNUP_CONSENT, marketing: true },
    })));
  });

  it('서버의 재동의 요청으로 돌아오면 기존 체크를 비우고 이유를 안내한다', () => {
    Object.assign(draft, { workspaceType: kind, email: 'back@example.com', consent: TEST_SIGNUP_CONSENT });
    searchParams = new URLSearchParams('consent=review');
    render(<Page />);
    expect(screen.getByRole('alert')).toHaveTextContent('가입 동의 내용을 다시 확인해 주세요');
    expect(screen.getByRole('checkbox', { name: /이용약관/ })).not.toBeChecked();
  });

  it('같은 첫 화면에서 재동의 요청으로 전환되어도 기존 체크를 비운다', () => {
    Object.assign(draft, { workspaceType: kind, email: 'back@example.com', consent: TEST_SIGNUP_CONSENT });
    const { rerender } = render(<Page />);
    expect(screen.getByRole('checkbox', { name: /이용약관/ })).toBeChecked();
    searchParams = new URLSearchParams('consent=review');
    rerender(<Page />);
    expect(screen.getByRole('checkbox', { name: /이용약관/ })).not.toBeChecked();
  });

  it('동의 문서 판본을 준비하지 못한 동안 안내하고 다음 버튼을 막는다', () => {
    documentsMock.mockReturnValue(null);
    render(<Page />);
    expect(screen.getByRole('alert')).toHaveTextContent('가입 동의 문서를 준비하고 있어요');
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });
});
