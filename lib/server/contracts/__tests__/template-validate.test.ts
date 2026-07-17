import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { MAX_BYTES } from '@/lib/server/storage/constants';
import { CONTRACT_TEMPLATE_MAX_PAGES } from '@/lib/types/contract-doc';
import { validateTemplatePdf } from '@/lib/server/contracts/template-validate';

async function makePdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595.28, 841.89]);
  return Buffer.from(await doc.save());
}

// PG가 업로드한 임의의 PDF를 계약 템플릿으로 받아들이기 전의 관문.
// 여기서 통과시킨 바이트는 이후 composeBasePdf 가 로드·합성하므로,
// 이 게이트가 새면 compose 단계에서 비용 폭주(수백 페이지)나 예외로 번진다.
describe('validateTemplatePdf', () => {
  it('정상 2페이지 PDF 는 ok + pageCount 를 반환한다', async () => {
    const res = await validateTemplatePdf(await makePdf(2));
    expect(res).toEqual({ ok: true, pageCount: 2 });
  });

  it('상한(60p) 정확히 맞는 PDF 는 통과한다 — 경계는 포함', async () => {
    const res = await validateTemplatePdf(await makePdf(CONTRACT_TEMPLATE_MAX_PAGES));
    expect(res).toEqual({ ok: true, pageCount: CONTRACT_TEMPLATE_MAX_PAGES });
  });

  it('손상된 바이트는 UNREADABLE', async () => {
    const res = await validateTemplatePdf(Buffer.from('not a pdf at all', 'utf8'));
    expect(res).toEqual({ ok: false, reason: 'UNREADABLE' });
  });

  it('PDF 헤더만 있고 본문이 깨진 바이트도 UNREADABLE', async () => {
    const broken = Buffer.concat([
      Buffer.from('%PDF-1.7\n', 'utf8'),
      Buffer.from([0x00, 0x01, 0x02, 0x03]),
    ]);
    const res = await validateTemplatePdf(broken);
    expect(res).toEqual({ ok: false, reason: 'UNREADABLE' });
  });

  it('상한 초과(61p) PDF 는 PAGE_LIMIT', async () => {
    const res = await validateTemplatePdf(await makePdf(CONTRACT_TEMPLATE_MAX_PAGES + 1));
    expect(res).toEqual({ ok: false, reason: 'PAGE_LIMIT' });
  });

  it('MAX_BYTES 초과 버퍼는 load 이전에 SIZE_LIMIT — 파싱 비용을 치르지 않는다', async () => {
    // 유효한 PDF 가 전혀 아닌 0바이트 덩어리를 준다. 크기 검사가 load 보다
    // 앞서지 않으면 UNREADABLE 이 나오므로, 이 단언이 검사 순서를 못박는다.
    const huge = Buffer.alloc(MAX_BYTES + 1);
    const res = await validateTemplatePdf(huge);
    expect(res).toEqual({ ok: false, reason: 'SIZE_LIMIT' });
  });

  it('MAX_BYTES 정확히 맞는 크기는 크기 사유로 거절하지 않는다 — 경계는 포함', async () => {
    // 크기는 통과하되 내용이 PDF 가 아니므로 UNREADABLE 로 떨어져야 한다.
    const atLimit = Buffer.alloc(MAX_BYTES);
    const res = await validateTemplatePdf(atLimit);
    expect(res).toEqual({ ok: false, reason: 'UNREADABLE' });
  });
});
