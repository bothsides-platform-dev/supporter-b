import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/server/actions/contract-archive", () => ({
  listContractArchivesAction: vi.fn(),
  deleteContractArchiveAction: vi.fn(),
}));
import { ContractArchiveList } from "../ContractArchiveList";
it("구매사 보관함에는 직접 업로드 행동이 없다", () => {
  render(<ContractArchiveList initialEntries={[]} />);
  expect(screen.queryByRole("button", { name: "계약서 올리기" })).toBeNull();
  expect(screen.queryByText(/직접 올릴/)).toBeNull();
});
