import { describe, it, expect } from 'vitest';

import {
  buildSigningCardView,
  buildSigningSummary,
  nodeStatusLabel,
  type SigningNodeState,
} from '../signing-view-model';
import type {
  SigningContractStatus,
  SigningParticipant,
  SigningParticipantRole,
  SigningParticipantStatus,
  SigningView,
} from '@/lib/types/signing';

function part(
  role: SigningParticipantRole,
  status: SigningParticipantStatus,
  over: Partial<SigningParticipant> = {},
): SigningParticipant {
  return {
    id: role,
    contractId: 'c1',
    name: role === 'buyer' ? '김구매' : '이대행',
    email: `${role}@x.com`,
    role,
    securityMethod: 'easy_cert',
    status,
    ...over,
  };
}

function view(status: SigningContractStatus, participants: SigningParticipant[] = []): SigningView {
  return {
    contract: {
      id: 'c1',
      rfpId: 'r1',
      status,
      round: 1,
      createdBy: 'u',
      createdAt: '2026-07-20T04:40:00Z',
      sentAt: '2026-07-20T05:02:00Z',
      ...(status === 'completed' ? { completedAt: '2026-07-21T01:24:00Z' } : {}),
      ...(status === 'canceled' ? { canceledAt: '2026-07-20T08:05:00Z' } : {}),
      ...(status === 'expired' ? { expiresAt: '2026-07-27T05:02:00Z' } : {}),
    },
    participants,
  };
}

const bothPending = [part('buyer', 'pending'), part('pg', 'pending')];

describe('진행 중 카드의 서명 마감 표시', () => {
  it('sent/in_progress 에 expiresAt 이 있으면 deadlineAt 으로 노출한다', () => {
    for (const status of ['sent', 'in_progress'] as const) {
      const v = view(status, bothPending);
      v.contract.expiresAt = '2026-08-20T05:02:00Z';
      expect(buildSigningCardView(v, 'pg').deadlineAt).toBe('2026-08-20T05:02:00Z');
    }
  });

  it('expiresAt 이 없으면(임베드 경로 기본) deadlineAt 도 없다', () => {
    const v = buildSigningCardView(view('sent', bothPending), 'pg');
    expect(v.deadlineAt).toBeUndefined();
  });

  it('종결 상태에는 deadlineAt 을 노출하지 않는다 — 지나간 마감은 카드 헤더가 아니라 타임라인의 몫', () => {
    const v = view('completed', [part('buyer', 'signed'), part('pg', 'signed')]);
    v.contract.expiresAt = '2026-08-20T05:02:00Z';
    expect(buildSigningCardView(v, 'buyer').deadlineAt).toBeUndefined();
  });
});

