// 각 화면에서 가이드 커서가 가리키는 클릭 대상의 CSS 셀렉터 — "이 요소를 누르면 다음
// 단계로 넘어가요". 클릭 시 실제로 진행하는 요소여야 한다(사이드바 항목·목록 행·위저드
// '다음' 버튼). 데모 윈도 안에서 querySelector로 찾는다(사이드바가 콘텐츠보다 먼저 렌더되므로
// 첫 매치가 의도한 요소). 페이지4(작성 위저드)는 다음 화면 대신 위저드 내부 '다음'/'보내기'
// 버튼을 가리킨다.
//
// 모바일(<768px)에서는 사이드바가 off-canvas Sheet로 접혀 document.body로 portal 되므로
// windowRef.querySelector로 못 찾고 방문자가 누를 수도 없다. 그래서 사이드바를 가리키는
// 단계(1·3)는 창 안에 렌더되는 인-프레임 '다음' 버튼([data-demo-mobile-next])으로 대체한다.
// 콘텐츠 내부 대상(2 목록 행·4 위저드 버튼)은 모바일에서도 그대로 동작한다.
export function demoTriggerSelector(page: number, isMobile = false): string | null {
  if (isMobile && (page === 1 || page === 3)) return '[data-demo-mobile-next]';
  switch (page) {
    case 1:
      return 'a[href="/rfp"]'; // 사이드바 '견적 요청'
    case 2:
      return 'tbody tr'; // 견적 요청 목록 첫 행
    case 3:
      return 'a[href="/rfp-create"]'; // 사이드바 '새 견적 요청'
    case 4:
      return '[data-demo-cursor]'; // 작성 위저드의 '다음'/'보내기' 버튼
    default:
      return null;
  }
}

// 각 단계에서 커서 옆에 힌트처럼 붙이는 안내 메시지(구매사 데모).
// 커서가 가리키는 클릭 대상이 하는 동작과 일치시킨다.
export function demoCursorHint(page: number): string {
  switch (page) {
    case 1:
      return '보낸 견적 요청을 확인해요'; // 커서: 사이드바 '견적 요청'
    case 2:
      return '견적 요청을 눌러 받은 견적을 확인해요'; // 커서: 목록 행
    case 3:
      return '새로 견적을 요청해요'; // 커서: 사이드바 '새 견적 요청'
    case 4:
      return '정보를 입력하고 견적을 요청해요'; // 커서: 위저드 '다음'/'보내기'
    default:
      return '';
  }
}
