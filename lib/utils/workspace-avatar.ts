export type WorkspaceAvatarColor = { bg: string; fg: string };

export const WORKSPACE_AVATAR_COLORS: WorkspaceAvatarColor[] = [
  { bg: '#162236', fg: '#6aadff' }, // blue
  { bg: '#231a45', fg: '#b59fff' }, // purple
  { bg: '#0e2e25', fg: '#4fd1a8' }, // teal
  { bg: '#2a1a10', fg: '#f5a05a' }, // orange
  { bg: '#2e1029', fg: '#f07bb8' }, // pink
  { bg: '#1c2030', fg: '#8aabcf' }, // slate
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

export function getWorkspaceColor(name: string): WorkspaceAvatarColor {
  const idx = djb2(name) % WORKSPACE_AVATAR_COLORS.length;
  return WORKSPACE_AVATAR_COLORS[idx];
}
