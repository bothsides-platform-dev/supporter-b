import { createHash } from 'node:crypto';

/**
 * 계약 PDF 무결성 해시 — 저장 시점의 basePdfSha256/finalPdfSha256 이자
 * 감사추적 확인서(별지2)에 인쇄되는 "서명 대상 문서" 지문.
 *
 * 소문자 hex 64자. 이 표현은 DB 컬럼·인쇄면·verifyStoredPdf 비교가 공유하므로
 * 인코딩을 바꾸면 과거 발급 문서의 검증이 깨진다(hash.test.ts 가 벡터로 못박음).
 */
export function sha256Hex(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}
