import { describe, it, expect } from 'vitest';

import { renderSigningAwaitingTemplate } from '../signingAwaitingTemplate';
import type { SigningAwaitingTemplateProps } from '../types';

const PROPS: SigningAwaitingTemplateProps = {
  rfpId: 'P-2607-0042',
  rfpTitle: '결제 인프라 견적',
  dealRoomUrl: 'https://partner.support-b.com/inbox/P-2607-0042',
};

describe('renderSigningAwaitingTemplate', () => {
  it('견적번호·제목·딜룸 링크를 담는다', async () => {
    const html = await renderSigningAwaitingTemplate(PROPS);
    expect(html).toContain('P-2607-0042');
    expect(html).toContain('결제 인프라 견적');
    expect(html).toContain('https://partner.support-b.com/inbox/P-2607-0042');
  });

  // 최초 발송과 재넛지는 사실관계가 다르다 — 고아(발송은 됐는데 완료 신호가 유실된
  // 경우)에게 "아직 안 보냈다"고 단정하면 거짓말이 된다.
  it('재넛지는 이미 보냈을 가능성을 문구에 담는다', async () => {
    const first = await renderSigningAwaitingTemplate(PROPS);
    const nudge = await renderSigningAwaitingTemplate({ ...PROPS, isNudge: true });
    expect(first).not.toContain('보낸 계약서 찾기');
    expect(nudge).toContain('보낸 계약서 찾기');
  });

  /**
   * 봉인 경계 — 이 메일에는 **금액·수수료가 절대 실리지 않는다**(운영자 디스코드
   * 알림과 같은 규범).
   *
   * 오늘은 props 자체가 견적번호·제목·URL 뿐이라 샐 것이 없다. 이 테스트의 일은
   * **누군가 나중에 prop 을 늘렸을 때** 그것을 잡는 것이다 — 그래서 렌더 결과가
   * 아니라 **prop 표면**을 고정한다. 렌더 결과만 보면 "지금은 안 샌다"만 말하고
   * 늘어난 prop 이 실제로 쓰이기 전까지는 계속 통과한다.
   */
  it('prop 표면이 견적번호·제목·링크·넛지플래그 넷뿐이다', () => {
    const keys: Array<keyof SigningAwaitingTemplateProps> = [
      'rfpId',
      'rfpTitle',
      'dealRoomUrl',
      'isNudge',
    ];
    // 타입에 없는 키를 넣으면 컴파일이 깨지고, 타입에 키가 늘면 이 배열이 좁아져
    // exhaustive 체크가 실패한다.
    const _exhaustive: Record<keyof SigningAwaitingTemplateProps, true> = {
      rfpId: true,
      rfpTitle: true,
      dealRoomUrl: true,
      isNudge: true,
    };
    expect(Object.keys(_exhaustive).sort()).toEqual([...keys].sort());
  });

  it('보이는 문구에 통화·요율 표기가 없다', async () => {
    const html = await renderSigningAwaitingTemplate(PROPS);
    // **태그·스타일을 걷어낸 뒤** 본다 — CSS 의 `width:100%` 까지 잡으면 이 단언은
    // 늘 빨갛고, 빨간 단언은 결국 지워진다. 관심사는 사용자에게 보이는 문구다.
    const visible = html
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, ' ');
    expect(visible).not.toContain('₩');
    expect(visible).not.toMatch(/\d+(\.\d+)?%/);
    expect(visible).not.toContain('수수료');
  });
});
