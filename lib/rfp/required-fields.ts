// lib/rfp/required-fields.ts
//
// RFP 작성 위저드 필수 필드 판정의 단일 출처(SSOT).
// 마커(필드 단위)·스텝 완료(wizard-validation)·"다음" 막기가 모두 이 함수를 공유한다.
// 클라이언트 번들에서 tldts를 제외하기 위해 경량 검사(isValidWebsiteUrlLight)를 쓴다.
import { isValidWebsiteUrlLight } from '@/lib/validation/website-url';

export function isTitleValid(title: string): boolean {
  return title.trim() !== '';
}

// 홈페이지는 필수: 비어있지 않으면서 형식도 통과해야 한다.
export function isWebsiteValid(websiteUrl: string): boolean {
  return websiteUrl.trim() !== '' && isValidWebsiteUrlLight(websiteUrl);
}

export function isPaymentValid(
  required: readonly unknown[],
  custom: readonly unknown[],
): boolean {
  return required.length + custom.length > 0;
}

export function isPgValid(ids: readonly unknown[]): boolean {
  return ids.length > 0;
}

export function isDeadlineValid(deadline: string): boolean {
  return deadline !== '' && !Number.isNaN(new Date(deadline).getTime());
}

export type MarkerState = 'empty' | 'filled' | 'error';

export function markerState(input: { valid: boolean; attempted: boolean }): MarkerState {
  if (input.valid) return 'filled';
  return input.attempted ? 'error' : 'empty';
}
