import { describe, it, expect } from 'vitest';
import {
  demoTriggerSelector,
  demoCursorHint,
  pgDemoTriggerSelector,
  pgDemoCursorHint,
  DEMO_WINDOW_TRANSITION,
} from '../demo-triggers';

describe('demoTriggerSelector', () => {
  it('각 단계 → 다음 단계 전환을 일으키는 트리거 요소의 셀렉터를 돌려준다', () => {
    expect(demoTriggerSelector(1)).toBe('a[href="/rfp"]'); // 사이드바 '견적 요청'
    expect(demoTriggerSelector(2)).toBe('tbody tr'); // 견적 요청 목록 첫 행
    expect(demoTriggerSelector(3)).toBe('a[href="/rfp-create"]'); // 사이드바 '새 견적 요청'
  });

  it('페이지4(작성 위저드)는 위저드 내부 다음/보내기 버튼을 가리킨다', () => {
    expect(demoTriggerSelector(4)).toBe('[data-demo-cursor]');
  });

  it('정의되지 않은 페이지는 트리거가 없다', () => {
    expect(demoTriggerSelector(5)).toBeNull();
  });

  it('모바일에서는 사이드바 단계(1·3)를 인-프레임 다음 버튼으로 대체한다', () => {
    // 사이드바가 off-canvas Sheet(body portal)로 접혀 windowRef 안에서 못 찾으므로,
    // 창 안의 [data-demo-mobile-next] 버튼을 가리켜 진행을 보장한다.
    expect(demoTriggerSelector(1, true)).toBe('[data-demo-mobile-next]');
    expect(demoTriggerSelector(3, true)).toBe('[data-demo-mobile-next]');
  });

  it('모바일이라도 콘텐츠 내부 대상(2·4)은 기존 셀렉터를 유지한다', () => {
    expect(demoTriggerSelector(2, true)).toBe('tbody tr');
    expect(demoTriggerSelector(4, true)).toBe('[data-demo-cursor]');
  });

  it('isMobile 기본값(false)은 데스크톱 동작을 유지한다', () => {
    expect(demoTriggerSelector(1)).toBe('a[href="/rfp"]');
    expect(demoTriggerSelector(3)).toBe('a[href="/rfp-create"]');
  });
});

describe('demoCursorHint', () => {
  it('각 단계마다 커서가 가리키는 동작과 일치하는 안내 문구를 돌려준다', () => {
    expect(demoCursorHint(1)).toBe('보낸 견적 요청을 확인해요');
    expect(demoCursorHint(2)).toBe('견적 요청을 눌러 받은 견적을 확인해요');
    expect(demoCursorHint(3)).toBe('새로 견적을 요청해요');
    expect(demoCursorHint(4)).toBe('정보를 입력하고 견적을 요청해요');
  });

  it('정의되지 않은 페이지는 빈 문구를 돌려준다', () => {
    expect(demoCursorHint(5)).toBe('');
  });
});

describe('pgDemoTriggerSelector', () => {
  it('각 단계 → 다음 단계 전환을 일으키는 트리거 요소의 셀렉터를 돌려준다', () => {
    expect(pgDemoTriggerSelector(1)).toBe('a[href="/inbox"]'); // 사이드바 '받은 견적 요청'
    expect(pgDemoTriggerSelector(2)).toBe('tbody tr'); // 받은 요청 첫 행
    expect(pgDemoTriggerSelector(3)).toBe('a[href="/messages"]'); // 사이드바 '메시지'
  });

  it('페이지4(메시지)는 전송 버튼을 가리킨다', () => {
    expect(pgDemoTriggerSelector(4)).toBe('[data-demo-cursor]');
  });

  it('정의되지 않은 페이지는 트리거가 없다', () => {
    expect(pgDemoTriggerSelector(5)).toBeNull();
  });

  it('모바일에서는 사이드바 단계(1·3)를 인-프레임 다음 버튼으로 대체한다', () => {
    expect(pgDemoTriggerSelector(1, true)).toBe('[data-demo-mobile-next]');
    expect(pgDemoTriggerSelector(3, true)).toBe('[data-demo-mobile-next]');
  });

  it('모바일이라도 콘텐츠 내부 대상(2·4)은 기존 셀렉터를 유지한다', () => {
    expect(pgDemoTriggerSelector(2, true)).toBe('tbody tr');
    expect(pgDemoTriggerSelector(4, true)).toBe('[data-demo-cursor]');
  });

  it('isMobile 기본값(false)은 데스크톱 동작을 유지한다', () => {
    expect(pgDemoTriggerSelector(1)).toBe('a[href="/inbox"]');
    expect(pgDemoTriggerSelector(3)).toBe('a[href="/messages"]');
  });
});

describe('pgDemoCursorHint', () => {
  it('각 단계마다 커서가 가리키는 동작과 일치하는 안내 문구를 돌려준다', () => {
    expect(pgDemoCursorHint(1)).toBe('받은 견적 요청을 확인해요');
    expect(pgDemoCursorHint(2)).toBe('받은 견적 요청을 눌러 상세를 확인해요');
    expect(pgDemoCursorHint(3)).toBe('구매사와 메시지를 주고받아요');
    expect(pgDemoCursorHint(4)).toBe('여기서 바로 메시지를 보내요');
  });

  it('정의되지 않은 페이지는 빈 문구를 돌려준다', () => {
    expect(pgDemoCursorHint(5)).toBe('');
  });
});

describe('DEMO_WINDOW_TRANSITION', () => {
  it('데모 창 진입 스케일 트랜지션 문자열을 노출한다', () => {
    expect(DEMO_WINDOW_TRANSITION).toBe('transform 700ms cubic-bezier(0.22, 1, 0.36, 1)');
  });
});
