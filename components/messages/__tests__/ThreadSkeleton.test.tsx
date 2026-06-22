import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ThreadSkeleton } from '../ThreadSkeleton';

afterEach(cleanup);

describe('ThreadSkeleton', () => {
  it('메시지 모양을 포함한 펄스 스켈레톤 자리표시를 5개 이상 렌더한다', () => {
    const { container } = render(<ThreadSkeleton />);
    // 현재(3개: 헤더 아바타·이름·입력칸)보다 강화 — 헤더 2 + 메시지 3 + 입력 1 = 6.
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(5);
  });
});
