import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const updateMyPhoneAction = vi.fn();
vi.mock('@/lib/server/actions/user/updateMyPhoneAction', () => ({
  updateMyPhoneAction: (...a: unknown[]) => updateMyPhoneAction(...a),
}));

// OTP 왕복은 PhoneVerificationField 의 책임이고 자체 테스트가 있다 — 여기서는
// "인증이 끝났을 때 이 컴포넌트가 무엇을 하는가"만 본다.
vi.mock('@/components/auth/PhoneVerificationField', () => ({
  PhoneVerificationField: ({
    onVerified,
    requireMobile010,
  }: {
    onVerified: (phone: string, id: string) => void;
    requireMobile010?: boolean;
  }) => (
    // prop 을 DOM 에 드러낸다 — mock 이 prop 을 통째로 무시하면 배선이 끊겨도
    // 테스트가 전부 초록이다(아래 배선 테스트의 근거).
    <button
      type="button"
      data-require-mobile-010={String(requireMobile010 ?? false)}
      onClick={() => onVerified('010-5555-6666', 'vid-1')}
    >
      인증 완료 시뮬
    </button>
  ),
}));

import { UserPhoneForm } from '../UserPhoneForm';

beforeEach(() => {
  toast.mockReset();
  refresh.mockReset();
  updateMyPhoneAction.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('UserPhoneForm', () => {
  it('번호가 없으면 미등록 상태와 왜 필요한지를 함께 알려준다', () => {
    // 값만 비워 두면 사용자는 이게 선택 항목인지 알 수 없다 — 계약 발송이 막히는
    // 이유가 이 필드라는 것을 여기서 말해야 딜이 멈춘 뒤에 헤매지 않는다.
    render(<UserPhoneForm currentPhone={null} />);

    expect(screen.getByText('등록 안 됨')).toBeInTheDocument();
    expect(screen.getByText(/계약서 서명/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증하기' })).toBeInTheDocument();
  });

  it('번호가 있으면 하이픈 포맷으로 보여주고 변경할 수 있다', () => {
    // 저장 형태는 숫자만이다 — 사람이 읽는 자리에서는 되붙인다.
    render(<UserPhoneForm currentPhone="01055556666" />);

    expect(screen.getByText('010-5555-6666')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '변경' })).toBeInTheDocument();
  });

  it('인증이 끝나면 저장하고 성공을 알린 뒤 화면을 새로 읽는다', async () => {
    updateMyPhoneAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<UserPhoneForm currentPhone={null} />);

    await user.click(screen.getByRole('button', { name: '인증하기' }));
    await user.click(screen.getByRole('button', { name: '인증 완료 시뮬' }));

    await waitFor(() =>
      expect(updateMyPhoneAction).toHaveBeenCalledWith({
        phone: '010-5555-6666',
        phoneVerificationId: 'vid-1',
      }),
    );
    expect(toast).toHaveBeenCalledWith('휴대폰 인증을 완료했어요.');
    expect(refresh).toHaveBeenCalled();
  });

  it('실패하면 매핑된 문구를 띄우고 내부 코드를 노출하지 않는다', async () => {
    updateMyPhoneAction.mockResolvedValue({ ok: false, error: 'PHONE_NOT_MOBILE_010' });
    const user = userEvent.setup();
    render(<UserPhoneForm currentPhone={null} />);

    await user.click(screen.getByRole('button', { name: '인증하기' }));
    await user.click(screen.getByRole('button', { name: '인증 완료 시뮬' }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    const msg = String(toast.mock.calls[0][0]);
    expect(msg).toContain('010');
    expect(msg).not.toContain('PHONE_NOT_MOBILE_010');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('미매핑 코드도 원문을 노출하지 않는다', async () => {
    updateMyPhoneAction.mockResolvedValue({ ok: false, error: 'SOME_INTERNAL_ENUM' });
    const user = userEvent.setup();
    render(<UserPhoneForm currentPhone={null} />);

    await user.click(screen.getByRole('button', { name: '인증하기' }));
    await user.click(screen.getByRole('button', { name: '인증 완료 시뮬' }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(String(toast.mock.calls[0][0])).not.toContain('SOME_INTERNAL_ENUM');
  });

  // 이 화면이 받는 번호는 **서명 본인인증용**이라 010 만 저장된다. 그 제약을
  // SMS 이전에 알리는 것은 필드가 하지만, 켜는 것은 여기다 — prop 이 빠지면
  // 011 번호가 실제 SMS 와 OTP 왕복을 다 태우고 마지막 저장에서야 튕긴다.
  // 배선은 조용히 끊어질 수 있어(타입상 optional) 명시적으로 못박는다.
  it('PhoneVerificationField 에 requireMobile010 을 켜서 넘긴다', async () => {
    const user = userEvent.setup();
    render(<UserPhoneForm currentPhone={null} />);

    await user.click(screen.getByRole('button', { name: '인증하기' }));

    expect(screen.getByRole('button', { name: '인증 완료 시뮬' })).toHaveAttribute(
      'data-require-mobile-010',
      'true',
    );
  });
});
