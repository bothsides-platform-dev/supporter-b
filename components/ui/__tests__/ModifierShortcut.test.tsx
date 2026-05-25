import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ModifierShortcut } from '../ModifierShortcut';

afterEach(() => cleanup());

describe('ModifierShortcut', () => {
  it('renders ⌘ and the key as separate keycaps on Mac', () => {
    render(<ModifierShortcut shortcutKey="k" isMac />);
    expect(screen.getByText('⌘')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('renders Ctrl and the key as separate keycaps on non-Mac', () => {
    render(<ModifierShortcut shortcutKey="k" isMac={false} />);
    expect(screen.getByText('Ctrl')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });
});
