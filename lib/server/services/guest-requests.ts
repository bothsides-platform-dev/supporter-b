import {
  getDb,
  getGuestRequestRepo,
  getGuestDraftRepo,
  getPgMatchingRepo,
  getBusinessCalendarRepo,
} from "@/lib/server/repositories/factory";
import type { Tx } from "@/lib/server/repositories/types";
import type { Actor } from "./types";
import { assertPublicDraft } from "./guest-drafts";
import type { GuestDraftRow } from "@/lib/server/repositories/drizzle/guest-draft";
import type { GuestAnswers } from "@/lib/guest-rfp/answers";
import { createRfpInputSchema } from "@/lib/rfp/create-input";
import { normalizeWebsiteUrl } from "@/lib/validation/website-url";
import { businessDeadline } from "@/lib/rfp/business-deadline";
import { kstDateOf } from "@/lib/utils/deadline";
import { getRfpService } from "./rfp";
import { renderRfpSent } from "@/lib/server/outbox/templates/rfpSent";
import { notify } from "@/lib/server/notifications/notify";
import { emitAfterCommit } from "@/lib/server/notifications/dispatch";

type Access =
  | { secret: string; actor?: never }
  | { actor: Actor; secret?: never };
function submission(
  answers: GuestAnswers,
  pgId: string,
  deadline: Date,
  requestKey: string,
  files: string[],
) {
  const {
    industryMode,
    industryGroupId,
    customIndustryName,
    currentSolution,
    ...rest
  } = answers;
  return createRfpInputSchema.parse({
    ...rest,
    websiteUrl: answers.websiteUrl ? normalizeWebsiteUrl(answers.websiteUrl.trim()) || undefined : undefined,
    ...(industryMode === "custom"
      ? { customIndustryName }
      : { industryGroupId }),
    ...(currentSolution ? { currentSolution } : {}),
    title: answers.title?.trim() || `${answers.mainProducts ?? ""} PG 견적`,
    deadline: deadline.toISOString(),
    allowedPgWorkspaceIds: [pgId],
    requestKey,
    rfpAttachmentIds: files,
    send: true,
    boardVisible: false,
    bizProfileMode: "inherit",
  });
}
export async function getGuestRequestService() {
  const [db, repo, drafts, matching] = await Promise.all([
    getDb(),
    getGuestRequestRepo(),
    getGuestDraftRepo(),
    getPgMatchingRepo(),
  ]);
  async function access(id: string, proof: Access, tx: Tx) {
    const draft = await drafts.lock(id, tx);
    if (proof.actor) {
      if (
        !draft ||
        draft.deletedAt ||
        draft.userId !== proof.actor.userId ||
        draft.workspaceId !== proof.actor.workspaceId ||
        !(await repo.member(proof.actor, tx))
      )
        throw new Error("GUEST_DRAFT_UNAVAILABLE");
    } else assertPublicDraft(draft, proof.secret);
    return draft;
  }
  async function recommendation(draft: GuestDraftRow, tx: Tx) {
    const answers = draft.answers.data;
    const industry = await matching.resolveIndustry(
      answers.industryMode === "custom"
        ? { customIndustryName: answers.customIndustryName! }
        : { industryGroupId: answers.industryGroupId! },
      tx,
    );
    const current = await matching.resolveCurrentPgs(
      answers.contractType === "renewal" ? answers.currentPgs : [],
      tx,
    );
    if (!current.ok) throw new Error(current.error);
    return matching.recommendation(
      industry.groupId,
      [],
      tx,
      false,
      industry.customName,
      draft.workspaceId ?? undefined,
      current.currentPgs,
    );
  }
  return {
    async recommend(id: string, proof: string | Access) {
      return db.transaction(async (tx: Tx) => {
        const draft = await access(
          id,
          typeof proof === "string" ? { secret: proof } : proof,
          tx,
        );
        const result = await recommendation(draft, tx);
        return {
          summary: {
            title: draft.answers.data.title || "맞춤 PG 견적",
            websiteUrl: draft.answers.data.websiteUrl ?? "",
            mainProducts: draft.answers.data.mainProducts ?? "",
          },
          available: result.candidates.length > 0,
          candidates: result.candidates.map((c, order) => ({
            id: c.pgWorkspaceId,
            name: c.name,
            order,
          })),
        };
      });
    },
    async reserve(
      input: { id: string; revision: number; pgId: string; days: number },
      proof: string | Access,
    ) {
      return db.transaction(async (tx: Tx) => {
        const draft = await access(
          input.id,
          typeof proof === "string" ? { secret: proof } : proof,
          tx,
        );
        if (draft.revision !== input.revision)
          throw new Error("GUEST_DRAFT_CHANGED");
        if (![3, 5, 10].includes(input.days)) throw new Error("INVALID_INPUT");
        const existing = await repo.find(input.id, tx);
        if (
          existing &&
          ["unbound", "waiting", "submitted"].includes(existing.status)
        ) {
          if (
            existing.revision !== input.revision ||
            existing.pgId !== input.pgId ||
            existing.days !== input.days
          )
            throw new Error("GUEST_REQUEST_FROZEN");
          return;
        }
        const candidate = (await recommendation(draft, tx)).candidates.find(
          (c) => c.pgWorkspaceId === input.pgId,
        );
        if (!candidate) throw new Error("MATCHING_UNAVAILABLE");
        submission(
          draft.answers.data,
          input.pgId,
          new Date(),
          draft.requestKey,
          [],
        );
        const files = await drafts.files(draft.id, tx);
        if (
          draft.fileIds.some(
            (id) =>
              !files.some((f) => f.clientId === id && f.status === "ready"),
          )
        )
          throw new Error("GUEST_FILES_NOT_READY");
        await repo.save(
          {
            draftId: input.id,
            revision: input.revision,
            pgId: input.pgId,
            pgName: candidate.name,
            days: input.days,
            status: draft.userId ? "waiting" : "unbound",
            confirmedAt: new Date(),
            error: null,
            expiresAt: draft.userId
              ? new Date(Date.now() + 30 * 86400000)
              : null,
            rfpCode: null,
            deadline: null,
            effectSeenAt: null,
          },
          tx,
        );
      });
    },
    async bind(id: string, secret: string, actor: Actor) {
      await db.transaction(async (tx: Tx) => {
        const draft = await drafts.lock(id, tx);
        if (
          draft?.userId === actor.userId &&
          draft.workspaceId === actor.workspaceId
        )
          return;
        assertPublicDraft(draft, secret);
        if (!(await repo.member(actor, tx)))
          throw new Error("GUEST_DRAFT_UNAVAILABLE");
        const request = await repo.find(id, tx);
        if (!request || request.status !== "unbound")
          throw new Error("GUEST_REQUEST_UNAVAILABLE");
        await drafts.update(
          id,
          { ...actor, expiresAt: null, autoResumeConsumedAt: new Date() },
          tx,
        );
        await drafts.bindRequest(id, new Date(), tx);
      });
    },
    async cancel(id: string, proof: Access) {
      await db.transaction(async (tx: Tx) => {
        await access(id, proof, tx);
        if ((await repo.find(id, tx))?.status === "submitted") throw new Error("GUEST_REQUEST_ALREADY_SENT");
        await drafts.endRequest(id, tx);
      });
    },
    async status(id: string, proof: Access) {
      return db.transaction(async (tx: Tx) => {
        await access(id, proof, tx);
        const row = await repo.find(id, tx);
        if (!row) return null;
        return {
          id,
          status: row.status,
          pgName: row.pgName,
          days: row.days,
          rfpCode: row.rfpCode,
          deadline: row.deadline?.toISOString() ?? null,
          expiresAt: row.expiresAt?.toISOString() ?? null,
          error: row.error,
          effectSeen: !!row.effectSeenAt,
        };
      });
    },
    async claimEffect(id: string, actor: Actor) {
      return db.transaction(async (tx: Tx) => {
        await access(id, { actor }, tx);
        const row = await repo.find(id, tx);
        if (!row || row.status !== "submitted" || row.effectSeenAt)
          return false;
        await repo.update(id, { effectSeenAt: new Date() }, tx);
        return true;
      });
    },
    async dispatch(id: string, now = new Date()) {
      if (process.env.GUEST_RFP_AUTO_SEND_ENABLED !== "true") return;
      await repo.attempted(id, now);
      const afterCommit: (() => void)[] = [];
      await db.transaction(async (tx: Tx) => {
        const draft = await drafts.lock(id, tx);
        const request = await repo.find(id, tx);
        if (!draft || !request || request.status !== "waiting") return;
        if (draft.deletedAt || !draft.userId || !draft.workspaceId) {
          await drafts.endRequest(id, tx);
          return;
        }
        if (!request.expiresAt || request.expiresAt <= now) {
          await repo.update(id, { status: "expired" }, tx);
          return;
        }
        const actor = { userId: draft.userId, workspaceId: draft.workspaceId };
        const member = await repo.member(actor, tx);
        if (!member) {
          await drafts.endRequest(id, tx);
          return;
        }
        if (!member.verified || member.status !== "active") return;
        const calendar = await (
          await getBusinessCalendarRepo()
        ).read(
          kstDateOf(now),
          kstDateOf(new Date(now.getTime() + 30 * 86400000)),
          tx,
        );
        if (!calendar) return;
        let deadline: Date;
        try {
          deadline = new Date(businessDeadline(now, request.days, calendar));
        } catch {
          return;
        }
        const selected = (await drafts.files(id, tx)).filter((f) =>
          draft.fileIds.includes(f.clientId),
        );
        let input;
        try {
          input = submission(
            draft.answers.data,
            request.pgId,
            deadline,
            draft.requestKey,
            selected.map((f) => f.id),
          );
        } catch {
          await repo.update(
            id,
            { status: "needs_action", error: "INVALID_INPUT" },
            tx,
          );
          return;
        }
        if (
          draft.revision !== request.revision ||
          selected.length !== draft.fileIds.length ||
          selected.some((f) => f.status !== "ready")
        ) {
          await repo.update(
            id,
            { status: "needs_action", error: "GUEST_FILES_NOT_READY" },
            tx,
          );
          return;
        }
        // A savepoint rolls back handoff and every RFP side effect on a rejected request.
        try {
          await tx.transaction(async (nested) => {
            for (const file of selected)
              await drafts.handoff(file, actor.userId, nested);
            await drafts.update(
              id,
              {
                resumeConsumedAt: now,
                autoResumeConsumedAt: now,
                memberAttachmentIds: selected.map((f) => f.id),
              },
              nested,
            );
            const result = await (
              await getRfpService()
            ).createRfp(
              {
                ...input,
                deadline,
                guestDraft: { id, revision: draft.revision },
              },
              actor,
              false,
              { tx: nested, afterCommit, guestRequestId: id },
            );
            if (!result.ok) throw new Error(result.error);
            await repo.update(
              id,
              {
                status: "submitted",
                rfpCode: result.rfpId,
                deadline,
                error: null,
              },
              nested,
            );
            const pending = await notify(nested, {
              recipients: [{ ...actor, email: member.email }],
              channels: ["inapp", "email"],
              email: {
                event: "rfp.sent",
                subject: `${request.pgName}에 견적을 요청했어요`,
                html: await renderRfpSent({
                  rfpId: result.rfpId,
                  rfpTitle: input.title,
                  inviteCount: 1,
                }),
                dedupeKey: (recipient) =>
                  `guest-request:${id}:sent:${recipient.userId}`,
              },
              type: "rfp.auto_sent",
              title: `${request.pgName}에 견적을 요청했어요`,
              body: `${input.title} · ${kstDateOf(deadline)} 18:00`,
              linkUrl: `/rfp/${result.rfpId}`,
            });
            afterCommit.push(() => emitAfterCommit(pending));
          });
        } catch (error) {
          afterCommit.length = 0;
          const reason = error instanceof Error ? error.message : "";
          if (
            [
              "MATCHING_UNAVAILABLE",
              "INVALID_ATTACHMENT",
              "GUEST_FILES_NOT_READY",
              "GUEST_DRAFT_CHANGED",
              "INVALID_PRODUCT_INFO",
              "MATCHING_REQUIRED",
              "CURRENT_PGS_REQUIRED",
              "INVALID_CURRENT_PGS",
            ].includes(reason)
          ) {
            await repo.update(
              id,
              { status: "needs_action", error: reason },
              tx,
            );
            return;
          }
          if (reason === "CALENDAR_UNAVAILABLE") return;
          throw error;
        }
      });
      for (const callback of afterCommit) callback();
    },
  };
}

export async function dispatchGuestRequestsForUser(userId: string) {
  if (process.env.GUEST_RFP_AUTO_SEND_ENABLED !== "true") return;
  try {
    const rows = await (await getGuestRequestRepo()).waitingForUser(userId);
    const service = await getGuestRequestService();
    for (const row of rows) {
      try {
        await service.dispatch(row.id);
      } catch {
        /* Cron retries without extending consent. */
      }
    }
  } catch {
    /* Verification remains successful during a dispatch outage. */
  }
}
