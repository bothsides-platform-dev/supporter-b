import fontkit from '@pdf-lib/fontkit';
import { PDFDocument } from 'pdf-lib';
import subsetFont from 'subset-font';
import { loadContractFontBytes } from './fonts';
import { sha256Hex } from './hash';
import { AUDIT_STATIC_TEXT, type AuditEvent, type AuditSigner, drawAuditSheet } from './pdf/audit-sheet';
import { SAFE_CORPUS, buildCorpus, collectStrings } from './pdf/corpus';
import { FOOTER_STATIC_TEXT, createSheet, type Fonts, stampFooter } from './pdf/layout';

const PRODUCER = 'supportb-econtract';
const CREATOR = 'supportb';

/** compose.ts 와 동일 규약 — 주입된 now 로 시각을 못박아 결정성을 지킨다. */
function pinMetadata(doc: PDFDocument, now: Date): void {
  doc.setProducer(PRODUCER);
  doc.setCreator(CREATOR);
  doc.setCreationDate(now);
  doc.setModificationDate(now);
}

async function embedSubsetFonts(doc: PDFDocument, corpus: string): Promise<Fonts> {
  const { regular, semibold } = await loadContractFontBytes();
  const [regularSubset, semiboldSubset] = await Promise.all([
    subsetFont(regular, corpus, { targetFormat: 'truetype' }),
    subsetFont(semibold, corpus, { targetFormat: 'truetype' }),
  ]);
  doc.registerFontkit(fontkit);
  return {
    regular: await doc.embedFont(regularSubset as unknown as Uint8Array, { subset: false }),
    semibold: await doc.embedFont(semiboldSubset as unknown as Uint8Array, { subset: false }),
  };
}

export type ComposeFinalInput = {
  /** composeBasePdf 산출물 — 서명 대상이 된 바로 그 바이트. */
  basePdf: Buffer;
  docCode: string;
  now: Date;
  title: string;
  /** basePdf 의 SHA-256. 확인서에 "서명 대상 문서"의 지문으로 인쇄된다. */
  baseSha256: string;
  completedAt: Date;
  signers: readonly AuditSigner[];
  events: readonly AuditEvent[];
};

/**
 * 체결 완료본을 만든다: base PDF + [별지2] 전자서명 및 감사추적 확인서.
 *
 * **base 페이지는 손대지 않는다** — 푸터도 다시 찍지 않는다. base 는 서명자가
 * 실제로 본 바로 그 문서이고 그 SHA-256 이 확인서에 증거로 인쇄되므로, 완료본
 * 안의 그 페이지들이 base 와 다르게 보이면 증거로서의 값이 떨어진다.
 * (결과적으로 base 페이지 푸터의 `i/n` 은 base 기준 총쪽수를 유지한다 — 별지2는
 *  완료본 기준으로 번호를 이어받는 부속서다.)
 */
export async function composeFinalPdf(
  input: ComposeFinalInput,
): Promise<{ pdf: Buffer; sha256: string }> {
  const { basePdf, docCode, now, title, baseSha256, completedAt, signers, events } = input;

  const doc = await PDFDocument.load(basePdf);

  // 서명 PNG 는 collectStrings 가 건너뛴다(바이트 순회 방지) — 그릴 글자가 아니므로 무해.
  const corpus = buildCorpus([
    SAFE_CORPUS,
    ...FOOTER_STATIC_TEXT,
    ...AUDIT_STATIC_TEXT,
    ...collectStrings({ docCode, title, baseSha256, signers, events }),
  ]);
  const drawable = new Set(corpus);
  const fonts = await embedSubsetFonts(doc, corpus);

  const basePageCount = doc.getPageCount();
  const sheet = createSheet(doc, fonts, drawable);
  await drawAuditSheet(sheet, { docCode, title, baseSha256, completedAt, signers, events });

  // 새로 붙인 별지에만 각인한다 — base 페이지는 이미 compose 단계에서 찍혔다.
  const pages = doc.getPages();
  for (let i = basePageCount; i < pages.length; i++) {
    stampFooter(pages[i]!, i, pages.length, docCode, fonts, drawable);
  }

  pinMetadata(doc, now);
  const pdf = Buffer.from(await doc.save());
  return { pdf, sha256: sha256Hex(pdf) };
}
