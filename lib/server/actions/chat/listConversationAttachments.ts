'use server';

import {
  getAttachmentRepo,
  getChatConversationRepo,
} from '@/lib/server/repositories/factory';
import type { Attachment } from '@/lib/types/common';
import { requireActiveWorkspace } from './_shared';

/**
 * 대화의 모든 첨부파일을 uploadedAt 오름차순으로 반환.
 * 요청자 워크스페이스가 대화에 속하지 않으면 [] 반환.
 */
export async function listConversationAttachments(conversationId: string): Promise<Attachment[]> {
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return [];

  const convRepo = await getChatConversationRepo();
  const conv = await convRepo.findById(conversationId);
  if (!conv) return [];

  const myWsId = ws.workspaceType === 'buyer' ? conv.buyerWsId : conv.pgWsId;
  if (myWsId !== ws.workspaceId) return [];

  const attRepo = await getAttachmentRepo();
  return attRepo.findByConversationId(conversationId);
}
