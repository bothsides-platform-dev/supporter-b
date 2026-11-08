import { StrictMode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AgentRequestReview } from "../AgentRequestReview";
import { AgentConsent } from "../AgentConsent";
const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/funnel", () => ({ trackFunnel: track }));
beforeEach(() => track.mockClear());
it("requires a complete draft and explicit confirmation, including after revision conflicts", () => {
  const action = vi.fn();
  const { rerender } = render(
    <AgentRequestReview
      workspaceName="구매사"
      rows={[]}
      missing={["홈페이지를 입력해요"]}
      action={action}
    />,
  );
  expect(
    screen.getByRole("button", { name: "이 내용으로 상담 요청해요" }),
  ).toBeDisabled();
  expect(action).not.toHaveBeenCalled();
  rerender(
    <AgentRequestReview
      workspaceName="구매사"
      rows={[]}
      missing={[]}
      error="changed"
      action={action}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "바뀐 내용을 다시 확인해요",
  );
  expect(screen.getByRole("button")).toBeEnabled();
  expect(action).not.toHaveBeenCalled();
  rerender(
    <AgentRequestReview
      workspaceName="구매사"
      rows={[]}
      missing={[]}
      submittedUrl="/rfp/SB-1"
      action={action}
    />,
  );
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByRole("link", { name: "보낸 상담 보기" })).toHaveAttribute(
    "href",
    "/rfp/SB-1",
  );
});
it("shows the actual workspace, callback origin and only the requested permissions", () => {
  render(
    <AgentConsent
      workspaceName="구매사 A"
      clientName="Unverified app"
      callbackOrigin="http://localhost:1234"
      canWrite={false}
      action={vi.fn()}
    />,
  );
  expect(screen.getByText("구매사 A")).toBeVisible();
  expect(screen.getByText(/돌아갈 주소/)).toHaveTextContent(
    "http://localhost:1234",
  );
  expect(screen.queryByText("상담 초안 작성과 수정")).toBeNull();
  expect(screen.getByRole("button", { name: "연결해요" })).toHaveAttribute(
    "value",
    "approve",
  );
});

it.each([
  ["연결해요", "approve"],
  ["닫기", "deny"],
])(
  "records consent view and %s intent once without recording authorization success",
  (label, decision) => {
    const action = vi.fn();
    render(
      <StrictMode>
        <AgentConsent
          workspaceName="private-business"
          clientName="private-client"
          callbackOrigin="http://localhost:1234"
          canWrite
          action={action}
        />
      </StrictMode>,
    );
    expect(track).toHaveBeenCalledExactlyOnceWith(
      "funnel_step_view",
      expect.objectContaining({ funnel_id: "agent", step_id: "consent" }),
    );
    const button = screen.getByRole("button", { name: label });
    fireEvent(
      button.closest("form")!,
      new SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
        submitter: button,
      }),
    );
    expect(track).toHaveBeenLastCalledWith("funnel_cta_click", {
      funnel_id: "agent",
      step_id: decision,
    });
    expect(track).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(track.mock.calls)).not.toContain("private-");
  },
);

it("records the review and submit attempt, then only a view when showing an existing submission", () => {
  const action = vi.fn();
  const { rerender } = render(
    <StrictMode>
      <AgentRequestReview
        workspaceName="private-business"
        rows={[["홈페이지", "https://private.example"]]}
        missing={[]}
        action={action}
      />
    </StrictMode>,
  );
  expect(track).toHaveBeenCalledExactlyOnceWith(
    "funnel_step_view",
    expect.objectContaining({ funnel_id: "agent", step_id: "review" }),
  );
  const button = screen.getByRole("button", {
    name: "이 내용으로 상담 요청해요",
  });
  fireEvent(
    button.closest("form")!,
    new SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
      submitter: button,
    }),
  );
  expect(track).toHaveBeenLastCalledWith("funnel_cta_click", {
    funnel_id: "agent",
    step_id: "submit_attempt",
  });
  rerender(
    <StrictMode>
      <AgentRequestReview
        workspaceName="private-business"
        rows={[]}
        missing={[]}
        action={action}
        submittedUrl="/rfp/private-id"
      />
    </StrictMode>,
  );
  expect(track).toHaveBeenLastCalledWith(
    "funnel_step_view",
    expect.objectContaining({ funnel_id: "agent", step_id: "submitted_view" }),
  );
  expect(track).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(track.mock.calls)).not.toContain("private");
});
