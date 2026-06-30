import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DemoCue } from '../DemoCue';

describe('DemoCue', () => {
  it('show가 false면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<DemoCue show={false} label="견적 요청을 눌러 확인해요" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('show가 true면 안내 문구를 렌더한다', () => {
    render(<DemoCue show label="견적 요청을 눌러 확인해요" />);
    expect(screen.getByText('견적 요청을 눌러 확인해요')).toBeInTheDocument();
  });
});
