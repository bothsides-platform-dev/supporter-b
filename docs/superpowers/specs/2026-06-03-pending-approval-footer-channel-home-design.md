# /pending-approval — 푸터·채널톡 노출 + 홈 버튼

- **날짜**: 2026-06-03
- **브랜치**: `fix/pending-approval-footer-channel-home`
- **상태**: 설계 확정 (구현 대기)

## 문제

`/pending-approval` 화면에서 두 가지가 보이지 않는다:

1. **푸터(Footer)** — `(public)/layout.tsx`가 하단에 `<Footer />`를 렌더링하지만 화면에 안 보인다.
2. **채널톡 FAB** — 루트 `app/layout.tsx`에서 채널톡이 boot되고 화면 문구도 "궁금한 점은 우측 하단 채널톡으로 문의해요"라고 안내하지만, FAB이 보이지 않는다.

추가로, pending 유저가 이 화면을 벗어날 **"홈으로 가기"** 동선이 없다.

## 원인 분석 (단일 원인)

두 증상의 원인은 **하나**다.

`/pending-approval`이 보여주는 두 화면 컴포넌트가 모두 **뷰포트 전체를 덮는 불투명 풀스크린 오버레이**다:

- `components/pending-approval/approval-waiting-screen.tsx` — 루트 래퍼 `fixed inset-0 z-50 bg-[var(--md-sys-color-surface)]`
- `components/pending-approval/email-verify-screen.tsx` — 루트 래퍼 `fixed inset-0 z-50 ... bg-[var(--md-sys-color-surface)]`

결과:

- **푸터**: public 레이아웃 하단에 정상 렌더링되지만, `z-50` 불투명 오버레이가 그 위를 통째로 덮어 가려진다. DOM엔 존재하나 페인팅 단계에서 숨겨짐.
- **채널톡 FAB**: 루트 레이아웃에서 boot되며 `zIndex: 40`으로 떠 있다. 오버레이가 `z-50`이라 `50 > 40` → FAB이 오버레이 뒤에 깔려 보이지 않는다.

참고:
- FAB을 숨기는 `ChannelTalkHideButton`은 `(app)/layout.tsx`(인증 앱 셸)에서만 렌더링된다. `/pending-approval`은 `(public)` 라우트 그룹이므로 이 버튼이 동작하지 않고, **원래 FAB이 보이는 게 정상**이다. 즉 현재 미노출은 버그.
- `app/page.tsx`(RootPage)는 리다이렉트 로직이 없는 순수 랜딩 페이지 렌더다. pending/미인증 로그인 유저도 `/`로 이동해 머무를 수 있다(리다이렉트 바운스 없음) — "홈으로 가기" 목적지로 안전. (2026-06-03 코드 기준 확인)

## 해결 접근 — 오버레이 제거 (de-overlay)

두 화면을 풀스크린 오버레이가 아니라 **public 레이아웃 안의 일반 흐름(in-flow) 콘텐츠**로 전환한다. 그러면 헤더·푸터·채널톡 FAB이 자연스럽게 모두 보인다. 채널톡은 z-index를 손댈 필요가 없다 — 오버레이가 사라지므로 z-40 FAB이 그대로 노출된다.

> 기각한 대안:
> - **오버레이 유지 + 푸터 복제 + FAB z-index 끌어올리기** — 해킹성. 푸터 중복, z-index 싸움.
> - **오버레이를 부분 영역으로 축소** — de-overlay의 어정쩡한 버전.

## 변경 상세

### 1. `EmailVerifyScreen`

- 루트 래퍼를 `fixed inset-0 z-50 flex ... bg-[var(--md-sys-color-surface)]` → **일반 흐름 컨테이너**로 변경.
  - 배경·정렬은 public 레이아웃이 이미 제공한다: `<main>`이 `max-w-[400px]`, 상단 정렬(`items-start`). login/signup과 동일한 모양.
- 기존 제목("이메일을 인증해 주세요")·안내문·`EmailVerifySection`은 그대로 유지.
- 본문 맨 아래에 **홈으로 가기** 버튼 추가.

### 2. `ApprovalWaitingScreen` (콘페티 처리)

- **콘페티 캔버스**는 `fixed inset-0 pointer-events-none` **투명** 오버레이로 유지한다. 파티클은 뷰포트 전체를 덮되, `pointer-events-none`이 푸터·채널톡·홈 버튼 클릭을 통과시킨다. 솔리드 배경(`bg-surface`)은 제거(투명).
- **콘텐츠**(아이콘 버튼·제목·Chip·안내문)는 일반 흐름으로 전환하고 `relative z-10`으로 감싼다 → 콘페티가 콘텐츠 뒤로 가는 현행 룩 유지.
- 본문 맨 아래에 **홈으로 가기** 버튼 추가.
- **트레이드오프(승인됨)**: 기존 풀스크린 *세로 중앙* 정렬 → 상단 정렬(login 등 다른 public 페이지와 동일)로 바뀐다. 콘페티로 축하 느낌은 유지.

### 3. 홈으로 가기 버튼

- `next/link`의 `<Link href="/">` — 클릭 시 랜딩 페이지 `/`로 이동.
- 스타일: Button primitive의 `text` 변형(보조 동작이라 은은하게).
- 라벨: **"홈으로 가기"**.
- 두 화면 모두 본문 콘텐츠 맨 아래에 배치.

## 테스트 (TDD)

- **홈 버튼 = 네비게이션 요소** → RED 먼저.
  - `components/pending-approval/__tests__/EmailVerifyScreen.test.tsx`와 `components/pending-approval/approval-waiting-screen.test.tsx`(둘 다 존재) 양쪽에 단언 추가:
    `screen.getByRole('link', { name: /홈/ })` 가 존재하고 `href="/"` 인지.
  - `pnpm test <path>`로 빨갛게 떨어지는 것 확인 후 구현.
- **오버레이 제거(푸터/채널톡 노출)** 자체는 레이아웃·3rd-party SDK 영역이라 의미 있는 단위 테스트가 어렵다 → 구조적 수정 + 수동 브라우저 확인으로 검증. 기존 테스트는 그린 유지.
- 노드 버전 주의: jsdom 컴포넌트 테스트는 node 20으로 실행
  (`PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test ...`).

## 영향 범위 (파일)

- `components/pending-approval/approval-waiting-screen.tsx`
- `components/pending-approval/email-verify-screen.tsx`
- `components/pending-approval/__tests__/EmailVerifyScreen.test.tsx`
- `components/pending-approval/approval-waiting-screen.test.tsx`

레이아웃(`app/(public)/layout.tsx`)·채널톡 컴포넌트·루트 레이아웃은 **수정하지 않는다** (이미 올바름).

## 검증 (Definition of Done)

- [ ] 홈 버튼 테스트 RED → GREEN
- [ ] `/pending-approval`(심사 대기 상태)에서 푸터 + 채널톡 FAB + 홈 버튼이 모두 보임 (브라우저 확인)
- [ ] `/pending-approval`(미인증 상태)에서도 동일하게 보임
- [ ] 콘페티가 여전히 동작하고 푸터/FAB/버튼이 클릭 가능
- [ ] `pnpm test` 그린, `pnpm tsc --noEmit` / `pnpm lint` 클린
