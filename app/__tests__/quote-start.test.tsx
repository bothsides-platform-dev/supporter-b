import { expect, it, vi } from "vitest";
vi.mock("@/auth", () => ({
  auth: async () => ({ user: { workspaceType: "buyer" } }),
}));
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
