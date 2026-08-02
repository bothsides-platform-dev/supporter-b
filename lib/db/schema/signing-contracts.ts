import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
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
     * 쓰는 컬럼이라 인덱스는 쓰기 증폭만 된다. 배포 시점에 살아 있던 리스는 NULL
     * 인데, 5분이면 만료돼 스스로 낫는다(그동안 화면은 '다른 담당자'로 표시한다).
     */
    claimedForSendBy: uuid('claimed_for_send_by').references(() => users.id),
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
