import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Label } from '../Label';

describe('Label', () => {
  it('기본은 span 이고 라벨 유틸리티 클래스를 얹는다', () => {
    render(<Label>정산 주기</Label>);
    const el = screen.getByText('정산 주기');
    expect(el.tagName).toBe('SPAN');
    expect(el).toHaveClass('md-label-medium');
  });

  it('as="label" + htmlFor 면 입력과 묶인다', () => {
    render(
      <>
        <Label as="label" htmlFor="tmpl-name">
          템플릿 이름
        </Label>
        <input id="tmpl-name" />
      </>,
    );
    expect(screen.getByLabelText('템플릿 이름')).toBeInTheDocument();
  });

  // label 이 아닌 태그에 for 를 달면 유효하지 않은 HTML 이고, 진짜 라벨의
  // 연결을 조용히 가로챌 수 있다 — 그래서 태그가 label 일 때만 통과시킨다.
  it('label 이 아니면 htmlFor 를 떨어뜨린다', () => {
    render(
      <Label as="span" htmlFor="tmpl-name">
        템플릿 이름
      </Label>,
    );
    expect(screen.getByText('템플릿 이름')).not.toHaveAttribute('for');
  });

  it('size 가 라벨 유틸리티에 매핑된다', () => {
    render(
      <>
        <Label size="sm">작은</Label>
        <Label size="lg">큰</Label>
      </>,
    );
    expect(screen.getByText('작은')).toHaveClass('md-label-small');
    expect(screen.getByText('큰')).toHaveClass('md-label-large');
  });
});
