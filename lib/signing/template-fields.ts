import type {
  SigningTemplateFieldInput,
  SigningTemplateFieldParty,
  SigningTemplateFieldType,
} from '@/lib/types/signing';

/**
 * 스노우싸인 signature_fields 항목의 camelCase 중간 표현.
 *
 * snake_case 변환 소유자는 **두 곳이고 `role` 이 서로 다른 와이어 키로 나간다**:
 * `createTemplate` → `role`, `createContract` → **`participant`**. 공급자 API 의
 * 비대칭이고 실측으로 확인했다(`docs/SNOWSIGN_SANDBOX.md` C1). 즉 이 타입의 `role` 은
 * 템플릿 경로 어휘이며 계약 경로에서는 같은 값이 다른 키에 실린다.
 */
export type SnowSignSignatureFieldInput = {
  role: string;
  type: SigningTemplateFieldType;
  pageNumber: number;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
};

const PARTY_ROLE_LABEL: Record<SigningTemplateFieldParty, string> = {
  buyer: '구매사',
  pg: 'PG사',
};

/**
 * 템플릿 생성/재생성의 signers 로스터 — 필드 role 라벨과 **같은 출처**에서
 * 파생한다. 별도 리터럴로 두면 한쪽만 바뀌었을 때 그 뒤 만들어진 모든 템플릿이
 * 수정 진입에서 영구히 TEMPLATE_UNSUPPORTED 로 거부된다(signers 는 옛 라벨,
 * 필드는 새 라벨). 순서도 계약이다(구매사 먼저 — 서명 순서).
 */
export const SIGNING_ROLE_LABELS: readonly [string, string] = [
  PARTY_ROLE_LABEL.buyer,
  PARTY_ROLE_LABEL.pg,
];

// 읽기(role_name) → party 역매핑 — 정매핑에서 파생해 라벨 변경 시 두 방향이 함께
// 움직인다. 미지 라벨은 undefined(호출자가 fail-closed 판정 — 조용히 버리면 저장 시
// 그 필드가 소실된다).
const ROLE_LABEL_PARTY = new Map<string, SigningTemplateFieldParty>(
  (Object.entries(PARTY_ROLE_LABEL) as [SigningTemplateFieldParty, string][]).map(
    ([party, label]) => [label, party],
  ),
);

export function partyFromRoleLabel(roleName: string): SigningTemplateFieldParty | undefined {
  return ROLE_LABEL_PARTY.get(roleName);
}

export function buildSignatureFieldsPayload(
  fields: SigningTemplateFieldInput[],
): SnowSignSignatureFieldInput[] {
  return fields.map((f) => ({
    role: PARTY_ROLE_LABEL[f.party],
    type: f.type,
    pageNumber: f.pageNumber,
    positionX: f.x,
    positionY: f.y,
    width: f.width,
    height: f.height,
  }));
}

export type TemplateFieldsValidation = { ok: true } | { ok: false; error: string };

/** 서명 가능한 필드 타입 — signature/name은 API가 항상 is_required=true로 강제한다. */
const SIGNABLE_TYPES = new Set<SigningTemplateFieldType>(['signature', 'name']);

/** 저장 전 검증 — 구매사·PG사 각각 서명 가능한 필드가 최소 1개 있어야 한다. */
export function validateTemplateFields(
  fields: SigningTemplateFieldInput[],
): TemplateFieldsValidation {
  const hasBuyerSignable = fields.some((f) => f.party === 'buyer' && SIGNABLE_TYPES.has(f.type));
  const hasPgSignable = fields.some((f) => f.party === 'pg' && SIGNABLE_TYPES.has(f.type));
  if (!hasBuyerSignable || !hasPgSignable) {
    return { ok: false, error: 'MISSING_SIGNABLE_FIELD' };
  }
  return { ok: true };
}
