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
// 목록/입력창은 [data-morph-bounds] 패널로 감싼다 — 실제 ThreadView 구조와 동일하고,
// 훅이 클론을 가둘 경계를 여기서 잰다. withBounds:false 면 경계 없는 표면을 흉내낸다.
function setupDom(bubbleKeys: string | string[] = 'k1', { withBounds = true } = {}) {
  const panel = document.createElement('div');
  if (withBounds) panel.setAttribute('data-morph-bounds', '');
  const list = document.createElement('div');
  for (const key of [bubbleKeys].flat()) {
    const bubble = document.createElement('div');
    bubble.setAttribute('data-bubble-key', key);
    list.appendChild(bubble);
    stubRect(bubble, { left: 100, top: 400, width: 200, height: 40 });
  }
  const composer = document.createElement('div');
  panel.append(list, composer);
  document.body.append(panel);

  stubRect(panel, { left: 0, top: 300, width: 400, height: 400 });
  stubRect(composer, { left: 20, top: 600, width: 300, height: 32 });

  return { listRef: { current: list }, composer, panel };
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

  // 목록이 아직/이미 마운트되지 않은 순간(탭 전환·언마운트 레이스)에도 조용히 폴백해야 한다.
  it('목록 ref 가 비어 있어도 터지지 않고 발동만 건너뛴다', () => {
    const { composer } = setupDom();
    const emptyListRef: { current: HTMLElement | null } = { current: null };
    const { result } = renderHook(() => useMessageMorph({ listRef: emptyListRef }));

    act(() => {
      result.current.scheduleFlight(composer, 'k1', '안녕하세요');
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

  // 예약 슬롯이 하나뿐이면 같은 틱의 두 번째 전송이 첫 번째를 덮어써, 앞 메시지가
  // 애니메이션 없이 튀어나온다. 예약은 큐여야 한다.
  it('같은 틱에 두 건을 스케줄해도 둘 다 발동한다(연속 전송)', () => {
    const { listRef, composer } = setupDom(['k1', 'k2']);
    const { result } = renderHook(() => useMessageMorph({ listRef }));

    act(() => {
      result.current.scheduleFlight(composer, 'k1', '첫 번째');
      result.current.scheduleFlight(composer, 'k2', '두 번째');
    });

    expect(result.current.layerProps.flights).toHaveLength(2);
    expect(result.current.isMorphing('k1')).toBe(true);
    expect(result.current.isMorphing('k2')).toBe(true);
  });

  // ThreadView 의 messages prop 리싱크는 낙관적 행(localKey 보유)을 서버 행으로 통째
  // 교체해 morph 타깃 키를 잃는다. 그 순간 진행 중인 클론을 거둬야 실 말풍선과
  // 클론이 동시에 보이는 이중 표시를 막는다.
  it('clearFlights 는 진행 중인 클론을 거둔다', () => {
    const { listRef, composer } = setupDom(['k1', 'k2']);
    const { result } = renderHook(() => useMessageMorph({ listRef }));

    act(() => {
      result.current.scheduleFlight(composer, 'k1', '첫 번째');
      result.current.scheduleFlight(composer, 'k2', '두 번째');
    });
    expect(result.current.layerProps.flights).toHaveLength(2);

    act(() => {
      result.current.clearFlights();
    });

    expect(result.current.layerProps.flights).toHaveLength(0);
    expect(result.current.isMorphing('k1')).toBe(false);
    expect(result.current.isMorphing('k2')).toBe(false);
  });

  // clearFlights 의 렌더-중-호출 안전성 계약을 못박는다: 이미 비어 있으면 setFlights 가
  // 같은 배열 참조를 돌려줘 React 가 업데이트를 bail out 한다(재렌더 루프 없음). ThreadView
  // 의 리싱크 분기가 렌더 도중 이걸 부르므로, 빈 상태에서 새 []를 반환하도록 회귀하면
  // 이 불변식이 깨진다 — 그런데 flights 를 가진 케이스만으론 그 회귀를 못 잡는다.
  it('clearFlights 는 이미 비어 있으면 같은 배열 참조를 유지한다(bail-out)', () => {
    const { listRef } = setupDom();
    const { result } = renderHook(() => useMessageMorph({ listRef }));

    const before = result.current.layerProps.flights;
    expect(before).toHaveLength(0);

    act(() => {
      result.current.clearFlights();
    });

    // 새 []가 아니라 같은 참조여야 React 가 렌더를 bail out 한다.
    expect(result.current.layerProps.flights).toBe(before);
  });

  // clearFlights 가 예약 큐까지 비우지 않아도 되는 근거 — 목록이 갈리면 예약이 노리던
  // 말풍선도 함께 사라져 측정이 실패한다. 덕분에 clearFlights 는 setState 하나로 끝나
  // 렌더 도중(리싱크 분기) 호출해도 안전하다.
  it('말풍선이 사라진 예약은 스스로 취소된다(목록 교체)', () => {
    const { listRef, composer } = setupDom();
    const { result } = renderHook(() => useMessageMorph({ listRef }));

    act(() => {
      result.current.scheduleFlight(composer, 'k1', '안녕하세요');
      // 측정 effect 가 돌기 전에 목록이 갈린다 — 낙관적 말풍선이 서버 행으로 교체돼
      // data-bubble-key="k1" 이 사라지는 상황.
      listRef.current.querySelector('[data-bubble-key="k1"]')?.remove();
    });

    expect(result.current.layerProps.flights).toHaveLength(0);
  });

  // 딜룸 모달처럼 채팅이 더 큰 표면에 임베드되면, 최상위 z 로 portal 된 클론이 모달
  // 헤더 위를 가로지를 수 있다. 발동 시 패널 경계를 실어 레이어가 잘라내게 한다.
  it('flight 에 [data-morph-bounds] 패널 경계를 clip 으로 싣는다', () => {
    const { listRef, composer } = setupDom();
    const { result } = renderHook(() => useMessageMorph({ listRef }));

    act(() => {
      result.current.scheduleFlight(composer, 'k1', '안녕하세요');
    });

    expect(result.current.layerProps.flights[0].clip).toEqual({
      left: 0,
      top: 300,
      width: 400,
      height: 400,
    });
  });

  it('경계 엘리먼트가 없으면 clip 은 null 이다(클리핑 없음 폴백)', () => {
    const { listRef, composer } = setupDom('k1', { withBounds: false });
    const { result } = renderHook(() => useMessageMorph({ listRef }));

    act(() => {
      result.current.scheduleFlight(composer, 'k1', '안녕하세요');
    });

    expect(result.current.layerProps.flights[0].clip).toBeNull();
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
