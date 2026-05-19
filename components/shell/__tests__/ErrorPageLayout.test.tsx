import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: mockBack }),
}));

import { ErrorPageLayout } from '@/components/shell/ErrorPageLayout';

const BASE_PROPS = {
  code: '404',
  title: '페이지를 찾을 수 없어요',
  description: '링크가 잘못되었거나 페이지가 삭제되었을 수 있습니다.',
  primaryAction: { label: '홈으로 돌아가기', href: '/' },
  secondaryAction: { label: '이전 페이지', back: true as const },
};

describe('ErrorPageLayout', () => {
  beforeEach(() => {
    mockBack.mockClear();
  });

  it('에러 코드, 제목, 설명을 렌더링한다', () => {
    render(<ErrorPageLayout {...BASE_PROPS} />);
    expect(screen.getByText('404')).toBeDefined();
    expect(screen.getByText('페이지를 찾을 수 없어요')).toBeDefined();
    expect(screen.getByText('링크가 잘못되었거나 페이지가 삭제되었을 수 있습니다.')).toBeDefined();
  });

  it('primaryAction.onClick이 있을 때 클릭하면 함수를 호출한다', () => {
    const onClick = vi.fn();
    render(
      <ErrorPageLayout
        {...BASE_PROPS}
        primaryAction={{ label: '다시 시도', onClick }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('primaryAction.href가 있을 때 링크로 렌더링한다', () => {
    render(<ErrorPageLayout {...BASE_PROPS} />);
    expect(screen.getByRole('link', { name: '홈으로 돌아가기' })).toBeDefined();
  });

  it('secondaryAction.back이 true일 때 클릭하면 router.back()을 호출한다', () => {
    render(<ErrorPageLayout {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: '이전 페이지' }));
    expect(mockBack).toHaveBeenCalledOnce();
  });

  it('chip prop이 있을 때 Chip을 렌더링한다', () => {
    render(<ErrorPageLayout {...BASE_PROPS} chip="서버 오류" />);
    expect(screen.getByText('서버 오류')).toBeDefined();
  });

  it('chip prop이 없을 때 Chip을 렌더링하지 않는다', () => {
    render(<ErrorPageLayout {...BASE_PROPS} />);
    expect(screen.queryByText('서버 오류')).toBeNull();
  });

  it('variant="error"일 때 에러 코드에 error 색상 클래스가 적용된다', () => {
    render(<ErrorPageLayout {...BASE_PROPS} code="500" variant="error" />);
    const codeEl = screen.getByText('500');
    expect(codeEl.className).toContain('error');
  });

  it('variant가 없을 때 에러 코드에 기본 on-surface 색상 클래스가 적용된다', () => {
    render(<ErrorPageLayout {...BASE_PROPS} />);
    const codeEl = screen.getByText('404');
    expect(codeEl.className).not.toContain('md-sys-color-error)');
  });
});
