// 채팅 전송 morph — 입력창 텍스트가 말풍선으로 변신하며 안착하는 FLIP 클론의 순수 로직.
// DOM 측정·portal 렌더·상태 보유는 useMessageMorph / MorphFlightLayer 가 담당하고,
// 여기서는 좌표 계산과 발동 판정만 한다(테스트 가능 단위).

export type Rect = { left: number; top: number; width: number; height: number };

// 진행 중인 morph 한 건. 클론은 `to`(말풍선 최종 위치, top-left 앵커)에 두고,
// dx/dy/scale 로 시각적 시작점(`from`=입력창)에 놓은 뒤 identity 로 애니메이트한다.
// `clip` 은 클론을 가둘 채팅 패널 경계(`[data-morph-bounds]`) — 측정 실패 시 null(무클리핑).
export type Flight = {
  key: string;
  text: string;
  to: Rect;
  dx: number;
  dy: number;
  scale: number;
  clip: Rect | null;
};

// `to` 위치에 렌더된 클론을 시각적으로 `from` 에 놓는 초기 transform.
// (top-left 앵커 + transform-origin top-left 기준)
export function computeMorphTransform(
  from: Rect,
  to: Rect,
): { dx: number; dy: number; scale: number } {
  return {
    dx: from.left - to.left,
    dy: from.top - to.top,
    scale: to.width ? from.width / to.width : 1,
  };
}

// 클론 레이어(viewport 를 덮는 fixed 박스)를 채팅 패널 경계로 잘라내는 clip-path 값.
// 딜룸 모달처럼 채팅이 더 큰 표면 안에 임베드된 경우, 최상위 z 로 portal 된 클론이
// 패널 밖 크롬(모달 헤더 등) 위를 가로지르지 않게 한다. bounds 가 없으면 undefined
// (= 클리핑 없음, 종전 동작). 음수는 클립 박스를 넓히므로 0 으로 조인다.
export function clipInset(
  clip: Rect | null,
  viewport: { width: number; height: number },
): string | undefined {
  if (!clip) return undefined;
  const px = (n: number): string => `${Math.max(0, n)}px`;
  const right = viewport.width - (clip.left + clip.width);
  const bottom = viewport.height - (clip.top + clip.height);
  return `inset(${px(clip.top)} ${px(right)} ${px(bottom)} ${px(clip.left)})`;
}

// morph 발동 조건: 본인이 보낸 텍스트 메시지 + 모션 허용 + 말풍선 실측 성공.
// 상대 메시지·첨부 전용·reduced-motion·측정 실패(null/0폭, jsdom 포함)면 즉시 표시로 폴백.
export function shouldMorph(o: {
  isSelf: boolean;
  hasText: boolean;
  reduce: boolean;
  to: Rect | null;
}): boolean {
  return o.isSelf && o.hasText && !o.reduce && o.to !== null && o.to.width > 0;
}
