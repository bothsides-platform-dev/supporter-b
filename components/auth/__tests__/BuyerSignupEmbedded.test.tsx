import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BuyerSignupProfileForm } from "../BuyerSignupProfileForm";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/auth/signup-storage", () => ({
  readSignupDraft: () => ({
    email: "buyer@example.com",
    password: "pw",
    wsName: "buyer",
    bizProfile: {},
  }),
  writeSignupDraft: vi.fn(),
  isSignupStorageAvailable: () => true,
}));
vi.mock("@/lib/auth/finalize-signup", () => ({
  finalizeSignup: async () => ({ ok: true, redirectTo: "/home" }),
}));
vi.mock("@/components/auth/PhoneVerificationField", () => ({
  PhoneVerificationField: ({
    onVerified,
  }: {
    onVerified: (phone: string, id: string) => void;
  }) => (
    <button type="button" onClick={() => onVerified("01012345678", "verified")}>
      휴대폰 인증
    </button>
  ),
}));
it("keeps signup in the parent flow after successful account creation", async () => {
  const complete = vi.fn();
  render(<BuyerSignupProfileForm onComplete={complete} />);
  fireEvent.change(screen.getByLabelText("이름"), {
    target: { value: "담당자" },
  });
  fireEvent.click(screen.getByText("휴대폰 인증"));
  fireEvent.click(screen.getByRole("button", { name: "가입 완료" }));
  await waitFor(() => expect(complete).toHaveBeenCalledOnce());
});
