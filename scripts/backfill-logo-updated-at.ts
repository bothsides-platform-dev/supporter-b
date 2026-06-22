/**
 * scripts/backfill-logo-updated-at.ts — one-shot, idempotent.
 *
 * 기존 로고가 있는 워크스페이스의 logo_updated_at 을 blob.updated_at 으로 채운다.
 * logo_updated_at 이 이미 set 된 행은 건드리지 않는다(WHERE ... IS NULL).
 * Run via `pnpm backfill:logo-updated-at`.
 */
import { db } from '@/lib/db/client';
import { sql } from 'drizzle-orm';

async function main() {
  const res = await db.execute(sql`
    UPDATE workspaces w
    SET logo_updated_at = b.updated_at
    FROM workspace_logo_blobs b
    WHERE w.id = b.workspace_id AND w.logo_updated_at IS NULL
  `);
  console.log('[backfill:logo-updated-at] done', res);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
