// Regression: ISSUE-005 — 사업자번호가 화면마다 하이픈 없이(1248100998) 표시됐다
// Found by /qa on 2026-09-23
// Report: .gstack/qa-reports/qa-report-lvh-me-2026-09-23.md
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RfpStep1BizProfile } from '../RfpStep1BizProfile';

afterEach(cleanup);

describe('RfpStep1BizProfile — 사업자번호 표기', () => {
  it('저장된 숫자 10자리를 하이픈으로 끊어 보여준다', () => {
    render(
      <RfpStep1BizProfile
        bizProfile={{ bizNo: '1248100998', taxType: 'general', status: 'active' }}
        workspaceName="QA상사"
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText('124-81-00998')).toBeInTheDocument();
  });
});
