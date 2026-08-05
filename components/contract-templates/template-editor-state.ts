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
      id: input.id ?? crypto.randomUUID(),
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
    const clamped = clampToPage({ x: pos.x, y: pos.y, width: f.width, height: f.height }, page);
    return { ...f, x: clamped.x, y: clamped.y };
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
