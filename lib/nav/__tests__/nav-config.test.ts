import { describe, it, expect } from 'vitest';
import {
  getNavConfig,
  getBreadcrumbSegments,
  getChordMap,
} from '../nav-config';

describe('getNavConfig — top item order', () => {
  it('lists 홈 then 알림 (workspace nav is a section)', () => {
    expect(getNavConfig('buyer').top.map((i) => i.id)).toEqual([
      'home',
      'notifications',
    ]);
    expect(getNavConfig('pg').top.map((i) => i.id)).toEqual([
      'home',
      'notifications',
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
    }
  });
});

describe('getNavConfig — buyer RFP section', () => {
  it('puts RFP in sections with status sub-items and 새 RFP link', () => {
    const { top, sections } = getNavConfig('buyer');
    expect(top.some((i) => i.id === 'rfp')).toBe(false);
    expect(sections.map((s) => s.id)).toEqual(['rfp', 'settings']);

    const rfp = sections.find((s) => s.id === 'rfp');
    expect(rfp?.label).toBe('RFP');
    expect(rfp?.href).toBe('/rfp');
    expect(rfp?.base).toBe('/rfp');
    expect(rfp?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'r' });
    expect(rfp?.statuses?.map((s) => s.status)).toEqual([
      'draft',
      'active',
      'closed',
      'awarded',
    ]);
    expect(rfp?.statuses?.map((s) => s.label)).toEqual([
      '작성중',
      '진행중',
      '마감',
      '계약완료',
    ]);
    expect(rfp?.links?.map((l) => l.href)).toEqual(['/rfp/new']);
    expect(rfp?.links?.[0]?.label).toBe('새 RFP');
  });
});

describe('getNavConfig — pg inbox section', () => {
  it('puts 받은 RFP in sections with status sub-items and no 새 RFP link', () => {
    const { top, sections } = getNavConfig('pg');
    expect(top.some((i) => i.id === 'inbox')).toBe(false);
    expect(sections.map((s) => s.id)).toEqual(['inbox', 'settings']);

    const inbox = sections.find((s) => s.id === 'inbox');
    expect(inbox?.label).toBe('받은 RFP');
    expect(inbox?.href).toBe('/inbox');
    expect(inbox?.base).toBe('/inbox');
    expect(inbox?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'i' });
    expect(inbox?.statuses?.map((s) => s.status)).toEqual([
      'new',
      'draft',
      'submitted',
      'closed',
    ]);
    expect(inbox?.statuses?.map((s) => s.label)).toEqual([
      '신규',
      '작성중',
      '제출완료',
      '마감',
    ]);
    expect(inbox?.links).toBeUndefined();
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
});

describe('getBreadcrumbSegments', () => {
  it('maps /home and /notifications to a single current-page segment (no href)', () => {
    expect(getBreadcrumbSegments('/home')).toEqual([{ label: '홈' }]);
    expect(getBreadcrumbSegments('/notifications')).toEqual([{ label: '알림' }]);
  });

  it('makes the parent RFP segment a link to /rfp and the status the current page', () => {
    expect(getBreadcrumbSegments('/rfp', 'active')).toEqual([
      { label: 'RFP', href: '/rfp' },
      { label: '진행중' },
    ]);
    expect(getBreadcrumbSegments('/rfp')).toEqual([{ label: 'RFP' }]);
  });

  it('makes the parent 받은 RFP segment a link to /inbox and the status the current page', () => {
    expect(getBreadcrumbSegments('/inbox', 'new')).toEqual([
      { label: '받은 RFP', href: '/inbox' },
      { label: '신규' },
    ]);
    expect(getBreadcrumbSegments('/inbox')).toEqual([{ label: '받은 RFP' }]);
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
  });

  it('returns an empty array for unknown paths', () => {
    expect(getBreadcrumbSegments('/rfp/new')).toEqual([]);
  });
});

describe('getChordMap', () => {
  it('routes the buyer "g" chords to their destinations', () => {
    expect(getChordMap('buyer')).toEqual({
      h: '/home',
      n: '/notifications',
      r: '/rfp',
      s: '/settings/profile',
    });
  });

  it('routes the pg "g" chords (i for inbox, no r)', () => {
    expect(getChordMap('pg')).toEqual({
      h: '/home',
      n: '/notifications',
      i: '/inbox',
      s: '/settings/profile',
    });
  });
});
