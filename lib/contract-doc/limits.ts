// 조항형 계약서 문서의 크기 상한 — **단일 출처**.
//
// 상한이 있는 이유는 두 가지다:
//  ① 렌더가 단일 PM2 fork 의 CPU 를 쓴다. 무제한 문서 하나로 서버를 묶을 수 있다.
//  ② 공급자 업로드 캡(50MB)과 조직 선언예산(150MB)이 있다. 텍스트 문서라 현실적으로
//     수백 KB 지만, 상한이 없으면 "현실적으로"가 보장이 아니다.
//
// 값은 넉넉하게 잡았다 — 실제 PG 계약서(18조, 조항당 3~5항)가 여유롭게 들어간다.

/** 문서 하나에 담을 수 있는 조항 수. */
export const MAX_CLAUSES = 60;
/** 조 제목(`제N조 (…)` 의 괄호 안). */
export const MAX_HEADING_LENGTH = 120;
/** 조항 본문 · 표 앞뒤 문장. */
export const MAX_BODY_LENGTH = 4_000;
/** 제목 · 전문 · 말미문언. */
export const MAX_SECTION_LENGTH = 2_000;
/** 직렬화 문서 전체 — 위 항목별 상한을 다 지켜도 합이 커질 수 있다. */
export const MAX_DOCUMENT_BYTES = 128 * 1024;
