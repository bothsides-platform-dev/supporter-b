import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendSms, SolapiError } from '../solapi';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  process.env.SOLAPI_API_KEY = 'NCSAYU7YDBXYORXC';
  process.env.SOLAPI_SECRET_KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD';
  process.env.SOLAPI_SENDER = '01012345678';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('sendSms', () => {
  it('POST /messages/v4/send-many/detail with HMAC Authorization header', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ groupInfo: { count: { registeredSuccess: 1 } } }),
    });

    await sendSms('01098765432', '서포트비 인증번호: 123456');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.solapi.com/messages/v4/send-many/detail');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
    });
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(auth).toMatch(/^HMAC-SHA256 apiKey=NCSAYU7YDBXYORXC, date=/);
    expect(auth).toMatch(/, salt=[0-9a-f]{64}, signature=[0-9a-f]{64}$/);
    expect(JSON.parse(String(init.body))).toEqual({
      messages: [{ to: '01098765432', from: '01012345678', text: '서포트비 인증번호: 123456' }],
    });
  });

  it('throws SolapiError when SolAPI rejects the request', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        errorCode: 'SignatureDoesNotMatch',
        errorMessage: '생성한 signature를 확인하세요.',
      }),
    });

    await expect(sendSms('01098765432', 'hello')).rejects.toMatchObject({
      name: 'SolapiError',
      errorCode: 'SignatureDoesNotMatch',
      message: '생성한 signature를 확인하세요.',
    } satisfies Partial<SolapiError>);
  });
});
