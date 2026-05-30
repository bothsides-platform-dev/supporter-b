import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { Field } from '../Field';

afterEach(() => {
  cleanup();
});

describe('Field', () => {
  it('renders a label linked to the child control via htmlFor/id', () => {
    render(
      <Field label="이름" htmlFor="name-input">
        <input id="name-input" defaultValue="" />
      </Field>,
    );

    const label = screen.getByText('이름');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', 'name-input');
  });

  it('renders children inside the field', () => {
    render(
      <Field label="사업자번호" htmlFor="biz-input">
        <input id="biz-input" placeholder="000-00-00000" />
      </Field>,
    );

    expect(screen.getByPlaceholderText('000-00-00000')).toBeDefined();
  });

  it('renders hint text when provided', () => {
    render(
      <Field label="이름" htmlFor="name-input" hint="한글 또는 영문">
        <input id="name-input" />
      </Field>,
    );

    expect(screen.getByText('한글 또는 영문')).toBeDefined();
  });

  it('does not render hint element when hint is not provided', () => {
    render(
      <Field label="이름" htmlFor="name-input">
        <input id="name-input" />
      </Field>,
    );

    expect(screen.queryByRole('note')).toBeNull();
  });

  it('appends required marker to label when required is true', () => {
    render(
      <Field label="이름" htmlFor="name-input" required>
        <input id="name-input" />
      </Field>,
    );

    // The label element or its container should contain an asterisk or aria-required marker
    const label = screen.getByText('이름');
    // required indicator is adjacent: check parent text content contains '*'
    expect(label.closest('[data-field]')?.textContent).toContain('*');
  });

  it('merges className onto the root element', () => {
    const { container } = render(
      <Field label="이름" htmlFor="name-input" className="custom-class">
        <input id="name-input" />
      </Field>,
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });
});
