import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifySnowSignWebhook } from '../webhook';

const SECRET = 'whsec_test_123';
function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('verifySnowSignWebhook', () => {
  const body = JSON.stringify({ event: 'contract.completed', data: { contract_id: 'ct_1' } });

  it('accepts a signature computed with the shared secret over the raw body', () => {
    expect(verifySnowSignWebhook(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects when the body was tampered after signing', () => {
    const sig = sign(body);
    const tampered = body.replace('ct_1', 'ct_evil');
    expect(verifySnowSignWebhook(tampered, sig, SECRET)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    expect(verifySnowSignWebhook(body, sign(body, 'other-secret'), SECRET)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifySnowSignWebhook(body, null, SECRET)).toBe(false);
    expect(verifySnowSignWebhook(body, '', SECRET)).toBe(false);
  });

  it('rejects when the secret is empty (cannot verify)', () => {
    expect(verifySnowSignWebhook(body, sign(body), '')).toBe(false);
  });

  it('rejects a garbage signature of a different length without throwing', () => {
    expect(verifySnowSignWebhook(body, 'abc', SECRET)).toBe(false);
  });

  it('verifies the raw body byte-for-byte (multibyte UTF-8 preserved)', () => {
    const krBody = JSON.stringify({ event: 'contract.completed', data: { title: '전자계약 완료' } });
    expect(verifySnowSignWebhook(krBody, sign(krBody), SECRET)).toBe(true);
  });
});
