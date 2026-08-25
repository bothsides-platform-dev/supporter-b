import type { PgSigningTemplate } from '@/lib/types/signing';

/**
 * 계약서 서식 행 → **딜룸/위저드로 내보내는 좁은 부분집합**.
 *
 * `toQuoteTemplateOption` 과 같은 이유로 둔다. 여기서는 이유가 하나 더 있다:
 * 조항형 서식은 `document`(문서 전체)를 들고 다니는데, 그건 **위저드 픽커가 전혀
 * 쓰지 않는다**(이름만 렌더한다). 그대로 넘기면 PG 가 서식을 여러 개 가진 만큼
 * 모든 딜룸 RSC 페이로드가 문서째로 불어난다.
 *
 * `createdBy`·`workspaceId` 같은 서버 전용 값이 페이로드에 섞이지 않는 것도 같은 효과다.
 * 키 집합은 `__tests__/signing-template-option.test.ts` 가 고정한다.
 */
export type SigningTemplateOption = {
  id: string;
  name: string;
  /** 딜룸이 발송 경로(조항형 vs PDF)를 가르는 데 쓴다. */
  kind: PgSigningTemplate['kind'];
};

export function toSigningTemplateOption(t: PgSigningTemplate): SigningTemplateOption {
  return { id: t.id, name: t.name, kind: t.kind };
}
