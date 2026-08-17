// 레이아웃 → PDF 바이트. **두 좌표계가 만나는 유일한 자리다.**
//
// 레이아웃은 좌상단 원점(= 공급자 좌표계)으로 계산하고 pdf-lib 은 좌하단 원점으로
// 그린다. 뒤집기를 여기 한 곳에 가둔 이유는 분산되면 어긋나는 것이 조용하기
// 때문이다 — 글자와 서명칸이 위아래로 뒤집힌 채 발송되고, 발송 전에는 아무도 못
// 본다. 그래서 라운드트립 테스트가 pdfjs 로 되읽어 **좌표까지** 대조한다.
//
// 서명칸(`fields`)은 **뒤집지 않는다.** 이미 공급자 좌표계라 그대로 나간다.

import { PDFDocument, rgb } from 'pdf-lib';
import type { SigningTemplateFieldInput } from '@/lib/types/signing';
import { embedContractFonts } from './pdf-font';
import { layoutContract, PAGE, type DrawOp, type LayoutInput, type TextMetrics } from './layout';

export type RenderedContract = {
  bytes: Uint8Array;
  fields: SigningTemplateFieldInput[];
  pageCount: number;
  /** 라운드트립 검증용 — 그린 그대로의 연산 목록. */
  ops: DrawOp[];
};

/**
 * PDF 메타데이터 시각의 기본값.
 *
 * pdf-lib 은 기본적으로 **현재 시각**을 넣는데, 그러면 같은 입력이 매번 다른
 * 바이트를 만들어 "미리보기 = 발송본" 을 말할 수 없게 된다. 호출자가 계약일을
 * 넘기면 그것을, 아니면 이 고정값을 쓴다.
 */
const FIXED_PDF_DATE = new Date('2000-01-01T00:00:00Z');

export type RenderOptions = {
  /** PDF 메타데이터에 찍을 시각. 생략하면 고정값(결정성 우선). */
  pdfDate?: Date;
};

export async function renderContractPdf(
  input: LayoutInput,
  options: RenderOptions = {},
): Promise<RenderedContract> {
  const pdf = await PDFDocument.create();
  const fonts = await embedContractFonts(pdf);

  // 폭 측정을 **임베드된 폰트에서** 가져온다 — 재는 폰트와 그리는 폰트가 같아야
  // 줄바꿈이 실제 렌더와 어긋나지 않는다.
  const metrics: TextMetrics = {
    widthOf: (text, size, weight) =>
      (weight === 'bold' ? fonts.bold : fonts.regular).widthOfTextAtSize(text, size),
  };

  const layout = layoutContract(input, metrics);

  const pages = Array.from({ length: layout.pageCount }, () =>
    pdf.addPage([PAGE.width, PAGE.height]),
  );

  for (const op of layout.ops) {
    const page = pages[op.page - 1];
    if (page === undefined) continue;
    if (op.op === 'text') {
      page.drawText(op.text, {
        x: op.x,
        // 좌상단 y → 좌하단 y. pdf-lib 의 drawText y 는 **베이스라인**이라
        // 레이아웃이 베이스라인을 내주는 것과 짝이 맞는다.
        y: PAGE.height - op.baselineY,
        size: op.size,
        font: op.weight === 'bold' ? fonts.bold : fonts.regular,
      });
      continue;
    }
    page.drawRectangle({
      x: op.x,
      // drawRectangle 의 y 는 **아래 모서리**다. 선은 두께만큼 아래에서 시작한다.
      y: PAGE.height - op.y - op.thickness,
      width: op.width,
      height: op.thickness,
      color: rgb(0.8, 0.8, 0.8),
    });
  }

  // 결정성 — pdf-lib 기본값은 현재 시각이라 그대로 두면 매 렌더가 다른 바이트다.
  const stamp = options.pdfDate ?? FIXED_PDF_DATE;
  pdf.setCreationDate(stamp);
  pdf.setModificationDate(stamp);
  pdf.setProducer('supporter-b');
  pdf.setCreator('supporter-b');
  pdf.setTitle(input.doc.title);

  return {
    bytes: await pdf.save(),
    fields: layout.fields,
    pageCount: layout.pageCount,
    ops: layout.ops,
  };
}
