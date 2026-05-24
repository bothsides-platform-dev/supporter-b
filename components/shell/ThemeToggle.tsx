'use client';

import { useEffect, useState } from 'react';
import { useThemeStore } from '@/lib/stores/theme';
import { IconButton } from '@/components/primitives/IconButton';
import { SunIcon, MoonIcon } from '@/components/icons';

export function ThemeToggle() {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Before mount: always render light-mode icon so server and client HTML match.
  // Zustand persist rehydrates from localStorage synchronously, which would
  // produce a different icon on the client → hydration mismatch without this guard.
  const isDark = mounted && resolvedTheme === 'dark';

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
