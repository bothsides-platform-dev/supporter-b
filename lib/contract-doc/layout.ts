// 계약서 레이아웃 엔진 — **순수 함수**. PDF 바이트를 만지지 않고 폰트도 모른다
// (폭 측정기를 주입받는다). `template-editor-state.ts` 가 pdfjs 없이 테스트되는
// 것과 같은 분리다.
//
// ## 좌표계
//
// 처음부터 **공급자 좌표계로** 계산한다: 좌상단 원점, y 아래로 증가, 단위는 pt.
// 공급자 스펙이 "pdf.js `getViewport({scale:1})` pixel, 원점 좌상단" 이고, 회전
// 없는 페이지에서 그 viewport 는 MediaBox 와 같으므로 **1 pixel == 1 pt** 다.
// 따라서 `fields` 는 변환 없이 그대로 발송 payload 가 된다. 뒤집기는 pdf-lib 로
// 그리는 순간에만, 렌더러 한 곳에서 일어난다.
//
// ## 서명칸을 사람이 찍지 않는다
//
// 업계는 생성 문서에 앵커 문자열을 숨겨 서명칸을 찾게 하지만(DocuSign AutoPlace),
// 우리는 렌더러를 소유하므로 **레이아웃이 좌표를 직접 뱉는다**. 서명란이 문서
// 모델에 없는 것도 같은 이유다 — 구조가 고정이어야 좌표를 계산할 수 있고, 덕분에
// "서명칸 없는 계약서"가 표현 불가능해진다.

import type { ContractDoc } from '@/lib/types/contract-doc';
import type { SigningTemplateFieldInput } from '@/lib/types/signing';
import type { FeeTableRow } from './fee-table';
import { wrapText } from './line-break';

/** A4. 공급자에 올리는 PDF 도 같은 크기로 만든다. */
export const PAGE = { width: 595.28, height: 841.89 } as const;
export const MARGIN = { top: 64, right: 56, bottom: 72, left: 56 } as const;

const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const CONTENT_BOTTOM = PAGE.height - MARGIN.bottom;

const SIZE = { title: 16, heading: 11, body: 10.5, sign: 10 } as const;
const LINE_RATIO = 1.7;
/**
 * 베이스라인은 줄 상자 위에서 이만큼 아래다. 실제 폰트 ascent 대신 상수를 쓰는 이유:
 * 렌더러와 레이아웃이 **같은 규칙**만 쓰면 시각적 정합은 유지되고, metric 주입
 * 인터페이스가 폭 하나로 좁아진다(테스트가 가벼워진다).
 */
const BASELINE_RATIO = 0.78;

const lineHeight = (size: number) => size * LINE_RATIO;

export type FontWeight = 'regular' | 'bold';

export type TextMetrics = {
  widthOf(text: string, size: number, weight: FontWeight): number;
};

export type DrawOp =
  | {
      op: 'text';
      page: number;
      x: number;
      /** 좌상단 원점 기준 베이스라인 y. */
      baselineY: number;
      size: number;
      weight: FontWeight;
      text: string;
    }
  | { op: 'line'; page: number; x: number; y: number; width: number; thickness: number };

export type ContractParty = {
  company: string;
  /** 없으면 서명 화면에서 채우도록 입력칸을 만든다. */
  bizNo?: string;
};

export type LayoutInput = {
  /** **변수가 해석된** 문서. 레이아웃은 `{{토큰}}` 을 모른다. */
  doc: ContractDoc;
  feeRows: FeeTableRow[];
  parties: { buyer: ContractParty; pg: ContractParty };
};

export type LayoutResult = {
  pageCount: number;
  ops: DrawOp[];
  /** 그대로 `buildSignatureFieldsPayload` 에 넘어간다. */
  fields: SigningTemplateFieldInput[];
};

// ── 서명란 기하 ──────────────────────────────────────────────────────────────
const SIGN_GAP = 28;
const SIGN_COL_WIDTH = (CONTENT_WIDTH - SIGN_GAP) / 2;
const SIGN_LABEL_WIDTH = 74;
const SIGN_VALUE_WIDTH = SIGN_COL_WIDTH - SIGN_LABEL_WIDTH;
const SIGN_ROW_HEIGHT = 24;
const SIGN_SIGNATURE_HEIGHT = 52;
const SIGN_TITLE_HEIGHT = 22;
/** 당사자 표기 4행(상호·사업자등록번호·주소·대표자) + 서명 1행. */
const SIGN_BLOCK_HEIGHT = SIGN_TITLE_HEIGHT + SIGN_ROW_HEIGHT * 4 + SIGN_SIGNATURE_HEIGHT + 12;

type Cursor = { page: number; y: number };

class Layouter {
  readonly ops: DrawOp[] = [];
  readonly fields: SigningTemplateFieldInput[] = [];
  private cursor: Cursor = { page: 1, y: MARGIN.top };
  private fieldSeq = 0;

