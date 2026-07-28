import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

import { SigningTimeline } from '../SigningTimeline';
import type { SigningNode } from '../signing-view-model';
import { formatDateTime } from '@/lib/utils/format';

afterEach(cleanup);

const nodes: SigningNode[] = [
  { key: 'sent', kind: 'milestone', label: '서명 요청을 보냈어요', state: 'done', at: '2026-07-20T05:02:00Z' },
  {
    key: 'p1',
    kind: 'person',
    label: '김구매',
    detail: '구매사',
    sub: 'buyer@x.com · 휴대폰 간편인증',
    state: 'done',
    chip: { color: 'tertiary', label: '서명 완료' },
    at: '2026-07-20T06:10:00Z',
    initial: '김',
  },
  {
    key: 'p2',
    kind: 'person',
    label: '이대행',
    detail: 'PG',
    sub: 'pg@x.com · 이메일 인증',
    state: 'pending',
    chip: { color: 'surface', label: '서명 대기' },
    initial: '이',
  },
  { key: 'done', kind: 'milestone', label: '계약 완료', state: 'pending' },
];

describe('SigningTimeline', () => {
  it('노드를 순서대로 그리고 사람 노드에 이니셜·역할·칩을 붙인다', () => {
    render(<SigningTimeline nodes={nodes} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('서명 요청을 보냈어요');
    expect(items[1]).toHaveTextContent('김구매');
    expect(items[1]).toHaveTextContent('구매사');
    expect(items[1]).toHaveTextContent('서명 완료');
    expect(screen.getByText('김')).toBeInTheDocument();
    expect(items[3]).toHaveTextContent('계약 완료');
  });

  it('중립 종결(ended) 노드도 시각을 그린다', async () => {
    // LocalTime 은 mount 후 테스트 프로세스의 실제 timezone 으로 포맷을 다시 계산한다
    // (하이드레이션 안전을 위해 첫 렌더는 Asia/Seoul 고정). UTC-9 이서보다 서쪽에서
    // 실행되면 날짜가 하루 밀릴 수 있어, 하드코딩 대신 시스템 timezone 기준으로 기대값을 계산한다.
    const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const expected = formatDateTime('2026-07-20T08:05:00Z', systemTz, 'MM-dd HH:mm');
    render(
      <SigningTimeline
        nodes={[
          { key: 'terminal', kind: 'milestone', label: '취소했어요', state: 'ended', at: '2026-07-20T08:05:00Z' },
        ]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole('listitem')).toHaveTextContent(expected);
    });
  });

  it('마일스톤 노드의 상태를 스크린리더용 텍스트로 노출한다', () => {
    // 마일스톤은 aria-hidden 인 점 하나로만 그려져 색·모양이 유일한 상태 신호였다.
    // 사람 노드의 Chip 과 달리 읽히는 상태어가 없어 완료/대기 구분이 불가능했다.
    render(
      <SigningTimeline
        nodes={[
          { key: 'sent', kind: 'milestone', label: '서명 요청을 보냈어요', state: 'done' },
          { key: 'prepare', kind: 'milestone', label: '계약서 준비', state: 'active' },
          { key: 'sign', kind: 'milestone', label: '양측 서명', state: 'pending' },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('완료');
    expect(items[1]).toHaveTextContent('진행 중');
    expect(items[2]).toHaveTextContent('대기');
  });

  it('상태어는 시각적으로 숨긴다 — 점의 색이 계속 유일한 시각 신호다', () => {
    render(
      <SigningTimeline
        nodes={[{ key: 'sent', kind: 'milestone', label: '서명 요청을 보냈어요', state: 'done' }]}
      />,
    );
    expect(screen.getByText('완료')).toHaveClass('sr-only');
  });

  it('사람 노드는 칩이 상태를 읽어주므로 상태어를 중복해 넣지 않는다', () => {
    render(
      <SigningTimeline
        nodes={[
          {
            key: 'p1',
            kind: 'person',
            label: '김구매',
            detail: '구매사',
            state: 'done',
            chip: { color: 'tertiary', label: '서명 완료' },
            initial: '김',
          },
        ]}
      />,
    );
    expect(screen.getByText('서명 완료')).toBeInTheDocument();
    expect(screen.queryByText('완료')).not.toBeInTheDocument();
  });

  it('마일스톤의 설명(detail)도 노출한다', () => {
    render(
      <SigningTimeline
        nodes={[
          { key: 'prepare', kind: 'milestone', label: '계약서 준비', detail: 'PG사가 계약서를 등록하는 단계예요', state: 'active' },
        ]}
      />,
    );
    expect(screen.getByText('PG사가 계약서를 등록하는 단계예요')).toBeInTheDocument();
  });
});
