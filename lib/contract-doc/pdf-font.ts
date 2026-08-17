// 계약서 PDF 의 한글 폰트 — 로딩 · 임베딩 · 글리프 커버리지 검증.
//
// 왜 `public/fonts/PretendardVariable.woff2` 를 안 쓰나: **woff2 는 fontkit 이
// 읽지 못한다.** 그래서 static OTF 두 벌을 `assets/fonts/` 에 둔다 — `public/`
// 이 아닌 이유는 이 바이트가 브라우저로 나갈 일이 없기 때문이다(미리보기도
// 서버가 렌더한다).
//
// ⚠️ **`subset: true` 를 쓰지 않는다.** pdf-lib 의 서브셋 경로는 CJK 글리프를
// 조용히 떨어뜨리는 알려진 버그가 있다(Hopding/pdf-lib#1232). 실패 모드가
// "몇 글자가 빈칸" 이고 그게 서명된 계약서에 실리면 되돌릴 수 없다. 전체
// 임베딩은 PDF 를 키우지만(수 MB, 공급자 50MB 캡 안) 그 대가는 싸다.
//
// 커버리지 검증이 임베딩과 같은 파일에 있는 이유: 두 곳이 **같은 폰트 파일**을
// 봐야 판정이 의미를 갖는다. 폰트를 바꾸면 커버리지도 같이 움직인다.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';

// ⚠️ **TTF 여야 한다 — OTF 를 쓰면 안 된다.** Pretendard 배포본의 `static/*.otf`
// 는 CFF 아웃라인이고, @pdf-lib/fontkit 이 그 글리프를 그리다 죽는다
// (`CFFGlyph._getPath` → "Cannot read properties of undefined (reading 'topDict')",
// 2026-08-17 실측). TTF(glyf) 배포본은 `static/alternative/` 에 있다.
// 폰트를 갈아끼울 일이 있으면 이 제약을 먼저 확인할 것 — 라운드트립 테스트가
// 잡아 주지만, 원인을 여기 적어 두지 않으면 같은 함정을 다시 판다.
const FONT_FILES = {
  regular: 'Pretendard-Regular.ttf',
  bold: 'Pretendard-Bold.ttf',
} as const;

export type ContractFontBytes = { regular: Uint8Array; bold: Uint8Array };

/** 프로세스 수명 캐시 — 3MB 를 렌더마다 디스크에서 읽을 이유가 없다. */
let cachedBytes: Promise<ContractFontBytes> | undefined;
let cachedCoverage: Promise<GlyphCoverage> | undefined;

function fontPath(file: string): string {
  // PM2 `next start` 는 프로젝트 루트에서 돈다(standalone 출력이 아니다).
  return path.join(process.cwd(), 'assets', 'fonts', file);
}

export async function loadContractFontBytes(): Promise<ContractFontBytes> {
  cachedBytes ??= (async () => {
    const [regular, bold] = await Promise.all([
      readFile(fontPath(FONT_FILES.regular)),
      readFile(fontPath(FONT_FILES.bold)),
    ]);
    return { regular: new Uint8Array(regular), bold: new Uint8Array(bold) };
  })();
  return cachedBytes;
}

/** 임베딩된 계약서 본문 폰트 한 쌍. */
export type ContractFonts = { regular: PDFFont; bold: PDFFont };

/**
 * GSUB 치환을 끄고 **cmap 조회 결과만** 돌려주는 fontkit 래퍼.
 *
 * 왜 필요한가 — pdf-lib 의 ToUnicode CMap 과 실제로 그리는 글리프가 **서로 다른
 * 경로에서 나오기 때문이다**:
 *   · CMap: `font.characterSet` 의 코드포인트마다 `glyphForCodePoint(cp)`  (CustomFontEmbedder)
 *   · 그리기: `font.layout(text).glyphs`                                    (encodeText)
 * Pretendard 는 **필수 GSUB 피처**로 숫자 옆 `-`·`+` 를 표(表)용 이형자로 바꾼다
 * (`123-45` 의 `-` 는 cmap 13241 이 아니라 13252). 이형자는 `characterSet` 경로에
 * 없으니 ToUnicode 항목이 없고, pdfjs 는 CID 를 유니코드로 읽어 **사업자등록번호가
 * `123㏄45㏄67890` 으로 추출된다**. 눈에는 멀쩡하고 복사하면 깨지는 종류의 결함이라
 * 계약서에서 특히 나쁘다. 피처 배열로는 끌 수 없다(필수 피처는 fontkit 이 무조건
 * 적용한다 — `{calt:false}` 까지 실측으로 확인).
 *
 * 그래서 그리기도 **같은 `glyphForCodePoint`** 를 지나게 만든다. 두 경로가 한 함수를
 * 공유하므로 매핑이 어긋날 수 없다(구성상 보장이지 검증이 아니다).
 *
 * 대가: 합자·문맥 이형자·커닝이 빠진다. 한글 본문에는 셋 다 사실상 무의미하고,
 * 라틴 커닝 손실은 미세한 자간 차이일 뿐이다 — 계약서에서는 **추출 정확도가
 * 타이포그래피 다듬기보다 우선**이다.
 *
 * pdf-lib 이 글리프에서 읽는 것은 `.id` 와 `.advanceWidth` 둘뿐이고(실측: pdf-lib
 * `CustomFontEmbedder.encodeText`/`widthOfTextAtSize`), `glyphForCodePoint` 는 진짜
 * Glyph 를 주므로 둘 다 정상이다. 폰트에 없는 문자는 .notdef(id 0) 이 되는데, 그건
 * 상류의 `missingGlyphs` 가 이미 막는다.
 */
