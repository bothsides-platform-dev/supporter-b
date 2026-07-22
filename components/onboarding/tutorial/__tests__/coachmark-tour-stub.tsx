// CoachmarkTour 공용 test-double — buyer/pg 튜토리얼 플로우 테스트가 공유한다.
//
// 실제 투어는 앵커 탐색·rAF 폴링·포털에 의존해 jsdom 에서 다루기 어렵다. 두 플로우
// 테스트가 검증하는 것은 "어떤 투어가 어느 phase 에 뜨는가"와 "finish/skip 이 각각
// 무엇을 하는가"뿐이므로, 스텝 타깃을 testid·data-attribute 로 노출하고 두 콜백을
// 버튼으로 뽑아낸다.
//
// vi.mock 팩토리는 호이스팅되므로 top-level import 로 끌어오면 안 된다 — 소비처는
//   vi.mock('@/components/onboarding/coachmarks', async () => ({
//     CoachmarkTour: (await import('./coachmark-tour-stub')).CoachmarkTourStub,
//   }));
// 형태로 팩토리 안에서 동적 import 한다.
//
// 파일명에 `.test.`/`.spec.` 이 없어 vitest include 패턴에 수집되지 않는다.

export function CoachmarkTourStub({
  steps,
  onFinish,
  onSkip,
}: {
  steps: { target: string }[];
  onFinish?: () => void;
  onSkip?: () => void;
}) {
  return (
    <div
      data-testid={`tour-${steps[0]?.target}`}
      data-targets={steps.map((s) => s.target).join(',')}
    >
      <button type="button" onClick={onFinish}>{`tour-finish-${steps[0]?.target}`}</button>
      <button type="button" onClick={onSkip}>{`tour-skip-${steps[0]?.target}`}</button>
    </div>
  );
}
