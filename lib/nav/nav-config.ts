import type { ComponentType, SVGProps } from 'react';
import {
  HomeIcon,
  BellIcon,
  EnvelopeIcon,
  FileTextIcon,
  InboxIcon,
  SettingsIcon,
  LayoutTemplateIcon,
  FileSignatureIcon,
} from '@/components/icons';
import type { WorkspaceType } from '@/lib/types/workspace';
import { OPEN_BOARD_ENABLED } from '@/lib/features/open-board';

export type IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & { size?: number }
>;

// A keyboard hint for a nav destination. v0 navigation uses Linear-style "G then
// X" chords; `modifier` covers ⌘/Ctrl combos (e.g. the search bar's ⌘K).
export type NavShortcut =
  | { kind: 'chord'; lead: 'g'; key: string }
  | { kind: 'modifier'; key: string };

export type NavLeaf = {
  id: string;
  label: string;
  href: string;
  icon?: IconComponent;
  shortcut?: NavShortcut;
};

export type NavStatusItem = {
  status: string;
  label: string;
  shortcut?: NavShortcut;
};

export type NavSection = {
  id: 'rfp' | 'inbox' | 'settings';
  label: string;
  href: string;
  icon?: IconComponent;
  shortcut?: NavShortcut;
  base?: string;
  statuses?: NavStatusItem[];
  links?: NavLeaf[];
};

export type NavConfig = {
  top: NavLeaf[];
  sections: NavSection[];
};

// Single source of truth for status → Korean label, shared by the sidebar
// status sub-items and the breadcrumb. Keyed by section base path.
const STATUS_LABELS = {
  '/rfp': {
    active: '진행중',
    closed: '마감',
  },
  '/inbox': {
    new: '신규',
    submitted: '견적 보냄',
    closed: '마감',
  },
} as const;

// Status sub-items get sequential "G then 1..4" chords by display order. The
// two workspace types never co-exist, so /rfp and /inbox reuse 1-4 freely.
function statusItems(base: '/rfp' | '/inbox'): NavStatusItem[] {
  return Object.entries(STATUS_LABELS[base]).map(([status, label], i) => ({
    status,
    label,
    shortcut: { kind: 'chord', lead: 'g', key: String(i + 1) },
  }));
}

const RFP_SECTION: NavSection = {
  id: 'rfp',
  label: '견적 요청',
  href: '/rfp',
  base: '/rfp',
  icon: FileTextIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 'r' },
  statuses: statusItems('/rfp'),
  links: [
    {
      id: 'rfp-new',
      label: '새 견적 요청',
      href: '/rfp-create',
      // G then C (Create). Replaces ⌘N, which the browser claims for "new window".
      shortcut: { kind: 'chord', lead: 'g', key: 'c' },
    },
  ],
};

const INBOX_SECTION: NavSection = {
  id: 'inbox',
  label: '받은 견적 요청',
  href: '/inbox',
  base: '/inbox',
  icon: InboxIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 'i' },
  statuses: statusItems('/inbox'),
  links: [
    {
      id: 'opportunities',
      label: '참여 가능한 견적',
      href: '/opportunities',
      // G then O (Opportunities) — h/n/m/i/s/p/t/1-3 are taken for pg.
      shortcut: { kind: 'chord', lead: 'g', key: 'o' },
    },
  ],
};

const SETTINGS_SECTION: NavSection = {
  id: 'settings',
  label: '설정',
  href: '/settings/profile',
  base: '/settings',
  icon: SettingsIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 's' },
  links: [
    {
      id: 'settings-profile',
      label: '프로필',
      href: '/settings/profile',
      shortcut: { kind: 'chord', lead: 'g', key: 'p' },
    },
    {
      id: 'settings-members',
      label: '멤버',
      href: '/settings/members',
      // G then T (Team) — moved off M so 메시지 can claim the mnemonic G M.
      shortcut: { kind: 'chord', lead: 'g', key: 't' },
    },
    {
      // 감사 로그 (C5) — 페이지 자체가 admin 게이트 (nav 는 role 비인지).
      id: 'settings-audit-log',
      label: '활동 기록',
      href: '/settings/audit-log',
    },
  ],
};

