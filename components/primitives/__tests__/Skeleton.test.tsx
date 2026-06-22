import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Skeleton } from '../Skeleton';

afterEach(cleanup);

describe('Skeleton', () => {
  it('펄스 애니메이션과 전달한 className 을 가진 블록을 렌더한다', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass('animate-pulse');
    expect(el).toHaveClass('h-4');
    expect(el).toHaveClass('w-20');
  });

  it('motion-reduce 에서 애니메이션을 끄는 클래스를 포함한다', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveClass('motion-reduce:animate-none');
  });
});
