// Regression: ISSUE-005 — 사업자번호가 화면마다 하이픈 없이(1248100998) 표시됐다
// Found by /qa on 2026-09-23
// Report: .gstack/qa-reports/qa-report-lvh-me-2026-09-23.md
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

describe('WorkspaceBizNoForm — 사업자번호 표기', () => {
  it('등록된 숫자 10자리를 하이픈으로 끊어 보여준다', () => {
    render(<WorkspaceBizNoForm currentBizNo="1248100998" canEdit={false} />);
    expect(screen.getByText('124-81-00998')).toBeInTheDocument();
  });
});
