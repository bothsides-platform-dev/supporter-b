import { describe, it, expect } from 'vitest';
import { renderRfpRequoteRequested } from '../rfpRequoteRequested';

describe('renderRfpRequoteRequested', () => {
  it('renders buyer message, deadline, and inbox link', async () => {
    const html = await renderRfpRequoteRequested({
      rfpId: 'P-2606-0042',
      rfpTitle: '결제 인프라 견적',
      buyerName: '구매사ABC',
      message: '카드 수수료를 0.1%p 낮춰주세요',
      deadline: '2026-06-20 23:59',
      inboxUrl: 'https://partner.support-b.com/inbox/P-2606-0042',
    });
    expect(html).toContain('카드 수수료를 0.1%p 낮춰주세요');
    expect(html).toContain('P-2606-0042');
    expect(html).toContain('https://partner.support-b.com/inbox/P-2606-0042');
  });
});
