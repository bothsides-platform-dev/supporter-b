import { canBeChoseong, convertQwertyToHangul, disassemble, getChoseong } from 'es-hangul';

/**
 * 검색어 하나(term)가 대상 텍스트에 얼마나 가깝게 들어 있는지 — 낮을수록 가깝고, 불일치면 null.
 *
 * 0 = 정확한 부분 문자열, 1 = 띄어쓰기 무시·초성·한/영 전환 실수, 2+N = 자모 N개 오타.
 * 라틴 문자는 대소문자를 가리지 않는다. 단 한/영 전환 복구는 원래 입력으로 한다 — Shift 가 쌍자음(Q→ㅃ)을 만든다.
 * 한글 처리는 `es-hangul` 에 위임한다(CLAUDE.md 의 한글 텍스트 처리 단일 출처).
 *
 * 오타 허용 폭은 질의 자모 수로 정한다 — 자모 5개 미만(1음절, 받침 없는 2음절)은 오타를 받지 않고,
 * 5개부터 1개, 10개부터 2개를 받는다. 짧은 질의에 오타를 허용하면 거의 모든 항목이 걸려 검색이 무의미해진다.
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

  if (/^[a-z]+$/i.test(term)) {
    const converted = convertQwertyToHangul(term);
    if (converted !== term && compactHaystack.includes(converted)) return 1;
  }

  const query = disassemble(lowered);
  const allowed = query.length >= 10 ? 2 : query.length >= 5 ? 1 : 0;
  if (allowed === 0) return null;
  const distance = approximateSubstringDistance(disassemble(compactHaystack), query);
  return distance <= allowed ? 2 + distance : null;
}

/** 질의가 대상의 어느 위치에서 시작해도 되는 최소 편집 거리(Sellers). */
function approximateSubstringDistance(text: string, query: string): number {
  let previous = Array.from({ length: text.length + 1 }, () => 0);
  for (let i = 1; i <= query.length; i++) {
    const current = [i];
    for (let j = 1; j <= text.length; j++) {
      const substitution = previous[j - 1] + (query[i - 1] === text[j - 1] ? 0 : 1);
      current[j] = Math.min(substitution, previous[j] + 1, current[j - 1] + 1);
    }
    previous = current;
  }
  return Math.min(...previous);
}
