// Coverage: ISSUE-005 — 10자리가 아닌 레거시 값은 지어낸 모양으로 바꾸지 않고 그대로 보여준다
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/server/actions/rfp', () => ({
  lookupBizNoAction: vi.fn(),
  updateWorkspaceBizProfileAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { WorkspaceBizNoForm } from '../WorkspaceBizNoForm';

afterEach(cleanup);

describe('WorkspaceBizNoForm — 비정형 사업자번호', () => {
  it('10자리가 아닌 값은 원본 그대로 표시한다', () => {
    render(<WorkspaceBizNoForm currentBizNo="12345" canEdit={false} />);
    expect(screen.getByText('12345')).toBeInTheDocument();
  });
});
