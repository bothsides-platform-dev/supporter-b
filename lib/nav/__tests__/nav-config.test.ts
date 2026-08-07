import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/features/open-board', () => ({ OPEN_BOARD_ENABLED: true }));
vi.mock('@/lib/features/contract-templates', () => ({ CONTRACT_TEMPLATES_ENABLED: true }));
import {
  getNavConfig,
  getBreadcrumbSegments,
  getChordMap,
} from '../nav-config';

describe('getNavConfig — top item order', () => {
  it('pg top includes quote-templates after messages; buyer top does not', () => {
    expect(getNavConfig('buyer').top.map((i) => i.id)).toEqual([
      'home',
      'notifications',
      'messages',
    ]);
    expect(getNavConfig('pg').top.map((i) => i.id)).toEqual([
      'home',
      'notifications',
      'messages',
      'quote-templates',
      'contract-templates',
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
    ]);
    expect(rfp?.statuses?.map((s) => s.label)).toEqual([
      '진행중',
      '마감',
    ]);
    expect(rfp?.links?.map((l) => l.href)).toEqual(['/rfp-create']);
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
    expect(inbox?.links?.[0]?.label).toBe('참여 가능한 견적');
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
      '/settings/audit-log',
    ]);
  });

  it('PG top has 견적 템플릿 NavLeaf (g q, /quote-templates); settings has no such link', () => {
    const pgTop = getNavConfig('pg').top;
    const qt = pgTop.find((i) => i.id === 'quote-templates');
    expect(qt?.label).toBe('견적 템플릿');
    expect(qt?.href).toBe('/quote-templates');
    expect(qt?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'q' });

    // settings links must not contain quote-templates for either workspace type
    for (const ws of ['buyer', 'pg'] as const) {
      const settings = getNavConfig(ws).sections.find((s) => s.id === 'settings');
      expect(settings?.links?.map((l) => l.href)).toEqual([
        '/settings/profile',
        '/settings/members',
        '/settings/audit-log',
      ]);
    }

    const buyerTop = getNavConfig('buyer').top;
    expect(buyerTop.some((i) => i.id === 'quote-templates')).toBe(false);
  });

  it('PG top has 계약서 템플릿 NavLeaf (g c, /contract-templates); settings has no such link', () => {
    const pgTop = getNavConfig('pg').top;
    const ct = pgTop.find((i) => i.id === 'contract-templates');
    expect(ct?.label).toBe('계약서 템플릿');
    expect(ct?.href).toBe('/contract-templates');
    expect(ct?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'c' });

    for (const ws of ['buyer', 'pg'] as const) {
      const settings = getNavConfig(ws).sections.find((s) => s.id === 'settings');
      expect(settings?.links?.map((l) => l.href)).toEqual([
        '/settings/profile',
        '/settings/members',
        '/settings/audit-log',
      ]);
    }

    const buyerTop = getNavConfig('buyer').top;
    expect(buyerTop.some((i) => i.id === 'contract-templates')).toBe(false);
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

  it('maps /opportunities to a single 참여 가능한 견적 segment', () => {
    expect(getBreadcrumbSegments('/opportunities')).toEqual([{ label: '참여 가능한 견적' }]);
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
    // /settings/quote-templates는 삭제된 라우트 → unknown path
    expect(getBreadcrumbSegments('/settings/quote-templates')).toEqual([]);
  });

  it('/quote-templates maps to a single 견적 템플릿 segment', () => {
    expect(getBreadcrumbSegments('/quote-templates')).toEqual([{ label: '견적 템플릿' }]);
  });

  it('/contract-templates maps to a single 계약서 템플릿 segment', () => {
    expect(getBreadcrumbSegments('/contract-templates')).toEqual([{ label: '계약서 템플릿' }]);
  });

  it('returns an empty array for unknown paths', () => {
    expect(getBreadcrumbSegments('/rfp/unknown-path')).toEqual([]);
  });

  it('/rfp-create shows "견적 요청" parent link + "새 견적 요청" current page', () => {
    expect(getBreadcrumbSegments('/rfp-create')).toEqual([
      { label: '견적 요청', href: '/rfp' },
      { label: '새 견적 요청' },
    ]);
  });

  it('/rfp-create ignores status param (not applicable to the create route)', () => {
    expect(getBreadcrumbSegments('/rfp-create', 'active')).toEqual([
      { label: '견적 요청', href: '/rfp' },
      { label: '새 견적 요청' },
    ]);
  });
});

describe('getChordMap', () => {
  it('routes the buyer "g" chords incl. submenu (statuses 1-2, 새 RFP c, messages m, settings p/t)', () => {
    expect(getChordMap('buyer')).toEqual({
      h: '/home',
      n: '/notifications',
      m: '/messages',
      r: '/rfp',
      s: '/settings/profile',
      '1': '/rfp?status=active',
      '2': '/rfp?status=closed',
      c: '/rfp-create',
      p: '/settings/profile',
      t: '/settings/members',
    });
  });

  it('routes the pg "g" chords (q → /quote-templates, c → /contract-templates, not /settings/quote-templates)', () => {
    expect(getChordMap('pg')).toEqual({
      h: '/home',
      n: '/notifications',
      m: '/messages',
      q: '/quote-templates',
      c: '/contract-templates',
      i: '/inbox',
      o: '/opportunities',
      s: '/settings/profile',
      '1': '/inbox?status=new',
      '2': '/inbox?status=submitted',
      '3': '/inbox?status=closed',
      p: '/settings/profile',
      t: '/settings/members',
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
      undefined, // 활동 기록 — chord 미배정 (G 키 공간 포화)
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
