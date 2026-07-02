// 각 화면에서 가이드 커서가 가리키는 클릭 대상의 CSS 셀렉터 — "이 요소를 누르면 다음
// 화면으로 넘어가요". 클릭 시 실제로 다음 페이지로 진행하는 요소여야 한다(사이드바 항목·
// 목록 행). 데모 윈도 안에서 querySelector로 찾는다(사이드바가 콘텐츠보다 먼저 렌더되므로
// 첫 매치가 의도한 요소). 마지막 단계(4)는 다음이 없어 null.
export function demoTriggerSelector(page: number): string | null {
  switch (page) {
    case 1:
      return 'a[href="/rfp"]'; // 사이드바 '견적 요청'
    case 2:
      return 'tbody tr'; // 견적 요청 목록 첫 행
    case 3:
      return 'a[href="/rfp-create"]'; // 사이드바 '새 견적 요청'
    default:
      return null;
  }
}
