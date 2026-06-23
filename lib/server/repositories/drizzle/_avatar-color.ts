export const VALID_AVATAR_COLORS = [
  'lavender',
  'amber',
  'moss',
  'accent',
  'terra',
  'ink',
] as const;
export type AvatarColor = (typeof VALID_AVATAR_COLORS)[number];

export function normalizeAvatarColor(raw: string | null | undefined): AvatarColor {
  return (VALID_AVATAR_COLORS as readonly string[]).includes(raw ?? '')
    ? (raw as AvatarColor)
    : 'ink';
}
