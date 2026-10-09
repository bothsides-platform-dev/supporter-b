import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Chip } from '../Chip';

afterEach(() => cleanup());

describe('Chip', () => {
  it('uses a readable delete-button name when an input chip has rich content', () => {
    render(
      <Chip
        variant="input"
        label={<><span className="md-numeric">2027</span>년 상반기</>}
        onDelete={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: '항목 제거' })).toBeInTheDocument();
  });

  it('keeps the label in the delete-button name for text labels', () => {
    render(<Chip variant="input" label="클라우드" onDelete={() => undefined} />);

    expect(screen.getByRole('button', { name: '클라우드 제거' })).toBeInTheDocument();
  });
});
