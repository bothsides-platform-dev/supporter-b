import fontkit from '@pdf-lib/fontkit';
import { PDFDocument } from 'pdf-lib';
import subsetFont from 'subset-font';
import type { ContractPartiesV1, ContractTermsSnapshotV1 } from '@/lib/types/contract-doc';
import { loadContractFontBytes } from './fonts';
import { sha256Hex } from './hash';
import { SAFE_CORPUS, buildCorpus, collectStrings } from './pdf/corpus';
import { FOOTER_STATIC_TEXT, createSheet, type Fonts, stampFooter } from './pdf/layout';
import { OVERVIEW_STATIC_TEXT, drawOverviewSheet } from './pdf/overview-sheet';

/** PDF 메타데이터 고정값 — 결정성의 일부(문서마다 달라지면 SHA 도 달라진다). */
const PRODUCER = 'supportb-econtract';
const CREATOR = 'supportb';

/**
 * 문서 메타데이터를 못박는다. pdf-lib 는 기본적으로 생성/수정 시각에 `new Date()`
 * 를 넣으므로, 주입된 `now` 로 덮지 않으면 같은 입력이 매번 다른 바이트를 낳고
 * 무결성 해시(basePdfSha256)가 의미를 잃는다.
 */
function pinMetadata(doc: PDFDocument, now: Date): void {
  doc.setProducer(PRODUCER);
  doc.setCreator(CREATOR);
  doc.setCreationDate(now);
  doc.setModificationDate(now);
}

/**
 * 서브셋 폰트를 문서에 임베드한다.
 *
 * 왜 사전 서브셋인가: `embedFont(..., {subset:true})` 의 자체 서브셋 경로는
 * Pretendard 에서 글리프가 유실되는 버그가 확인됐다(스파이크). harfbuzz(subset-font)
 * 로 미리 잘라 넣고 pdf-lib 에는 `subset:false` 로 "있는 그대로" 임베드한다.
 */
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

export type ComposeBaseInput = {
  /** PG 템플릿 원본. validateTemplatePdf 를 통과한 바이트여야 한다. */
  templatePdf: Buffer;
  docCode: string;
  /** 주입된 "지금" — 결정성을 위해 호출자가 소유한다. */
  now: Date;
  title: string;
  parties: ContractPartiesV1;
  terms: ContractTermsSnapshotV1;
};

/**
 * 발송용 base PDF 를 합성한다: 템플릿 원본 + [별지1] 계약 개요 + 전 페이지 푸터.
 *
 * 템플릿 페이지를 새 문서로 **copy 하지 않고** 템플릿 문서 자체에 별지를 append
 * 한다 — copyPages 는 폼 필드·주석을 떨어뜨리기 때문(계약서 템플릿은 이를 품는다).
 *
 * 같은 입력 → 같은 바이트를 보장한다. 이 산출물의 SHA-256 이 곧 "서명 대상 문서"의
 * 지문이 되어 감사추적 확인서에 인쇄되므로, 재현 불가능하면 증거로서 무의미하다.
 */
export async function composeBasePdf(
  input: ComposeBaseInput,
): Promise<{ pdf: Buffer; sha256: string; pageCount: number }> {
  const { templatePdf, docCode, now, title, parties, terms } = input;

  const doc = await PDFDocument.load(templatePdf);

  // 폰트 임베드는 드로잉보다 **먼저** 끝나야 하므로, 그릴 글자를 먼저 모은다.
  // 데이터 유래 문자열은 전수 순회로, 정적 라벨은 별지의 SSOT 상수로 확보한다.
  const corpus = buildCorpus([
    SAFE_CORPUS,
    ...FOOTER_STATIC_TEXT,
    ...OVERVIEW_STATIC_TEXT,
    ...collectStrings({ docCode, title, parties, terms }),
  ]);
  const drawable = new Set(corpus);
  const fonts = await embedSubsetFonts(doc, corpus);

  const sheet = createSheet(doc, fonts, drawable);
  drawOverviewSheet(sheet, { docCode, title, parties, terms });

  // 원본 페이지 내용은 건드리지 않되, 문서 연속성 표시(간인 대체)는 전 페이지에 남긴다.
  const pages = doc.getPages();
  pages.forEach((page, i) => stampFooter(page, i, pages.length, docCode, fonts, drawable));

  pinMetadata(doc, now);
  const pdf = Buffer.from(await doc.save());
  return { pdf, sha256: sha256Hex(pdf), pageCount: pages.length };
}