const cmapOnlyFontkit = {
  create(bytes: Buffer) {
    const font = fontkit.create(bytes);
    const layout = (text: string) => ({
      // 코드포인트 단위 순회 — surrogate pair 를 반쪽씩 보지 않는다.
      glyphs: Array.from(text, (ch) => font.glyphForCodePoint(ch.codePointAt(0)!)),
    });
    return new Proxy(font, {
      get(target, prop) {
        if (prop === 'layout') return layout;
        const value = Reflect.get(target, prop);
        // 원본에 바인딩한다 — 프록시를 `this` 로 받으면 fontkit 내부 캐시가 어긋난다.
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  },
};

export async function embedContractFonts(doc: PDFDocument): Promise<ContractFonts> {
  const bytes = await loadContractFontBytes();
  doc.registerFontkit(cmapOnlyFontkit as Parameters<PDFDocument['registerFontkit']>[0]);
  // 서브셋을 켠다 — 전체 임베딩이면 계약서 한 건이 1.2MB, 서브셋이면 7KB 다(실측).
  //
  // pdf-lib #1232("subset:true 면 CJK 글자가 사라진다")을 알면서도 켜는 근거:
  // 그 버그와 위 `cmapOnlyFontkit` 이 고친 결함은 **뿌리가 같다**. 서브셋은
  // `encodeText` 가 요청한 글리프로 만들어지는데, 그 글리프가 GSUB 이형자라 CMap
  // (=`glyphForCodePoint` 기반)에 없으면 매핑도 서브셋도 어긋난다. 두 경로를 한
  // 조회로 합치면 서브셋이 담는 글리프와 CMap 이 정의상 같은 집합이 된다.
  // **가정이 아니라 라운드트립 테스트가 지키는 사실이다** — 글자 단위 대조 +
  // 산출 크기 상한을 같은 파일에서 단언한다.
  const [regular, bold] = await Promise.all([
    doc.embedFont(bytes.regular, { subset: true }),
    doc.embedFont(bytes.bold, { subset: true }),
  ]);
  return { regular, bold };
}

/**
 * 폰트가 그릴 수 있는 코드포인트 집합.
 *
 * Regular 한 벌로만 만든다 — 같은 패밀리의 두 weight 는 커버리지가 같고,
 * 갈라 두면 "본문은 되는데 제목만 빈칸" 같은 판정 구멍이 생긴다.
 */
export type GlyphCoverage = { has(codePoint: number): boolean };

export async function loadGlyphCoverage(): Promise<GlyphCoverage> {
  cachedCoverage ??= (async () => {
    const { regular } = await loadContractFontBytes();
    const font = fontkit.create(regular as unknown as Buffer);
    return { has: (cp: number) => font.hasGlyphForCodePoint(cp) };
  })();
  return cachedCoverage;
}

/**
 * 폰트가 못 그리는 문자들을 **중복 없이 등장 순서대로** 돌려준다.
 *
 * 호출 지점이 둘인 것이 요점이다:
 *   ① 서식 저장 — 작성자가 쓴 조항 텍스트
 *   ② 발송 — **변수가 해석된 뒤의 문서**. 구매사 상호·담당자 이름은 이때 처음
 *      들어오므로(한자 상호 `株式會社…`), ①만 두면 조용한 빈칸이 서명된다.
 *
 * 개행·탭은 그리는 대상이 아니므로 통과시킨다.
 */
export function missingGlyphs(text: string, coverage: GlyphCoverage): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  // for…of 는 코드포인트 단위로 순회한다 — surrogate pair 를 반쪽씩 보지 않는다.
  for (const ch of text) {
    if (ch === '\n' || ch === '\r' || ch === '\t') continue;
    const cp = ch.codePointAt(0);
    if (cp === undefined || coverage.has(cp)) continue;
    if (seen.has(ch)) continue;
    seen.add(ch);
    missing.push(ch);
  }
  return missing;
}

/** 테스트 전용 — 모듈 캐시 초기화. */
export function __resetContractFontCacheForTest(): void {
  cachedBytes = undefined;
  cachedCoverage = undefined;
}
