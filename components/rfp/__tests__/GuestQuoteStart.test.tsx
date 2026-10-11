vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { GuestQuoteStart } from "../GuestQuoteStart";
import { useRfpDraftStore } from "@/lib/stores/rfp-draft";
import {
  GUEST_DRAFT_KEY,
  createGuestDraft,
  saveGuestDraft,
  loadGuestDraft,
  RESUME_KEY,
} from "@/lib/guest-rfp/draft";
vi.mock("@/lib/guest-rfp/files", () => ({
  guestFiles: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
}));
vi.mock("@/lib/guest-rfp/events", () => ({ sendGuestEvent: vi.fn() }));
beforeEach(() => {
  localStorage.clear();
  useRfpDraftStore.getState().reset();
});
it("starts at homepage, preserves answers on remount, and does not touch member data", async () => {
  useRfpDraftStore.getState().setField("title", "회원 초안");
  const first = render(<GuestQuoteStart industryGroups={[]} />);
  fireEvent.change(await screen.findByLabelText("사업 운영 홈페이지"), {
    target: { value: "example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(
    await screen.findByRole("heading", {
      name: "홈페이지를 어떻게 만들었나요?",
    }),
  ).toBeInTheDocument();
  first.unmount();
  render(<GuestQuoteStart industryGroups={[]} />);
  expect(
    await screen.findByRole("heading", {
      name: "홈페이지를 어떻게 만들었나요?",
    }),
  ).toBeInTheDocument();
  expect(
    JSON.parse(localStorage.getItem(GUEST_DRAFT_KEY)!).data.websiteUrl,
  ).toBe("https://example.com");
  expect(useRfpDraftStore.getState().title).toBe("회원 초안");
});
it("finishes only valid answers and exposes login/signup after durable saving", async () => {
  const d = createGuestDraft();
  Object.assign(d.data, {
    contentQuestion: "attachments",
    websiteUrl: "https://example.com",
    title: "제목",
    mainProducts: "상품",
    industryMode: "custom",
    customIndustryName: "방문 돌봄",
    contractType: "new",
    requiredPaymentMethods: ["card"],
    productInfo: {
      cashConvertible: false,
      maximumPrice: "under_100k",
      salesMethods: ["none"],
    },
  });
  saveGuestDraft(d);
  render(<GuestQuoteStart industryGroups={[]} />);
  fireEvent.click(await screen.findByRole("button", { name: "내용 확인하기" }));
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "로그인하고 이어 쓸게요" }),
    ).toHaveAttribute("href", "/login?next=%2Frfp-create%3Fresume%3Dguest"),
  );
  expect(JSON.parse(localStorage.getItem(GUEST_DRAFT_KEY)!).completed).toBe(
    true,
  );
});

it("refuses deleting another tab replacement from an older public screen", async () => {
  const original = createGuestDraft();
  saveGuestDraft(original);
  render(<GuestQuoteStart industryGroups={[]} />);
  await screen.findByLabelText("사업 운영 홈페이지");
  localStorage.removeItem(GUEST_DRAFT_KEY);
  const replacement = createGuestDraft();
  replacement.data.title = "다른 탭의 새 초안";
  saveGuestDraft(replacement);
  localStorage.setItem(RESUME_KEY, "1");
  fireEvent.click(screen.getByRole("button", { name: "임시 초안을 삭제해요" }));
  await screen.findByRole("dialog", { name: "임시 초안을 삭제할까요?" });
  fireEvent.click(screen.getByRole("button", { name: "삭제해요" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("다른 탭");
  expect(loadGuestDraft()?.id).toBe(replacement.id);
  expect(localStorage.getItem(RESUME_KEY)).toBe("1");
});

it("keeps public answers when the delete confirmation is closed", async () => {
  const d = createGuestDraft();
  d.data.websiteUrl = "https://example.com";
  saveGuestDraft(d);
  render(<GuestQuoteStart industryGroups={[]} />);
  fireEvent.click(await screen.findByRole("button", { name: "임시 초안을 삭제해요" }));
  await screen.findByRole("dialog", { name: "임시 초안을 삭제할까요?" });
  expect(loadGuestDraft()?.data.websiteUrl).toBe("https://example.com");
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(loadGuestDraft()?.id).toBe(d.id);
});
