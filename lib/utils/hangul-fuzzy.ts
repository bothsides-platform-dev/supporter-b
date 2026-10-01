import { canBeChoseong, convertQwertyToHangul, disassemble, getChoseong } from 'es-hangul';

/** 이 점수 이상이면 자모 오타로 맞은 것이다 — 그 아래는 사용자가 의도한 검색(정확·띄어쓰기·초성·한/영 전환)이다. */
export const TYPO_SCORE_BASE = 2;

const MAX_QWERTY_RECOVERY_LENGTH = 30;
/** 이 글자 수부터 오타 1개를 받는다. */
const MIN_TYPO_LENGTH = 3;
/** 이 글자 수부터 오타 2개를 받고, 첫머리는 첫 글자 전체 대신 첫 자음만 맞으면 된다. */
const LONG_QUERY_LENGTH = 5;

/**
 * 검색어 하나(term)가 대상 텍스트에 얼마나 가깝게 들어 있는지 — 낮을수록 가깝고, 불일치면 null.
 *
 * 0 = 정확한 부분 문자열(조합 중인 글자 포함), 1 = 띄어쓰기 무시·초성·한/영 전환 실수, 2+N = 자모 N개 오타.
 * 라틴 문자는 대소문자를 가리지 않는다. 단 한/영 전환 복구는 원래 입력으로 한다 — Shift 가 쌍자음(Q→ㅃ)을 만든다.
 * 한글 처리는 `es-hangul` 에 위임한다(CLAUDE.md 의 한글 텍스트 처리 단일 출처).
 *
 * 오타 허용 폭은 질의 글자 수로 정한다 — 2글자 이하는 오타를 받지 않고, 3글자부터 자모 1개, 5글자부터 2개를 받는다.
 * 짧은 질의에 오타를 허용하면 다른 낱말까지 걸려 검색이 무의미해진다. 숫자(코드)와 영문 낱말은 오타를 받지 않는다.
 */
export function fuzzyTermScore(haystack: string, term: string): number | null {
  if (!term) return 0;
  const text = haystack.toLowerCase();
  const lowered = term.toLowerCase();
  if (text.includes(lowered)) return 0;

  const compactHaystack = text.replace(/\s+/g, '');
  if (compactHaystack.includes(lowered)) return 1;

  if ([...term].every(ch => canBeChoseong(ch))) {
    return getChoseong(compactHaystack).includes(term) ? 1 : null;
  }

  // 한/영 전환 복구는 완성된 음절이 하나라도 나올 때만 한다 — 'r'(ㄱ) 한 글자가 모든 업종에 맞지 않게.
  // 변환은 입력 길이의 제곱에 가깝게 느려서, 업종 이름보다 훨씬 긴 영문(붙여넣기)은 복구하지 않는다.
  const latin = /^[a-z]+$/i.test(term);
  const converted = latin && term.length <= MAX_QWERTY_RECOVERY_LENGTH ? qwertyToHangul(term) : '';
  const hangulQuery = /[\uAC00-\uD7A3]/.test(converted) ? disassemble(converted) : null;

  // 자모째 들어 있으면 오타가 아니라 아직 조합 중인 글자다(편의저 → 편의점, dmlf=읠 → 의류).
  const query = disassemble(lowered);
  const textJamo = disassemble(compactHaystack);
  if (textJamo.includes(query)) return 0;
  if (hangulQuery && textJamo.includes(hangulQuery)) return 1;

  // 숫자(MCC 코드)는 오타를 받지 않는다 — 한 자리만 달라도 다른 업종 코드다.
  if (/^\d+$/.test(term)) return null;

  // 오타는 한 단어 안에서, 단어 처음부터 본다 — 단어 중간(케이크↔메이크업)이나 단어 사이(고양이카페↔고양이 펫)에
  // 맞물리면 다른 업종이 된다. 첫머리도 같아야 한다: 5글자 이상은 첫 자음, 3~4글자는 첫 글자 전체(마이크↔메이크업).
  const words = text.split(/[\s,.·/()-]+/).filter(Boolean).map(word => disassemble(word));
  // 영문 낱말 자체는 오타를 받지 않는다(spa↔saas) — 한/영 전환으로 한글이 된 쪽만 오타를 본다.
  // 한/영 전환 결과에 섞인 낱자(새ㅛㄴ ← toys)는 글자로 세지 않는다 — 세면 영문 낱말이 엉뚱한 업종에 맞는다.
  const candidates = [
    ...(latin ? [] : [{ jamo: query, source: lowered, length: [...lowered].length }]),
    ...(hangulQuery
      ? [{ jamo: hangulQuery, source: converted, length: [...converted].filter(ch => /[가-힣]/.test(ch)).length }]
      : []),
  ];
  const distances = candidates.flatMap(({ jamo, source, length }) => {
    const allowed = typoAllowance(length);
    if (allowed === 0) return [];
    const head = length >= LONG_QUERY_LENGTH ? jamo[0] : disassemble([...source][0]);
    return words.flatMap(word => {
      // 길이 차이만으로도 허용 오차를 넘으면 편집 거리를 계산할 필요가 없다 — 긴 붙여넣기가 화면을 멈추지 않게 한다.
      if (!word.startsWith(head) || jamo.length - word.length > allowed) return [];
      const distance = prefixDistance(word, jamo, allowed);
      return distance <= allowed ? [distance] : [];
    });
  });
  return distances.length > 0 ? TYPO_SCORE_BASE + Math.min(...distances) : null;
}

/** es-hangul 은 한글로 조합할 수 없는 영문(hot, hotel)에 예외를 던진다 — 그런 입력은 변환 없음으로 본다. */
function qwertyToHangul(term: string): string {
  try {
    return convertQwertyToHangul(term);
  } catch {
    return '';
  }
}

/**
 * 허용 오차는 자모가 아니라 글자(음절) 수로 센다 — 겹모음(ㅢ·ㅘ)이 자모를 늘려 2글자 낱말이
 * 오타 대상이 되면 의료→의류, 화원→회원처럼 다른 업종으로 이어진다.
 */
function typoAllowance(length: number): number {
  return length >= LONG_QUERY_LENGTH ? 2 : length >= MIN_TYPO_LENGTH ? 1 : 0;
}

/** 질의와 단어 앞부분(길이 무관) 사이의 최소 편집 거리. max 를 넘는 순간 멈추고 max + 1 을 돌려준다. */
function prefixDistance(word: string, query: string, max: number): number {
  let previous = Array.from({ length: word.length + 1 }, (_, j) => j);
  for (let i = 1; i <= query.length; i++) {
    const current = [i];
    for (let j = 1; j <= word.length; j++) {
      const substitution = previous[j - 1] + (query[i - 1] === word[j - 1] ? 0 : 1);
      current[j] = Math.min(substitution, previous[j] + 1, current[j - 1] + 1);
    }
    // 행의 최솟값은 줄지 않으므로 이미 max 를 넘었으면 더 볼 필요가 없다.
    if (Math.min(...current) > max) return max + 1;
    previous = current;
  }
  return Math.min(...previous);
}
