# 히어로 순환 헤드라인 모바일 줄바꿈 안정화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 히어로 순환 헤드라인(`HeroKineticHeadline.tsx`)이 모바일 폭에서 문구 길이에 따라 줄 수가
바뀌며 레이아웃이 들썩이는 문제를 없앤다.

**Architecture:** `md:` 브레이크포인트(768px) 기준으로 CSS 반응형 유틸리티만으로 데스크톱(한 줄
흐름)과 모바일(줄 분리) 레이아웃을 한 마크업에서 표현한다. 순환 문구는 `whitespace-nowrap` +
모바일 전용 폰트 축소로 자체 줄바꿈도 막는다. `ScrambleText` 컴포넌트 로직은 건드리지 않는다.

**Tech Stack:** Next.js App Router, React 19, Tailwind v4, `motion/react`.

## Global Constraints

- 변경 파일은 `components/landing/hero/HeroKineticHeadline.tsx` 1개뿐 — `ScrambleText.tsx`는
  `className`으로 `whitespace-nowrap`을 받는 것 외 수정 없음.
- 데스크톱(`md:` 이상)의 현재 시각적 결과는 픽셀 단위로 동일해야 한다.
- 마크업/스타일만 변경하고 JS 상태·조건 분기를 추가하지 않는다 → CLAUDE.md TDD 하드룰의
  "시각/스타일만 손대는 변경" 면제 대상. 실패 테스트를 먼저 쓰는 절차는 생략하고, 대신
  브라우저 육안 검증으로 대체한다(Task 2).
- 모바일 전용 폰트 clamp: `max-md:text-[clamp(22px,7.2vw,34px)]` — 320~430px 폭에서 최장 순환
  문구(12자, 예: `정보 비대칭 없는 계약을`)가 한 줄에 들어가야 한다. 실측 후 부족하면 이 값만
  조정한다(다른 값은 스펙에 없음).
- 데스크톱 간격은 컨테이너 `md:gap-x-2`로 처리하고, 기존 `&nbsp;`는 제거한다.

---

### Task 1: `HeroKineticHeadline.tsx` 반응형 레이아웃 분리 + nowrap 적용

**Files:**
- Modify: `components/landing/hero/HeroKineticHeadline.tsx` (전체, 67줄)

**Interfaces:**
- Consumes: `ScrambleText`(`./ScrambleText`)의 기존 props `{ phrases: string[]; className?: string }` —
  변경 없음, `className`에 `whitespace-nowrap`을 추가로 넘길 뿐.
- Produces: `HeroKineticHeadline()` — named export, props 없음. `HeroPinnedScene.tsx`(다른 파일,
  이번 태스크에서 수정하지 않음)가 그대로 `<HeroKineticHeadline />`로 사용 — export 시그니처
  불변.

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

`components/landing/hero/HeroKineticHeadline.tsx` 전체를 다음으로 덮어쓴다:

```tsx
'use client';

import { Fragment, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { EASE_OUT } from '@/lib/landing/ease';
import { ScrambleText } from './ScrambleText';

const TYPING_VALUES = [
  '협상의 주도권을',
  '연간 수천만 원의 절감을',
  '정보 비대칭 없는 계약을',
  'PG사 간 공정한 경쟁을',
  '5분짜리 경쟁 입찰을',
];

const LINE1_WORDS = ['Supporter', 'B를', '통해'];

const headlineCls =
  'text-[clamp(30px,5.5vw,72px)] max-md:text-[clamp(22px,7.2vw,34px)] leading-[1.06] tracking-[-0.028em] font-medium break-keep';

// 단어별 마스크 리빌 — overflow-hidden 마스크 안에서 글자가 아래에서 솟아오른다(키네틱 타이포).
// 마스크에 살짝 세로 여유(pb/-mb)를 줘 정착 후 글리프가 잘리지 않게 한다.
function MaskedWord({ word, delay }: { word: string; delay: number }) {
  return (
    <span className="inline-block overflow-hidden align-top pb-[0.08em] -mb-[0.08em]">
      <motion.span
        initial={{ y: '112%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, delay, ease: EASE_OUT }}
        className="inline-block will-change-transform"
      >
        {word}
      </motion.span>
    </span>
  );
}

// 줄 단위 마스크 리빌 — 순환 문구와 "만듭니다."를 각자 독립된 마스크로 감싼다. 데스크톱은
// md:flex-row로 한 줄에 나란히 놓이고(둘 다 같은 delay라 동시에 리빌되어 기존과 동일하게
// 보인다), 모바일은 flex-col로 각자 자기 줄이 되어 문구 길이 차이가 다른 줄의 줄바꿈에
// 영향을 주지 않는다.
function MaskedLine({ children, delay }: { children: ReactNode; delay: number }) {
  return (
    <div className="overflow-hidden pb-[0.08em] -mb-[0.08em]">
      <motion.div
        initial={{ y: '112%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, delay, ease: EASE_OUT }}
        className="will-change-transform"
      >
        {children}
      </motion.div>
    </div>
  );
}

// 다크 오프닝 씬 위의 헤드라인 — 색은 inverse-* 토큰(라이트 테마에서 near-black 위 라이트 텍스트,
// 다크 테마에서는 반전)으로 해석돼 파이널 CTA 인버티드 섹션과 같은 규칙을 따른다.
export function HeroKineticHeadline() {
  return (
    <div className="flex flex-col gap-0">
      <h1 className={`${headlineCls} text-[var(--md-sys-color-inverse-on-surface)]`}>
        {LINE1_WORDS.map((word, i) => (
          <Fragment key={word}>
            <MaskedWord word={word} delay={0.08 + i * 0.07} />
            {i < LINE1_WORDS.length - 1 ? ' ' : null}
          </Fragment>
        ))}
      </h1>
      <div
        className={`${headlineCls} flex flex-col md:flex-row md:flex-wrap md:items-baseline md:gap-x-2`}
      >
        <MaskedLine delay={0.32}>
          <ScrambleText
            phrases={TYPING_VALUES}
            className="whitespace-nowrap text-[var(--md-sys-color-inverse-primary)]"
          />
        </MaskedLine>
        <MaskedLine delay={0.32}>
          <span className="text-[var(--md-sys-color-inverse-on-surface)]">만듭니다.</span>
        </MaskedLine>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: typecheck로 타입 오류 없는지 확인**

Run: `pnpm tsc --noEmit`
Expected: 에러 없음(0 errors). `ReactNode` import와 `MaskedLine` props 타입이 올바르게
해석되는지가 핵심 확인 포인트.

- [ ] **Step 3: lint 확인**

Run: `pnpm lint`
Expected: `components/landing/hero/HeroKineticHeadline.tsx` 관련 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add components/landing/hero/HeroKineticHeadline.tsx
git commit -m "fix(landing): 히어로 순환 헤드라인 모바일 줄바꿈 안정화

md 미만에서 순환 문구/만듭니다를 독립된 줄로 분리하고 nowrap+폰트 축소로
문구 길이에 따른 줄 수 변화를 없앤다. 데스크톱 레이아웃은 변경 없음."
```

