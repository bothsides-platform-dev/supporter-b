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
