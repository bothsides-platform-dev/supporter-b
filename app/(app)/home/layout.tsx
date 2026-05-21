// 홈(칸반) 세그먼트 레이아웃 — 가로채기 모달 병렬 슬롯(@modal)을 이 레벨에 둔다.
// 슬롯이 home 아래에 있으므로, /home(칸반)에서 출발한 soft-nav 만 (..)rfp·(..)inbox
// 인터셉터로 가로채져 모달로 뜬다. /rfp·/inbox 목록 등 다른 세그먼트에서 출발하면
// 이 슬롯이 활성 트리에 없어 가로채지 않고 전체 페이지로 렌더된다.
export default function HomeLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  // 가로채기 모달 슬롯 (app/(app)/home/@modal/*). 가로채지 않을 땐 default.tsx(null).
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
