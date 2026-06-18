import { describe, it, expect } from 'vitest';
import { generateSchemaDDL } from '@/lib/db/schema-ddl';

describe('chat_conversation_reads FK constraint names', () => {
  it('FK 이름이 63바이트 이내 명시 이름(ccr_*)으로 생성된다', async () => {
    const ddl = (await generateSchemaDDL()).join('\n');
    expect(ddl).toContain('ccr_conversation_id_fk');
    expect(ddl).toContain('ccr_user_id_fk');
  });
});
