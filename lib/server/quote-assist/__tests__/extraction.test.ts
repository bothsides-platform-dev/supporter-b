import { expect, it } from 'vitest';
import { extractWebsiteSuggestions } from '../extraction';

it('명시된 구조화 상품과 알려진 솔루션만 제안하며 빈 정보로 아니요를 만들지 않는다', () => {
  const result = extractWebsiteSuggestions([{ url: 'https://shop.example', html: '<script type="application/ld+json">{"@type":"Product","name":"면 티셔츠","category":"의류"}</script><script src="https://img.echosting.cafe24.com/a.js"></script>' }],
    [{ id: '10000000-0000-4000-8000-000000000001', name: '의류', mccCode: undefined }]);
  expect(result.map(s => [s.field, s.value])).toEqual([
    ['mainProducts', '면 티셔츠'], ['industryGroupId', '10000000-0000-4000-8000-000000000001'], ['currentSolution', 'cafe24'],
  ]);
  expect(extractWebsiteSuggestions([{ url: 'https://shop.example', html: '<title>알 수 없는 상점</title><p>상품 없음</p>' }], [])).toEqual([]);
});
it('상품으로 명시한 메타데이터만 사용하고 단순 외부 링크를 운영 솔루션으로 해석하지 않는다', () => {
  const page = { url: 'https://shop.example.com', html: '<meta content="product" property="og:type"><meta property="og:title" content="면 &amp; 린넨 셔츠"><a href="https://cafe24.com/">관련 기사</a>' };
  expect(extractWebsiteSuggestions([page], [])).toMatchObject([{ field: 'mainProducts', value: '면 & 린넨 셔츠' }]);
  expect(extractWebsiteSuggestions([{ ...page, html: '<meta property="og:title" content="상점"><a href="https://cafe24.com/">기사</a>' }], [])).toEqual([]);
});
