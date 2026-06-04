// BidForm — 결제수단 동적 렌더 + 제출 분리(paymentFees / customFees) + 드래프트 복원.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from '@/lib/http';
import { HTTPError } from 'ky';
import type { NormalizedOptions, ResponsePromise } from 'ky';
import type { MerchantGrade } from '@/lib/types/biz-profile';
import type { CustomPaymentMethod, PaymentMethod } from '@/lib/types/bid';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

vi.mock('@/lib/http', () => ({
  http: { post: vi.fn() },
}))
vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('use http client')))

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const submitBidMock = vi.fn(async (_input: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/bid', () => ({
  submitBidAction: (input: unknown) => submitBidMock(input),
}));

import { BidForm } from '../BidForm';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  push.mockClear();
  submitBidMock.mockClear();
});

type FormOverrides = {
  grade?: MerchantGrade | undefined;
  requiredPaymentMethods?: PaymentMethod[];
  customPaymentMethods?: CustomPaymentMethod[];
};

function renderForm(overrides: FormOverrides = {}) {
  return render(
    <BidForm
      rfpId="rfp-1"
      rfpCode="P-2605-0042"
      grade={'grade' in overrides ? overrides.grade : 'general'}
      requiredPaymentMethods={overrides.requiredPaymentMethods ?? ['bank_transfer']}
      customPaymentMethods={overrides.customPaymentMethods ?? []}
    />,
  );
}

// PercentInput 은 라벨-input aria 연결이 없어 라벨 텍스트의 컨테이너에서 input 을 찾는다.
function feeInput(labelText: string): HTMLInputElement {
  const label = screen.getByText(labelText);
  return label.closest('.space-y-1')!.querySelector('input[type="number"]') as HTMLInputElement;
}

const draftV2 = (fees: Record<string, string>, memo = '') => ({
  __v: 2,
  cycleUnit: 'D',
  cycleNum: '1',
  settleLimit: '0',
  guaranteeInsurance: '0',
  fees,
  memo,
});

describe('BidForm 제안서 업로드', () => {
  it('파일 선택 시 http.post로 업로드 후 성공 상태 설정', async () => {
    const user = userEvent.setup()
    vi.mocked(http.post).mockReturnValue({
      json: vi.fn().mockResolvedValue({ id: 'att-1', name: 'proposal.pdf', size: 1024 }),
    } as unknown as ResponsePromise)

    renderForm()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['content'], 'proposal.pdf', { type: 'application/pdf' }))

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/api/files/upload',
        expect.objectContaining({ body: expect.any(FormData) }),
      ),
    )
  })

  it('413 응답 시 파일 크기 오류 메시지 표시', async () => {
    const user = userEvent.setup()
    const error413 = new HTTPError(
      new Response('', { status: 413 }),
      new Request('http://localhost/api/files/upload'),
      {} as unknown as NormalizedOptions,
    )
    vi.mocked(http.post).mockReturnValue({
      json: vi.fn().mockRejectedValue(error413),
    } as unknown as ResponsePromise)

    renderForm()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['content'], 'big.pdf', { type: 'application/pdf' }))

    await waitFor(() =>
      expect(screen.getByText(/파일이 너무 큽니다/)).toBeInTheDocument(),
    )
  })
})

