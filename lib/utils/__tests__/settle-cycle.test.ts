import { describe, expect, it } from 'vitest';
import {
  compareSettleCycle,
  formatSettleCycle,
  isSettleLimitAmountValid,
  SETTLE_CYCLE_RE,
  SETTLE_LIMIT_MIN,
} from '../settle-cycle';

describe('SETTLE_CYCLE_RE (canonical D+N format)', () => {
  const ok = (s: string) => SETTLE_CYCLE_RE.test(s);

  it('accepts D/W/M with any positive offset — no upper bound (matches the wizard gate of cycleNum > 0)', () => {
    expect(ok('D+1')).toBe(true);
    expect(ok('W+2')).toBe(true);
    expect(ok('M+99')).toBe(true);
    expect(ok('D+999')).toBe(true);
    expect(ok('D+1000')).toBe(true);
    expect(ok('D+99999')).toBe(true);
  });

  it('rejects a zero or leading-zero offset', () => {
    expect(ok('D+0')).toBe(false);
    expect(ok('D+01')).toBe(false);
  });

  it('rejects an unknown unit', () => {
    expect(ok('X+1')).toBe(false);
    expect(ok('d+1')).toBe(false);
  });

  it('rejects malformed or free-text values', () => {
    expect(ok('')).toBe(false);
    expect(ok('D')).toBe(false);
    expect(ok('D+')).toBe(false);
    expect(ok('협의')).toBe(false);
    expect(ok(' D+1')).toBe(false);
    expect(ok('D+1 ')).toBe(false);
  });
});

// 정산한도 하한의 단일 출처. 세 소비처(submitBidAction·saveQuoteTemplateAction 의
// zod `.gt(SETTLE_LIMIT_MIN)`, 위저드 게이트 isSettleLimitValid)가 전부 이 모듈을
// 읽으므로, 판정이 갈리는 유일한 길은 이 함수/상수가 바뀌는 것이다.
describe('isSettleLimitAmountValid (SETTLE_LIMIT_MIN 하한)', () => {
  // 하한은 **배타적**이다 — 0 은 '한도 없음'이 아니라 '한도 0원'으로 읽힌다.
  it('하한값 자체(0)는 무효 — 경계는 배타적이다', () => {
    expect(SETTLE_LIMIT_MIN).toBe(0);
    expect(isSettleLimitAmountValid(SETTLE_LIMIT_MIN)).toBe(false);
  });

  it('음수는 무효', () => {
    expect(isSettleLimitAmountValid(-1)).toBe(false);
    expect(isSettleLimitAmountValid(-50_000_000)).toBe(false);
  });

  it('0 초과는 유효 — 1원짜리 경계 바로 위도 통과한다', () => {
    expect(isSettleLimitAmountValid(1)).toBe(true);
    expect(isSettleLimitAmountValid(50_000_000)).toBe(true);
  });

  it('소수 금액도 부호만 보고 판정한다 (반올림은 이 함수의 몫이 아니다)', () => {
    expect(isSettleLimitAmountValid(0.5)).toBe(true);
    expect(isSettleLimitAmountValid(-0.5)).toBe(false);
  });

  // 이 함수는 `parseFloat` 결과를 그대로 먹는다(isSettleLimitValid). 비수치 입력은
  // NaN 으로 도착하고, NaN 은 어떤 비교에도 false 라 부등호만으로도 걸러진다 —
  // 그래도 못박아 둔다. `Number.isFinite` 가드가 지는 축은 아래 Infinity 다.
  it('NaN 은 무효', () => {
    expect(isSettleLimitAmountValid(NaN)).toBe(false);
  });

  // 여기가 `Number.isFinite` 가드가 유일하게 무는 지점이다. 부등호만 남기면
  // (`amount > SETTLE_LIMIT_MIN`) Infinity 가 통과해, 위저드가 'Infinity' 를
  // 유효 금액으로 받아들이고 서버 zod 로 넘겨 INVALID_INPUT 을 맞는다.
  it('Infinity 는 무효 — 유한한 금액만 한도가 될 수 있다', () => {
    expect(isSettleLimitAmountValid(Infinity)).toBe(false);
    expect(isSettleLimitAmountValid(-Infinity)).toBe(false);
  });
});

describe('compareSettleCycle', () => {
  it('D types sort before W which sorts before M', () => {
    const input = ['W+1', 'D+3', 'M+2', 'D+1'];
    const sorted = [...input].sort(compareSettleCycle);
    expect(sorted).toEqual(['D+1', 'D+3', 'W+1', 'M+2']);
  });

  it('within same type, smaller number sorts first', () => {
    const input = ['D+7', 'D+2', 'D+5', 'D+1'];
    const sorted = [...input].sort(compareSettleCycle);
    expect(sorted).toEqual(['D+1', 'D+2', 'D+5', 'D+7']);
  });

  it('M+3 sorts after W+2', () => {
    expect(compareSettleCycle('M+3', 'W+2')).toBeGreaterThan(0);
    expect(compareSettleCycle('W+2', 'M+3')).toBeLessThan(0);
  });

  it('equal cycles return 0', () => {
    expect(compareSettleCycle('D+1', 'D+1')).toBe(0);
  });
});

describe('formatSettleCycle', () => {
  it('formats D type', () => {
    expect(formatSettleCycle('D', 1)).toBe('D+1');
  });

  it('formats W type', () => {
    expect(formatSettleCycle('W', 2)).toBe('W+2');
  });

  it('formats M type', () => {
    expect(formatSettleCycle('M', 3)).toBe('M+3');
  });
});
