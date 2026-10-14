vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { guestFiles } from "@/lib/guest-rfp/files";
import { sendGuestEvent } from "@/lib/guest-rfp/events";
import { GuestQuoteStart } from "../GuestQuoteStart";
import { useRfpDraftStore } from "@/lib/stores/rfp-draft";
import {
  GUEST_DRAFT_KEY,
  createGuestDraft,
  saveGuestDraft,
  loadGuestDraft,
} from "@/lib/guest-rfp/draft";
vi.mock("@/lib/guest-rfp/files", () => ({
  guestFiles: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
}));
vi.mock("@/lib/guest-rfp/events", () => ({ sendGuestEvent: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
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
  fireEvent.click(await screen.findByRole("button", { name: "작성 마치기" }));
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "로그인하고 이어 쓸게요" }),
    ).toHaveAttribute("href", "/login?next=%2Frfp-create%3Fresume%3Dguest"),
  );
  expect(JSON.parse(localStorage.getItem(GUEST_DRAFT_KEY)!).completed).toBe(
    true,
  );
});

it("omits routine storage notices and draft management while retaining answers", async () => {
  render(<GuestQuoteStart industryGroups={[]} />);
  const input = await screen.findByLabelText("사업 운영 홈페이지");
  expect(screen.queryByText("첨부 원본은 파일을 선택한 뒤 따로 보관해요")).not.toBeInTheDocument();
  expect(screen.queryByText("초안 관리")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "임시 초안을 삭제해요" })).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: "example.com" } });
  expect(screen.queryByText("답변을 이 브라우저에 보관했어요")).not.toBeInTheDocument();
  expect(loadGuestDraft()?.data.websiteUrl).toBe("example.com");
});

it("reports durable answer saves, hides success after failure, and retries current answers", async () => {
  render(<GuestQuoteStart industryGroups={[]} />);
  const input = await screen.findByLabelText("사업 운영 홈페이지");
  expect(screen.queryByText("답변을 이 브라우저에 보관했어요")).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: "example.com" } });
  expect(loadGuestDraft()?.data.websiteUrl).toBe("example.com");
  const original = Storage.prototype.setItem;
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === GUEST_DRAFT_KEY) throw new DOMException("quota", "QuotaExceededError");
    return original.call(this, key, value);
  });
  fireEvent.change(input, { target: { value: "updated.example.com" } });
  expect(screen.queryByText("답변을 이 브라우저에 보관했어요")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("저장");
  spy.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: "다시 저장해요" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(loadGuestDraft()?.data.websiteUrl).toBe("updated.example.com");
});

it("skips optional answers without erasing them and restores the current question", async () => {
  const d = createGuestDraft();
  d.data.contentQuestion = "sellers";
  d.data.productInfo = { hasMarketplaceSellers: true };
  saveGuestDraft(d);
  const view = render(<GuestQuoteStart industryGroups={[]} />);
  expect(await screen.findByText("선택")).toBeInTheDocument();
  expect(screen.getByLabelText("질문 진행률")).toHaveTextContent("5 / 14");
  fireEvent.click(screen.getByRole("button", { name: "지금은 건너뛰어요" }));
  expect(loadGuestDraft()?.data.productInfo.hasMarketplaceSellers).toBe(true);
  view.unmount();
  render(<GuestQuoteStart industryGroups={[]} />);
  expect(await screen.findByRole("heading", { name: "환금성 상품을 판매하나요?" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "지금은 건너뛰어요" })).not.toBeInTheDocument();
});

it("validates all required answers even when skipping the final attachment question", async () => {
  const d = createGuestDraft();
  d.data.contentQuestion = "attachments";
  saveGuestDraft(d);
  render(<GuestQuoteStart industryGroups={[]} />);
  fireEvent.click(await screen.findByRole("button", { name: "지금은 건너뛰어요" }));
  expect(screen.getByRole("heading", { name: "어떤 홈페이지에서 판매하나요?" })).toBeInTheDocument();
  expect(screen.getByLabelText("사업 운영 홈페이지")).toHaveFocus();
  expect(screen.getByRole("button", { name: "홈으로" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "로그인하고 이어 쓸게요" })).not.toBeInTheDocument();
});

it("updates progress and announces extra questions when renewal is chosen", async () => {
  const d = createGuestDraft();
  d.data.contentQuestion = "contract";
  saveGuestDraft(d);
  render(<GuestQuoteStart industryGroups={[]} />);
  expect(await screen.findByLabelText("질문 진행률")).toHaveTextContent("10 / 14");
  fireEvent.click(screen.getByRole("button", { name: /갱신/ }));
  expect(screen.getByLabelText("질문 진행률")).toHaveTextContent("10 / 19");
  expect(screen.getByText("갱신 조건 질문 5개를 추가했어요.")).toHaveAttribute("role", "status");
  fireEvent.click(screen.getByRole("button", { name: "신규 계약" }));
  expect(screen.getByLabelText("질문 진행률")).toHaveTextContent("10 / 14");
});


