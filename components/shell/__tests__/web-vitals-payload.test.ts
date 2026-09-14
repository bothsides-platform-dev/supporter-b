import { afterEach, describe, expect, it } from 'vitest';
import { transformWebVitalsMetric } from '@axiomhq/react';

// 운영 Sentry 에서 잡힌 `Converting circular structure to JSON (HTMLBodyElement →
// __reactFiber$… → stateNode)` 의 회귀 가드.
//
// bfcache 복원 후 web-vitals v4 의 FID 폴리필은 네이티브 PerformanceEntry 가 아니라
// `{ entryType: 'first-input', target: event.target, … }` plain object 를 entries 에
// 넣는다. 포커스 없는 keydown·빈 곳 클릭이면 target 은 React 가 관리하는 <body> 이고,
// React 가 심은 fiber expando 가 body 로 되돌아와 순환이 된다. 이전 전송기(next-axiom)
// 는 metric 을 통째로 JSON.stringify 해서 던졌다. 전송 페이로드는 이 entry 를 담고도
// 직렬화돼야 한다.

const FIBER_KEY = '__reactFiber$regression';

type WebVitalsMetric = Parameters<typeof transformWebVitalsMetric>[0];

function reactManagedBody(): HTMLElement {
  const body = document.body;
  body.className = 'min-h-full flex flex-col';
  // React 가 호스트 노드에 심는 expando 모양 — fiber.stateNode 가 노드 자신을 가리킨다.
  (body as unknown as Record<string, unknown>)[FIBER_KEY] = { stateNode: body };
  return body;
}

function polyfilledFidMetric(target: HTMLElement): WebVitalsMetric {
  return {
    name: 'FID',
    value: 3,
    rating: 'good',
    delta: 3,
    id: 'v4-1789398094000-1000000000000',
    navigationType: 'back-forward-cache',
    entries: [
      {
        entryType: 'first-input',
        name: 'keydown',
        target,
        cancelable: true,
        startTime: 1000,
        processingStart: 1003,
      },
    ],
  } as unknown as WebVitalsMetric;
}

afterEach(() => {
  delete (document.body as unknown as Record<string, unknown>)[FIBER_KEY];
  document.body.className = '';
});

describe('web-vitals 전송 페이로드', () => {
  it('폴리필 FID entry 의 target 이 React 가 관리하는 <body> 면 원본 metric 은 직렬화에 실패한다 (결함 재현)', () => {
    const metric = polyfilledFidMetric(reactManagedBody());

    expect(() => JSON.stringify(metric)).toThrow(/circular/i);
  });

  it('같은 metric 을 전송 페이로드로 바꾸면 직렬화되고 target 은 노드 식별 문자열만 남는다', () => {
    const metric = polyfilledFidMetric(reactManagedBody());

    const serialized = JSON.stringify(transformWebVitalsMetric(metric));
    const payload = JSON.parse(serialized);

    expect(payload.webVital.name).toBe('FID');
    expect(payload.webVital.value).toBe(3);
    expect(payload.webVital.entries).toEqual([
      {
        entryType: 'first-input',
        name: 'keydown',
        cancelable: true,
        startTime: 1000,
        processingStart: 1003,
        target: { nodeName: 'BODY', tagName: 'BODY', className: 'min-h-full flex flex-col' },
      },
    ]);
  });
});
