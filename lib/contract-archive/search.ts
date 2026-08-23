import { disassemble } from 'es-hangul';

import type { ContractArchiveEntry } from '@/lib/types/contract-archive';

/**
 * 보관함 클라이언트 필터 — 제목·상대방·견적번호 부분 문자열 + 한글 초성.
 *
 * 서버 페이지네이션은 YAGNI 다(워크스페이스당 계약 수 + 업로드 캡 200). 그래서
 * 검색도 클라이언트에서 끝난다.
 *
 * 초성 매칭은 `es-hangul` 의 `disassemble` 로 한다 — 이 레포의 한글 텍스트 처리
 * 단일 출처다. 자모를 다 편 문자열에서 **초성만** 추리는 것이 아니라, 질의가
 * 초성으로만 이뤄졌을 때에 한해 대상의 초성열과 비교한다(그러지 않으면
 * "ㅅ" 이 '서비스'의 중성·종성까지 긁어 오탐이 는다).
 */
const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

function isChoseongOnly(q: string): boolean {
  return q.length > 0 && [...q].every((ch) => CHOSEONG.includes(ch));
}

/** 한글 음절의 초성열. 한글이 아닌 문자는 그대로 둔다(영문·숫자 혼용 대비). */
function choseongOf(text: string): string {
  return [...text]
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 0xac00 || code > 0xd7a3) return ch;
      return CHOSEONG[Math.floor((code - 0xac00) / 588)];
    })
    .join('');
}

export function matchesQuery(entry: ContractArchiveEntry, query: string): boolean {
  const q = query.trim();
  if (!q) return true;

  const haystacks = [entry.title, entry.counterpartyName ?? '', entry.rfpCode ?? ''];
  const lower = q.toLowerCase();
  if (haystacks.some((h) => h.toLowerCase().includes(lower))) return true;

  if (isChoseongOnly(q)) {
    return haystacks.some((h) => choseongOf(h).includes(q));
  }
  // 자모가 섞인 질의(IME 조합 중)는 자모 분해로 비교한다.
  const decomposed = disassemble(q);
  return haystacks.some((h) => disassemble(h).includes(decomposed));
}
