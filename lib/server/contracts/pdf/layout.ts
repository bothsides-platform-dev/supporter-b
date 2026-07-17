import { type PDFDocument, type PDFFont, type PDFPage, type RGB, rgb } from 'pdf-lib';
import { CONTRACT_FOOTER_BRAND } from '@/lib/types/contract-doc';

// ── 지면 상수 ────────────────────────────────────────────────────────────────

/** A4 (72dpi 포인트). 별지는 항상 이 규격으로 추가한다. */
export const A4 = { W: 595.28, H: 841.89 } as const;
export const MARGIN = 48;
export const CONTENT_W = A4.W - MARGIN * 2;

/** 푸터 각인 기준선. 본문은 이 위로 올라오지 않는다. */
const FOOTER_Y = 24;
const FOOTER_SIZE = 7;
/** 본문 하한 — 푸터를 덮지 않도록 여유를 둔다. */
const BODY_FLOOR = FOOTER_Y + 14;

/** 밀도 있는 문서형 레이아웃: 라벨 회색·값 진회색·표 라인 옅은 회색. */
export const COLOR = {
  label: rgb(0.4, 0.4, 0.4),
  value: rgb(0.12, 0.12, 0.12),
  line: rgb(0.8, 0.8, 0.8),
  footer: rgb(0.55, 0.55, 0.55),
} as const;

export type Fonts = { regular: PDFFont; semibold: PDFFont };

/** 커서를 들고 다니는 드로잉 컨텍스트. `page`/`y` 는 그리면서 전진한다. */
export type Sheet = {
  doc: PDFDocument;
  fonts: Fonts;
  /** 서브셋 폰트가 실제로 담고 있는 글자 집합 — 드로잉 게이트. */
  corpus: ReadonlySet<string>;
  page: PDFPage;
  y: number;
};

// ── 코퍼스 가드 ──────────────────────────────────────────────────────────────

/**
 * 서브셋에 없는 글자를 **그리기 전에** 잡는다.
 *
 * 이 가드가 없으면 누락 글자는 예외 없이 공백으로 렌더된다 — 계약서에서
 * 회사명 한 글자가 조용히 사라지는 것이 최악의 실패 모드다. 렌더 경로를 전부
 * 태우는 테스트와 짝을 이뤄, 코퍼스 누락을 빨간 테스트로 전환한다.
 */
export function assertDrawable(corpus: ReadonlySet<string>, text: string): void {
  const missing = [...new Set(text)].filter((ch) => !corpus.has(ch));
  if (missing.length > 0) {
    throw new Error(
      `contract pdf: 서브셋 폰트에 없는 글자를 그리려 했습니다 — ${JSON.stringify(
        missing.join(''),
      )} (문자열: ${JSON.stringify(text.slice(0, 60))}). ` +
        '해당 문자열을 코퍼스 조각에 포함시키세요 (pdf/corpus.ts).',
    );
  }
}

// ── 페이지·커서 ──────────────────────────────────────────────────────────────

export function newPage(s: Sheet): void {
  s.page = s.doc.addPage([A4.W, A4.H]);
  s.y = A4.H - MARGIN;
}

/** 새 별지를 시작한다 — 첫 페이지를 문서에 append 하고 커서를 상단에 둔다. */
export function createSheet(doc: PDFDocument, fonts: Fonts, corpus: ReadonlySet<string>): Sheet {
  // page 는 newPage 가 즉시 채운다. 초기값을 위한 더미 페이지를 만들지 않으려고
  // 단언으로 통과시킨다(생성자 밖으로 새지 않는 지역적 예외).
  const s = { doc, fonts, corpus, page: undefined as unknown as PDFPage, y: 0 };
  newPage(s);
  return s;
}

/** `needed` pt 만큼 남지 않았으면 페이지를 넘긴다. */
export function ensureRoom(s: Sheet, needed: number): void {
  if (s.y - needed < BODY_FLOOR) newPage(s);
}

