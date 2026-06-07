import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LocalTime, LocalDate } from '../LocalTime';
import { formatDateTime } from '@/lib/format';

describe('LocalTime', () => {
  it('명시적 timezone으로 렌더링된다 (Asia/Seoul)', async () => {
    // 2026-06-01T05:30:00Z = 2026-06-01 14:30 KST
    render(<LocalTime iso="2026-06-01T05:30:00Z" timeZone="Asia/Seoul" />);
    await waitFor(() => {
      expect(screen.getByText('2026-06-01 14:30')).toBeInTheDocument();
    });
  });

  it('명시적 timezone으로 렌더링된다 (UTC)', async () => {
    render(<LocalTime iso="2026-06-01T05:30:00Z" timeZone="UTC" />);
    await waitFor(() => {
      expect(screen.getByText('2026-06-01 05:30')).toBeInTheDocument();
    });
  });

  it('format prop으로 포맷을 커스터마이즈할 수 있다', async () => {
    render(<LocalTime iso="2026-06-01T05:30:00Z" timeZone="UTC" format="yyyy. MM. dd." />);
    await waitFor(() => {
      expect(screen.getByText('2026. 06. 01.')).toBeInTheDocument();
    });
  });

  it('timeZone prop 없으면 브라우저 timezone으로 렌더링된다', async () => {
    const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const expected = formatDateTime('2026-06-01T05:30:00Z', systemTz);
    render(<LocalTime iso="2026-06-01T05:30:00Z" />);
    await waitFor(() => {
      expect(screen.getByText(expected)).toBeInTheDocument();
    });
  });
});

describe('LocalDate', () => {
  it('날짜만 KST 기준으로 렌더링된다', async () => {
    // 2026-06-30T15:30:00Z = 2026-07-01 00:30 KST
    render(<LocalDate iso="2026-06-30T15:30:00Z" timeZone="Asia/Seoul" />);
    await waitFor(() => {
      expect(screen.getByText('2026. 07. 01.')).toBeInTheDocument();
    });
  });

  it('UTC timezone에서 날짜 추출이 올바르다', async () => {
    render(<LocalDate iso="2026-06-30T15:30:00Z" timeZone="UTC" />);
    await waitFor(() => {
      expect(screen.getByText('2026. 06. 30.')).toBeInTheDocument();
    });
  });
});
