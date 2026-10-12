import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BuyerDemoGuide } from "../BuyerDemoGuide";

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return new DOMRect(20, 300, this.hidden ? 0 : 120, this.hidden ? 0 : 32);
    },
  );
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("실제 화면의 다음 버튼을 안내하고 막힌 클릭에서도 안내를 유지한다", async () => {
  render(
    <>
      <button data-coachmark="demo-question-next">다음</button>
      <BuyerDemoGuide revised={false} />
    </>,
  );
  expect(
    await screen.findByRole("region", {
      name: "답변을 확인하고 다음으로 가요",
    }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(
    screen.getByRole("region", { name: "답변을 확인하고 다음으로 가요" }),
  ).toBeInTheDocument();
});
it("화면 전환과 이전 이동을 따라가며 안내만 끄고 다시 켤 수 있다", async () => {
  const { rerender } = render(
    <>
      <button data-coachmark="demo-start">시작</button>
      <BuyerDemoGuide revised={false} />
    </>,
  );
  expect(
    await screen.findByRole("region", { name: "견적 요청부터 시작해요" }),
  ).toBeInTheDocument();
  rerender(
    <>
      <button data-coachmark="demo-send">보내기</button>
      <BuyerDemoGuide revised={false} />
    </>,
  );
  expect(
    await screen.findByRole("region", { name: "PG사에 메시지를 보내보세요" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "설명 보기" }));
  fireEvent.click(screen.getByRole("button", { name: "설명 접기" }));
  expect(
    screen.getByRole("region", { name: "PG사에 메시지를 보내보세요" }),
  ).toBeInTheDocument();
  expect(document.querySelector("[data-demo-next-action]")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "설명 보기" }));
  expect(
    await screen.findByRole("region", { name: "PG사에 메시지를 보내보세요" }),
  ).toBeInTheDocument();
});
it("확인창이 열리면 그 안의 행동만 안내하고 닫으면 수정 요청으로 복귀한다", async () => {
  const { rerender } = render(
    <>
      <button data-coachmark="demo-requote">수정</button>
      <div role="dialog">
        <div data-demo-guide-slot />
        <button data-coachmark="demo-award-confirm">확정</button>
      </div>
      <BuyerDemoGuide revised={false} />
    </>,
  );
  expect(
    await screen.findByRole("region", { name: "조건을 확인하고 선정해요" }),
  ).toBeInTheDocument();
  rerender(
    <>
      <button data-coachmark="demo-requote">수정</button>
      <BuyerDemoGuide revised={false} />
    </>,
  );
  expect(
    await screen.findByRole("region", { name: "견적 수정을 요청해보세요" }),
  ).toBeInTheDocument();
});
it("숨겨진 모바일 버튼은 건너뛰고 수정 후에는 선정 버튼을 안내한다", async () => {
  render(
    <>
      <button hidden data-coachmark="demo-review-next">
        다음
      </button>
      <button data-coachmark="demo-requote">수정</button>
      <button data-coachmark="tutorial-award-cta">선정</button>
      <BuyerDemoGuide revised />
    </>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("region", { name: "수정된 견적을 선정해요" }),
    ).toBeInTheDocument(),
  );
});

it("PG 선택 전에는 비활성 다음 버튼보다 PG 선택을 먼저 안내한다", async () => {
  render(
    <>
      <button disabled data-coachmark="demo-review-next">
        다음
      </button>
      <label data-coachmark="demo-pg-choice">
        <input type="radio" />
        데모페이
      </label>
      <BuyerDemoGuide revised={false} />
    </>,
  );
  expect(
    await screen.findByRole("region", { name: "상담할 PG사를 선택해요" }),
  ).toBeInTheDocument();
});

it("작성·상담 요청·메시지·보관함의 진행 번호를 실제 안내 순서로 표시한다", async () => {
  const view = (target: string) => (
    <>
      <button data-coachmark={target}>행동</button>
      <BuyerDemoGuide revised={false} />
    </>
  );
  const { rerender } = render(view("demo-start"));
  for (const [target, progress] of [
    ["demo-start", "1/15"],
    ["tutorial-wizard-next-1", "2/15"],
    ["demo-question-next", "3/15"],
    ["demo-pg-choice", "4/15"],
    ["tutorial-wizard-submit", "5/15"],
    ["demo-send", "6/15"],
    ["demo-document", "15/15"],
    ["tutorial-wizard-submit", "5/15"],
  ]) {
    rerender(view(target));
    expect(await screen.findByText(progress)).toBeInTheDocument();
  }
});

it("모달 안내는 모달 안의 전용 영역에 배치하고 입력과 버튼을 덮지 않는다", async () => {
  const { container } = render(
    <>
      <div role="dialog">
        <div data-demo-guide-slot />
        <input aria-label="이름" />
        <button data-coachmark="demo-sign-complete">완료</button>
      </div>
      <BuyerDemoGuide revised />
    </>,
  );
  const region = await screen.findByRole("region", {
    name: "이름을 입력하고 서명을 마쳐요",
  });
  expect(container.querySelector("[data-demo-guide-slot]")).toContainElement(
    region,
  );
  expect(container.querySelector('[data-slot="coachmark-overlay"]')).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "설명 보기" }));
  fireEvent.click(screen.getByRole("button", { name: "설명 접기" }));
  expect(screen.getByRole("button", { name: "완료" })).toHaveAttribute(
    "data-demo-next-action",
  );
  fireEvent.change(screen.getByLabelText("이름"), {
    target: { value: "김체험" },
  });
  expect(screen.getByLabelText("이름")).toHaveValue("김체험");
});

it("설명을 접어도 이동한 화면의 다음 행동을 계속 강조한다", async () => {
  const view = (target: string) => (
    <>
      <button data-coachmark={target}>행동</button>
      <BuyerDemoGuide revised={false} />
    </>
  );
  const { rerender } = render(view("demo-start"));
  await screen.findByRole("region", { name: "견적 요청부터 시작해요" });
  fireEvent.click(screen.getByRole("button", { name: "설명 보기" }));
  fireEvent.click(screen.getByRole("button", { name: "설명 접기" }));
  rerender(view("demo-send"));
  await screen.findByRole("region", { name: "PG사에 메시지를 보내보세요" });
  expect(screen.getByRole("button", { name: "행동" })).toHaveAttribute(
    "data-demo-next-action",
  );
  expect(screen.getByRole("button", { name: "설명 보기" })).toBeInTheDocument();
});
