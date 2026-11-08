# SEO 보고서 적용 기록

2026-11-06 분석을 담은 사용자 제공 한국어 PDF를 현재 코드와 대조했다. 보고서의 점수는 자체 평가이며 검색 성과나 운영 사이트의 최신 상태를 입증하지 않는다.

## 반영한 항목

- 검색·Open Graph·Twitter 설명의 단일 출처인 `siteConfig.description`을 업종별 맞춤 PG 상담 흐름에 맞췄다. 신규 요청을 여러 PG의 경쟁 견적으로 소개하던 설명을 수정했고, 검증되지 않은 절감 수치는 추가하지 않았다.
- Organization에 공개 운영사 이메일을 사용하는 한국어 고객지원 `contactPoint`를 추가했다.
- SoftwareApplication에 URL, 안정적인 `@id`, 기존 Organization을 참조하는 publisher, 서비스 하위 분류, 언어와 무료 이용 정보를 추가했다. 설명은 검색 메타 설명과 공유한다. 무료 정보는 현재 랜딩의 2026년 무료 이용 안내에 근거한다.
- 사이트맵에 `/legal`, `/legal/terms`, `/legal/privacy`, `/legal/marketing`을 추가했다. `noindex`인 `/signup/buyer`는 제외하고 partner 호스트의 빈 사이트맵은 유지했다.
- 실제 콘텐츠 수정 시각 대신 매 요청 시각을 넣던 `lastModified`를 제거했다. 추후 콘텐츠 수정 시각을 추적하면 다시 제공할 수 있다.
- `/legal`과 `/login`이 홈페이지 canonical을 상속하지 않도록 자기 URL을 지정했다. 법적 고지 페이지 네 개에는 내용에 맞는 검색 설명을 지정했다. 고지 본문은 변경하지 않았다.
- 제휴 로고의 컬러 이미지와 CSS 단색 마스크 모두 무손실 WebP를 우선 제공한다. `<picture>`와 CSS `image-set()`의 PNG 폴백을 두고 원본 파일과 표시 좌표·크기를 보존했다.

| 로고 | PNG | WebP | 확인 |
|---|---:|---:|---|
| 토스페이먼츠 | 71,906 B | 38,646 B | 보이는 RGB·알파 차이 0픽셀 |
| 헥토파이낸셜 | 4,290 B | 1,632 B | 보이는 RGB·알파 차이 0픽셀 |
| 합계 | 76,196 B | 40,278 B | 약 47.1% 감소 |

WebP는 Next.js에 설치된 sharp의 `webp({ lossless: true, effort: 6 })`로 생성했다. 원본 크기를 유지했으며 알파가 0인 픽셀의 보이지 않는 RGB 값은 비교에서 제외했다. 페이지 전체 전송량이나 LCP 개선률을 뜻하지 않는다.

## 유지하거나 보류한 항목

- **H1:** `HeroKineticHeadline`에 이미 존재한다. 로컬 서버의 초기 HTML에서도 메인 H1이 정확히 하나임을 확인했다. 확정된 히어로 카피를 보고서 예문으로 교체하지 않았다.
- **Twitter 설명·SoftwareApplication 이름과 설명·LinkedIn:** 이미 구현돼 있었다. 기존 연결을 유지하고 공유 설명만 갱신했다.
- **FAQPage:** 현재 FAQ와 같은 질문·답변을 사용하므로 유지했다. QAPage로 변경하지 않았다.
- **screenshot:** OG 이미지는 앱 화면 캡처가 아니므로 screenshot으로 선언하지 않았다.
- **SearchAction:** 사이트 검색 기능을 새로 만들지 않았다. 보고서도 사이트링크 검색창 목적의 개발을 권장하지 않는다.
- **홈페이지 끝 슬래시:** 로컬에서 canonical은 `/`로 끝나며 사이트맵 루트와 일치한다. 운영 중복 색인은 Search Console 데이터 없이 단정하지 않았다.
- **성과 수치:** 기존 수치의 원자료를 확보하지 못했다. 신규 검색 설명에 확대 사용하지 않았으며 근거 검증은 남아 있다.
- **배포 후 확인:** 운영 색인, 검색 결과 문구, Rich Results Test, PageSpeed/LCP와 전환 성과는 이번 로컬 검증 범위에 포함하지 않았다.

## 히어로 H1 후속 개선

운영 응답을 일반 브라우저·Googlebot·네이버 Yeti·Bingbot User-Agent로 확인했을 때 모두 HTTP 200, H1 1개였다. 다만 초기 문구가 `translateY(112%)`와 클리핑으로 가려졌고, H1 텍스트에는 크기 예약용 후보·접근성 사본·애니메이션 사본이 함께 들어 있었다. 실제 검색봇의 수집 완료를 확인한 것은 아니다.

- 제목의 진입 숨김을 제거해 첫 HTML부터 첫 문장을 표시한다. 기존 문구·순서와 글자별 순환은 유지한다.
- 크기 예약 요소를 H1 밖으로 옮기고 CSS subgrid로 같은 행 높이를 공유한다. 화면 크기와 글꼴 변화에도 JS 측정 없이 예약 공간을 유지한다.
- 서버 렌더와 정착 상태에는 현재 문구 한 벌만 일반 단어로 제공한다. 글자별 레이어와 접근성 문장은 전환 중에만 사용한다.
- H1 텍스트가 중복되는 실패 테스트를 먼저 확인한 후 수정했다. 기존 순환·탭 숨김·Strict Mode·문구 교체 동작 테스트를 유지한다.

## 로컬 검증

- SEO·히어로·제휴 로고 관련 65개와 사이트 설정 6개, 합계 71개 테스트 통과.
- H1 후속 수정: `HeroKineticHeadline`·`WordMaskRoll`·구매사/PG 히어로 관련 26개 테스트 통과. Chromium에서 390·1440·1920px의 초기 제목과 순환 중 높이·고정 문장 위치 유지, WebKit에서 390·1920px의 JS 없는 초기 표시와 모바일 구매사·PG 순환을 확인했다. 두 엔진 모두 페이지 JavaScript 오류가 없었다.
- `next typegen`, `tsc --noEmit`, 변경 TypeScript 파일 ESLint, `git diff --check` 통과.
- HTTP 응답에서 메인 H1 1개, 검색·Twitter 설명 일치, JSON-LD 파싱, 법적 고지·로그인 canonical, 회원가입 noindex, 사이트맵의 법적 고지 포함·회원가입 제외·lastmod 생략 확인.
- Chromium 1440×1000·390×844에서 H1 1개, WebP 이미지와 마스크 로딩, 가로 넘침 없음, 페이지 JavaScript 오류 없음 확인. 데스크톱 로고 hover도 확인.
- 첫 개발 서버는 4GB 메모리 상한으로 재시작해 브라우저 검증이 중단됐다. 8GB로 다시 실행한 뒤 위 확인을 완료했다. 기존 `lib/observability/logger.ts`의 webpack `createRequire` 경고는 이번 변경 범위 밖이다. 프로덕션 빌드·운영 배포는 실행하지 않았다.

## 근거 문서

- [Google 사이트맵 가이드](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap): 색인할 canonical URL과 실제 수정일을 제공한다.
- [Schema.org SoftwareApplication](https://schema.org/SoftwareApplication): 앱 설명·URL·screenshot의 의미를 확인했다.
- [Schema.org ContactPoint](https://schema.org/ContactPoint): 고객지원 이메일과 지원 언어 속성을 확인했다.
- [Next.js sitemap 규약](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap): 사이트맵 메타데이터 타입을 확인했다.
