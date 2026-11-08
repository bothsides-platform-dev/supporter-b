import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AgentRequestReview } from "../AgentRequestReview";
import { AgentConsent } from "../AgentConsent";
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
