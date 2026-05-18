import { describe, expect, it } from 'vitest';
import { canTransition, assertTransition } from '../rfp-state';

describe('canTransition', () => {
  it.each([
    ['draft', 'sent'],
    ['sent', 'closed'],
    ['sent', 'cancelled'],
    ['sent', 'awarded'],
  ] as const)('%s → %s is allowed', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['draft', 'closed'],
    ['draft', 'cancelled'],
    ['draft', 'awarded'],
    ['sent', 'draft'],
    ['closed', 'sent'],
    ['awarded', 'sent'],
    ['cancelled', 'draft'],
    ['draft', 'draft'],
    ['sent', 'sent'],
  ] as const)('%s → %s is blocked', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe('assertTransition', () => {
  it('does not throw on valid transition', () => {
    expect(() => assertTransition('draft', 'sent')).not.toThrow();
  });

  it('throws with descriptive message on invalid transition', () => {
    expect(() => assertTransition('closed', 'sent')).toThrow('Invalid RFP transition: closed → sent');
  });
});
