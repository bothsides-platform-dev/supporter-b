import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { ChatPanelPlaceholder } from '../ChatPanelPlaceholder';

afterEach(() => cleanup());

describe('ChatPanelPlaceholder', () => {
  it('renders the 메시지 header, an empty-conversation state, and a disabled 새 메시지 CTA', () => {
    render(<ChatPanelPlaceholder />);
    expect(screen.getByText('메시지')).toBeInTheDocument();
    expect(screen.getByText('대화가 아직 없습니다')).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: '새 메시지' });
    expect(cta).toBeDisabled();
  });
});
