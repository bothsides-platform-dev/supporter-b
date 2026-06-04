import { describe, it, expect } from 'vitest';
import {
  getNavConfig,
  getBreadcrumbSegments,
  getChordMap,
} from '../nav-config';

describe('getNavConfig — top item order', () => {
  it('lists 홈, 알림 then 메시지 (workspace nav is a section)', () => {
    expect(getNavConfig('buyer').top.map((i) => i.id)).toEqual([
      'home',
      'notifications',
      'messages',
    ]);
    expect(getNavConfig('pg').top.map((i) => i.id)).toEqual([
      'home',
      'notifications',
      'messages',
    ]);
  });
});

describe('getNavConfig — top items', () => {
  it('exposes 홈 and 알림 with chord shortcuts for both workspace types', () => {
    for (const ws of ['buyer', 'pg'] as const) {
      const { top } = getNavConfig(ws);
      const home = top.find((i) => i.href === '/home');
      const notif = top.find((i) => i.href === '/notifications');
      expect(home?.label).toBe('홈');
      expect(home?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'h' });
      expect(notif?.label).toBe('알림');
      expect(notif?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'n' });
      const messages = top.find((i) => i.href === '/messages');
      expect(messages?.label).toBe('메시지');
      expect(messages?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'm' });
    }
  });
});

describe('getNavConfig — buyer RFP section', () => {
  it('puts RFP in sections with status sub-items and 새 RFP link', () => {
    const { top, sections } = getNavConfig('buyer');
    expect(top.some((i) => i.id === 'rfp')).toBe(false);
    expect(sections.map((s) => s.id)).toEqual(['rfp', 'settings']);

    const rfp = sections.find((s) => s.id === 'rfp');
    expect(rfp?.label).toBe('견적 요청');
    expect(rfp?.href).toBe('/rfp');
    expect(rfp?.base).toBe('/rfp');
    expect(rfp?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'r' });
    expect(rfp?.statuses?.map((s) => s.status)).toEqual([
      'active',
      'closed',
      'awarded',
    ]);
    expect(rfp?.statuses?.map((s) => s.label)).toEqual([
      '진행중',
      '마감',
      '선정 완료',
    ]);
    expect(rfp?.links?.map((l) => l.href)).toEqual(['/rfp/new']);
    expect(rfp?.links?.[0]?.label).toBe('새 견적 요청');
  });
});

describe('getNavConfig — pg inbox section', () => {
  it('puts 받은 RFP in sections with status sub-items and no 새 RFP link', () => {
    const { top, sections } = getNavConfig('pg');
    expect(top.some((i) => i.id === 'inbox')).toBe(false);
    expect(sections.map((s) => s.id)).toEqual(['inbox', 'settings']);

    const inbox = sections.find((s) => s.id === 'inbox');
    expect(inbox?.label).toBe('받은 견적 요청');
    expect(inbox?.href).toBe('/inbox');
    expect(inbox?.base).toBe('/inbox');
    expect(inbox?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'i' });
    expect(inbox?.statuses?.map((s) => s.status)).toEqual([
      'new',
      'submitted',
      'closed',
    ]);
    expect(inbox?.statuses?.map((s) => s.label)).toEqual([
      '신규',
      '견적 보냄',
      '마감',
    ]);
    expect(inbox?.links?.map((l) => l.href)).toEqual(['/opportunities']);
    expect(inbox?.links?.[0]?.label).toBe('견적 기회');
    expect(top.some((i) => i.id === 'rfp')).toBe(false);
  });
});

describe('getNavConfig — settings section (both)', () => {
  it('links to profile and members and is shortcut g s', () => {
    const { sections } = getNavConfig('buyer');
    const settings = sections.find((s) => s.id === 'settings');
    expect(settings?.href).toBe('/settings/profile');
    expect(settings?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 's' });
    expect(settings?.links?.map((l) => l.href)).toEqual([
      '/settings/profile',
      '/settings/members',
    ]);
  });

  it('adds a PG-only 견적 템플릿 link (g q); buyer settings has no such link', () => {
    const pg = getNavConfig('pg').sections.find((s) => s.id === 'settings');
    expect(pg?.links?.map((l) => l.href)).toEqual([
      '/settings/profile',
      '/settings/members',
      '/settings/quote-templates',
    ]);
    const qt = pg?.links?.find((l) => l.href === '/settings/quote-templates');
    expect(qt?.label).toBe('견적 템플릿');
    expect(qt?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'q' });

    const buyer = getNavConfig('buyer').sections.find((s) => s.id === 'settings');
    expect(
      buyer?.links?.some((l) => l.href === '/settings/quote-templates'),
    ).toBe(false);
  });
});

