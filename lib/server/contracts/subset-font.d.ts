/**
 * `subset-font` (v2.5.0) 는 타입 선언을 동봉하지 않고 `@types/subset-font` 도
 * 존재하지 않는다. strict 모드에서 import 하려면 앰비언트 선언이 필요하다.
 *
 * 실제 런타임 계약은 `node_modules/subset-font/index.js` 기준:
 *   module.exports = (...args) => limiter(() => subsetFont(...args))
 * CJS 단일 함수 export → esModuleInterop 로 default import 한다.
 *
 * 우리가 쓰는 표면만 좁게 선언한다 — 넓게 열어두면 오타가 통과한다.
 */
declare module 'subset-font' {
  /** fontverter 가 지원하는 출력 포맷. pdf-lib 의 fontkit 은 truetype 만 안전하게 먹는다. */
  type SubsetTargetFormat = 'truetype' | 'woff' | 'woff2' | 'sfnt';

  interface SubsetFontOptions {
    /** 미지정 시 입력 폰트 포맷을 그대로 따라간다(fontverter.detectFormat). */
    targetFormat?: SubsetTargetFormat;
    /** name 테이블에서 보존할 nameId 목록. */
    preserveNameIds?: number[];
    /** 가변 폰트 축 고정/범위 지정. */
    variationAxes?: Record<string, number | { min?: number; max?: number; default?: number }>;
    /** true 면 GSUB/GPOS 레이아웃 클로저를 건너뛴다. */
    noLayoutClosure?: boolean;
  }

  /**
   * `text` 에 등장하는 글자만 남긴 서브셋 폰트 바이트를 돌려준다.
   * 서브셋에 없는 글자를 그리면 PDF 상에서 공백으로 렌더되므로,
   * 호출자는 그릴 문자열 전체의 합집합을 넘겨야 한다.
   */
  export default function subsetFont(
    font: Buffer,
    text: string,
    options?: SubsetFontOptions,
  ): Promise<Buffer>;
}
