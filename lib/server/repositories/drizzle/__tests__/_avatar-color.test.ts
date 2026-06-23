import { describe, expect, it } from 'vitest';
import { normalizeAvatarColor, VALID_AVATAR_COLORS } from '../_avatar-color';

describe('normalizeAvatarColor', () => {
  it.each(VALID_AVATAR_COLORS)('유효한 색상 "%s"은 그대로 반환한다', (color) => {
    expect(normalizeAvatarColor(color)).toBe(color);
  });

  it('null이면 ink로 폴백한다', () => {
    expect(normalizeAvatarColor(null)).toBe('ink');
  });

  it('undefined이면 ink로 폴백한다', () => {
    expect(normalizeAvatarColor(undefined)).toBe('ink');
  });

  it('유효하지 않은 문자열이면 ink로 폴백한다', () => {
    expect(normalizeAvatarColor('neon-pink')).toBe('ink');
  });
});
