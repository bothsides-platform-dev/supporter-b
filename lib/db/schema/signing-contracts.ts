import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { signingContractStatusEnum } from './_enums';
import { rfps } from './rfps';
import { users } from './users';

/**
 * 선정 후 전자서명 계약 1건(SnowSign Templates 기반). 레거시 `contracts`(선정 기록)와
 * 별개·불변. `provider_ref` = SnowSign contract_id(생성 후 세팅), `snowsign_template_id` =
 * 사용한 PG 템플릿. SnowSign 웹훅(저지연 트리거) + 폴링(백스톱)으로 상태 동기화.
 */
export const signingContracts = pgTable(
  'signing_contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rfpId: uuid('rfp_id')
      .notNull()
      .references(() => rfps.id, { onDelete: 'cascade' }),
    providerRef: text('provider_ref'),
    /**
     * 발송 **전** 초안의 출처(`'template' | 'compose'`). `provider_ref` 는 세 경로가
     * 공유하는 슬롯이라, 이 값 없이는 재사용 시점에 "이 초안이 내 것인가"를 물을 수
     * 없다 — 그 상태에서 템플릿 버튼이 compose 초안을 재사용하면 **다른 계약서**가
     * 발송된다. `bindDraftRef` 가 `provider_ref` 와 원자적으로 쓰는 것이 유일한 경로다.
     *
     * NULL = 이 기능 이전의 행 → **재사용 불가**(fail-closed). 없는 값을 신뢰로 읽는
     * 것이 v0.4.50.0 fail-open 의 모양이었다.
     *
     * 발송 **후** 바인딩(임베드)은 이 값을 안 쓴다 — `markSentIfAwaiting` 이 같은
     * UPDATE 로 awaiting 을 떠나고, `sendFromTemplate` 은 awaiting 아닌 행에
     * `ALREADY_SENT` 를 내므로 재사용 대상이 될 수 없다(면역의 근거는 상태 게이트다).
     *
     * `pgEnum` 이 아니라 text 다 — enum 멤버 추가에 `ALTER TYPE` 이 필요한데 이 레포는
     * `db:push` 전용이라 안전하지 않다(v0.4.42.0 사고 참조).
     */
    providerDraftOrigin: text('provider_draft_origin'),
    /**
     * 템플릿 경로 초안이 **어느 판**으로 만들어졌는지. 템플릿 수정은 공급자에 재생성 후
     * `pg_signing_templates` 행의 id 를 in-place 로 갈아치우므로, 출처가 template 이어도
     * 옛 판 PDF·서명칸일 수 있다 — 재사용은 이 값이 지금 연결된 템플릿과 **같을 때만**
     * 성립한다. (예전에는 채워지지 않는 이력 컬럼이었다.)
     */
    snowsignTemplateId: text('snowsign_template_id'),
    status: signingContractStatusEnum('status').notNull().default('awaiting_pg_template'),
    round: integer('round').notNull().default(1),
    deadlineDays: integer('deadline_days'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    /**
     * 발송 클레임 리스. PG 담당자 둘이 동시에 '보내기'를 눌러도 SnowSign 계약이
     * 하나만 생기도록 awaiting 행을 CAS 로 선점한 시각. 발송이 중간에 죽어도
     * 리스가 만료되면 다시 누를 수 있다. 시각 자체가 소유 토큰이다(하트비트 연장·
     * 반납이 이 값 정확일치를 요구한다).
     *
     * **내부 전용 — `SigningContract` 도메인 타입에 싣지 않는다.** 그 타입은
     * `getForActor` 로 구매사에게도 흘러가고 `stripProviderRefs` 가 유일한 봉인
     * 지점이라, 여기에 필드를 얹으면 봉인이 기억해야 할 게 하나 더 늘어난다.
     * 화면이 리스 상태를 알아야 할 때는 `findSendLease` 로 좁게 읽는다.
     */
    claimedForSendAt: timestamp('claimed_for_send_at', { withTimezone: true }),
    /**
     * 리스를 쥔 사람. **강제 이어받기가 "누구를 밀어냈는지" 말하기 위해서만 있다** —
     * 그 사람에게 알림을 보내고 확인 다이얼로그에 이름을 띄운다.
     *
     * 인덱스를 두지 않는다: PK 로 가진 행에서만 읽고, 반대로 하트비트가 60초마다
     * 쓰는 컬럼이라 인덱스는 쓰기 증폭만 된다.
     *
     * ⚠️ 배포 시점에 살아 있던 리스는 소유자가 NULL 이고, **패널이 열려 있는 한
     * 그대로 남는다** — `renewSendClaim` 은 타임스탬프만 옮기므로 하트비트가 이 값을
     * 채워 주지 않고, 하트비트가 도는 동안은 만료도 하지 않는다(스스로 낫는 건
     * 크래시·탭 닫기뿐). 그 창에서 이어받기가 일어나면 `forceClaimForSend` 가
     * 밀려난 사람을 `null` 로 보고해 **차단 알림이 나가지 않는다** — 동료는 ≤60초
     * 하트비트 폴백으로만 닫힌다. 배포 1회성이고 모든 읽기가 null-safe 라 수용한다
     * (화면은 '다른 담당자'로 표시). TODOS.md Signing 절 참조.
     */
    claimedForSendBy: uuid('claimed_for_send_by').references(() => users.id),
    /**
     * 리마인더 쿨다운 클레임 (24h) — 판정과 기록이 한 UPDATE(CAS)라 동시 클릭이
     * 함께 통과할 수 없다. 감사 로그의 signing.reminded 는 이 위에 얹는 best-effort
     * 기록일 뿐 판정 근거가 아니다(기록 실패가 쿨다운을 끄지 못하게).
     */
    lastRemindedAt: timestamp('last_reminded_at', { withTimezone: true }),
    /**
     * 마감 없는 계약의 방치 알림 클레임 — `lastRemindedAt` 과 같은 CAS 관례.
     *
     * ⚠️ **`lastPolledAt` 을 재사용할 수 없어서 별도 컬럼이다.** `nudgeStaleAwaiting`
     * 은 `lastPolledAt` 을 스로틀 마커로 쓰지만 그건 `awaiting_pg_template` 이
     * 폴링 대상이 **아니기** 때문에 성립한다. 이쪽이 노리는 `sent`/`in_progress` 는
     * 폴러가 1분마다 `lastPolledAt` 을 전진시켜 스로틀이 즉시 무너진다(슬랙 도배).
     * `lastRemindedAt` 도 못 쓴다 — 그건 사용자용 리마인더 쿨다운이라, 겸용하면
     * 운영자 알림이 진짜 리마인더를 막는다.
     */
    staleNotifiedAt: timestamp('stale_notified_at', { withTimezone: true }),
    /**
     * 복구 스캔이 이 딜에 **노출한** 공급자 계약 id 들.
     *
     * 보안 판정용이지 UI 상태가 아니다. 스캔이 후보를 브라우저에 내보내는 순간
     * 그 id 는 PG 가 아는 값이 되므로, 그 뒤로는 **어느 딜에 붙이든** 그 딜의
     * 상관키를 통과해야 한다(`attachProviderContract`). 이 대장이 없으면 판정을
     * 클라이언트가 보내는 `expectedContractId` 유무로 할 수밖에 없고, 그건 공격자가
     * 필드 하나를 빼는 것으로 끄는 게이트다.
     *
     * 임베드에서 방금 만들어진 계약은 여기 없으므로 지금처럼 오타를
     * `participantMismatch` 경고로 다루는 경로가 그대로 남는다.
     */
    recoveryRefs: text('recovery_refs').array().notNull().default([]),
    /**
     * 발송된 **조항형** 계약의 문서 스냅샷(`SentContractSnapshot` = `LayoutInput` + `_v`).
     *
     * 조항형은 문서가 우리 DB 에 있지만 그 서식 행은 수정 가능하다 — 스냅샷이 없으면
     * 서식을 고치는 순간 이미 나간 계약이 무엇이었는지 알 길이 없다(공급자 다운로드는
     * `completed` 에서만 열린다). `markSentIfAwaiting` 이 `provider_ref`·출처와 **한
     * UPDATE 로** 쓰는 것이 유일한 경로다 — 발송 성공과 스냅샷이 갈라지면 안 된다.
     *
     * 템플릿·임베드 경로는 NULL 이다: PDF 가 공급자에만 있어 지어낼 수 없다.
     *
     * ⚠️ `SIGNING_CONTRACT_COLUMNS`(`repositories/drizzle/signing-contract.ts`) projection 에
     * **넣지 않는다** — 무인자 `.select()` 는 스키마 컬럼을 열거하므로, projection 없이는
     * 이 jsonb 가 딜룸 로드마다는 물론 2분 폴러의 전 행에 딸려 온다. (`MAX_DOCUMENT_BYTES`
     * 128KB 는 **서식 저장 시점의 치환 전 문서**를 재는 값이라 이 컬럼의 상한이 아니다 —
     * 치환·수수료 표가 더해진 스냅샷은 그보다 클 수 있다.)
     * 읽기는 좁은 리더(`findSentDocument`)뿐이다.
     */
    sentDocument: jsonb('sent_document'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
  },
  (t) => [
    // 활성 계약은 RFP당 1건. 완료/취소/만료/거절 후에는 새 라운드(재발송) 허용.
    uniqueIndex('signing_contracts_active_rfp_uniq')
      .on(t.rfpId)
      .where(sql`status in ('awaiting_pg_template','sent','in_progress')`),
    // cron 폴링: 진행 중 계약을 오래 안 본 순으로 스캔.
    index('signing_contracts_status_polled_idx').on(t.status, t.lastPolledAt),
    // 웹훅 트리거 조회 키: findByProviderRef(provider_ref) — 시퀀셜 스캔 방지.
    //
    // **부분 유니크**인 이유: 한 스노우싸인 계약은 우리 계약 행 하나만 쥘 수 있다.
    // 서비스의 findByProviderRef 검사는 트랜잭션 밖 read-then-write 라 동시 요청
    // 둘이 나란히 통과한다 — 선착순을 실제로 정하는 건 이 제약이다. 두 행이 같은
    // provider 계약을 쥐면 상태·완료본이 서로를 덮어쓰고, reconcileByProviderRef 가
    // limit(1) 이라 다른 한쪽 딜룸은 영영 낡은 상태에 갇힌다.
    // NULL 제외: 발송 전 대기 행은 provider_ref 가 전부 NULL 이다.
    uniqueIndex('signing_contracts_provider_ref_uniq')
      .on(t.providerRef)
      .where(sql`provider_ref is not null`),
  ],
);
