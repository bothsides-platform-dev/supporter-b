import { act, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SolutionShowcase } from "../SolutionShowcase";
import { ScrollDrivenSolution } from "../scroll-pinned/ScrollDrivenSolution";

const scenes = [
  {
    title: "우리 사업에 맞는",
    emphasis: "수수료를 확인해요",
    description: "수수료 설명",
    example: "fee" as const,
  },
  {
    title: "도입 전에",
    emphasis: "필요한 조건을 살펴봐요",
    description: "조건 설명",
    example: "conditions" as const,
  },
  {
    title: "더 나은 조건을 위해",
    emphasis: "한 번 더 협의해요",
    description: "협의 설명",
    example: "negotiation" as const,
  },
  {
    title: "확인부터 결정까지",
    emphasis: "한곳에서 이어가요",
    description: "결정 설명",
    example: "decision" as const,
  },
];
const props = { scenes };

describe("SolutionShowcase scenes", () => {
  it("fallback exposes every scene and example without fake controls", () => {
    render(<SolutionShowcase {...props} />);
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(screen.getAllByText(/이해를 돕기 위한 예시예요/)).toHaveLength(4);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("moves copy and example together in both directions and hides inactive scenes accessibly", () => {
    const { rerender, container } = render(
      <SolutionShowcase {...props} activeStep={0} />,
    );
    for (const step of [0, 1, 2, 3, 1, 0]) {
      rerender(<SolutionShowcase {...props} activeStep={step} />);
      const visible = screen.getAllByRole("article");
      expect(visible).toHaveLength(1);
      expect(within(visible[0]).getByRole("heading").textContent).toContain(
        scenes[step].emphasis,
      );
      expect(
        visible[0]
          .querySelector("[data-example]")
          ?.getAttribute("data-example"),
      ).toBe(scenes[step].example);
      expect(
        container.querySelectorAll('article[aria-hidden="true"][inert]'),
      ).toHaveLength(3);
    }
  });
});

describe("solution scroll and fallback", () => {
  let reduced = false;
  let sceneHeight = 400;
  let resize: () => void;
  let mediaChange: () => void;
  beforeEach(() => {
    reduced = false;
    sceneHeight = 400;
    vi.stubGlobal("innerWidth", 1440);
    vi.stubGlobal("innerHeight", 900);
    vi.stubGlobal("scrollY", 0);
    vi.stubGlobal("matchMedia", () => ({
      get matches() {
        return reduced;
      },
      addEventListener: (_: string, cb: () => void) => {
        mediaChange = cb;
      },
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          resize = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return {
          top: this.tagName === "ARTICLE" ? 0 : 1000 - window.scrollY,
          height: this.tagName === "ARTICLE" ? sceneHeight : 0,
        } as DOMRect;
      },
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it("server render exposes all scenes before measurement", () => {
    const html = renderToString(<ScrollDrivenSolution {...props} />);
    expect(html).toContain("수수료 설명");
    expect(html).toContain("결정 설명");
  });
  it("uses equal scroll segments and returns to earlier scenes", () => {
    render(<ScrollDrivenSolution {...props} />);
    for (const [y, title] of [
      [1000, "수수료를 확인해요"],
      [1700, "필요한 조건을 살펴봐요"],
      [2400, "한 번 더 협의해요"],
      [3100, "한곳에서 이어가요"],
      [1000, "수수료를 확인해요"],
    ] as const) {
      act(() => {
        vi.stubGlobal("scrollY", y);
        window.dispatchEvent(new Event("scroll"));
      });
      expect(screen.getAllByRole("article")).toHaveLength(1);
      expect(screen.getByRole("heading").textContent).toContain(title);
    }
  });
  it("re-evaluates width, available height, content growth and reduced motion", () => {
    render(<ScrollDrivenSolution {...props} />);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    act(() => {
      vi.stubGlobal("innerWidth", 1023);
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getAllByRole("article")).toHaveLength(4);
    act(() => {
      vi.stubGlobal("innerWidth", 1024);
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    act(() => {
      vi.stubGlobal("innerHeight", 400);
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getAllByRole("article")).toHaveLength(4);
    act(() => {
      vi.stubGlobal("innerHeight", 900);
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    act(() => {
      sceneHeight = 950;
      resize();
    });
    expect(screen.getAllByRole("article")).toHaveLength(4);
    act(() => {
      sceneHeight = 400;
      resize();
    });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    act(() => {
      reduced = true;
      mediaChange();
    });
    expect(screen.getAllByRole("article")).toHaveLength(4);
  });
});
