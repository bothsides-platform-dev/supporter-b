/**
 * 전자서명 카드의 상태 파생 — (SigningView, side) → 렌더 입력.
 *
 * 상태 × 역할 조합의 진실은 전부 여기 모인다. 렌더 컴포넌트(SigningTab /
 * SigningTimeline / SigningSummaryStrip)는 결과를 그리기만 한다. DOM·React 의존이
 * 없으므로 8개 상태 × 2역할 매트릭스를 단위 테스트로 못박을 수 있다.
 */
import type { ChipColor } from '@/components/primitives/Chip';
import type { SigningContract, SigningParticipant, SigningView } from '@/lib/types/signing';

export type SigningSide = 'buyer' | 'pg';
/**
 * done/failed/ended 는 이미 일어난 일에 붙는 종결류 상태 — `at`(시각)이 실릴 수
 * 있지만 모든 인스턴스가 갖는 건 아니다(예: declined 종결 노드나 rejected 참여자는
 * `at` 없이도 종결/실패로 칠해진다). pending/active 는 아직 오지 않은 단계라 `at`이
 * 없다. ended 는 실패도 완료도 아닌 중립 종결(취소)이다.
 */
export type SigningNodeState = 'done' | 'active' | 'pending' | 'failed' | 'ended';
export type SigningIcon = 'clock' | 'alert' | 'pen' | 'check' | 'x' | 'slash';
export type SigningActionId = 'remind' | 'cancel' | 'resend' | 'template';

export type SigningNode = {
  key: string;
  /** milestone = 10px 점, person = 28px 이니셜 디스크. */
  kind: 'milestone' | 'person';
  label: string;
  /** 사람 노드의 역할, 마일스톤의 한 줄 설명. */
  detail?: string;
  /** 사람 노드의 이메일·인증수단 보조 줄. */
  sub?: string;
  state: SigningNodeState;
  chip?: { color: ChipColor; label: string };
  /** ISO 8601 — 렌더 쪽에서 LocalTime 으로 표시. */
  at?: string;
  initial?: string;
};

export type SigningAction = {
  id: SigningActionId;
  label: string;
  variant: 'filled' | 'outlined' | 'text';
  danger?: boolean;
  /** 실행 결과 토스트 — 버튼 라벨과 일관된 문구를 뷰모델이 소유한다. */
  okMsg?: string;
  failMsg?: string;
};

export type SigningDoc = { id: 'document' | 'audit'; title: string; caption: string };

export type SigningCardView = {
  icon: SigningIcon;
  /** 헤더 아이콘 색 계열 — Chip 색과 같은 어휘를 쓴다. */
  tone: ChipColor;
  title: string;
  description: string;
  chip: { color: ChipColor; label: string };
  /** 항상 4개 — 시작 → 사람/단계 → 사람/단계 → 종결. */
  nodes: SigningNode[];
  docs: SigningDoc[];
  actions: SigningAction[];
  note: string;
};

const roleLabel = (r: SigningParticipant['role']) => (r === 'buyer' ? '구매사' : 'PG');
const securityLabel = (m: SigningParticipant['securityMethod']) =>
  m === 'easy_cert' ? '휴대폰 간편인증' : '이메일 인증';

function personState(p: SigningParticipant): SigningNodeState {
  switch (p.status) {
    case 'signed':
      return 'done';
    case 'viewed':
      return 'active';
    case 'rejected':
      return 'failed';
    default:
      return 'pending';
  }
}

function personChip(
  p: SigningParticipant,
  unsignedLabel: string,
): { color: ChipColor; label: string } {
  switch (p.status) {
    case 'signed':
      return { color: 'tertiary', label: '서명 완료' };
    case 'viewed':
      return { color: 'primary', label: '열람함' };
    case 'rejected':
      return { color: 'error', label: '거절' };
    default:
      return { color: 'surface', label: unsignedLabel };
  }
}

function personNodes(
  participants: SigningParticipant[],
  unsignedLabel: string,
): SigningNode[] {
  return participants.map((p) => ({
    key: p.id,
    kind: 'person' as const,
    label: p.name,
    detail: roleLabel(p.role),
    sub: `${p.email} · ${securityLabel(p.securityMethod)}`,
    state: personState(p),
    chip: personChip(p, unsignedLabel),
    at: p.signedAt,
    initial: p.name.slice(0, 1),
  }));
}

/** declined/expired/canceled 공통 "다시 발송" 액션 — 세 분기가 동일한 문구를 쓴다. */
const RESEND_ACTION: SigningAction = {
  id: 'resend',
  label: '다시 발송',
  variant: 'filled',
  okMsg: '다시 발송했어요',
  failMsg: '다시 발송하지 못했어요',
};

/** send_failed 전용 "다시 시작" 액션 — resend 와 id 는 같지만 문구가 다르다. */
const RESTART_ACTION: SigningAction = {
  id: 'resend',
  label: '다시 시작',
  variant: 'filled',
  okMsg: '다시 시작했어요',
  failMsg: '다시 시작하지 못했어요',
};