  constructor(private readonly metrics: TextMetrics) {}

  get pageCount(): number {
    return this.cursor.page;
  }

  /** 남은 높이가 모자라면 새 페이지로 넘긴다. */
  private ensure(height: number): void {
    if (this.cursor.y + height > CONTENT_BOTTOM) {
      this.cursor = { page: this.cursor.page + 1, y: MARGIN.top };
    }
  }

  private measure(size: number, weight: FontWeight) {
    return (text: string) => this.metrics.widthOf(text, size, weight);
  }

  private drawLine(text: string, size: number, weight: FontWeight, x: number): void {
    const h = lineHeight(size);
    this.ensure(h);
    this.ops.push({
      op: 'text',
      page: this.cursor.page,
      x,
      baselineY: this.cursor.y + size * BASELINE_RATIO,
      size,
      weight,
      text,
    });
    this.cursor.y += h;
  }

  /** 문단 하나를 폭에 맞춰 접어 그린다. */
  paragraph(
    text: string,
    opts: { size?: number; weight?: FontWeight; x?: number; width?: number } = {},
  ): void {
    const size = opts.size ?? SIZE.body;
    const weight = opts.weight ?? 'regular';
    const x = opts.x ?? MARGIN.left;
    const width = opts.width ?? CONTENT_WIDTH;
    if (text.trim() === '') return;
    for (const line of wrapText(text, width, this.measure(size, weight))) {
      this.drawLine(line, size, weight, x);
    }
  }

  centered(text: string, size: number, weight: FontWeight): void {
    const w = this.metrics.widthOf(text, size, weight);
    const h = lineHeight(size);
    this.ensure(h);
    this.ops.push({
      op: 'text',
      page: this.cursor.page,
      x: MARGIN.left + Math.max(0, (CONTENT_WIDTH - w) / 2),
      baselineY: this.cursor.y + size * BASELINE_RATIO,
      size,
      weight,
      text,
    });
    this.cursor.y += h;
  }

  gap(height: number): void {
    this.cursor.y += height;
  }

  /**
   * 조 제목 — 본문 두 줄이 함께 들어갈 자리가 없으면 페이지를 넘긴다.
   *
   * 한 줄이 아니라 **두 줄**을 요구하는 이유: 제목 + 본문 한 줄만 남아도 사람 눈에는
   * 여전히 고아로 읽힌다.
   */
  clauseHeading(text: string): void {
    this.ensure(lineHeight(SIZE.heading) + lineHeight(SIZE.body) * 2);
    this.drawLine(text, SIZE.heading, 'bold', MARGIN.left);
  }

  /** 2열 표 — 라벨/값. 값은 폭에 맞춰 접힌다. */
  table(rows: FeeTableRow[]): void {
    const labelWidth = 120;
    const valueWidth = CONTENT_WIDTH - labelWidth - 12;
    const measureValue = this.measure(SIZE.body, 'regular');
    for (const row of rows) {
      const valueLines = wrapText(row.value, valueWidth, measureValue);
      const rowHeight = lineHeight(SIZE.body) * valueLines.length + 6;
      this.ensure(rowHeight);
      const top = this.cursor.y;
      const page = this.cursor.page;
      this.ops.push({
        op: 'text',
        page,
        x: MARGIN.left,
        baselineY: top + SIZE.body * BASELINE_RATIO,
        size: SIZE.body,
        weight: 'bold',
        text: row.label,
      });
      valueLines.forEach((line, i) => {
        this.ops.push({
          op: 'text',
          page,
          x: MARGIN.left + labelWidth,
          baselineY: top + SIZE.body * BASELINE_RATIO + lineHeight(SIZE.body) * i,
          size: SIZE.body,
          weight: 'regular',
          text: line,
        });
      });
      this.cursor.y = top + rowHeight;
      this.ops.push({
        op: 'line',
        page,
        x: MARGIN.left,
        y: this.cursor.y - 3,
        width: CONTENT_WIDTH,
        thickness: 0.4,
      });
    }
  }

  /**
   * 서명 화면에서 채울 자리 아래에 얇은 밑줄을 긋는다.
   *
   * 공급자 UI 에서는 입력칸이 이 위에 얹히므로 없어도 되지만, **인쇄하거나 PDF 만
   * 받아 본 사람에게는 빈 여백일 뿐**이다. 계약서 서식의 관례이기도 하다.
   */
  private underline(rect: { x: number; y: number; width: number; height: number }): void {
    this.ops.push({
      op: 'line',
      page: this.cursor.page,
      x: rect.x,
      y: rect.y + rect.height,
      width: rect.width,
      thickness: 0.5,
    });
  }

