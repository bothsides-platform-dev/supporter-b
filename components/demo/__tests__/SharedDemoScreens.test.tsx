import { MessageComposeSheet } from "@/components/messages/MessageComposeSheet";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BuyerDemoContext } from "@/lib/demo/buyer-demo-context";
import {
  createBuyerDemoSession,
  DEMO_PG,
  DEMO_VIEWER,
} from "@/lib/demo/buyer-demo-session";
import { tutorialRfpDraftSeed } from "@/lib/onboarding/tutorial-fixtures";
import { ThreadView } from "@/components/messages/ThreadView";
import { AwardConfirmDialog } from "@/components/rfp/comparison/AwardConfirmDialog";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/demo",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/server/actions/chat/sendChatMessageAction", () => ({
  sendChatMessageAction: vi.fn(async () => ({
    ok: false,
    error: "LIVE_ACTION_FORBIDDEN",
  })),
}));
vi.mock("@/lib/server/actions/chat/markConversationReadAction", () => ({
  markConversationReadAction: vi.fn(async () => ({ ok: false })),
}));
vi.mock("@/lib/server/actions/rfp", () => ({
  awardRfpAction: vi.fn(async () => ({
    ok: false,
    error: "LIVE_ACTION_FORBIDDEN",
  })),
}));

HTMLElement.prototype.scrollIntoView = vi.fn();

vi.mock("@/lib/server/actions/chat/listTemplatesAction", () => ({
  listTemplatesAction: vi.fn(async () => ({ ok: true, templates: [] })),
}));
vi.mock("@/lib/server/actions/chat/saveTemplateAction", () => ({
  saveTemplateAction: vi.fn(async () => ({ ok: false })),
}));
describe("제품 컴포넌트의 데모 전송 경계", () => {
  it("PG 프로필의 실제 메시지 작성창도 데모 대화에 연결한다", async () => {
    const demo = createBuyerDemoSession();
    demo.submit(tutorialRfpDraftSeed);
    render(
      <BuyerDemoContext value={demo}>
        <MessageComposeSheet
          open
          onOpenChange={() => {}}
          counterparty={DEMO_PG}
        />
      </BuyerDemoContext>,
    );
    await userEvent.type(
      screen.getByPlaceholderText("상대에게 보낼 메시지를 입력하세요"),
      "견적 조건 문의",
    );
    await userEvent.click(screen.getByRole("button", { name: "바로 전송" }));
    expect(
      demo.getSnapshot().messages.some((m) => m.body === "견적 조건 문의"),
    ).toBe(true);
  });
  it("실제 메시지 컴포저로 보낸 메시지와 PG 답변을 보여준다", async () => {
    const demo = createBuyerDemoSession();
    demo.submit(tutorialRfpDraftSeed);
    const user = userEvent.setup();
    render(
      <BuyerDemoContext value={demo}>
        <ThreadView
          conversationId="buyer-demo-conversation"
          counterparty={DEMO_PG}
          viewer={DEMO_VIEWER}
          messages={demo.getSnapshot().messages}
        />
      </BuyerDemoContext>,
    );
    await user.type(screen.getByRole("textbox"), "정산주기를 조정하고 싶어요");
    expect(
      localStorage.getItem("chat-draft:buyer-demo-conversation"),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "보내기" }));
    expect(
      await screen.findByText(/정산주기를 협의할 수 있어요/),
    ).toBeInTheDocument();
    expect(demo.getSnapshot().messages.at(-2)?.body).toBe(
      "정산주기를 조정하고 싶어요",
    );
  });
  it("실제 선정 확인창을 확정하면 데모 계약이 생긴다", async () => {
    const demo = createBuyerDemoSession();
    demo.submit(tutorialRfpDraftSeed);
    demo.sendMessage("견적을 주세요", []);
    const bid = demo.getSnapshot().deal!.bids[0];
    render(
      <BuyerDemoContext value={demo}>
        <AwardConfirmDialog
          open
          onOpenChange={() => {}}
          rfpId={bid.rfpId}
          awardedBidId={bid.id}
          pgName={DEMO_PG.name}
          selectedBid={bid}
        />
      </BuyerDemoContext>,
    );
    await userEvent.click(screen.getByRole("button", { name: /선정/ }));
    await waitFor(() =>
      expect(demo.getSnapshot().deal?.rfp.status).toBe("awarded"),
    );
  });
});
