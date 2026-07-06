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

// PG 데모 셸(PgDemoAppShell)용 트리거 셀렉터 — 위 demoTriggerSelector와 동일한 구조(모바일
// 오버라이드 포함)이나, PG 화면(받은요청·딜룸·메시지)의 클릭 대상을 가리킨다.
export function pgDemoTriggerSelector(page: number, isMobile = false): string | null {
  if (isMobile && (page === 1 || page === 3)) return '[data-demo-mobile-next]';
  switch (page) {
    case 1:
      return 'a[href="/inbox"]'; // 사이드바 '받은 견적 요청' → 인박스
    case 2:
      return 'tbody tr'; // 받은 요청 첫 행 → 딜룸
    case 3:
      return 'a[href="/messages"]'; // 사이드바 '메시지' → 메시지
    case 4:
      return '[data-demo-cursor]'; // 메시지 전송 버튼(종착 — 커서만 얹음)
    default:
      return null;
  }
}

// 각 단계에서 커서 옆에 힌트처럼 붙이는 안내 메시지(PG 데모).
// 커서가 가리키는 클릭 대상이 하는 동작과 일치시킨다.
export function pgDemoCursorHint(page: number): string {
  switch (page) {
    case 1:
      return '받은 견적 요청을 확인해요'; // 커서: 사이드바 '받은 견적 요청'
    case 2:
      return '받은 견적 요청을 눌러 상세를 확인해요'; // 커서: 목록 행
    case 3:
      return '구매사와 메시지를 주고받아요'; // 커서: 사이드바 '메시지'
    case 4:
      return '여기서 바로 메시지를 보내요'; // 커서: 전송 버튼(종착)
    default:
      return '';
  }
}

// PG 데모 가이드 커서 표시 여부 — 진행 단계(1·2·3)에서만 다음 클릭 대상을 가리킨다.
// 종착 단계(메시지=4)는 게스트가 클릭해도 진행할 동작이 없어 커서·힌트를 아예 띄우지 않는다
// (클릭을 유도하는 점멸 커서가 아무것도 하지 않아 오해를 주던 문제).
export function pgDemoShowsGuideCursor(page: number): boolean {
  return page < 4;
}

// 데모 창(.demo-app-window)의 진입 스케일 트랜지션 — 구매사·PG 셸이 공유한다.
export const DEMO_WINDOW_TRANSITION = 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1)';
