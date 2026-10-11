import { escapeSlackText, sendSlackMessage } from '@/lib/integrations/slack';
import { getGuestRfpRepo } from '@/lib/server/repositories/factory';
import type { DrizzleGuestRfpRepository } from '@/lib/server/repositories/drizzle/guest-rfp';
import type { GuestEvent } from '@/lib/server/guest-rfp/request';
import { logger } from '@/lib/observability/logger';
export class GuestRfpService {
  constructor(
    private readonly repo: Pick<DrizzleGuestRfpRepository, 'claim' | 'finish'>,
    private readonly send = sendSlackMessage,
  ) {}
  async record(event: GuestEvent) {
    if (!(await this.repo.claim(event.draftId, event.event))) return;
    const text = [
      `[로그인 전 견적] ${event.event === 'started' ? '작성 시작' : '작성 완료'}`,
      `초안: ${event.draftId}`,
      `홈페이지: ${escapeSlackText(event.website)}`,
      ...(event.industry ? [`업종: ${escapeSlackText(event.industry)}`] : []),
      ...(event.title ? [`제목: ${escapeSlackText(event.title)}`] : []),
      ...(event.contractType
        ? [`계약 유형: ${event.contractType === 'new' ? '신규' : '갱신'}`]
        : []),
      `첨부: ${event.attachmentCount}개`,
    ].join('\n');
    try {
      const result = await this.send({ text });
      await this.repo.finish(
        event.draftId,
        event.event,
        result.ok ? 'sent' : 'failed',
      );
      if (!result.ok)
        logger.warn('guest_rfp.slack_failed', {
          draftId: event.draftId,
          event: event.event,
        });
    } catch {
      await this.repo.finish(event.draftId, event.event, 'failed');
      logger.warn('guest_rfp.slack_failed', {
        draftId: event.draftId,
        event: event.event,
      });
    }
  }
}
export async function recordGuestEvent(event: GuestEvent) {
  const repo = await getGuestRfpRepo();
  if (!process.env.SLACK_WEBHOOK_URL) {
    if (await repo.claim(event.draftId, event.event))
      await repo.finish(event.draftId, event.event, 'skipped');
    return;
  }
  await new GuestRfpService(repo).record(event);
}
