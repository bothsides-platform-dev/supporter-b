import { createSolapiAuthorizationHeader } from './solapiAuth';

const SOLAPI_BASE = 'https://api.solapi.com';

export class SolapiError extends Error {
  readonly errorCode?: string;
  readonly status?: number;

  constructor(message: string, errorCode?: string, status?: number) {
    super(message);
    this.name = 'SolapiError';
    this.errorCode = errorCode;
    this.status = status;
  }
}

function getCredentials(): { apiKey: string; apiSecret: string; sender: string } {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_SECRET_KEY;
  const sender = process.env.SOLAPI_SENDER;
  if (!apiKey || !apiSecret || !sender) {
    throw new SolapiError('SOLAPI credentials are not configured');
  }
  return { apiKey, apiSecret, sender };
}

async function solapiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const { apiKey, apiSecret } = getCredentials();
  const authorization = createSolapiAuthorizationHeader(apiKey, apiSecret);

  const res = await fetch(`${SOLAPI_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
      ...init?.headers,
    },
  });

  const body = (await res.json().catch(() => ({}))) as {
    errorCode?: string;
    errorMessage?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new SolapiError(
      body.errorMessage ?? body.message ?? `SolAPI request failed (${res.status})`,
      body.errorCode,
      res.status,
    );
  }

  return body;
}

export async function sendSms(to: string, text: string): Promise<void> {
  const { sender } = getCredentials();
  await solapiFetch('/messages/v4/send-many/detail', {
    method: 'POST',
    body: JSON.stringify({
      messages: [{ to, from: sender, text }],
    }),
  });
}
