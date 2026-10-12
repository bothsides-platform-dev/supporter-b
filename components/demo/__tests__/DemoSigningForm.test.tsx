import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DemoSigningForm } from "../DemoSigningForm";
import { DEMO_VIEWER } from "@/lib/demo/buyer-demo-session";
it("입력 없이도 예시로 서명 체험을 완료할 수 있다", () => {
  const complete = vi.fn();
  render(<DemoSigningForm onComplete={complete} onOpenDocument={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "예시로 완료하기" }));
  expect(complete).toHaveBeenCalledWith(DEMO_VIEWER.name);
});
it("직접 입력하면 입력칸, 확인란, 완료 버튼 순서로 안내한다", () => {
  const complete = vi.fn();
  render(<DemoSigningForm onComplete={complete} onOpenDocument={() => {}} />);
  const name = screen.getByLabelText("서명자 이름");
  expect(name).toHaveAttribute("data-coachmark", "demo-sign-name");
  fireEvent.change(name, { target: { value: "김체험" } });
  const consent = screen.getByLabelText("체험용 합의서 내용을 확인했어요");
  expect(consent).toHaveAttribute("data-coachmark", "demo-sign-consent");
  fireEvent.click(consent);
  fireEvent.click(screen.getByRole("button", { name: "서명 완료하기" }));
  expect(complete).toHaveBeenCalledWith("김체험");
});

it("예시 이름 버튼은 서명을 완료하지 않고 입력란만 채운다", () => {
  const complete = vi.fn();
  render(<DemoSigningForm onComplete={complete} onOpenDocument={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "예시 이름 넣기" }));
  expect(screen.getByLabelText("서명자 이름")).toHaveValue(DEMO_VIEWER.name);
  expect(complete).not.toHaveBeenCalled();
});