describe('buildSigningCardView', () => {
  it('모든 상태가 노드 4개와 헤더·안내문을 채운다', () => {
    const statuses: SigningContractStatus[] = [
      'awaiting_pg_template',
      'sent',
      'in_progress',
      'completed',
      'declined',
      'expired',
      'canceled',
      'send_failed',
    ];
    for (const status of statuses) {
      for (const side of ['buyer', 'pg'] as const) {
        const v = buildSigningCardView(view(status, bothPending), side);
        expect(v.nodes, `${status}/${side}`).toHaveLength(4);
        expect(v.title.length, `${status}/${side}`).toBeGreaterThan(0);
        expect(v.note.length, `${status}/${side}`).toBeGreaterThan(0);
        expect(v.chip.label.length, `${status}/${side}`).toBeGreaterThan(0);
      }
    }
  });

  it('awaiting_pg_template — 구매사는 대기 안내만, 액션이 없다', () => {
    const v = buildSigningCardView(view('awaiting_pg_template'), 'buyer');
    expect(v.title).toBe('PG사가 계약서를 준비하고 있어요');
    expect(v.chip).toEqual({ color: 'warning', label: 'PG사가 계약서 준비 중' });
    expect(v.actions).toEqual([]);
    expect(v.nodes[1]).toMatchObject({ key: 'prepare', state: 'active' });
  });

  it('awaiting_pg_template — 첫 노드 라벨이 역할별로 갈린다(선정 사실, 발송 전)', () => {
    const buyerV = buildSigningCardView(view('awaiting_pg_template'), 'buyer');
    expect(buyerV.nodes[0]).toMatchObject({ key: 'awarded', label: '견적을 선정했어요' });
    const pgV = buildSigningCardView(view('awaiting_pg_template'), 'pg');
    expect(pgV.nodes[0]).toMatchObject({ key: 'awarded', label: '이 견적이 선정됐어요' });
  });

  it('awaiting_pg_template — PG는 올리기 + 보낸 것 찾기 두 액션을 받는다', () => {
    const v = buildSigningCardView(view('awaiting_pg_template'), 'pg');
    expect(v.title).toBe('계약서를 올리고 보내요');
    expect(v.chip).toEqual({ color: 'warning', label: '계약서 보내기 전' });
    // 순서가 중요하다 — 올리기가 주 동작이고 찾기는 이미 보낸 사람을 위한 보조다.
    expect(v.actions.map((a) => a.id)).toEqual(['upload', 'recover']);
    expect(v.actions[1]?.variant).toBe('text');
  });

  // 구매사는 남의 계약을 찾을 이유도 권한도 없다.
  it('awaiting_pg_template — 구매사에게는 찾기 액션이 없다', () => {
    const v = buildSigningCardView(view('awaiting_pg_template'), 'buyer');
    expect(v.actions).toEqual([]);
  });

  // 복구는 '아직 안 붙은' 상태에서만 의미가 있다.
  it('recover 액션은 awaiting_pg_template 밖에서는 나오지 않는다', () => {
    const others = [
      'sent',
      'in_progress',
      'completed',
      'declined',
      'expired',
      'canceled',
      'send_failed',
    ] as const;
    for (const st of others) {
      for (const side of ['pg', 'buyer'] as const) {
        const v = buildSigningCardView(view(st), side);
        expect(v.actions.map((a) => a.id)).not.toContain('recover');
      }
    }
  });

  it('in_progress — 발송·참여자·완료 노드를 순서대로 만든다', () => {
    const v = buildSigningCardView(
      view('in_progress', [
        part('buyer', 'signed', { signedAt: '2026-07-20T06:10:00Z' }),
        part('pg', 'pending'),
      ]),
      'buyer',
    );
    expect(v.nodes.map((n) => n.kind)).toEqual(['milestone', 'person', 'person', 'milestone']);
    expect(v.nodes[0]).toMatchObject({ key: 'sent', state: 'done', at: '2026-07-20T05:02:00Z' });
    expect(v.nodes[1]).toMatchObject({ state: 'done', at: '2026-07-20T06:10:00Z', initial: '김' });
    expect(v.nodes[1].chip).toEqual({ color: 'tertiary', label: '서명 완료' });
    expect(v.nodes[2]).toMatchObject({ state: 'pending' });
    expect(v.nodes[2].chip).toEqual({ color: 'surface', label: '서명 대기' });
    expect(v.nodes[3]).toMatchObject({ key: 'done', state: 'pending' });
    expect(v.actions.map((a) => a.id)).toEqual(['remind', 'cancel']);
  });

  it('in_progress — viewed 참여자는 "열람함" 칩과 active 상태를 받는다', () => {
    const v = buildSigningCardView(
      view('in_progress', [part('buyer', 'viewed'), part('pg', 'pending')]),
      'buyer',
    );
    expect(v.nodes[1]).toMatchObject({ state: 'active' });
    expect(v.nodes[1].chip).toEqual({ color: 'primary', label: '열람함' });
  });

  it('completed — 전 노드 완료 + 문서 2개', () => {
    const v = buildSigningCardView(
      view('completed', [
        part('buyer', 'signed', { signedAt: '2026-07-20T06:10:00Z' }),
        part('pg', 'signed', { signedAt: '2026-07-21T01:24:00Z' }),
      ]),
      'pg',
    );
    expect(v.nodes.every((n) => n.state === 'done')).toBe(true);
    expect(v.nodes[3].at).toBe('2026-07-21T01:24:00Z');
    expect(v.docs.map((d) => d.id)).toEqual(['document', 'audit']);
    expect(v.actions).toEqual([]);
  });

  it('declined — 거절 참여자와 종결 노드가 failed', () => {
    const v = buildSigningCardView(
      view('declined', [part('buyer', 'signed'), part('pg', 'rejected')]),
      'buyer',
    );
    expect(v.chip).toEqual({ color: 'error', label: '서명 거절' });
    expect(v.nodes[2]).toMatchObject({ state: 'failed' });
    expect(v.nodes[2].chip).toEqual({ color: 'error', label: '거절' });
    expect(v.nodes[3]).toMatchObject({ key: 'terminal', state: 'failed' });
    expect(v.actions).toEqual([
      {
        id: 'resend',
        label: '다시 발송',
        variant: 'filled',
        okMsg: '다시 발송했어요',
        failMsg: '다시 발송하지 못했어요',
      },
    ]);
  });

  it('expired·canceled — 미서명 참여자 칩이 "서명 안 함"', () => {
    for (const status of ['expired', 'canceled'] as const) {
      const v = buildSigningCardView(view(status, bothPending), 'buyer');
      expect(v.nodes[1].chip, status).toEqual({ color: 'surface', label: '서명 안 함' });
    }
  });

  it('canceled — 종결 노드는 중립 종결(ended) + 취소 시각', () => {
    const v = buildSigningCardView(view('canceled', bothPending), 'buyer');
    expect(v.chip).toEqual({ color: 'surface', label: '서명 취소' });
    expect(v.nodes[3]).toMatchObject({
      key: 'terminal',
      state: 'ended',
      at: '2026-07-20T08:05:00Z',
    });
  });

  it('expired — 칩 라벨이 능동형 용어집 표현을 쓴다', () => {
    const v = buildSigningCardView(view('expired', bothPending), 'buyer');
    expect(v.chip).toEqual({ color: 'error', label: '서명 기한 지남' });
  });

  it('expired — 종결 노드가 만료 시각(expiresAt)을 담는다', () => {
    const v = buildSigningCardView(view('expired', bothPending), 'buyer');
    expect(v.nodes[3]).toMatchObject({
      key: 'terminal',
      state: 'failed',
      at: '2026-07-27T05:02:00Z',
    });
  });

  it('canceled — 발송 전(참여자 0, sentAt 없음) 취소도 4노드이고 발송 사실을 주장하지 않는다', () => {
    const neverSent: SigningView = {
      contract: {
        id: 'c1',
        rfpId: 'r1',
        status: 'canceled',
        round: 1,
        createdBy: 'u',
        createdAt: '2026-07-20T04:40:00Z',
        canceledAt: '2026-07-20T08:05:00Z',
      },
      participants: [],
    };
    const v = buildSigningCardView(neverSent, 'buyer');
    expect(v.nodes).toHaveLength(4);
    expect(v.nodes[0]).toMatchObject({ key: 'awarded', label: '견적을 선정했어요' });
    expect(v.nodes[0].label).not.toMatch(/보냈어요/);
    expect(v.nodes[1]).toMatchObject({ key: 'sign', state: 'pending' });
    expect(v.nodes[2]).toMatchObject({ key: 'done', state: 'pending' });
    expect(v.nodes[3]).toMatchObject({ key: 'terminal', state: 'ended', at: '2026-07-20T08:05:00Z' });
  });

  it('canceled — 발송 전 취소(pg)는 첫 노드 라벨이 "이 견적이 선정됐어요"다', () => {
    const neverSent: SigningView = {
      contract: {
        id: 'c1',
        rfpId: 'r1',
        status: 'canceled',
        round: 1,
        createdBy: 'u',
        createdAt: '2026-07-20T04:40:00Z',
        canceledAt: '2026-07-20T08:05:00Z',
      },
      participants: [],
    };
    const v = buildSigningCardView(neverSent, 'pg');
    expect(v.nodes[0].label).toBe('이 견적이 선정됐어요');
  });

  it('send_failed — 발송 노드가 failed, 다시 시작 액션', () => {
    const v = buildSigningCardView(view('send_failed'), 'buyer');
    expect(v.nodes[1]).toMatchObject({ key: 'send', state: 'failed' });
    expect(v.actions).toEqual([
      {
        id: 'resend',
        label: '다시 시작',
        variant: 'filled',
        okMsg: '다시 시작했어요',
        failMsg: '다시 시작하지 못했어요',
      },
    ]);
  });

  it('send_failed — 안내 문구가 declined/expired 와 같은 실패-재보증 문구를 쓴다', () => {
    const v = buildSigningCardView(view('send_failed'), 'buyer');
    expect(v.note).toBe('선정 결과는 그대로예요.');
  });

  it('send_failed — 다시 시작 액션의 토스트 문구는 "시작" 어휘를 쓴다', () => {
    const v = buildSigningCardView(view('send_failed'), 'buyer');
    const resend = v.actions.find((a) => a.id === 'resend');
    expect(resend).toMatchObject({
      okMsg: '다시 시작했어요',
      failMsg: '다시 시작하지 못했어요',
    });
  });

  it('declined — 다시 발송 액션의 토스트 문구는 "발송" 어휘를 쓴다', () => {
    const v = buildSigningCardView(
      view('declined', [part('buyer', 'signed'), part('pg', 'rejected')]),
      'buyer',
    );
    const resend = v.actions.find((a) => a.id === 'resend');
    expect(resend).toMatchObject({
      okMsg: '다시 발송했어요',
      failMsg: '다시 발송하지 못했어요',
    });
  });

  it('알 수 없는 상태 — 서버가 새 status 를 내려도 안전한 대체 뷰를 돌려준다(4노드, 액션 없음)', () => {
    const bogusStatus = 'bogus_future_status' as unknown as SigningContractStatus;
    const v = buildSigningCardView(view(bogusStatus, bothPending), 'buyer');
    expect(v.tone).toBe('surface');
    expect(v.icon).toBe('slash');
    expect(v.chip).toEqual({ color: 'surface', label: '상태 확인 필요' });
    expect(v.title).toBe('전자서명 상태를 불러오지 못했어요');
    expect(v.description).toBe('화면을 새로고침해도 그대로면 문의해 주세요.');
    expect(v.docs).toEqual([]);
    expect(v.actions).toEqual([]);
    expect(v.note).toBe('선정 결과는 그대로예요.');
    expect(v.nodes).toHaveLength(4);
  });
});

