'use server';

// 설정 > 프로필 — 본인 휴대폰 번호를 인증하고 저장한다.
//
// 왜 필요한가: 서명 본인인증 기본강제는 양측 담당자에게 010 휴대폰을 요구하는데
// (`lib/signing/security-method.ts`), 가입 외에는 번호를 넣을 경로가 없었다.
// 번호 없는 계정이 발송에서 막히면 자력 복구가 불가능해 재가입밖에 없었다.
import { z } from 'zod';

import { requireSession } from '@/lib/auth/session';
import { normalizePhone } from '@/lib/server/actions/auth/phoneOtpUtils';
import { getAuthService } from '@/lib/server/services/auth';
import { resolveSecurityMethod } from '@/lib/signing/security-method';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({ phone: z.string().min(1).max(20), phoneVerificationId: z.uuid() })
  .strict();

export async function updateMyPhoneAction(input: {
  phone: string;
  phoneVerificationId: string;
}): Promise<ActionResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  let session;
  try {
    session = await requireSession({ allowInactiveWorkspace: true });
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }

  const normalized = normalizePhone(parsed.data.phone);
  if (!normalized) return { ok: false, error: 'INVALID_PHONE' };

  // 저장 게이트는 **발송 경로와 같은 술어**다. 간편인증이 못 쓰는 번호(구 번호대)를
  // 저장하면 발송에서 PHONE_NOT_MOBILE_010 으로 막혀 이 화면이 없애려는 데드엔드가
  // 그대로 재현된다 — 입력에서 끊고 무엇이 문제인지 알려준다.
  if (!resolveSecurityMethod(normalized).enforced) {
    return { ok: false, error: 'PHONE_NOT_MOBILE_010' };
  }

  // 소유 증명 소비와 번호 저장은 서비스의 같은 트랜잭션에서 이뤄진다. 읽고 나서
  // 저장하는 두 단계면 같은 receipt의 동시 재사용을 막을 수 없다.
  return (await getAuthService()).updatePhone({
    userId: session.user.id,
    phone: normalized,
    phoneVerificationId: parsed.data.phoneVerificationId,
  });
}
