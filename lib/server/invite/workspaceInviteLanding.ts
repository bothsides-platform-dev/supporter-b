import { getUserRepo } from '@/lib/server/repositories/factory';
import { normalizeEmail } from '@/lib/server/actions/auth/_shared';

/**
 * 초대 이메일에 이미 계정이 존재하는지 여부 (인증 여부 무관).
 *
 * 비인증 초대 landing 에서 "로그인하여 수락" vs "가입하여 수락"을 가르는 근거(#9).
 * checkEmailAvailableAction 과 달리 **미인증 계정도 true** — 미인증 기존계정이
 * 가입 동선을 끝까지 가다 EMAIL_TAKEN 막다른 길에 빠지는 것을 landing 에서 차단.
 *
 * 데이터 접근은 UserRepo.existsByEmail 에 위임. 입력 이메일을 normalizeEmail 로
 * 정규화한 뒤 exact-match 하는 기존 동작을 그대로 유지한다(저장 이메일은 정규화됨).
 * `db` 파라미터는 호출부 시그니처 호환을 위해 유지하나 더 이상 쿼리에 쓰지 않는다.
 */
export async function accountExistsForEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _db: any,
  email: string,
): Promise<boolean> {
  return (await getUserRepo()).existsByEmail(normalizeEmail(email));
}
