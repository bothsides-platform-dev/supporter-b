// 데모 가이드 투어가 한 단계 → 다음 단계로 넘어가기 직전, "실제로 이 요소를 클릭하면
// 넘어가요"를 보여주려고 잠깐 하이라이트할 트리거 요소의 CSS 셀렉터. 데모 윈도 안에서
// querySelector로 찾는다(사이드바가 콘텐츠보다 먼저 렌더되므로 첫 매치가 의도한 요소).
// 마지막 단계(4)는 다음이 없어 null.
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
