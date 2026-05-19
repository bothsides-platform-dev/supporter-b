# Supporter B — 디자인 시스템 (Material Design 3)

> 짝 문서: [SCREEN_DESIGN.md](./SCREEN_DESIGN.md) (화면·IA·UX) · [SPEC.md](./SPEC.md) (기술 스펙)
> 본 문서: MD3 토큰, 타이포그래피, 컬러, 컴포넌트 시각 원칙

---

## 1. 미적 방향 — Material Design 3 (Material You)

B2B 결제 플랫폼에 적합한 MD3 — Google의 2021년 디자인 시스템을 채용. 신뢰·명확성·구조를 표현하는 토널 팔레트와 5단계 표면 계층이 B2B 금융 UI에 잘 맞는다.

**3대 원칙**
1. **톤·온·톤 표면 계층** — 5단계 surface-container 계층으로 UI 깊이를 표현. 그림자보다 색조가 주도한다.
2. **수치는 모노** — 금융 값(₩, %, 건수, 날짜, 제안번호)은 `.md-numeric` 클래스(JetBrains Mono + tabular-nums). 수치 정렬이 신뢰의 시각이다.
3. **MD3 상태 레이어** — 호버 8%, 프레스 12% `color-mix(in srgb, ...)` 오버레이로 일관된 상호작용 피드백.

**제거된 Korean Editorial 요소**
- 브래킷 상태 태그 `[ 결재중 ]` → MD3 Chip으로 교체
- 섹션 시리얼 `01 / 14` → 제거
- 내비게이션/라벨의 `font-mono uppercase tracking` → MD3 타입스케일로 교체

---

## 2. 컬러 시스템

Seed colors: primary `#0061A4` (신뢰 블루), tertiary `#006D43` (계약 그린)

### Primary
| 토큰 | 값 | 용도 |
|---|---|---|
| `--md-sys-color-primary` | `#0061A4` | 주요 액션 버튼, 링크 |
| `--md-sys-color-on-primary` | `#FFFFFF` | primary 위 텍스트 |
| `--md-sys-color-primary-container` | `#D1E4FF` | 토널 버튼, 선택 상태 |
| `--md-sys-color-on-primary-container` | `#001D36` | primary-container 위 텍스트 |

### Secondary
| 토큰 | 값 | 용도 |
|---|---|---|
| `--md-sys-color-secondary` | `#535F70` | 보조 액션 |
| `--md-sys-color-secondary-container` | `#D7E3F7` | Nav Rail 활성 인디케이터 |
| `--md-sys-color-on-secondary-container` | `#101C2B` | Nav Rail 활성 아이콘 |

### Tertiary — 계약/성공 그린
| 토큰 | 값 | 용도 |
|---|---|---|
| `--md-sys-color-tertiary` | `#006D43` | 성공, 계약 체결 |
| `--md-sys-color-tertiary-container` | `#8DF6BC` | Chip (완료/성공) |
| `--md-sys-color-on-tertiary-container` | `#002113` | 위 텍스트 |

### Error + Warning
| 토큰 | 값 | 용도 |
|---|---|---|
| `--md-sys-color-error` | `#BA1A1A` | 오류, 위험 액션 |
| `--md-sys-color-error-container` | `#FFDAD6` | Chip (실패) |
| `--md-sys-color-warning` | `#7D5700` | 보류/대기 상태 |
| `--md-sys-color-warning-container` | `#FFDEA5` | Chip (신규/보류) |

### Surface 계층 (5단계)
```
surface-container-lowest  #FFFFFF   → 카드 내부, 팝오버
surface-container-low     #F3F4FA   → 카드 배경 (elevated), 주요 컨텐츠 면
surface-container         #EDEDF4   → 구분 영역
surface-container-high    #E7E8EE   → 행 호버, 선택 상태 하이라이트
surface-container-highest #E2E2E8   → filled 카드
```

