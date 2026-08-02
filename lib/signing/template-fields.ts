import type {
  SigningTemplateFieldInput,
  SigningTemplateFieldParty,
  SigningTemplateFieldType,
} from '@/lib/types/signing';

/**
 * 스노우싸인 signature_fields 항목의 camelCase 중간 표현 — snake_case 변환은
 * SnowSignClient.createTemplate이 소유한다(다른 클라이언트 메서드와 동일한 seam).
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
