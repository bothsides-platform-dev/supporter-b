import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { ContractTemplatesPageSkeleton } from '../ContractTemplatesPageSkeleton';

afterEach(cleanup);

// 순수 표시용 셸이라 깊은 단언은 두지 않는다 — 렌더가 죽지 않고, 실제 목록과 같은
// 뼈대(헤더 스트립 + 행 3개)를 갖는지만 스모크로 고정한다.
describe('ContractTemplatesPageSkeleton', () => {
  it('renders a header strip and three pulsing list rows', () => {
    const { container } = render(<ContractTemplatesPageSkeleton />);

    expect(container.querySelectorAll('[data-testid="skeleton-row"]')).toHaveLength(3);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });
});
