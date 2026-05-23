import { describe, it, expect, beforeEach } from 'vitest';

import { useNavHistoryStore } from '@/lib/stores/nav-history';

const canGoBack = () => {
  const { index } = useNavHistoryStore.getState();
  return index > 0;
};
const canGoForward = () => {
  const { index, entries } = useNavHistoryStore.getState();
  return index < entries.length - 1;
};

beforeEach(() => {
  useNavHistoryStore.getState().reset();
});

describe('useNavHistoryStore', () => {
  it('first sync seeds the stack: single entry, index 0, no back/forward', () => {
    useNavHistoryStore.getState().sync('/home');
    expect(useNavHistoryStore.getState().entries).toEqual(['/home']);
    expect(useNavHistoryStore.getState().index).toBe(0);
    expect(canGoBack()).toBe(false);
    expect(canGoForward()).toBe(false);
  });

  it('a forward navigation pushes and enables back (not forward)', () => {
    const s = useNavHistoryStore.getState();
    s.sync('/home');
    s.sync('/rfp');
    expect(useNavHistoryStore.getState().index).toBe(1);
    expect(canGoBack()).toBe(true);
    expect(canGoForward()).toBe(false);
  });

  it('markBack + sync to the previous url moves the index back and enables forward', () => {
    const s = useNavHistoryStore.getState();
    s.sync('/home');
    s.sync('/rfp');
    s.markBack();
    s.sync('/home');
    expect(useNavHistoryStore.getState().index).toBe(0);
    expect(canGoBack()).toBe(false);
    expect(canGoForward()).toBe(true);
  });

  it('markForward + sync to the next url moves the index forward to the tip', () => {
    const s = useNavHistoryStore.getState();
    s.sync('/home');
    s.sync('/rfp');
    s.markBack();
    s.sync('/home');
    s.markForward();
    s.sync('/rfp');
    expect(useNavHistoryStore.getState().index).toBe(1);
    expect(canGoForward()).toBe(false);
  });

  it('a new navigation after going back truncates the forward branch', () => {
    const s = useNavHistoryStore.getState();
    s.sync('/home');
    s.sync('/rfp');
    s.markBack();
    s.sync('/home'); // back to index 0
    s.sync('/inbox'); // new nav from the middle
    expect(useNavHistoryStore.getState().entries).toEqual(['/home', '/inbox']);
    expect(useNavHistoryStore.getState().index).toBe(1);
    expect(canGoForward()).toBe(false);
  });

  it('a forward link to the page you just left is a push, not a back (home→rfp→home)', () => {
    const s = useNavHistoryStore.getState();
    s.sync('/home');
    s.sync('/rfp');
    s.sync('/home'); // a push (no popstate): entries [/home, /rfp, /home], index 2
    expect(useNavHistoryStore.getState().entries).toEqual(['/home', '/rfp', '/home']);
    expect(useNavHistoryStore.getState().index).toBe(2);
    s.markBack();
    s.sync('/rfp', true); // -> index 1
    expect(useNavHistoryStore.getState().index).toBe(1);
    s.markForward();
    s.sync('/home', true); // ambiguous neighbor, but the forward hint resolves it
    expect(useNavHistoryStore.getState().index).toBe(2);
  });

  it('a browser back (viaPop, no hint) is detected by matching the previous entry', () => {
    const s = useNavHistoryStore.getState();
    s.sync('/home');
    s.sync('/rfp'); // index 1
    s.sync('/home', true); // popstate, matches entries[index-1] -> index 0
    expect(useNavHistoryStore.getState().index).toBe(0);
    expect(useNavHistoryStore.getState().entries).toEqual(['/home', '/rfp']);
  });

  it('a browser forward (viaPop, no hint) is detected by matching the next entry', () => {
    const s = useNavHistoryStore.getState();
    s.sync('/home');
    s.sync('/rfp');
    s.sync('/home', true); // back -> index 0
    s.sync('/rfp', true); // forward -> index 1
    expect(useNavHistoryStore.getState().index).toBe(1);
    expect(useNavHistoryStore.getState().entries).toEqual(['/home', '/rfp']);
  });

  it('re-syncing the current url is a no-op (refresh / re-render)', () => {
    const s = useNavHistoryStore.getState();
    s.sync('/home');
    s.sync('/rfp'); // index 1
    s.sync('/rfp'); // same url
    expect(useNavHistoryStore.getState().index).toBe(1);
    expect(useNavHistoryStore.getState().entries).toEqual(['/home', '/rfp']);
  });

  it('markBack at the start is a no-op so it cannot poison the next navigation', () => {
    const s = useNavHistoryStore.getState();
    s.sync('/home'); // index 0, cannot go back
    s.markBack(); // should not set a pending back hint
    s.sync('/rfp'); // a real forward nav must still push, not decrement
    expect(useNavHistoryStore.getState().entries).toEqual(['/home', '/rfp']);
    expect(useNavHistoryStore.getState().index).toBe(1);
  });

  it('markForward at the tip is a no-op', () => {
    const s = useNavHistoryStore.getState();
    s.sync('/home');
    s.sync('/rfp'); // index 1 (tip)
    s.markForward(); // should not set a pending forward hint
    s.sync('/inbox'); // a real forward nav must push
    expect(useNavHistoryStore.getState().entries).toEqual(['/home', '/rfp', '/inbox']);
    expect(useNavHistoryStore.getState().index).toBe(2);
  });

  it('reset clears the stack', () => {
    const s = useNavHistoryStore.getState();
    s.sync('/home');
    s.sync('/rfp');
    s.reset();
    expect(useNavHistoryStore.getState().entries).toEqual([]);
    expect(useNavHistoryStore.getState().index).toBe(0);
  });
});
