import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// motion 평탄화 + AnimatePresence 는 자식 그대로 렌더(크로스페이드 연출은 시각용, 콘텐츠만 검증).
vi.mock('motion/react', () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(
        tag,
        Object.fromEntries(
          Object.entries(props).filter(
            ([k]) =>
              !['initial', 'animate', 'exit', 'transition', 'whileInView', 'viewport'].includes(k),
          ),
        ),
        children as React.ReactNode,
      );
    El.displayName = `motion.${tag}`;
    return El;
  };
  return {
    motion: new Proxy({}, { get: (_, tag: string) => makeEl(tag) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { PgProcessStepRail } from '../PgProcessStepRail';

const STEPS = [
  { n: '01', title: '파트너 등록', body: '등록 본문', note: '등록 보조' },
  { n: '02', title: 'RFP 수신', body: '수신 본문', note: '수신 보조' },
  { n: '03', title: '제안 제출', body: '제출 본문', note: '제출 보조' },
  { n: '04', title: '고객사 검토', body: '검토 본문', note: '검토 보조' },
  { n: '05', title: '계약 논의', body: '논의 본문', note: '논의 보조' },
];

describe('PgProcessStepRail — 데모 페이지 싱크 스테퍼', () => {
  it('5개 스텝 제목을 모두 스테퍼 노드로 렌더한다', () => {
    render(<PgProcessStepRail steps={STEPS} page={1} />);
    for (const s of STEPS) {
      expect(screen.getByText(s.title)).toBeInTheDocument();
    }
  });

  it('현재 페이지 노드에 aria-current="step"을 주고 그 스텝 제목을 담는다 (딜룸=3 → 제안 제출)', () => {
    const { container } = render(<PgProcessStepRail steps={STEPS} page={3} />);
    const current = container.querySelector('[aria-current="step"]');
    expect(current).not.toBeNull();
    expect(current).toHaveTextContent('제안 제출');
  });

  it('상세 카드는 현재 스텝의 본문만 보여준다 (홈=1 → 파트너 등록 본문)', () => {
    render(<PgProcessStepRail steps={STEPS} page={1} />);
    expect(screen.getByText('등록 본문')).toBeInTheDocument();
    expect(screen.queryByText('수신 본문')).toBeNull();
    expect(screen.queryByText('논의 본문')).toBeNull();
  });

  it('메시지=4 → 계약 논의 본문을 상세 카드로 보여준다 (④ 고객사 검토 건너뜀)', () => {
    render(<PgProcessStepRail steps={STEPS} page={4} />);
    expect(screen.getByText('논의 본문')).toBeInTheDocument();
    expect(screen.queryByText('검토 본문')).toBeNull();
  });
});
