'use server';

import { getChoseong } from 'es-hangul';
import { requireSession } from '@/lib/auth/session';
import {
  getBidRepo,
  getPgRequestRepo,
  getRfpRepo,
} from '@/lib/server/repositories/factory';
import { escapeIlike } from '@/lib/server/search/escapeIlike';

// Returns true when every char is a Korean consonant (ㄱ–ㅎ, U+3131–U+314E).
// SQL ilike never matches chosung; we switch to in-memory getChoseong filtering.
function isChosungOnly(q: string): boolean {
  return q.length > 0 && [...q].every((ch) => ch >= 'ㄱ' && ch <= 'ㅎ');
}

function matchesChosung(q: string, ...fields: string[]): boolean {
  return fields.some((f) => getChoseong(f).includes(q));
}

export type RfpSearchItem = {
  code: string;
  title: string;
  memo: string;
  status: string;
  href: string; // buyer → /rfp/[code]
};

export type BidSearchItem = {
  bidId: string;
  rfpId: string; // RFP code (human id, used in URLs)
  rfpTitle: string;
  pgWsName: string; // buyer에서만 채워짐, PG는 ''
  memo: string;
  href: string; // buyer → /rfp/[code], pg → /inbox/[code]
};

export type OppSearchItem = {
  rfpCode: string;
  buyerName: string;
  title: string;
  websiteUrl: string | null;
  href: string; // → /opportunities (board)
};

export type SearchResults = {
  rfps: RfpSearchItem[];
  bids: BidSearchItem[];
  opportunities: OppSearchItem[];
};

// Repo projection row shapes (mirror the whitelisted repo SELECTs exactly).
type RfpRow = { code: string; title: string; memo: string; status: string };
type BuyerBidRow = {
  bidId: string;
  rfpId: string;
  rfpTitle: string;
  pgWsName: string;
  memo: string;
};
type PgBidRow = { bidId: string; rfpId: string; rfpTitle: string; memo: string };

const EMPTY: SearchResults = { rfps: [], bids: [], opportunities: [] };
const LIMIT = 20;

// Server-side `ilike` search-as-you-type for the command palette. Workspace-scoped,
// whitelisted, and never loads the full dataset to the client. Empty/whitespace
// query short-circuits without touching the DB.
export async function searchEntitiesAction(query: string): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return EMPTY;

  let session;
  try {
    session = await requireSession();
  } catch {
    return EMPTY;
  }

  const user = session.user as {
    id: string;
    workspaceId?: string;
    workspaceType?: string;
  };
  const { workspaceId, workspaceType } = user;
  if (!workspaceId || !workspaceType) return EMPTY;

  const chosung = isChosungOnly(q);
  const pattern = `%${escapeIlike(q)}%`;
  // For chosung queries we fetch more rows (no SQL filter) and reduce in JS.
  const scanLimit = chosung ? LIMIT * 10 : LIMIT;

  if (workspaceType === 'buyer') {
    const rfpRepo = await getRfpRepo();
    const bidRepo = await getBidRepo();

    const rfpRows = (
      chosung
        ? await rfpRepo.listForBuyer(workspaceId, scanLimit)
        : await rfpRepo.searchForBuyer(workspaceId, pattern)
    ) as RfpRow[];

    const filteredRfps = chosung
      ? rfpRows.filter((r) => matchesChosung(q, r.title, r.memo ?? '')).slice(0, LIMIT)
      : rfpRows;

    const bidRows = (
      chosung
        ? await bidRepo.listForBuyer(workspaceId, scanLimit)
        : await bidRepo.searchForBuyer(workspaceId, pattern)
    ) as BuyerBidRow[];

    const filteredBids = chosung
      ? bidRows.filter((r) => matchesChosung(q, r.rfpTitle, r.memo ?? '', r.pgWsName)).slice(0, LIMIT)
      : bidRows;

    return {
      rfps: filteredRfps.map((r) => ({ ...r, href: `/rfp/${r.code}` })),
      bids: filteredBids.map((r) => ({ ...r, href: `/rfp/${r.rfpId}` })),
      opportunities: [],
    };
  }

  if (workspaceType === 'pg') {
    const bidRepo = await getBidRepo();

    const bidRows = (
      chosung
        ? await bidRepo.listForPg(workspaceId, scanLimit)
        : await bidRepo.searchForPg(workspaceId, pattern)
    ) as PgBidRow[];

    const filteredBids = chosung
      ? bidRows.filter((r) => matchesChosung(q, r.rfpTitle, r.memo ?? '')).slice(0, LIMIT)
      : bidRows;

    // Opportunities reuse the whitelist repo query (제목·구매사명·홈페이지만) and
    // filter in memory — never a bespoke SELECT that could leak sensitive columns.
    const repo = await getPgRequestRepo();
    const open = await repo.findOpenRfpsForPg(workspaceId, new Date());
    const ql = q.toLowerCase();
    const opportunities = open
      .filter(
        (o) =>
          o.title.toLowerCase().includes(ql) ||
          o.buyerName.toLowerCase().includes(ql) ||
          (chosung && matchesChosung(q, o.title, o.buyerName)),
      )
      .slice(0, LIMIT)
      .map((o) => ({
        rfpCode: o.rfpCode,
        buyerName: o.buyerName,
        title: o.title,
        websiteUrl: o.websiteUrl,
        href: '/opportunities',
      }));

    return {
      rfps: [],
      bids: filteredBids.map((r) => ({
        ...r,
        pgWsName: '',
        href: `/inbox/${r.rfpId}`,
      })),
      opportunities,
    };
  }

  return EMPTY;
}
