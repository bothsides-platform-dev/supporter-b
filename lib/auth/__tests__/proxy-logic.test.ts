import { describe, expect, it } from 'vitest';
import { decideRoute } from '../route-decision';

describe('decideRoute — Step 3 four cases', () => {
  it('case 1: unauth + (app)/* redirects to /login?next=<encoded>', () => {
    const result = decideRoute('/rfp/q-2605-0042', '?tab=bids', false);
    expect(result).toEqual({
      kind: 'redirect',
      to: `/login?next=${encodeURIComponent('/rfp/q-2605-0042?tab=bids')}`,
    });
  });

  it('case 1b: unauth + /home (no search) redirects to /login?next=/home', () => {
    const result = decideRoute('/home', '', false);
    expect(result).toEqual({
      kind: 'redirect',
      to: `/login?next=${encodeURIComponent('/home')}`,
    });
  });

  it('case 2: auth + /login redirects to /home', () => {
    expect(decideRoute('/login', '', true)).toEqual({
      kind: 'redirect',
      to: '/home',
    });
  });

  it('case 2: auth + /signup redirects to /home', () => {
    expect(decideRoute('/signup/email', '', true)).toEqual({
      kind: 'redirect',
      to: '/home',
    });
  });

  it('case 3: any + /invite/rfp/<token> passes through', () => {
    expect(decideRoute('/invite/rfp/abc123', '', false)).toEqual({ kind: 'next' });
    expect(decideRoute('/invite/rfp/abc123', '', true)).toEqual({ kind: 'next' });
  });

  it('case 4: any + /logout passes through (does not redirect to /home)', () => {
    expect(decideRoute('/logout', '', true)).toEqual({ kind: 'next' });
    expect(decideRoute('/logout', '', false)).toEqual({ kind: 'next' });
  });

  it('unauth + /login passes through (no redirect loop)', () => {
    expect(decideRoute('/login', '', false)).toEqual({ kind: 'next' });
  });

  it('auth + /home (an app route) passes through', () => {
    expect(decideRoute('/home', '', true)).toEqual({ kind: 'next' });
  });

  it('unauth + / passes through (landing page is public)', () => {
    expect(decideRoute('/', '', false)).toEqual({ kind: 'next' });
  });

  it('auth + / passes through (landing is accessible to all)', () => {
    expect(decideRoute('/', '', true)).toEqual({ kind: 'next' });
  });
});
