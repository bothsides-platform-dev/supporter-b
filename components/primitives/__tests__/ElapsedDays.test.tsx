// 경과일 표시 — 마운트 후에만 그린다.
//
// SSR 에서 그리면 렌더와 하이드레이션 사이에 KST 자정을 넘을 때 값이 갈려 불일치가
// 난다. `LocalTime` 은 SSR 에서 KST 로 그린 뒤 마운트 후 타임존만 보정하면 되지만,
// 이쪽은 **기준 시각 자체**가 달라 보정할 초깃값이 없다.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ElapsedDays } from '../ElapsedDays';

afterEach(() => {
  vi.useRealTimers();
});

describe('ElapsedDays', () => {
  it('마운트 후 KST 달력일 경과를 그린다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T03:00:00Z'));
    render(<ElapsedDays since="2026-01-02T03:00:00Z" />);
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText(/보낸 지/)).toBeInTheDocument();
    expect(screen.getByText(/일째/)).toBeInTheDocument();
  });

  it('숫자는 md-numeric 으로 — 표기 규칙(mono·tabular-nums)이 적용돼야 한다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-03T03:00:00Z'));
    render(<ElapsedDays since="2026-01-01T03:00:00Z" />);
    expect(screen.getByText('2')).toHaveClass('md-numeric');
  });

  it('접두어를 바꿀 수 있다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:00:00Z'));
    render(<ElapsedDays since="2026-01-01T03:00:00Z" prefix="올린 지" />);
    expect(screen.getByText(/올린 지/)).toBeInTheDocument();
  });

  // 하이드레이션 안전성의 실제 근거 — 서버 마크업이 비어야 클라이언트와 어긋날 수 없다.
  it('서버 렌더에서는 아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<ElapsedDays since="2026-01-01T03:00:00Z" />)).toBe('');
  });
});
