// 신규 가입 → 운영자 알림. 메일 제목·슬랙 본문 빌더(순수 함수) + 두 채널 발화.
//
// Contract:
//   - 슬랙과 이메일은 **서로 독립**이다. 한쪽이 죽어도 다른 쪽은 나간다.
//   - 사용자 입력(상호·이름)은 슬랙 문법으로 해석되지 않게 이스케이프된다.
//   - notifyAdmin*AfterCommit 는 동기 void, never throws.
import * as Sentry from '@sentry/nextjs';
import { after } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildAdminMembershipSlackText,
  buildAdminSignupSlackText,
  buildAdminSignupSubject,
  notifyAdminNewMembershipAfterCommit,
  notifyAdminNewSignupAfterCommit,
} from '../admin-signup';

// after() 를 즉시 실행으로 바꿔 요청 스코프 없이도 콜백 본문을 검증한다.
// (이 mock 이 없으면 기존 스위트처럼 after() 안쪽이 통째로 미검증으로 남는다.)
vi.mock('next/server', () => ({
  after: vi.fn((cb: () => Promise<void>) => {
    void cb();
  }),
}));

const sendSlackMessage = vi.hoisted(() => vi.fn());
const sendAdminEmail = vi.hoisted(() => vi.fn());
const renderAdminSignupReview = vi.hoisted(() => vi.fn());
const renderAdminMembershipReview = vi.hoisted(() => vi.fn());

