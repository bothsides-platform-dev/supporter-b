import './_guest-review-fixture';
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { GuestQuoteStart } from "../GuestQuoteStart";
import { GUEST_REQUEST_KEY } from "../GuestRequestFlow";
import { createGuestDraft, saveGuestDraft } from "@/lib/guest-rfp/draft";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/guest-rfp/files", () => ({ guestFiles: { get: vi.fn() } }));
vi.mock("@/lib/guest-rfp/events", () => ({ sendGuestEvent: vi.fn() }));
vi.mock("@/lib/guest-rfp/requests-client", () => ({
  guestRequest: async (input: { op: string; id?: string }) => input.op === "account"
    ? { signedIn: false, workspaces: [] }
    : input.op === "recommend" ? { revision: 1, tierBasis: 'unknown', annualRevenue: null, files: [], attachmentCount: 0, answers: { title: input.id === 'old' ? '과거 요청' : '현재 요청' }, recommendation: { risk: 'white', industryName: '업종', candidates: [{ pgWorkspaceId: 'pg', name: 'Alpha', reason: '상담', merchantTier: null, feeRate: null, feeNote: '' }] } } : null,
}));
beforeEach(() => { localStorage.clear(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
const recovery = { id: "old", revision: 1, workspaceId: "workspace" };
it("keeps this browser's selected request after login instead of restoring an older completed request", async () => {
  const draft = createGuestDraft();
  draft.data.websiteUrl = "https://current.example";
  saveGuestDraft(draft);
  localStorage.setItem(GUEST_REQUEST_KEY, draft.id);
  render(<GuestQuoteStart industryGroups={[]} autoRequestEnabled recovery={recovery} />);
  expect((await screen.findAllByText("현재 요청"))[0]).toBeVisible();
  expect(screen.queryByText("과거 요청")).not.toBeInTheDocument();
});
it("restores the server request on a device without an intentional local draft", async () => {
  render(<GuestQuoteStart industryGroups={[]} autoRequestEnabled recovery={recovery} />);
  expect((await screen.findAllByText("과거 요청"))[0]).toBeVisible();
});
it("preserves an in-progress local draft over the historical recovery", async () => {
  const draft = createGuestDraft(); draft.data.websiteUrl = "https://current.example"; saveGuestDraft(draft);
  render(<GuestQuoteStart industryGroups={[]} autoRequestEnabled recovery={recovery} />);
  await waitFor(() => expect(screen.getByLabelText("사업 운영 홈페이지")).toHaveValue("https://current.example"));
  expect(screen.queryByText("과거 요청")).not.toBeInTheDocument();
});