  private addField(
    party: SigningTemplateFieldInput['party'],
    type: SigningTemplateFieldInput['type'],
    rect: { x: number; y: number; width: number; height: number },
  ): void {
    this.fieldSeq += 1;
    this.fields.push({
      // 결정적 id — 같은 문서를 두 번 레이아웃하면 같은 값이 나와야 스냅샷이 안정된다.
      id: `f${this.fieldSeq}`,
      type,
      party,
      pageNumber: this.cursor.page,
      ...rect,
    });
  }

  /**
   * 서명란 — 통째로 한 페이지 안에 넣는다.
   *
   * 쪼개지면 갑의 칸과 을의 칸이 다른 장에 앉는다. 법적으로도 어색하고, 좌표만
   * 봐서는 그 상태를 알아챌 수 없다.
   */
  signatureBlock(parties: LayoutInput['parties']): void {
    this.ensure(SIGN_BLOCK_HEIGHT);
    const top = this.cursor.y;
    const columns = [
      { key: 'buyer' as const, title: '갑 (구매사)', party: parties.buyer, x: MARGIN.left },
      {
        key: 'pg' as const,
        title: '을 (PG사)',
        party: parties.pg,
        x: MARGIN.left + SIGN_COL_WIDTH + SIGN_GAP,
      },
    ];

    for (const column of columns) {
      let y = top;
      this.ops.push({
        op: 'text',
        page: this.cursor.page,
        x: column.x,
        baselineY: y + SIZE.sign * BASELINE_RATIO,
        size: SIZE.sign,
        weight: 'bold',
        text: column.title,
      });
      y += SIGN_TITLE_HEIGHT;

      // 값을 아는 항목은 인쇄하고, 모르는 항목만 입력칸으로 남긴다. 빈 밑줄은
      // 아무도 채울 수 없고 서명 후 위조 표면이 되므로 만들지 않는다.
      const rows: { label: string; value?: string }[] = [
        { label: '상        호', value: column.party.company },
        { label: '사업자등록번호', value: column.party.bizNo },
        // 주소·대표자는 우리 스키마에 없다 — 항상 서명 화면에서 채운다.
        { label: '주        소' },
        { label: '대  표  자' },
      ];

      for (const row of rows) {
        this.ops.push({
          op: 'text',
          page: this.cursor.page,
          x: column.x,
          baselineY: y + SIZE.sign * BASELINE_RATIO,
          size: SIZE.sign,
          weight: 'regular',
          text: row.label,
        });
        if (row.value !== undefined && row.value !== '') {
          this.ops.push({
            op: 'text',
            page: this.cursor.page,
            x: column.x + SIGN_LABEL_WIDTH,
            baselineY: y + SIZE.sign * BASELINE_RATIO,
            size: SIZE.sign,
            weight: 'regular',
            text: row.value,
          });
        } else {
          const rect = {
            x: column.x + SIGN_LABEL_WIDTH,
            y: y - 2,
            width: SIGN_VALUE_WIDTH,
            height: SIGN_ROW_HEIGHT - 6,
          };
          this.addField(column.key, 'text', rect);
          this.underline(rect);
        }
        y += SIGN_ROW_HEIGHT;
      }

      this.ops.push({
        op: 'text',
        page: this.cursor.page,
        x: column.x,
        baselineY: y + SIZE.sign * BASELINE_RATIO,
        size: SIZE.sign,
        weight: 'regular',
        text: '서        명',
      });
      const signRect = {
        x: column.x + SIGN_LABEL_WIDTH,
        y: y - 2,
        width: SIGN_VALUE_WIDTH,
        height: SIGN_SIGNATURE_HEIGHT - 8,
      };
      this.addField(column.key, 'signature', signRect);
      this.underline(signRect);
    }

    this.cursor.y = top + SIGN_BLOCK_HEIGHT;
  }
}

export function layoutContract(input: LayoutInput, metrics: TextMetrics): LayoutResult {
  const l = new Layouter(metrics);
  const { doc, feeRows, parties } = input;

  l.centered(doc.title, SIZE.title, 'bold');
  l.gap(18);
  l.paragraph(doc.preamble);
  l.gap(14);

  doc.clauses.forEach((clause, index) => {
    l.clauseHeading(`제${index + 1}조 (${clause.heading})`);
    if (clause.kind === 'text') {
      l.paragraph(clause.body);
    } else {
      l.paragraph(clause.intro);
      l.gap(6);
      if (feeRows.length > 0) {
        l.table(feeRows);
      } else {
        // 빈 표를 그리면 "요율이 0" 처럼 읽힌다. 사실대로 쓴다.
        l.paragraph('결제수단별 수수료율은 양 당사자가 별도 협의하여 정한다.');
      }
      l.gap(6);
      l.paragraph(clause.outro);
    }
    l.gap(10);
  });

  l.gap(8);
  l.paragraph(doc.closing);
  l.gap(24);
  l.signatureBlock(parties);

  return { pageCount: l.pageCount, ops: l.ops, fields: l.fields };
}
