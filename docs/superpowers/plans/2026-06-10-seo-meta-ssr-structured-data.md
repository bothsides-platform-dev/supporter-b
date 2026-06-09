# SEO 개선 — 메타태그·SSR 분리·구조화 데이터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "PG도입", "PG견적", "서포터비", "Supporter B" 키워드로 Google·네이버 검색 노출을 개선한다.

**Architecture:** (1) `lib/site-config.ts` 키워드·설명 보강 → (2) `LandingHero`를 server component으로 전환(타이핑·애니메이션은 `LandingHeroSection`/`FadeInView` 클라이언트 섬으로 분리) → (3) FAQPage·SoftwareApplication JSON-LD를 `app/page.tsx`에 추가 → (4) 네이버 verification 메타태그 추가.

**Tech Stack:** Next.js App Router (RSC), `motion/react`, `schema.org` JSON-LD, Vitest + React Testing Library

> ⚠️ 모든 테스트 실행 시 Node 20 prefix 필수: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test <path>`

---

## File Map

| 파일 | 유형 | 역할 |
|---|---|---|
| `lib/site-config.ts` | 수정 | keywords·description 보강 |
| `lib/__tests__/site-config.test.ts` | 신규 | site-config 값 검증 |
| `components/landing/FaqList.tsx` | 수정 | `FAQ_ITEMS` export 추가 |
| `components/landing/__tests__/FaqList.test.tsx` | 수정 | export 검증 추가 |
| `components/landing/FadeInView.tsx` | 신규 | `motion.div` whileInView 클라이언트 래퍼 |
| `components/landing/__tests__/FadeInView.test.tsx` | 신규 | children 렌더 검증 |
| `components/landing/LandingHeroSection.tsx` | 신규 | 타이핑·hero 애니메이션 클라이언트 컴포넌트 |
| `components/landing/__tests__/LandingHeroSection.test.tsx` | 신규 | 타이핑 초기값·CTA 검증 |
| `components/landing/LandingHero.tsx` | 수정 | `'use client'` 제거, server component 전환 |
| `components/landing/LandingHero.test.tsx` | 수정 | 새 mock 추가, 영향 받는 테스트 수정 |
| `app/page.tsx` | 수정 | FAQPage·SoftwareApplication JSON-LD 추가 |
| `app/__tests__/page.test.tsx` | 수정 | JSON-LD script 렌더 테스트 추가 |
| `app/layout.tsx` | 수정 | 네이버 verification 메타태그 |

---

## Task 1: site-config.ts — 키워드·설명 보강

**Files:**
- Create: `lib/__tests__/site-config.test.ts`
- Modify: `lib/site-config.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// lib/__tests__/site-config.test.ts
import { describe, it, expect } from 'vitest';
import { siteConfig } from '../site-config';

describe('siteConfig', () => {
  it('includes PG도입 in keywords', () => {
    expect(siteConfig.keywords).toContain('PG도입');
  });

  it('includes 서포터비 in keywords', () => {
    expect(siteConfig.keywords).toContain('서포터비');
  });

  it('description mentions PG도입', () => {
    expect(siteConfig.description).toMatch(/PG도입/);
  });

  it('description mentions 서포터비', () => {
    expect(siteConfig.description).toMatch(/서포터비/);
  });
});
```

- [ ] **Step 2: 테스트 실행 — RED 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/__tests__/site-config.test.ts
```
Expected: FAIL (4 tests)

- [ ] **Step 3: site-config.ts 수정**

```typescript
// lib/site-config.ts
export const siteConfig = {
  name: 'Supporter B',
  title: 'Supporter B — PG사 비교 견적 플랫폼',
  description:
    'PG도입을 고려 중이신가요? 서포터비(Supporter B)에서 여러 PG사의 견적을 한 번에 비교해 최적의 수수료 조건으로 계약하세요.',
  url:
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.AUTH_URL ??
    'http://localhost:3000',
  locale: 'ko_KR',
  ogImageAlt: 'Supporter B — PG사 비교 견적 플랫폼',
  keywords: [
    'PG도입',
    'PG 견적',
    'PG 수수료 비교',
    '결제대행사 도입',
    '결제대행사 견적',
    '결제대행사 비교',
    'PG사 비교',
    '서포터비',
    'Supporter B',
  ],
} as const;
```

