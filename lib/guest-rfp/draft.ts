"use client";
import { z } from "zod";
import { guestFiles } from "./files";
import { PAYMENT_METHODS } from "@/lib/types/bid";
import {
  MAXIMUM_PRICE_VALUES,
  SALES_METHOD_VALUES,
} from "@/lib/rfp/product-info";
import {
  useRfpDraftStore,
  type RfpDraftStore,
  type RfpMockFile,
} from "@/lib/stores/rfp-draft";
export const GUEST_DRAFT_KEY = "support-b-guest-rfp-v1";
export const RESUME_KEY = "support-b-guest-rfp-resume";
export const GUEST_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_PREFIX = "support-b-guest-rfp-cleanup:";
export const RESUME_PATH = "/rfp-create?resume=guest";
export type DraftData = Omit<RfpDraftStore, "setField" | "reset">;
export type DraftOwner = { userId: string; workspaceId: string };
export type GuestFile = RfpMockFile & { type: string; uploaded?: RfpMockFile };
export type GuestDraft = {
  serverRevision?: number;
  version: 1;
  id: string;
  revision: number;
  updatedAt?: number;
  data: DraftData;
  files: GuestFile[];
  owner?: DraftOwner;
  completed: boolean;
};
export function draftData(state: RfpDraftStore): DraftData {
  const { setField: _set, reset: _reset, ...data } = state;
  return JSON.parse(JSON.stringify(data));
}
export function createGuestDraft(): GuestDraft {
  return {
    version: 1,
    id: crypto.randomUUID(),
    revision: 0,
    updatedAt: Date.now(),
    data: draftData(useRfpDraftStore.getInitialState()),
    files: [],
    completed: false,
  };
}
// Each expired draft has its own durable cleanup record. A failed IDB deletion
// must remain retryable even after a new draft replaces the expired answers.
async function cleanExpiredFiles() {
  try {
    const keys = Object.keys(localStorage).filter((key) =>
      key.startsWith(CLEANUP_PREFIX),
    );
    await Promise.all(
      keys.map(async (key) => {
        try {
          const ids = z
            .array(z.string())
            .parse(JSON.parse(localStorage.getItem(key) ?? "[]"));
          await Promise.all(ids.map((id) => guestFiles.remove(id)));
          localStorage.removeItem(key);
        } catch {
          /* Keep this record for the next read or periodic check. */
        }
      }),
    );
  } catch {
    /* Storage may be unavailable; ordinary draft reads report that error. */
  }
}
export function loadGuestDraft(): GuestDraft | null {
  void cleanExpiredFiles();
  const raw = localStorage.getItem(GUEST_DRAFT_KEY);
  if (!raw) return null;
  const value = JSON.parse(raw) as GuestDraft;
  if (
    !value ||
    value.version !== 1 ||
    typeof value.id !== "string" ||
    !value.data ||
    !Array.isArray(value.files) ||
    !Number.isInteger(value.revision)
  )
    throw new Error("초안을 읽지 못했어요. 다시 불러오거나 초안을 삭제해요.");
  // Method names must never come from browser storage.
  const defaults = draftData(useRfpDraftStore.getInitialState());
  const file = z.object({
    id: z.string(),
    name: z.string(),
    size: z.number().nonnegative(),
  });
  const fields: Record<string, z.ZodType> = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      typeof fallback === "string"
        ? z.string()
        : typeof fallback === "boolean"
          ? z.boolean()
          : z.unknown(),
    ]),
  );
  Object.assign(fields, {
    productInfo: z.object({
      hasMarketplaceSellers: z.boolean().optional(),
      cashConvertible: z.boolean().optional(),
      maximumPrice: z.enum(MAXIMUM_PRICE_VALUES).optional(),
      salesMethods: z.array(z.enum(SALES_METHOD_VALUES)).optional(),
    }),
    requiredPaymentMethods: z.array(z.enum(PAYMENT_METHODS)),
    customPaymentMethods: z.array(z.object({ label: z.string() })),
    rfpFiles: z.array(file),
    allowedPgWorkspaceIds: z.array(
      z.object({
        id: z.string(),
        displayName: z.string(),
        logoUpdatedAt: z.string().nullable(),
      }),
    ),
    deadlineChoice: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("period"), days: z.number() }),
      z.object({ mode: z.literal("date") }),
    ]),
    contractType: z.enum(["new", "renewal"]).nullable(),
    industryMode: z.enum(["registered", "custom"]),
  });
  z.object({
    data: z.object(fields).partial(),
    files: z
      .array(file.extend({ type: z.string(), uploaded: file.optional() }))
      .max(5),
    completed: z.boolean(),
    owner: z.object({ userId: z.string(), workspaceId: z.string() }).optional(),
  }).parse(value);
  value.data = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      key in value.data ? value.data[key as keyof DraftData] : fallback,
    ]),
  ) as DraftData;
  if (value.updatedAt === undefined) {
    // Existing drafts have no historical save time. Start a one-time grace window.
    value.updatedAt = Date.now();
    localStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify(value));
  }
  if (
    !Number.isFinite(value.updatedAt) ||
    Date.now() - value.updatedAt >= GUEST_DRAFT_TTL_MS
  ) {
    // Persist file IDs before removing metadata so interrupted cleanup can resume.
    if (value.files.length)
      localStorage.setItem(
        CLEANUP_PREFIX + value.id,
        JSON.stringify(value.files.map((file) => file.id)),
      );
    localStorage.removeItem(GUEST_DRAFT_KEY);
    localStorage.removeItem(RESUME_KEY);
    void cleanExpiredFiles();
    return null;
  }
  return value;
}
export function saveGuestDraft(draft: GuestDraft) {
  const saved = loadGuestDraft();
  if (
    (!saved && draft.revision > 0) ||
    (saved && (saved.id !== draft.id || saved.revision !== draft.revision))
  )
    throw new Error(
      "다른 탭에서 초안을 변경했어요. 새로고침 후 이어서 작성해요.",
    );
  const revision = draft.revision + 1;
  const updatedAt = Date.now();
  localStorage.setItem(
    GUEST_DRAFT_KEY,
    JSON.stringify({ ...draft, revision, updatedAt }),
  );
  draft.revision = revision;
  draft.updatedAt = updatedAt;
}
export function deleteGuestDraft(draft: GuestDraft) {
  const saved = loadGuestDraft();
  if (!saved) return;
  if (saved.id !== draft.id || saved.revision !== draft.revision)
    throw new Error("다른 탭에서 초안을 변경했어요. 새로고침 후 삭제해요.");
  localStorage.removeItem(GUEST_DRAFT_KEY);
  localStorage.removeItem(RESUME_KEY);
}
export function sameOwner(a: DraftOwner | undefined, b: DraftOwner) {
  return a?.userId === b.userId && a.workspaceId === b.workspaceId;
}
export function bindGuestDraft(
  draft: GuestDraft,
  owner: DraftOwner,
): GuestDraft {
  if (draft.owner && !sameOwner(draft.owner, owner))
    throw new Error(
      "이 초안은 다른 계정 또는 워크스페이스에서 이어 쓰고 있어요. 원래 계정으로 전환해요.",
    );
  const next = { ...draft, owner };
  saveGuestDraft(next);
  Object.assign(draft, next);
  return draft;
}
export function validateGuestFile(
  file: { type: string; size: number },
  count: number,
): string | null {
  if (count >= 5) return "파일은 최대 5개까지 첨부할 수 있어요.";
  if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type))
    return "PDF, PNG, JPEG 파일을 선택해요.";
  if (file.size <= 0 || file.size > 20 * 1024 * 1024)
    return "내용이 있는 20MB 이하 파일을 선택해요.";
  return null;
}
export function guestResumeTarget(fallback = "/home"): string {
  try {
    loadGuestDraft();
    return localStorage.getItem(RESUME_KEY) === "1" ? RESUME_PATH : fallback;
  } catch {
    return fallback;
  }
}
