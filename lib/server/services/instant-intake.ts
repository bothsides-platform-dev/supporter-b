import { hasInstantCases } from '@/lib/server/repositories/drizzle/instant-inbox';
import {
  instantDb,
  intakeOpen,
} from '@/lib/server/repositories/drizzle/instant-quotes';
import type { Actor } from './types';

/** 관리자가 PG 접수를 열고 닫는 것이 유일한 출시 스위치다. 요청마다 읽고 캐시하지 않는다. */
export async function instantIntakeOpen() {
  return intakeOpen(await instantDb());
}

/** 구매사는 접수가 열렸을 때, PG는 자사 접수가 열렸을 때 본다. 닫은 뒤에도 기존 신청의 당사자에게는 남는다. */
export async function showInstantEntry(actor: Actor, side: 'buyer' | 'pg') {
  const db = await instantDb(),
    pg = side === 'pg';
  return (
    (await intakeOpen(db, pg ? actor.workspaceId : undefined)) ||
    (await hasInstantCases(db, actor, pg))
  );
}