const HOME: NavLeaf = {
  id: 'home',
  label: '홈',
  href: '/home',
  icon: HomeIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 'h' },
};

const NOTIFICATIONS: NavLeaf = {
  id: 'notifications',
  label: '알림',
  href: '/notifications',
  icon: BellIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 'n' },
};

const MESSAGES: NavLeaf = {
  id: 'messages',
  label: '메시지',
  href: '/messages',
  icon: EnvelopeIcon,
  // G then M (Messages) — h/n/r/i/s/c/p/t/1-4 are taken.
  shortcut: { kind: 'chord', lead: 'g', key: 'm' },
};

// 견적 템플릿은 PG 전용 — top 배열에 추가해 홈·알림·메시지와 같은 레이어로 노출.
const QUOTE_TEMPLATES: NavLeaf = {
  id: 'quote-templates',
  label: '견적 템플릿',
  href: '/quote-templates',
  icon: LayoutTemplateIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 'q' },
};

// 계약서 템플릿도 PG 전용 — 자사 계약서를 스노우싸인 템플릿으로 1회 등록해 링크한다.
const SIGNING_TEMPLATES: NavLeaf = {
  id: 'signing-templates',
  label: '계약서 템플릿',
  href: '/signing-templates',
  icon: FileSignatureIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 'e' },
};

// 오픈게시판이 꺼져 있으면 PG inbox 섹션에서 '참여 가능한 견적'(opportunities)
// 진입점을 제거한다. getNavConfig 를 통해 사이드바·단축키·팔레트 nav 가 한 번에 반영된다.
function inboxSection(): NavSection {
  if (OPEN_BOARD_ENABLED) return INBOX_SECTION;
  return {
    ...INBOX_SECTION,
    links: (INBOX_SECTION.links ?? []).filter((l) => l.id !== 'opportunities'),
  };
}

export function getNavConfig(workspaceType: WorkspaceType): NavConfig {
  const workspaceSection = workspaceType === 'buyer' ? RFP_SECTION : inboxSection();
  const top: NavLeaf[] =
    workspaceType === 'pg'
      ? [HOME, NOTIFICATIONS, MESSAGES, QUOTE_TEMPLATES, SIGNING_TEMPLATES]
      : [HOME, NOTIFICATIONS, MESSAGES];

  return {
    top,
    sections: [workspaceSection, SETTINGS_SECTION],
  };
}

// A single navigable destination for the command palette (Cmd+K). Flattened
// from the nav tree so the palette never re-declares routes — nav-config stays
// the single source of truth.
export type NavCommand = {
  id: string;
  label: string;
  href: string;
  shortcut?: NavShortcut;
};

// Flatten the workspace-scoped nav tree (top items + workspace section + its
// statuses/links + settings links) into a flat command list. A section's base
// is emitted only when it isn't already one of that section's links — so
// /settings (an alias for the profile link) doesn't double-emit, while /rfp
// (a distinct list page) does. Deduped by href as a safety net.
export function getNavCommands(workspaceType: WorkspaceType): NavCommand[] {
  const { top, sections } = getNavConfig(workspaceType);
  const out: NavCommand[] = [];
  const seen = new Set<string>();
  const push = (cmd: NavCommand) => {
    if (seen.has(cmd.href)) return;
    seen.add(cmd.href);
    out.push(cmd);
  };

  for (const item of top) {
    push({ id: item.id, label: item.label, href: item.href, shortcut: item.shortcut });
  }

  for (const section of sections) {
    const linkHrefs = new Set((section.links ?? []).map((l) => l.href));
    if (!linkHrefs.has(section.href)) {
      push({
        id: section.id,
        label: section.label,
        href: section.href,
        shortcut: section.shortcut,
      });
    }
    for (const s of section.statuses ?? []) {
      push({
        id: `${section.id}-${s.status}`,
        label: `${section.label} · ${s.label}`,
        href: `${section.base}?status=${s.status}`,
        shortcut: s.shortcut,
      });
    }
    for (const link of section.links ?? []) {
      push({ id: link.id, label: link.label, href: link.href, shortcut: link.shortcut });
    }
  }

  return out;
}

