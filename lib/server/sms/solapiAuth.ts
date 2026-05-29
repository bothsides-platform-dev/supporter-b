import { createHmac, randomBytes } from 'node:crypto';

export function createSolapiAuthorizationHeader(
  apiKey: string,
  apiSecret: string,
  overrides?: { date?: string; salt?: string },
): string {
  const date = overrides?.date ?? new Date().toISOString();
  const salt = overrides?.salt ?? randomBytes(32).toString('hex');
  const signature = createHmac('sha256', apiSecret).update(date + salt).digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}
