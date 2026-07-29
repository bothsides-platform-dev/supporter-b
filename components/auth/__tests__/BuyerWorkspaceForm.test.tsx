import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// NTS가 미지원 사업자 유형(비사업자 등)을 반환할 때 taxType이 undefined로 내려옴.
// ntsLookup 어댑터는 이 경우 valid=false + 에러 메시지를 반환해야 한다.
const mockLookupBizNo = vi.fn();
vi.mock('@/lib/server/actions/rfp', () => ({
  lookupBizNoAction: (...a: unknown[]) => mockLookupBizNo(...a),
}));

import { BuyerWorkspaceForm } from '../BuyerWorkspaceForm';

describe('BuyerWorkspaceForm — ntsLookup undefined taxType guard', () => {
  it('shows an unsupported-type error and keeps submit disabled when NTS returns no taxType', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    // Simulate NTS returning ok=true, valid=true but taxType missing (비사업자 등)
    mockLookupBizNo.mockResolvedValue({ ok: true, valid: true, status: 'active' });

    render(
      <BuyerWorkspaceForm onSubmit={onSubmit} submitting={false} />,
    );

    await user.type(screen.getByPlaceholderText('(주)샘플테크'), '샘플워크스페이스');
    await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));

    // Should NOT show "✓ 확인됨" — must show error about unsupported type
    await waitFor(() =>
      expect(screen.queryByText('✓ 확인됨')).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Submit button must remain disabled (bizProfile not set)
    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('proceeds normally when NTS returns a valid taxType', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    mockLookupBizNo.mockResolvedValue({ ok: true, valid: true, taxType: 'general', status: 'active' });

    render(
      <BuyerWorkspaceForm onSubmit={onSubmit} submitting={false} />,
    );

    await user.type(screen.getByPlaceholderText('(주)샘플테크'), '샘플워크스페이스');
    await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(screen.getByText('✓ 확인됨')).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        wsName: '샘플워크스페이스',
        bizProfile: { bizNo: '123-45-67890', taxType: 'general', status: 'active' },
      }),
    );
  });
});

describe('BuyerWorkspaceForm — 폐업/휴업 사업자 차단', () => {
  it.each([
    ['closed', '9999999999'] as const,
    ['suspended', '8888888888'] as const,
  ])('keeps submit disabled and shows error when NTS returns %s status', async (status, bizNo) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    mockLookupBizNo.mockResolvedValue({ ok: true, valid: true, taxType: 'general', status });

    render(
      <BuyerWorkspaceForm onSubmit={onSubmit} submitting={false} />,
    );

    await user.type(screen.getByPlaceholderText('(주)샘플테크'), '샘플워크스페이스');
    await user.type(screen.getByLabelText('사업자 등록번호'), bizNo);
    await user.click(screen.getByRole('button', { name: '조회' }));

    // 차단된 경우 "✓ 확인됨" 배지가 아닌 오류 메시지를 기다린다.
    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument(),
    );

    expect(screen.getByRole('alert').textContent).toMatch(/사용할 수 없어요/);
    expect(screen.getByRole('button', { name: '워크스페이스 만들기' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('allows submit after resetting blocked lookup and entering an active bizNo', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    // First lookup returns closed; second returns active.
    mockLookupBizNo
      .mockResolvedValueOnce({ ok: true, valid: true, taxType: 'general', status: 'closed' })
      .mockResolvedValueOnce({ ok: true, valid: true, taxType: 'general', status: 'active' });

    render(
      <BuyerWorkspaceForm onSubmit={onSubmit} submitting={false} />,
    );

    await user.type(screen.getByPlaceholderText('(주)샘플테크'), '샘플워크스페이스');

    // Step 1: blocked lookup — submit must stay disabled.
    await user.type(screen.getByLabelText('사업자 등록번호'), '9999999999');
    await user.click(screen.getByRole('button', { name: '조회' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: '워크스페이스 만들기' })).toBeDisabled();

    // Step 2: reset → re-query with active bizNo.
    await user.click(screen.getByRole('button', { name: '초기화' }));
    await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));
    await waitFor(() =>
      expect(screen.getByText('✓ 확인됨')).toBeInTheDocument(),
    );

    // Submit should now be enabled and callable.
    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        wsName: '샘플워크스페이스',
        bizProfile: { bizNo: '123-45-67890', taxType: 'general', status: 'active' },
      }),
    );
  });
});

// 국세청 장애로 구매사 가입이 전면 차단되던 것이 이번 수정의 본래 목적이다.
// 이 폼은 `blockedStatuses={['closed','suspended']}` 를 넘기는 유일한 소비처라,
// 저하 응답과 그 설정이 만나는 조합은 여기서만 검증된다.
describe('BuyerWorkspaceForm — 국세청 장애(저하 모드)', () => {
  async function lookupUnder(error: string) {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    mockLookupBizNo.mockResolvedValue({ ok: false, error });

    render(<BuyerWorkspaceForm onSubmit={onSubmit} submitting={false} />);
    await user.type(screen.getByPlaceholderText('(주)샘플테크'), '샘플워크스페이스');
    await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));
    return { user, onSubmit };
  }

  it.each(['NTS_UPSTREAM_DOWN', 'NTS_NETWORK', 'NTS_NO_KEY', 'NTS_INVALID_KEY', 'NTS_RATE_LIMIT'])(
    '%s 이면 오류 없이 제출 버튼이 열린다',
    async (error) => {
      await lookupUnder(error);

      await waitFor(() =>
        expect(screen.getByText('확인은 가입 심사 중에 완료돼요.')).toBeInTheDocument(),
      );
      // blockedStatuses 가 걸려 있어도 저하 응답에는 오류가 뜨지 않아야 한다.
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('✓ 확인됨')).toBeNull();
      expect(screen.getByRole('button', { name: '워크스페이스 만들기' })).toBeEnabled();
    },
  );

  it('저하 상태로 제출하면 taxType·status 없이 사업자번호만 넘긴다', async () => {
    const { user, onSubmit } = await lookupUnder('NTS_UPSTREAM_DOWN');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '워크스페이스 만들기' })).toBeEnabled(),
    );

    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));

    // 조회하지 못한 값을 지어내면 안 된다 — 서버가 재판정해 채운다.
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        wsName: '샘플워크스페이스',
        bizProfile: { bizNo: '123-45-67890', taxType: undefined, status: undefined },
      }),
    );
  });

  // 레이트리밋은 저하 대상이 아니다 — 통과시키면 버킷을 고갈시켜 검증을 우회할 수 있다.
  it('레이트리밋은 저하로 통과시키지 않고 제출을 막는다', async () => {
    await lookupUnder('NTS_LOCAL_THROTTLED');

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/요청이 너무 많아요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '워크스페이스 만들기' })).toBeDisabled();
  });
});
