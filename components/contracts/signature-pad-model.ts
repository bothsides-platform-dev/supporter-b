// 서명 캔버스의 스트로크 상태를 다루는 순수 모델 — DOM 을 일절 만지지 않는다.
// SignaturePad 는 이 모델로 스트로크를 관리하고 캔버스에 재렌더한다. 순수 함수라
// jsdom(canvas 미구현) 환경에서도 로직을 단위 테스트할 수 있다.

export type StrokePoint = { x: number; y: number };

export type SignatureModel = {
  // 완료된(commit 된) 스트로크들. 각 스트로크는 좌표 시퀀스.
  strokes: StrokePoint[][];
  // 현재 그리는 중인 스트로크(pointerdown~up 사이). 없으면 null.
  active: StrokePoint[] | null;
};

// 유효한 서명으로 인정하는 최소 점 개수 — 1점(탭)은 흔들림/오터치로 보고 무시한다.
const MIN_STROKE_POINTS = 2;

export const emptyModel: SignatureModel = { strokes: [], active: null };

// pointerdown — 첫 점으로 새 active 스트로크를 연다.
export function beginStroke(m: SignatureModel, p: StrokePoint): SignatureModel {
  return { strokes: m.strokes, active: [p] };
}

// pointermove — active 스트로크에 점을 잇는다. active 가 없으면 그대로 둔다(no-op).
export function extendStroke(m: SignatureModel, p: StrokePoint): SignatureModel {
  if (m.active === null) return m;
  return { strokes: m.strokes, active: [...m.active, p] };
}

// pointerup — active 스트로크를 확정하고 active 를 비운다. active 가 없으면 no-op.
export function endStroke(m: SignatureModel): SignatureModel {
  if (m.active === null) return m;
  return { strokes: [...m.strokes, m.active], active: null };
}

// '다시 그리기' — 비어 있는 새 모델을 돌려준다.
export function clearModel(): SignatureModel {
  return { strokes: [], active: null };
}

// 유효 스트로크(2점 이상)가 하나도 없으면 true. active 중인 스트로크도 함께 본다.
export function isEmptyModel(m: SignatureModel): boolean {
  const all = m.active ? [...m.strokes, m.active] : m.strokes;
  return !all.some((stroke) => stroke.length >= MIN_STROKE_POINTS);
}
