import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(async () => ({ user: { workspaceType: "buyer" } })),
}));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/components/rfp/GuestQuoteStart", () => ({
  GuestQuoteStart: () => null,
}));
import QuoteStartPage from "../quote-start/page";
it("opens the member wizard for an authenticated buyer without requiring a public draft", async () => {
  await expect(QuoteStartPage()).rejects.toThrow(/^redirect:\/rfp-create$/);
});

it("offers authenticated PG users a Support B link to home", async () => {
  authMock.mockResolvedValueOnce({ user: { workspaceType: "pg" } });
  render(await QuoteStartPage());
  expect(screen.getByRole("link", { name: "서포트비로 이동해요" })).toHaveAttribute("href", "/home");
  expect(screen.getByRole("link", { name: "로그아웃해요" })).toHaveAttribute("href", "/logout");
});
