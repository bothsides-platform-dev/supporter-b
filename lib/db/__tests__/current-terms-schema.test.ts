import { describe, it, expect } from 'vitest';
import { generateSchemaDDL } from '@/lib/db/schema-ddl';

describe('rfps current_terms / hidden_from_pg columns', () => {
  it('생성 DDL 에 두 확장 컬럼이 포함된다', async () => {
    const ddl = (await generateSchemaDDL()).join('\n');
    expect(ddl).toContain('current_terms');
    expect(ddl).toContain('hidden_from_pg');
  });

  it('current_terms 는 빈 버전드 문서로 기본값을 가진다 (기존 행 백필 안전)', async () => {
    const ddl = (await generateSchemaDDL()).join('\n');
    // 기존 행/신규 행 모두 유효한 {"_v":1} 문서로 시작해야 한다.
    expect(ddl).toContain('{"_v":1}');
  });
});

describe('bids quote_terms forward column (견적 미래 차원 슬롯)', () => {
  it('생성 DDL 에 quote_terms 컬럼이 포함된다', async () => {
    // 비수수료 견적 차원(정산일 옵션·롤링 리저브 등)을 DDL 없이 흡수할 빈 버전드 문서 슬롯.
    const ddl = (await generateSchemaDDL()).join('\n');
    expect(ddl).toContain('quote_terms');
  });
});
