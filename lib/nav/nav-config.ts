import type { ComponentType, SVGProps } from 'react';
import {
  HomeIcon,
  BellIcon,
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

export type NavStatusItem = { status: string; label: string };

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
    draft: '작성중',
    active: '진행중',
    closed: '마감',
    awarded: '계약완료',
  },
  '/inbox': {
    new: '신규',
    draft: '작성중',
    submitted: '제출완료',
    closed: '마감',
  },
} as const;

function statusItems(base: '/rfp' | '/inbox'): NavStatusItem[] {
  return Object.entries(STATUS_LABELS[base]).map(([status, label]) => ({
    status,
    label,
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
  links: [{ id: 'rfp-new', label: '새 RFP', href: '/rfp/new' }],
};

const INBOX_SECTION: NavSection = {
  id: 'inbox',
  label: '받은 RFP',
  href: '/inbox',
  base: '/inbox',
  icon: InboxIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 'i' },
  statuses: statusItems('/inbox'),
};

const SETTINGS_SECTION: NavSection = {
  id: 'settings',
  label: '설정',
  href: '/settings/profile',
  base: '/settings',
  icon: SettingsIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 's' },
  links: [
    { id: 'settings-profile', label: '프로필', href: '/settings/profile' },
    { id: 'settings-members', label: '멤버', href: '/settings/members' },
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

export function getNavConfig(workspaceType: WorkspaceType): NavConfig {
  const workspaceSection = workspaceType === 'buyer' ? RFP_SECTION : INBOX_SECTION;

  return {
    top: [HOME, NOTIFICATIONS],
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
  return map;
}
