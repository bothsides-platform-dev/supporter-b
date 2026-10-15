import { getAlimtalkRepo } from '../repositories/factory';
import { sendAlimtalk, SolapiError } from '../sms/solapi';
import { computeBackoff } from '../outbox/backoff';
import { logger } from '@/lib/observability/logger';
import type { BusinessTemplate } from './types';

const TEMPLATE_ENV: Record<BusinessTemplate, string> = {
  rfpInvited: 'SOLAPI_TEMPLATE_RFP_INVITED',
  bidSubmitted: 'SOLAPI_TEMPLATE_BID_SUBMITTED',
  requoteRequested: 'SOLAPI_TEMPLATE_REQUOTE_REQUESTED',
  awarded: 'SOLAPI_TEMPLATE_AWARDED',
  awaitingContract: 'SOLAPI_TEMPLATE_AWAITING_CONTRACT',
  signingCompleted: 'SOLAPI_TEMPLATE_SIGNING_COMPLETED',
};

export async function flushAlimtalk() {
  if (process.env.BUSINESS_ALIMTALK_ENABLED !== 'true') return;
  const repo = await getAlimtalkRepo();
  // Small batches keep every claimed row within the five-minute crash window.
  const rows = await repo.claim();
  for (const row of rows) {
    if (
      process.env.BUSINESS_ALIMTALK_ENABLED !== 'true' ||
      !(await repo.canSend(row))
    ) {
      await repo.finish(row.id, {
        status: 'skipped',
        lastError: 'recipient_changed',
      });
      continue;
    }
    try {
      const result = await sendAlimtalk(
        row.phone,
        process.env[TEMPLATE_ENV[row.template]] ?? '',
        {
          '#{견적번호}': row.rfpCode,
          '#{링크}': row.linkUrl,
        },
      );
      await repo.finish(row.id, {
        status: 'accepted',
        messageId: result.messageId,
      });
    } catch (error) {
      const known = error instanceof SolapiError;
      const unknown = !known || error.outcome === 'unknown';
      const retry = known && error.retryable && row.attempts < 5;
      await repo.finish(row.id, {
        status: unknown ? 'unknown' : retry ? 'pending' : 'failed',
        lastError: known ? (error.errorCode ?? error.outcome) : 'unknown',
        ...(retry
          ? { scheduledAt: new Date(Date.now() + computeBackoff(row.attempts)) }
          : {}),
      });
      // No phone, OTP, body or provider response in operational logs.
      logger.warn('alimtalk.send_failed', { id: row.id, unknown, retry });
    }
  }
}
