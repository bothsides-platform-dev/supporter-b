import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BuyerWorkspaceForm } from '../BuyerWorkspaceForm';

describe('BuyerWorkspaceForm — 체크섬 검증만 사용', () => {
  it('체크섬 유효 번호(삼성전자 124-81-00998)는 NTS 호출 없이 확인됨이 표시된다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<BuyerWorkspaceForm onSubmit={onSubmit} submitting={false} />);

    await user.type(screen.getByPlaceholderText('(주)샘플테크'), '샘플워크스페이스');
    await user.type(screen.getByLabelText('사업자 등록번호'), '1248100998');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(screen.getByText('✓ 확인됨')).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        wsName: '샘플워크스페이스',
        bizProfile: { bizNo: '124-81-00998' },
      }),
    );
  });

  it('체크섬 유효 번호(123-12-31231)도 확인됨이 표시된다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<BuyerWorkspaceForm onSubmit={onSubmit} submitting={false} />);

    await user.type(screen.getByPlaceholderText('(주)샘플테크'), '테스트회사');
    await user.type(screen.getByLabelText('사업자 등록번호'), '1231231231');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(screen.getByText('✓ 확인됨')).toBeInTheDocument(),
    );
  });

  it('체크섬이 틀린 번호는 에러를 표시하고 제출이 비활성화된다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<BuyerWorkspaceForm onSubmit={onSubmit} submitting={false} />);

    await user.type(screen.getByPlaceholderText('(주)샘플테크'), '샘플워크스페이스');
    // 1234567890 → 체크섬 실패 (check=1, d[9]=0)
    await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(screen.queryByText('✓ 확인됨')).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('bizProfile에 taxType·status 없이 bizNo만 전달된다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<BuyerWorkspaceForm onSubmit={onSubmit} submitting={false} />);

    await user.type(screen.getByPlaceholderText('(주)샘플테크'), '네이버');
    // 네이버 220-81-04521
    await user.type(screen.getByLabelText('사업자 등록번호'), '2208104521');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() => expect(screen.getByText('✓ 확인됨')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        wsName: '네이버',
        bizProfile: { bizNo: '220-81-04521' },
      }),
    );
  });
});
