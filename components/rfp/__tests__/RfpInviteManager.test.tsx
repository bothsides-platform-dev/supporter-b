import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/hooks/useLazyPgWorkspaces', () => ({
  useLazyPgWorkspaces: () => ({ pgList: [], loading: false, error: null, load: vi.fn() }),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/server/actions/rfp', () => ({
  addPgWorkspacesToRfpAction: vi.fn(),
  sendDraftInvitationsAction: vi.fn(),
}));

import { RfpInviteManager } from '../RfpInviteManager';

afterEach(cleanup);

describe('RfpInviteManager', () => {
  it('canEdit=true 여도 공유 링크 섹션이 노출되지 않는다', () => {
    render(
      <RfpInviteManager
        rfpId="rfp-1"
        invitations={[]}
        canEdit={true}
      />,
    );
    expect(screen.queryByText('공유 링크')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/복사/)).not.toBeInTheDocument();
  });
});
