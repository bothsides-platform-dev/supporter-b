// BidForm 제출 성공 후 네비게이션 — 항상 /inbox/<code>/submitted 로 이동.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from '@/lib/http';
import { HTTPError } from 'ky';
import type { NormalizedOptions, ResponsePromise } from 'ky';

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

// grade='small' → 법정 카드수수료라 카드사 입력 불필요. 계좌이체·간편결제는
// 기본값(0.50/1.50)이 채워져 있어 즉시 제출 가능.
function renderForm() {
  return render(<BidForm rfpId="rfp-1" rfpCode="P-2605-0042" grade="small" />);
}

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

describe('BidForm 임시 저장 복원 배너', () => {
  it('localStorage에 드래프트가 없으면 복원 배너가 없다', () => {
    renderForm();
    expect(screen.queryByText(/이전에 작성 중이던 내용이 있습니다/)).toBeNull();
  });

  it('localStorage에 드래프트가 있으면 복원 배너를 표시한다', () => {
    localStorage.setItem(
      'bid-draft:rfp-1',
      JSON.stringify({
        cycleUnit: 'D',
        cycleNum: '2',
        settleLimit: '5000000',
        guaranteeInsurance: '300000',
        bankPct: '0.30',
        cardPct: '1.00',
        memo: '테스트',
      }),
    );
    renderForm();
    expect(screen.getByText(/이전에 작성 중이던 내용이 있습니다/)).toBeInTheDocument();
  });

  it('"불러오기" 클릭 시 드래프트 값이 필드에 반영된다', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'bid-draft:rfp-1',
      JSON.stringify({
        cycleUnit: 'W',
        cycleNum: '2',
        settleLimit: '5000000',
        guaranteeInsurance: '300000',
        bankPct: '0.40',
        cardPct: '',
        memo: '복원됨',
      }),
    );
    renderForm();
    await user.click(screen.getByRole('button', { name: '불러오기' }));

    expect(screen.queryByText(/이전에 작성 중이던 내용이 있습니다/)).toBeNull();
    expect((screen.getByPlaceholderText('추가 안내 사항이 있으면 입력하세요.') as HTMLTextAreaElement).value).toBe('복원됨');
  });

  it('"무시" 클릭 시 배너가 사라지고 localStorage 항목이 제거된다', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'bid-draft:rfp-1',
      JSON.stringify({
        cycleUnit: 'D',
        cycleNum: '1',
        settleLimit: '0',
        guaranteeInsurance: '0',
        bankPct: '0.50',
        cardPct: '',
        memo: '',
      }),
    );
    renderForm();
    await user.click(screen.getByRole('button', { name: '무시' }));

    expect(screen.queryByText(/이전에 작성 중이던 내용이 있습니다/)).toBeNull();
    expect(localStorage.getItem('bid-draft:rfp-1')).toBeNull();
  });

  it('제출 성공 시 localStorage 드래프트가 제거된다', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'bid-draft:rfp-1',
      JSON.stringify({
        cycleUnit: 'D',
        cycleNum: '1',
        settleLimit: '0',
        guaranteeInsurance: '0',
        bankPct: '0.50',
        cardPct: '',
        memo: '',
      }),
    );
    renderForm();
    await user.click(screen.getByRole('button', { name: /제안 제출/ }));
    await user.click(screen.getByRole('button', { name: '제안 제출', hidden: false }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(localStorage.getItem('bid-draft:rfp-1')).toBeNull();
  });
});

describe('BidForm 수수료 환산 힌트', () => {
  it('계좌이체 수수료 0.50 입력 시 "1만원 결제 시 50원" 힌트가 표시된다', async () => {
    const user = userEvent.setup();
    renderForm();

    const inputs = screen.getAllByRole('spinbutton');
    const bankInput = inputs.find(
      (el) => (el as HTMLInputElement).placeholder === '0.50',
    ) as HTMLInputElement;

    await user.clear(bankInput);
    await user.type(bankInput, '0.50');

    expect(screen.getByText('= 1만원 결제 시 50원')).toBeInTheDocument();
  });

  it('수수료 입력값이 비어있으면 환산 힌트가 표시되지 않는다', async () => {
    const user = userEvent.setup();
    renderForm();

    const inputs = screen.getAllByRole('spinbutton');
    const bankInput = inputs.find(
      (el) => (el as HTMLInputElement).placeholder === '0.50',
    ) as HTMLInputElement;

    await user.clear(bankInput);

    expect(screen.queryByText(/1만원 결제 시/)).toBeNull();
  });
});

describe('BidForm 제출 후 네비게이션', () => {
  it('제출 버튼 클릭 시 confirm 다이얼로그가 열리고 action은 호출되지 않는다', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: /제안 제출/ }));

    expect(submitBidMock).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('confirm 다이얼로그에서 취소하면 action이 호출되지 않는다', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: /제안 제출/ }));
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(submitBidMock).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('confirm 다이얼로그에서 확인하면 submitBidAction을 호출하고 /submitted 로 push한다', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: /제안 제출/ }));
    await user.click(screen.getByRole('button', { name: '제안 제출', hidden: false }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/inbox/P-2605-0042/submitted'),
    );
    expect(submitBidMock).toHaveBeenCalledOnce();
  });
});
