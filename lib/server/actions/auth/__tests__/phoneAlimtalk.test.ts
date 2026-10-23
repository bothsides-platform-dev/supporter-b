import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setupActionEnv, teardownActionEnv } from './_setup';
import { phoneOtps } from '@/lib/db/schema';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { sendPhoneOtpAction } from '../sendPhoneOtpAction';
let db: PgliteDB;
beforeEach(async () => {
  db = await setupActionEnv();
  for (const [k, v] of Object.entries({
    SOLAPI_API_KEY: 'key',
    SOLAPI_SECRET_KEY: 'secret',
    SOLAPI_SENDER: '0212345678',
    SOLAPI_KAKAO_PF_ID: 'channel',
    SOLAPI_TEMPLATE_OTP: 'otp',
    PHONE_OTP_CHANNEL: 'alimtalk',
  }))
    vi.stubEnv(k, v);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  teardownActionEnv();
});
it('uses the approved OTP template when enabled', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          groupInfo: { count: { registeredSuccess: 1 } },
          messageList: [{ messageId: 'm', statusCode: '2000' }],
        }),
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  expect((await sendPhoneOtpAction({ phone: '01012345678' })).ok).toBe(true);
  const message = JSON.parse(fetcher.mock.calls[0][1].body).messages[0];
  expect(message.kakaoOptions).toMatchObject({
    templateId: 'otp',
    disableSms: false,
    variables: { '#{인증번호}': expect.stringMatching(/^\d{6}$/) },
  });
});
it('keeps a usable OTP and enters verification when provider acceptance times out', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')),
  );
  expect((await sendPhoneOtpAction({ phone: '01012345678' })).ok).toBe(true);
  expect(await db.select().from(phoneOtps)).toHaveLength(1);
});
it('keeps an unusable reservation on per-message rejection', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ failedMessageList: [{ statusCode: '3040' }] }),
        ),
      ),
  );
  expect(await sendPhoneOtpAction({ phone: '01012345678' })).toEqual({
    ok: false,
    error: 'SMS_FAILED',
  });
  // Same as SMS: the reservation consumes quota but can never verify.
  const rows = await db.select().from(phoneOtps);
  expect(rows).toHaveLength(1);
  expect(new Date(rows[0].expiresAt).getTime()).toBeLessThanOrEqual(Date.now());
});