it("keeps attachment failures separate from successful answer saves and recovers via file retry", async () => {
  const d = createGuestDraft();
  d.data.contentQuestion = "attachments";
  saveGuestDraft(d);
  const file = new File(['%PDF'], 'local.pdf', { type: 'application/pdf' });
  vi.mocked(guestFiles.put).mockRejectedValueOnce(new DOMException('quota', 'QuotaExceededError'));
  vi.mocked(guestFiles.get).mockResolvedValue(undefined);
  render(<GuestQuoteStart industryGroups={[]} />);
  fireEvent.change(await screen.findByLabelText('견적 요청 첨부 파일'), { target: { files: [file] } });
  expect(await screen.findByText('첨부 원본을 아직 보관하지 못했어요')).toBeInTheDocument();
  expect(loadGuestDraft()?.files).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '이전' }));
  expect(screen.getByRole('alert')).toHaveTextContent('파일');
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  vi.mocked(guestFiles.put).mockResolvedValue('ok');
  vi.mocked(guestFiles.get).mockResolvedValue(file);
  fireEvent.click(screen.getByRole('button', { name: '첨부 다시 저장해요' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it("finishes skipped attachments through durable saving once, showing pending state", async () => {
  const d = createGuestDraft();
  Object.assign(d.data, {
    contentQuestion: "attachments", websiteUrl: "https://example.com", title: "제목", mainProducts: "상품",
    industryMode: "custom", customIndustryName: "돌봄", contractType: "new", requiredPaymentMethods: ["card"],
    productInfo: { cashConvertible: false, maximumPrice: "under_100k", salesMethods: ["none"] },
  });
  d.files = [{ id: 'local', name: 'local.pdf', size: 4, type: 'application/pdf' }];
  saveGuestDraft(d);
  const file = new File(['%PDF'], 'local.pdf', { type: 'application/pdf' });
  let finish!: (file: File) => void;
  vi.mocked(guestFiles.get).mockResolvedValue(file);
  render(<GuestQuoteStart industryGroups={[]} />);
  await screen.findByText('local.pdf');
  vi.mocked(guestFiles.get).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: '지금은 건너뛰어요' }));
  expect(screen.getByRole('button', { name: '저장 중…' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '저장 중…' }));
  await act(async () => finish(file));
  expect(await screen.findByRole('link', { name: '로그인하고 이어 쓸게요' })).toBeInTheDocument();
  expect(loadGuestDraft()?.files).toHaveLength(1);
  expect(vi.mocked(sendGuestEvent).mock.calls.filter(call => call[1] === 'completed')).toHaveLength(1);
});


it("keeps the introduction visible on entry and scrolls to the question only after navigation", async () => {
  const scroll = vi.fn();
  HTMLElement.prototype.scrollIntoView = scroll;
  render(<GuestQuoteStart industryGroups={[]} />);
  const input = await screen.findByLabelText('사업 운영 홈페이지');
  expect(scroll).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: 'example.com' } });
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  expect(scroll).toHaveBeenCalledWith({ block: 'start' });
});


it.each(['failed', 'pending'] as const)("reconciles %s attachment verification after successful completion", async (initialRead) => {
  const d = createGuestDraft();
  Object.assign(d.data, {
    contentQuestion: "attachments", websiteUrl: "https://example.com", title: "제목", mainProducts: "상품",
    industryMode: "custom", customIndustryName: "돌봄", contractType: "new", requiredPaymentMethods: ["card"],
    productInfo: { cashConvertible: false, maximumPrice: "under_100k", salesMethods: ["none"] },
  });
  d.files = [{ id: 'local', name: 'local.pdf', size: 4, type: 'application/pdf' }];
  saveGuestDraft(d);
  const file = new File(['%PDF'], 'local.pdf', { type: 'application/pdf' });
  let resolveInitial!: (file: File | undefined) => void;
  const read = vi.mocked(guestFiles.get).mockResolvedValue(file);
  if (initialRead === 'failed') read.mockRejectedValueOnce(new Error('temporary read failure'));
  else read.mockImplementationOnce(() => new Promise(resolve => { resolveInitial = resolve; }));
  render(<GuestQuoteStart industryGroups={[]} />);
  if (initialRead === 'failed') await screen.findByText('첨부 원본을 아직 보관하지 못했어요');
  else await screen.findByText('local.pdf');
  fireEvent.click(screen.getByRole('button', { name: '작성 마치기' }));
  await screen.findByRole('link', { name: '로그인하고 이어 쓸게요' });
  if (initialRead === 'pending') await act(async () => resolveInitial(undefined));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(loadGuestDraft()?.files).toHaveLength(1);
  expect(screen.queryByRole('button', { name: '첨부 확인하기' })).not.toBeInTheDocument();
});


it("keeps essential disclosure outside the initially collapsed additional guidance", async () => {
  render(<GuestQuoteStart industryGroups={[]} />);
  await screen.findByLabelText('사업 운영 홈페이지');
  const summary = screen.getByText('전달·보관 안내 자세히 보기');
  const details = summary.closest('details')!;
  expect(details).not.toHaveAttribute('open');
  const notice = screen.getByRole('complementary', { name: '작성 전 안내' });
  expect(notice).toHaveTextContent('홈페이지 답변 후 다음으로 이동할 때와 작성을 마칠 때');
  expect(notice).toHaveTextContent('홈페이지·업종·제목·계약 유형·첨부 개수');
  expect(notice).toHaveTextContent('이 브라우저에만');
  expect(notice).toHaveTextContent('복원할 수 없어요');
  expect(notice.closest('details')).toBeNull();
  fireEvent.click(summary);
  expect(details).toHaveAttribute('open');
  expect(details).toHaveTextContent('다른 기기에서는 이어 쓸 수 없어요');
  fireEvent.click(summary);
  expect(details).not.toHaveAttribute('open');
});
