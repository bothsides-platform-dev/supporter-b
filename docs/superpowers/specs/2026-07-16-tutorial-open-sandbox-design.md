# 튜토리얼 "오픈 샌드박스" 전환 — 설계 스펙

- 날짜: 2026-07-16
- 브랜치: `feat/tutorial-open-sandbox`
- 상태: 사용자 설계 승인 완료 (구현 전)
- 선행 계약: 클릭-온리 v0.2.79.0 (PR#403) · 건너뛰기 v0.3.2.0 (PR#406) · 라이트 스포트라이트 v0.3.3.0 (PR#407)

## 1. 배경과 목표

현행 튜토리얼(`/tutorial`)은 클릭-온리 계약이다 — `useTutorialKeyboardLock`이 편집 요소 타이핑을 차단하고, 코치마크의 투명 4-rect 실드가 타깃 밖 클릭을 전부 흡수하며, 프리필된 폼을 안내 순서대로만 클릭해 완주한다.

사용자 요구: **"튜토리얼을 진행하면서 이것저것 만져볼 수 있게"** — 입력과 탐색 모두 개방(풀 개방).

새 계약(오픈 샌드박스): *프리필된 실제 화면을 자유롭게 만져볼 수 있고, 코치마크는 차단 없이 안내만 한다. 아무것도 안 만지면 클릭만으로 3분 완주(기존 보장 유지). 무엇을 만져도 흔적(실 서버 데이터)과 무단 이탈이 없다.*

## 2. 확정 결정 (사용자 Q&A)

| 질문 | 결정 |
|---|---|
| 개방 범위 | **입력+탐색 풀 개방** — 키보드 락·클릭 실드 제거, 코치마크는 안내자로만 |
| 투어 진행 모델 | **타깃 클릭 대기** — 말풍선·펄스 링은 타깃에 머물고, 실제 타깃 버튼 클릭 순간에만 다음 스텝 (기존 capture 클릭 리스너 유지) |
| 값 망가뜨림 구제 | **막힘 감지 힌트** — 타깃 버튼 disabled 감지 시 말풍선에 힌트 한 줄 (초기화 버튼 없음, 복구는 실제 폼 검증 UX) |
| 백엔드/이탈 지점 | **무력화·스텁 + 이탈 확인 모달** — 이탈 시 [나중에 하기(dismissed) \| 건너뛰기(completed)] 확인 후 이동 진행, 취소 시 잔류 |

## 3. 상세 설계

### 3.1 코치마크 개방 — `components/onboarding/coachmarks/`

**CoachmarkOverlay.tsx**
- 4-rect `coachmark-shield` 전부 삭제 (`shieldRects`/`shields`/`handleNudge` 포함).
- info 스텝의 root 전면 클릭 흡수(`onClick` + 기본 `pointer-events`) 제거 — action/info 모두 root는 `pointer-events-none`, 말풍선만 `pointer-events: auto`.
- 넛지 상태(`nudge` state)·`coachmark-bubble-flash` 래퍼의 넛지 로직·`ringNudgeClass`/`bubbleNudgeClass`·animationend 네이티브 리스너 삭제. 링 `key`에서 nudge count 제거.
- 펄스 링(`.coachmark-pulse`, 등장 페이드 포함)은 유지.
- **막힘 힌트**: 새 prop `targetDisabled?: boolean`. action 스텝에서 true면 말풍선 본문 아래 한 줄 추가 — `입력이 비었거나 형식이 달라요. 고치면 계속 진행할 수 있어요.` (`text-[12px]`, 기존 폼 에러 텍스트 토큰 재사용 — `--md-sys-color-error` 계열).

**useAnchorRect.ts**
- 기존 250ms 폴 tick에서 앵커 요소의 비활성 상태를 함께 읽어 반환값 확장: `{ rect, status, disabled }`. 판정: `el.matches(':disabled')` 또는 `aria-disabled="true"` (앵커 자신 또는 앵커가 감싼 버튼).

**CoachmarkTour.tsx**
- 진행 로직 변경 없음(문서 capture 클릭 리스너, notFound 자동 스킵 불변식, onSkip 계약, Esc 무반응 모두 유지).
- `useAnchorRect`의 `disabled`를 `CoachmarkOverlay`의 `targetDisabled`로 전달.

**app/globals.css**
- `.coachmark-nudge` 키프레임·클래스 규칙 삭제. `.coachmark-pulse`/`coachmark-fade-in`은 유지.

### 3.2 키보드 락 삭제

- `components/onboarding/tutorial/useTutorialKeyboardLock.ts` 훅 삭제, `BuyerTutorialFlow`/`PgTutorialFlow`의 호출 2곳 제거, 훅 테스트 삭제.
- 편집 개방의 안전성 근거(이미 구조적으로 확보됨): buyer 드래프트는 `useIsolatedRfpDraft`(실 드래프트 sessionStorage 백업→튜토리얼 시드→이탈 시 복원), PG는 `bid-draft:tutorial-rfp` 키 격리 + brief→write 진입 시 `clearStoredBidDraft`. 제출·선정은 `onSampleSubmit`/`onSampleAward` 인터셉트로 서버 미도달.

### 3.3 이탈 가드 — `TutorialLeaveGuard` 신설 (`components/onboarding/tutorial/`)

- 클라이언트 컴포넌트. 두 플로우(done phase 제외)에 마운트. prop: `variant: 'buyer' | 'pg'` (스탬프 키 결정).
- document **capture** click 리스너: `event.target.closest('a[href]')`가 (a) 내부 경로(`/`로 시작), (b) `/tutorial`로 시작하지 않음, (c) `target="_blank"`/`download` 아님, (d) 수정키(meta/ctrl/shift/alt) 없는 좌클릭일 때 `preventDefault()` + 목적지 href 보관 + 확인 다이얼로그 오픈. 그 외 클릭은 통과.
- 다이얼로그 (기존 `ui/dialog` 재사용):
  - 제목 `튜토리얼을 나갈까요?` / 본문 `지금 나가도 홈에서 언제든 다시 시작할 수 있어요.`
  - **계속 체험하기** (filled, 기본 안전 동작. Esc·바깥 클릭 동일) → 다이얼로그만 닫고 잔류
  - **나중에 하기** (outlined) → `updateOnboardingAction({ key, event: 'dismissed' })` fire-and-forget(`.catch(()=>{})`) 후 `router.push(보관 href)` — 홈 재유도 배너 유지
  - **건너뛰기** (text) → 동일 패턴으로 `completed` 스탬프 후 `router.push(보관 href)` — done 화면 생략(떠나는 사용자에게 강요하지 않음). 코치마크 말풍선의 건너뛰기 버튼(= completed + done 점프)과 종착 화면만 다르고 스탬프 의미는 동일.
- 가드 우회(의도): 헤더 `튜토리얼 나가기` 버튼(명시적 dismissed)·done 화면 CTA(이미 completed)는 `<a>`가 아닌 Button onClick(`router.push`)이라 자연 우회. done phase에서는 가드 자체를 언마운트.

### 3.4 백엔드 터치포인트 무력화 (샌드박스 보장)

| 지점 | 현행 | 튜토리얼 모드 처리 |
|---|---|---|
| `RfpAttachmentDropzone` (buyer 2단계) | `uploadAttachment` → presign → 실 R2 PUT | 새 prop `sampleMode?: boolean` — 업로드 호출 없이 로컬 row 즉시 `ready`(가상 id). 삭제도 로컬 처리. `RfpCreateWizard`가 `Boolean(onSampleSubmit)`으로 도출해 스텝 컴포넌트 경유 전달 |
| `BidWizard` 템플릿 저장 (`saveQuoteTemplateAction`, BidWizard.tsx:220 부근) | 실 서버 액션 → 실 워크스페이스에 템플릿 생성 | `onSampleSubmit` 모드에서 액션 호출 스킵 + 토스트 `튜토리얼에서는 저장되지 않아요` (버튼은 노출 유지 — 만져보기 대상) |
| `BidWizard` 템플릿 빈 상태의 `/quote-templates` 링크 (BidWizard.tsx:427) | 라우트 이탈 | 그대로 둠 — §3.3 이탈 가드가 잡음 |
| buyer 3단계 PG 검색 | fixture `pgList` prop 제공 중 | **감사 태스크**: 검색이 fixture 로컬 필터인지 확인, 서버 액션 호출이면 동일 방식으로 스텁 |
| 제출/선정 종결 | `onSampleSubmit`/`onSampleAward` 인터셉트 | 변경 없음 |

### 3.5 카피 손질 — `tours.ts`

- `buyerCreateTour[0].body`: `실제로 사용하는 화면 그대로예요. 모든 내용이 미리 채워져 있어요 — 자유롭게 바꿔보거나 눌러봐도 되고, 안내만 따라가도 돼요.`
- `pgWriteTour[0].body`: `실제로 사용하는 화면 그대로예요. 정산조건과 수수료가 미리 채워져 있어요 — 자유롭게 바꿔봐도 돼요.`
- 나머지 action 스텝의 "여기를 눌러…" 유도 문구는 유지 (UX_WRITING.md 해요체·능동·'견적' 언어 기준 기존 준수 상태).

### 3.6 문서 갱신

- **CLAUDE.md** `app/(app)/tutorial/` 단락: 클릭-온리 계약 문장을 오픈 샌드박스 계약으로 교체(키보드락·실드·넛지 제거, 막힘 힌트, 이탈 확인 모달, 백엔드 무력화 명시).
- **SCREEN_DESIGN.md** §0.1 route map 65행 동일 취지 갱신 (+선택: §0.3a 공용 화면 표에 튜토리얼 행 신설 — 2026-07-16 검토에서 발견한 기존 미등재 부채).
- **DESIGN.md** §6: `.coachmark-nudge` 문장 제거, 펄스 링 문장 유지.

## 4. 유지되는 불변식

- 프리필 무입력 클릭 완주(3분) — `e2e/tutorial-click-through.spec.ts`가 회귀 가드.
- 코치마크 건너뛰기 버튼 = completed 스탬프 + done 점프 (v0.3.2.0), Esc 무반응.
- notFound 타임아웃 자동 스킵(투어가 UI를 막은 채 멈추지 않음).
- `useCelebrationConfetti` done phase 전용 마운트.
- 드래프트 격리(`useIsolatedRfpDraft` / `bid-draft:tutorial-rfp`).

## 5. 수용한 한계

- `router.push` 프로그래매틱 이동(⌘K 팔레트 등)·브라우저 뒤로가기·하드 내비게이션은 이탈 가드 미적용 — 무스탬프 이탈이며, 다음 홈 방문 시 환영 모달 재노출(기존 재진입 경로)로 흡수.
- 막힘 힌트는 일반 문구 1종 — 필드별 원인 안내는 실제 폼 검증 UX가 담당.
- 말풍선이 덮은 영역의 콘텐츠는 그 스텝 동안 직접 클릭 불가(말풍선 이동/드래그는 YAGNI).

## 6. 테스트 전략 (TDD)

단위(신규/수정, RED 먼저):
- `CoachmarkOverlay`: 실드 미렌더·info root 비차단(pointer-events)·`targetDisabled` 힌트 렌더·넛지 부재.
- `useAnchorRect`: disabled 폴링 보고.
- `TutorialLeaveGuard`: 내부 이탈 링크 가로채기 → 다이얼로그, 3분기(잔류/dismissed+이동/completed+이동), 수정키 클릭·`/tutorial` 내부 링크·외부 링크 통과.
- `RfpAttachmentDropzone`: `sampleMode`에서 네트워크 미호출 + 즉시 ready.
- `BidWizard`: sample 모드 템플릿 저장 스텁(액션 미호출+토스트).
- 삭제: `useTutorialKeyboardLock` 훅·테스트, 플로우 테스트의 키보드락 mock.

e2e: `tutorial-click-through.spec.ts` 무수정 그린 유지가 1차 검증. 진입면·이탈 가드 e2e는 기존 P4 유예 항목에 병합.

## 7. 기각한 대안

- 말풍선 다음 버튼 복원(action에서도 수동 진행): 안내 위치와 실제 진행 상태가 어긋나는 상태 발생 → 기각.
- 이탈 무조건 차단 / 무확인 허용: 사용자 결정(확인 후 진행)과 상충 → 기각.
- AppShell 개조식 이탈 가드: 침습 큼, 링크 capture 방식이 국소적 → 기각.
- 입력 초기화 버튼: 사용자가 막힘 힌트 방식 선택 → 기각.
- phase별 부분 개방: 풀 개방 결정 → 기각.

## 8. 실행 방식 (프로세스)

구현 태스크는 Sonnet 5 서브에이전트, 검증·리뷰는 Opus 서브에이전트로 위임하고, 복잡한 판단·통합은 컨트롤러(Fable)가 담당한다. 버전은 /ship 시 v0.3.4.0 예상.
