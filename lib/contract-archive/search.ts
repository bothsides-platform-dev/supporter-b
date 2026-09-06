import { canBeChoseong, disassemble, getChoseong } from 'es-hangul';

import type { ContractArchiveEntry } from '@/lib/types/contract-archive';

/**
 * 보관함 클라이언트 필터 — 제목·상대방·견적번호 부분 문자열 + 한글 초성.
 *
 * 한글 처리는 전부 `es-hangul` 에 위임한다(CLAUDE.md 가 지정한 한글 텍스트 처리 단일
 * 출처). `getChoseong`·`canBeChoseong` 은 `CommandPalette` 가 이미 쓰는 것과 같은 짝이다.
 *
 * 질의가 **초성으로만** 이뤄졌을 때에 한해 초성열과 비교한다 — 그러지 않으면 'ㅅ' 이
 * '서비스'의 중성·종성까지 긁어 오탐이 는다. 자모가 섞인 질의(IME 조합 중)는 자모
 * 분해로 비교한다.
 *
 * ⚠️ **서버 페이지네이션이 없다.** 수동 업로드에는 워크스페이스당 200건 캡이 있지만
 * **서명 출처 행에는 캡이 없다**(완료 계약당 2행). 즉 목록은 완료 계약 수만큼 자란다 —
 * 공격자가 아니라 사업 속도로. 지금 규모에서는 문제가 아니지만, "캡이 있으니 괜찮다"는
 * 근거는 성립하지 않는다. 목록에 상한을 두는 건 TODOS.md 에 별건으로 있다.
 */
function isChoseongOnly(q: string): boolean {
  return q.length > 0 && [...q].every((ch) => canBeChoseong(ch));
}

export function matchesQuery(entry: ContractArchiveEntry, query: string): boolean {
  const q = query.trim();
  if (!q) return true;

  const haystacks = [entry.title, entry.counterpartyName ?? '', entry.rfpCode ?? ''];
  const lower = q.toLowerCase();
  if (haystacks.some((h) => h.toLowerCase().includes(lower))) return true;

  if (isChoseongOnly(q)) {
    return haystacks.some((h) => getChoseong(h).includes(q));
  }
  const decomposed = disassemble(q);
  return haystacks.some((h) => disassemble(h).includes(decomposed));
}
