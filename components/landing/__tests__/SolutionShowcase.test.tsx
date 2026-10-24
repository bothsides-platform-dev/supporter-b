import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SolutionShowcase } from "../SolutionShowcase";
import { ScrollDrivenSolution } from "../scroll-pinned/ScrollDrivenSolution";
import { SOLUTION_SCENES as scenes } from "../solution-scenes";

const props = { scenes };

describe("solution comparison", () => {
  it("exposes every explanation and a single comparison table in every step", () => {
    const { rerender } = render(<SolutionShowcase {...props} />);
    for (const step of [null, 0, 1, 2, 3, 1, 0]) {
      rerender(<SolutionShowcase {...props} activeStep={step} />);
      for (const scene of scenes)
        expect(screen.getByText(scene.description)).toBeVisible();
      expect(screen.getAllByRole("table")).toHaveLength(1);
      expect(screen.getAllByRole("columnheader")).toHaveLength(7);
      expect(screen.getAllByRole("row")).toHaveLength(4);
      expect(
        screen.getAllByText(/신규 상담은 업종에 맞는 PG사 한 곳부터/),
      ).toHaveLength(1);
    }
  });
  it("highlights the matching columns or recommended row without hiding other conditions", () => {
    const { rerender } = render(<SolutionShowcase {...props} />);
    for (const [step, columns, row] of [
      [0, [1], null],
      [1, [2, 3, 4, 5], null],
      [2, [6], null],
      [3, [], 0],
      [0, [1], null],
    ] as const) {
      rerender(<SolutionShowcase {...props} activeStep={step} />);
      const headers = screen.getAllByRole("columnheader");
      expect(
        headers.flatMap((h, i) => (h.dataset.active === "true" ? [i] : [])),
      ).toEqual(columns);
      const rows = screen.getAllByRole("row").slice(1);
      expect(
        rows.flatMap((r, i) => (r.dataset.active === "true" ? [i] : [])),
      ).toEqual(row === null ? [] : [row]);
      rows.forEach((r, ri) =>
        within(r)
          .getAllByRole("cell")
          .forEach((cell, ci) => {
            expect(cell.dataset.active === "true").toBe(
              ri === row || (columns as readonly number[]).includes(ci),
            );
            expect(cell.firstElementChild).not.toHaveStyle({
              transform: "scale(1.05)",
            });
          }),
      );
    }
  });
  it("provides a named keyboard-scrollable comparison region", () => {
    render(<SolutionShowcase {...props} />);
    expect(
      screen.getByRole("region", { name: "견적 비교 예시" }),
    ).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("table")).toHaveAccessibleName("견적 비교 예시");
  });
});

describe("solution scrolling", () => {
  let reduced: boolean;
  let contentHeight: number;
  let mediaChange: () => void;
  let observers: (() => void)[];
  beforeEach(() => {
    reduced = false;
    contentHeight = 700;
    observers = [];
    vi.stubGlobal("innerWidth", 1440);
    vi.stubGlobal("innerHeight", 900);
    vi.stubGlobal("scrollY", 0);
    vi.stubGlobal(
      "scrollTo",
      vi.fn(({ top }: ScrollToOptions) => {
        vi.stubGlobal("scrollY", top);
        window.dispatchEvent(new Event("scroll"));
      }),
    );
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
          observers.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function () {
        return { top: 1000 - window.scrollY, height: contentHeight } as DOMRect;
      },
    );
    const getStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
      const style = getStyle(el);
      return new Proxy(style, {
        get(target, key) {
          if (key === "top") return "68px";
          if (key === "paddingTop" || key === "paddingBottom") return "32px";
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const track = (container: HTMLElement) => container.firstElementChild!;
  const selected = () =>
    screen
      .getAllByRole("button")
      .findIndex((b) => b.getAttribute("aria-pressed") === "true");

  it("renders all content on the server and hydrates without recovery errors", async () => {
    const host = document.createElement("div");
    host.innerHTML = renderToString(<ScrollDrivenSolution {...props} />);
    scenes.forEach((scene) =>
      expect(host.textContent).toContain(scene.description),
    );
    expect(host.querySelectorAll("table")).toHaveLength(1);
    for (
      let el: HTMLElement | null = host.querySelector("table");
      el && el !== host;
      el = el.parentElement
    ) {
      expect(el).not.toHaveStyle({ opacity: "0" });
    }
    expect(track(host)).toHaveAttribute("data-pinned", "false");
    document.body.append(host);
    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(host, <ScrollDrivenSolution {...props} />, {
        onRecoverableError: (e) => errors.push(e),
      });
    });
    expect(errors).toEqual([]);
    act(() => root.unmount());
    host.remove();
  });
  it("divides the extra 160vh equally and follows reverse scroll", () => {
    const { container } = render(<ScrollDrivenSolution {...props} />);
    expect(track(container)).toHaveAttribute("data-pinned", "true");
    for (const [y, step] of [
      [932, 0],
      [1292, 1],
      [1652, 2],
      [2012, 3],
      [1652, 2],
      [932, 0],
      [4000, 3],
    ]) {
      act(() => {
        vi.stubGlobal("scrollY", y);
        fireEvent.scroll(window);
      });
      expect(selected()).toBe(step);
    }
  });
  it("selects the same scroll segments with click, Enter and Space", async () => {
    const user = userEvent.setup();
    render(<ScrollDrivenSolution {...props} />);
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[2]);
    expect(window.scrollY).toBe(1832);
    expect(selected()).toBe(2);
    buttons[1].focus();
    await user.keyboard("{Enter}");
    expect(window.scrollY).toBe(1472);
    expect(selected()).toBe(1);
    buttons[3].focus();
    await user.keyboard(" ");
    expect(window.scrollY).toBe(2192);
    expect(selected()).toBe(3);
  });
  it("rechecks width, header space, content size and motion preference", () => {
    const { container } = render(<ScrollDrivenSolution {...props} />);
    const check = (expected: boolean) =>
      expect(track(container)).toHaveAttribute("data-pinned", String(expected));
    check(true);
    act(() => {
      vi.stubGlobal("innerWidth", 1023);
      fireEvent.resize(window);
    });
    check(false);
    act(() => {
      vi.stubGlobal("innerWidth", 1024);
      fireEvent.resize(window);
    });
    check(true);
    act(() => {
      vi.stubGlobal("innerHeight", 800);
      fireEvent.resize(window);
    });
    check(false);
    act(() => {
      vi.stubGlobal("innerHeight", 900);
      fireEvent.resize(window);
    });
    check(true);
    act(() => {
      contentHeight = 800;
      observers.forEach((cb) => cb());
    });
    check(false);
    act(() => {
      contentHeight = 700;
      observers.forEach((cb) => cb());
    });
    check(true);
    act(() => {
      reduced = true;
      mediaChange();
    });
    check(false);
    act(() => {
      reduced = false;
      mediaChange();
    });
    check(true);
  });
  it("allows selection in document flow without moving the page", async () => {
    vi.stubGlobal("innerWidth", 390);
    render(<ScrollDrivenSolution {...props} />);
    await userEvent.click(screen.getAllByRole("button")[2]);
    expect(selected()).toBe(2);
    expect(window.scrollTo).not.toHaveBeenCalled();
    scenes.forEach((scene) =>
      expect(screen.getByText(scene.description)).toBeVisible(),
    );
  });
});
