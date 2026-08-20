// 계약서 본문 줄바꿈 — 순수 함수. 폰트를 모른다(폭 측정은 주입받는다).
//
// 한글은 어절 사이 공백에 의존하지 않으므로 **글자 단위**로 끊는 것이 기본이고,
// 그래서 영어용 단어 단위 알고리즘을 그대로 쓰면 한 줄이 통째로 넘어간다.
// 반대로 계약서에는 절대 쪼개지면 안 되는 덩어리가 있다 — 사업자등록번호
// `123-45-67890`, 정산주기 `D+3`, 요율 `2.50%`, 금액 `100,000,000`. 숫자가
// 하이픈에서 갈라진 계약서는 읽는 사람이 다른 숫자로 오해할 수 있다.
//
// 그래서 "끊을 수 있는 단위(break unit)"를 먼저 만들고 그 단위로만 채운다.

/** 폭 측정기 — 실행 시엔 pdf-lib 폰트가, 테스트에선 가짜가 들어온다. */
export type Measure = (text: string) => number;

// 라틴/숫자 덩어리: 영숫자 그룹이 연결자로 이어진 형태 + 선택적 꼬리 기호.
// `123-45-67890` · `D+3` · `2.50%` · `100,000,000` · `a@b.com` 이 한 단위가 된다.
const ATOM_RE = /[A-Za-z0-9]+(?:[.,\-/@'_:+][A-Za-z0-9]+)*%?/y;

// 줄 첫머리에 올 수 없는 문자(닫는 짝·문장부호). 앞 줄로 당겨 붙인다.
const NO_LINE_START = new Set(Array.from(')]}>」』”’.,?!;:%·'));
// 줄 끝에 올 수 없는 문자(여는 짝). 다음 줄로 내려 보낸다.
const NO_LINE_END = new Set(Array.from('([{<「『“‘'));

/**
 * 텍스트를 끊을 수 있는 단위로 자른다. 공백은 단위로 남기지 않고 **앞 단위에
 * 붙여** 둔다 — 줄 끝에서 잘리면 그대로 사라지고(줄 끝 공백 방지), 줄 중간이면
 * 폭에 포함되어야 하기 때문이다.
 */
function toUnits(text: string): string[] {
  const units: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ') {
      // 앞 단위에 공백을 붙인다(연속 공백도 함께).
      let j = i;
      while (j < text.length && text[j] === ' ') j += 1;
      const spaces = text.slice(i, j);
      if (units.length > 0) units[units.length - 1] += spaces;
      else units.push(spaces);
      i = j;
      continue;
    }
    ATOM_RE.lastIndex = i;
    const atom = ATOM_RE.exec(text);
    if (atom && atom.index === i && atom[0].length > 0) {
      units.push(atom[0]);
      i += atom[0].length;
      continue;
    }
    // 그 밖(한글·한자·기호)은 한 글자가 한 단위. 코드포인트 단위로 전진한다.
    const cp = String.fromCodePoint(text.codePointAt(i)!);
    units.push(cp);
    i += cp.length;
  }
  return units;
}

/**
 * 금칙 적용 — 단위 배열을 훑으며 줄머리 금지 문자를 앞 단위에 병합하고,
 * 줄끝 금지 문자를 뒤 단위에 병합한다. 병합이므로 **글자가 늘거나 줄지 않는다**.
 */
function applyKinsoku(units: string[]): string[] {
  const out: string[] = [];
  for (const unit of units) {
    const head = unit[0];
    const prev = out[out.length - 1];
    // 줄머리 금지 문자로 시작하는 단위는 앞에 붙인다 → 홀로 줄 앞에 설 수 없다.
    if (prev !== undefined && head !== undefined && NO_LINE_START.has(head) && prev.trim() !== '') {
      out[out.length - 1] = prev + unit;
      continue;
    }
    // 앞 단위가 여는 괄호로 끝나면 이 단위를 붙여 내린다 → 줄 끝에 홀로 남지 않는다.
    if (prev !== undefined && NO_LINE_END.has(prev[prev.length - 1] ?? '')) {
      out[out.length - 1] = prev + unit;
      continue;
    }
    out.push(unit);
  }
  return out;
}

/** 한 단위가 줄보다 길 때의 탈출구 — 코드포인트 단위로 강제 분할한다. */
function hardSplit(unit: string, maxWidth: number, measure: Measure): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const ch of unit) {
    if (current !== '' && measure(current + ch) > maxWidth) {
      pieces.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current !== '') pieces.push(current);
  // maxWidth 가 한 글자보다도 좁은 병리적 입력에서도 최소 한 조각은 돌려준다.
  return pieces.length > 0 ? pieces : [unit];
}

/**
 * 한 문단을 폭 `maxWidth` 안에 들어가는 줄들로 나눈다.
 *
 * `\n` 은 강제 줄바꿈이다. 반환 줄을 이어 붙이면(개행 제외) 원문과 같다 —
 * 금칙 처리가 글자를 잃지 않는다는 뜻이고, 테스트가 그걸 지킨다.
 */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const units = applyKinsoku(toUnits(paragraph));
    let current = '';
    for (const unit of units) {
      // 지금 줄에 안 들어가면 먼저 줄을 닫는다. 줄 끝 공백은 폭 계산에서 뺐으니
      // 저장할 때도 뗀다.
      if (current !== '' && measure((current + unit).trimEnd()) > maxWidth) {
        lines.push(current.trimEnd());
        current = '';
      }
      // 단위 하나가 줄보다 긴 경우(병리적 URL 등). 이 분기가 없으면 빈 줄에 얹은
      // 뒤 그대로 넘어가 **폭을 넘긴 줄**이 남는다 — 줄이 빌 때는 위 조건이
      // 걸리지 않기 때문이다.
      if (measure(unit.trimEnd()) > maxWidth) {
        const pieces = hardSplit(unit, maxWidth, measure);
        for (const piece of pieces.slice(0, -1)) {
          lines.push((current + piece).trimEnd());
          current = '';
        }
        current += pieces[pieces.length - 1];
        continue;
      }
      current += unit;
    }
    lines.push(current.trimEnd());
  }
  return lines;
}
