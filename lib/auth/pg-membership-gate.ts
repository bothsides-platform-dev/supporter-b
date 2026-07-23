/**
 * PG 멤버십 승인 데이터 경계 — 단일 판정 함수.
 *
 * joinCanonicalPgWorkspace 는 approval_status='pending_approval' 멤버를 만들고,
 * 그 JWT 는 그 외에는 완전히 유효하다(workspaceType 'pg', role 'admin'). 셸 가드는
 * 페이지 로드만 막으므로 서버 액션/API 라우트 경계는 여기서 강제한다. 승인 상태는
 * JWT 에 없어 DB 라이브 리드(요청당 React cache 메모)로 판정하며, fail-closed:
 * 'approved' 가 아니면(행 부재 포함) 차단.
 *
 * 호출부 둘 — requirePgSession(lib/auth/session.ts, PG 전용 표면)과
 * requireActiveWorkspace(lib/server/actions/_session.ts, 채팅·보드·계약
 * 라이프사이클 같은 양측 공용 표면의 pg 분기). 별도 모듈인 이유: 액션 테스트
 * 다수가 '@/lib/auth/session' 모듈 전체를 mock 하므로, 게이트를 그 모듈 export 로
 * 두면 mock factory 마다 스텁을 추가해야 한다.
 *
 * 마스터/오퍼레이터 예외: 마스터는 멤버십 row 없이 synthetic admin 으로 워크스페이스에
 * 진입하므로(switchWorkspaceAction 의 bypass) 라이브 리드가 null 을 반환해 잠긴다 —
 * 서버 전용 MASTER_ACCOUNT_EMAILS 재확인(서명된 세션 이메일, switchWorkspaceAction 과
 * 동일 패턴)으로 면제하고 불필요한 DB 리드도 생략한다.
 *
 * PG 전용인 이유: non-approved 상태를 쓰는 경로가 canonical-PG 합류뿐이다(buyer 쓰기
 * 경로 없음).
 */
import type { Session } from 'next-auth';

import { isMasterEmail } from '@/lib/auth/master-allowlist';
import { getDbMemberApprovalStatus } from '@/lib/auth/session-version-db';

/** True 면 호출자를 차단해야 한다 (미승인 PG 멤버). */
export async function isPgMembershipBlocked(session: Session): Promise<boolean> {
  const user = session.user;
  if (!user?.id || user.workspaceType !== 'pg' || !user.workspaceId) return false;
  if (isMasterEmail(user.email)) return false;
  const approval = await getDbMemberApprovalStatus(user.id, user.workspaceId);
  return approval !== 'approved';
}
