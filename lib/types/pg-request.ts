// 비초대 PG가 오픈 RFP 게시판에서 보내는 참여 요청(콜드 피치) 도메인 타입.

export type PgRequestStatus = 'pending' | 'accepted' | 'rejected';

export type PgRequest = {
  id: string;
  rfpId: string;
  pgWsId: string;
  /** PG가 작성한 콜드 피치 본문. */
  message: string;
  status: PgRequestStatus;
  createdByUserId: string;
  decidedByUserId?: string;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. 미결정이면 undefined. */
  decidedAt?: string;
};

/**
 * 오픈 게시판 공개 프로젝션. 구매사 신원은 공개하되(opt-out 모델), 수수료·현재
 * 거래조건 등 핵심정보는 절대 담지 않는 **화이트리스트 4필드**. 이 타입에 필드를
 * 추가하는 것은 곧 공개 경계를 넓히는 것이므로 신중히.
 */
export type OpportunityListing = {
  rfpCode: string;
  buyerName: string;
  title: string;
  websiteUrl: string | null;
};
