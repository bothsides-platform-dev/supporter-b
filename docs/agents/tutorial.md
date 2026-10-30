# 온보딩 튜토리얼 상세

`app/(app)/tutorial/`과 `components/onboarding/tutorial/`을 고칠 때 읽는다.

buyer+pg — 온보딩 튜토리얼. 홈 환영 모달(WelcomeModal)/재유도 배너(TutorialNudge)의 진입점. buyer는 BuyerTutorialFlow(components/onboarding/tutorial/)가 같은 라우트 내 phase 전환(작성→도착연출→비교·선정→완료, 전부 fixture)으로 실제 여정 제공. pg는 PgTutorialFlow가 같은 방식으로 초대 수신 연출→요청 조건 확인(RfpBriefPanel)→견적 작성·제출(BidWizard)→완료(봉인 입찰 안내) 여정 제공.

**오픈 샌드박스 계약(v0.3.4.0)**: 폼은 전부 프리필(무입력 클릭 완주는 여전히 성립 — e2e/tutorial-click-through.spec.ts가 커버)이지만 차단이 없다 — 키보드락·클릭 실드·밖-클릭 넛지 제거, 사용자는 값을 바꾸고 화면을 자유롭게 탐색할 수 있다. action 코치마크는 타깃 클릭을 기다리며(진행 로직 불변), 타깃 버튼이 disabled면 말풍선에 막힘 힌트를 띄운다.

**오프코스 리졸버(v0.3.5.0)**: 사용자가 안내 코스를 벗어나 화면을 직접 바꿔도(위저드 이전/스텝 인디케이터 점프·info 안내 무시하고 실제 버튼 클릭·검증에 막힌 클릭) CoachmarkTour가 250ms 폴링(2틱 히스테리시스, ~0.5s)으로 현재 화면에 실재하는 action 앵커를 찾아 그 스텝으로 즉시 점프·복귀한다 — 전제는 "한 화면에 이 투어의 action 앵커 최대 1개"(위저드 next-N은 스텝별 상호배타, `components/onboarding/tutorial/__tests__/tours.test.ts` 드리프트 가드가 위저드 스텝 상수와 정합을 못박음). action 2개 이상인 투어에서만 인터벌이 돌고(1개 이하는 점프 경로 도달 불가라 미생성), 앵커 0개(전환 중)·2개 이상(모호)·expected 없음(마지막 action 이후)이면 관망한다. 클릭이 접수됐지만 실제 진행이 막혀 다음 타깃이 나타나지 않는 경우도 리졸버가 ~0.5s 안에 직전 action 스텝으로 되돌리며(마지막 action 포함 — PG 제출 확인창의 확인 버튼이 pgWriteTour의 마지막 action 스텝(`tutorial-bid-confirm`, ConfirmDialog `confirmDataCoachmark`)이라, 확인창 취소로 확인 앵커가 사라지면 리졸버가 제출 스텝으로 복귀시킨다. 확인창이 열려 앵커 2개가 공존하는 동안은 '모호=관망'이 흡수), 기존 notFound 타임아웃 복귀는 폴백으로 유지된다. 점프가 사용자 화면을 당기지 않도록 이미 뷰포트에 보이는 앵커는 스크롤하지 않고(완전히 밖일 때만 center 스크롤 — useAnchorRect 공통), 스텝 전환(점프 포함)은 말풍선 옆 sr-only `role=status` 라이브 리전으로 공지된다.

/tutorial 밖 내부 링크 클릭은 TutorialLeaveGuard가 가로채 [계속 체험하기|나중에 하기(dismissed)|건너뛰기(completed)] 확인 후 이동(프로그래매틱 이동·뒤로가기는 미가드 — 무스탬프라 환영 모달 재노출로 흡수).

실 백엔드 터치는 스텁: 첨부 드롭존 sampleMode(가상 첨부).

건너뛰기 계약(v0.3.2.0)·Esc 무반응·라이트 스포트라이트 링 펄스(v0.3.3.0)는 유지.

**건너뛰기 계약(v0.3.2.0)**: 코치마크의 건너뛰기 버튼 클릭 = 정상 완주와 동일하게 completed 스탬프+done 화면 점프(양 플로우 handleComplete 공유, 재진입 가드 포함). Esc는 코치마크에 무반응 — onSkip이 비가역 완료와 묶이면서 오발 Esc(⌘K 닫기·앵커 탐색 구간)가 영구 완료가 되는 사고를 막기 위해 CoachmarkTour의 전역 Esc 리스너를 제거함(스킵=버튼 전용).

**라이트 스포트라이트(v0.3.3.0)**: 코치마크가 화면을 어둡게 덮던 dim 스크림을 제거 — 배경은 밝게 유지된다. 타깃 강조 링에 opacity 소프트 펄스(`.coachmark-pulse`)를 더해 시선을 유도한다(`prefers-reduced-motion` 존중, 자세히는 DESIGN.md §6)
