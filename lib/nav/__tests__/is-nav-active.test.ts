import { describe, it, expect } from 'vitest';
import { isNavHrefActive, isNavSectionHeaderActive } from '../is-nav-active';

describe('isNavHrefActive', () => {
  it('matches exact pathname', () => {
    expect(isNavHrefActive('/rfp', '/rfp')).toBe(true);
  });

  it('matches child routes', () => {
    expect(isNavHrefActive('/rfp/rfp-1', '/rfp')).toBe(true);
    expect(isNavHrefActive('/rfp/rfp-1/award', '/rfp')).toBe(true);
  });

  it('does not match sibling prefixes', () => {
    expect(isNavHrefActive('/rfp-new', '/rfp')).toBe(false);
  });
});

describe('isNavSectionHeaderActive', () => {
  it('is active on bare list path without status', () => {
    expect(isNavSectionHeaderActive('/rfp', '/rfp', null)).toBe(true);
  });

  it('is inactive on bare list path when status is set', () => {
    expect(isNavSectionHeaderActive('/rfp', '/rfp', 'active')).toBe(false);
  });

  it('is active on child routes regardless of status param', () => {
    expect(isNavSectionHeaderActive('/rfp/rfp-1', '/rfp', null)).toBe(true);
    expect(isNavSectionHeaderActive('/rfp/rfp-1', '/rfp', 'active')).toBe(true);
  });

  it('is active under settings base for nested settings routes', () => {
    expect(isNavSectionHeaderActive('/settings/members', '/settings', null)).toBe(
      true,
    );
    expect(
      isNavSectionHeaderActive('/settings/notifications', '/settings', null),
    ).toBe(true);
  });
});
