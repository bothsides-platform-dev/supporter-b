import type { ComponentType, SVGProps } from 'react';
import {
  HomeIcon,
  BellIcon,
  EnvelopeIcon,
  FileTextIcon,
  InboxIcon,
  SettingsIcon,
} from '@/components/icons';
import type { WorkspaceType } from '@/lib/types/workspace';

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
    awarded: '계약완료',
  },
  '/inbox': {
    new: '신규',
    submitted: '제출완료',
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
  label: 'RFP',
  href: '/rfp',
  base: '/rfp',
  icon: FileTextIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 'r' },
  statuses: statusItems('/rfp'),
  links: [
    {
      id: 'rfp-new',
      label: '새 RFP',
      href: '/rfp/new',
      // G then C (Create). Replaces ⌘N, which the browser claims for "new window".
      shortcut: { kind: 'chord', lead: 'g', key: 'c' },
    },
  ],
};

const INBOX_SECTION: NavSection = {
  id: 'inbox',
  label: '받은 RFP',
  href: '/inbox',
  base: '/inbox',
  icon: InboxIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 'i' },
  statuses: statusItems('/inbox'),
  links: [
    {
      id: 'opportunities',
      label: '제안 기회',
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

export function getNavConfig(workspaceType: WorkspaceType): NavConfig {
  const workspaceSection = workspaceType === 'buyer' ? RFP_SECTION : INBOX_SECTION;

  return {
    top: [HOME, NOTIFICATIONS, MESSAGES],
    sections: [workspaceSection, SETTINGS_SECTION],
  };
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
  if (pathname === '/opportunities') return [{ label: '제안 기회' }];
  if (pathname === '/rfp') {
    const label = status ? STATUS_LABELS['/rfp'][status as keyof typeof STATUS_LABELS['/rfp']] : undefined;
    return label ? [{ label: 'RFP', href: '/rfp' }, { label }] : [{ label: 'RFP' }];
  }
  if (pathname === '/inbox') {
    const label = status ? STATUS_LABELS['/inbox'][status as keyof typeof STATUS_LABELS['/inbox']] : undefined;
    return label ? [{ label: '받은 RFP', href: '/inbox' }, { label }] : [{ label: '받은 RFP' }];
  }
  if (pathname === '/settings/profile') {
    return [{ label: '설정', href: '/settings/profile' }, { label: '프로필' }];
  }
  if (pathname === '/settings/members') {
    return [{ label: '설정', href: '/settings/profile' }, { label: '멤버' }];
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
