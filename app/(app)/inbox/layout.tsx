// inbox 세그먼트 레이아웃 — 목록(children) + 인터셉트 딜룸 모달(@modal 슬롯).
export default function InboxSegmentLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
