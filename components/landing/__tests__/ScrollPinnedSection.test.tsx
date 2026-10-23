import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ScrollPinnedSection } from '@/components/landing/ScrollPinnedSection';

describe('ScrollPinnedSection', () => {
  it('항상 pin으로 렌더하고 children에 pinned=true·activeStep(초기 0)을 넘긴다', () => {
    render(
      <ScrollPinnedSection steps={4}>
        {({ pinned, activeStep }) => (
          <div>
            <span data-testid="pinned">{String(pinned)}</span>
            <span data-testid="step">{activeStep}</span>
          </div>
        )}
      </ScrollPinnedSection>,
    );
    // 정적 폴백 제거 — 모바일·저감모션 포함 항상 pin(사용자 요청). 초기 진행률 0 → activeStep 0.
    expect(screen.getByTestId('pinned').textContent).toBe('true');
    expect(screen.getByTestId('step').textContent).toBe('0');
  });

  it('steps<=0에서도 safeSteps 가드로 activeStep이 유한한 값으로 clamp된다', () => {
    render(
      <ScrollPinnedSection steps={0}>
        {({ activeStep }) => <span data-testid="step">{activeStep}</span>}
      </ScrollPinnedSection>,
    );
    const step = Number(screen.getByTestId('step').textContent);
    expect(Number.isFinite(step)).toBe(true);
    expect(step).toBe(0);
  });
});

it('높이가 부족하면 고정을 해제하고 직접 선택을 유지하며 resize에 다시 고정한다', () => {
  let height = 2000;
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height, top: 0, bottom: height, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON() {} }));
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  render(<ScrollPinnedSection steps={4} releaseOnOverflow>
    {({ pinned, activeStep, goToStep }) => <button onClick={() => goToStep(2)}>{String(pinned)}:{activeStep}</button>}
  </ScrollPinnedSection>);
  expect(screen.getByRole('button')).toHaveTextContent('false:0');
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('button')).toHaveTextContent('false:2');
  expect(scroll).not.toHaveBeenCalled();
  height = 100;
  fireEvent.resize(window);
  expect(screen.getByRole('button')).toHaveTextContent('true:2');
  rect.mockRestore();
  scroll.mockRestore();
});

it('문서 루트가 아닌 랜딩 컨테이너의 헤더 높이를 포함해서 판단한다', () => {
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height: window.innerHeight - 50, top: 0, bottom: 0, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON() {} }));
  const computed = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation(el => {
    const style = computed(el);
    return new Proxy(style, { get(target, key) {
      if (key === 'getPropertyValue') return (name: string) => name === '--landing-header-height' && el !== document.documentElement ? '68px' : target.getPropertyValue(name);
      return Reflect.get(target, key);
    } });
  });
  render(<ScrollPinnedSection steps={4} releaseOnOverflow>{({ pinned }) => <span>{String(pinned)}</span>}</ScrollPinnedSection>);
  expect(screen.getByText('false')).toBeVisible();
  rect.mockRestore();
  vi.restoreAllMocks();
});