// ── 텍스트 ───────────────────────────────────────────────────────────────────

export type TextOpts = {
  x?: number;
  y?: number;
  size?: number;
  bold?: boolean;
  color?: RGB;
};

/** 저수준 드로잉 — 모든 텍스트가 지나는 단 하나의 길목(그래서 가드가 여기 있다). */
export function drawText(s: Sheet, text: string, o: TextOpts = {}): void {
  assertDrawable(s.corpus, text);
  s.page.drawText(text, {
    x: o.x ?? MARGIN,
    y: o.y ?? s.y,
    size: o.size ?? 9,
    font: o.bold ? s.fonts.semibold : s.fonts.regular,
    color: o.color ?? COLOR.value,
  });
}

/**
 * 폭에 맞춰 줄바꿈한다. 어절 단위로 채우되 한 어절이 폭을 넘으면 글자 단위로
 * 쪼갠다 — 한글은 어절이 길고 URL·사업자번호는 공백이 없어서, 어절 단위만으로는
 * 지면 밖으로 삐져나간다.
 */
export function wrapText(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split('\n')) {
    if (rawLine === '') {
      lines.push('');
      continue;
    }
    let cur = '';
    for (const word of rawLine.split(' ')) {
      const candidate = cur === '' ? word : `${cur} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxW) {
        cur = candidate;
        continue;
      }
      if (cur !== '') {
        lines.push(cur);
        cur = '';
      }
      if (font.widthOfTextAtSize(word, size) <= maxW) {
        cur = word;
        continue;
      }
      // 어절 자체가 폭 초과 → 글자 단위로 분해.
      let chunk = '';
      for (const ch of word) {
        if (chunk !== '' && font.widthOfTextAtSize(chunk + ch, size) > maxW) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      cur = chunk;
    }
    if (cur !== '') lines.push(cur);
  }
  return lines;
}

export type ParagraphOpts = TextOpts & { maxW?: number; lineHeight?: number; gap?: number };

/** 줄바꿈 + 페이지 넘김까지 처리하며 y 를 전진시킨다. */
export function drawParagraph(s: Sheet, text: string, o: ParagraphOpts = {}): void {
  const size = o.size ?? 9;
  const x = o.x ?? MARGIN;
  const lineHeight = o.lineHeight ?? size * 1.5;
  const font = o.bold ? s.fonts.semibold : s.fonts.regular;
  for (const line of wrapText(font, text, size, o.maxW ?? MARGIN + CONTENT_W - x)) {
    ensureRoom(s, lineHeight);
    if (line !== '') drawText(s, line, { ...o, x, y: s.y, size });
    s.y -= lineHeight;
  }
  if (o.gap) s.y -= o.gap;
}

/** 섹션 제목 + 밑줄. */
export function drawSectionTitle(s: Sheet, title: string): void {
  ensureRoom(s, 34);
  drawText(s, title, { y: s.y, size: 11, bold: true });
  s.y -= 6;
  s.page.drawLine({
    start: { x: MARGIN, y: s.y },
    end: { x: MARGIN + CONTENT_W, y: s.y },
    thickness: 0.5,
    color: COLOR.line,
  });
  s.y -= 14;
}

// ── 키-값 행 ─────────────────────────────────────────────────────────────────

export type KeyValueRow = { label: string; value: string; bold?: boolean };

/** 라벨(회색) + 값(진회색) 2열. 값이 길면 접히고, 지면이 모자라면 넘어간다. */
export function drawKeyValueRows(
  s: Sheet,
  rows: readonly KeyValueRow[],
  o: { labelW?: number; size?: number } = {},
): void {
  const size = o.size ?? 9;
  const labelW = o.labelW ?? 110;
  const lineHeight = size * 1.5;
  const valueX = MARGIN + labelW;
  const valueMaxW = CONTENT_W - labelW;
  for (const row of rows) {
    const font = row.bold ? s.fonts.semibold : s.fonts.regular;
    const lines = wrapText(font, row.value, size, valueMaxW);
    ensureRoom(s, lineHeight * Math.max(1, lines.length));
    drawText(s, row.label, { x: MARGIN, y: s.y, size, color: COLOR.label });
    lines.forEach((line, i) => {
      if (i > 0) ensureRoom(s, lineHeight);
      drawText(s, line, { x: valueX, y: s.y, size, bold: row.bold });
      if (i < lines.length - 1) s.y -= lineHeight;
    });
    s.y -= lineHeight;
  }
}

// ── 표 ───────────────────────────────────────────────────────────────────────

export type TableCell = { text: string; bold?: boolean; color?: RGB };

/**
 * 밀도 있는 문서형 표 — 0.5pt 옅은 회색 가로선만 긋는다(세로 괘선 없음).
 * 셀은 열 폭에 맞춰 접히고, 행 단위로 페이지를 넘긴다(행이 쪼개지지 않는다).
 */
export function drawTable(
  s: Sheet,
  colWidths: readonly number[],
  rows: readonly (readonly TableCell[])[],
  o: { size?: number; padY?: number } = {},
): void {
  const size = o.size ?? 9;
  const padY = o.padY ?? 5;
  const lineHeight = size * 1.4;

  for (const row of rows) {
    const wrapped = row.map((cell, i) =>
      wrapText(
        cell.bold ? s.fonts.semibold : s.fonts.regular,
        cell.text,
        size,
        (colWidths[i] ?? CONTENT_W) - 6,
      ),
    );
    const rowH = Math.max(...wrapped.map((w) => w.length)) * lineHeight + padY * 2;
    ensureRoom(s, rowH);

    const top = s.y;
    wrapped.forEach((lines, i) => {
      const x = MARGIN + colWidths.slice(0, i).reduce((a, b) => a + b, 0) + 3;
      lines.forEach((line, li) => {
        drawText(s, line, {
          x,
          y: top - padY - size - li * lineHeight,
          size,
          bold: row[i]?.bold,
          color: row[i]?.color,
        });
      });
    });

    s.y = top - rowH;
    s.page.drawLine({
      start: { x: MARGIN, y: s.y },
      end: { x: MARGIN + CONTENT_W, y: s.y },
      thickness: 0.5,
      color: COLOR.line,
    });
  }
  s.y -= 4;
}

// ── 푸터 ─────────────────────────────────────────────────────────────────────

/**
 * 코퍼스 조각 — 푸터가 그리는 정적 문자열. compose/finalize 가 합산한다.
 * (별지 상수와 달리 푸터는 **모든 페이지**에 찍히므로 빠뜨리면 피해가 가장 크다.)
 */
export const FOOTER_STATIC_TEXT: readonly string[] = [CONTRACT_FOOTER_BRAND];

/**
 * 간인 대체 각인 — 하단 중앙에 `문서번호 · i/n`, 좌하단에 브랜드.
 * 페이지 폭은 실제 페이지에서 읽는다(업로드 템플릿이 A4 가 아닐 수 있다).
 */
export function stampFooter(
  page: PDFPage,
  pageIdx: number,
  pageCount: number,
  docCode: string,
  fonts: Fonts,
  corpus: ReadonlySet<string>,
): void {
  const center = `${docCode} · ${pageIdx + 1}/${pageCount}`;
  assertDrawable(corpus, center);
  assertDrawable(corpus, CONTRACT_FOOTER_BRAND);
  const w = fonts.regular.widthOfTextAtSize(center, FOOTER_SIZE);
  page.drawText(center, {
    x: (page.getWidth() - w) / 2,
    y: FOOTER_Y,
    size: FOOTER_SIZE,
    font: fonts.regular,
    color: COLOR.footer,
  });
  page.drawText(CONTRACT_FOOTER_BRAND, {
    x: MARGIN,
    y: FOOTER_Y,
    size: FOOTER_SIZE,
    font: fonts.regular,
    color: COLOR.footer,
  });
}
