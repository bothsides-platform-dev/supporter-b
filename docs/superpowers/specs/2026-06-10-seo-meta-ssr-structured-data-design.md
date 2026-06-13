# SEO 개선 — 메타태그 · SSR 분리 · 구조화 데이터

**날짜:** 2026-06-10  
**목표 키워드:** PG도입, PG견적, 서포터비, Supporter B  
**타겟 검색엔진:** Google + 네이버

---

## 1. 배경 및 문제

### 현재 상태

| 항목 | 현재 | 문제 |
|---|---|---|
| keywords | `['PG', '결제대행사', '견적', '입찰', 'Supporter B']` | "PG도입", "서포터비" 누락 |
| description | "다수의 PG사의 견적을 비교하여 최적의 견적을 받아보세요" | 타겟 키워드 미포함 |
| LandingHero | `'use client'` 전체 | 타이핑 초기값 `''` → SSR h1이 빈 문자열 포함 |
| 구조화 데이터 | Organization JSON-LD만 | FAQPage·SoftwareApplication 없음 |
| 네이버 서치어드바이저 | 미등록 | sitemap 미제출 |

### 핵심 SSR 이슈

`LandingHero.tsx`의 `useTypewriter` 훅이 `useState('')`로 초기화되어, SSR 시 h1의 타이핑 span이 빈 문자열로 렌더링됩니다. 크롤러가 h1에서 읽는 문구는 "Supporter B를 통해 | 만듭니다."가 되어 핵심 키워드가 누락됩니다.

---

## 2. 설계

### 2-1. 메타태그 보강 (`lib/site-config.ts`)

```typescript
export const siteConfig = {
  name: 'Supporter B',
  title: 'Supporter B — PG사 비교 견적 플랫폼',
  description: 'PG도입을 고려 중이신가요? 서포터비(Supporter B)에서 여러 PG사의 견적을 한 번에 비교해 최적의 수수료 조건으로 계약하세요.',
  keywords: [
    'PG도입', 'PG 견적', 'PG 수수료 비교', '결제대행사 도입',
    '결제대행사 견적', '결제대행사 비교', 'PG사 비교',
    '서포터비', 'Supporter B',
  ],
  // ... 나머지 필드 유지
}
```

### 2-2. SSR 구조 분리

#### 파일 구조

```
components/landing/
├── LandingHero.tsx          (server component — 'use client' 제거)
├── LandingHeroSection.tsx   (신규, 'use client' — 타이핑·useEffect)
├── FadeInView.tsx           (신규, 'use client' — motion whileInView 래퍼)
├── FaqList.tsx              (기존 유지, FAQ_ITEMS export 추가)
└── ... (나머지 변경 없음)
```

#### `LandingHeroSection.tsx` (신규, client)

- `useTypewriter` 훅 포함
- `useEffect`로 `html.landing-scroll` 클래스 관리
- motion.h1 / motion.div 타이핑 애니메이션
- **SSR 초기값**: `useState(TYPING_VALUES[0])` — "협상의 주도권을"이 초기 HTML에 포함됨
  - 클라이언트 하이드레이션 후 타이핑 애니메이션이 이어받음
  - `suppressHydrationWarning` 적용으로 서버/클라이언트 불일치 경고 억제

#### `FadeInView.tsx` (신규, client)

```typescript
'use client';
// motion.div whileInView 래퍼만 담당
// children은 서버 컴포넌트에서 전달 → 정적 텍스트는 SSR HTML에 포함
export function FadeInView({ children, delay, className }) { ... }
```

#### `LandingHero.tsx` (server component으로 전환)

- `'use client'` 제거
- `useTypewriter`, `useEffect` → `LandingHeroSection`으로 이동
- `motion.div` whileInView → `<FadeInView>` 래퍼로 교체
- 결과: h2, p, li, h3 등 모든 섹션 텍스트가 초기 HTML에 포함

#### SSR 후 초기 HTML 변화 (Before → After)

```html
<!-- Before: 타이핑 span이 빈 문자열 -->
<h1>Supporter B를 통해</h1>
<div><span class="text-primary"></span><span>|</span><span> 만듭니다.</span></div>

<!-- After: 의미 있는 첫 번째 값 -->
<h1>Supporter B를 통해</h1>
<div><span class="text-primary">협상의 주도권을</span><span>|</span><span> 만듭니다.</span></div>
```

### 2-3. 구조화 데이터 (`app/page.tsx`)

기존 `Organization` JSON-LD 유지. 아래 두 스키마 추가.

#### FAQPage

`FaqList.tsx`에서 `FAQ_ITEMS`를 export하여 재사용.

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "SupporterB 도입 수수료가 있나요?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "SupporterB는 현재(2026년) 무료로 이용 가능합니다. ..."
      }
    }
    // ... 나머지 FAQ 항목
  ]
}
```

Google 검색 결과 리치 결과(Rich Result) 노출 가능.

#### SoftwareApplication

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "서포터비 (Supporter B)",
  "alternateName": ["Supporter B", "서포터비"],
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "KRW"
  },
  "description": "PG도입을 위한 PG사 비교 견적 플랫폼"
}
```

### 2-4. 네이버 서치어드바이저 (코드 외 작업)

> 이 항목은 개발 배포 후 수동으로 진행합니다.

**체크리스트:**

- [ ] [네이버 서치어드바이저](https://searchadvisor.naver.com) 접속 → 사이트 등록 (`supporter-b.com`)
- [ ] 소유권 확인 메타태그 → `app/layout.tsx`의 `metadata.verification.other` 필드에 추가 (코드 확보됨)
  ```typescript
  verification: { other: { 'naver-site-verification': 'f8d3af23920f570dd4a5b13980fa0d1f43f53f5e' } }
  ```
- [ ] sitemap.xml 제출: `https://supporter-b.com/sitemap.xml`
- [ ] Google Search Console도 동일하게 등록 (소유권 확인 → sitemap 제출)

---

## 3. 변경 파일 목록

| 파일 | 변경 유형 | 내용 |
|---|---|---|
| `lib/site-config.ts` | 수정 | keywords·description 보강 |
| `components/landing/LandingHero.tsx` | 수정 | server component 전환, FadeInView 적용 |
| `components/landing/LandingHeroSection.tsx` | 신규 | 타이핑·애니메이션 client component |
| `components/landing/FadeInView.tsx` | 신규 | motion whileInView client 래퍼 |
| `components/landing/FaqList.tsx` | 수정 | FAQ_ITEMS export 추가 |
| `app/page.tsx` | 수정 | FAQPage + SoftwareApplication JSON-LD 추가 |
| `app/layout.tsx` | 수정 (선택) | 네이버 verification 메타태그 |

---

## 4. 테스트 계획

- `LandingHero` 렌더 테스트: 기존 `LandingHero.test.tsx` + server component 전환 후 스냅샷 유지
- `LandingHeroSection` 단위 테스트: 타이핑 초기값이 `TYPING_VALUES[0]`인지 확인
- `FadeInView` 단위 테스트: children이 렌더링되는지 확인
- JSON-LD 스키마 유효성: [Google Rich Results Test](https://search.google.com/test/rich-results) 로 FAQPage 검증
- `pnpm tsc --noEmit` + `pnpm lint` 통과

---

## 5. 범위 외 (명시적 제외)

- 새 랜딩 페이지 추가 (`/pg-도입`, `/pg-견적` 등)
- 블로그·아티클 섹션
- `PgLanding` 개발 (별도 작업)
- 검색 광고(SEA) / 유료 채널
