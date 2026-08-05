import type {
  SigningTemplateFieldInput,
  SigningTemplateFieldParty,
  SigningTemplateFieldType,
} from '@/lib/types/signing';

export type PageSize = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

/** API 예시 기준 기본 크기. */
const DEFAULT_SIZE: Record<SigningTemplateFieldType, { width: number; height: number }> = {
  signature: { width: 120, height: 50 },
  name: { width: 140, height: 24 },
  text: { width: 140, height: 24 },
  date: { width: 120, height: 24 },
};

const MIN_WIDTH = 20;
const MIN_HEIGHT = 16;

// crypto.randomUUID 는 secure context 전용 — http QA 호스트(lvh.me)에서 throw 해
// 필드 추가 버튼이 조용히 죽는다. 클라이언트 임시 id 라 암호학적 강도가 필요 없으므로
// 폴백을 둔다.
export function newFieldId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function clampToPage(rect: Rect, page: PageSize): Rect {
  const width = Math.min(rect.width, page.width);
  const height = Math.min(rect.height, page.height);
  return {
    width,
    height,
    x: Math.max(0, Math.min(rect.x, page.width - width)),
    y: Math.max(0, Math.min(rect.y, page.height - height)),
  };
}

export function addField(
  fields: SigningTemplateFieldInput[],
  input: {
    type: SigningTemplateFieldType;
    party: SigningTemplateFieldParty;
    pageNumber: number;
    /** 호출자가 미리 만든 id — 에디터가 "마지막 원소 = 새 필드" 정렬 계약 없이
     * 함수형 setState 로 선택을 걸 수 있게 한다. */
    id?: string;
  },
  page: PageSize,
): SigningTemplateFieldInput[] {
  const { width, height } = DEFAULT_SIZE[input.type];
  const centered = clampToPage(
    { x: (page.width - width) / 2, y: (page.height - height) / 2, width, height },
    page,
  );
  return [
    ...fields,
    {
      id: input.id ?? newFieldId(),
      type: input.type,
      party: input.party,
      pageNumber: input.pageNumber,
      ...centered,
    },
  ];
}

export function moveField(
  fields: SigningTemplateFieldInput[],
  id: string,
  pos: { x: number; y: number },
  page: PageSize,
): SigningTemplateFieldInput[] {
  return fields.map((f) => {
    if (f.id !== id) return f;
    // width/height 도 함께 반영한다 — resizeField 는 MIN 만 강제하고 페이지 상한을
    // 두지 않으므로, 리사이즈 직후 호출되는 이 경로에서 필드가 페이지보다 커져 있을
    // 수 있다. x/y 만 클램프하면 크기는 페이지 밖으로 남는다.
    const clamped = clampToPage({ x: pos.x, y: pos.y, width: f.width, height: f.height }, page);
    return { ...f, x: clamped.x, y: clamped.y, width: clamped.width, height: clamped.height };
  });
}

export function resizeField(
  fields: SigningTemplateFieldInput[],
  id: string,
  size: { width: number; height: number },
): SigningTemplateFieldInput[] {
  return fields.map((f) =>
    f.id === id
      ? { ...f, width: Math.max(MIN_WIDTH, size.width), height: Math.max(MIN_HEIGHT, size.height) }
      : f,
  );
}

export function removeField(fields: SigningTemplateFieldInput[], id: string): SigningTemplateFieldInput[] {
  return fields.filter((f) => f.id !== id);
}
