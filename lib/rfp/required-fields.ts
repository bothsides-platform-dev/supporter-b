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

// 견적 유형(신규/갱신)은 필수: 둘 중 하나가 선택되어야 한다.
export function isContractTypeValid(
  contractType: 'new' | 'renewal' | null | undefined,
): boolean {
  return contractType === 'new' || contractType === 'renewal';
}

export function isMainProductsValid(mainProducts: string): boolean {
  return mainProducts.trim() !== '';
}

// 연간 PG 총 거래액은 필수이면서 0보다 큰 정수여야 한다 — 0원은 사실상 오입.
// CurrencyInput(decimalScale=0)은 정수 자릿수 문자열만 방출하므로 정수 외 형태
// (Infinity·지수·16진수·소수)는 거부한다. 서버가 trust boundary이므로(탈취 draft·직접
// 호출) Number() 만으로는 'Infinity'·'1e120' 등이 JSONB·PG 브리프에 그대로 새는 것을 막는다.
export function isAnnualPgVolumeValid(annualPgVolume: string): boolean {
  const trimmed = annualPgVolume.trim();
  return /^\d+$/.test(trimmed) && Number(trimmed) > 0;
}

export type MarkerState = 'empty' | 'filled' | 'error';

export function markerState(input: { valid: boolean; attempted: boolean }): MarkerState {
  if (input.valid) return 'filled';
  return input.attempted ? 'error' : 'empty';
}
