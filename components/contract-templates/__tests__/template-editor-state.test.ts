import { describe, expect, it, vi } from 'vitest';
import { addField, clampToPage, moveField, removeField, resizeField } from '../template-editor-state';
import type { SigningTemplateFieldInput } from '@/lib/types/signing';

const PAGE = { width: 600, height: 800 };

function field(overrides: Partial<SigningTemplateFieldInput> = {}): SigningTemplateFieldInput {
  return { id: 'f1', type: 'signature', party: 'buyer', pageNumber: 1, x: 10, y: 10, width: 120, height: 50, ...overrides };
}

describe('addField', () => {
  it('appends a new field with the default size for its type, centered-ish on the page', () => {
    const fields = addField([], { type: 'signature', party: 'buyer', pageNumber: 1 }, PAGE);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ type: 'signature', party: 'buyer', pageNumber: 1, width: 120, height: 50 });
  });

  it('uses the name/text/date default size (140x24)', () => {
    const fields = addField([], { type: 'text', party: 'pg', pageNumber: 2 }, PAGE);
    expect(fields[0]).toMatchObject({ width: 140, height: 24 });
  });

  // 호출자가 id 를 미리 만들어 넘길 수 있다 — 에디터가 "마지막 원소가 새 필드"라는
  // 정렬 계약에 기대지 않고 함수형 setState 로 선택을 걸 수 있게 한다.
  it('uses a caller-provided id when given', () => {
    const fields = addField([], { id: 'given-id', type: 'signature', party: 'buyer', pageNumber: 1 }, PAGE);
    expect(fields[0]!.id).toBe('given-id');
  });

  // crypto.randomUUID 는 secure context 전용이라 http QA 호스트(lvh.me)에서 throw —
  // 필드 추가 버튼이 조용히 죽지 않도록 폴백 id 를 쓴다.
  it('falls back to a non-crypto id when crypto.randomUUID is unavailable', () => {
    const spy = vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('insecure context');
    });
    try {
      const fields = addField([], { type: 'signature', party: 'buyer', pageNumber: 1 }, PAGE);
      expect(fields[0]!.id).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('moveField', () => {
  it('updates x/y and clamps within the page bounds', () => {
    const fields = [field({ x: 10, y: 10 })];
    const moved = moveField(fields, 'f1', { x: -5, y: 1000 }, PAGE);
    expect(moved[0].x).toBe(0); // clamped to 0
    expect(moved[0].y).toBe(PAGE.height - moved[0].height); // clamped to bottom
  });

  it('is a no-op for an unknown field id', () => {
    const fields = [field()];
    expect(moveField(fields, 'missing', { x: 1, y: 1 }, PAGE)).toEqual(fields);
  });
});

describe('resizeField', () => {
  it('updates width/height with a minimum of 20x16', () => {
    const fields = [field({ width: 120, height: 50 })];
    const resized = resizeField(fields, 'f1', { width: 5, height: 2 });
    expect(resized[0]).toMatchObject({ width: 20, height: 16 });
  });
});

describe('removeField', () => {
  it('removes the field with the given id', () => {
    const fields = [field({ id: 'f1' }), field({ id: 'f2' })];
    expect(removeField(fields, 'f1').map((f) => f.id)).toEqual(['f2']);
  });
});

describe('clampToPage', () => {
  it('clamps a rect to stay within the page', () => {
    expect(clampToPage({ x: -10, y: -10, width: 50, height: 50 }, PAGE)).toEqual({ x: 0, y: 0, width: 50, height: 50 });
    expect(clampToPage({ x: 590, y: 790, width: 50, height: 50 }, PAGE)).toEqual({
      x: PAGE.width - 50,
      y: PAGE.height - 50,
      width: 50,
      height: 50,
    });
  });
});
