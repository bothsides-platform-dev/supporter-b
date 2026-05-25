// db:generate 래퍼 — drizzle-kit generate 후 생성된 .sql 파일 상단에
// "CREATE SCHEMA IF NOT EXISTS public;" 한 줄을 자동으로 주입한다.
//
// 이유: drizzle-kit은 모든 타입·테이블을 "public"."name" 형식으로 생성하는데,
// 빈 DB(e2e 재생성, 신규 클라우드 인스턴스 등)에 public 스키마가 없으면
// 첫 문장에서 ERROR 3F000: schema "public" does not exist 로 즉시 실패한다.
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

execSync('rm -rf drizzle/*.sql drizzle/meta', { stdio: 'inherit', shell: true });
execSync('drizzle-kit generate', { stdio: 'inherit' });

const file = readdirSync('drizzle').find((f) => f.endsWith('.sql'));
if (!file) process.exit(0);

const path = `drizzle/${file}`;
const original = readFileSync(path, 'utf8');
const preamble = 'CREATE SCHEMA IF NOT EXISTS public;\n--> statement-breakpoint\n';
if (!original.startsWith(preamble)) {
  writeFileSync(path, preamble + original);
  console.log(`✓ Prepended CREATE SCHEMA preamble → ${path}`);
}
