// BidForm 제출 성공 후 네비게이션 — 항상 /inbox/<code>/submitted 로 이동.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from '@/lib/http';
import { HTTPError } from 'ky';

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
    } as any)

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
      {} as any,
    )
    vi.mocked(http.post).mockReturnValue({
      json: vi.fn().mockRejectedValue(error413),
    } as any)

    renderForm()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['content'], 'big.pdf', { type: 'application/pdf' }))

    await waitFor(() =>
      expect(screen.getByText(/파일이 너무 큽니다/)).toBeInTheDocument(),
    )
  })
})

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