- [ ] **Step 4: 테스트 실행 — GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/__tests__/site-config.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/site-config.ts lib/__tests__/site-config.test.ts
git commit -m "feat(seo): site-config 키워드·설명 보강 (PG도입·서포터비 추가)"
```

---

## Task 2: FaqList — FAQ_ITEMS export 추가

**Files:**
- Modify: `components/landing/__tests__/FaqList.test.tsx`
- Modify: `components/landing/FaqList.tsx`

- [ ] **Step 1: 실패하는 테스트 추가**

`components/landing/__tests__/FaqList.test.tsx`의 기존 import 아래에 추가:

```typescript
// 기존 import 뒤에 추가
import { FAQ_ITEMS } from '../FaqList';

// describe('FaqList', ...) 블록 안에 추가:
it('exports FAQ_ITEMS as a non-empty array with q and a strings', () => {
  expect(FAQ_ITEMS.length).toBeGreaterThan(0);
  FAQ_ITEMS.forEach((item) => {
    expect(typeof item.q).toBe('string');
    expect(typeof item.a).toBe('string');
  });
});
```

- [ ] **Step 2: 테스트 실행 — RED 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/landing/__tests__/FaqList.test.tsx
```
Expected: FAIL — `FAQ_ITEMS` is not exported

- [ ] **Step 3: FaqList.tsx에서 FAQ_ITEMS export**

`components/landing/FaqList.tsx` 첫 줄 상수 선언을 `export`로 변경:

```typescript
// 변경 전:
const FAQ_ITEMS = [
// 변경 후:
export const FAQ_ITEMS = [
```

- [ ] **Step 4: 테스트 실행 — GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/landing/__tests__/FaqList.test.tsx
```
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add components/landing/FaqList.tsx components/landing/__tests__/FaqList.test.tsx
git commit -m "feat(seo): FaqList FAQ_ITEMS export (JSON-LD 재사용용)"
```

---

## Task 3: FadeInView — motion whileInView 클라이언트 래퍼

**Files:**
- Create: `components/landing/__tests__/FadeInView.test.tsx`
- Create: `components/landing/FadeInView.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// components/landing/__tests__/FadeInView.test.tsx
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

vi.mock('motion/react', () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(tag, props, children as React.ReactNode);
    El.displayName = `motion.${tag}`;
    return El;
  };
  return { motion: new Proxy({}, { get: (_, tag: string) => makeEl(tag) }) };
});

import { FadeInView } from '../FadeInView';

describe('FadeInView', () => {
  it('renders its children', () => {
    render(<FadeInView><span>hello</span></FadeInView>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('accepts an optional delay prop without error', () => {
    expect(() =>
      render(<FadeInView delay={0.1}><span>ok</span></FadeInView>)
    ).not.toThrow();
  });

  it('accepts an optional className prop without error', () => {
    expect(() =>
      render(<FadeInView className="test-cls"><span>ok</span></FadeInView>)
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실행 — RED 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/landing/__tests__/FadeInView.test.tsx
```
Expected: FAIL — module not found

- [ ] **Step 3: FadeInView.tsx 구현**

```typescript
// components/landing/FadeInView.tsx
'use client';

import { type ReactNode } from 'react';
import { motion } from 'motion/react';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

interface FadeInViewProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function FadeInView({ children, delay = 0, className }: FadeInViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.36, delay, ease: EASE_OUT }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 4: 테스트 실행 — GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/landing/__tests__/FadeInView.test.tsx
```
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add components/landing/FadeInView.tsx components/landing/__tests__/FadeInView.test.tsx
git commit -m "feat(seo): FadeInView 클라이언트 motion 래퍼 컴포넌트"
```

---

## Task 4: LandingHeroSection — 타이핑·hero 애니메이션 클라이언트 컴포넌트

**Files:**
- Create: `components/landing/__tests__/LandingHeroSection.test.tsx`
- Create: `components/landing/LandingHeroSection.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// components/landing/__tests__/LandingHeroSection.test.tsx
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

vi.mock('motion/react', () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(tag, props, children as React.ReactNode);
    El.displayName = `motion.${tag}`;
    return El;
  };
  return { motion: new Proxy({}, { get: (_, tag: string) => makeEl(tag) }) };
});

