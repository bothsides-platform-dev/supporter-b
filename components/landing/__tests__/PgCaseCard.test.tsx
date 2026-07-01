import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PgCaseCard } from '../PgCaseCard';

describe('PgCaseCard — 파트너 사례 카드', () => {
  it('지표·캡션·인용·역할을 모두 렌더한다', () => {
    render(
      <PgCaseCard
        metric="300%"
        metricCaption="리드 검증·획득 단가 절감"
        quote="좋은 리드를 확보할 수 있었습니다."
        role="K사 영업 팀장"
      />,
    );
    expect(screen.getByTestId('case-metric')).toHaveTextContent('300%');
    expect(screen.getByText('리드 검증·획득 단가 절감')).toBeInTheDocument();
    expect(screen.getByText(/좋은 리드를 확보할 수 있었습니다/)).toBeInTheDocument();
    expect(screen.getByText('K사 영업 팀장')).toBeInTheDocument();
  });

  it('모든 카드가 일관되게 숫자 지표를 강조한다', () => {
    render(
      <PgCaseCard
        metric="200%"
        metricCaption="중소형 PG사 신규 영업 기회 확대"
        quote="저희도 기회를 얻었어요."
        role="S사 영업 본부장"
      />,
    );
    expect(screen.getByTestId('case-metric')).toHaveTextContent('200%');
    expect(screen.getByText('중소형 PG사 신규 영업 기회 확대')).toBeInTheDocument();
  });
});
