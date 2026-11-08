import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentRecoveryLink } from "../AgentRecoveryLink";

afterEach(() => vi.unstubAllGlobals());
const href =
  "http://localhost:3000/agent/authorize?state=opaque&code_challenge=challenge";

it("copies the full authentication link, retaining state and PKCE", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<AgentRecoveryLink href={href} label="연결 화면 열기" />);
  expect(screen.getByRole("link", { name: "연결 화면 열기" })).toHaveAttribute(
    "href",
    href,
  );
  fireEvent.click(screen.getByRole("button", { name: "링크 복사해요" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("링크를 복사했어요"),
  );
  expect(writeText).toHaveBeenCalledWith(href);
});

it("provides a selectable link if the browser blocks clipboard access", async () => {
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  render(<AgentRecoveryLink href={href} label="연결 화면 열기" />);
  fireEvent.click(screen.getByRole("button", { name: "링크 복사해요" }));
  const input = await screen.findByRole("textbox", { name: "다시 열 링크" });
  expect(input).toHaveValue(href);
  expect(input).toHaveAttribute("readonly");
  fireEvent.focus(input);
  expect((input as HTMLTextAreaElement).selectionEnd).toBe(href.length);
});
