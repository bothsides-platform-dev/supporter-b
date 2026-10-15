import { logger } from '@/lib/observability/logger';
import { createSolapiAuthorizationHeader } from './solapiAuth';

const SOLAPI_BASE = 'https://api.solapi.com';

export class SolapiError extends Error {
  readonly errorCode?: string;
  readonly status?: number;
  readonly outcome: 'rejected' | 'unknown';
  readonly retryable: boolean;

  constructor(
    message: string,
    errorCode?: string,
    status?: number,
    outcome: 'rejected' | 'unknown' = 'rejected',
  ) {
    super(message);
    this.name = 'SolapiError';
    this.errorCode = errorCode;
    this.status = status;
    this.outcome = outcome;
    this.retryable = outcome === 'rejected' && status === 429;
  }
}

function getCredentials(): {
  apiKey: string;
  apiSecret: string;
  sender: string;
} {
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
    signal: AbortSignal.timeout(10_000),
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
      ...init?.headers,
    },
  }).catch(() => {
    throw new SolapiError(
      'SOLAPI acceptance unknown',
      undefined,
      undefined,
      'unknown',
    );
  });

  const body = (await res.json().catch(() => ({}))) as {
    errorCode?: string;
    errorMessage?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new SolapiError(
      body?.errorMessage ??
        body?.message ??
        `SolAPI request failed (${res.status})`,
      body?.errorCode,
      res.status,
      res.status >= 500 || res.status === 408 ? 'unknown' : 'rejected',
    );
  }

  return body;
}

export async function sendSms(to: string, text: string): Promise<void> {
  const { sender } = getCredentials();
  const body = (await solapiFetch('/messages/v4/send-many/detail', {
    method: 'POST',
    body: JSON.stringify({
      messages: [{ to, from: sender, text }],
    }),
  })) as {
    groupInfo?: {
      count?: { registeredSuccess?: number; registeredFailed?: number };
    };
    failedMessageList?: { statusCode?: string }[];
  };
  if (
    body?.failedMessageList?.length ||
    (body?.groupInfo?.count?.registeredFailed ?? 0) > 0
  ) {
    throw new SolapiError(
      'SOLAPI message rejected',
      body?.failedMessageList?.[0]?.statusCode,
    );
  }
  if (body?.groupInfo?.count?.registeredSuccess !== 1) {
    throw new SolapiError(
      'SOLAPI acceptance unknown',
      undefined,
      undefined,
      'unknown',
    );
  }
}

/** Accepted by SOLAPI, not evidence of handset delivery. */
export async function sendAlimtalk(
  to: string,
  templateId: string,
  variables: Record<string, string>,
): Promise<{ messageId: string }> {
  const { sender } = getCredentials();
  const pfId = process.env.SOLAPI_KAKAO_PF_ID;
  if (!pfId || !templateId)
    throw new SolapiError('Alimtalk template/channel is not configured');
  const body = (await solapiFetch('/messages/v4/send-many/detail', {
    method: 'POST',
    body: JSON.stringify({
      showMessageList: true,
      messages: [
        {
          to,
          from: sender,
          type: 'ATA',
          kakaoOptions: { pfId, templateId, disableSms: false, variables },
        },
      ],
    }),
  })) as {
    failedMessageList?: { statusCode?: string }[];
    groupInfo?: {
      count?: { registeredFailed?: number; registeredSuccess?: number };
    };
    messageList?: { messageId?: string; statusCode?: string }[];
  };
  const message = body?.messageList?.[0];
  if (
    body?.failedMessageList?.length ||
    (body?.groupInfo?.count?.registeredFailed ?? 0) > 0 ||
    (message?.statusCode && message.statusCode !== '2000')
  ) {
    throw new SolapiError(
      'SOLAPI message rejected',
      body?.failedMessageList?.[0]?.statusCode ?? message?.statusCode,
    );
  }
  if (
    body?.groupInfo?.count?.registeredSuccess !== 1 ||
    body?.messageList?.length !== 1 ||
    message?.statusCode !== '2000' ||
    !message.messageId
  ) {
    throw new SolapiError(
      'SOLAPI acceptance unknown',
      undefined,
      undefined,
      'unknown',
    );
  }
  logger.info('solapi.alimtalk_accepted', {
    messageId: message.messageId,
    templateId,
  });
  return { messageId: message.messageId };
}
