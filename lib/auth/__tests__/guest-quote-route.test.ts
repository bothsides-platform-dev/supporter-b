import { expect, it } from 'vitest';
import { decideRoute } from '../route-decision';
it('allows exactly the public quote route without opening adjacent private paths', () => {
  expect(decideRoute('/quote-start', '', false)).toEqual({ kind: 'next' });
  expect(decideRoute('/quote-start/admin', '', false).kind).toBe('redirect');
  expect(decideRoute('/quote-start-other', '', false).kind).toBe('redirect');
});
