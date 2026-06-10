/**
 * scripts/seed-pg-companies.ts — 주요 PG사 워크스페이스 + 마스터 계정 사전 시딩.
 *
 * Run: `pnpm tsx scripts/seed-pg-companies.ts`
 *
 * - Idempotent: ON CONFLICT DO NOTHING / DO UPDATE 로 재실행 안전
 * - 마스터 계정은 is_system_account=true, 화면에서 노출 안 됨
 * - 워크스페이스는 status='active' (관리자 심사 없음)
 * - 환경변수: SEED_PG_<KEY>_EMAIL / SEED_PG_<KEY>_PASSWORD (각 PG사)
 *
 * .env.production.example 에 빈 값 추가 필요:
 *   SEED_PG_TOSSPAYMENTS_EMAIL=
 *   SEED_PG_TOSSPAYMENTS_PASSWORD=
 *   ... (각 PG사 동일 패턴)
 */
import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import {
  pgProfiles,
  users,
  workspaceMembers,
  workspaces,
} from '@/lib/db/schema';
import { defaultColumns } from '@/lib/server/columns/seed';
import { hashPassword } from '@/lib/auth/password';

const PG_COMPANIES = [
  { key: 'tosspayments',   name: '토스페이먼츠',  envKey: 'TOSSPAYMENTS' },
  { key: 'kginicis',       name: 'KG이니시스',    envKey: 'KGINICIS' },
  { key: 'nicepayments',   name: '나이스페이먼츠', envKey: 'NICEPAYMENTS' },
  { key: 'kcp',            name: 'NHN KCP',       envKey: 'KCP' },
  { key: 'hectofinancial', name: '헥토파이낸셜',   envKey: 'HECTOFINANCIAL' },
  { key: 'danal',          name: '다날',           envKey: 'DANAL' },
  { key: 'kicc',           name: 'KICC(이지페이)', envKey: 'KICC' },
] as const;

async function seedPgCompanies() {
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { default: postgres } = await import('postgres');
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client, { casing: 'snake_case' });

  const dbHost = new URL(process.env.DATABASE_URL!).host;
  console.log(`Target DB: ${dbHost}`);
  console.log('Seeding canonical PG companies…');

  for (const pg of PG_COMPANIES) {
    const email = process.env[`SEED_PG_${pg.envKey}_EMAIL`];
    const password = process.env[`SEED_PG_${pg.envKey}_PASSWORD`];

    if (!email || !password) {
      console.warn(`  [SKIP] ${pg.name}: SEED_PG_${pg.envKey}_EMAIL or _PASSWORD not set`);
      continue;
    }

    // 1. Upsert workspace
    const wsRows = await db
      .insert(workspaces)
      .values({
        id: randomUUID(),
        type: 'pg',
        name: pg.name,
        status: 'active',
        canonicalPgKey: pg.key,
      })
      .onConflictDoUpdate({
        target: workspaces.canonicalPgKey,
        set: { name: pg.name, status: 'active' },
      })
      .returning({ id: workspaces.id });
    const workspaceId = wsRows[0].id;

    // 2. Upsert master user (is_system_account=true)
    const passwordHash = await hashPassword(password);
    const userRows = await db
      .insert(users)
      .values({
        id: randomUUID(),
        email: email.toLowerCase(),
        passwordHash,
        name: `${pg.name} 관리자`,
        avatarColor: 'ink',
        status: 'active',
        emailVerified: true,
        isSystemAccount: true,
      })
      .onConflictDoUpdate({
        target: users.email,
        // Only update existing rows that are already system accounts.
        // Prevents overwriting a real user who happens to share the seed email.
        set: { passwordHash, isSystemAccount: true, emailVerified: true },
        setWhere: eq(users.isSystemAccount, true),
      })
      .returning({ id: users.id });
    const userId = userRows[0].id;

    // 3. Upsert admin membership
    await db
      .insert(workspaceMembers)
      .values({ workspaceId, userId, role: 'admin' })
      .onConflictDoNothing();

    // 4. Upsert pg_profiles
    await db
      .insert(pgProfiles)
      .values({ workspaceId, bizNo: null, serviceScope: null })
      .onConflictDoNothing();

    // 5. Seed default kanban columns (idempotent via lifecycleKey conflict)
    const cols = defaultColumns(workspaceId, 'pg');
    for (const col of cols) {
      const { columns: colTable } = await import('@/lib/db/schema');
      await db.insert(colTable).values(col).onConflictDoNothing();
    }

    console.log(`  [OK] ${pg.name} (${pg.key})`);
  }

  console.log('Done.');
  process.exit(0);
}

// Run when executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedPgCompanies().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
