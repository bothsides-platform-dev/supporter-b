import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSolapiAuthorizationHeader } from '../solapiAuth';

describe('createSolapiAuthorizationHeader', () => {
  it('builds HMAC-SHA256 Authorization header from date + salt', () => {
    const date = '2019-07-01T00:41:48.000Z';
    const salt = 'a'.repeat(64);
    const apiKey = 'NCSAYU7YDBXYORXC';
    const apiSecret = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD';
    const signature = createHmac('sha256', apiSecret).update(date + salt).digest('hex');

    expect(createSolapiAuthorizationHeader(apiKey, apiSecret, { date, salt })).toBe(
      `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
    );
  });
});
