// Coverage: ISSUE-002 — 복원된 입력으로 바로 제출할 수 있고, 조회 결과를 초기화하면 제출이 다시 막힌다
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/components/rfp/nts-lookup', () => ({ ntsLookup: vi.fn() }));

import { BuyerWorkspaceForm } from '../BuyerWorkspaceForm';

afterEach(cleanup);

const initialValue = {
  wsName: '복원상사',
  bizProfile: { bizNo: '124-81-00998', taxType: 'general' as const, status: 'active' as const, verified: true },
};

describe('BuyerWorkspaceForm — initialValue 복원', () => {
  it('복원된 값 그대로 제출한다(verified 는 페이로드에 싣지 않는다)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<BuyerWorkspaceForm onSubmit={onSubmit} submitting={false} initialValue={initialValue} />);

    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));
    expect(onSubmit).toHaveBeenCalledWith({
      wsName: '복원상사',
      bizProfile: { bizNo: '124-81-00998', taxType: 'general', status: 'active' },
    });
  });

  it('복원된 조회 결과를 초기화하면 제출 버튼이 비활성화된다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<BuyerWorkspaceForm onSubmit={onSubmit} submitting={false} initialValue={initialValue} />);

    await user.click(screen.getByRole('button', { name: '초기화' }));
    const submit = screen.getByRole('button', { name: '워크스페이스 만들기' });
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('(주)샘플테크')).toHaveValue('복원상사');
  });

  it('initialValue 가 없으면 빈 폼으로 시작한다', () => {
    render(<BuyerWorkspaceForm onSubmit={vi.fn()} submitting={false} />);
    expect(screen.getByPlaceholderText('(주)샘플테크')).toHaveValue('');
    expect(screen.getByLabelText('사업자 등록번호')).toHaveValue('');
    expect(screen.getByRole('button', { name: '워크스페이스 만들기' })).toBeDisabled();
  });
});
