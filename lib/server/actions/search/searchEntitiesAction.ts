'use server';

import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { getChoseong } from 'es-hangul';
import { bids, rfps, workspaces } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth/session';
import { getPgRequestRepo } from '@/lib/server/repositories/factory';
import { escapeIlike } from '@/lib/server/search/escapeIlike';
import { actionDb } from '../auth/_shared';

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

  const db = actionDb();
  const chosung = isChosungOnly(q);
  const pattern = `%${escapeIlike(q)}%`;
  // For chosung queries we fetch more rows (no SQL filter) and reduce in JS.
  const scanLimit = chosung ? LIMIT * 10 : LIMIT;

  if (workspaceType === 'buyer') {
    const rfpRows = await db
      .select({
        code: rfps.code,
        title: rfps.title,
        memo: rfps.memo,
        status: rfps.status,
      })
      .from(rfps)
      .where(
        chosung
          ? eq(rfps.buyerWsId, workspaceId)
          : and(
              eq(rfps.buyerWsId, workspaceId),
              or(ilike(rfps.title, pattern), ilike(rfps.memo, pattern)),
            ),
      )
      .orderBy(desc(rfps.createdAt))
      .limit(scanLimit);

    const filteredRfps = chosung
      ? rfpRows.filter((r: typeof rfpRows[number]) => matchesChosung(q, r.title, r.memo ?? '')).slice(0, LIMIT)
      : rfpRows;

    const bidRows = await db
      .select({
        bidId: bids.id,
        rfpId: rfps.code,
        rfpTitle: rfps.title,
        pgWsName: workspaces.name,
        memo: bids.memo,
      })
      .from(bids)
      .innerJoin(rfps, eq(bids.rfpId, rfps.id))
      .innerJoin(workspaces, eq(bids.pgWsId, workspaces.id))
      .where(
        chosung
          ? and(eq(rfps.buyerWsId, workspaceId), eq(bids.status, 'submitted'))
          : and(
              eq(rfps.buyerWsId, workspaceId),
              eq(bids.status, 'submitted'),
              or(
                ilike(rfps.title, pattern),
                ilike(bids.memo, pattern),
                ilike(workspaces.name, pattern),
              ),
            ),
      )
      .orderBy(desc(bids.submittedAt))
      .limit(scanLimit);

    const filteredBids = chosung
      ? bidRows.filter((r: typeof bidRows[number]) => matchesChosung(q, r.rfpTitle, r.memo ?? '', r.pgWsName)).slice(0, LIMIT)
      : bidRows;

    return {
      rfps: filteredRfps.map((r: typeof rfpRows[number]) => ({ ...r, href: `/rfp/${r.code}` })),
      bids: filteredBids.map((r: typeof bidRows[number]) => ({ ...r, href: `/rfp/${r.rfpId}` })),
      opportunities: [],
    };
  }

  if (workspaceType === 'pg') {
    const bidRows = await db
      .select({
        bidId: bids.id,
        rfpId: rfps.code,
        rfpTitle: rfps.title,
        memo: bids.memo,
      })
      .from(bids)
      .innerJoin(rfps, eq(bids.rfpId, rfps.id))
      .where(
        chosung
          ? and(eq(bids.pgWsId, workspaceId), eq(bids.status, 'submitted'))
          : and(
              eq(bids.pgWsId, workspaceId),
              eq(bids.status, 'submitted'),
              or(ilike(rfps.title, pattern), ilike(bids.memo, pattern)),
            ),
      )
      .orderBy(desc(bids.submittedAt))
      .limit(scanLimit);

    const filteredBids = chosung
      ? bidRows.filter((r: typeof bidRows[number]) => matchesChosung(q, r.rfpTitle, r.memo ?? '')).slice(0, LIMIT)
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
      bids: filteredBids.map((r: typeof bidRows[number]) => ({
        ...r,
        pgWsName: '',
        href: `/inbox/${r.rfpId}`,
      })),
      opportunities,
    };
  }

  return EMPTY;
}
