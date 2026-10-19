import { describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { render, screen } from "@testing-library/react";

vi.mock("motion/react", () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(tag, props, children as React.ReactNode);
    El.displayName = `motion.${tag}`;
    return El;
  };

  return {
    motion: new Proxy({}, { get: (_, tag: string) => makeEl(tag) }),
  };
});

import { HeroKineticHeadline, BrandWordB } from "../HeroKineticHeadline";

describe("HeroKineticHeadline", () => {
  it("cycles buyer situations before the fixed brand sentence in reading order", () => {
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    const { container, unmount } = render(
      <HeroKineticHeadline rollingPosition="before" />,
    );
    const phrases = [
      "PG사마다 같은 설명을 반복하기 번거로울 때.",
      "받은 견적이 회사에 유리한지 판단이 어려울 때.",
      "우리 서비스가 PG사에 가입이 될지 막막할 때.",
      "결제 오픈 전까지 무엇부터 준비할지 고민될 때.",
    ];
    try {
      for (let i = 0; i <= phrases.length; i++) {
        expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(
          `${phrases[i % phrases.length]} 서포트비를 찾아주세요.`,
        );
        if (i < phrases.length) act(() => vi.advanceTimersByTime(3856));
      }
      expect(container.querySelector("svg")).toBeNull();
      expect(screen.getByText("서포트비")).toHaveClass("font-black");
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it("includes custom PG content in the heading with the fixed verb before the rolling phrase", () => {
    render(
      <HeroKineticHeadline
        line1Words={[<BrandWordB key="brand" particle="로" />]}
        phrases={["조건이 정리된 리드를"]}
        suffix="만나세요."
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(
      "서포트비로 만나세요. 조건이 정리된 리드를",
    );
  });

  it("renders only 서포트비 in bold while leaving the trailing particle unbolded", () => {
    render(
      <h1>
        <BrandWordB particle="로" />
      </h1>,
    );

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("서포트비로");
    expect(screen.getByText("서포트비")).toHaveClass("font-black");
    expect(screen.getByText("로")).not.toHaveClass("font-black");
  });
});
