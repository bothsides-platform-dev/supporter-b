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
/** 조항 id — 클라이언트가 만들지만 길이는 우리가 정한다. */
export const MAX_CLAUSE_ID_LENGTH = 64;
/** 직렬화 문서 전체 — 위 항목별 상한을 다 지켜도 합이 커질 수 있다. */
export const MAX_DOCUMENT_BYTES = 128 * 1024;

/**
 * UTF-8 **바이트** 길이. 상한 이름이 `_BYTES` 이므로 재는 단위도 바이트여야 한다.
 *
 * `String.length` 는 UTF-16 코드 단위라 한글 한 글자가 1로 세어진다 — 그 값으로
 * 128KB 를 재면 한글 문서는 실제 384KB 까지 통과한다. 계약서 본문이 대부분 한글인
 * 이 기능에서는 상한이 사실상 3배로 풀리는 셈이라, 두 입구(저장·미리보기)가 같은
 * 함수를 쓰게 한다.
 */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** 직렬화 문서가 상한을 넘는가. 저장·미리보기가 같은 판정을 쓰기 위한 단일 출처. */
export function exceedsDocumentByteLimit(serialized: string): boolean {
  return utf8ByteLength(serialized) > MAX_DOCUMENT_BYTES;
}