---

### Task 2: 브라우저 육안 검증 (320/375/430px + 데스크톱)

**Files:** 없음 (검증 전용 태스크, 코드 변경 없음)

**Interfaces:**
- Consumes: Task 1에서 수정된 `HeroKineticHeadline.tsx`가 반영된 로컬 dev 서버.
- Produces: 없음 — 통과/실패 판정과 필요 시 `max-md:text-[clamp(...)]` 값 조정만 남긴다.

- [ ] **Step 1: dev 서버 기동**

Run: `pnpm dev` (백그라운드 실행)
Expected: `http://localhost:3000` (또는 프로젝트 설정 포트)에서 정상 기동.

- [ ] **Step 2: 랜딩 페이지에서 히어로 섹션까지 스크롤**

브라우저(claude-in-chrome 또는 Playwright)로 랜딩 페이지(`/`)를 열고, 다크 오프닝 씬이
보이는 히어로 상단까지 스크롤한다(`HeroPinnedScene`은 스크롤 진행에 따라 텍스트가
페이드아웃되므로 헤드라인이 완전히 보이는 최상단에서 확인).

- [ ] **Step 3: 뷰포트 320px에서 확인**

뷰포트 폭을 320px로 리사이즈하고, 순환 문구가 5개(`협상의 주도권을` → `연간 수천만 원의
절감을` → `정보 비대칭 없는 계약을` → `PG사 간 공정한 경쟁을` → `5분짜리 경쟁 입찰을`)
한 바퀴(약 14초, `holdMs 2000 + scrambleMs 800` × 5) 도는 동안 스크린샷을 몇 장 찍어 비교.

Expected:
- `Supporter B를 통해` / 순환 문구 / `만듭니다.`가 각각 독립된 줄(3줄 고정).
- 순환 문구가 어떤 값이든 그 줄 안에서 한 줄을 유지(내부 줄바꿈 없음).
- 문구가 바뀌어도 전체 헤드라인 블록 높이가 흔들리지 않음.

- [ ] **Step 4: 뷰포트 375px, 430px에서 반복 확인**

Step 3과 동일한 절차를 375px, 430px에서도 수행.

Expected: 320px와 동일한 3줄 고정 결과. 만약 특정 문구가 여전히 자기 줄 안에서 넘치거나
줄바꿈되면, Task 1의 `max-md:text-[clamp(22px,7.2vw,34px)]` 값을 낮춰(예: 상한을 32px로)
재적용 후 다시 확인.

- [ ] **Step 5: 데스크톱(예: 1440px)에서 회귀 확인**

뷰포트를 1440px로 리사이즈하고 동일하게 순환을 관찰.

Expected: 기존과 동일하게 `Supporter B를 통해 [순환 문구] 만듭니다.`가 한 줄에 나란히
표시되고, 줄바꿈 없이 흐름. 변경 전 스크린샷(선택)과 비교해 폰트 크기·간격이 달라지지
않았는지 확인.

- [ ] **Step 6: 모든 뷰포트에서 이상 없으면 완료 보고, 이상 있으면 Task 1 Step 1의 clamp 값만 수정하고 Step 2~4 재확인**

수정이 있었다면:

```bash
git add components/landing/hero/HeroKineticHeadline.tsx
git commit -m "fix(landing): 모바일 헤드라인 clamp 값 미세 조정 (육안 검증 반영)"
```