describe('buildSigningSummary', () => {
  it('진행 중이면 서명 수를 함께 돌려준다', () => {
    const s = buildSigningSummary(
      view('in_progress', [part('buyer', 'signed'), part('pg', 'pending')]),
      'buyer',
    );
    expect(s).toEqual({ label: '서명 진행 중', dot: 'primary', signed: 1, total: 2 });
  });

  it('진행 중이 아니면 개수 없이 상태 라벨만', () => {
    expect(buildSigningSummary(view('completed'), 'buyer')).toEqual({
      label: '서명 완료',
      dot: 'tertiary',
    });
    expect(buildSigningSummary(view('awaiting_pg_template'), 'pg')).toEqual({
      label: '계약서 보내기 전',
      dot: 'warning',
    });
  });
});

describe('nodeStatusLabel', () => {
  it('노드 상태마다 한국어 상태어를 준다', () => {
    expect(nodeStatusLabel('done')).toBe('완료');
    expect(nodeStatusLabel('active')).toBe('진행 중');
    expect(nodeStatusLabel('pending')).toBe('대기');
    expect(nodeStatusLabel('failed')).toBe('실패');
    expect(nodeStatusLabel('ended')).toBe('종료');
  });

  it('상태어가 서로 겹치지 않는다 — 겹치면 색을 못 보는 사용자가 단계를 구별할 수 없다', () => {
    const states: SigningNodeState[] = ['done', 'active', 'pending', 'failed', 'ended'];
    const labels = states.map(nodeStatusLabel);
    expect(new Set(labels).size).toBe(states.length);
  });
});

