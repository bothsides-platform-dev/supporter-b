/**
 * 한국 사업자등록번호 유효성 검사.
 *
 * 알고리즘:
 *  weights = [1, 3, 7, 1, 3, 7, 1, 3, 5]
 *  sum = Σ(d[i] * weights[i]) for i in 0..8
 *       + Math.floor(d[8] * 5 / 10)   ← 9번째 자리 5배 값의 십의 자리
 *  check = (10 - sum % 10) % 10
 *  valid  = check === d[9]
 */
export function isValidBizNo(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 10) return false;

  const d = digits.split('').map(Number);
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5] as const;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += d[i] * w[i];
  }
  // 9번째 자리(index 8) 곱셈 결과의 십의 자리를 추가로 더함
  sum += Math.floor((d[8] * 5) / 10);

  const check = (10 - (sum % 10)) % 10;
  return check === d[9];
}

/** zod .refine() 에서 사용할 수 있는 래퍼 */
export function bizNoRefinement(val: string) {
  return isValidBizNo(val);
}

export const BIZ_NO_ERROR = '유효하지 않은 사업자등록번호입니다';