vi.mock('@/lib/integrations/slack', async () => {
  const actual = await vi.importActual<typeof import('@/lib/integrations/slack')>(
    '@/lib/integrations/slack',
  );
  // escapeSlackText 는 진짜를 쓴다 — 빌더가 실제로 이스케이프하는지 봐야 한다.
  return { ...actual, sendSlackMessage };
});
vi.mock('@/lib/integrations/admin-email', () => ({ sendAdminEmail }));
vi.mock('@/lib/server/outbox/templates/adminSignupReview', () => ({ renderAdminSignupReview }));
vi.mock('@/lib/server/outbox/templates/adminMembershipReview', () => ({
  renderAdminMembershipReview,
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

const SIGNUP = {
  workspaceName: '바이딧 주식회사',
  orgType: 'buyer' as const,
  reviewUrl: 'https://admin.test/admin/review/a1',
};
const MEMBERSHIP = {
  userName: '김담당',
  workspaceName: 'KG이니시스',
  reviewUrl: 'https://admin.test/admin/pg-members',
};

describe('buildAdminSignupSubject', () => {
  it('includes the workspace name and 구매사 label for a buyer', () => {
    const subject = buildAdminSignupSubject(SIGNUP);
    expect(subject).toContain('바이딧 주식회사');
    expect(subject).toContain('구매사');
  });

  it('labels a pg workspace as PG사 (matching the admin review UI)', () => {
    const subject = buildAdminSignupSubject({
      workspaceName: 'KG이니시스',
      orgType: 'pg',
      reviewUrl: 'https://x.test/admin/review/a2',
    });
    expect(subject).toContain('KG이니시스');
    expect(subject).toContain('PG사');
  });

  // 국세청 장애로 자동 검증을 건너뛴 가입건은 승인 전에 사람이 확인해야 한다.
  // 사용자에게는 아무 오류도 보이지 않으므로, 이 배지가 운영자에게 그 사실을
  // 전달하는 **유일하게 도달이 보장된 채널**이다 (risk flag 렌더링은 별도 레포).
  it('flags an unverified bizNo in the subject', () => {
    expect(buildAdminSignupSubject({ ...SIGNUP, bizVerified: false })).toContain(
      '사업자번호 미검증',
    );
  });

  it('does not flag a verified signup', () => {
    expect(buildAdminSignupSubject({ ...SIGNUP, bizVerified: true })).not.toContain('미검증');
  });

  // bizVerified 미지정(레거시 호출부)은 배지를 붙이지 않는다 — 배지가 붙으면
  // 그건 진짜 미검증이라는 뜻이어야 신뢰할 수 있다.
  it('omits the flag when bizVerified is not provided', () => {
    expect(buildAdminSignupSubject(SIGNUP)).not.toContain('미검증');
  });
});

describe('buildAdminSignupSlackText', () => {
  it('carries the workspace name, org label and review URL', () => {
    const text = buildAdminSignupSlackText(SIGNUP);
    expect(text).toContain('바이딧 주식회사');
    expect(text).toContain('구매사');
    expect(text).toContain(SIGNUP.reviewUrl);
  });

  it('labels a pg workspace as PG사', () => {
    expect(
      buildAdminSignupSlackText({ ...SIGNUP, workspaceName: 'KG이니시스', orgType: 'pg' }),
    ).toContain('PG사');
  });

  // 이메일 제목과 **동등하게** 배지를 단다. 이 배지가 약해지면 국세청 장애 중
  // 가입한 건이 아무 표시 없이 승인 큐로 흘러간다.
  it('flags an unverified bizNo, exactly like the email subject does', () => {
    expect(buildAdminSignupSlackText({ ...SIGNUP, bizVerified: false })).toContain(
      '사업자번호 미검증',
    );
    expect(buildAdminSignupSlackText({ ...SIGNUP, bizVerified: true })).not.toContain('미검증');
    expect(buildAdminSignupSlackText(SIGNUP)).not.toContain('미검증');
  });

  // 상호는 가입자가 자유 입력한다 — 슬랙 문법으로 해석되면 운영 채널이 핑당한다.
  it('escapes a channel-wide mention smuggled into the workspace name', () => {
    const text = buildAdminSignupSlackText({ ...SIGNUP, workspaceName: '<!channel> 주식회사' });
    expect(text).not.toContain('<!channel>');
    expect(text).toContain('&lt;!channel&gt;');
  });

  // reviewUrl 은 adminBaseUrl() + UUID 조립값이라 그대로 둔다 — 슬랙이 자동 링크한다.
  it('leaves the server-built review URL bare so Slack autolinks it', () => {
    expect(buildAdminSignupSlackText(SIGNUP)).toContain('https://admin.test/admin/review/a1');
  });
});

describe('buildAdminMembershipSlackText', () => {
  it('carries the user name, workspace name and review URL', () => {
    const text = buildAdminMembershipSlackText(MEMBERSHIP);
    expect(text).toContain('김담당');
    expect(text).toContain('KG이니시스');
    expect(text).toContain(MEMBERSHIP.reviewUrl);
  });

  it('escapes a mention smuggled into the user name', () => {
    const text = buildAdminMembershipSlackText({ ...MEMBERSHIP, userName: '<!here> 김담당' });
    expect(text).not.toContain('<!here>');
    expect(text).toContain('&lt;!here&gt;');
  });

  // 이 빌더는 인자를 **둘 다** 이스케이프한다. userName 만 테스트하면 workspaceName 쪽
  // 이스케이프가 통째로 미고정이라, 지워도 스위트가 초록으로 남는다(실제로 확인됨).
  // 합류 신청의 상호는 셀프서비스로 만든 PG 워크스페이스의 자유 입력 상호다.
  it('escapes a mention smuggled into the membership workspace name', () => {
    const text = buildAdminMembershipSlackText({
      ...MEMBERSHIP,
      workspaceName: '<!channel> 페이',
    });
    expect(text).not.toContain('<!channel>');
    expect(text).toContain('&lt;!channel&gt;');
  });
});

describe('notifyAdminNewSignupAfterCommit', () => {
  beforeEach(() => {
    renderAdminSignupReview.mockResolvedValue('<html>review</html>');
    sendSlackMessage.mockResolvedValue({ ok: true });
    sendAdminEmail.mockResolvedValue({ ok: true });
  });
  afterEach(() => vi.clearAllMocks());

  it('fires both channels', async () => {
    notifyAdminNewSignupAfterCommit(SIGNUP);

    await vi.waitFor(() => {
      expect(sendSlackMessage).toHaveBeenCalledTimes(1);
      expect(sendAdminEmail).toHaveBeenCalledTimes(1);
    });
    expect(sendSlackMessage.mock.calls[0][0].text).toBe(buildAdminSignupSlackText(SIGNUP));
  });

  // 렌더는 이 콜백에서 가장 느리고 가장 잘 깨지는 단계다. 단일 try 안에 두면
  // 렌더가 던지는 순간 슬랙까지 함께 죽는다 — 운영자가 실시간으로 보는 채널이.
  it('still sends Slack when the email template render throws', async () => {
    renderAdminSignupReview.mockRejectedValue(new Error('render blew up'));

    notifyAdminNewSignupAfterCommit(SIGNUP);

    await vi.waitFor(() => expect(sendSlackMessage).toHaveBeenCalledTimes(1));
    expect(sendAdminEmail).not.toHaveBeenCalled();
  });

  it('still sends the email when Slack rejects', async () => {
    sendSlackMessage.mockRejectedValue(new Error('slack down'));

    notifyAdminNewSignupAfterCommit(SIGNUP);

    await vi.waitFor(() => expect(sendAdminEmail).toHaveBeenCalledTimes(1));
  });

  // 가드가 있다는 것만으로는 부족하다 — 컨텍스트 태그가 없으면 조용히 삼킨 알림이
  // 운영에서 보이지 않는다. 태그를 단정하지 않으면 catch 본문을 비워도 초록이다.
  it('reports each channel failure to Sentry under its own context tag', async () => {
    sendSlackMessage.mockRejectedValue(new Error('slack down'));
    renderAdminSignupReview.mockRejectedValue(new Error('render blew up'));

    notifyAdminNewSignupAfterCommit(SIGNUP);

    await vi.waitFor(() => {
      expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
        extra: { context: 'admin-signup-slack' },
      });
      expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
        extra: { context: 'admin-signup-notify' },
      });
    });
  });

  it('never throws synchronously', () => {
    sendSlackMessage.mockRejectedValue(new Error('slack down'));
    expect(() => notifyAdminNewSignupAfterCommit(SIGNUP)).not.toThrow();
  });

  // 빌더가 던져도 액션으로 새면 안 된다. 이 모듈의 헤더 계약이 "실패해도 액션 에러로
  // 표면화하지 않는다" 이고, 호출부(signupCompleteAction)는 **커밋 이후**라 여기서 던지면
  // 가입은 성공했는데 사용자에게는 서버 오류가 뜬다.
  it('does not leak a builder throw into the calling action', () => {
    const hostile = {
      ...SIGNUP,
      get workspaceName(): string {
        throw new Error('builder blew up');
      },
    } as typeof SIGNUP;

    expect(() => notifyAdminNewSignupAfterCommit(hostile)).not.toThrow();
  });

  // 바깥 try/catch 가 존재하는 유일한 이유 — 요청 스코프 밖에서 after() 가 던지는 것.
  // 기본 mock 은 절대 던지지 않으므로 이 케이스가 없으면 그 가드는 미검증으로 남는다.
  it('does not throw when after() itself throws (outside a request scope)', () => {
    vi.mocked(after).mockImplementationOnce(() => {
      throw new Error('after() called outside a request scope');
    });
    expect(() => notifyAdminNewSignupAfterCommit(SIGNUP)).not.toThrow();
  });
});