/** declined/expired/send_failed 공통 안내 — 선정 결과는 서명과 무관하게 유지됨(canceled 는 문구가 달라 별도). */
const AWARD_UNCHANGED_NOTE = '선정 결과는 그대로예요.';

/** 참여자가 아직 없는 상태(awaiting/send_failed)의 자리지기 2노드. */
function placeholderPair(): SigningNode[] {
  return [
    { key: 'sign', kind: 'milestone', label: '양측 서명', state: 'pending' },
    { key: 'done', kind: 'milestone', label: '계약 완료', state: 'pending' },
  ];
}

function sentNode(contract: SigningContract): SigningNode {
  return {
    key: 'sent',
    kind: 'milestone',
    label: '서명 요청을 보냈어요',
    state: 'done',
    at: contract.sentAt,
  };
}

/** 아직 발송 전(awaiting/send_failed)의 첫 노드 — 선정 사실. */
function awardedNode(contract: SigningContract, isPg: boolean): SigningNode {
  return {
    key: 'awarded',
    kind: 'milestone',
    label: isPg ? '이 견적이 선정됐어요' : '견적을 선정했어요',
    state: 'done',
    at: contract.createdAt,
  };
}

/**
 * 발송 후 상태(declined/expired/canceled 등)의 첫 노드 — 정상 경로는 발송 사실
 * (sentNode)이지만, 발송 전(awaiting_pg_template)에 취소된 계약처럼 sentAt 이
 * 없는 경우엔 "보냈어요"를 주장하지 않고 선정 사실(awardedNode)로 대체한다.
 */
function openingNode(contract: SigningContract, isPg: boolean): SigningNode {
  return contract.sentAt ? sentNode(contract) : awardedNode(contract, isPg);
}

/** 참여자가 있으면 실제 참여자 노드, 없으면(발송 전 취소 등) 자리지기 2노드. */
function participantOrPlaceholderNodes(
  participants: SigningParticipant[],
  unsignedLabel: string,
): SigningNode[] {
  return participants.length === 0 ? placeholderPair() : personNodes(participants, unsignedLabel);
}

