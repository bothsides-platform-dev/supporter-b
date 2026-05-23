import { describe, it, expect } from 'vitest';
import {
  getNavConfig,
  getBreadcrumbSegments,
  getChordMap,
} from '../nav-config';

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

describe('getNavConfig — buyer sections', () => {
  it('has an RFP section (g r) with the four buyer statuses and a settings section', () => {
    const { sections } = getNavConfig('buyer');
    const rfp = sections.find((s) => s.id === 'rfp');
    expect(rfp?.label).toBe('RFP');
    expect(rfp?.href).toBe('/rfp');
    expect(rfp?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'r' });
    expect(rfp?.statuses?.map((s) => s.label)).toEqual([
      '작성중',
      '진행중',
      '마감',
      '계약완료',
    ]);
    expect(sections.some((s) => s.id === 'inbox')).toBe(false);
    expect(sections.some((s) => s.id === 'settings')).toBe(true);
  });
});

describe('getNavConfig — pg sections', () => {
  it('has a 받은 RFP section (g i) with the four inbox statuses, no RFP section', () => {
    const { sections } = getNavConfig('pg');
    const inbox = sections.find((s) => s.id === 'inbox');
    expect(inbox?.label).toBe('받은 RFP');
    expect(inbox?.href).toBe('/inbox');
    expect(inbox?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'i' });
    expect(inbox?.statuses?.map((s) => s.status)).toEqual([
      'new',
      'draft',
      'submitted',
      'closed',
    ]);
    expect(sections.some((s) => s.id === 'rfp')).toBe(false);
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
  it('maps /home and /notifications to single labels', () => {
    expect(getBreadcrumbSegments('/home')).toEqual(['홈']);
    expect(getBreadcrumbSegments('/notifications')).toEqual(['알림']);
  });

  it('maps /rfp with a status to RFP / <label>', () => {
    expect(getBreadcrumbSegments('/rfp', 'active')).toEqual(['RFP', '진행중']);
    expect(getBreadcrumbSegments('/rfp')).toEqual(['RFP']);
  });

  it('maps /inbox with a status to 받은 RFP / <label>', () => {
    expect(getBreadcrumbSegments('/inbox', 'new')).toEqual(['받은 RFP', '신규']);
    expect(getBreadcrumbSegments('/inbox')).toEqual(['받은 RFP']);
  });

  it('maps settings sub-pages to 설정 / <label>', () => {
    expect(getBreadcrumbSegments('/settings/profile')).toEqual(['설정', '프로필']);
    expect(getBreadcrumbSegments('/settings/members')).toEqual(['설정', '멤버']);
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
