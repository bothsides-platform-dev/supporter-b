// 설정 콘텐츠에 전체 높이를 제공하고, 페이지별 본문 스크롤은 SettingsPage가 소유한다.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {children}
    </div>
  );
}
