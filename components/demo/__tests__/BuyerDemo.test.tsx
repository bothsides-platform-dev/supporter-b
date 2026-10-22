import { renderToString } from "react-dom/server";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BuyerDemo } from "../BuyerDemo";
import { decideRoute } from "@/lib/auth/route-decision";
import { useRfpDraftStore } from "@/lib/stores/rfp-draft";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/demo",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/server/actions/rfp", () => ({
  createRfpAction: vi.fn(() => {
    throw Error("live action");
  }),
  verifyDraftFilesAction: vi.fn(),
  awardRfpAction: vi.fn(),
  requestRequoteAction: vi.fn(),
  closeRfpAction: vi.fn(),
  cancelRfpAction: vi.fn(),
}));

describe("실제 구매사 화면 데모", () => {
  it("하이드레이션 전에는 실제 업무 링크를 노출하지 않는다", () => {
    expect(renderToString(<BuyerDemo />)).not.toContain('href="/rfp-create"');
  });
  it("데모 경로만 공개한다", () => {
    expect(decideRoute("/demo", "", false)).toEqual({ kind: "next" });
    expect(decideRoute("/demo-admin", "", false).kind).toBe("redirect");
  });
  it("실제 홈에서 실제 질문별 작성 화면으로 이동하며 기존 초안은 보존한다", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    useRfpDraftStore.setState({ title: "실제 작성 중인 견적" });
    const saved = localStorage.getItem("support-b-rfp-draft");
    const user = userEvent.setup();
    const { unmount } = render(<BuyerDemo />);
    await user.click(
      screen.getByRole("button", { name: "견적 요청부터 체험하기" }),
    );
    const contact = screen.getByRole("link", { name: "서비스 문의" });
    expect(contact).toHaveAttribute("href", "mailto:contact@support-b.com");
    await user.click(screen.getByRole("link", { name: "견적 요청하기" }));
    await user.click(await screen.findByRole("button", { name: "다음" }));
    expect(
      await screen.findByTestId("rfp-question-scroll"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("질문 진행률")).toBeInTheDocument();
    expect(useRfpDraftStore.getState().title).toBe("실제 작성 중인 견적");
    expect(localStorage.getItem("support-b-rfp-draft")).toBe(saved);
    act(() => unmount());
    await waitFor(() =>
      expect(useRfpDraftStore.getState().title).toBe("실제 작성 중인 견적"),
    );
    vi.unstubAllGlobals();
  });
});

it("시작 화면은 두 모드와 실제 작성 진입점을 제공한다", () => {
  render(<BuyerDemo />);
  expect(
    screen.getByRole("button", { name: "핵심 흐름 체험하기" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "견적 요청부터 체험하기" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "내 조건으로 견적 요청하기" }),
  ).toHaveAttribute("href", "/quote-start");
});
