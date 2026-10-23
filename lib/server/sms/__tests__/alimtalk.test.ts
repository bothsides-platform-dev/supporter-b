import { logger } from '@/lib/observability/logger';
import { afterEach, expect, it, vi } from 'vitest';
import * as solapi from '../solapi';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('sends approved template variables with provider SMS fallback and returns the accepted message id', async () => {
  vi.stubEnv('SOLAPI_API_KEY', 'key');
  vi.stubEnv('SOLAPI_SECRET_KEY', 'secret');
  vi.stubEnv('SOLAPI_SENDER', '0212345678');
  vi.stubEnv('SOLAPI_KAKAO_PF_ID', 'channel');
  const acceptedLog = vi.spyOn(logger, 'info').mockImplementation(() => {});
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          groupInfo: { count: { registeredSuccess: 1, registeredFailed: 0 } },
          failedMessageList: [],
          messageList: [{ messageId: 'message-1', statusCode: '2000' }],
        }),
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  expect(typeof solapi.sendAlimtalk).toBe('function');
  expect(
    await solapi.sendAlimtalk('01012345678', 'approved-otp', {
      '#{인증번호}': '123456',
    }),
  ).toEqual({ messageId: 'message-1' });
  expect(acceptedLog).toHaveBeenCalledWith('solapi.alimtalk_accepted', {
    messageId: 'message-1',
    templateId: 'approved-otp',
  });
  acceptedLog.mockRestore();
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    showMessageList: true,
    messages: [
      {
        to: '01012345678',
        from: '0212345678',
        type: 'ATA',
        kakaoOptions: {
          pfId: 'channel',
          templateId: 'approved-otp',
          disableSms: false,
          variables: { '#{인증번호}': '123456' },
        },
      },
    ],
  });
});

it.each([
  [
    {
      groupInfo: { count: { registeredSuccess: 0, registeredFailed: 1 } },
      failedMessageList: [{ statusCode: '3040' }],
      messageList: [],
    },
    'rejected',
  ],
  [{}, 'unknown'],
  [
    {
      groupInfo: { count: { registeredSuccess: 1 } },
      messageList: [{ messageId: 'm', statusCode: '3040' }],
    },
    'rejected',
  ],
])(
  'classifies per-message rejection and malformed acceptance without retrying',
  async (body, outcome) => {
    vi.stubEnv('SOLAPI_API_KEY', 'key');
    vi.stubEnv('SOLAPI_SECRET_KEY', 'secret');
    vi.stubEnv('SOLAPI_SENDER', '0212345678');
    vi.stubEnv('SOLAPI_KAKAO_PF_ID', 'channel');
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body)));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      solapi.sendAlimtalk('01012345678', 'template', {}),
    ).rejects.toMatchObject({ outcome });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it.each([
  [429, 'rejected', true],
  [403, 'rejected', false],
  [503, 'unknown', false],
])('classifies HTTP %s conservatively', async (status, outcome, retryable) => {
  vi.stubEnv('SOLAPI_API_KEY', 'key');
  vi.stubEnv('SOLAPI_SECRET_KEY', 'secret');
  vi.stubEnv('SOLAPI_SENDER', '0212345678');
  vi.stubEnv('SOLAPI_KAKAO_PF_ID', 'channel');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status })),
  );
  await expect(
    solapi.sendAlimtalk('01012345678', 'template', {}),
  ).rejects.toMatchObject({ outcome, retryable });
});
it('preserves unknown outcome on timeout with a bounded request and no second send', async () => {
  vi.stubEnv('SOLAPI_API_KEY', 'key');
  vi.stubEnv('SOLAPI_SECRET_KEY', 'secret');
  vi.stubEnv('SOLAPI_SENDER', '0212345678');
  vi.stubEnv('SOLAPI_KAKAO_PF_ID', 'channel');
  const fetcher = vi
    .fn()
    .mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
  vi.stubGlobal('fetch', fetcher);
  await expect(
    solapi.sendAlimtalk('01012345678', 'template', {}),
  ).rejects.toMatchObject({ outcome: 'unknown', retryable: false });
  expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