### 역방향 (Navigation Rail)
| 토큰 | 용도 |
|---|---|
| `--md-sys-color-inverse-surface` `#2F3033` | Nav Rail 배경 (다크) |
| `--md-sys-color-inverse-on-surface` `#F1F0F4` | Rail 아이콘/텍스트 |
| `--md-sys-color-inverse-primary` `#9ECAFF` | Rail 활성 액션 |

---

## 3. 타이포그래피

폰트: **Pretendard Variable** (KR + Latin) + **JetBrains Mono Variable** (숫자 전용)

### MD3 15개 타입 롤

| 롤 | 크기 | 굵기 | 용도 |
|---|---|---|---|
| Display Large | 57px / 3.5625rem | 400 | 랜딩 히어로 |
| Display Medium | 45px / 2.8125rem | 400 | 대형 KPI |
| Display Small | 36px / 2.25rem | 400 | KPI 값 |
| Headline Large | 32px / 2rem | 400 | 페이지 제목 |
| Headline Medium | 28px / 1.75rem | 400 | 섹션 제목 |
| Headline Small | 24px / 1.5rem | 400 | 카드 제목 |
| Title Large | 22px / 1.375rem | 400 | 탭 헤더 |
| Title Medium | 16px / 1rem | 500 | 강조 라벨 |
| Title Small | 14px / 0.875rem | 500 | 탭, 소제목 |
| Body Large | 16px / 1rem | 400 | 기본 본문 (`<body>` 기본값) |
| Body Medium | 14px / 0.875rem | 400 | 테이블 셀, 설명문 |
| Body Small | 12px / 0.75rem | 400 | 캡션 |
| Label Large | 14px / 0.875rem | 500 | 버튼, Chip |
| Label Medium | 12px / 0.75rem | 500 | 태그, 보조 라벨 |
| Label Small | 11px / 0.6875rem | 500 | Nav Rail 라벨 |

### 금융 데이터 카브아웃 — `.md-numeric`

```css
.md-numeric {
  font-family: var(--font-mono);          /* JetBrains Mono */
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}
```

적용 대상: ₩ 금액 셀, % 수수료 값, 건수 카운터, 제안번호(`P-2605-0042`), 날짜. **내비게이션·라벨·버튼 텍스트에는 절대 적용하지 않는다.**

---

## 4. 형태(Shape) 스케일

| 토큰 | 크기 | 적용 |
|---|---|---|
| `--md-sys-shape-none` | 0px | 분할선 |
| `--md-sys-shape-extra-small` | 4px | 인풋, 툴팁, 드롭다운 |
| `--md-sys-shape-small` | 8px | Chip, 스낵바 |
| `--md-sys-shape-medium` | 12px | 카드(elevated/filled), 메뉴 |
| `--md-sys-shape-large` | 16px | 상단 시트, 내비게이션 드로어 |
| `--md-sys-shape-extra-large` | 28px | 다이얼로그, 하단 시트 |
| `--md-sys-shape-full` | 9999px | 버튼, Chip(filter), Avatar, 알약 인디케이터 |

---

## 5. 고도(Elevation) — 5단계

```
Elevation 0: none
Elevation 1: 0px 1px 2px rgba(0,0,0,.30), 0px 1px 3px 1px rgba(0,0,0,.15)  ← Elevated 카드, 버튼 호버
Elevation 2: 0px 1px 2px rgba(0,0,0,.30), 0px 2px 6px 2px rgba(0,0,0,.15)  ← 카드 호버
Elevation 3: 0px 1px 3px rgba(0,0,0,.30), 0px 4px 8px 3px rgba(0,0,0,.15)  ← 토스트/스낵바
Elevation 4: 0px 2px 3px rgba(0,0,0,.30), 0px 6px 10px 4px rgba(0,0,0,.15) ← (예약)
Elevation 5: 0px 4px 4px rgba(0,0,0,.30), 0px 8px 12px 6px rgba(0,0,0,.15) ← 팝오버, 드롭다운
```

---

## 6. 모션

