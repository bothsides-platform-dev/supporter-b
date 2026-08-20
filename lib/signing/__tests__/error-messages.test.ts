import { describe, expect, it } from 'vitest';

import { SIGNING_ERROR_MESSAGES, signingErrorMessage } from '../error-messages';

// 코드 목록을 손으로 복사하지 않는다 — 맵의 키를 그대로 훑는다. (예전엔 복사본이라
// 신규 코드가 검증 없이 추가돼도 초록이었다.)
const KNOWN_CODES = Object.keys(SIGNING_ERROR_MESSAGES);

// 화면이 실제로 띄우는 경로들 — 맵에서 사라지면 사용자에게 raw 코드가 샌다.
const REQUIRED_CODES = [
  'CONTRACT_BUSY',
  'CONTRACT_NOT_SENT',
  'PROVIDER_CONTRACT_TAKEN',
  'SEND_HELD_BY_TEAMMATE',
  'SEND_TAKEN_OVER',
  'SNOWSIGN_EMBED_SESSION_ACTIVE',
  'FORBIDDEN',
  'ALREADY_SENT',
  // 템플릿 발송 경로(sendFromTemplate)가 실제로 반환하는 코드들 — 미등록이면 일반
  // 폴백으로 떨어져 사용자가 원인(연결 끊김·담당자 탈퇴 등)을 알 수 없다.
  'NO_LINKED_TEMPLATE',
  'CONTACT_NOT_FOUND',
  'SEND_FAILED',
  'TEMPLATE_NOT_FOUND',
  // 조항형/PDF 두 종류가 한 테이블에 살아 id 하나로 어느 경로든 부를 수 있다 —
  // 종류 게이트가 돌려주는 코드가 미등록이면 사용자는 raw 코드를 본다.
  'TEMPLATE_KIND_MISMATCH',
  // 조항형 발송 경로가 내는 세 코드. `COMPOSE_UNSUPPORTED_CHARACTER` 가 특히 중요하다 —
  // "한자를 바꿔 주세요"라고 알려 주는 **유일한** 문구라, 빠지면 사용자는 무엇을
  // 고쳐야 하는지 모르는 채 일반 실패 문구만 본다.
  'COMPOSE_DOCUMENT_INVALID',
  'COMPOSE_RENDER_FAILED',
  'COMPOSE_UNSUPPORTED_CHARACTER',
  // 에디터 저장 검증이 돌려준다 — 이 코드가 빠져 있던 동안에는 서명칸을 빼먹은
  // 사용자가 "저장하지 못했어요"만 보고 무엇을 고쳐야 하는지 알 수 없었다.
  'MISSING_SIGNABLE_FIELD',
  // 수정 진입(getDetail)이 돌려준다 — 콘솔에서 직접 만든 stamp 등 우리 에디터가
  // 다루지 못하는 필드가 있으면 조용히 버리는 대신 전체를 거부한다.
  'TEMPLATE_UNSUPPORTED',
  // 템플릿 저장 경로가 실제로 돌려주는 코드들 — 미등록이면 일반 폴백("템플릿을
  // 저장하지 못했어요")로 떨어져 10분 TTL 만료·설정 문제·권한 문제가 전부 같은
  // 문장으로 뭉개진다.
  'UPLOAD_SESSION_EXPIRED',
  'SIGNING_MISCONFIGURED',
  'FORBIDDEN_PG',
];

describe('signingErrorMessage', () => {
  it('maps every known code to a friendly Korean message with no raw-code token', () => {
    for (const code of KNOWN_CODES) {
      const msg = signingErrorMessage(code);
      expect(msg).not.toBe(code);
      expect(msg).toMatch(/[가-힣]/); // 한글 포함
      expect(msg).not.toMatch(/[A-Z]{3,}_[A-Z]/); // raw 코드 흔적 없음
    }
  });

  it('keeps the codes the signing UI actually raises', () => {
    for (const code of REQUIRED_CODES) expect(KNOWN_CODES).toContain(code);
  });

  // 문구는 원인만 말하고 끝나면 안 된다(UX_WRITING §에러: 무엇이 문제인지 + 어떻게
  // 해결하는지) — 템플릿을 쓸 수 없으면 대안 경로(계약서를 직접 올리기)를 알려줘야
  // 한다. 문구 자체가 아니라 **대안 경로가 남아 있는지**를 못박는다(정확한 문장을
  // 박으면 UX 라이팅 손질마다 빨개진다).
  it('템플릿을 쓸 수 없는 코드들은 계약서 직접 발송이라는 대안 경로를 안내한다', () => {
    for (const code of ['NO_LINKED_TEMPLATE', 'TEMPLATE_NOT_FOUND']) {
      expect(signingErrorMessage(code)).toMatch(/직접 올려/);
    }
  });

  // 세션 만료는 "무엇이 문제인지"(유효 시간 경과)와 "어떻게 해결하는지"(다시 저장 →
  // 재업로드)를 함께 말해야 한다 — 일반 폴백이면 사용자는 같은 저장을 반복하며 헤맨다.
  it('UPLOAD_SESSION_EXPIRED 는 시간 경과 원인과 다시-저장 경로를 함께 안내한다', () => {
    const msg = signingErrorMessage('UPLOAD_SESSION_EXPIRED');
    expect(msg).toMatch(/시간이 지났어요/);
    expect(msg).toMatch(/다시 저장/);
  });

  it('returns the provided fallback for an unknown code (never the raw code)', () => {
    expect(signingErrorMessage('SOME_WEIRD_CODE', '리마인더를 보내지 못했어요')).toBe(
      '리마인더를 보내지 못했어요',
    );
    expect(signingErrorMessage('SOME_WEIRD_CODE')).toMatch(/[가-힣]/);
    expect(signingErrorMessage('SOME_WEIRD_CODE')).not.toMatch(/SOME_WEIRD_CODE/);
  });

  it('returns the fallback (or a generic Korean message) when code is undefined', () => {
    expect(signingErrorMessage(undefined, '저장하지 못했어요')).toBe('저장하지 못했어요');
    expect(signingErrorMessage(undefined)).toMatch(/[가-힣]/);
  });
});