describe('BidForm 결제수단 동적 렌더', () => {
  it('요청된 결제수단마다 수수료 입력칸을 렌더한다', () => {
    renderForm({ requiredPaymentMethods: ['card', 'bank_transfer'], grade: 'general' });
    expect(screen.getByText('카드 수수료')).toBeInTheDocument();
    expect(screen.getByText('계좌이체 수수료')).toBeInTheDocument();
  });

  it('요청되지 않은 결제수단은 입력칸이 없다', () => {
    renderForm({ requiredPaymentMethods: ['bank_transfer'], grade: 'general' });
    expect(screen.queryByText('카드 수수료')).toBeNull();
    expect(screen.queryByText('가상계좌 수수료')).toBeNull();
  });

  it('카드 법정상한 등급(capped)이면 카드가 요청돼도 카드 입력칸을 렌더하지 않는다', () => {
    renderForm({ requiredPaymentMethods: ['card', 'bank_transfer'], grade: 'sme2' });
    expect(screen.queryByText('카드 수수료')).toBeNull();
    expect(screen.getByText('계좌이체 수수료')).toBeInTheDocument();
  });

  it('일반(general) 등급이면 카드 입력칸을 렌더한다', () => {
    renderForm({ requiredPaymentMethods: ['card'], grade: 'general' });
    expect(screen.getByText('카드 수수료')).toBeInTheDocument();
  });

  it('커스텀 결제수단마다 라벨로 입력칸을 렌더한다', () => {
    renderForm({
      requiredPaymentMethods: ['bank_transfer'],
      customPaymentMethods: [{ id: 'c1', label: '포인트결제' }],
      grade: 'general',
    });
    expect(screen.getByText('포인트결제 수수료')).toBeInTheDocument();
  });
});

describe('BidForm 제출 — paymentFees / customFees 분리', () => {
  it('enum 요율은 paymentFees, 커스텀 요율은 customFees로 전송한다', async () => {
    const user = userEvent.setup();
    renderForm({
      requiredPaymentMethods: ['bank_transfer'],
      customPaymentMethods: [{ id: 'c1', label: '포인트결제' }],
      grade: 'general',
    });

    await user.type(feeInput('계좌이체 수수료'), '0.50');
    await user.type(feeInput('포인트결제 수수료'), '2.00');

    await user.click(screen.getByRole('button', { name: /견적 보내기/ }));
    await user.click(screen.getByRole('button', { name: '견적 보내기', hidden: false }));

    await waitFor(() => expect(submitBidMock).toHaveBeenCalledOnce());
    const arg = submitBidMock.mock.calls[0][0] as {
      paymentFees: Record<string, number>;
      customFees: Record<string, number>;
    };
    expect(arg.paymentFees).toEqual({ bank_transfer: 0.005 });
    expect(arg.customFees).toEqual({ c1: 0.02 });
  });

  it('요율을 하나도 입력하지 않으면 제출 버튼이 비활성화된다', () => {
    renderForm({ requiredPaymentMethods: ['bank_transfer'], grade: 'general' });
    const submitBtn = screen.getByRole('button', { name: /견적 보내기/ });
    expect(submitBtn).toBeDisabled();
  });
});

describe('BidForm 임시 저장 복원 배너', () => {
  it('localStorage에 드래프트가 없으면 복원 배너가 없다', () => {
    renderForm();
    expect(screen.queryByText(/이전에 작성 중이던 내용이 있습니다/)).toBeNull();
  });

  it('localStorage에 드래프트가 있으면 복원 배너를 표시한다', () => {
    localStorage.setItem('bid-draft:rfp-1', JSON.stringify(draftV2({ bank_transfer: '0.30' }, '테스트')));
    renderForm();
    expect(screen.getByText(/이전에 작성 중이던 내용이 있습니다/)).toBeInTheDocument();
  });

  it('"불러오기" 클릭 시 드래프트 값이 필드에 반영된다', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bid-draft:rfp-1', JSON.stringify(draftV2({ bank_transfer: '0.40' }, '복원됨')));
    renderForm();
    await user.click(screen.getByRole('button', { name: '불러오기' }));

    expect(screen.queryByText(/이전에 작성 중이던 내용이 있습니다/)).toBeNull();
    expect((screen.getByPlaceholderText('추가 안내 사항이 있으면 입력하세요.') as HTMLTextAreaElement).value).toBe('복원됨');
    expect(feeInput('계좌이체 수수료').value).toBe('0.40');
  });

  it('"무시" 클릭 시 배너가 사라지고 localStorage 항목이 제거된다', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bid-draft:rfp-1', JSON.stringify(draftV2({ bank_transfer: '0.50' })));
    renderForm();
    await user.click(screen.getByRole('button', { name: '무시' }));

    expect(screen.queryByText(/이전에 작성 중이던 내용이 있습니다/)).toBeNull();
    expect(localStorage.getItem('bid-draft:rfp-1')).toBeNull();
  });

  it('제출 성공 시 localStorage 드래프트가 제거된다', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bid-draft:rfp-1', JSON.stringify(draftV2({ bank_transfer: '0.50' })));
    renderForm();
    await user.click(screen.getByRole('button', { name: '불러오기' }));
    await user.click(screen.getByRole('button', { name: /견적 보내기/ }));
    await user.click(screen.getByRole('button', { name: '견적 보내기', hidden: false }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(localStorage.getItem('bid-draft:rfp-1')).toBeNull();
  });
});

