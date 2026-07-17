/**
 * 서브셋 폰트 코퍼스 조립.
 *
 * 왜 필요한가: 폰트를 harfbuzz 로 사전 서브셋한 뒤 `embedFont(..., {subset:false})`
 * 로 임베드하므로, **코퍼스에 없는 글자를 그리면 PDF 에 공백으로 렌더된다**
 * (예외도 경고도 없이 조용히). 따라서 문서에 그릴 모든 문자열의 합집합을
 * 폰트 임베드 **전에** 확정해야 한다.
 *
 * 조용한 유실을 막는 안전망은 두 겹이다:
 *  1) 여기서 코퍼스를 넉넉히 모으고(안전 상수 + 라벨 상수 + 입력 데이터 전수 순회)
 *  2) 그리는 순간 `assertDrawable`(pdf/layout.ts)이 코퍼스에 없는 글자를 만나면
 *     **던진다** — 누락이 공백 렌더가 아니라 빨간 테스트로 드러난다.
 */

/** 인쇄 가능한 ASCII 전체(0x20 SPACE ~ 0x7E TILDE) — 숫자·영문·문장부호 일괄 포함. */
const PRINTABLE_ASCII = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) =>
  String.fromCharCode(0x20 + i),
).join('');

/**
 * ASCII 밖이지만 문서 어디서든 튀어나올 수 있는 글자들.
 * 조립된 문자열(`건당 300원`, `2026년`, 푸터의 `·`)에 쓰이므로 입력 데이터
 * 순회로는 잡히지 않는다 — 상수로 못박는다.
 */
const SAFE_EXTRA = '·–—%₩원년월일시분초';

/** 어떤 계약 문서든 최소한 이 글자들은 그릴 수 있어야 한다. */
export const SAFE_CORPUS = PRINTABLE_ASCII + SAFE_EXTRA;

/**
 * 입력 데이터를 깊이 순회하며 문자열만 걷어낸다(당사자명·제목·메모 등 사용자
 * 데이터는 무엇이 올지 알 수 없으므로 전수 수집이 유일한 안전책).
 *
 * Buffer/Uint8Array 는 **반드시** 건너뛴다 — 숫자 인덱스 객체라 그냥 순회하면
 * 서명 PNG 수십 KB 를 바이트마다 재귀하게 된다. Date 도 건너뛴다(포맷된
 * 문자열은 숫자·구분자뿐이라 SAFE_CORPUS 가 이미 덮는다).
 */
export function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (value === null || typeof value !== 'object') return out;
  if (value instanceof Date) return out;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return out;
  if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out);
    return out;
  }
  for (const v of Object.values(value)) collectStrings(v, out);
  return out;
}

/**
 * 조각들을 하나의 코퍼스 문자열로 정규화한다.
 * 중복 제거 후 **정렬** — 같은 입력이면 조각 순서와 무관하게 같은 코퍼스가 나오고,
 * 그래야 서브셋 폰트 바이트가 결정적이라 문서 SHA-256 도 결정적이다.
 */
export function buildCorpus(parts: readonly string[]): string {
  const chars = new Set<string>();
  for (const part of parts) for (const ch of part) chars.add(ch);
  return [...chars].sort().join('');
}