export function buildSigningCardView(signing: SigningView, side: SigningSide): SigningCardView {
  const { contract, participants } = signing;
  const isPg = side === 'pg';

  switch (contract.status) {
    case 'awaiting_pg_template':
      return {
        icon: isPg ? 'alert' : 'clock',
        tone: 'warning',
        title: isPg ? '계약서 템플릿을 등록해 주세요' : 'PG사가 계약서를 준비하고 있어요',
        description: isPg
          ? '등록하는 즉시 이 계약의 서명이 자동으로 시작돼요.'
          : '준비되면 자동으로 양측에 서명 링크가 발송돼요.',
        chip: { color: 'warning', label: isPg ? '계약서 등록 필요' : 'PG사가 계약서 준비 중' },
        nodes: [
          awardedNode(contract, isPg),
          {
            key: 'prepare',
            kind: 'milestone',
            label: isPg ? '계약서 등록' : '계약서 준비',
            detail: isPg
              ? '자사 계약서를 한 번만 등록하면 다음 선정부터도 자동으로 쓰여요'
              : 'PG사가 계약서를 등록하는 단계예요',
            state: 'active',
          },
          ...placeholderPair(),
        ],
        docs: [],
        actions: isPg
          ? [{ id: 'template', label: '서명 템플릿 등록하기', variant: 'filled' }]
          : [],
        note: isPg
          ? '서명칸 배치는 스노우싸인 화면에서 이뤄져요.'
          : '선정은 이미 확정됐어요 — 서명 준비와 무관하게 유지돼요.',
      };

    case 'sent':
    case 'in_progress':
      return {
        icon: 'pen',
        tone: 'primary',
        title: '서명을 기다리는 중이에요',
        description: '양측 담당자에게 이메일로 서명 링크를 보냈어요.',
        chip: { color: 'primary', label: '서명 진행 중' },
        nodes: [
          sentNode(contract),
          ...personNodes(participants, '서명 대기'),
          { key: 'done', kind: 'milestone', label: '계약 완료', state: 'pending' },
        ],
        docs: [],
        actions: [
          {
            id: 'remind',
            label: '리마인더 보내기',
            variant: 'outlined',
            okMsg: '리마인더를 보냈어요',
            failMsg: '리마인더를 보내지 못했어요',
          },
          {
            id: 'cancel',
            label: '취소',
            variant: 'text',
            danger: true,
            okMsg: '전자서명을 취소했어요',
            failMsg: '취소하지 못했어요',
          },
        ],
        note: '서명은 이메일 링크의 스노우싸인 페이지에서 진행돼요.',
      };

    case 'completed':
      return {
        icon: 'check',
        tone: 'tertiary',
        title: '모든 서명이 완료됐어요',
        description: '양측 서명이 끝났어요. 완료본을 내려받을 수 있어요.',
        chip: { color: 'tertiary', label: '서명 완료' },
        nodes: [
          sentNode(contract),
          ...personNodes(participants, '서명 대기'),
          {
            key: 'done',
            kind: 'milestone',
            label: '계약 완료',
            state: 'done',
            at: contract.completedAt,
          },
        ],
        docs: [
          { id: 'document', title: '계약서', caption: '양측 서명이 담긴 완료본 PDF' },
          { id: 'audit', title: '감사추적인증서', caption: '열람·서명 이력과 타임스탬프' },
        ],
        actions: [],
        note: '다운로드 링크는 열 때마다 새로 발급돼요.',
      };

    case 'declined':
      return {
        icon: 'x',
        tone: 'error',
        title: '서명이 거절됐어요',
        description: '조건을 다시 맞춘 뒤 새로 발송할 수 있어요.',
        chip: { color: 'error', label: '서명 거절' },
        nodes: [
          openingNode(contract, isPg),
          ...participantOrPlaceholderNodes(participants, '서명 안 함'),
          { key: 'terminal', kind: 'milestone', label: '서명이 중단됐어요', state: 'failed' },
        ],
        docs: [],
        actions: [RESEND_ACTION],
        note: AWARD_UNCHANGED_NOTE,
      };

    case 'expired':
      return {
        icon: 'clock',
        tone: 'error',
        title: '서명 기한이 지났어요',
        description: '서명 링크가 만료됐어요. 다시 발송하면 새 링크가 나가요.',
        chip: { color: 'error', label: '서명 기한 지남' },
        nodes: [
          openingNode(contract, isPg),
          ...participantOrPlaceholderNodes(participants, '서명 안 함'),
          {
            key: 'terminal',
            kind: 'milestone',
            label: '기한이 지났어요',
            state: 'failed',
            at: contract.expiresAt,
          },
        ],
        docs: [],
        actions: [RESEND_ACTION],
        note: AWARD_UNCHANGED_NOTE,
      };

    case 'canceled':
      return {
        icon: 'slash',
        tone: 'surface',
        title: '전자서명이 취소됐어요',
        description: '진행 중이던 서명이 중단됐어요.',
        chip: { color: 'surface', label: '서명 취소' },
        nodes: [
          openingNode(contract, isPg),
          ...participantOrPlaceholderNodes(participants, '서명 안 함'),
          {
            key: 'terminal',
            kind: 'milestone',
            label: '취소했어요',
            state: 'ended',
            at: contract.canceledAt,
          },
        ],
        docs: [],
        actions: [RESEND_ACTION],
        note: '필요하면 다시 발송할 수 있어요.',
      };

    case 'send_failed':
      return {
        icon: 'alert',
        tone: 'error',
        title: '전자서명을 시작하지 못했어요',
        description: '전자서명 서비스에 일시적인 문제가 있었어요.',
        chip: { color: 'error', label: '시작 실패' },
        nodes: [
          awardedNode(contract, isPg),
          {
            key: 'send',
            kind: 'milestone',
            label: '서명 발송',
            detail: '발송에 실패했어요',
            state: 'failed',
          },
          ...placeholderPair(),
        ],
        docs: [],
        actions: [RESTART_ACTION],
        note: AWARD_UNCHANGED_NOTE,
      };

    default: {
      // 컴파일 타임 소진성 체크 — 8개 상태를 전부 처리했으므로 이 분기의 status 는
      // 이론상 `never`다. 유니온에 새 상태가 추가되고 위 case 들이 갱신되지 않으면
      // 여기서 타입 에러가 나 빌드가 깨진다(런타임 폴백은 별개로 계속 동작).
      const _exhaustive: never = contract.status;
      console.error(`buildSigningCardView: unhandled signing contract status "${String(_exhaustive)}"`);
      return {
        icon: 'slash',
        tone: 'surface',
        title: '전자서명 상태를 불러오지 못했어요',
        description: '화면을 새로고침해도 그대로면 문의해 주세요.',
        chip: { color: 'surface', label: '상태 확인 필요' },
        nodes: [
          { key: 'unknown-1', kind: 'milestone', label: '상태 확인 필요', state: 'pending' },
          { key: 'unknown-2', kind: 'milestone', label: '상태 확인 필요', state: 'pending' },
          { key: 'unknown-3', kind: 'milestone', label: '상태 확인 필요', state: 'pending' },
          { key: 'unknown-4', kind: 'milestone', label: '상태 확인 필요', state: 'pending' },
        ],
        docs: [],
        actions: [],
        note: '선정 결과는 그대로예요.',
      };
    }
  }
}

/** 요약 스트립·레일 도트용 축약. 진행 중일 때만 서명 수를 함께 준다. */
export function buildSigningSummary(
  signing: SigningView,
  side: SigningSide,
): { label: string; dot: ChipColor; signed?: number; total?: number } {
  const { chip } = buildSigningCardView(signing, side);
  const status = signing.contract.status;
  if (status === 'sent' || status === 'in_progress') {
    return {
      label: chip.label,
      dot: chip.color,
      signed: signing.participants.filter((p) => p.status === 'signed').length,
      total: signing.participants.length,
    };
  }
  return { label: chip.label, dot: chip.color };
}
