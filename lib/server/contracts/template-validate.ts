import { PDFDocument } from 'pdf-lib';
import { MAX_BYTES } from '@/lib/server/storage/constants';
import { CONTRACT_TEMPLATE_MAX_PAGES } from '@/lib/types/contract-doc';

/**
 * 템플릿 PDF 거절 사유. UI 문구 매핑이 이 코드를 스위치하므로 값 추가 시
 * 화면 쪽 분기도 함께 넓힌다.
 *  · UNREADABLE — 파싱 실패(손상·암호화 PDF). pdf-lib 는 암호화 문서를
 *    `ignoreEncryption` 없이 로드하면 throw 하므로 같은 사유로 흡수된다.
 *  · PAGE_LIMIT — CONTRACT_TEMPLATE_MAX_PAGES 초과 (compose 비용 폭주 방지).
 *  · SIZE_LIMIT — 첨부 공통 상한(MAX_BYTES) 초과.
 */
export const TEMPLATE_VALIDATION_REASONS = ['UNREADABLE', 'PAGE_LIMIT', 'SIZE_LIMIT'] as const;
export type TemplateValidationReason = (typeof TEMPLATE_VALIDATION_REASONS)[number];

export type TemplateValidationResult =
  | { ok: true; pageCount: number }
  | { ok: false; reason: TemplateValidationReason };

/**
 * PG 업로드 PDF 를 계약 템플릿으로 받아들일지 판정한다. 통과한 바이트만
 * composeBasePdf 로 흘러가므로 이 함수가 compose 의 신뢰 경계다.
 *
 * 크기 검사를 load 보다 **먼저** 한다 — 20MB 를 넘는 입력을 파싱하는 비용
 * 자체가 공격면이기 때문(테스트가 순서를 못박는다).
 */
export async function validateTemplatePdf(bytes: Buffer): Promise<TemplateValidationResult> {
  if (bytes.byteLength > MAX_BYTES) return { ok: false, reason: 'SIZE_LIMIT' };

  // load() 와 getPageCount() 를 **함께** 감싼다. pdf-lib 의 load 는 관대해서
  // 헤더만 있고 카탈로그가 깨진 바이트도 예외 없이 통과시키고, 페이지를 실제로
  // 열거하는 getPageCount() 에서야 TypeError 를 던진다(테스트가 못박음).
  // load 만 감싸면 그 TypeError 가 호출자(서버액션)까지 새어나가 500 이 된다.
  let pageCount: number;
  try {
    const doc = await PDFDocument.load(bytes);
    pageCount = doc.getPageCount();
  } catch {
    return { ok: false, reason: 'UNREADABLE' };
  }

  if (pageCount > CONTRACT_TEMPLATE_MAX_PAGES) return { ok: false, reason: 'PAGE_LIMIT' };

  return { ok: true, pageCount };
}
