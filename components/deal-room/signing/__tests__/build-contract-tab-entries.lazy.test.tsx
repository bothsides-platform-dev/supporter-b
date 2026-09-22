import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/deal-room/signing/SigningTab', () => {
  throw new Error('SigningTab must not load while no contract tab exists');
});

import { buildContractTabEntries } from '../build-contract-tab-entries';

describe('buildContractTabEntries', () => {
  it('does not load the signing tab module when signing is absent', () => {
    expect(
      buildContractTabEntries({
        rfpCode: 'P-2605-0042',
        signing: null,
        side: 'pg',
        contact: null,
      }),
    ).toEqual([]);
  });
});