describe('buildSigningCardView — awaiting 발송 임베드 (PG 전용)', () => {
  const awaiting = () => view('awaiting_pg_template');

  // 재사용 템플릿이 없어졌다 — 픽커도, '등록했는가' 분기도 함께 사라졌다.
  // 템플릿이 사라져 '등록했는가'로 갈리던 분기는 없다 — 올리기는 언제나 같은 한 개다.
  // (v0.4.38.0 부터 이미 보낸 사람을 위한 보조 액션이 뒤에 하나 붙는다.)
  it('PG 는 선택기 없이 같은 업로드 액션을 받는다', () => {
    const v = buildSigningCardView(awaiting(), 'pg');
    expect(v.actions[0]).toEqual({
      id: 'upload',
      label: '계약서 올리기',
      variant: 'filled',
      okMsg: '계약서를 보냈어요',
      failMsg: '계약서를 보내지 못했어요',
    });
    expect(v.actions.map((a) => a.id)).toEqual(['upload', 'recover']);
  });

  // 봉인 경계 — 구매사에게는 계약서를 다루는 어떤 조작도 노출되지 않는다.
  it('구매사에게는 어떤 액션도 만들지 않는다', () => {
    const v = buildSigningCardView(awaiting(), 'buyer');
    expect(v.actions).toEqual([]);
    expect(v.title).toBe('PG사가 계약서를 준비하고 있어요');
  });

  // buildSigningSummary 가 같은 함수로 카드뷰를 다시 만든다 — 칩이 갈리면
  // 요약 스트립과 카드가 어긋난다.
  it('PG awaiting 칩 라벨은 한 가지뿐이다', () => {
    expect(buildSigningCardView(awaiting(), 'pg').chip).toEqual({
      color: 'warning',
      label: '계약서 보내기 전',
    });
  });

  // 자동 발송이 사라졌으므로 구매사에게 '자동으로'라고 말하면 거짓말이 된다.
  it('구매사 안내에서 자동 발송 표현을 쓰지 않는다', () => {
    const v = buildSigningCardView(awaiting(), 'buyer');
    expect(v.description).not.toContain('자동');
  });

  // 연결된 템플릿(quote-templates 재사용)이 있으면 임베드 없이 바로 보낼 수 있는
  // 지름길이 업로드 앞에 붙는다 — 주 동작 자리를 지켜야 하므로 순서가 중요하다.
  it('연결된 템플릿이 있으면 sendFromTemplate 액션이 업로드 앞에 온다', () => {
    const v = buildSigningCardView(awaiting(), 'pg', { linkedTemplateName: '표준 계약서' });
    expect(v.actions.map((a) => a.id)).toEqual(['sendFromTemplate', 'upload', 'recover']);
    expect(v.actions[0]).toMatchObject({ label: '연결된 템플릿으로 보내기' });
  });

  // primary(filled)는 한 번에 하나만 — 템플릿이 연결되면 그쪽이 권장 경로이므로
  // 업로드는 outlined 로 물러난다. 어느 쪽을 눌러야 할지 시각 위계가 없으면
  // filled 두 개가 나란히 서서 사용자가 고민하게 된다.
  it('연결된 템플릿이 있으면 sendFromTemplate 만 filled 이고 업로드는 outlined 로 물러난다', () => {
    const v = buildSigningCardView(awaiting(), 'pg', { linkedTemplateName: '표준 계약서' });
    expect(v.actions.find((a) => a.id === 'sendFromTemplate')).toMatchObject({ variant: 'filled' });
    expect(v.actions.find((a) => a.id === 'upload')).toMatchObject({ variant: 'outlined' });
  });

  // 카드 설명도 지름길의 존재를 말해야 한다 — 버튼만 있고 문구가 "올리고 보내요"만
  // 말하면 버튼과 설명이 서로 다른 이야기를 한다. 템플릿 이름을 그대로 보여줘
  // 어떤 계약서가 나가는지 클릭 전에 알 수 있게 한다.
  it('연결된 템플릿이 있으면 PG 카드 설명이 템플릿 이름을 언급한다', () => {
    const v = buildSigningCardView(awaiting(), 'pg', { linkedTemplateName: '표준 계약서' });
    expect(v.description).toContain('표준 계약서');
  });

  it('연결된 템플릿이 없으면 기존 업로드/찾기 액션만 유지된다(업로드가 filled)', () => {
    const v = buildSigningCardView(awaiting(), 'pg');
    expect(v.actions.map((a) => a.id)).toEqual(['upload', 'recover']);
    expect(v.actions.find((a) => a.id === 'upload')).toMatchObject({ variant: 'filled' });
  });

  // 봉인 경계는 opts 로도 뚫리지 않는다 — 구매사에게는 어떤 액션도 없다.
  it('구매사는 연결된 템플릿이 있어도 액션이 생기지 않는다', () => {
    const v = buildSigningCardView(awaiting(), 'buyer', { linkedTemplateName: '표준 계약서' });
    expect(v.actions).toEqual([]);
  });
});
