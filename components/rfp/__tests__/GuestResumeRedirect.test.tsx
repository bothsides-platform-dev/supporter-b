import { render, waitFor, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { GuestResumeRedirect } from '../GuestResumeRedirect';
import {
  createGuestDraft,
  saveGuestDraft,
  RESUME_KEY,
} from '@/lib/guest-rfp/draft';
const replace = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
beforeEach(() => {
  localStorage.clear();
  replace.mockClear();
});
it('returns from approval mail or a login without next using a browser marker', async () => {
  saveGuestDraft(createGuestDraft());
  localStorage.setItem(RESUME_KEY, '1');
  render(<GuestResumeRedirect actor={{ userId: 'u', workspaceId: 'w' }} />);
  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith('/rfp-create?resume=guest'),
  );
});
it('does not import a draft belonging to another workspace', () => {
  const d = createGuestDraft();
  d.owner = { userId: 'u', workspaceId: 'other' };
  saveGuestDraft(d);
  localStorage.setItem(RESUME_KEY, '1');
  render(<GuestResumeRedirect actor={{ userId: 'u', workspaceId: 'w' }} />);
  expect(replace).not.toHaveBeenCalled();
});

it('returns from a new browser using the server pending marker, then keeps a manual entry after consumption', async () => {
 const view = render(<GuestResumeRedirect actor={{ userId: 'u', workspaceId: 'w' }} serverPending hasServerDraft />);
 await waitFor(() => expect(replace).toHaveBeenCalledWith('/rfp-create?resume=guest'));
 view.unmount(); replace.mockClear();
 render(<GuestResumeRedirect actor={{ userId: 'u', workspaceId: 'w' }} hasServerDraft />);
 expect(replace).not.toHaveBeenCalled();
 expect(screen.getByRole('link', { name: '작성하던 견적을 이어 써요' })).toHaveAttribute('href', '/rfp-create?resume=guest');
});
