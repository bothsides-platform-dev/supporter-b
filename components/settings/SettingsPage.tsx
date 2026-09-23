import type { ComponentProps, ReactNode } from 'react';
import { PageHeader } from '@/components/shell/PageHeader';

type SettingsPageProps = Pick<ComponentProps<typeof PageHeader>, 'title' | 'action'> & {
  children: ReactNode;
};

/** 목록 화면과 같은 헤더를 쓰고, 설정 셸 높이에 맞춰 본문만 스크롤한다. */
export function SettingsPage({ children, ...header }: SettingsPageProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <PageHeader {...header} className="shrink-0" />
      <div className="min-h-0 min-w-0 flex-1 space-y-8 overflow-y-auto px-6 py-6">
        {children}
      </div>
    </div>
  );
}