vi.mock('@/components/primitives/Button', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

import { LandingHeroSection } from '../LandingHeroSection';

describe('LandingHeroSection', () => {
  it('renders the static h1 text', () => {
    render(<LandingHeroSection />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Supporter B를 통해');
  });

  it('renders the first TYPING_VALUE as initial text (not empty)', () => {
    render(<LandingHeroSection />);
    expect(screen.getByText('협상의 주도권을')).toBeInTheDocument();
  });

  it('routes the hero CTA to /rfp/new', () => {
    render(<LandingHeroSection />);
    const cta = screen.getByRole('link', { name: /PG 비교 견적 무료로 시작하기/ });
    expect(cta).toHaveAttribute('href', '/rfp/new');
  });
});
```

- [ ] **Step 2: 테스트 실행 — RED 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/landing/__tests__/LandingHeroSection.test.tsx
```
Expected: FAIL — module not found

- [ ] **Step 3: LandingHeroSection.tsx 구현**

```typescript
// components/landing/LandingHeroSection.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Button } from '@/components/primitives/Button';

const TYPING_VALUES = [
  '협상의 주도권을',
  '연간 수천만 원의 절감을',
  '정보 비대칭 없는 계약을',
  'PG사 간 공정한 경쟁을',
  '5분짜리 경쟁 입찰을',
];

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function useTypewriter(
  values: string[],
  typingMs = 60,
  deletingMs = 30,
  holdMs = 1800,
): string {
  const [displayText, setDisplayText] = useState(values[0]);
  const [index, setIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const current = values[index];

    if (!isDeleting && displayText === current) {
      const hold = setTimeout(() => setIsDeleting(true), holdMs);
      return () => clearTimeout(hold);
    }

    if (isDeleting && displayText === '') {
      const advance = setTimeout(() => {
        setIsDeleting(false);
        setIndex((i) => (i + 1) % values.length);
      }, 0);
      return () => clearTimeout(advance);
    }

    const speed = isDeleting ? deletingMs : typingMs;
    const next = isDeleting
      ? displayText.slice(0, -1)
      : current.slice(0, displayText.length + 1);

    const timer = setTimeout(() => setDisplayText(next), speed);
    return () => clearTimeout(timer);
  }, [displayText, index, isDeleting, values, typingMs, deletingMs, holdMs]);

  return displayText;
}

export function LandingHeroSection() {
  const displayText = useTypewriter(TYPING_VALUES);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('landing-scroll');
    return () => root.classList.remove('landing-scroll');
  }, []);

  return (
    <section className="relative overflow-hidden px-8 py-[var(--s-11)] min-h-[calc(100svh-60px)] flex items-center border-b border-[var(--md-sys-color-outline-variant)]">
      <div className="mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-8)]">
        <div className="flex flex-col gap-0">
          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.44, delay: 0.08, ease: EASE_OUT }}
            className="text-[clamp(30px,5.5vw,72px)] leading-[1.06] tracking-[-0.028em] font-medium text-[var(--md-sys-color-on-surface)]"
          >
            Supporter B를 통해
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.44, delay: 0.18, ease: EASE_OUT }}
            className="text-[clamp(30px,5.5vw,72px)] leading-[1.06] tracking-[-0.028em] font-medium flex items-baseline flex-wrap"
          >
            <span
              suppressHydrationWarning
              className="text-[var(--md-sys-color-primary)]"
            >
              {displayText}
            </span>
            <span className="blink-cursor text-[var(--md-sys-color-primary)]">|</span>
            <span className="text-[var(--md-sys-color-on-surface)]">&nbsp;만듭니다.</span>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.36, delay: 0.46, ease: EASE_OUT }}
          className="flex flex-col items-start gap-[var(--s-4)]"
        >
          <Link href="/rfp/new">
            <Button size="lg">PG 비교 견적 무료로 시작하기 →</Button>
          </Link>
          <span className="font-mono text-[var(--text-2xs)] tracking-[0.06em] text-[var(--md-sys-color-outline)]">
            신용카드 불필요 — 입찰 시작까지 5분
          </span>
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 실행 — GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/landing/__tests__/LandingHeroSection.test.tsx
```
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add components/landing/LandingHeroSection.tsx components/landing/__tests__/LandingHeroSection.test.tsx
git commit -m "feat(seo): LandingHeroSection 클라이언트 컴포넌트 (타이핑 초기값 SSR 수정)"
```

---

## Task 5: LandingHero — server component 전환

**Files:**
- Modify: `components/landing/LandingHero.test.tsx` (테스트 먼저 수정)
- Modify: `components/landing/LandingHero.tsx`

- [ ] **Step 1: LandingHero.test.tsx 수정 — RED 상태 만들기**

`components/landing/LandingHero.test.tsx`를 아래 내용으로 **전체 교체**:

```typescript
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { LandingHero } from './LandingHero'

vi.mock('motion/react', () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(tag, props, children as React.ReactNode)
    El.displayName = `motion.${tag}`
    return El
  }
  const motion = new Proxy({}, { get: (_, tag: string) => makeEl(tag) })
  return { motion, useScroll: () => ({ scrollYProgress: { on: vi.fn() } }), useMotionValueEvent: vi.fn(), useInView: () => true }
})

