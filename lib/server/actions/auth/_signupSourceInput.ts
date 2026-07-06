import { z } from 'zod';

// First-touch 가입 유입 경로(클라이언트 lib/attribution/first-touch.ts 가 캡처해 전달).
// 신뢰 경계: self-reported 데이터이므로 strict() 를 걸지 않아 미지 필드(gclid 등)는
// zod 기본 strip 으로 조용히 제거되고, 호출부가 migrateSignupSource 로 한 번 더 clamp 한다.
// signupCompleteAction/signupViaWorkspaceInviteAction/joinCanonicalPgWorkspaceAction
// 세 액션이 공유하는 단일 출처.
export const SignupSourceInput = z.object({
  _v: z.literal(1).optional(),
  utmSource: z.string().max(512).optional(),
  utmMedium: z.string().max(512).optional(),
  utmCampaign: z.string().max(512).optional(),
  utmTerm: z.string().max(512).optional(),
  utmContent: z.string().max(512).optional(),
  referrer: z.string().max(512).optional(),
  landingPath: z.string().max(512).optional(),
  capturedAt: z.string().max(512).optional(),
});
