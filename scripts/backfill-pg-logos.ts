/**
 * scripts/backfill-pg-logos.ts — canonical PG 워크스페이스에 브랜드 로고 주입.
 *
 * Run: `pnpm backfill:pg-logos`
 *
 * - 멱등: 이미 로고가 있는 워크스페이스는 덮어쓴다 (onConflictDoUpdate).
 * - 시드 스크립트(seed-pg-companies.ts)와 독립적으로 실행 가능.
 * - 자산 파일은 scripts/assets/pg-logos/ 에 위치해야 한다.
 * - canonical PG 워크스페이스가 먼저 시드돼 있어야 한다.
 */
import 'dotenv/config';

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq, isNotNull, and } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';

import { workspaces, workspaceLogoBlobs } from '@/lib/db/schema';

const ASSETS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  './assets/pg-logos',
);

const LOGO_MAP: Record<string, { file: string; mime: string }> = {
  tosspayments:   { file: 'tosspayments.svg',    mime: 'image/svg+xml' },
  kginicis:       { file: 'kginicis.png',         mime: 'image/png' },
  nicepayments:   { file: 'nicepayments.png',     mime: 'image/png' },
  kcp:            { file: 'kcp.svg',              mime: 'image/svg+xml' },
  hectofinancial: { file: 'hectofinancial.svg',   mime: 'image/svg+xml' },
  danal:          { file: 'danal.svg',            mime: 'image/svg+xml' },
  kicc:           { file: 'kicc.svg',             mime: 'image/svg+xml' },
};

async function backfillPgLogos() {
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { default: postgres } = await import('postgres');
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client, { casing: 'snake_case' });

  const dbHost = new URL(process.env.DATABASE_URL!).host;
  console.log(`Target DB: ${dbHost}`);
  console.log('Backfilling PG logo blobs…');

  const rows = await db
    .select({ id: workspaces.id, name: workspaces.name, canonicalPgKey: workspaces.canonicalPgKey })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.type, 'pg'),
        eq(workspaces.status, 'active'),
        isNotNull(workspaces.canonicalPgKey),
      ),
    );

  let ok = 0;
  let skipped = 0;

  for (const row of rows) {
    const key = row.canonicalPgKey!;
    const asset = LOGO_MAP[key];

    if (!asset) {
      console.warn(`  [SKIP] ${row.name} (${key}): LOGO_MAP에 자산 매핑 없음`);
      skipped++;
      continue;
    }

    const assetPath = resolve(ASSETS_DIR, asset.file);
    if (!existsSync(assetPath)) {
      console.warn(`  [SKIP] ${row.name} (${key}): 파일 없음 — ${assetPath}`);
      skipped++;
      continue;
    }

    const bytes = readFileSync(assetPath);

    await db
      .insert(workspaceLogoBlobs)
      .values({ workspaceId: row.id, bytes, mime: asset.mime })
      .onConflictDoUpdate({
        target: workspaceLogoBlobs.workspaceId,
        set: { bytes, mime: asset.mime, updatedAt: new Date() },
      });

    await db
      .update(workspaces)
      .set({ hasLogo: true })
      .where(eq(workspaces.id, row.id));

    console.log(`  [OK] ${row.name} (${key}) — ${bytes.length} bytes`);
    ok++;
  }

  console.log(`Done. ${ok} 주입, ${skipped} 건너뜀.`);
  await client.end();
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  backfillPgLogos().catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}
