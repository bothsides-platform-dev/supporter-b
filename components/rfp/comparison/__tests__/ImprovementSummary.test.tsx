import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ImprovementSummary } from '../ImprovementSummary';
import type { Bid } from '@/lib/types/bid';

function makeBid(over: Partial<Bid> = {}): Bid {
  return {
    id: 'b1',
    rfpId: 'r1',
    pgWsId: 'pg1',
    invitationId: 'i1',
    settleCycle: 'D+1',
    settleLimit: 700_000_000,
    guaranteeInsurance: 1_000_000,
    signupFee: 0,
    paymentFees: { card: 0.022 },
    customFees: {},
    proposalPdfs: [],
    status: 'submitted',
    submittedBy: 'u1',
    round: 1,
    ...over,
  };
}

const fullCurrent = {
  feeRate: '2.8%',
  settlementCycle: 'D+3',
  settlementLimit: '5억',
  guaranteeInsurance: '1,200,000원',
};

afterEach(cleanup);

describe('ImprovementSummary', () => {
  it('shows 현재 → 제안 with an improvement badge for every metric when all current conditions are present', () => {
    render(<ImprovementSummary bid={makeBid()} current={fullCurrent} />);

    const card = within(screen.getByTestId('metric-row-card'));
    expect(card.getByText('2.8%')).toBeInTheDocument(); // current
    expect(card.getByText('2.20%')).toBeInTheDocument(); // proposed
    expect(card.getByText(/0\.60%p/)).toBeInTheDocument(); // improvement badge

    const limit = within(screen.getByTestId('metric-row-limit'));
    expect(limit.getByText('5억')).toBeInTheDocument();
    expect(limit.getByText('700,000,000원')).toBeInTheDocument();
  });

  it('shows an upward (↑) error badge when the proposed card fee is HIGHER than current (worse)', () => {
    // current 2.8% → proposed 3.2% : 수수료가 0.40%p 올라 더 나쁨
    render(<ImprovementSummary bid={makeBid({ paymentFees: { card: 0.032 } })} current={fullCurrent} />);

    const card = within(screen.getByTestId('metric-row-card'));
    const badge = card.getByText(/0\.40%p/);
    // 수수료가 올랐으니 화살표는 ↑ (↓ 아님)
    expect(badge.textContent).toContain('↑');
    expect(badge.textContent).not.toContain('↓');
    // 나빠졌으니 error 색상
    expect(badge.className).toContain('--md-sys-color-error');
  });

  it('keeps the "좋아져요" header when every comparable metric improves', () => {
    render(<ImprovementSummary bid={makeBid()} current={fullCurrent} />);
    expect(screen.getByText('지금 조건보다 이만큼 좋아져요')).toBeInTheDocument();
  });

  it('uses a neutral comparison header (not "좋아져요") when any metric gets worse', () => {
    // 카드 수수료가 현재(2.8%)보다 높은 3.2% → 한 지표라도 나빠지면 "좋아져요" 단정 금지
    render(<ImprovementSummary bid={makeBid({ paymentFees: { card: 0.032 } })} current={fullCurrent} />);
    expect(screen.queryByText('지금 조건보다 이만큼 좋아져요')).not.toBeInTheDocument();
    expect(screen.getByText('지금 조건과 비교하면 이렇게 달라져요')).toBeInTheDocument();
  });

  it('renders a qualitative cycle improvement ("더 빠름") rather than a numeric badge', () => {
    render(<ImprovementSummary bid={makeBid({ settleCycle: 'D+1' })} current={fullCurrent} />);
    const cycle = within(screen.getByTestId('metric-row-cycle'));
    expect(cycle.getByText('더 빠름')).toBeInTheDocument();
  });

  it('shows proposed-only for metrics whose current condition is missing (partial input)', () => {
    render(<ImprovementSummary bid={makeBid()} current={{ feeRate: '2.8%' }} />);

    // card has current → baseline visible
    const card = within(screen.getByTestId('metric-row-card'));
    expect(card.getByText('2.8%')).toBeInTheDocument();

    // limit has no current → proposed only, no baseline arrow
    const limit = within(screen.getByTestId('metric-row-limit'));
    expect(limit.getByText('700,000,000원')).toBeInTheDocument();
    expect(limit.queryByTestId('metric-arrow')).not.toBeInTheDocument();
  });

  it('omits the improvement badge when the current value is not parseable (병기만)', () => {
    render(
      <ImprovementSummary bid={makeBid()} current={{ feeRate: '협의 가능' }} />,
    );
    const card = within(screen.getByTestId('metric-row-card'));
    expect(card.getByText('협의 가능')).toBeInTheDocument();
    expect(card.getByText('2.20%')).toBeInTheDocument();
    expect(card.queryByText(/%p/)).not.toBeInTheDocument();
  });

  it('숫자만 저장된 신규 현재값을 표기형식으로 보여주면서 개선폭은 그대로 계산한다', () => {
    render(
      <ImprovementSummary
        bid={makeBid()}
        current={{ feeRate: '2.8', settlementLimit: '500000000', guaranteeInsurance: '1200000' }}
      />,
    );
    const card = within(screen.getByTestId('metric-row-card'));
    expect(card.getByText('2.8%')).toBeInTheDocument(); // 표기: 숫자 → %
    expect(card.getByText(/0\.60%p/)).toBeInTheDocument(); // 개선폭은 그대로

    const limit = within(screen.getByTestId('metric-row-limit'));
    expect(limit.getByText('5억원')).toBeInTheDocument(); // 표기: 한국어 금액
    expect(limit.getByText('700,000,000원')).toBeInTheDocument(); // 제안값
  });

  it('degrades to a "핵심 수치" summary with guidance when no current conditions are given', () => {
    render(<ImprovementSummary bid={makeBid()} current={{}} />);
    expect(screen.getByText(/현재 조건을 입력하면/)).toBeInTheDocument();
    // proposed values still shown
    expect(screen.getByText('2.20%')).toBeInTheDocument();
    expect(screen.getByText('700,000,000원')).toBeInTheDocument();
    // no improvement badges
    expect(screen.queryByText(/%p/)).not.toBeInTheDocument();
  });

  it('renders bid.signupFee as a plain, non-ranked info row (label + value only)', () => {
    render(<ImprovementSummary bid={makeBid({ signupFee: 550_000 })} current={fullCurrent} />);
    const signup = within(screen.getByTestId('metric-row-signup'));
    expect(signup.getByText('가입비')).toBeInTheDocument();
    expect(signup.getByText('550,000원')).toBeInTheDocument();
  });

  it('does not show a comparison arrow or delta badge on the signup fee row', () => {
    render(<ImprovementSummary bid={makeBid({ signupFee: 550_000 })} current={fullCurrent} />);
    const signup = within(screen.getByTestId('metric-row-signup'));
    expect(signup.queryByTestId('metric-arrow')).not.toBeInTheDocument();
    expect(signup.queryByText(/↓/)).not.toBeInTheDocument();
    expect(signup.queryByText(/↑/)).not.toBeInTheDocument();
  });

  it('does not let a large signupFee affect the "좋아져요" heading verdict', () => {
    // 다른 모든 비교 지표는 개선되고, signupFee 만 크게(990,000) 잡아도 헤딩은 그대로 "좋아져요" 여야 한다.
    render(
      <ImprovementSummary bid={makeBid({ signupFee: 990_000 })} current={fullCurrent} />,
    );
    expect(screen.getByText('지금 조건보다 이만큼 좋아져요')).toBeInTheDocument();
  });

  // 가입비는 나머지 네 지표와 성격이 다르다: 구매사가 "현재 가입비"를 입력하는 곳이
  // 없어(CurrentTermsV1 에 키 자체가 없다) 비교 기준선이 존재하지 않고, 1회성이라
  // 반복 비용인 수수료와 같은 축에 놓을 수도 없다. 그래서 배지도 헤딩 판정도 못 붙는다.
  // 아래 두 테스트는 그 사실을 화면에서 정직하게 알리는 방식을 고정한다.
  it('reads ₩0 signup fee as 없어요 rather than a bare 0원', () => {
    // ₩0 은 구매사에게 잡음이 아니라 강점이다 — 금액 0 이 아니라 부재로 읽혀야 한다.
    render(<ImprovementSummary bid={makeBid({ signupFee: 0 })} current={fullCurrent} />);
    const signup = within(screen.getByTestId('metric-row-signup'));

    expect(signup.getByText('없어요')).toBeInTheDocument();
    expect(signup.queryByText('0원')).not.toBeInTheDocument();
  });

  it('drops the numeric type treatment when the signup fee row reads 없어요', () => {
    // .md-numeric 은 mono + tabular-nums 라 한글에 얹으면 안 된다(DESIGN.md 하드룰:
    // 숫자에만, 라벨에는 절대). 금액일 때는 그대로 유지되는지도 함께 고정한다.
    const { rerender } = render(
      <ImprovementSummary bid={makeBid({ signupFee: 0 })} current={fullCurrent} />,
    );
    expect(within(screen.getByTestId('metric-row-signup')).getByText('없어요')).not.toHaveClass(
      'md-numeric',
    );

    rerender(<ImprovementSummary bid={makeBid({ signupFee: 550_000 })} current={fullCurrent} />);
    expect(within(screen.getByTestId('metric-row-signup')).getByText('550,000원')).toHaveClass(
      'md-numeric',
    );
  });

  it('says outright that the signup fee sits outside the headline verdict', () => {
    // 헤딩("좋아져요")은 반복 지표 네 개로만 판정한다. 가입비가 그 판정 밖이라는 사실을
    // 행 자체가 알리지 않으면, 고액 가입비가 붙은 견적도 무조건 "좋아져요" 로만 읽힌다.
    // 캐비앗은 성격('1회성')만 말해선 부족하다 — 판정에서 빠졌다는 것까지 말해야 한다.
    render(<ImprovementSummary bid={makeBid({ signupFee: 550_000 })} current={fullCurrent} />);
    expect(
      within(screen.getByTestId('metric-row-signup')).getByText(/위 비교에 넣지 않았어요/),
    ).toBeInTheDocument();
  });

  it('keeps the caveat on the row even when there is no signup fee', () => {
    // 캐비앗이 금액 유무에 따라 나타났다 사라지면 "가입비가 있을 때만 예외" 로 오독된다.
    // 이 행은 금액과 무관하게 판정 밖이므로 캐비앗도 상시 붙는다.
    render(<ImprovementSummary bid={makeBid({ signupFee: 0 })} current={fullCurrent} />);
    expect(
      within(screen.getByTestId('metric-row-signup')).getByText(/위 비교에 넣지 않았어요/),
    ).toBeInTheDocument();
  });

  it('leaves the improvement column empty on the signup row', () => {
    // 마지막 열은 개선폭 전용이다 — 위 네 행이 전부 비교 판정(↓0.60%p·더 빠름)을 싣는다.
    // 거기에 분류 문구를 끼우면 세로로 훑을 때 다섯 번째도 판정으로 읽혀(=가입비가
    // '1회성 비용'만큼 좋아졌다) 열의 의미가 무너진다. 캐비앗은 라벨 밑으로 간다.
    render(<ImprovementSummary bid={makeBid({ signupFee: 550_000 })} current={fullCurrent} />);
    const row = screen.getByTestId('metric-row-signup');
    expect(row.lastElementChild?.textContent).toBe('');
  });
});
