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

  // 활성 스텝 제목만 주 텍스트 톤이고 done·upcoming 은 한 톤으로 모인다 — 단계 상태는
  // 위쪽 도트(barCls)와 번호 색(numCls)이 지므로 제목 색은 의도적으로 같다.
  // 저대비 `outline` 을 제목에 되살리지 못하도록 못박는다 (DESIGN.md §2).
  it('활성 스텝 제목만 주 텍스트 톤이고 done·upcoming 제목은 동일한 보조 톤이다', () => {
    // page=3 → activeIndex=2 → 01·02 = done, 03 = active, 04·05 = upcoming
    render(<PgProcessStepRail steps={STEPS} page={3} />);

    const activeTitle = screen.getByText('제안 제출');
    expect(activeTitle).toHaveClass('text-[var(--md-sys-color-on-surface)]');
    expect(activeTitle).toHaveClass('font-medium');

    for (const title of ['파트너 등록', 'RFP 수신', '고객사 검토', '계약 논의']) {
      expect(screen.getByText(title), `${title} 제목은 보조 톤이어야 한다`).toHaveClass(
        'text-[var(--md-sys-color-on-surface-variant)]',
      );
      expect(
        screen.getByText(title),
        `${title} 제목에 저대비 outline 이 되살아났다`,
      ).not.toHaveClass('text-[var(--md-sys-color-outline)]');
    }
  });

  // 제목 색을 한 톤으로 묶어도 되는 근거는 "도트가 단계 상태를 구분한다" 하나뿐이다.
  // 도트 색이 사라지면 done·active·upcoming 이 화면에서 구별 불가능해지므로 함께 잠근다.
  it('단계 구분은 도트가 진다 — done·active·upcoming 도트가 서로 다른 색을 갖는다', () => {
    const { container } = render(<PgProcessStepRail steps={STEPS} page={3} />);
    const dots = [...container.querySelectorAll('ol > li')].map(
      (li) => li.querySelector('span')!.className,
    );
    // 01·02 = done, 03 = active, 04·05 = upcoming
    expect(dots[0]).toContain('opacity-50');
    expect(dots[2]).toContain('bg-[var(--md-sys-color-primary)]');
    expect(dots[2]).not.toContain('opacity-50');
    expect(dots[3]).toContain('bg-[var(--md-sys-color-outline-variant)]');
  });
});
