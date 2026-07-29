# 서포트비 — 디자인 시스템 (Linear)

> 짝 문서: [SCREEN_DESIGN.md](./SCREEN_DESIGN.md) (화면·IA·UX) · [CLAUDE.md](./CLAUDE.md) (스택·라우팅·규칙)
> 본 문서: Linear 디자인 언어 토큰, 타이포그래피, 컬러, 컴포넌트 시각 원칙

---

## 1. 미적 방향 — Linear

[Linear](https://linear.app)의 디자인 언어를 채용한다. 조밀하고 빠르며, 구조는 그림자가 아닌 **저대비 보더와 표면 명도 단계**로 표현한다. B2B 결제 RFP 같은 정보 밀도 높은 도구에 잘 맞는다. 라이트 모드가 기본, 다크 모드는 Linear 시그니처 near-black(`#08090A`).

> **호환성 메모**: 토큰 *이름*은 직전 MD3 시스템(`--md-sys-color-*` 등)을 그대로 유지한다 — 값만 Linear로 교체했다. 이름이 `md-sys`라서 MD3가 아니다. 시각 결정의 캐노니컬은 본 문서다.

**4대 원칙**
1. **구조는 느껴지되 보이지 않게** — 1px 저대비 보더(`outline-variant`)가 구획을 만든다. 그림자는 떠 있는 요소(팝오버·다이얼로그·command palette)에만.
2. **표면 명도 계층** — 캔버스 → 사이드바/패널 → elevated 순으로 명도를 한 단계씩 올려(다크)/내려(라이트) 깊이를 표현. 사이드바는 콘텐츠보다 한 톤 dim.
3. **조밀하고 빠르게** — 행 높이 ~32px, 본문 14px, 버튼 높이 28–36px(기본 `md` 32px). 인터랙션 피드백은 100ms 이내, transform/opacity/color만 애니메이트. **랜딩·마케팅 면은 이 모션 제약에서 면제**된다(§9 "랜딩·마케팅 모션" 예외).
4. **수치는 모노** — 금융 값(₩, %, 건수, 날짜, 제안번호)은 `.md-numeric`(tabular-nums). 수치 정렬이 신뢰의 시각이다.

---

## 2. 컬러 시스템

액센트: primary `#0061A4` (신뢰 블루). 다크 캔버스: `#08090A`. 색은 라이트 기본값이며, `.dark` 가 Linear 시그니처 다크로 오버라이드한다.

### Primary — 신뢰 블루 액센트
| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--md-sys-color-primary` | `#0061A4` | `#9ECAFF` | 주요 버튼, 포커스 링, 선택 |
| `--md-sys-color-on-primary` | `#FFFFFF` | `#003258` | primary 위 텍스트 |
| `--md-sys-color-primary-container` | `#D1E4FF` | `#004A77` | 선택된 nav 행, 연한 액센트 틴트 |
| `--md-sys-color-on-primary-container` | `#001D36` | `#D1E4FF` | 위 텍스트 |

### Secondary — 뉴트럴 슬레이트
| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--md-sys-color-secondary` | `#6B7079` | `#C0C4CC` | 중립 강조(on-surface-variant 계열) |
| `--md-sys-color-secondary-container` | `#EDEEF2` | `#26282C` | `tonal` IconButton·secondary Avatar 배경 |
| `--md-sys-color-on-secondary-container` | `#2A2D33` | `#E4E5E9` | 위 텍스트 |

### Tertiary / Error / Warning (+ 컨테이너)
| 토큰 | 라이트 | 컨테이너(라이트) bg / on | 용도 |
|---|---|---|---|
| `--md-sys-color-tertiary` | `#1F9D55` | `#D6F5E3` / `#06351C` | 성공·선정·온라인 dot |
| `--md-sys-color-error` | `#E5484D` | `#FFE5E5` / `#5A1115` | 오류, 위험 액션 |
| `--md-sys-color-warning` | `#D9730D` | `#FCEBD2` / `#4A2A05` | 보류/대기 |

컨테이너(`*-container` / `on-*-container`)는 Chip·Avatar·tonal 표면의 뮤트 배경/텍스트로 쓰인다 — Chip color 매핑(성공→tertiary·오류→error·보류→warning·중립→surface·주요→primary)이 이 값을 소비한다. 다크 값과 secondary 컨테이너는 `tokens.css`.

### Surface 계층 — 명도 단계
```
라이트                                          다크
background               #FFFFFF  캔버스         #08090A
surface (사이드바·패널)   #FBFBFC               #0F1011
surface-container-low    #F7F8F9  카드          #141517
surface-container        #F1F2F4  hover         #161718
surface-container-high   #EBECEF  선택/강한 hover #1C1D1F
surface-container-highest #E4E5E9               #202123
```

> 계층 끝단·기타: `surface-bright`(라이트 `#FFFFFF` / 다크 `#202123`)·`surface-dim`(라이트 `#ECEDF0` / 다크 `#08090A`)은 명도 계층의 양극단. `surface-container-lowest`(라이트 `#FFFFFF` / 다크 `#08090A`)는 **popover·dropdown 배경**(`--color-popover`). 스켈레톤 바는 `surface-container-high`.

**브라우저 크롬·PWA 색은 캔버스(`background`)를 따른다.** 모바일 상태바(`viewport.themeColor`, `app/layout.tsx`)와 PWA 스플래시(`theme_color`·`background_color`, `app/manifest.ts`)가 캔버스와 다르면 앱 진입 시 색이 튄다. 라이트 `#FFFFFF` / 다크 `#08090A`이며, web app manifest 는 라이트/다크 변형을 담지 못하므로 라이트 기준 단일값으로 고정한다. `app/__tests__/chrome-colors.test.ts` 가 `styles/tokens.css` 를 직접 읽어 일치를 고정하므로, 캔버스 토큰을 바꾸면 이 두 파일도 함께 갱신해야 한다.

> 크롬 색은 **런타임에 실효 테마를 따라간다.** `viewport.themeColor` 의 정적 선언은 `prefers-color-scheme`(OS 설정)으로만 분기하므로 그것만으로는 인앱 토글로 OS 와 다른 테마를 고른 사용자의 상태바가 캔버스와 어긋난다. `lib/theme/chrome-color.ts` 의 `syncChromeColor` 가 그 간극을 닫는다.
>
> 방식은 **media 없는 `<meta name="theme-color">` 하나를 `<head>` 맨 앞에 만들어 소유하는 것**이다. HTML 은 "tree order 상 `media` 가 매치되는 **첫** theme-color 태그"를 쓰므로, media 가 없어 항상 매치되는 태그를 맨 앞에 두면 뒤따르는 Next 의 media 스코프 태그 두 개를 항상 이긴다. 그 둘은 손대지 않은 채 JS 이전 첫 페인트·무JS 환경의 OS 기준 폴백으로 남는다. **Next 가 소유한 태그를 직접 덮어쓰면 안 된다** — 하이드레이션에서 React 가 서버 렌더 값과 달라진 태그를 매칭하지 못해 같은 name 의 스테일 태그를 되살린다(초안에서 theme-color 3개가 관측됐고, `e2e/theme-persistence.spec.ts` 의 "하이드레이션 후에도 …" 케이스가 이 회귀를 잠근다).
>
> 호출 지점은 둘이다: 테마 스토어의 단일 초크포인트 `applyTheme`(`lib/stores/theme.ts` — 명시 set·system resolve·matchMedia change·rehydrate 가 전부 여기로 모인다)과 `app/layout.tsx` 의 FOUC 방지 인라인 스크립트(하이드레이션 전 구간 담당, 번들 이전에 실행돼야 해 모듈을 import 할 수 없어 같은 로직이 인라인으로 한 벌 더 있다). 캔버스 hex 의 JS 사본은 `lib/theme/canvas-colors.ts` 하나이며, `app/__tests__/chrome-colors.test.ts` 가 tokens.css → `CANVAS_COLOR` → viewport/manifest 체인과 "layout·manifest 에 hex 리터럴 없음"을 함께 고정한다.

### 텍스트 · 보더
| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--md-sys-color-on-surface` | `#1F2023` | `#F7F8F8` | 주 텍스트 |
| `--md-sys-color-on-surface-variant` | `#5F646D` | `#8A8F98` | 보조/메타 텍스트, 아이콘 |
| `--md-sys-color-outline` | `#D4D6DC` | `#2E3033` | 강한 보더 (인풋 포커스 전) |
| `--md-sys-color-outline-variant` | `#E8E9EC` | `#23252A` | **저대비 보더/디바이더 (기본)** |

> 저대비 보더는 의도된 선택이다 — "구조는 느껴지되 보이지 않게". 라이트 `outline-variant`는 WCAG AA 비텍스트 대비(3:1) 미달이며, 이는 Linear 룩의 핵심이지 버그가 아니다.

> **하드룰 — `outline` 은 보더 전용, 텍스트·아이콘에 쓰지 않는다.** 위 저대비 예외는 **보더**에 한정된다. `outline` 을 글자색으로 쓰면 라이트 1.41:1(#D4D6DC on #FBFBFC)·다크 1.45:1(#2E3033 on #0F1011) 로, 본문 기준(4.5:1)은 물론 인터랙티브 글리프(× 제거 버튼)가 지켜야 할 비텍스트 기준(3:1)에도 못 미친다. 보조·메타 텍스트와 아이콘은 `on-surface-variant` 를 쓴다.
>
> **3차 텍스트 톤은 색으로 만들지 않는다.** `on-surface-variant` 보다 옅으면서 AA 를 통과하는 색은 사실상 존재하지 않는다 — 라이트 `surface` 위에서 4.5:1 을 지키는 상대휘도 상한이 L≤0.175 인데 `on-surface-variant` 가 이미 L=0.161 이다. 보조 텍스트 아래 위계는 색이 아니라 **타입스케일(크기·굵기)** 로 만든다.
>
> **AA 는 `surface` 하나가 아니라 모든 표면 계층에서 성립해야 한다.** 라이트 `on-surface-variant` 는 원래 `#6B7079` 였는데 `surface`(#FBFBFC) 위 4.81:1 로는 통과하면서 배경이 짙어지면 `surface-container` 4.44:1 · `surface-container-high` 4.21:1 · `surface-container-highest` 3.95:1 로 본문 기준 아래로 떨어졌다. 가장 짙은 계층에서도 통과하도록 **`#5F646D`(최악 4.73:1) 로 조정**했다. 다크 `#8A8F98` 은 이미 최악 4.96:1 이라 그대로다. 이 불변식은 `lib/design/__tests__/text-contrast.test.ts` 가 `styles/tokens.css` 를 직접 읽어 여덟 개 표면 토큰 전부에 대해 계산하므로, 토큰을 만지면 주장이 아니라 측정으로 검증된다. 표면 토큰을 새로 추가하면 그 목록에도 넣는다.
>
> 유일한 예외는 **AT 에서 완전히 배제된 순수 장식 구분자**(`aria-hidden`)다 — WCAG 1.4.3 의 장식 예외에 해당한다. 현재 breadcrumb 의 `/` 와 딜룸 헤더의 `·` 두 곳뿐이며, `lib/design/design-hardrule-allowlist.mjs` 의 `OUTLINE_TEXT_ALLOWLIST` 에 등재돼 있다. `lib/design/__tests__/outline-text-drift.test.ts` 가 `app/**`·`components/**`·`lib/**` 를 훑어 이 규칙과 예외의 `aria-hidden` 조건을 모두 강제한다.

### Inverse · Scrim · 유틸
| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--md-sys-color-inverse-surface` | `#1F2023` | `#F7F8F8` | **Toast·Tooltip 배경**(반전 칩) |
| `--md-sys-color-inverse-on-surface` | `#F7F8F8` | `#1F2023` | inverse 표면 위 텍스트 |
| `--md-sys-color-inverse-primary` | `#9ECAFF` | `#0061A4` | inverse 표면 위 액센트(Toast 닫기) |
| `--md-sys-color-scrim` · `-shadow` | `#000000` | `#000000` | 그림자·스크림 베이스 색 |
| `--md-sys-color-surface-tint` | `#0061A4` | `#9ECAFF` | (예약) 표면 틴트 |

스크림(모달 백드롭)은 토큰이 아니라 유틸로 적용한다 — Dialog·Sheet 는 `bg-black/10 dark:bg-white/10` + `backdrop-blur-xs`, command palette 는 더 짙은 `bg-black/40` + `backdrop-blur-[4px]`. 레이어 순서는 §11 참조.

### 워크스페이스 아바타 팔레트 — 6 hue
이름 해시로 결정되는 `WorkspaceAvatar` 배경/글자 색(`lib/utils/workspace-avatar.ts` 의 `getWorkspaceColor`). 토큰 쌍 `--workspace-avatar-{hue}-bg` / `-fg`:

| hue | 라이트 bg / fg | 다크 bg / fg |
|---|---|---|
| blue | `#D8EAFF` / `#003258` | `#162236` / `#6AADFF` |
| purple | `#E8E0FF` / `#2A1255` | `#231A45` / `#B59FFF` |
| teal | `#C8F5E8` / `#0A3025` | `#0E2E25` / `#4FD1A8` |
| orange | `#FFE8CC` / `#4A2A00` | `#2A1A10` / `#F5A05A` |
| pink | `#FFD5EE` / `#4A0825` | `#2E1029` / `#F07BB8` |
| slate | `#DDE3EF` / `#1C2030` | `#1C2030` / `#8AABCF` |

뮤트 파스텔 — 채도 낮고 라벨 대비 충분. **사용자(개인) 아바타**는 이 팔레트가 아니라 `primary/secondary/tertiary/error/surface` 컨테이너 색(§7 Avatar)을 쓴다.

---

## 3. 타이포그래피

폰트: **Pretendard Variable** (KR + Latin — Latin은 Inter 파생이라 Linear 룩에 부합) + **JetBrains Mono** (수치 전용, `.md-numeric`).

조밀·약한 음수 자간. 헤딩은 semibold(600). 본문 baseline **14px** (Linear 앱은 ~13px이나 한글 가독성 위해 14px).

| 롤 | 크기 | 굵기 | 자간 | 용도 |
|---|---|---|---|---|
| Display Large | 44px | 600 | -0.025em | 랜딩 히어로 |
| Display Medium | 36px | 600 | -0.022em | 대형 KPI |
| Display Small | 28px | 600 | -0.02em | KPI 값(`KpiCell`), 중형 강조 수치 |
| Headline Large | 28px | 600 | -0.022em | 페이지 제목 |
| Headline Medium | 24px | 600 | -0.02em | 섹션 제목 |
| Headline Small | 20px | 600 | -0.018em | 카드 제목 |
| Title Large | 20px | 600 | -0.018em | 큰 제목 |
| Title Medium | 15px | 600 | -0.011em | 강조 라벨 |
| Title Small | 13px | 600 | -0.006em | 소제목 |
| Body Large | 14px | 400 | -0.011em | 기본 본문 (`<body>` 기본값) |
| Body Medium | 13px | 400 | -0.006em | 테이블 셀, 설명문, 리스트 |
| Body Small | 12px | 400 | 0 | 캡션 |
| Label Large | 13px | 500 | -0.006em | 버튼, nav, Chip |
| Label Medium | 12px | 500 | 0 | 태그, 보조 라벨 |
| Label Small | 11px | 500 | 0.01em | 메타 라벨 |

### 금융 데이터 카브아웃 — `.md-numeric`
```css
.md-numeric { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
```
적용 대상: ₩ 금액, % 수수료, 건수, 제안번호(`P-2605-0042`), 날짜, 이메일 주소 같은 식별 데이터. **내비게이션·라벨·버튼 텍스트에는 적용하지 않는다.**

### 라벨 유틸리티 — `.md-label-{small,medium,large}`

위 표의 Label 롤을 그대로 구현한 유틸리티(`app/globals.css`). 메타 라벨·`<th>`·`<legend>`·폼 라벨·상태 문구의 표준 정착지다.

```css
.md-label-small  { font-family: var(--font-sans); /* 11px · 500 · 0.01em  */ }
.md-label-medium { font-family: var(--font-sans); /* 12px · 500 · 0       */ }
.md-label-large  { font-family: var(--font-sans); /* 13px · 500 · -0.006em */ }
```

**라벨 타이포는 이 유틸리티가 유일한 표기다.** 같은 값을 토큰 나열형(`text-[length:var(--md-typescale-label-*-size)] font-[number:…-weight] leading-[…] tracking-[…]`)으로 다시 쓰지 않는다 — 렌더 결과가 같아 둘 다 살아남으면 다음 사람이 어느 쪽을 따를지 모른다. `components/primitives/Label.tsx`도 이 클래스를 얹을 뿐이다.

**단일 축만 쓰는 조합은 예외가 아니라 다른 얘기다.** 버튼·칩·아바타·탭·nav 항목처럼 **크기 토큰 하나만 가져다 쓰고 굵기·행간은 컴포넌트가 직접 소유**하는 경우(`text-[length:var(--md-typescale-label-large-size)] font-medium …`)는 경쟁 표기가 아니라 정당한 토큰 소비다. 여기에 `.md-label-*`를 씌우면 라벨용 행간·자간까지 딸려와 컨트롤 밀도가 흐트러진다. 드리프트 가드가 금지하는 것은 **크기와 굵기를 함께 손으로 박은 줄**(= 라벨 역할 전체를 나열형으로 재현한 줄)뿐이다.

셋 다 `--md-typescale-label-*` 토큰만 소비하므로 값의 단일 출처는 `styles/tokens.css`다. `.md-numeric`과 같이 `@layer base`에 있어 **Tailwind utilities 레이어가 항상 이긴다** — 사이트별 `font-normal`·`text-[13px]` 오버라이드는 그대로 유효하다.

이 유틸리티는 §9가 금지하는 `font-mono uppercase wide-tracking` 라벨 조합의 대체재다. 그 조합이 특히 나쁜 이유는 취향 문제가 아니다: `--font-mono` 스택(JetBrains Mono → ui-monospace → SF Mono → Menlo)에는 **한글 글리프가 하나도 없어** 한글 라벨이 Pretendard가 아닌 OS 기본 한글 폰트로 폴백하고, `uppercase`는 한글에 무효라 넓은 양수 자간만 남아 Linear 밀도와 정면으로 어긋난다. 강제 수단은 `lib/design/__tests__/mono-label-drift.test.ts`(fs-walk 드리프트 가드 — mono 라벨 조합 2종 + 위의 "크기+굵기 나열형" 1종, 총 3개 불변식) + `lib/design/design-hardrule-allowlist.mjs`(면제 SSOT).

### 줄바꿈 — `word-break: keep-all`

`body`에 **`word-break: keep-all` + `overflow-wrap: break-word`**를 건다(`app/globals.css`, `@layer base`). 브라우저 기본값 `word-break: normal`은 한글 음절 사이 아무 데서나 줄을 끊어 **단어를 쪼갠다** — 실측 사례: `/signing-templates` 빈 상태의 "자동으로 그 계약 / 서로 전자서명이"에서 `계약서로`가 `계약`+`서로`로 읽혔다. 한 문자열의 문제가 아니라 줄바꿈되는 모든 한글 문단이 대상이라 전역 규칙으로 둔다.

짝인 `overflow-wrap: break-word`가 없으면 공백 없는 긴 토큰(URL·이메일·`tmpl_…` 같은 외부 ID)이 좁은 컨테이너를 밀어낸다. `anywhere`가 아니라 `break-word`인 이유는, `anywhere`가 flex 아이템의 min-content 폭까지 바꿔 기존 레이아웃을 흔들기 때문이다.

국소 해제가 필요하면 Tailwind `break-normal` 한 클래스로 끈다(예: 의도적으로 좁은 칸에 긴 한글 구절을 넣어야 할 때).

---

## 4. 형태(Shape) 스케일 — 6px 지배

| 토큰 | 크기 | 적용 |
|---|---|---|
| `--md-sys-shape-none` | 0px | 분할선 |
| `--md-sys-shape-extra-small` | 4px | 작은 칩, 태그, 메뉴 아이템 |
| `--md-sys-shape-small` | **6px** | **버튼·인풋·카드·메뉴·nav 아이템 (지배적 인터랙티브 반경)** |
| `--md-sys-shape-medium` | 8px | 큰 카드 |
| `--md-sys-shape-large` | 10px | 패널 |
| `--md-sys-shape-extra-large` | 12px | 다이얼로그/모달 |
| `--md-sys-shape-full` | 9999px | Avatar, 상태 dot, 알약 |

필(pill) 버튼은 폐기했다. 인터랙티브 요소는 6px 직사각형.

---

## 5. 고도(Elevation) — 보더 우선, 그림자 최소

대부분의 면은 elevation-0 또는 1px 보더만 사용한다. 큰 그림자는 떠 있는 요소(팝오버·드롭다운·toast·다이얼로그·command palette)에만.

```
라이트                                     다크 (.dark 오버라이드)
0: none
1: 0 1px 2px rgba(0,0,0,.04)              0 1px 2px rgba(0,0,0,.40)   ← elevated 카드
2: 0 2px 8px rgba(0,0,0,.06)              0 2px 8px rgba(0,0,0,.50)   ← 드롭다운
3: 0 4px 16px rgba(0,0,0,.08)             0 4px 16px rgba(0,0,0,.55)  ← toast
4: 0 8px 24px rgba(0,0,0,.10)             0 8px 24px rgba(0,0,0,.60)
5: 0 8px 32px rgba(0,0,0,.12)             0 8px 32px rgba(0,0,0,.60)
```

`--md-sys-elevation-*`(tokens.css)는 0–5 단계다. 실제 주 소비처는 **elevation-1**(`elevated` 카드·`elevated` 버튼)과 **elevation-3**(toast). 드롭다운·다이얼로그·시트 등 포털 플로팅은 Tailwind `shadow-md`/`shadow-lg` + `ring-1 ring-foreground/10` 헤어라인으로 띄운다(elevation 토큰을 직접 안 씀). **command palette 류 큰 플로팅만 별도 `--command-palette-shadow`** — 2단 그림자 `0 2px 8px` + `0 24px 64px -8px`(라이트 .08/.18 · 다크 .4/.6, `app/globals.css`)로 elevation 토큰과 구분된다.

---

## 6. 모션 — 빠르게

| 토큰 | 값 | 용도 |
|---|---|---|
| `--md-sys-motion-easing-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | 기본 전환 (ease-out) |
| `--md-sys-motion-easing-emphasized-decelerate` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | 강조 감속 — 큰 요소 진입 |
| `--md-sys-motion-easing-emphasized-accelerate` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | 강조 가속 — 큰 요소 이탈 |
| `--md-sys-motion-duration-short-4` | **100ms** | 버튼/호버/색 변화 (cause→effect) |
| `--md-sys-motion-duration-medium-2` | 250ms | 패널/드롭다운 오픈 |
| `--md-sys-motion-duration-medium-4` | 350ms | 드로어 슬라이드 |
| `--md-sys-motion-duration-long-2` | 450ms | 큰 전환 |

규칙: **transform·opacity·color/background/border만 애니메이트**. 레이아웃 속성(width/height/top/left/margin)은 애니메이트하지 않는다. 팝오버는 트리거 요소에서 스케일. **단 랜딩·마케팅 면은 이 규칙과 `prefers-reduced-motion` 존중에서 면제된다** — §9 "랜딩·마케팅 모션" 예외.

### 로딩 모션 — 기능적 모션 허용

넓은 영역의 로딩은 **펄스 스켈레톤**(`animate-pulse`, `components/ui/skeleton.tsx` — `surface-container-high` 바·`rounded-md`), 인라인·작은 자리(타이핑 인디케이터·전송 대기 점)는 **펄스 점**으로 표시한다. 둘 다 `prefers-reduced-motion: reduce`를 존중해 저감 시 정지/단순화한다. 스피너는 새 표면에 도입하지 않되, 기존 사용처(`RefreshHeaderButton` 의 `--animate-spin`/`--animate-spin-once`, 첨부 업로드 칩)는 유지한다. 짧은 진행 표시로 `LOADING…` 텍스트(body-medium)도 그대로 둔다. **장식적** 컨페티·강한 모멘텀 모션 금지는 §9에서 유지된다(네 예외: 축하 모먼트·테마 전환 리빌·브랜드 마크 진입·랜딩/마케팅 모션). 이 갱신은 코드 현실(스켈레톤이 이미 광범위 사용 중)과 문서를 정합시킨 것이다.

> **추가 키프레임**(`app/globals.css`): `spin-once`(0.6s 1회전 — 리프레시 클릭), `process-progress`(5s scaleX — 스텝퍼 자동 전환, `prefers-reduced-motion: no-preference` 게이트). 모두 transform/opacity만 만진다.

> **코치마크 스포트라이트 링 소프트 펄스**(`.coachmark-pulse`, `app/globals.css`): 온보딩 코치마크의 타깃 강조 링에 opacity 호흡 루프(1.8s ease-in-out infinite)를 더해 시선 유도를 보강한다. opacity 전용, `prefers-reduced-motion: reduce` 존중(저감 시 정지).

---

## 7. 컴포넌트 시스템

밀도·6px·저대비 보더·서브틀 호버(배경 미세 변화)가 공통 규칙. 호버에 그림자 승급 금지.

### Button — 5개 변형 (높이 sm 28 / md 32 / lg 36px, 기본 `md`)
| Variant | 외관 | 용도 |
|---|---|---|
| `filled` | Primary/Error 솔리드(호버 = on-color 10% mix) | 주요 CTA |
| `outlined` | 저대비 보더, 호버 시 surface-container 채움 | 보조 액션 |
| `text` | 고스트, 호버 시 surface-container 채움 | 3차 액션, 취소 |
| `elevated` | surface-low + 보더 + elevation-1 | 카드 위 액션 |
| `tonal` | secondary/primary 컨테이너 | 중간 강조 |

`color`: `primary`(기본) / `error`. 반경 6px(`shape-small`). 포커스 `ring-2` primary @50%, disabled `opacity-38`(§12). 호버는 배경 변화만(그림자 없음). 코어는 `components/primitives/Button.tsx` — 앱 표준 버튼이다(별개로 shadcn `components/ui/button.tsx` 가 있으나 base-ui 래퍼용).

### Chip — 4개 유형 (높이 24px, 4px 반경)
`assist` / `filter` / `input` / `suggestion`. `color`: `primary`/`tertiary`/`warning`/`error`/`surface`(기본). 뮤트 톤.

### IconButton — 4개 변형 (6px 반경, 28/32px)
`standard` / `outlined` / `filled` / `tonal`. 아이콘은 기본 on-surface-variant, 호버 시 on-surface.

### Card — 3개 변형
`outlined`(저대비 보더, 기본 선호) / `elevated`(surface-low + 보더 + elevation-1) / `filled`(surface-container).

### Tabs
2px 하단 인디케이터(primary, `after` 의사요소 `bottom-[-1px]`). 활성 텍스트 on-surface, 비활성 on-surface-variant(호버 on-surface). 높이 36px(`h-9`), label-large. 탭별 카운트는 `.md-numeric` 로 붙는다.

> **두 레이어** — `components/primitives/*` 가 디자인 시스템 코어(앱 표준), `components/ui/*` 는 base-ui/shadcn 래퍼(오버레이·인풋 프리미티브). 둘이 겹치면 `primitives/*` 가 표준이다.

### 7.1 폼 · 입력

밑줄형(underline)과 박스형(boxed) 두 입력 스타일이 공존한다 — 견적/입찰 위저드 숫자·텍스트 필드는 **밑줄형**, 설정·다이얼로그 등 일반 폼은 **박스형**.

**Input** — 두 스타일:
- **밑줄형** (`underlineInputClass`, `components/forms/inputs.tsx`): `border-b` `outline`, `py-2`, 14px, 포커스 시 하단 보더 `on-surface`. 숫자 필드는 `numericInputClass`(= 밑줄 + `.md-numeric`).
- **박스형** (`components/ui/input.tsx`, base-ui): `h-8`(32px), `rounded-md`(6px), `border-input`(=outline), 투명 배경, `px-2.5`. 포커스 `ring-3` @50%, `aria-invalid` → error 보더 + error ring, disabled `opacity-50`.

**Field · Label**:
- `Field`(`primitives/Field.tsx`): label(label-medium, on-surface) + `required` 시 `*`(error) + 자식 + 선택 `hint`(11px, on-surface-variant, `role=note`). **인라인 에러를 렌더하지 않는다** — 저장 에러는 toast 로(멤버스 패리티). `space-y-1`.
- `Label`(`primitives/Label.tsx`): 크기 `lg/md/sm`(label 타입스케일), `muted` 기본 true(on-surface-variant)/false(on-surface), 다형 `as`.

**Select · Checkbox · Slider**:
- `Select`(`primitives/Select.tsx`): 네이티브 `<select>` 래퍼, `h-8`(32px), `rounded-md`(6px), `surface-container-low` 배경, `outline-variant` 보더, ▾ 셰브론. 포커스 primary 보더 + `ring-2 @40%`.
- `Checkbox`(`primitives/Checkbox.tsx`): 16px(`h-4 w-4`), `rounded-md`. 체크 시 primary 배경+보더 + on-primary 체크 SVG(1.4 stroke), 미체크 시 on-surface-variant 보더(호버 on-surface). 커스텀(네이티브 아님).
- `Slider`(`ui/slider.tsx`, Radix): 트랙 1px `outline`, range 1px `on-surface`, 썸 14×14 `surface` 배경 + `on-surface` 보더 `rounded-md`, 호버 `scale-110`(140ms). Linear 1px 트랙.

**숫자 입력** (`react-number-format`, `components/forms/inputs.tsx`) — 모두 `.md-numeric` + 밑줄형:
- `CurrencyInput` — 천단위 구분·소수점 차단·`원` 접미·한글 환산 힌트(tertiary 11px).
- `PercentInput` — 소수 2자리·`%` 접미·"1만원당 N원" 환산 힌트.
- `DayOffsetInput` — D/W/M `Select` + 정수, `D+N` 정규 문자열 emit(정산주기).
- `FeeRateCell` — 라벨 없는 그리드 셀(우대수수료 매트릭스). 포커스/호버 시 환산 툴팁(`surface-container` + `outline-variant`, 4px, 11px mono).

라벨 옆 ⓘ 설명은 `InfoTip`(§7.2 용어집).

**RequiredMark — 3상태 필수 마커** (`components/rfp/RequiredMark.tsx`): `Chip`(`variant="assist"`) 위 얇은 래퍼로 필드 입력 상태를 칩으로 표기한다. `empty` = surface 색 "필수", `filled` = tertiary 색 "입력 완료" + Check 아이콘, `error` = error 색 "필수". 상태는 `lib/rfp/required-fields.ts` 의 `MarkerState`(SSOT)에서 파생 — 마커·스텝 게이팅·제출 차단이 한 출처를 공유한다.

### 7.2 표면 · 오버레이

base-ui/Radix 래퍼(`components/ui/*`). 공통: 작은 반경(4–12px), 큰 그림자는 floating 에만, 100ms fade + `zoom-95` 진입. 전부 `z-50`(§11).

**Dialog · ConfirmDialog**:
- `Dialog`(`ui/dialog.tsx`, base-ui): 백드롭 `bg-black/10 dark:bg-white/10` + `backdrop-blur-xs`. 콘텐츠 `shape-extra-large`(12px), `popover` 배경, `p-4`, `ring-1 ring-foreground/10` 헤어라인, `zoom-in-95` 진입. 타이틀 16px(font-heading medium), 푸터 `bg-muted/50` 상단 보더.
- `ConfirmDialog`(`ui/confirm-dialog.tsx`): 예/아니오 + 로딩. `max-w-420px`, 푸터 = `outlined` 취소 + `filled`(또는 `error`) 확인, `loading` 시 양쪽 disabled + 확인 라벨 `LOADING…`.

**Sheet (Drawer)** (`ui/sheet.tsx`, base-ui): top/right/bottom/left 변형, 모바일 `w-3/4`·`sm:max-w-sm`, `shadow-lg`. 슬라이드 **350ms**(`duration-medium-4`) + opacity. 모바일 사이드바·채팅 시트가 소비.

**DropdownMenu** (`ui/dropdown-menu.tsx`, base-ui Menu): Popup `rounded-md`(6px), `popover` 배경, `p-1`, `shadow-md` + `ring-1 ring-foreground/10`. 아이템 `rounded-md`·`px-1.5 py-1`·text-sm, 포커스 `bg-accent`(primary-container). `variant="destructive"` = error 텍스트 + `bg-destructive/10` 포커스. 구분선 `h-px bg-border`.

**Tooltip · InfoTip**:
- `Tooltip`(`ui/tooltip.tsx`, base-ui): `shape-extra-small`(4px), `bg-foreground`(반전 near-black/white) + `text-background`, `px-3 py-1.5`, 12px, 화살표. `delay=0`. Toast 와 같은 반전 톤.
- `InfoTip`(`ui/info-tip.tsx`, base-ui Popover): 어려운 용어 옆 18px ⓘ(아이콘 14px). 카드 `shape-extra-small`(4px) + `outline-variant` 보더 + `surface-container` 배경 + `shadow-md`, 13px. 호버 오픈(delay 150). 설명은 `lib/glossary.ts` 단일 출처. (Tooltip 과 달리 보더 있는 밝은 카드.)

**Accordion · Separator**:
- `Accordion`(`ui/accordion.tsx`, base-ui): 헤어라인(`border-t` + 아이템 `border-b` `outline-variant`)만, 그림자 없음. 트리거 `py-3`·13px·500. 셰브론 16px `rotate-180`(transform, 150ms). 패널 fade. `badge` 슬롯(예: 대기 N건 칩).
- `Separator`(`ui/separator.tsx`, base-ui): 1px `outline-variant`(가로 `h-px`/세로 `w-px`). 저대비가 기본.

### 7.3 데이터 · 상태 표시

**EmptyState** (`primitives/EmptyState.tsx`): 중앙 정렬 세로(`gap-4 py-20`), 라인 SVG 아이콘 **48px @1.5 stroke**(on-surface-variant), 타이틀(title-large, on-surface), 설명(body-medium, on-surface-variant, `max-w-sm`), 선택 `action` 슬롯. 빈/에러 상태 통일 진입점(에러 = EmptyState + "다시 시도" 액션). 일러스트 금지(§9).

**Skeleton (로딩)** (`ui/skeleton.tsx`): `animate-pulse` + `rounded-md` + `surface-container-high` 바. 폭/높이는 className. 라우트 `loading.tsx`(messages/rfp/notifications)·홈·칸반·인박스·스레드가 소비. 모션 원칙은 §6.

**Toast** (`shell/Toaster.tsx`, base-ui Toast): 뷰포트 **우하단**(`bottom-5 right-5`, z-50). 칩 `max-w min(92vw,24rem)`, `shape-extra-small`(4px), **`inverse-surface` 배경**(반전), `px-4 py-3`, `elevation-3`, 슬라이드 200ms. `success` = 좌측 `border-l-2` tertiary. 타이틀 body-medium(inverse-on-surface), 닫기 inverse-primary. `import { toast } from '@/lib/toast'`.

**KpiCell** (`primitives/KpiCell.tsx`): 라벨(label-medium, on-surface-variant) + 값(**display-small**, `.md-numeric`, on-surface) + 선택 델타(↑ tertiary / ↓ error / — variant, label-small mono).

**Avatar**:
- 사용자 `primitives/Avatar.tsx`: 크기 `sm`(24)/`md`(32)/`lg`(40px), `shape-full`. 색 `primary/secondary/tertiary/error/surface`(컨테이너 토큰). 이니셜 폴백, `userId`+`avatarUpdatedAt` 시 사진(`?v` 캐시버스트).
- 워크스페이스 `primitives/WorkspaceAvatar.tsx`: 크기 `sm`(24)/`md`(28px), **`shape-extra-small`(4px)**(개인과 달리 둥근 사각). 색은 이름 해시 → §2 6-hue 팔레트. 로고 사진 폴백 동일.
- `AvatarWithPresence`(`presence/`): WorkspaceAvatar + PresenceDot 합성.

**PresenceDot · 배지 · 안읽음**:
- `PresenceDot`(`presence/PresenceDot.tsx`): 우하단 오버레이 `size-2.5`(10px) `rounded-full` `border-2 surface`. `active`=tertiary, `idle`=outline, `offline`=숨김.
- 카운트 배지: 공용 컴포넌트 없이 인라인 — 사이드바 `SidebarMenuBadge`, 메시지 미읽음 카운트(원형 `min-w-[18px]` primary 배경 11px `.md-numeric`).
- 안읽음 dot: `ConversationList` 의 `size-2 rounded-full` primary 점(+ `sr-only "읽지 않음"`).

**Breadcrumb** (`ui/breadcrumb.tsx` base-ui + `shell/Breadcrumb.tsx`): 리스트 label-medium on-surface-variant, 링크 호버 `surface-container` + on-surface, 현재 페이지 on-surface, 구분자 `/`(outline). 헤더에서 사용.

---

## 8. 쉘 레이아웃 — 단일 Linear 사이드바

```
--shell-sidebar: 200px   ← 좌측 사이드바 (텍스트+아이콘 nav, nav 라벨 기준 타이트)
--shell-subnav:  200px   ← 섹션 내 보조 nav (설정 등)
--shell-topbar:  48px    ← 헤더(콘텐츠 컬럼 상단 스트립) 높이
--content-max:   1280px
```

**Chrome 프레임 vs 메인 패널** — 사이드바·헤더는 하나의 가라앉은 "프레임" 색(`--shell-chrome-bg`)으로 통일되고, 메인 콘텐츠는 그 위에 한 톤 떠 있는 패널 색(`--shell-main-bg`)으로 강조된다. 두 변수는 **테마별로 다른 토큰을 가리킨다** — 라이트/다크에서 명도 방향이 반대라 단일 토큰으론 "메인이 항상 떠 보이게"가 불가능하기 때문(`styles/tokens.css`):

| | 라이트 | 다크 |
|---|---|---|
| `--shell-chrome-bg` (사이드바·헤더·프레임) | `surface-container-low` `#F7F8F9` | `background` `#08090A` |
| `--shell-main-bg` (메인 패널) | `background` `#FFFFFF` | `surface` `#0F1011` |

메인은 항상 한 단계 elevated(§2 명도 계층). 색차는 subtle하게 두고 구조는 보더 + radius가 담당한다. 메인은 **네이티브 턱** 형태 — 우측·하단은 화면 끝까지 닿고, 좌상단 한 모서리만 `shape-large`(10px) radius + top/left 1px 저대비 보더로 L자 프레임 안쪽에 끼워진다(md+ 한정, 모바일은 full-bleed). 프레임이 통합되므로 사이드바 우측 보더·헤더 하단 보더는 없다(메인의 top/left 보더가 단일 경계선).

**Sidebar** (`components/shell/Sidebar.tsx`): `--shell-chrome-bg` 프레임 색.
- 상단: 로고 + 워크스페이스 스위처, 검색 버튼(⌘K).
- 본문: 텍스트+아이콘 nav. 활성 행 = `primary-container` 연한 틴트 + on-primary-container, 비활성 = on-surface-variant + 호버 시 surface-container.
- 하단(footer): 알림 / 테마 토글 / 사용자 아바타 드롭다운.
- 모바일(<md): 사이드바 숨김 → 슬림 상단 바(햄버거)가 사이드바를 Sheet 드로어로 연다.

**Header** (`components/shell/Header.tsx`): 사이드바와 동일한 `--shell-chrome-bg`. 메인 위가 아니라 콘텐츠 컬럼 상단 스트립(Linear "정통"). 별도 글로벌 톱바는 없다(스위처·검색은 사이드바, 브레드크럼·검색·아바타는 헤더).

---

## 9. 회피 패턴 (Anti-patterns)

- **No** 필(pill) 버튼 — 인터랙티브 요소는 6px. 알약은 Avatar/dot/상태 인디케이터에만.
- **No** 호버 시 그림자 승급 — 호버는 배경 명도 변화만.
- **No** 과도한 고도/스큐어모픽 그림자 — 대부분 보더 또는 elevation-1, 큰 그림자는 floating에만.
- **No** 강한(고대비) 디바이더 — 기본은 `outline-variant`(저대비).
- **No** 네온/글로우/글래스모피즘/블러 오브 — 단 하나의 좁은 예외: **랜딩 히어로 다크 씬의 소프트 블룸**(아래 "랜딩·마케팅 모션" 예외 블록 ⑤에 등록).
- **No** 내비/라벨에 font-mono uppercase wide-tracking — sentence case + 약한 음수 자간. 라벨은 §3의 `.md-label-{small,medium,large}`, `.md-numeric`은 금융 수치에만. 아래 "랜딩·마케팅 타이포" 예외 하나만 인정된다.
- **No** 큰 본문(16px+) — 앱 본문은 14px, 조밀하게.
- **No** Inter/Roboto/Arial 직접 임포트 — Pretendard Variable(Latin도 커버) + JetBrains Mono만.
- **No** 브래킷 상태 태그 `[ 결재중 ]` — Chip 사용.
- **No** 장식적 컨페티·강한 모멘텀 모션 — 아래 네 예외(축하 모먼트·테마 전환 리빌·브랜드 마크 진입·랜딩/마케팅 모션)를 제외하고 허용하지 않는다. **단 기능적 로딩 모션은 허용**: 넓은 영역은 펄스 스켈레톤(`ui/skeleton.tsx`), 인라인·타이핑 인디케이터는 펄스 점. 모두 `prefers-reduced-motion: reduce`를 존중한다(저감 시 정지). 자세한 원칙은 §6 "로딩 모션" 참조.

> **예외 — 축하 모먼트 (Celebration Moment).** 위 장식적 컨페티·강한 모션 금지에는
> 단 하나의 좁은 예외가 있다. 다음 4조건을 **모두** 만족하는 종결 성공 순간에 한해
> 1회성 컨페티/강조 모션을 허용한다:
> ① 사용자가 직접 일으킨 액션의 결과일 것,
> ② 되돌릴 수 없는 종결(terminal) 성공 이벤트일 것,
> ③ 1회성일 것(재방문·재렌더로 반복 발화 금지),
> ④ `prefers-reduced-motion: reduce`를 존중하고(컨페티 `disableForReducedMotion`),
>    네온·그라데이션 없이 브랜드 컬러만 사용할 것.
> 현재 등록된 발동 지점: **(1) 입점 심사 대기 화면**(`ApprovalWaitingScreen`),
> **(2) 견적 선정 완료 결과 화면**(`AwardResult`). 새 발동 지점을 추가할 때는
> 위 4조건 충족을 PR에서 명시할 것.

> **예외 — 테마 전환 리빌 (Theme Toggle Reveal).** 다크/라이트 모드 토글 클릭 시
> View Transitions API를 이용해 토글 버튼 위치에서 원형 `clip-path`가 뷰포트 전체로
> 펼쳐지는 리빌 효과를 허용한다. 이 예외는 다음 조건을 모두 충족하기 때문에 인정된다:
> ① 사용자가 직접 클릭한 경우에만 발동,
> ② GPU-합성 슈도엘리먼트(`::view-transition-new(root)`)의 `clip-path`만 사용 — 실 DOM 레이아웃 불변,
> ③ 색상·그라데이션·컨페티 없이 형상(clip-path)만 변형 — 브랜드 중립,
> ④ `prefers-reduced-motion: reduce` 설정 시 또는 `startViewTransition` 미지원 브라우저에서 즉시 전환(애니메이션 없음).
> 구현: `lib/theme/view-transition.ts` (`applyThemeWithTransition`) ←
> `components/shell/ThemeToggle.tsx`. CSS: `app/globals.css` `::view-transition-*` 규칙.

> **예외 — 브랜드 마크 진입 (Brand Mark Entrance).** 인증 앱 셸의 브랜드 마크는
> 마운트 시 1회성 SVG draw-on(외곽선을 그린 뒤 fill 페이드) 연출을 허용한다.
> 구현: `components/primitives/AnimatedBrandMark.tsx` ← `components/shell/SidebarBrand.tsx`
> (인증 앱 셸, 그리고 랜딩 데모 셸 `components/landing/demo-app/DemoSidebar.tsx` 가 같은
> 컴포넌트를 마운트한다 — 랜딩 면이지만 아래 ②의 reduced-motion 정적 렌더를 그대로 지키며
> §9 "랜딩·마케팅 모션"의 면제를 취하지 않는다),
> `components/primitives/Logo.tsx`(`animated` 옵트인 — 랜딩 헤더 `components/landing/LandingHeader.tsx`). 인정 조건:
> ① 하드 로드(새로고침·최초 진입)에서만 재생 — 클라이언트 라우트 전환은 셸을
>    리마운트하지 않으므로 반복 발화하지 않는다,
> ② `prefers-reduced-motion: reduce` 시 애니메이션 없이 정적 렌더(`BrandMark`와 동일 결과),
> ③ `pathLength`(stroke-dasharray)와 `fillOpacity`만 구동 — 실 DOM 레이아웃 불변,
> ④ 색은 `--md-sys-color-*` 브랜드 컬러 단일 — 네온·그라데이션 없음.
> 애니메이션 완료 후에는 순수 `<path>`로 정착해 잔여 dash 속성이 볼드 스트로크를
> 열화시키지 않는다. 새 마운트 지점을 늘릴 때는 위 4조건 충족을 PR에서 명시할 것.

> **예외 — 랜딩·마케팅 타이포 (Landing / Marketing Typography).** 비인증 랜딩·마케팅 면
> (`components/landing/**`, `app/page.tsx`)은 위 "내비/라벨에 font-mono uppercase
> wide-tracking 금지" 하드룰에서 면제된다. 이어브로우·비교표 헤더·계산기 라벨의
> mono + wide-tracking 은 기술적 마케팅 룩을 노린 제품 결정이며, 해당 문구가
> 대부분 짧은 라틴 문자열이라 한글 폴백 문제(§3 라벨 유틸리티 항 참조)도 일어나지
> 않는다. 인증 앱 면(`(app)/**`·`(public)/**`)에는 적용되지 않는다 — 그쪽은
> `.md-label-*`/`.md-numeric` 만 쓴다. 경계는 코드로 강제된다:
> `lib/design/design-hardrule-allowlist.mjs`(면제 SSOT) +
> `lib/design/__tests__/mono-label-drift.test.ts`(fs-walk 드리프트 가드).

> **예외 — 랜딩·마케팅 모션 (Landing / Marketing Surfaces).** 비인증 랜딩·마케팅 면
> (`components/landing/**`, `app/page.tsx`)은 위 "장식적·강한 모멘텀 모션 금지"와 §1·§6의
> "transform/opacity만 애니메이트 + `prefers-reduced-motion` 존중" 하드룰에서 **전면 면제**된다.
> 제품을 파는 마케팅 면이라 몰입형 스크롤 모션이 전환 목적에 부합하기 때문이다. 허용 범위:
> ① 스크롤 연동 pin·패럴랙스·진입 스케일(`components/landing/ScrollPinnedSection.tsx` — sticky 트랙 + `motion/react` `useScroll`; 히어로 전용 240vh 핀 트랙 `components/landing/hero/HeroPinnedScene.tsx` 포함),
> ② 단계별 가이드 커서·코치마크(`components/landing/demo-app/DemoCursor.tsx` 등),
> ③ 누적 등장·크로스페이드·스크램블 조립(`components/landing/hero/ScrambleText.tsx` — 히어로 헤드라인 순환 문구, 배경 ASCII 필드와 같은 글리프 팔레트)·캐러셀,
> ④ **`prefers-reduced-motion: reduce`를 존중하지 않고 모바일 포함 항상 재생해도 된다**(랜딩 한정 제품 결정),
> ⑤ **히어로 다크 오프닝 씬의 소프트 블룸·앰비언트 글로우**(`components/landing/hero/HeroAsciiField.tsx` — 커서 궤적 글로우 + 앰비언트 워시). 모션 규칙이 아니라 위 "네온/글로우 금지" 시각 하드룰의 **사용자 승인 예외**로, 랜딩 히어로 다크 씬에 한정된다. 커서 궤적 글로우는 포인터 이동(`pointermove`)에 반응해서만 그려지므로 터치 기기는 실제 드래그 중에만 나타나고, ④와 동일하게 **동작 줄이기 선호와 무관하게 항상 활성화**된다 — 정적 베이스 필드 폴백은 SSR·jsdom(matchMedia 미지원 테스트 환경)에서만 적용된다. 같은 예외 범위 안에서 **셀별 색 지터**(`HUE_OFFSETS` — resolved `--md-sys-color-inverse-primary` 기준 채널당 ±18 안팎의 하늘/시안/보라 미세 편차)도 허용한다 — 단일 액센트 컬러 원칙의 위반이 아니라 같은 블룸 예외의 연장(고정 팔레트 사용, 하드코딩 색 없음, 눈으로 튜닝된 은은한 폭).
> 인증 앱 면(`(app)/**`)에는 적용되지 않는다 — 그쪽은 §6 하드룰과 축하 모먼트·테마 전환 리빌·브랜드 마크 진입 세 예외만 유효하다.

---

## 10. 스페이싱 · 밀도

Tailwind 기본 4px 스텝 유틸리티(`gap-*`·`p-*`·`m-*`)가 **운영 스페이싱**이다. 별도 스페이싱 토큰 스케일을 강제하지 않는다 — Linear 밀도(조밀)는 작은 값 위주로 표현한다.

| 컨텍스트 | 표준 간격 |
|---|---|
| 인라인 아이콘↔텍스트, 칩 내부 | `gap-1`~`gap-1.5` (4–6px) |
| 폼 라벨↔인풋, 리스트 행 | `gap-1`~`gap-2` / `space-y-1` |
| 카드·패널 내부 패딩 | `p-3`~`p-4` (12–16px) |
| 섹션 간, 카드 묶음 | `gap-3`~`gap-6` (12–24px) |
| 빈 상태 등 큰 여백 | `py-20` |

행 높이는 ~32px(`h-8`)가 기준(버튼·nav·Select·Input). `--s-1`~`--s-11`(4·8·12·16·20·24·32·40·56·80·120px) 토큰이 `tokens.css` 에 있으나 **`landing/*` 레거시 전용 별칭**이다 — 앱 본문에선 Tailwind 유틸을 쓴다.

---

## 11. z-index · 레이어링

토큰 없이 Tailwind `z-*` 유틸로 관리한다. 4단계 관습:

| 레이어 | z | 사용 |
|---|---|---|
| 베이스 콘텐츠 | `z-0` | 일반 흐름, 컨페티 배경 |
| 로컬 스티키 크롬 | `z-10` | 스티키 헤더·사이드바 핸들·랜딩 헤더 |
| 인-플로우 보조 플로팅 | `z-20` | 모바일 nav, 멘션 드롭다운 |
| 포털 플로팅(최상위) | `z-50` | Dialog·Sheet·DropdownMenu·Tooltip·Popover·Toast·command palette — **공유 천장** |

스크림 두께: Dialog·Sheet `bg-black/10`(+`blur-xs`), command palette `bg-black/40`(+`blur-4px`). 새 플로팅은 `z-50` 을 따른다 — `z-[100]`/`z-40` 같은 일회성 값은 피한다.

---

## 12. 포커스 · 상태

**포커스 링** — `--color-ring`(= primary). 전역 기본은 `* { outline: outline-ring/50 }`(globals.css). 인터랙티브 코어(`primitives/Button`·`IconButton`·`Tabs`)는 `focus-visible:ring-2 ring-[primary]/50`. 변이: Chip `ring-[3px]`, Select `ring-2 @40%`, Checkbox `ring-2 @30%`, shadcn `ui/input`·`ui/button` `ring-3 @50%`. **신규 코어 컴포넌트는 `ring-2` primary @50% 를 표준으로** 한다.

**Disabled** — 코어 인터랙티브(`primitives/*`: Button·IconButton·Chip)는 `opacity-38` + `cursor-not-allowed` + `pointer-events-none`. shadcn `ui/*` 래퍼는 `opacity-50`. **표준은 `opacity-38`**(0.38).

**상태 레이어 토큰** — `--md-sys-state-hover-opacity` 0.06 / `-pressed-` 0.10 / `-focused-` 0.12. 현재 대부분 컴포넌트는 hover 를 surface 명도 시프트(`surface-container`)로 직접 처리하고 이 토큰은 예약 상태다. solid 버튼 호버는 `color-mix(on-color 10%)`.

---

## 13. 브레이크포인트

Tailwind v4 기본 스크린(커스텀 없음):

| 토큰 | min-width | 본 앱에서의 의미 |
|---|---|---|
| `sm` | 640px | 다이얼로그 `max-w-sm` 적용 시작 |
| `md` | 768px | **사이드바 표시 임계** — 미만은 사이드바 숨김 → 상단 햄버거 + Sheet 드로어, 메인 full-bleed |
| `lg` | 1024px | 채팅 레일·다단 비교 레이아웃, 데스크톱 밀도 |
| `xl` | 1280px | `--content-max` 와 동일 |
| `2xl` | 1536px | (특이 사용 없음) |

`md` 가 모바일↔데스크톱 셸의 분기점이다(§8).

---

## 14. 아이코노그래피

- **커스텀 라인 세트** `components/icons/index.tsx` — nav·앱 아이콘. 기본 `size=20`(viewBox `0 0 20`), **stroke 1.4**, round cap/join. 일부 24px(예: Settings)은 viewBox 24 + stroke 1.7. `size` prop 으로 호출부 오버라이드.
- **lucide-react** — base-ui 래퍼·부수 아이콘(`XIcon`/`ChevronRightIcon`/`CheckIcon`/`ChevronDownIcon` 등).
- 빈 상태 아이콘은 **48px @1.5 stroke**(EmptyState, §7.3). 라인 스트로크 1.4–1.5 가 Linear 톤.
- 아이콘 기본색 `on-surface-variant`, 호버/활성 시 `on-surface`(IconButton 규칙).

---

## 15. 토큰 파일 참조

`styles/tokens.css` ← 시스템 토큰 전체 (`@theme {}` + `.dark` 오버라이드)
`app/globals.css` ← Tailwind v4 shadcn semantic 매핑 (`@theme inline {}`)

`DESIGN.md`가 변경되면 `styles/tokens.css`도 동기화한다 (단방향). 단 본 문서 §2·§5·§7·§10~§14 의 다수 항목은 **기존 토큰/관습을 문서화**한 것이라 토큰 *값* 변경을 동반하지 않는다 — 토큰 값을 새로 바꿀 때만 `tokens.css` 를 함께 수정한다.
