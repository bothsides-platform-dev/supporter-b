import { vi } from 'vitest';
import { loadGuestDraft } from '@/lib/guest-rfp/draft';
vi.mock('@/lib/hooks/useIsLgUp', () => ({ useIsLgUp: () => true }));
vi.mock('../RfpMatchingSelection', async original => ({ ...await original<object>(), MIN_MATCHING_LOADING_MS: 0 }));
export function guestReviewFetch() {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const input = JSON.parse(String(init?.body));
    const draft = loadGuestDraft();
    if (input.op === 'account') return Response.json({ signedIn: false, workspaces: [] });
    if (input.op === 'status') return Response.json(null);
    if (input.op === 'recommend') return Response.json({
      revision: draft?.serverRevision ?? 1,
      recommendation: { risk: 'white', industryName: draft?.data.customIndustryName || '의류', candidates: [{ pgWorkspaceId: 'pg', name: 'Alpha', reason: '업종에 맞는 PG', merchantTier: null, feeRate: null, feeNote: '' }] },
      tierBasis: 'unknown', annualRevenue: draft?.quoteContext?.savings?.annualRevenue ?? null,
      answers: draft?.data ?? {}, files: draft?.files ?? [], attachmentCount: draft?.files.length ?? 0,
    });
    return Response.json({ ok: true, id: draft?.id, revision: 1 });
  });
}
