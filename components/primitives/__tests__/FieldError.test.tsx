import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FieldError } from '../FieldError';

afterEach(() => {
  cleanup();
});

describe('FieldError', () => {
  it('renders nothing when error is undefined', () => {
    const { container } = render(<FieldError />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when error is empty string', () => {
    const { container } = render(<FieldError error="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when error is whitespace-only', () => {
    const { container } = render(<FieldError error="   " />);
    expect(container.firstChild).toBeNull();
  });

  it('renders error message when error is provided', () => {
    render(<FieldError error="이메일을 입력해주세요" />);
    expect(screen.getByRole('alert')).toHaveTextContent('이메일을 입력해주세요');
  });

  it('renders as a paragraph element', () => {
    render(<FieldError error="오류 메시지" />);
    expect(screen.getByRole('alert').tagName).toBe('P');
  });
});