// Account commands for the palette's "계정" group. Separate from the nav tree
// because they must not appear in the Sidebar or breadcrumbs. `navigate` items
// use router.push; `logout` uses window.location.assign('/logout') for the
// full-document-navigation required to clear the session cookie in one round-trip.
export type AccountCommand =
  | { id: string; label: string; kind: 'navigate'; href: string }
  | { id: string; label: string; kind: 'logout' };

export function getAccountCommands(): AccountCommand[] {
  return [
    { id: 'account-settings', label: '설정', kind: 'navigate', href: '/settings/profile' },
    { id: 'account-logout', label: '로그아웃', kind: 'logout' },
  ];
}

// One breadcrumb segment. The current page (last segment) has no `href`; every
// ancestor segment carries the `href` to navigate to when clicked.
export type BreadcrumbSegment = { label: string; href?: string };

// Derive breadcrumb segments from the current path (+ optional status param).
// Path-based, so it works regardless of workspace type. Unknown paths → [].
export function getBreadcrumbSegments(
  pathname: string,
  status?: string | null,
): BreadcrumbSegment[] {
  if (pathname === '/home') return [{ label: '홈' }];
  if (pathname === '/notifications') return [{ label: '알림' }];
  if (pathname === '/messages') return [{ label: '메시지' }];
  if (pathname === '/quote-templates') return [{ label: '견적 템플릿' }];
  if (pathname === '/signing-templates') return [{ label: '계약서 템플릿' }];
  if (pathname === '/opportunities') return [{ label: '참여 가능한 견적' }];
  if (pathname === '/rfp-create') {
    return [{ label: '견적 요청', href: '/rfp' }, { label: '새 견적 요청' }];
  }
  if (pathname === '/rfp') {
    const label = status ? STATUS_LABELS['/rfp'][status as keyof typeof STATUS_LABELS['/rfp']] : undefined;
    return label ? [{ label: '견적 요청', href: '/rfp' }, { label }] : [{ label: '견적 요청' }];
  }
  if (pathname === '/inbox') {
    const label = status ? STATUS_LABELS['/inbox'][status as keyof typeof STATUS_LABELS['/inbox']] : undefined;
    return label ? [{ label: '받은 견적 요청', href: '/inbox' }, { label }] : [{ label: '받은 견적 요청' }];
  }
  if (pathname === '/settings/profile') {
    return [{ label: '설정', href: '/settings/profile' }, { label: '프로필' }];
  }
  if (pathname === '/settings/members') {
    return [{ label: '설정', href: '/settings/profile' }, { label: '멤버' }];
  }
  if (pathname === '/settings/audit-log') {
    return [{ label: '설정', href: '/settings/profile' }, { label: '활동 기록' }];
  }
  return [];
}

// Map of the second chord key → destination, for "G then X" navigation.
export function getChordMap(workspaceType: WorkspaceType): Record<string, string> {
  const { top, sections } = getNavConfig(workspaceType);
  const map: Record<string, string> = {};
  for (const item of [...top, ...sections]) {
    if (item.shortcut?.kind === 'chord') map[item.shortcut.key] = item.href;
  }
  for (const section of sections) {
    for (const link of section.links ?? []) {
      if (link.shortcut?.kind === 'chord') map[link.shortcut.key] = link.href;
    }
    for (const s of section.statuses ?? []) {
      if (s.shortcut?.kind === 'chord') {
        map[s.shortcut.key] = `${section.base}?status=${s.status}`;
      }
    }
  }
  return map;
}
