// Curated onboarding subset, not the complete MCC registry. Korean labels are
// product translations; a buyer selection does not assign an acquiring MCC.
// Source: Visa Merchant Data Standards Manual, April 2026, section 2.
export const MCC_VERSION = 'visa-2026-04';
export const MCC_SOURCE = 'https://usa.visa.com/content/dam/VCOM/download/merchants/visa-merchant-data-standards-manual.pdf';
export const MCC_INDUSTRIES = [
  { code: '5411', name: '식료품점·슈퍼마켓', category: '상품 판매' },
  { code: '5499', name: '편의점·기타 식품 판매', category: '상품 판매' },
  { code: '5651', name: '종합 의류 판매', category: '상품 판매' },
  { code: '5661', name: '신발 판매', category: '상품 판매' },
  { code: '5699', name: '기타 의류·패션 잡화 판매', category: '상품 판매' },
  { code: '5712', name: '가구·홈퍼니싱 판매', category: '상품 판매' },
  { code: '5722', name: '가전제품 판매', category: '상품 판매' },
  { code: '5732', name: '전자제품 판매', category: '상품 판매' },
  { code: '5941', name: '스포츠용품 판매', category: '상품 판매' },
  { code: '5942', name: '서적 판매', category: '상품 판매' },
  { code: '5943', name: '문구·사무·학용품 판매', category: '상품 판매' },
  { code: '5944', name: '보석·시계·은제품 판매', category: '상품 판매' },
  { code: '5945', name: '장난감·취미·보드게임용품 판매', category: '상품 판매' },
  { code: '5977', name: '화장품 판매', category: '상품 판매' },
  { code: '5995', name: '반려동물·사료·용품 판매', category: '상품 판매' },
  { code: '5812', name: '음식점', category: '음식' },
  { code: '5814', name: '패스트푸드 음식점', category: '음식' },
  { code: '5815', name: '전자책·영상·음악·디지털 이미지 판매', category: '디지털·IT' },
  { code: '5816', name: '디지털 게임 판매', category: '디지털·IT' },
  { code: '5817', name: '디지털 소프트웨어 판매 (게임 제외)', category: '디지털·IT' },
  { code: '7372', name: '프로그래밍·데이터 처리·시스템 개발', category: '디지털·IT' },
  { code: '8241', name: '원격 교육', category: '교육·전문 서비스' },
  { code: '8299', name: '기타 교육 서비스', category: '교육·전문 서비스' },
  { code: '7392', name: '경영 컨설팅·홍보 서비스', category: '교육·전문 서비스' },
  { code: '4722', name: '여행사·여행 운영', category: '여행·여가' },
  { code: '7011', name: '호텔·모텔·리조트·숙박 예약', category: '여행·여가' },
  { code: '7991', name: '관광명소·전시', category: '여행·여가' },
  { code: '7997', name: '회원제 스포츠·레크리에이션 클럽', category: '여행·여가' },
  { code: '7999', name: '기타 레크리에이션 서비스', category: '여행·여가' },
] as const;
