// rfp 세그먼트 레이아웃 — 목록(children)과 인터셉트 딜룸 모달(@modal 병렬 슬롯)을
// 함께 렌더한다. 목록 행 클릭 시 router.push('/rfp/<code>') 하면 @modal/(.)[id] 가
// 모달을 띄우고, 새로고침·딥링크는 인터셉터를 건너뛰어 정식 [id] 페이지가 뜬다.
export default function RfpSegmentLayout({
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
