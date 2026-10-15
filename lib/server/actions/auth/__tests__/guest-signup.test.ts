import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { setupActionEnv, teardownActionEnv } from "./_setup";
import { TEST_SIGNUP_CONSENT } from "@/lib/auth/__tests__/signup-consent-fixture";
import { phoneOtps, guestRfpDrafts } from "@/lib/db/schema";
import { getGuestDraftService } from "@/lib/server/services/guest-drafts";
import { signupCompleteAction } from "../signupCompleteAction";
const state = vi.hoisted(() => ({ secret: "secret" }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
  cookies: async () => ({ get: () => ({ value: state.secret }) }),
}));
vi.mock("@/lib/auth/signup-documents", async () => {
  const { TEST_SIGNUP_DOCUMENTS } =
    await import("@/lib/auth/__tests__/signup-consent-fixture");
  return { getSignupConsentDocuments: () => TEST_SIGNUP_DOCUMENTS };
});
let db: Awaited<ReturnType<typeof setupActionEnv>>;
beforeEach(async () => {
  db = await setupActionEnv();
  state.secret = "secret";
});
afterEach(teardownActionEnv);
it("passes only the HttpOnly proof to bind the buyer signup", async () => {
  const id = randomUUID();
  await (
    await getGuestDraftService()
  ).savePublic(
    { id, revision: 0, answers: { title: "저장" }, files: [] },
    "secret",
  );
  const [otp] = await db
    .insert(phoneOtps)
    .values({
      phone: "01012345678",
      codeHash: "x",
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 300000),
    })
    .returning();
  const result = await signupCompleteAction({
    guestDraftId: id,
    consent: TEST_SIGNUP_CONSENT,
    email: "proof@example.com",
    name: "구매사",
    password: "Password123!",
    phone: "01012345678",
    phoneVerificationId: otp.id,
    wsKind: "buyer",
    wsName: "회사",
    bizProfile: { bizNo: "1248100998" },
  });
  expect(result.ok).toBe(true);
  expect((await db.select().from(guestRfpDrafts))[0].userId).toBeTruthy();
});