describe('notifyAdminNewMembershipAfterCommit', () => {
  beforeEach(() => {
    renderAdminMembershipReview.mockResolvedValue('<html>review</html>');
    sendSlackMessage.mockResolvedValue({ ok: true });
    sendAdminEmail.mockResolvedValue({ ok: true });
  });
  afterEach(() => vi.clearAllMocks());

  it('fires both channels', async () => {
    notifyAdminNewMembershipAfterCommit(MEMBERSHIP);

    await vi.waitFor(() => {
      expect(sendSlackMessage).toHaveBeenCalledTimes(1);
      expect(sendAdminEmail).toHaveBeenCalledTimes(1);
    });
    expect(sendSlackMessage.mock.calls[0][0].text).toBe(
      buildAdminMembershipSlackText(MEMBERSHIP),
    );
  });

  it('still sends Slack when the email template render throws', async () => {
    renderAdminMembershipReview.mockRejectedValue(new Error('render blew up'));

    notifyAdminNewMembershipAfterCommit(MEMBERSHIP);

    await vi.waitFor(() => expect(sendSlackMessage).toHaveBeenCalledTimes(1));
    expect(sendAdminEmail).not.toHaveBeenCalled();
  });

  it('still sends the email when Slack rejects', async () => {
    sendSlackMessage.mockRejectedValue(new Error('slack down'));

    notifyAdminNewMembershipAfterCommit(MEMBERSHIP);

    await vi.waitFor(() => expect(sendAdminEmail).toHaveBeenCalledTimes(1));
  });

  it('never throws synchronously', () => {
    sendSlackMessage.mockRejectedValue(new Error('slack down'));
    expect(() => notifyAdminNewMembershipAfterCommit(MEMBERSHIP)).not.toThrow();
  });
});
