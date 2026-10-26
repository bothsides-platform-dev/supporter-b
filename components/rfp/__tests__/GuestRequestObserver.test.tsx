import { render, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, it, expect, vi } from "vitest";
import { GuestRequestObserver } from "../GuestRequestObserver";
const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  request: vi.fn(),
  push: vi.fn(),
  useNotifications: vi.fn(),
  subscribe: vi.fn(),
}));
const router = { push: mocks.push };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/toast", () => ({ toast: mocks.toast }));
vi.mock("@/lib/hooks/useNotifications", () => ({
  useNotifications: mocks.useNotifications,
  subscribeToLiveNotifications: mocks.subscribe,
}));
vi.mock("@/lib/guest-rfp/requests-client", () => ({
  guestRequest: mocks.request,
}));
const completed = {
  id: "draft",
  status: "submitted",
  pgName: "Alpha",
  rfpCode: "P-1",
  effectSeen: false,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.subscribe.mockReturnValue(() => {});
  mocks.request.mockImplementation(async ({ op }: { op: string }) =>
    op === "list" ? [completed] : { claimed: false },
  );
});
it("does not replay a completion toast when another tab already claimed the effect", async () => {
  render(<GuestRequestObserver workspaceId="workspace" />);
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith({
      op: "effect",
      id: "draft",
      workspaceId: "workspace",
    }),
  );
  expect(mocks.toast).not.toHaveBeenCalled();
});
it("receives completion independently of the sidebar and shows a working detail action", async () => {
  mocks.request.mockImplementation(async ({ op }: { op: string }) =>
    op === "list" ? [completed] : { claimed: true },
  );
  render(<GuestRequestObserver workspaceId="workspace" />);
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
  expect(mocks.useNotifications).toHaveBeenCalledWith("workspace");
  expect(mocks.subscribe).toHaveBeenCalled();
  mocks.toast.mock.calls[0][1].action.onClick();
  expect(mocks.push).toHaveBeenCalledWith("/rfp/P-1");
});
it("recovers a missed signal on focus without announcing a waiting request", async () => {
  mocks.request.mockResolvedValueOnce([
    { ...completed, status: "waiting", rfpCode: null },
  ]);
  render(<GuestRequestObserver workspaceId="workspace" />);
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
  expect(mocks.toast).not.toHaveBeenCalled();
  mocks.request.mockImplementation(async ({ op }: { op: string }) =>
    op === "list" ? [completed] : { claimed: true },
  );
  fireEvent.focus(window);
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
});
