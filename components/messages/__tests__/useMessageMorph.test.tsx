// useMessageMorph — 전송 morph 의 예약·측정·발동·정리 오케스트레이션.
// 순수 좌표/판정 로직은 message-morph.test.ts 가 고정하고, 여기서는 훅이 소유한
// 계약(스케줄 → 말풍선 안착 후 측정 → 1회 발동 → 정리)을 고정한다.
//
// jsdom 함정 2개를 명시적으로 무력화한다:
//   ① useReducedMotion() — jsdom 에 matchMedia 가 없어 true 로 떨어진다.
//      목킹하지 않으면 morph 가 영원히 발동하지 않아 테스트가 무의미해진다.
//   ② getBoundingClientRect() — 전부 0 을 반환해 shouldMorph 의 to.width > 0
//      게이트에 걸린다. from/to 엘리먼트의 rect 를 직접 스텁한다.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let reduce = false;
vi.mock('motion/react', async (importOriginal) => {
  const mod = await importOriginal<typeof import('motion/react')>();
  return { ...mod, useReducedMotion: () => reduce };
});

import { useMessageMorph } from '../useMessageMorph';

type Box = { left: number; top: number; width: number; height: number };

function stubRect(el: HTMLElement, box: Box): void {
  el.getBoundingClientRect = () =>
    ({ ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => ({}) }) as DOMRect;
}

// 입력창(from) 과 말풍선(to) 을 갖춘 최소 DOM. 말풍선은 listRef 컨테이너 안에
// data-bubble-key 로 심어 훅이 셀렉터로 찾게 한다(MessageBubble 과 동일 계약).
function setupDom(bubbleKey = 'k1') {
  const list = document.createElement('div');
  const bubble = document.createElement('div');
  bubble.setAttribute('data-bubble-key', bubbleKey);
  list.appendChild(bubble);
  const composer = document.createElement('div');
  document.body.append(list, composer);

  stubRect(bubble, { left: 100, top: 400, width: 200, height: 40 });
  stubRect(composer, { left: 20, top: 600, width: 300, height: 32 });

  return { listRef: { current: list }, composer };
}

beforeEach(() => {
  reduce = false;
  document.body.innerHTML = '';
});

