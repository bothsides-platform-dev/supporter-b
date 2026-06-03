# Supporter B — 디자인 시스템 (Linear)

> 짝 문서: [SCREEN_DESIGN.md](./SCREEN_DESIGN.md) (화면·IA·UX) · [CLAUDE.md](./CLAUDE.md) (스택·라우팅·규칙)
> 본 문서: Linear 디자인 언어 토큰, 타이포그래피, 컬러, 컴포넌트 시각 원칙

---

## 1. 미적 방향 — Linear

[Linear](https://linear.app)의 디자인 언어를 채용한다. 조밀하고 빠르며, 구조는 그림자가 아닌 **저대비 보더와 표면 명도 단계**로 표현한다. B2B 결제 RFP 같은 정보 밀도 높은 도구에 잘 맞는다. 라이트 모드가 기본, 다크 모드는 Linear 시그니처 near-black(`#08090A`).

> **호환성 메모**: 토큰 *이름*은 직전 MD3 시스템(`--md-sys-color-*` 등)을 그대로 유지한다 — 값만 Linear로 교체했다. 이름이 `md-sys`라서 MD3가 아니다. 시각 결정의 캐노니컬은 본 문서다.

**4대 원칙**
1. **구조는 느껴지되 보이지 않게** — 1px 저대비 보더(`outline-variant`)가 구획을 만든다. 그림자는 떠 있는 요소(팝오버·다이얼로그·command palette)에만.
2. **표면 명도 계층** — 캔버스 → 사이드바/패널 → elevated 순으로 명도를 한 단계씩 올려(다크)/내려(라이트) 깊이를 표현. 사이드바는 콘텐츠보다 한 톤 dim.
3. **조밀하고 빠르게** — 행 높이 ~32px, 본문 14px, 버튼 28px. 인터랙션 피드백은 100ms 이내, transform/opacity/color만 애니메이트.
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

### Tertiary / Error / Warning
| 토큰 | 라이트 | 용도 |
|---|---|---|
| `--md-sys-color-tertiary` | `#1F9D55` | 성공, 계약 체결 |
| `--md-sys-color-error` | `#E5484D` | 오류, 위험 액션 |
| `--md-sys-color-warning` | `#D9730D` | 보류/대기 |

(컨테이너 변형은 `tokens.css` 참조. 다크 값도 동일 파일.)

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

### 텍스트 · 보더
| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--md-sys-color-on-surface` | `#1F2023` | `#F7F8F8` | 주 텍스트 |
| `--md-sys-color-on-surface-variant` | `#6B7079` | `#8A8F98` | 보조/메타 텍스트, 아이콘 |
| `--md-sys-color-outline` | `#D4D6DC` | `#2E3033` | 강한 보더 (인풋 포커스 전) |
| `--md-sys-color-outline-variant` | `#E8E9EC` | `#23252A` | **저대비 보더/디바이더 (기본)** |

> 저대비 보더는 의도된 선택이다 — "구조는 느껴지되 보이지 않게". 라이트 `outline-variant`는 WCAG AA 비텍스트 대비(3:1) 미달이며, 이는 Linear 룩의 핵심이지 버그가 아니다.

---

## 3. 타이포그래피

폰트: **Pretendard Variable** (KR + Latin — Latin은 Inter 파생이라 Linear 룩에 부합) + **JetBrains Mono** (수치 전용, `.md-numeric`).

조밀·약한 음수 자간. 헤딩은 semibold(600). 본문 baseline **14px** (Linear 앱은 ~13px이나 한글 가독성 위해 14px).

| 롤 | 크기 | 굵기 | 자간 | 용도 |
|---|---|---|---|---|
| Display Large | 44px | 600 | -0.025em | 랜딩 히어로 |
| Display Medium | 36px | 600 | -0.022em | 대형 KPI |
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
적용 대상: ₩ 금액, % 수수료, 건수, 제안번호(`P-2605-0042`), 날짜. **내비게이션·라벨·버튼 텍스트에는 적용하지 않는다.**

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
5: 0 2px 8px rgba(0,0,0,.08),             0 2px 8px rgba(0,0,0,.4),   ← command palette (`--command-palette-shadow`)
   0 24px 64px -8px rgba(0,0,0,.18)          0 24px 64px -8px rgba(0,0,0,.6)
```

`--command-palette-shadow` CSS 변수로 추출됨 (`app/globals.css`). 라이트/다크 값이 각각 설정된다.

---

## 6. 모션 — 빠르게

| 토큰 | 값 | 용도 |
|---|---|---|
| `--md-sys-motion-easing-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | 기본 전환 (ease-out) |
| `--md-sys-motion-duration-short-4` | **100ms** | 버튼/호버/색 변화 (cause→effect) |
| `--md-sys-motion-duration-medium-2` | 250ms | 패널/드롭다운 오픈 |
| `--md-sys-motion-duration-medium-4` | 350ms | 드로어 슬라이드 |
| `--md-sys-motion-duration-long-2` | 450ms | 큰 전환 |

규칙: **transform·opacity·color/background/border만 애니메이트**. 레이아웃 속성(width/height/top/left/margin)은 애니메이트하지 않는다. 팝오버는 트리거 요소에서 스케일.

---

## 7. 컴포넌트 시스템

밀도·6px·저대비 보더·서브틀 호버(배경 미세 변화)가 공통 규칙. 호버에 그림자 승급 금지.

### Button — 5개 변형 (높이 28px 기본)
| Variant | 외관 | 용도 |
|---|---|---|
| `filled` | Primary/Error 솔리드 | 주요 CTA |
| `outlined` | 저대비 보더, 호버 시 surface 채움 | 보조 액션 |
| `text` | 고스트, 호버 시 surface 채움 | 3차 액션, 취소 |
| `elevated` | surface-low + 보더 + elevation-1 | 카드 위 액션 |
| `tonal` | secondary/primary 컨테이너 | 중간 강조 |

`color`: `primary`(기본) / `error`. 반경 6px. 호버는 배경 변화만(그림자 없음).

### Chip — 4개 유형 (높이 24px, 4px 반경)
`assist` / `filter` / `input` / `suggestion`. `color`: `primary`/`tertiary`/`warning`/`error`/`surface`(기본). 뮤트 톤.

### IconButton — 4개 변형 (6px 반경, 28/32px)
`standard` / `outlined` / `filled` / `tonal`. 아이콘은 기본 on-surface-variant, 호버 시 on-surface.

### Card — 3개 변형
`outlined`(저대비 보더, 기본 선호) / `elevated`(surface-low + 보더 + elevation-1) / `filled`(surface-container).

### Tabs
2px 하단 인디케이터(primary). 활성 텍스트 on-surface, 비활성 on-surface-variant. 높이 36px, label-large.

---

## 8. 쉘 레이아웃 — 단일 Linear 사이드바

```
--shell-sidebar: 200px   ← 좌측 사이드바 (텍스트+아이콘 nav, nav 라벨 기준 타이트)
--shell-subnav:  200px   ← 섹션 내 보조 nav (설정 등)
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
- **No** 네온/글로우/글래스모피즘/블러 오브.
- **No** 내비/라벨에 font-mono uppercase wide-tracking — sentence case + 약한 음수 자간. `.md-numeric`은 금융 수치에만.
- **No** 큰 본문(16px+) — 앱 본문은 14px, 조밀하게.
- **No** Inter/Roboto/Arial 직접 임포트 — Pretendard Variable(Latin도 커버) + JetBrains Mono만.
- **No** 브래킷 상태 태그 `[ 결재중 ]` — Chip 사용.

---

## 10. 토큰 파일 참조

`styles/tokens.css` ← 시스템 토큰 전체 (`@theme {}` + `.dark` 오버라이드)
`app/globals.css` ← Tailwind v4 shadcn semantic 매핑 (`@theme inline {}`)

`DESIGN.md`가 변경되면 `styles/tokens.css`도 동기화한다 (단방향).
