// 가입 2단계 복원은 조회 결과를 다시 확인하지 않는다. 폐업·휴업 번호는 조회로는 draft 에
// 들어가지 않지만 sessionStorage 는 손댈 수 있으므로, 그런 값이 복원되면 제출이 열리면 안 된다
// (서버가 결국 거절하지만 사용자는 휴대폰 인증까지 마친 3단계에서야 알게 된다).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/components/rfp/nts-lookup', () => ({ ntsLookup: vi.fn() }));

import { BuyerWorkspaceForm } from '../BuyerWorkspaceForm';

afterEach(cleanup);

describe('BuyerWorkspaceForm — 차단 상태 복원', () => {
  it.each(['closed', 'suspended'] as const)('%s 상태 조회 결과는 복원하지 않는다', (status) => {
    render(
      <BuyerWorkspaceForm
        onSubmit={vi.fn()}
        submitting={false}
        initialValue={{
          wsName: '폐업상사',
          bizProfile: { bizNo: '124-81-00998', taxType: 'general', status, verified: true },
        }}
      />,
    );

    expect(screen.getByLabelText('사업자 등록번호')).toHaveValue('');
    expect(screen.getByRole('button', { name: '워크스페이스 만들기' })).toBeDisabled();
  });
});