describe('useMessageMorph', () => {
  it('스케줄하면 말풍선을 측정해 flight 를 발동한다', () => {
    const { listRef, composer } = setupDom();
    const { result } = renderHook(() => useMessageMorph({ listRef }));

    act(() => {
      result.current.scheduleFlight(composer, 'k1', '안녕하세요');
    });

    expect(result.current.layerProps.flights).toHaveLength(1);
    expect(result.current.isMorphing('k1')).toBe(true);

    // from(입력창) 에서 to(말풍선) 로 되돌리는 초기 transform.
    const [flight] = result.current.layerProps.flights;
    expect(flight).toMatchObject({
      key: 'k1',
      text: '안녕하세요',
      dx: 20 - 100,
      dy: 600 - 400,
      scale: 300 / 200,
    });
    expect(flight.to).toEqual({ left: 100, top: 400, width: 200, height: 40 });
  });

  it('출발 엘리먼트가 없으면 발동하지 않는다', () => {
    const { listRef } = setupDom();
    const { result } = renderHook(() => useMessageMorph({ listRef }));

    act(() => {
      result.current.scheduleFlight(null, 'k1', '안녕하세요');
    });

    expect(result.current.layerProps.flights).toHaveLength(0);
    expect(result.current.isMorphing('k1')).toBe(false);
  });

  it('reduced-motion 이면 발동하지 않는다', () => {
    reduce = true;
    const { listRef, composer } = setupDom();
    const { result } = renderHook(() => useMessageMorph({ listRef }));

    act(() => {
      result.current.scheduleFlight(composer, 'k1', '안녕하세요');
    });

    expect(result.current.layerProps.flights).toHaveLength(0);
  });

  it('공백뿐인 텍스트는 발동하지 않는다(첨부 전용 전송)', () => {
    const { listRef, composer } = setupDom();
    const { result } = renderHook(() => useMessageMorph({ listRef }));

    act(() => {
      result.current.scheduleFlight(composer, 'k1', '   ');
    });

    expect(result.current.layerProps.flights).toHaveLength(0);
  });

  it('말풍선을 찾지 못하면 발동하지 않는다(즉시 표시 폴백)', () => {
    const { listRef, composer } = setupDom('other-key');
    const { result } = renderHook(() => useMessageMorph({ listRef }));

    act(() => {
      result.current.scheduleFlight(composer, 'k1', '안녕하세요');
    });

    expect(result.current.layerProps.flights).toHaveLength(0);
  });

  // 전송 실패 롤백: 낙관적 말풍선이 사라지는데 예약만 남으면 이미 제거된 행을
  // 측정하게 된다. endFlight 는 진행 중 flight 뿐 아니라 *발동 전 예약*도 취소한다.
  it('발동 전에 endFlight 하면 이후로도 발동하지 않는다', () => {
    const { listRef, composer } = setupDom();
    const { result } = renderHook(() => useMessageMorph({ listRef }));

    act(() => {
      result.current.scheduleFlight(composer, 'k1', '안녕하세요');
      result.current.endFlight('k1');
    });

    expect(result.current.layerProps.flights).toHaveLength(0);
    expect(result.current.isMorphing('k1')).toBe(false);
  });

  // 앞선 클론의 착륙(onDone)이 뒤이어 예약된 다른 메시지의 morph 를 죽이면 안 된다.
  // 예약 취소는 키가 일치할 때만 — 연속 전송에서 뒤 메시지가 조용히 사라지는 것을 막는다.
  it('다른 키로 endFlight 해도 대기 중인 예약은 살아남는다', () => {
    const { listRef, composer } = setupDom('k2');
    const { result } = renderHook(() => useMessageMorph({ listRef }));

    act(() => {
      result.current.scheduleFlight(composer, 'k2', '뒤이어 보낸 메시지');
      result.current.endFlight('k1'); // 앞선 비행의 착륙 — k2 예약과 무관
    });

    expect(result.current.layerProps.flights).toHaveLength(1);
    expect(result.current.isMorphing('k2')).toBe(true);
  });

  it('발동 후 endFlight 하면 클론이 걷힌다', () => {
    const { listRef, composer } = setupDom();
    const { result } = renderHook(() => useMessageMorph({ listRef }));

    act(() => {
      result.current.scheduleFlight(composer, 'k1', '안녕하세요');
    });
    expect(result.current.isMorphing('k1')).toBe(true);

    act(() => {
      result.current.endFlight('k1');
    });

    expect(result.current.layerProps.flights).toHaveLength(0);
    expect(result.current.isMorphing('k1')).toBe(false);
  });

  it('같은 키를 두 번 스케줄해도 클론은 하나다', () => {
    const { listRef, composer } = setupDom();
    const { result } = renderHook(() => useMessageMorph({ listRef }));

    act(() => {
      result.current.scheduleFlight(composer, 'k1', '안녕하세요');
    });
    act(() => {
      result.current.scheduleFlight(composer, 'k1', '안녕하세요');
    });

    expect(result.current.layerProps.flights).toHaveLength(1);
  });

  // MorphFlightLayer 로 그대로 스프레드하는 표면 — onDone 은 endFlight 와 같은 정리 경로.
  it('layerProps 는 레이어에 스프레드할 flights + onDone 을 제공한다', () => {
    const { listRef, composer } = setupDom();
    const { result } = renderHook(() => useMessageMorph({ listRef }));

    act(() => {
      result.current.scheduleFlight(composer, 'k1', '안녕하세요');
    });

    act(() => {
      result.current.layerProps.onDone('k1');
    });

    expect(result.current.layerProps.flights).toHaveLength(0);
  });
});
