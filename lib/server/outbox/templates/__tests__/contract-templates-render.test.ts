// Smoke renders for the 7 e-contract outbox email templates. Mirrors the
// standalone-file style of rfpRequoteRequested.test.ts: plain `toContain`
// assertions on the core phrase, `code`, and the CTA `ctaUrl` rendered as a
// clickable href (every template in this set carries a ctaUrl prop).
import { describe, it, expect } from 'vitest';

import { renderContractSent } from '../contractSent';
import { renderContractSigned } from '../contractSigned';
import { renderContractCompleted } from '../contractCompleted';
import { renderContractDeclined } from '../contractDeclined';
import { renderContractCanceled } from '../contractCanceled';
import { renderContractExpired } from '../contractExpired';
import { renderContractSignerReassigned } from '../contractSignerReassigned';

describe('outbox email templates / contract', () => {
  it('contractSent includes code, title, sender, sign deadline and CTA link', async () => {
    const html = await renderContractSent({
      code: 'C-2607-0001',
      title: '결제대행 표준 계약서',
      pgWorkspaceName: '서포터 B 페이',
      expiresAtLabel: '2026-07-31 18:00',
      ctaUrl: 'https://bidit.test/contracts/C-2607-0001',
    });
    expect(html).toContain('C-2607-0001');
    expect(html).toContain('결제대행 표준 계약서');
    expect(html).toContain('서포터 B 페이');
    expect(html).toContain('2026-07-31 18:00');
    expect(html).toContain('href="https://bidit.test/contracts/C-2607-0001"');
    expect(html).toContain('전자계약서를 보냈어요');
    expect(html).toContain('서명해 주세요');
  });

  it('contractSigned includes code, title, signer name and CTA link', async () => {
    const html = await renderContractSigned({
      code: 'C-2607-0002',
      title: '결제대행 표준 계약서',
      signerName: '김구매',
      ctaUrl: 'https://bidit.test/contracts/C-2607-0002',
    });
    expect(html).toContain('C-2607-0002');
    expect(html).toContain('결제대행 표준 계약서');
    expect(html).toContain('김구매');
    expect(html).toContain('href="https://bidit.test/contracts/C-2607-0002"');
    expect(html).toContain('서명했어요');
    expect(html).toContain('완료돼요');
  });

  it('contractCompleted includes code, title and CTA link', async () => {
    const html = await renderContractCompleted({
      code: 'C-2607-0003',
      title: '결제대행 표준 계약서',
      ctaUrl: 'https://bidit.test/contracts/C-2607-0003',
    });
    expect(html).toContain('C-2607-0003');
    expect(html).toContain('결제대행 표준 계약서');
    expect(html).toContain('href="https://bidit.test/contracts/C-2607-0003"');
    expect(html).toContain('계약이 완료됐어요');
    expect(html).toContain('내려받을 수 있어요');
  });

  it('contractDeclined includes code, title, reason and CTA link', async () => {
    const html = await renderContractDeclined({
      code: 'C-2607-0004',
      title: '결제대행 표준 계약서',
      reason: '수수료율 조건 재검토가 필요해요',
      ctaUrl: 'https://bidit.test/contracts/C-2607-0004',
    });
    expect(html).toContain('C-2607-0004');
    expect(html).toContain('결제대행 표준 계약서');
    expect(html).toContain('수수료율 조건 재검토가 필요해요');
    expect(html).toContain('href="https://bidit.test/contracts/C-2607-0004"');
    expect(html).toContain('반려했어요');
  });

  it('contractCanceled includes code, title, pg workspace name and CTA link', async () => {
    const html = await renderContractCanceled({
      code: 'C-2607-0005',
      title: '결제대행 표준 계약서',
      pgWorkspaceName: '서포터 B 페이',
      ctaUrl: 'https://bidit.test/contracts/C-2607-0005',
    });
    expect(html).toContain('C-2607-0005');
    expect(html).toContain('결제대행 표준 계약서');
    expect(html).toContain('서포터 B 페이');
    expect(html).toContain('href="https://bidit.test/contracts/C-2607-0005"');
    expect(html).toContain('회수했어요');
  });

  it('contractExpired includes code, title and CTA link', async () => {
    const html = await renderContractExpired({
      code: 'C-2607-0006',
      title: '결제대행 표준 계약서',
      ctaUrl: 'https://bidit.test/contracts/C-2607-0006',
    });
    expect(html).toContain('C-2607-0006');
    expect(html).toContain('결제대행 표준 계약서');
    expect(html).toContain('href="https://bidit.test/contracts/C-2607-0006"');
    expect(html).toContain('만료됐어요');
  });

  it('contractSignerReassigned includes code, title and CTA link', async () => {
    const html = await renderContractSignerReassigned({
      code: 'C-2607-0007',
      title: '결제대행 표준 계약서',
      ctaUrl: 'https://bidit.test/contracts/C-2607-0007',
    });
    expect(html).toContain('C-2607-0007');
    expect(html).toContain('결제대행 표준 계약서');
    expect(html).toContain('href="https://bidit.test/contracts/C-2607-0007"');
    expect(html).toContain('서명자로 지정됐어요');
  });
});
