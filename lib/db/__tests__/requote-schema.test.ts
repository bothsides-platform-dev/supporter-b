import { describe, it, expect } from 'vitest';
import { generateSchemaDDL } from '@/lib/db/schema-ddl';

describe('rfp_requote_requests schema', () => {
  it('appears in generated DDL with the round-scoped unique index', async () => {
    const ddl = (await generateSchemaDDL()).join('\n');
    expect(ddl).toContain('rfp_requote_requests');
    expect(ddl).toContain('rfp_requote_request_status');
    expect(ddl).toContain('bids_rfp_pg_round_unique');
  });
});
