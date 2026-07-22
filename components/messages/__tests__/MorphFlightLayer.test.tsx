// MorphFlightLayer — 전송 morph 클론을 body 로 portal 해 그리는 오버레이.
//
// body portal 은 의도된 선택이다(메시지 목록의 overflow 클리핑 회피). 대신 최상위 z 라
// 딜룸 모달처럼 채팅이 더 큰 표면에 임베드되면 클론이 모달 헤더 위를 가로지를 수 있어,
// flight 가 실어 온 패널 경계(`clip`)로 잘라낸다.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MorphFlightLayer } from '../MorphFlightLayer';
import type { Flight } from '../message-morph';

afterEach(() => cleanup());

const flight = (over: Partial<Flight> = {}): Flight => ({
  key: 'k1',
  text: '안녕하세요',
  to: { left: 100, top: 400, width: 200, height: 40 },
  dx: -80,
  dy: 200,
  scale: 1.5,
  clip: null,
  ...over,
});

function renderLayer(flights: Flight[]) {
  render(<MorphFlightLayer flights={flights} onDone={vi.fn()} renderText={(b) => b} />);
  return Array.from(document.querySelectorAll<HTMLElement>('[data-morph-clip]'));
}

describe('MorphFlightLayer', () => {
  it('flight 가 없으면 아무것도 그리지 않는다', () => {
    expect(renderLayer([])).toHaveLength(0);
  });

  // jsdom viewport = 1024x768. 경계가 좌측 하단 패널이면 위/우측을 잘라낸다.
  it('clip 이 있으면 클론을 패널 경계로 잘라낸다', () => {
    const [clipBox] = renderLayer([
      flight({ clip: { left: 0, top: 300, width: 400, height: 400 } }),
    ]);
    // right = 1024 - 400 = 624, bottom = 768 - 700 = 68
    expect(clipBox.style.clipPath).toBe('inset(300px 624px 68px 0px)');
  });

  it('clip 이 없으면 클리핑하지 않는다(비임베드 표면 폴백)', () => {
    const [clipBox] = renderLayer([flight({ clip: null })]);
    expect(clipBox.style.clipPath).toBe('');
  });

  it('flight 마다 자기 경계로 잘라낸다', () => {
    const boxes = renderLayer([
      flight({ key: 'k1', clip: { left: 0, top: 0, width: 1024, height: 768 } }),
      flight({ key: 'k2', clip: null }),
    ]);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].style.clipPath).toBe('inset(0px 0px 0px 0px)');
    expect(boxes[1].style.clipPath).toBe('');
  });
});