describe('BidForm UX 개선 — 심리학 법칙', () => {
  describe('비가역성 경고 (Peak-End / 멘탈 모델 #4/#5)', () => {
    it('폼 마운트 시 "제출 후 수정 불가" 경고 텍스트가 렌더된다', () => {
      renderForm();
      expect(screen.getByText(/보낸 후 수정 불가/)).toBeInTheDocument();
    });
  });

  describe('섹션 완료 표식 (Zeigarnik #2)', () => {
    it('cycleNum 기본값(1)이면 01 섹션 헤더에 ✓ 표식이 보인다', () => {
      renderForm();
      // default cycleNum = '1', parseInt('1') > 0 → 완료 표식 렌더
      expect(screen.getByTestId('section01-complete')).toBeInTheDocument();
    });

    it('수수료 미입력 시 02 섹션 헤더에 "0/N" 카운트가 표시된다', () => {
      // requiredPaymentMethods = ['bank_transfer'] → 1 fee input, 0 filled
      renderForm();
      expect(screen.getByTestId('section02-count')).toHaveTextContent('0/1');
    });

    it('수수료 입력 후 02 섹션 헤더 카운트가 "1/N"으로 갱신된다', async () => {
      const user = userEvent.setup();
      renderForm();
      await user.type(feeInput('계좌이체 수수료'), '0.50');
      expect(screen.getByTestId('section02-count')).toHaveTextContent('1/1');
    });
  });

  describe('자동저장 신호 (Doherty #1)', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('마운트 후 첫 자동저장(500ms) 뒤에 "저장됨" 텍스트가 렌더된다', async () => {
      renderForm();
      // useEffect가 마운트 시 saveDraft를 호출 → 500ms 뒤 savedAt 설정
      expect(screen.queryByText(/저장됨/)).toBeNull(); // 아직 없음

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.getByText(/저장됨/)).toBeInTheDocument();
    });
  });
});

describe('BidForm 수수료 환산 힌트', () => {
  it('계좌이체 수수료 0.50 입력 시 "1만원 결제 시 50원" 힌트가 표시된다', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(feeInput('계좌이체 수수료'), '0.50');

    expect(screen.getByText('= 1만원 결제 시 50원')).toBeInTheDocument();
  });

  it('수수료 입력값이 비어있으면 환산 힌트가 표시되지 않는다', () => {
    renderForm();
    expect(screen.queryByText(/1만원 결제 시/)).toBeNull();
  });
});

describe('BidForm 제출 후 네비게이션', () => {
  it('제출 버튼 클릭 시 confirm 다이얼로그가 열리고 action은 호출되지 않는다', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(feeInput('계좌이체 수수료'), '0.50');
    await user.click(screen.getByRole('button', { name: /견적 보내기/ }));

    expect(submitBidMock).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('confirm 다이얼로그에서 취소하면 action이 호출되지 않는다', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(feeInput('계좌이체 수수료'), '0.50');
    await user.click(screen.getByRole('button', { name: /견적 보내기/ }));
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(submitBidMock).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('confirm 다이얼로그에서 확인하면 submitBidAction을 호출하고 /submitted 로 push한다', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(feeInput('계좌이체 수수료'), '0.50');
    await user.click(screen.getByRole('button', { name: /견적 보내기/ }));
    await user.click(screen.getByRole('button', { name: '견적 보내기', hidden: false }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/inbox/P-2605-0042/submitted'),
    );
    expect(submitBidMock).toHaveBeenCalledOnce();
  });
});
