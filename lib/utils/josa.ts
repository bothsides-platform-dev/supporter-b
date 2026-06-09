// 한국어 조사 받침 처리 — 이름 뒤에 올바른 조사를 붙인다. 마지막 글자가 한글이고
// 받침이 있으면 받침형(을/과/이/은), 없으면 비받침형(를/와/가/는). 비한글로 끝나면
// 받침 없음으로 취급 (영문/숫자 발음의 받침을 신뢰성 있게 판정할 수 없어 가독성 우선).
const BATCHIM_MAP: Record<string, [batchim: string, noBatchim: string]> = {
  '을/를': ['을', '를'],
  '와/과': ['과', '와'],
  '이/가': ['이', '가'],
  '은/는': ['은', '는'],
};

export function josa(word: string, pair: '을/를' | '와/과' | '이/가' | '은/는'): string {
  const [withBatchim, withoutBatchim] = BATCHIM_MAP[pair];
  const last = word.charCodeAt(word.length - 1);
  const isHangulSyllable = last >= 0xac00 && last <= 0xd7a3;
  const hasBatchim = isHangulSyllable && (last - 0xac00) % 28 !== 0;
  return word + (hasBatchim ? withBatchim : withoutBatchim);
}
