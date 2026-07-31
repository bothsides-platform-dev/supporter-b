'use client';

import { IconButton } from '@/components/primitives/IconButton';
import { SunIcon, MoonIcon } from '@/components/icons';
import { useThemeToggle } from '@/components/shell/use-theme-toggle';

/**
 * 정사각 아이콘 버튼 형태의 테마 토글 — 랜딩·공개 페이지 푸터(`shell/Footer`)용.
 *
 * 사이드바 푸터는 이걸 쓰지 않는다. 거기선 문의하기와 같은 라벨 행이어야 해서
 * `SidebarFooterControls` 가 같은 훅으로 자기 모양을 직접 그린다.
 */
export function ThemeToggle() {
  const { isDark, label, toggleFrom } = useThemeToggle();

  return (
    <IconButton label={label} size="md" onClick={(e) => toggleFrom(e.currentTarget)}>
      {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </IconButton>
  );
}
