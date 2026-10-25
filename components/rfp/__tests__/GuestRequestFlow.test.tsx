import { render, screen, fireEvent } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { GuestRequestFlow } from "../GuestRequestFlow";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/guest-rfp/requests-client", () => ({
  guestRequest: async (input: { op: string }) =>
    input.op === "recommend"
      ? {
          summary: {
            title: "의류 판매 견적",
            websiteUrl: "https://shop.example",
            mainProducts: "의류",
          },
          available: true,
          candidates: [{ id: "pg", name: "Alpha", order: 0 }],
        }
      : input.op === "account"
        ? { signedIn: false, workspaces: [] }
        : null,
}));
it("requires a PG selection and presents automatic sending consent before signup", async () => {
  render(<GuestRequestFlow id="draft" revision={1} onCancel={() => {}} />);
  expect(await screen.findByLabelText("Alpha")).toBeInTheDocument();
  expect(screen.getByText("의류 판매 견적")).toBeInTheDocument();
  expect(screen.getByText("https://shop.example")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "선택한 PG사에 자동 요청하기" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Alpha"));
  expect(
    screen.getByText(
      "이메일 인증과 입점 승인이 끝나면 선택한 PG사에 자동으로 보내요.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "선택한 PG사에 자동 요청하기" }),
  ).toBeEnabled();
  expect(screen.queryByText("요청한 견적 보기")).not.toBeInTheDocument();
});
