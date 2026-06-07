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
 * 오픈 게시판 공개 프로젝션. 구매사 신원·요청 개요는 공개하되(opt-out 모델),
 * 봉인입찰 모델을 지키기 위해 **수수료·연거래량·현재 거래조건·사업자번호·메모·첨부는
 * 절대 담지 않는다**. 아래 필드는 PG의 참여 판단에 필요한 비경쟁 정보(신원·마감·요청
 * 결제수단·취급 상품)로 한정한 화이트리스트다. 이 타입에 필드를 추가하는 것은 곧 공개
 * 경계를 넓히는 것이므로 신중히 — 경쟁정보 추가는 봉인 모델을 깨뜨린다.
 */
export type OpportunityListing = {
  rfpCode: string;
  buyerName: string;
  title: string;
  websiteUrl: string | null;
  /** ISO 8601 마감일시. */
  deadline: string;
  /** 구매사가 이번 건에 요구한 결제수단 키 목록 (현재 거래조건 아님). 빈 배열 = 제한 없음. */
  requiredPaymentMethods: string[];
  /** 커스텀 결제수단의 표시 라벨만 (id 등 내부값 제외). */
  customPaymentMethodLabels: string[];
  /** 주요 상품·서비스. 없으면 null. */
  mainProducts: string | null;
  /** 계약 유형(선택사항). null/undefined이면 미표시. */
  contractType?: 'new' | 'renewal' | null;
};
