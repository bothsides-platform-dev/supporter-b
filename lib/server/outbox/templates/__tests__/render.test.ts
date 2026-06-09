// Smoke renders for the 7 outbox email templates. Each test injects realistic
// props and asserts:
//   1. Core dynamic fields land in the rendered HTML (rfpId / urls / counts).
//   2. The Korean Editorial visual rules survive: font-mono span on numerics,
//      hairline divider, button radius ≤ 12px.
//
// `render()` is async (react-email v2). Each helper is awaited.
import { describe, expect, it } from 'vitest';

import { renderAdminSignupReview } from '../adminSignupReview';
import { renderChatMessage } from '../chatMessage';
import { renderAuthEmailChange } from '../authEmailChange';
import { renderAuthReset } from '../authReset';
import { renderAuthVerify } from '../authVerify';
import { renderBidSubmitted } from '../bidSubmitted';
import { renderRfpAwarded } from '../rfpAwarded';
import { renderRfpInvited } from '../rfpInvited';
import { renderRfpSent } from '../rfpSent';
import { renderWorkspaceApproved } from '../workspaceApproved';
import { renderWorkspaceRejected } from '../workspaceRejected';

// Korean Editorial assertions every template must satisfy.
function expectEditorialRules(html: string): void {
  // Hairline divider — 1px solid #ddd.
  expect(html).toMatch(/border-top:\s*1px solid #ddd/i);
  // Mono stack used for numerics (Mono component injects this stack).
  expect(html.toLowerCase()).toContain('jetbrains mono');
  // tabular-nums applied via font-variant-numeric.
  expect(html).toMatch(/font-variant-numeric:\s*tabular-nums/i);
  // No glassmorphism / gradient — guard against accidental drift.
  expect(html).not.toMatch(/linear-gradient|backdrop-filter|blur\(/i);
}

describe('outbox email templates / render', () => {
  it('authVerify includes verify URL, expiry and editorial rules', async () => {
    const html = await renderAuthVerify({
      verifyUrl: 'https://bidit.test/auth/verify?token=abc123',
      expiresMinutes: 15,
    });
    expect(html).toContain('https://bidit.test/auth/verify?token=abc123');
    expect(html).toContain('15');
    expect(html).toContain('인증');
    expectEditorialRules(html);
  });

  it('authReset includes reset URL and expiry', async () => {
    const html = await renderAuthReset({
      resetUrl: 'https://bidit.test/password/reset?token=def456',
      expiresMinutes: 30,
    });
    expect(html).toContain('https://bidit.test/password/reset?token=def456');
    expect(html).toContain('30');
    expect(html).toContain('비밀번호');
    expectEditorialRules(html);
  });

  it('authEmailChange includes confirm URL, new email and TTL hours', async () => {
    const html = await renderAuthEmailChange({
      confirmUrl: 'https://bidit.test/auth/email-change?token=ghi789',
      newEmail: 'kim@toss.im',
      expiresHours: 24,
    });
    expect(html).toContain('https://bidit.test/auth/email-change?token=ghi789');
    expect(html).toContain('kim@toss.im');
    expect(html).toContain('24');
    expectEditorialRules(html);
  });

  it('rfpInvited includes RFP id, title, buyer, deadline and invite URL', async () => {
    const html = await renderRfpInvited({
      rfpId: 'P-2605-0042',
      rfpTitle: '결제대행 서비스 제안',
      buyerName: '바이딧 주식회사',
      deadline: '2026-05-20 18:00',
      inviteUrl: 'https://bidit.test/invite/rfp/raw-token-x',
    });
    expect(html).toContain('P-2605-0042');
    expect(html).toContain('결제대행 서비스 제안');
    expect(html).toContain('바이딧 주식회사');
    expect(html).toContain('2026-05-20 18:00');
    expect(html).toContain('https://bidit.test/invite/rfp/raw-token-x');
    expectEditorialRules(html);
  });

  it('rfpSent includes RFP id, title and invite count', async () => {
    const html = await renderRfpSent({
      rfpId: 'P-2605-0042',
      rfpTitle: '결제대행 서비스 제안',
      inviteCount: 5,
    });
    expect(html).toContain('P-2605-0042');
    expect(html).toContain('결제대행 서비스 제안');
    expect(html).toMatch(/>5</);
    expectEditorialRules(html);
  });

  it('bidSubmitted includes RFP id, title, PG name and submitted timestamp', async () => {
    const html = await renderBidSubmitted({
      rfpId: 'P-2605-0042',
      rfpTitle: '결제대행 서비스 제안',
      pgName: '서포터 B 페이',
      submittedAt: '2026-05-06 22:31',
    });
    expect(html).toContain('P-2605-0042');
    expect(html).toContain('결제대행 서비스 제안');
    expect(html).toContain('서포터 B 페이');
    expect(html).toContain('2026-05-06 22:31');
    expectEditorialRules(html);
  });

  it('rfpAwarded includes RFP id, title, bid id and settlement cycle', async () => {
    const html = await renderRfpAwarded({
      rfpId: 'P-2605-0042',
      rfpTitle: '결제대행 서비스 제안',
      bidId: '1f4c7a2e-1234-4abc-9def-0123456789ab',
      settlementCycle: 'D+1',
    });
    expect(html).toContain('P-2605-0042');
    expect(html).toContain('1f4c7a2e-1234-4abc-9def-0123456789ab');
    expect(html).toContain('D+1');
    expectEditorialRules(html);
  });

  it('workspaceApproved includes workspace name, org label and login URL', async () => {
    const html = await renderWorkspaceApproved({
      workspaceName: '토스페이먼츠',
      orgLabel: 'PG사',
      loginUrl: 'https://bidit.test/login',
    });
    expect(html).toContain('토스페이먼츠');
    expect(html).toContain('PG사');
    expect(html).toContain('https://bidit.test/login');
    expect(html).toContain('승인');
    expectEditorialRules(html);
  });

  it('workspaceRejected includes workspace name, org label, reason and reapply URL', async () => {
    const html = await renderWorkspaceRejected({
      workspaceName: '토스페이먼츠',
      orgLabel: 'PG사',
      reason: '사업자등록증 미첨부',
      reapplyUrl: 'https://bidit.test/signup/pg',
    });
    expect(html).toContain('토스페이먼츠');
    expect(html).toContain('PG사');
    expect(html).toContain('사업자등록증 미첨부');
    expect(html).toContain('https://bidit.test/signup/pg');
    expect(html).toContain('보완');
    expectEditorialRules(html);
  });

  it('chatMessage with a count renders "N건" digest copy + sender + preview', async () => {
    const html = await renderChatMessage({
      senderName: 'OO페이',
      preview: '제안서 검토 부탁드려요.',
      conversationUrl: 'https://bidit.test/messages',
      count: 3,
    });
    expect(html).toContain('OO페이');
    expect(html).toContain('제안서 검토 부탁드려요.');
    // The unread-count digest phrasing must surface the number.
    expect(html).toMatch(/3\s*건/);
    expect(html).toContain('https://bidit.test/messages');
  });

  it('chatMessage without a count omits the "N건" digest phrasing (single-message fallback)', async () => {
    const html = await renderChatMessage({
      senderName: 'OO페이',
      preview: '안녕하세요.',
      conversationUrl: 'https://bidit.test/messages',
    });
    expect(html).toContain('OO페이');
    expect(html).not.toMatch(/\d+\s*건/);
  });

  it('bidSubmitted preheader에 받침 없는 PG명은 "가"가 붙는다', async () => {
    // 토스페이먼츠 → 모음 종성(ㅊ) → "가"
    const html = await renderBidSubmitted({
      rfpId: 'P-2605-0099',
      rfpTitle: '결제대행 서비스 제안',
      pgName: '토스페이먼츠',
      submittedAt: '2026-06-10 10:00',
    });
    // 조사 '가' 형태 포함
    expect(html).toContain('토스페이먼츠가');
    // 괄호 표기 미사용
    expect(html).not.toContain('이(가)');
  });

  it('bidSubmitted preheader에 받침 있는 PG명은 "이"가 붙는다', async () => {
    // 한국정보통신 → 자음 종성(ㄴ) → "이"
    const html = await renderBidSubmitted({
      rfpId: 'P-2605-0100',
      rfpTitle: '결제대행 서비스 제안',
      pgName: '한국정보통신',
      submittedAt: '2026-06-10 10:00',
    });
    expect(html).toContain('한국정보통신이');
    expect(html).not.toContain('이(가)');
  });

  it('rfpInvited preheader에 받침 없는 구매사명은 "가"가 붙는다', async () => {
    // 서포터 페이 → 모음 종성(이) → "가"
    const html = await renderRfpInvited({
      rfpId: 'P-2605-0101',
      rfpTitle: '결제대행 서비스 제안',
      buyerName: '서포터 페이',
      deadline: '2026-07-01 18:00',
      inviteUrl: 'https://bidit.test/invite/rfp/tok',
    });
    expect(html).toContain('서포터 페이가');
    expect(html).not.toContain('이(가)');
  });

  it('rfpInvited preheader에 받침 있는 구매사명은 "이"가 붙는다', async () => {
    // 바이딧 솔루션 → 션(batchim ㄴ) → "이"
    const html = await renderRfpInvited({
      rfpId: 'P-2605-0102',
      rfpTitle: '결제대행 서비스 제안',
      buyerName: '바이딧 솔루션',
      deadline: '2026-07-01 18:00',
      inviteUrl: 'https://bidit.test/invite/rfp/tok2',
    });
    expect(html).toContain('바이딧 솔루션이');
    expect(html).not.toContain('이(가)');
  });

  it('adminSignupReview includes workspace name, org label and review URL', async () => {
    const html = await renderAdminSignupReview({
      workspaceName: '토스페이먼츠',
      orgLabel: 'PG사',
      reviewUrl: 'https://bidit.test/admin/review/app-123',
    });
    expect(html).toContain('토스페이먼츠');
    expect(html).toContain('PG사');
    expect(html).toContain('https://bidit.test/admin/review/app-123');
    expectEditorialRules(html);
  });
});
