'use client';

/**
 * buildContractTabEntries — buyer/PG 딜룸 바디가 공유하는 계약 탭 조립.
 *
 * signing 이 있을 때만 계약 탭(AwardContextLine + SigningTab)을 만들어 돌려준다.
 * 없으면 빈 배열을 돌려줘 호출부의 `...spread` 가 그대로 no-op 이 된다. 공통 입력 외에 PG는
 * buyerSigner·linkedSigningTemplate도 전달한다. PG 쪽은 봉인입찰 방어를 위해 `signing`
 * 자체가 아니라 컴포넌트가 이미 걸러낸 `contractVisible`(미선정 PG 에겐 null)을 넘겨야
 * 한다 — 그 게이트는 호출부(PgDealRoomBody)의 책임으로 남는다.
 */
import { lazy, Suspense } from 'react';
import type { DealRoomTab } from '@/components/deal-room/DealRoomCenter';
import {
  type LinkedSigningTemplate,
  type SigningSide,
} from '@/components/deal-room/signing/signing-view-model';
import type { SigningView } from '@/lib/types/signing';

// 계약 탭이 없는 대다수 딜룸은 서명 UI와 그 하위 의존성을 초기 번들에 넣지 않는다.
// tab content가 실제로 마운트될 때만 모듈을 요청한다.
const SigningTab = lazy(async () => {
  const signingTabModule = await import('@/components/deal-room/signing/PlatformAgreementPanel');
  return { default: signingTabModule.PlatformAgreementPanel };
});

export function buildContractTabEntries(args: {
  rfpCode: string;
  /** null 이면 계약 탭 생략 — PG 쪽은 `contractVisible` 을 넘길 것. */
  signing: SigningView | null;
  side: SigningSide;
  contact: { workspaceName: string; name: string } | null;
  counterpartyWsId?: string;
  /**
   * PG 전용 — 발송 임베드에서 수신자로 넣어야 할 구매사 담당자. buyer 호출부는 넘기지
   * 않는다(넘겨도 `contact` 와 달리 상대편이 아니라 자기 자신이라 의미가 없다).
   */
  buyerSigner?: { name: string; email: string } | null;
  /**
   * PG 전용 — 낙찰 견적에 연결된 계약서 서식(이름 + 종류). buyer 호출부는 넘기지 않는다
   * (액션 자체가 PG 전용이라 buyer 쪽 로더 데이터에 이 필드가 없다).
   */
  linkedSigningTemplate?: LinkedSigningTemplate | null;
}): DealRoomTab[] {
  const {signing,side}=args;
  if (!signing || side !== 'buyer' || signing.contract.kind !== 'platform_buyer') return [];
  const status=signing.contract.status;
  const label=status==='awaiting_pg_template'?'합의서 작성':status==='completed'?'서명 완료':'합의서 진행';
  return [{id:'contract',label,keepMounted:true,content:<Suspense fallback={null}><SigningTab signing={signing}/></Suspense>}];
}
