import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SignupEmailGuide } from '../SignupEmailGuide';

describe('SignupEmailGuide', () => {
  it('입력 전에는 중립 힌트를 보여준다', () => {
    render(<SignupEmailGuide email="" />);
    const hint = screen.getByRole('note');
    expect(hint).toHaveTextContent('회사 이메일로 가입하면 팀원과 함께 쓰기 쉬워요.');
  });

  it('회사 도메인 이메일도 중립 힌트를 유지한다', () => {
    render(<SignupEmailGuide email="kim@acme.co.kr" />);
    expect(screen.getByRole('note')).toHaveTextContent('회사 이메일로 가입하면 팀원과 함께 쓰기 쉬워요.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('무료 도메인 감지 시 amber 경고로 전환한다', () => {
    render(<SignupEmailGuide email="kim@gmail.com" />);
    const warning = screen.getByRole('status');
    expect(warning).toHaveTextContent('개인 이메일이에요. 회사 이메일로 가입하면 팀원과 함께 쓰기 쉬워요.');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('형식이 미완성인 입력은 힌트를 유지한다', () => {
    render(<SignupEmailGuide email="kim@gmail" />);
    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('hidden이면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<SignupEmailGuide email="kim@gmail.com" hidden />);
    expect(container).toBeEmptyDOMElement();
  });
});
