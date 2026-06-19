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
  it('keeps submit disabled and shows error when NTS returns closed status', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    mockLookupBizNo.mockResolvedValue({ ok: true, valid: true, taxType: 'general', status: 'closed' });

    render(
      <BuyerWorkspaceForm onSubmit={onSubmit} submitting={false} />,
    );

    await user.type(screen.getByPlaceholderText('(주)샘플테크'), '샘플워크스페이스');
    await user.type(screen.getByLabelText('사업자 등록번호'), '9999999999');
    await user.click(screen.getByRole('button', { name: '조회' }));

    // 패널은 보여야 한다.
    await waitFor(() =>
      expect(screen.getByText('✓ 확인됨')).toBeInTheDocument(),
    );

    // 오류 메시지가 있어야 한다.
    expect(screen.getByRole('alert').textContent).toMatch(/가입할 수 없어요/);

    // "워크스페이스 만들기" 버튼은 비활성화 상태여야 한다.
    expect(screen.getByRole('button', { name: '워크스페이스 만들기' })).toBeDisabled();

    // onSubmit이 호출되면 안 된다.
    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps submit disabled and shows error when NTS returns suspended status', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    mockLookupBizNo.mockResolvedValue({ ok: true, valid: true, taxType: 'general', status: 'suspended' });

    render(
      <BuyerWorkspaceForm onSubmit={onSubmit} submitting={false} />,
    );

    await user.type(screen.getByPlaceholderText('(주)샘플테크'), '샘플워크스페이스');
    await user.type(screen.getByLabelText('사업자 등록번호'), '8888888888');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(screen.getByText('✓ 확인됨')).toBeInTheDocument(),
    );

    expect(screen.getByRole('alert').textContent).toMatch(/가입할 수 없어요/);
    expect(screen.getByRole('button', { name: '워크스페이스 만들기' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
