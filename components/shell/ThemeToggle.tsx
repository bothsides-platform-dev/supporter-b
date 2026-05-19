'use client';

import { useThemeStore } from '@/lib/stores/theme';
import { IconButton } from '@/components/primitives/IconButton';
import { SunIcon, MoonIcon } from '@/components/icons';

export function ThemeToggle() {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const isDark = resolvedTheme === 'dark';

  return (
    <IconButton
      label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      size="sm"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </IconButton>
  );
}
