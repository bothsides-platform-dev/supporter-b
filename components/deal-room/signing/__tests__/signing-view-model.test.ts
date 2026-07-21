import { describe, it, expect } from 'vitest';

import { buildSigningCardView, buildSigningSummary } from '../signing-view-model';
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
    },
    participants,
  };
}

const bothPending = [part('buyer', 'pending'), part('pg', 'pending')];

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
    expect(v.chip).toEqual({ color: 'warning', label: '계약서 준비 중' });
    expect(v.actions).toEqual([]);
    expect(v.nodes[1]).toMatchObject({ key: 'prepare', state: 'active' });
  });

  it('awaiting_pg_template — PG는 등록 CTA를 받는다', () => {
    const v = buildSigningCardView(view('awaiting_pg_template'), 'pg');
    expect(v.title).toBe('계약서 템플릿을 등록해 주세요');
    expect(v.chip).toEqual({ color: 'warning', label: '등록 필요' });
    expect(v.actions).toEqual([
      { id: 'template', label: '서명 템플릿 등록하기', variant: 'filled' },
    ]);
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
    expect(v.nodes[2]).toMatchObject({ state: 'failed' });
    expect(v.nodes[2].chip).toEqual({ color: 'error', label: '거절' });
    expect(v.nodes[3]).toMatchObject({ key: 'terminal', state: 'failed' });
    expect(v.actions).toEqual([{ id: 'resend', label: '다시 발송', variant: 'filled' }]);
  });

  it('expired·canceled — 미서명 참여자 칩이 "서명 안 함"', () => {
    for (const status of ['expired', 'canceled'] as const) {
      const v = buildSigningCardView(view(status, bothPending), 'buyer');
      expect(v.nodes[1].chip, status).toEqual({ color: 'surface', label: '서명 안 함' });
    }
  });

  it('canceled — 종결 노드는 중립 종결(ended) + 취소 시각', () => {
    const v = buildSigningCardView(view('canceled', bothPending), 'buyer');
    expect(v.nodes[3]).toMatchObject({
      key: 'terminal',
      state: 'ended',
      at: '2026-07-20T08:05:00Z',
    });
  });

  it('send_failed — 발송 노드가 failed, 다시 시작 액션', () => {
    const v = buildSigningCardView(view('send_failed'), 'buyer');
    expect(v.nodes[1]).toMatchObject({ key: 'send', state: 'failed' });
    expect(v.actions).toEqual([{ id: 'resend', label: '다시 시작', variant: 'filled' }]);
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
      label: '등록 필요',
      dot: 'warning',
    });
  });
});