| 토큰 | 값 | 용도 |
|---|---|---|
| `--md-sys-motion-easing-standard` | `cubic-bezier(0.2, 0, 0, 1)` | 기본 전환 |
| `--md-sys-motion-easing-emphasized-decelerate` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | 화면 진입, 슬라이드 인 |
| `--md-sys-motion-easing-emphasized-accelerate` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | 화면 퇴장, 슬라이드 아웃 |
| `--md-sys-motion-duration-short-4` | 200ms | 버튼/Chip 상태 변화 |
| `--md-sys-motion-duration-medium-2` | 300ms | 패널 오픈 |
| `--md-sys-motion-duration-medium-4` | 400ms | 드로어 슬라이드 |
| `--md-sys-motion-duration-long-2` | 500ms | 페이지 전환 |

---

## 7. 컴포넌트 시스템

### Button — 5개 변형

| Variant | 외관 | 용도 |
|---|---|---|
| `filled` | Primary/Error 배경 | 주요 CTA (RFP 발송, 낙찰) |
| `outlined` | 테두리만 | 보조 액션 |
| `text` | 텍스트만 | 3차 액션, 취소 |
| `elevated` | surface-low 배경 + 그림자 | 카드 위 액션 |
| `tonal` | Primary/Error 컨테이너 배경 | 중간 강조 |

`color` prop: `primary`(기본) / `error` (위험 액션)

### Chip — 4개 유형

| Variant | 용도 |
|---|---|
| `assist` | 일반 액션 도움 |
| `filter` | 목록 필터 (selected/unselected 상태 있음) |
| `input` | 입력된 태그 (삭제 버튼 포함) |
| `suggestion` | 추천 텍스트 |

`color` prop: `primary` / `tertiary` / `warning` / `error` / `surface`(기본)

### IconButton — 4개 변형

`standard` / `outlined` / `filled` / `tonal`

### Card — 3개 변형

| Variant | 배경 |
|---|---|
| `elevated` | surface-container-low + elevation-1 |
| `filled` | surface-container-highest |
| `outlined` | surface + outline-variant 테두리 |

### Label

섹션 레이블, 폼 라벨 등에 사용. `size`: `lg` / `md` / `sm`. `muted`: true(기본, on-surface-variant) / false(on-surface).

### Tabs — MD3 Primary Tabs

3px 상단 인디케이터. Title-small 타입스케일. Tab 텍스트는 기본 on-surface-variant, 활성은 primary.

---

## 8. 쉘 레이아웃

```
--shell-rail:    80px   ← MD3 Navigation Rail 너비
--shell-topbar:  64px   ← MD3 Small Top App Bar 높이
--shell-subnav:  244px  ← 서브 내비게이션 (RFP 상세 등)
```

**Navigation Rail** (`IconSidebar`): inverse-surface 배경 (다크). 활성 아이템은 secondary-container 알약(pill) 인디케이터 + on-secondary-container 색상. 비활성은 inverse-on-surface 60% 투명도.

**Top App Bar** (`Topbar`): surface 배경, outline-variant 하단 테두리.

---

## 9. 회피 패턴 (MD3 Anti-patterns)

- **No** 스큐어모픽(그림자 도배, 사실적 텍스처) — MD3는 평면+톤
- **No** 과도한 고도 — 대부분 elevation-1, 팝오버만 elevation-5
- **No** 토널 색상 오용 — primary-container는 컨테이너에, 버튼 텍스트엔 on-primary
- **No** 내비/라벨에 font-mono — `.md-numeric`은 금융 수치에만
- **No** uppercase + wide tracking — MD3 타입스케일은 sentence case
- **No** 브래킷 상태 태그 — Chip을 사용
- **No** Inter/Roboto/Arial — Pretendard Variable + JetBrains Mono만
- **No** 보라/파랑 그라데이션 — MD3 solid color roles

---

## 10. 토큰 파일 참조

`styles/tokens.css` ← MD3 시스템 토큰 전체 (`@theme {}` 블록)  
`app/globals.css` ← Tailwind v4 shadcn semantic 매핑 (`@theme inline {}`)

`DESIGN.md`가 변경되면 `styles/tokens.css`도 동기화한다 (단방향).