describe('getBreadcrumbSegments', () => {
  it('maps /home and /notifications to a single current-page segment (no href)', () => {
    expect(getBreadcrumbSegments('/home')).toEqual([{ label: '홈' }]);
    expect(getBreadcrumbSegments('/notifications')).toEqual([{ label: '알림' }]);
  });

  it('makes the parent RFP segment a link to /rfp and the status the current page', () => {
    expect(getBreadcrumbSegments('/rfp', 'active')).toEqual([
      { label: '견적 요청', href: '/rfp' },
      { label: '진행중' },
    ]);
    expect(getBreadcrumbSegments('/rfp')).toEqual([{ label: '견적 요청' }]);
  });

  it('makes the parent 받은 RFP segment a link to /inbox and the status the current page', () => {
    expect(getBreadcrumbSegments('/inbox', 'new')).toEqual([
      { label: '받은 견적 요청', href: '/inbox' },
      { label: '신규' },
    ]);
    expect(getBreadcrumbSegments('/inbox')).toEqual([{ label: '받은 견적 요청' }]);
  });

  it('maps /opportunities to a single 견적 기회 segment', () => {
    expect(getBreadcrumbSegments('/opportunities')).toEqual([{ label: '견적 기회' }]);
  });

  it('links the 설정 parent to /settings/profile with the sub-page as the current page', () => {
    expect(getBreadcrumbSegments('/settings/profile')).toEqual([
      { label: '설정', href: '/settings/profile' },
      { label: '프로필' },
    ]);
    expect(getBreadcrumbSegments('/settings/members')).toEqual([
      { label: '설정', href: '/settings/profile' },
      { label: '멤버' },
    ]);
    expect(getBreadcrumbSegments('/settings/quote-templates')).toEqual([
      { label: '설정', href: '/settings/profile' },
      { label: '견적 템플릿' },
    ]);
  });

  it('returns an empty array for unknown paths', () => {
    expect(getBreadcrumbSegments('/rfp/new')).toEqual([]);
  });
});

describe('getChordMap', () => {
  it('routes the buyer "g" chords incl. submenu (statuses 1-3, 새 RFP c, messages m, settings p/t)', () => {
    expect(getChordMap('buyer')).toEqual({
      h: '/home',
      n: '/notifications',
      m: '/messages',
      r: '/rfp',
      s: '/settings/profile',
      '1': '/rfp?status=active',
      '2': '/rfp?status=closed',
      '3': '/rfp?status=awarded',
      c: '/rfp/new',
      p: '/settings/profile',
      t: '/settings/members',
    });
  });

  it('routes the pg "g" chords (i for inbox, no r/c) incl. messages m, inbox statuses 1-3', () => {
    expect(getChordMap('pg')).toEqual({
      h: '/home',
      n: '/notifications',
      m: '/messages',
      i: '/inbox',
      o: '/opportunities',
      s: '/settings/profile',
      '1': '/inbox?status=new',
      '2': '/inbox?status=submitted',
      '3': '/inbox?status=closed',
      p: '/settings/profile',
      t: '/settings/members',
      q: '/settings/quote-templates',
    });
  });

  it('assigns no chord key to two destinations (collision guard) for both workspaces', () => {
    for (const ws of ['buyer', 'pg'] as const) {
      const { top, sections } = getNavConfig(ws);
      const keys: string[] = [];
      for (const item of [...top, ...sections]) {
        if (item.shortcut?.kind === 'chord') keys.push(item.shortcut.key);
      }
      for (const section of sections) {
        for (const link of section.links ?? []) {
          if (link.shortcut?.kind === 'chord') keys.push(link.shortcut.key);
        }
        for (const s of section.statuses ?? []) {
          if (s.shortcut?.kind === 'chord') keys.push(s.shortcut.key);
        }
      }
      expect(keys.length).toBe(new Set(keys).size);
    }
  });
});

describe('submenu shortcuts', () => {
  it('assigns buyer RFP status sub-items numeric chords by display order', () => {
    const rfp = getNavConfig('buyer').sections.find((s) => s.id === 'rfp');
    expect(rfp?.statuses?.map((s) => s.shortcut)).toEqual([
      { kind: 'chord', lead: 'g', key: '1' },
      { kind: 'chord', lead: 'g', key: '2' },
      { kind: 'chord', lead: 'g', key: '3' },
    ]);
  });

  it('assigns the 새 RFP link a G C chord (⌘N replacement)', () => {
    const rfp = getNavConfig('buyer').sections.find((s) => s.id === 'rfp');
    expect(rfp?.links?.[0]?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'c' });
  });

  it('assigns settings sub-links G P (프로필) and G T (멤버)', () => {
    const settings = getNavConfig('buyer').sections.find((s) => s.id === 'settings');
    expect(settings?.links?.map((l) => l.shortcut)).toEqual([
      { kind: 'chord', lead: 'g', key: 'p' },
      { kind: 'chord', lead: 'g', key: 't' },
    ]);
  });

  it('assigns pg inbox status sub-items numeric chords by display order', () => {
    const inbox = getNavConfig('pg').sections.find((s) => s.id === 'inbox');
    expect(inbox?.statuses?.map((s) => s.shortcut)).toEqual([
      { kind: 'chord', lead: 'g', key: '1' },
      { kind: 'chord', lead: 'g', key: '2' },
      { kind: 'chord', lead: 'g', key: '3' },
    ]);
  });
});
