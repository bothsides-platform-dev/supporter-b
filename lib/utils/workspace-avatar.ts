export type WorkspaceAvatarColor = { bg: string; fg: string };

export const WORKSPACE_AVATAR_COLORS: WorkspaceAvatarColor[] = [
  { bg: 'var(--workspace-avatar-blue-bg)',   fg: 'var(--workspace-avatar-blue-fg)'   },
  { bg: 'var(--workspace-avatar-purple-bg)', fg: 'var(--workspace-avatar-purple-fg)' },
  { bg: 'var(--workspace-avatar-teal-bg)',   fg: 'var(--workspace-avatar-teal-fg)'   },
  { bg: 'var(--workspace-avatar-orange-bg)', fg: 'var(--workspace-avatar-orange-fg)' },
  { bg: 'var(--workspace-avatar-pink-bg)',   fg: 'var(--workspace-avatar-pink-fg)'   },
  { bg: 'var(--workspace-avatar-slate-bg)',  fg: 'var(--workspace-avatar-slate-fg)'  },
];

const LEGAL_PREFIX_RE = /^\([주유합사재]\)\s*/;

export function getWorkspaceInitials(name: string): string {
  const stripped = name.replace(LEGAL_PREFIX_RE, '').trim();
  if (!stripped) return '?';
  const words = stripped.split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return words[0][0].toUpperCase();
}

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash;
}

// Hashes the raw (unstripped) stored name — '(주)토스페이먼츠' and '토스페이먼츠' get different colors by design.
export function getWorkspaceColor(name: string): WorkspaceAvatarColor {
  const idx = djb2(name) % WORKSPACE_AVATAR_COLORS.length;
  return WORKSPACE_AVATAR_COLORS[idx];
}
