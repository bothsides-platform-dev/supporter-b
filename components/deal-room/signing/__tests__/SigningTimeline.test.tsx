import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { SigningTimeline } from '../SigningTimeline';
import type { SigningNode } from '../signing-view-model';

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

  it('중립 종결(ended) 노드도 시각을 그린다', () => {
    render(
      <SigningTimeline
        nodes={[
          { key: 'terminal', kind: 'milestone', label: '취소했어요', state: 'ended', at: '2026-07-20T08:05:00Z' },
        ]}
      />,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('07-20');
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
