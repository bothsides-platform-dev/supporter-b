// 한글 줄바꿈 — 순수 함수. 폰트 없이 가짜 metric 으로 검증한다.
//
// 한글은 어절 사이 공백에 의존하지 않으므로 **글자 단위**로 끊는 것이 기본이다.
// 다만 계약서 본문에서 절대 쪼개지면 안 되는 것들이 있다: 사업자등록번호
// `123-45-67890`, 정산주기 `D+3`, 요율 `2.50%`, 금액 `100,000,000`.

import { describe, it, expect } from 'vitest';
import { wrapText } from '../line-break';

// 폭 1 = 한 "칸". 한글·기호는 1칸, 라틴/숫자는 0.5칸으로 두어 실제 폰트의
// 비대칭을 흉내 낸다(정확한 값은 중요하지 않다 — 분기가 중요하다).
const measure = (text: string): number =>
  Array.from(text).reduce((w, ch) => w + (/[\x20-\x7E]/.test(ch) ? 0.5 : 1), 0);

describe('wrapText — 기본', () => {
  it('폭에 들어가면 한 줄 그대로', () => {
    expect(wrapText('가나다라', 10, measure)).toEqual(['가나다라']);
  });

  it('빈 문자열은 빈 줄 하나', () => {
    expect(wrapText('', 10, measure)).toEqual(['']);
  });

  it('한글은 글자 단위로 끊는다 — 공백이 없어도 줄이 넘어간다', () => {
    expect(wrapText('가나다라마바', 3, measure)).toEqual(['가나다', '라마바']);
  });

  it('개행은 강제 줄바꿈이다', () => {
    expect(wrapText('가나\n다라', 10, measure)).toEqual(['가나', '다라']);
  });

  it('줄 끝 공백은 다음 줄로 넘기지 않는다', () => {
    // 폭 3 → '가나다' 뒤 공백은 버리고 '라마바'
    expect(wrapText('가나다 라마바', 3, measure)).toEqual(['가나다', '라마바']);
  });
});

describe('wrapText — 쪼개지면 안 되는 것', () => {
  it('사업자등록번호를 하이픈에서 쪼개지 않는다', () => {
    // '123-45-67890' = 12자 × 0.5 = 6칸. 폭 7 이면 한 줄에 들어간다.
    const lines = wrapText('번호 123-45-67890 끝', 7, measure);
    expect(lines.some((l) => l.includes('123-45-67890'))).toBe(true);
    // 어떤 줄도 하이픈으로 끝나거나 시작하지 않는다
    for (const line of lines) {
      expect(line.endsWith('-')).toBe(false);
      expect(line.startsWith('-')).toBe(false);
    }
  });

  it('정산주기 D+3 을 쪼개지 않는다', () => {
    const lines = wrapText('정산주기는 D+3 영업일', 6, measure);
    expect(lines.some((l) => l.includes('D+3'))).toBe(true);
  });

  it('요율과 금액을 쪼개지 않는다', () => {
    const lines = wrapText('수수료 2.50% 한도 100,000,000원', 6, measure);
    expect(lines.some((l) => l.includes('2.50%'))).toBe(true);
    expect(lines.some((l) => l.includes('100,000,000'))).toBe(true);
  });

  it('영문 단어를 중간에서 쪼개지 않는다', () => {
    const lines = wrapText('계약 supporter 종료', 5, measure);
    expect(lines.some((l) => l.includes('supporter'))).toBe(true);
  });

  it('한 덩어리가 줄보다 길면 강제로 쪼갠다 — 무한루프 금지', () => {
    // 'aaaaaaaaaa' = 10자 × 0.5 = 5칸인데 폭이 2 → 강제 분할해야 끝난다.
    const lines = wrapText('aaaaaaaaaa', 2, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('aaaaaaaaaa');
  });
});

// 이 불변식이 위의 개별 사례들보다 강하다 — "줄이 폭을 넘지 않는다"는 wrapText 의
// 존재 이유 자체다. 실제로 첫 구현은 **빈 줄에 얹은 단위**에 이 검사가 걸리지 않아
// 폭을 넘긴 줄을 반환했고, 개별 사례 하나가 그걸 잡았다. 여기서 통째로 못박는다.
describe('wrapText — 불변식', () => {
  const SAMPLES = [
    '가나다라마바사아자차카타파하',
    '수수료 2.50% 정산 D+3 한도 100,000,000원 번호 123-45-67890',
    '갑과 을은 supporter-b.com 을 통하여 다음과 같이 합의한다.',
    '① 을은 갑에게 정산대금을 지급한다.\n② 정산일이 휴무일이면 다음 영업일에 지급한다.',
    'aaaaaaaaaaaaaaaaaaaa',
    '가(나)다.라,마',
  ];

  it('어떤 줄도 폭을 넘지 않는다 (한 글자도 못 넣는 폭 제외)', () => {
    for (const sample of SAMPLES) {
      for (const width of [1, 2, 3, 5, 8, 13, 21]) {
        for (const line of wrapText(sample, width, measure)) {
          // 한 글자조차 폭보다 넓으면 넘길 수밖에 없다 — 그 경우만 예외.
          if (Array.from(line).length <= 1) continue;
          expect(
            measure(line),
            `sample=${JSON.stringify(sample)} width=${width} line=${JSON.stringify(line)}`,
          ).toBeLessThanOrEqual(width);
        }
      }
    }
  });

  it('글자를 잃거나 더하지 않는다', () => {
    for (const sample of SAMPLES) {
      for (const width of [1, 2, 3, 5, 8, 13, 21]) {
        // 줄바꿈으로 사라지는 것은 줄 끝 공백뿐이다.
        const rejoined = wrapText(sample, width, measure).join('').replace(/\s+/g, '');
        expect(rejoined, `sample=${JSON.stringify(sample)} width=${width}`).toBe(
          sample.replace(/\s+/g, ''),
        );
      }
    }
  });
});

describe('wrapText — 금칙(禁則)', () => {
  it('닫는 괄호로 줄을 시작하지 않는다', () => {
    // 폭 3: '가나다' 로 끊으면 다음 줄이 ')' 로 시작한다 → 한 글자 당겨야 한다.
    const lines = wrapText('가나다)라마', 3, measure);
    for (const line of lines) {
      expect(line.startsWith(')')).toBe(false);
    }
  });

  it('마침표·쉼표로 줄을 시작하지 않는다', () => {
    for (const punct of ['.', ',', '?', '!']) {
      const lines = wrapText(`가나다${punct}라마`, 3, measure);
      for (const line of lines) {
        expect(line.startsWith(punct)).toBe(false);
      }
    }
  });

  it('여는 괄호로 줄을 끝내지 않는다', () => {
    const lines = wrapText('가나(다라마', 3, measure);
    for (const line of lines) {
      expect(line.endsWith('(')).toBe(false);
    }
  });

  it('금칙 처리가 글자를 잃거나 더하지 않는다', () => {
    const source = '가나다)라마(바사.아자';
    const lines = wrapText(source, 3, measure);
    expect(lines.join('')).toBe(source);
  });
});