vi.mock('./LandingHeroSection', () => ({ LandingHeroSection: () => null }))
vi.mock('./FadeInView', () => ({
  FadeInView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/landing/SavingsCalculator', () => ({ SavingsCalculator: () => null }))
vi.mock('@/components/landing/OfferComparisonTable', () => ({ OfferComparisonTable: () => null }))
vi.mock('@/components/landing/ProcessSection', () => ({ ProcessSection: () => null }))
vi.mock('@/components/landing/FaqList', () => ({ FaqList: () => null }))

vi.mock('@/lib/stores/theme', () => ({
  useThemeStore: (selector: (s: { resolvedTheme: string; setTheme: (t: string) => void }) => unknown) =>
    selector({ resolvedTheme: 'light', setTheme: vi.fn() }),
}))

describe('LandingHero', () => {
  it('renders whatever is passed as nav prop', () => {
    render(<LandingHero nav={<a href="/test">Test Nav</a>} />)
    expect(screen.getByRole('link', { name: 'Test Nav' })).toHaveAttribute('href', '/test')
  })

  it('routes the final CTA in the contact section to /rfp/new', () => {
    render(<LandingHero />)
    const cta = screen.getByRole('link', { name: /PG견적 무료로 받기/ })
    expect(cta).toHaveAttribute('href', '/rfp/new')
  })

  it('shows the three PoC metrics', () => {
    render(<LandingHero />)
    expect(screen.getByText('0.89%')).toBeInTheDocument()
    expect(screen.getByText('4.5주')).toBeInTheDocument()
    expect(screen.getByText('2300만원')).toBeInTheDocument()
  })

  it('states 2026 free pricing with a future-paid notice', () => {
    render(<LandingHero />)
    expect(screen.getByText(/2026년\) 무료로 이용/)).toBeInTheDocument()
    expect(screen.getByText(/2달 전 사전 공유/)).toBeInTheDocument()
  })

  it('anchors the pricing, calculator, faq and contact sections', () => {
    const { container } = render(<LandingHero />)
    for (const id of ['service', 'pricing', 'calculator', 'faq', 'contact']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
  })

  it('drops the standalone process section heading', () => {
    render(<LandingHero />)
    expect(screen.queryByText('SupporterB 이용 프로세스')).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실행 — RED 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/landing/LandingHero.test.tsx
```
Expected: FAIL — `./LandingHeroSection` / `./FadeInView` not found, `'use client'` 훅 에러 포함 가능

- [ ] **Step 3: LandingHero.tsx 전체 교체**

```typescript
// components/landing/LandingHero.tsx
import type { ReactNode } from 'react';
import Link from 'next/link';
import { CheckIcon } from '@/components/icons';
import { Footer } from '@/components/shell/Footer';
import { Logo } from '@/components/primitives/Logo';
import { SavingsCalculator } from '@/components/landing/SavingsCalculator';
import { OfferComparisonTable } from '@/components/landing/OfferComparisonTable';
import { ProcessSection } from '@/components/landing/ProcessSection';
import { FaqList } from '@/components/landing/FaqList';
import { ProblemCard } from '@/components/landing/ProblemCard';
import { MetricCard } from '@/components/landing/MetricCard';
import { LandingHeroSection } from '@/components/landing/LandingHeroSection';
import { FadeInView } from '@/components/landing/FadeInView';

const PROBLEM_ITEMS = [
  {
    num: '01',
    title: '불투명한 수수료 체계',
    desc: '현재 매출 규모 대비 불투명한 수수료 체계로 인해 최종 계약 전까지 수수료를 알기 어렵습니다.',
  },
  {
    num: '02',
    title: '경쟁 없는 PG 견적',
    desc: '1곳의 PG사 견적만 받아 추가 협의 없이 주어진 조건대로 최종 계약을 진행하게 되어 수수료 인하가 어렵습니다.',
  },
  {
    num: '03',
    title: '최종 도입 전까지 승인 결과 불투명',
    desc: 'PG사 리스크팀 및 카드사 심사 전까지 최종 승인 가능 여부를 알기 어렵습니다.',
  },
  {
    num: '04',
    title: '수수료 이외 조건 협의 불가',
    desc: '정산주기, 보증보험, 가입비 등 주요 조건을 충분히 협의하지 못한 채 계약이 진행됩니다.',
  },
];

const SOLUTION_POINTS = [
  '고객사의 조건에 맞는 투명한 수수료 견적을 다수의 PG사에게 받을 수 있습니다.',
  '최종 도입 전에도 PG사 리스크팀 검토, 카드사 승인, 정산주기, 보증보험, 가입비 등의 조건을 비교할 수 있습니다.',
  '여러 PG사의 견적을 비교한 뒤 추가 협의를 진행할 수 있습니다.',
  '견적 비교와 협상 과정을 단순화하여 더 빠르게 최적 조건을 찾을 수 있습니다.',
];

const METRICS = [
  { to: 0.89, decimals: 2, unit: '%', qualifier: '절감', caption: 'PoC 고객사 평균 수수료 절감 비율' },
  { to: 4.5, decimals: 1, unit: '주', qualifier: '감소', caption: 'PG사 견적 비교 시 소요 시간 감소' },
  { to: 2300, decimals: 0, unit: '만원', qualifier: undefined, caption: 'PoC 고객사 연간 평균 수수료 절감액' },
];

const sectionCls =
  'py-[var(--s-11)] px-8 border-b border-[var(--md-sys-color-outline-variant)] scroll-mt-[var(--shell-topbar)]';
const containerCls = 'mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-9)]';
const h2Cls =
  'text-[clamp(22px,3.2vw,42px)] leading-[1.1] tracking-[-0.022em] font-medium text-[var(--md-sys-color-on-surface)]';

export function LandingHero({ nav }: { nav?: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex flex-col">

      {/* ── Nav ── */}
      <header className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-8 h-[var(--shell-topbar)] border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]">
        <Logo />
        <div className="flex items-center gap-[var(--s-3)]">{nav}</div>
      </header>

      <main className="flex-1 pt-[var(--shell-topbar)]">

        {/* ── Hero (client: 타이핑·애니메이션) ── */}
        <LandingHeroSection />

        {/* ── Problem ── */}
        <section className={sectionCls}>
          <div className={containerCls}>
            <FadeInView>
              <h2 className={h2Cls}>
                기존 PG 계약을 하면서<br />이런 불편함을 겪지 않으셨나요?
              </h2>
            </FadeInView>
            <div className="flex flex-col gap-[var(--s-4)]">
              {PROBLEM_ITEMS.map((item, i) => (
                <FadeInView key={item.num} delay={i * 0.08}>
                  <ProblemCard num={item.num} title={item.title} desc={item.desc} />
                </FadeInView>
              ))}
            </div>
          </div>
        </section>

        {/* ── Solution ── */}
        <section id="service" className={sectionCls}>
          <div className={containerCls}>
            <FadeInView>
              <h2 className={h2Cls}>
                SupporterB를 통해<br />PG 도입 문제를 해결해보세요
              </h2>
            </FadeInView>
            <ul className="flex flex-col gap-[var(--s-5)]">
              {SOLUTION_POINTS.map((point, i) => (
                <FadeInView key={point} delay={i * 0.08}>
                  <li className="flex items-start gap-[var(--s-4)]">
                    <span className="mt-0.5 shrink-0 grid place-items-center h-5 w-5 rounded-full bg-[var(--md-sys-color-tertiary)] text-[var(--md-sys-color-on-tertiary)]">
                      <CheckIcon size={13} />
                    </span>
                    <span className="text-[var(--text-md)] leading-[1.6] tracking-[-0.006em] text-[var(--md-sys-color-on-surface)]">
                      {point}
                    </span>
                  </li>
                </FadeInView>
              ))}
            </ul>
            <OfferComparisonTable />
          </div>
        </section>

        {/* ── Process ── */}
        <section id="process" className={sectionCls}>
          <div className={containerCls}>
            <ProcessSection />
          </div>
        </section>

        {/* ── Metrics ── */}
        <section className={sectionCls}>
          <div className={containerCls}>
            <FadeInView>
              <h2 className={h2Cls}>
                SupporterB를 통해 협상 비용을 절감하고<br />사업의 본질에 집중하세요.
              </h2>
            </FadeInView>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-[var(--s-8)]">
              {METRICS.map((m) => (
                <MetricCard
                  key={m.caption}
                  to={m.to}
                  decimals={m.decimals}
                  unit={m.unit}
                  qualifier={m.qualifier}
                  caption={m.caption}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className={sectionCls}>
          <div className={`${containerCls} gap-[var(--s-6)]`}>
            <FadeInView>
              <h2 className={h2Cls}>이용 요금</h2>
            </FadeInView>
            <FadeInView>
              <div className="flex flex-col gap-[var(--s-4)]">
                <p className="text-[clamp(18px,2.2vw,24px)] leading-[1.5] tracking-[-0.012em] text-[var(--md-sys-color-on-surface)]">
                  SupporterB는 현재(2026년) 무료로 이용 가능합니다.
                </p>
                <p className="text-[var(--text-md)] leading-[1.68] text-[var(--md-sys-color-on-surface-variant)]">
                  추후 유료로 전환될 수 있으며, 전환 2달 전 사전 공유 예정입니다.
                </p>
              </div>
            </FadeInView>
          </div>
        </section>

        {/* ── Calculator ── */}
        <section id="calculator" className={sectionCls}>
          <div className={containerCls}>
            <FadeInView>
              <h2 className={h2Cls}>직접 계산해 보세요.</h2>
            </FadeInView>
            <SavingsCalculator />
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className={sectionCls}>
          <div className="mx-auto w-full max-w-[760px] flex flex-col gap-[var(--s-9)]">
            <FadeInView>
              <h2 className={h2Cls}>자주 묻는 질문</h2>
            </FadeInView>
            <FaqList />
          </div>
        </section>

        {/* ── Final CTA / 도입문의 ── */}
        <section id="contact" className="py-[var(--s-11)] px-8 bg-[var(--md-sys-color-on-surface)] scroll-mt-[var(--shell-topbar)]">
          <div className="mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-8)]">
            <FadeInView>
              <div className="flex flex-col gap-[var(--s-3)]">
                <span className="font-mono text-[var(--text-xs)] tracking-[0.18em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                  — 도입문의
                </span>
                <h2 className="text-[clamp(24px,4vw,52px)] leading-[1.12] tracking-[-0.024em] font-medium text-[var(--md-sys-color-surface)]">
                  지금 바로 불필요한 비용은 줄이고,<br />사업의 본질에 집중하세요.
                </h2>
              </div>
            </FadeInView>
            <FadeInView delay={0.2}>
              <div className="flex flex-col items-start gap-[var(--s-5)]">
                <Link href="/rfp/new">
                  <button className="inline-flex items-center gap-2 h-12 px-6 rounded-md bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] font-mono text-[13px] tracking-[0.06em] uppercase transition-opacity duration-[140ms] hover:opacity-85 active:scale-[0.98]">
                    PG견적 무료로 받기 →
                  </button>
                </Link>
              </div>
            </FadeInView>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
```

- [ ] **Step 4: 테스트 실행 — GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/landing/LandingHero.test.tsx
```
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add components/landing/LandingHero.tsx components/landing/LandingHero.test.tsx
git commit -m "feat(seo): LandingHero server component 전환 (FadeInView·LandingHeroSection 분리)"
```

---

## Task 6: page.tsx — FAQPage·SoftwareApplication JSON-LD

**Files:**
- Modify: `app/__tests__/page.test.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: 실패하는 테스트 추가**

`app/__tests__/page.test.tsx`의 `describe` 블록 안에 아래 테스트를 추가:

```typescript
it('buyer 호스트에서 FAQPage JSON-LD script를 렌더한다', async () => {
  setHost('supporter-b.com');
  const { container } = render(await RootPage());
  const scripts = container.querySelectorAll('script[type="application/ld+json"]');
  const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!));
  expect(schemas.some((s) => s['@type'] === 'FAQPage')).toBe(true);
});

it('buyer 호스트에서 SoftwareApplication JSON-LD script를 렌더한다', async () => {
  setHost('supporter-b.com');
  const { container } = render(await RootPage());
  const scripts = container.querySelectorAll('script[type="application/ld+json"]');
  const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!));
  expect(schemas.some((s) => s['@type'] === 'SoftwareApplication')).toBe(true);
});

it('FAQPage JSON-LD에 mainEntity 배열이 있다', async () => {
  setHost('supporter-b.com');
  const { container } = render(await RootPage());
  const scripts = container.querySelectorAll('script[type="application/ld+json"]');
  const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!));
  const faq = schemas.find((s) => s['@type'] === 'FAQPage');
  expect(Array.isArray(faq?.mainEntity)).toBe(true);
  expect(faq.mainEntity.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: 테스트 실행 — RED 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test app/__tests__/page.test.tsx
```
Expected: FAIL (3 new tests)

- [ ] **Step 3: app/page.tsx 수정**

```typescript
// app/page.tsx
import { headers } from 'next/headers';
import { LandingHero } from '@/components/landing/LandingHero';
import { LandingHeaderNav } from '@/components/landing/LandingHeaderNav';
import { PgLanding } from '@/components/landing/PgLanding';
import { FAQ_ITEMS } from '@/components/landing/FaqList';
import { siteConfig } from '@/lib/site-config';
import { appOrigins, hostServes } from '@/lib/site-routing';

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: siteConfig.name,
  url: siteConfig.url,
  logo: `${siteConfig.url}/icon.svg`,
  description: siteConfig.description,
};

const faqPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: '서포터비 (Supporter B)',
  alternateName: ['Supporter B', '서포터비'],
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
  description: 'PG도입을 위한 PG사 비교 견적 플랫폼',
};

export default async function RootPage() {
  const host = (await headers()).get('host');
  if (hostServes(host, appOrigins()) === 'pg') {
    return <PgLanding />;
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />
      <LandingHero nav={<LandingHeaderNav />} />
    </>
  );
}
```

- [ ] **Step 4: 테스트 실행 — GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test app/__tests__/page.test.tsx
```
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add app/page.tsx app/__tests__/page.test.tsx
git commit -m "feat(seo): FAQPage·SoftwareApplication JSON-LD 구조화 데이터 추가"
```

---

## Task 7: app/layout.tsx — 네이버 verification 메타태그

**Files:**
- Modify: `app/layout.tsx`

> 이 변경은 Next.js `metadata` 객체 수정 1줄로, 런타임 로직 없음. 별도 단위 테스트 생략.

- [ ] **Step 1: app/layout.tsx의 metadata 객체에 verification 추가**

`app/layout.tsx`의 `export const metadata: Metadata = { ... }` 블록에 `robots` 필드 뒤에 추가:

```typescript
// 기존 robots 필드 뒤에 삽입:
verification: {
  other: { 'naver-site-verification': 'f8d3af23920f570dd4a5b13980fa0d1f43f53f5e' },
},
```

결과 — metadata 객체는 아래 구조:
```typescript
export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: siteConfig.title, template: '%s — Supporter B' },
  description: siteConfig.description,
  keywords: [...siteConfig.keywords],
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.name }],
  alternates: { canonical: '/' },
  openGraph: { ... },
  twitter: { ... },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  verification: {
    other: { 'naver-site-verification': 'f8d3af23920f570dd4a5b13980fa0d1f43f53f5e' },
  },
  icons: { ... },
};
```

- [ ] **Step 2: 커밋**

```bash
git add app/layout.tsx
git commit -m "feat(seo): 네이버 서치어드바이저 verification 메타태그 추가"
```

---

## Task 8: 전체 그린 확인

- [ ] **Step 1: 전체 테스트 스위트 실행**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test
```
Expected: 모든 기존 테스트 + 신규 테스트 PASS

- [ ] **Step 2: 타입체크**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm tsc --noEmit 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach)'"
```
Expected: 에러 0건 (타입체크 기존 알려진 vitest globals 에러 제외)

- [ ] **Step 3: lint**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm lint
```
Expected: 에러 0건

---

## 배포 후 수동 체크리스트

배포 완료 후 진행:

- [ ] [네이버 서치어드바이저](https://searchadvisor.naver.com) → `supporter-b.com` 사이트 소유권 확인
- [ ] sitemap.xml 제출: `https://supporter-b.com/sitemap.xml`
- [ ] [Google Search Console](https://search.google.com/search-console) → 소유권 확인 → sitemap 제출
- [ ] [Google Rich Results Test](https://search.google.com/test/rich-results) → `https://supporter-b.com` → FAQPage 리치 결과 확인
