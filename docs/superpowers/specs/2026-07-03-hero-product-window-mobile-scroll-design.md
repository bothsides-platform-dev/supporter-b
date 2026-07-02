# 히어로 제품 창(HeroProductWindow) 모바일 표 짤림 수정 — 설계

## 배경 / 문제

`components/landing/hero/HeroProductWindow.tsx`는 랜딩 히어로의 다크→라이트 전환 씬(`HeroPinnedScene`)에서 스크롤과 함께 떠오르는 장식용 "제품 창" 목업이다. 안에는 `OfferComparisonTable`(견적 비교표, PG사·수수료·정산주기·보증보험·가입비·승인 상태·협의 가능 여부 7열)을 렌더한다.

이 표는 `min-w-[680px]` + `whitespace-nowrap`으로 폭이 고정돼 있다. `HeroProductWindow`는 표를 실제로 스크롤할 수 없는 상태(`showScrollFade={false}`)로 렌더하면서, 표를 감싸는 컨테이너에 `overflow-x-clip`을 걸어 스크롤바 자체가 안 보이게 눌러둔다(순수 장식 목적이었기 때문).

문제: 모바일 뷰포트(예: 375px)에서는 창의 실제 렌더 폭이 padding·inset을 뺀 약 300px 안팎인데, 표는 680px 폭을 요구한다. 스크롤이 꺼져 있으니 오른쪽 열(승인 상태, 협의 가능 여부 등)이 **영구적으로 보이지 않고, 볼 방법도 없다.**

## 방향 결정 과정 (요약)

1열 컴팩트/카드 전환 등 여러 대안을 검토했으나, 최종적으로 사용자가 선택한 방향은:

**표는 그대로 두고, 이미 구현되어 있는 스크롤+페이드 메커니즘(`OfferComparisonTable`의 `showScrollFade`, `SolutionShowcase`에서 이미 쓰이는 것과 동일)을 이 창에서도 그대로 켠다.** 모바일 폭에서 자연스럽게 보이는 만큼(PG사·수수료·정산주기 정도)이 기본으로 노출되고, 오른쪽 페이드+화살표 힌트를 보고 사용자가 드래그하면 나머지 열이 스크롤되어 드러난다.

새로운 prop이나 컨테이너 쿼리, 컬럼 숨김 로직을 추가하지 않는다 — `SolutionShowcase`가 쓰는 것과 완전히 동일한, 이미 검증된 동작을 재사용한다.

## 변경 범위

**파일: `components/landing/hero/HeroProductWindow.tsx`만 수정.** `OfferComparisonTable.tsx`는 코드 변경 없음(기존 `showScrollFade` prop을 그대로 사용).

1. **스크롤 클립 해제**: 콘텐츠 래퍼의 `[&_.overflow-x-auto]:overflow-x-clip` 클래스를 제거한다. 이 오버라이드는 애초에 "스크롤이 꺼져 있으니 스크롤바만 안 보이게" 눌러둔 것이었는데, 이제 스크롤이 실제로 동작해야 하므로 제거한다.

2. **스크롤 켜기**: `<OfferComparisonTable showScrollFade={false} />` → `<OfferComparisonTable />` (기본값 `true`)로 변경한다.

3. **포인터 이벤트 국소 해제**: 창 전체는 여전히 `pointer-events-none`(장식·비인터랙션 의도 유지, 주석 그대로 둠)이다. 표만 실제로 드래그 가능해야 하므로, `<OfferComparisonTable />`을 감싸는 위치에 `pointer-events-auto` 클래스를 가진 wrapper `div`를 하나 추가한다. 표 위쪽의 "받은 견적 / 입찰 3건 도착" 칩 영역은 계속 비인터랙션으로 둔다(굳이 만질 이유가 없음).

4. **`aria-hidden`은 그대로 유지**한다. 표 내용이 실제 견적 데이터가 아닌 예시(이미 표 하단에 고지 문구 있음)이고 이 씬 자체가 장식 목적이므로, 스크린리더 트리에서 계속 제외하는 것이 맞다. 시각적으로 스크롤 가능해지는 것과 보조기술 노출 여부는 별개 문제로 판단.

## 검토한 리스크와 결론

- **`HeroPinnedScene`의 세로 스크롤-핀 애니메이션과의 제스처 충돌**: `useScroll({ target: trackRef })`(motion/react)은 네이티브 `scroll` 이벤트를 수동적으로 읽을 뿐 `touchmove`에 `preventDefault`를 걸지 않는다. 즉 안쪽 표의 가로 드래그(브라우저 기본 `touch-action: pan-x`)와 바깥 페이지의 세로 스크롤이 서로 가로채지 않는다 — 충돌 리스크 낮음으로 판단, 별도 처리 불필요.
- **가장 좁은 폰(320~360px)에서 표가 여전히 빠듯할 수 있음**: 감수한다. 스크롤 힌트(페이드+화살표)가 있으므로 "일부만 보이고 나머지는 스크롤"이라는 신호가 명확하며, 기존 `SolutionShowcase`도 동일한 폭 제약에서 동일한 방식으로 이미 운영 중이다.

## 테스트 방침

`docs/CLAUDE.md`의 랜딩 작업 TDD 면제(사용자 확인됨, 시각/모션 위주 랜딩 코드는 자로 보며 반복 + `/design-review`)를 적용한다. 다만 이번 변경은 `OfferComparisonTable`(공유 컴포넌트)의 **호출 방식**을 바꾸는 것이라 "공유 로직을 건드리면 확인" 원칙에 따라 사용자에게 재확인했고, 승인받았다. `OfferComparisonTable.tsx` 자체 코드는 무변경이라 기존 테스트(`OfferComparisonTable.test.tsx`)에 영향 없음.

검증은 다음으로 한다:
- `pnpm tsc --noEmit`, `pnpm lint` 통과
- 기존 `OfferComparisonTable.test.tsx`, `HeroProductWindow` 관련 테스트(있다면) green 유지
- 브라우저(모바일 뷰포트 에뮬레이션)로 실제 드래그 스크롤 동작 육안 확인 — 페이드 힌트 표시, 드래그 시 오른쪽 열 노출, 데스크톱 화면에서 기존 룩 그대로 유지되는지

## 범위 밖

- `SolutionShowcase`, `OfferComparisonTable.tsx` 자체는 변경하지 않는다.
- 컬럼 순서 재배치, 카드 레이아웃 전환 등 다른 대안은 채택하지 않는다.
