import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GuestRequestCompletion } from "../GuestRequestCompletion";
vi.mock("@/lib/server/actions/workspace/switchWorkspaceAction", () => ({
  switchWorkspaceAction: async () => ({ ok: false }),
}));
const claim = vi.hoisted(() => vi.fn(async () => ({ claimed: false })));
vi.mock("@/lib/guest-rfp/requests-client", () => ({ guestRequest: claim }));
it("shows the real request number and detail link without navigating or celebrating a consumed effect", async () => {
  render(
    <GuestRequestCompletion
      request={{
        id: "id",
        status: "submitted",
        pgName: "Alpha",
        rfpCode: "P-2601-0001",
        deadline: "2026-10-30T09:00:00.000Z",
        effectSeen: true,
      }}
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Alpha에 견적을 요청했어요" }),
    ).toHaveFocus(),
  );
  expect(
    screen.getByRole("link", { name: "요청한 견적 보기" }),
  ).toHaveAttribute("href", "/rfp/P-2601-0001");
  expect(screen.getByText("P-2601-0001")).toBeInTheDocument();
  expect(document.querySelector("canvas")).toBeNull();
});
it("does not render a success for a waiting request", () => {
  render(
    <GuestRequestCompletion
      request={{
        id: "id",
        status: "waiting",
        pgName: "Alpha",
        rfpCode: null,
        deadline: null,
        effectSeen: false,
      }}
    />,
  );
  expect(
    screen.queryByRole("link", { name: "요청한 견적 보기" }),
  ).not.toBeInTheDocument();
});

it('shares the effect claim across development remounts', async () => {
  claim.mockClear();
  render(<StrictMode><GuestRequestCompletion request={{ id: 'strict', status: 'submitted', pgName: 'Alpha', rfpCode: 'P-1', deadline: '2026-10-30T09:00:00Z', effectSeen: false }} /></StrictMode>);
  await waitFor(() => expect(claim).toHaveBeenCalledTimes(1));
});
