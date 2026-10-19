import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SavingsCalculator } from "../SavingsCalculator";
const session = vi.hoisted(() => ({ authed: false }));
vi.mock("../use-session-authed", () => ({
  useSessionAuthed: () => session.authed,
}));
let visible: () => void;
let reduced = false;
let preferenceChanged: () => void;
beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "performance",
    ],
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return reduced;
    },
    addEventListener(_: string, listener: () => void) {
      preferenceChanged = listener;
    },
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        visible = () =>
          callback(
            [{ isIntersecting: true }] as IntersectionObserverEntry[],
            this as unknown as IntersectionObserver,
          );
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  reduced = false;
  session.authed = false;
});
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const enter = (label: string, value: string) =>
  fireEvent.change(screen.getByRole("textbox", { name: label }), {
    target: { value },
  });
const amount = () => screen.getByLabelText("예상 연간 절감액");
it("offers only direct inputs and sliders, synchronized without automatic rate correction", () => {
  render(<SavingsCalculator />);
  expect(screen.queryAllByRole("button")).toHaveLength(0);
  enter("연간 카드 거래액", "6000000000");
  enter("수수료 인하 폭", "4.25");
  expect(amount()).toHaveTextContent("2억 5,500만 원");
  expect(
    screen.getByRole("slider", { name: "수수료 인하 폭" }),
  ).toHaveAttribute("aria-valuemax", "4.25");
  expect(
    screen.getByRole("slider", { name: "연간 카드 거래액" }),
  ).toHaveAttribute("aria-valuemax", "6000000000");
  enter("연간 카드 거래액", "100000000");
  enter("수수료 인하 폭", "0.3");
  expect(amount()).toHaveTextContent("30만 원");
  fireEvent.keyDown(screen.getByRole("slider", { name: "수수료 인하 폭" }), {
    key: "Home",
  });
  expect(amount()).toHaveTextContent("0원");
  fireEvent.keyDown(screen.getByRole("slider", { name: "연간 카드 거래액" }), {
    key: "End",
  });
  expect(amount()).toHaveTextContent("0원");
  enter("연간 카드 거래액", "");
  expect(amount()).toHaveTextContent("—");
});
it("counts once on visibility and never changes inputs while idle or re-entering", () => {
  render(<SavingsCalculator />);
  act(() => visible());
  expect(amount()).toHaveTextContent("0원");
  advance(750);
  expect(amount()).toHaveTextContent("1,000만 원");
  expect(screen.getByLabelText("월평균 절감액")).toHaveTextContent(
    "83만 3,333원",
  );
  advance(10000);
  act(() => visible());
  expect(amount()).toHaveTextContent("1,000만 원");
  expect(screen.getByRole("textbox", { name: "연간 카드 거래액" })).toHaveValue(
    "1,000,000,000",
  );
});
it("cancels intro on input and announces only after 500ms inactivity", () => {
  render(<SavingsCalculator />);
  act(() => visible());
  advance(200);
  enter("수수료 인하 폭", "2");
  expect(amount()).toHaveTextContent("2,000만 원");
  advance(499);
  expect(screen.getByRole("status")).toHaveTextContent("1,000만 원");
  advance(1);
  expect(screen.getByRole("status")).toHaveTextContent("2,000만 원");
  advance(1000);
  expect(amount()).toHaveTextContent("2,000만 원");
});
it("shows final results immediately with reduced motion", () => {
  reduced = true;
  render(<SavingsCalculator />);
  act(() => visible());
  expect(amount()).toHaveTextContent("1,000만 원");
});
it("rejects unsafe amounts and excessive rate precision/range", () => {
  render(<SavingsCalculator />);
  enter("연간 카드 거래액", "9007199254740992");
  expect(screen.getByRole("textbox", { name: "연간 카드 거래액" })).toHaveValue(
    "1,000,000,000",
  );
  enter("수수료 인하 폭", "100.01");
  expect(screen.getByRole("textbox", { name: "수수료 인하 폭" })).toHaveValue(
    "1",
  );
  enter("수수료 인하 폭", "0.123");
  expect(screen.getByRole("textbox", { name: "수수료 인하 폭" })).toHaveValue(
    "0.12",
  );
});
it.each([false, true])("routes the quote CTA for authed=%s", (authed) => {
  session.authed = authed;
  render(<SavingsCalculator />);
  expect(
    screen.getByRole("link", { name: "맞춤 PG 견적 무료로 받기" }),
  ).toHaveAttribute("href", authed ? "/rfp-create" : "/quote-start");
});

it("preserves a pending announcement when reduced motion changes during debounce", () => {
  render(<SavingsCalculator />);
  act(() => visible());
  advance(750);
  enter("수수료 인하 폭", "2");
  advance(200);
  act(() => {
    reduced = true;
    preferenceChanged();
  });
  advance(500);
  expect(screen.getByRole("status")).toHaveTextContent("2,000만 원");
});
it("holds the range and announcement throughout a pointer drag, commits on release", () => {
  render(<SavingsCalculator />);
  act(() => visible());
  advance(750);
  const slider = screen.getByRole("slider", { name: "수수료 인하 폭" });
  const root = slider.parentElement!.parentElement!;
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 300,
    height: 44,
    right: 300,
    bottom: 44,
    x: 0,
    y: 0,
    toJSON() {},
  });
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      pointerId = 1;
    },
  );
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = () => true;
  Element.prototype.releasePointerCapture = vi.fn();
  fireEvent.pointerDown(root, { clientX: 100, button: 0 });
  fireEvent.pointerMove(root, { clientX: 200 });
  advance(1000);
  expect(amount()).toHaveTextContent("2,000만 원");
  expect(slider).toHaveAttribute("aria-valuemax", "3");
  expect(screen.getByRole("status")).toHaveTextContent("1,000만 원");
  fireEvent.pointerUp(root, { clientX: 200 });
  expect(screen.getByRole("status")).toHaveTextContent("2,000만 원");
});
