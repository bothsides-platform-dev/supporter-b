// 가입으로 저장된 사업자번호는 숫자만(1248100998)이고 조회 결과는 하이픈 형식(124-81-00998)이다.
// 문자열을 그대로 비교하면 같은 번호를 다시 조회해도 "동일" 안내가 뜨지 않고 저장이 열린다 —
// 화면에는 두 값이 똑같이 124-81-00998 로 보여서 더 헷갈린다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
const lookupBizNoAction = vi.fn();
vi.mock('@/lib/server/actions/rfp', () => ({
  lookupBizNoAction: (bizNo: string) => lookupBizNoAction(bizNo),
  updateWorkspaceBizProfileAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { WorkspaceBizNoForm } from '../WorkspaceBizNoForm';

afterEach(cleanup);

describe('WorkspaceBizNoForm — 저장값과 같은 번호 재조회', () => {
  it('숫자만 저장된 번호를 하이픈 형식으로 다시 조회하면 동일 안내를 띄우고 저장을 막는다', async () => {
    const user = userEvent.setup();
    lookupBizNoAction.mockResolvedValue({ ok: true, valid: true, taxType: 'general', status: 'active' });

    render(<WorkspaceBizNoForm currentBizNo="1248100998" canEdit />);
    await user.click(screen.getByRole('button', { name: '수정' }));
    await user.type(screen.getByLabelText('사업자 등록번호'), '1248100998');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() => expect(screen.getByText('현재 사업자번호와 동일합니다.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '변경 적용' })).toBeDisabled();
  });
});
