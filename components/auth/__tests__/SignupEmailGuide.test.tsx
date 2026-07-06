import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SignupEmailGuide } from '../SignupEmailGuide';

describe('SignupEmailGuide', () => {
  it('입력 전에는 중립 힌트를 보여준다', () => {
    render(<SignupEmailGuide email="" />);
    const guide = screen.getByRole('status');
    expect(guide).toHaveTextContent('회사 이메일로 가입하면 팀원과 함께 쓰기 쉬워요.');
    expect(guide).not.toHaveTextContent('별도 심사 과정이 추가될 수 있어요');
  });

  it('회사 도메인 이메일도 중립 힌트를 유지한다', () => {
    render(<SignupEmailGuide email="kim@acme.co.kr" />);
    const guide = screen.getByRole('status');
    expect(guide).toHaveTextContent('회사 이메일로 가입하면 팀원과 함께 쓰기 쉬워요.');
    expect(guide).not.toHaveTextContent('별도 심사 과정이 추가될 수 있어요');
  });

  it('무료 도메인 감지 시 amber 경고로 전환한다', () => {
    render(<SignupEmailGuide email="kim@gmail.com" />);
    expect(screen.getByRole('status')).toHaveTextContent('기업 메일 없는 사업장이나 공동 도메인 이메일이 없는 분들은 별도 심사 과정이 추가될 수 있어요.');
  });

  it('힌트→경고 전환에도 라이브 리전 엘리먼트가 유지된다 (스크린리더 안내 보장)', () => {
    const { rerender } = render(<SignupEmailGuide email="kim@gmail.co" />);
    const region = screen.getByRole('status');
    rerender(<SignupEmailGuide email="kim@gmail.com" />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('별도 심사 과정이 추가될 수 있어요');
  });

  it('형식이 미완성인 입력은 힌트를 유지한다', () => {
    render(<SignupEmailGuide email="kim@gmail" />);
    const guide = screen.getByRole('status');
    expect(guide).toHaveTextContent('회사 이메일로 가입하면');
    expect(guide).not.toHaveTextContent('별도 심사 과정이 추가될 수 있어요');
  });

  it('hidden이면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<SignupEmailGuide email="kim@gmail.com" hidden />);
    expect(container).toBeEmptyDOMElement();
  });
});
