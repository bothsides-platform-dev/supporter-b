import { isDeepStrictEqual } from "node:util";
import { withGuestJourney } from './guest-journey';
import {
  createPresignedUploadModule,
  type PresignedUploadAdapter,
} from "@/lib/server/presigned-upload/module";
import { getStorage } from "@/lib/server/storage";
import type { ServerGuestDraft } from "@/lib/guest-rfp/answers";
import type { Actor } from "./types";
import { createHash, randomUUID } from "node:crypto";
import {
  guestAnswersSchema,
  guestFileInputSchema,
  type GuestAnswers,
  type GuestFileInput,
} from "@/lib/guest-rfp/answers";
import { getDb, getGuestDraftRepo } from "@/lib/server/repositories/factory";
import type {
  GuestDraftRow,
  DrizzleGuestDraftRepository,
} from "@/lib/server/repositories/drizzle/guest-draft";
import type { Tx } from "@/lib/server/repositories/types";
export type SaveGuestDraft = {
  id: string;
  revision: number;
  answers: GuestAnswers;
  files: string[];
};
export const guestSecretHash = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");
export function assertPublicDraft(
  row: GuestDraftRow | undefined,
  secret: string,
  now = new Date(),
): asserts row is GuestDraftRow {
  if (
    !row ||
    row.secretHash !== guestSecretHash(secret) ||
    row.userId ||
    row.deletedAt ||
    row.completedAt ||
    !row.expiresAt ||
    row.expiresAt <= now
  )
    throw new Error("GUEST_DRAFT_UNAVAILABLE");
}
export type GuestSignupSnapshot = {
  answers: GuestAnswers;
  files: { name: string; size: number }[];
  industryName?: string;
};
export class GuestDraftService {
  // Transaction handle uses the same injection point as all other services.
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly db: any,
    private readonly repo: DrizzleGuestDraftRepository,
  ) {}
  private async owned(id: string, actor: Actor, tx: Tx) {
    const row = await this.repo.lock(id, tx);
    if (
      !row ||
      row.userId !== actor.userId ||
      row.workspaceId !== actor.workspaceId ||
      row.deletedAt ||
      row.completedAt ||
      !(await this.repo.activeBuyer(actor, tx))
    )
      throw new Error("GUEST_DRAFT_UNAVAILABLE");
    return row;
  }
  async listOwned(actor: Actor): Promise<ServerGuestDraft[]> {
    if (!(await this.repo.activeBuyer(actor))) return [];
    const rows = await this.repo.owned(actor.userId, actor.workspaceId);
    return Promise.all(
      rows
        .filter((row) => !row.deletedAt && !row.completedAt)
        .map(async (row) => ({
          id: row.id,
          revision: row.revision,
          answers: row.answers.data,
          requestKey: row.requestKey,
          resumePending: !row.autoResumeConsumedAt,
          files: row.resumeConsumedAt
            ? await this.repo.memberFiles(row.memberAttachmentIds, actor.userId)
            : (await this.repo.files(row.id))
                .filter(
                  (file) =>
                    row.fileIds.includes(file.clientId) &&
                    file.status === "ready",
                )
                .map((file) => ({
                  id: file.id,
                  name: file.name,
                  size: file.size,
                })),
        })),
    );
  }
  async resumeOwned(id: string, actor: Actor): Promise<ServerGuestDraft> {
    return this.db.transaction(async (tx: Tx) => {
      const row = await this.owned(id, actor, tx);
      await this.repo.assertEditable(id, tx);
      let ids = row.memberAttachmentIds;
      if (!row.resumeConsumedAt) {
        const selected = (await this.repo.files(id, tx)).filter((file) =>
          row.fileIds.includes(file.clientId),
        );
        if (
          selected.length !== row.fileIds.length ||
          selected.some((file) => file.status !== "ready")
        )
          throw new Error("GUEST_FILES_NOT_READY");
        for (const file of selected)
          await this.repo.handoff(file, actor.userId, tx);
        ids = selected.map((file) => file.id);
        await this.repo.update(
          id,
          { memberAttachmentIds: ids, resumeConsumedAt: new Date() },
          tx,
        );
      }
      await this.repo.update(id, { autoResumeConsumedAt: new Date() }, tx);
      const files = await this.repo.memberFiles(ids, actor.userId, tx);
      if (files.length !== ids.length) throw new Error("GUEST_FILES_NOT_READY");
      return {
        id,
        revision: row.revision,
        answers: row.answers.data,
        requestKey: row.requestKey,
        files,
        resumePending: false,
      };
    });
  }
  async validateSubmission(
    input: { id: string; revision: number },
    actor: Actor,
    requestKey: string | undefined,
    fileIds: string[],
    tx: Tx,
    reserved = false,
  ) {
    const row = await this.repo.lock(input.id, tx);
    if (!reserved) await this.repo.assertEditable(input.id, tx);
    if (
      !row ||
      row.userId !== actor.userId ||
      row.workspaceId !== actor.workspaceId ||
      row.deletedAt ||
      !row.resumeConsumedAt ||
      !(await this.repo.activeBuyer(actor, tx))
    )
      throw new Error("GUEST_DRAFT_UNAVAILABLE");
    if (row.revision !== input.revision || row.requestKey !== requestKey)
      throw new Error("GUEST_DRAFT_CHANGED");
    if (
      !isDeepStrictEqual(
        [...row.memberAttachmentIds].sort(),
        [...fileIds].sort(),
      )
    )
      throw new Error("GUEST_FILES_NOT_READY");
    if (
      !row.completedAt &&
      (await this.repo.memberFiles(fileIds, actor.userId, tx)).length !==
        fileIds.length
    )
      throw new Error("GUEST_FILES_NOT_READY");
    return row;
  }
  async completeSubmission(id: string, rfpId: string, tx: Tx) {
    const row = await this.repo.lock(id, tx);
    for (const file of await this.repo.files(id, tx))
      if (!row.memberAttachmentIds.includes(file.id))
        await this.repo.retireFile(file, tx);
    await this.repo.update(
      id,
      {
        completedRfpId: rfpId,
        completedAt: new Date(),
        answers: { version: 1, data: {} },
      },
      tx,
    );
    if (row.userId && row.workspaceId) await withGuestJourney(tx, repo => repo.submitted(id, { userId: row.userId!, workspaceId: row.workspaceId! }, new Date()));
  }
  async saveOwned(input: SaveGuestDraft, actor: Actor) {
    const answers = {
      version: 1 as const,
      data: guestAnswersSchema.parse(input.answers),
    };
    return this.db.transaction(async (tx: Tx) => {
      const completed = await this.repo.lock(input.id, tx);
      // A lost final-request response retries through this save hook first. Do
      // not resurrect answers; the RFP transaction still verifies the payload hash.
      if (
        completed?.completedAt &&
        !completed.deletedAt &&
        completed.userId === actor.userId &&
        completed.workspaceId === actor.workspaceId &&
        completed.revision === input.revision &&
        (await this.repo.activeBuyer(actor, tx))
      )
        return { id: completed.id, revision: completed.revision };
      const row = await this.owned(input.id, actor, tx);
      await this.repo.assertEditable(row.id, tx);
      if (row.revision !== input.revision) {
        if (
          row.revision === input.revision + 1 &&
          isDeepStrictEqual(row.answers, answers) &&
          isDeepStrictEqual(row.memberAttachmentIds, input.files)
        )
          return { id: row.id, revision: row.revision };
        throw new Error("GUEST_DRAFT_CHANGED");
      }
      if (
        !row.resumeConsumedAt ||
        input.files.length > 5 ||
        new Set(input.files).size !== input.files.length
      )
        throw new Error("GUEST_FILES_NOT_READY");
      const actual = await this.repo.memberFiles(input.files, actor.userId, tx);
      if (actual.length !== input.files.length)
        throw new Error("GUEST_FILES_NOT_READY");
      if (
        isDeepStrictEqual(row.answers, answers) &&
        isDeepStrictEqual(row.memberAttachmentIds, input.files)
      )
        return { id: row.id, revision: row.revision };
      await this.repo.trackMemberFiles(row.id, input.files, tx);
      // Attachment removal has a five-second UI undo window. Keep its ledger
      // until explicit deletion/final completion; the file API owns removal.
      await this.repo.update(
        row.id,
        {
          answers,
          memberAttachmentIds: input.files,
          revision: row.revision + 1,
          updatedAt: new Date(),
        },
        tx,
      );
      return { id: row.id, revision: row.revision + 1 };
    });
  }
  async dismissAutomaticResume(actor: Actor) {
    await this.db.transaction(async (tx: Tx) => {
      if (!(await this.repo.activeBuyer(actor, tx)))
        throw new Error("GUEST_DRAFT_UNAVAILABLE");
      for (const item of await this.repo.owned(
        actor.userId,
        actor.workspaceId,
        tx,
      )) {
        const row = await this.owned(item.id, actor, tx).catch(() => null);
        if (row)
          await this.repo.update(
            row.id,
            { autoResumeConsumedAt: new Date() },
            tx,
          );
      }
    });
  }
  async retireUser(userId: string, tx: Tx) {
    await withGuestJourney(tx, repo => repo.eraseUser(userId), true);
    for (const row of await this.repo.ownedByUser(userId, tx)) {
      await this.retireDraft(row, tx);
      await this.repo.update(
        row.id,
        { userId: null, workspaceId: null, applicationId: null },
        tx,
      );
    }
  }
  async matchesBoundSignup(
    input: { id: string; secret: string },
    userId: string,
    tx: Tx,
  ) {
    const row = await this.repo.lock(input.id, tx);
    return Boolean(
      row &&
        row.userId === userId &&
        row.secretHash === guestSecretHash(input.secret) &&
        !row.deletedAt &&
        !row.completedAt,
    );
  }
  async deleteOwned(id: string, revision: number, actor: Actor) {
    await this.db.transaction(async (tx: Tx) => {
      const row = await this.owned(id, actor, tx);
      if (row.revision !== revision) throw new Error("GUEST_DRAFT_CHANGED");
      await this.retireDraft(row, tx);
    });
  }
  private async retireDraft(row: GuestDraftRow, tx: Tx) {
    await this.repo.endRequest(row.id, tx);
    await withGuestJourney(tx, repo => repo.retire(row.id, new Date()), true);
    for (const file of await this.repo.files(row.id, tx))
      await this.repo.retireFile(file, tx);
    await this.repo.update(
      row.id,
      {
        deletedAt: new Date(),
        answers: { version: 1, data: {} },
        fileIds: [],
        memberAttachmentIds: [],
      },
      tx,
    );
  }
  async sweep(limit = 100, now = new Date()) {
    await this.db.transaction(async (tx: Tx) => {
      for (const candidate of await this.repo.cleanupCandidates(
        now,
        limit,
        tx,
      )) {
        const row = await this.repo.lock(candidate.id, tx);
        if (row && !row.userId && row.expiresAt && row.expiresAt <= now)
          await this.retireDraft(row, tx);
      }
    });
    const files = await this.repo.staleFiles(now, limit);
    let deleted = 0;
    for (const file of files) {
      const retired = await this.db.transaction(async (tx: Tx) => {
        await this.repo.lock(file.draftId, tx);
        const current = (await this.repo.files(file.draftId, tx)).find(
          (f) => f.id === file.id,
        );
        if (
          !current ||
          (current.status !== "deleting" && current.status !== "pending")
        )
          return false;
        return this.repo.retireFile(current, tx);
      });
      if (!retired) continue;
      try {
        await getStorage().delete(`pending/${file.id}`);
        await getStorage().delete(file.id);
        await this.repo.removeRetired(file.id);
        deleted++;
      } catch {
        /* Keep the deleting row for the next sweep. */
      }
    }
    await this.repo.purgeTombstones(now, limit);
    return deleted;
  }
  async completePublicFile(id: string, secret: string, fileId: string) {
    const { db, repo } = this;
    const descriptor = (file: {
      id: string;
      name: string;
      size: number;
      mime: string;
    }) => ({
      id: file.id,
      key: file.id,
      size: file.size,
      mime: file.mime,
      ready: { id: file.id, name: file.name, size: file.size },
    });
    type Ready = ReturnType<typeof descriptor>["ready"];
    const adapter: PresignedUploadAdapter<string, never, Ready, "unavailable"> =
      {
        async createPending() {
          return { kind: "rejected", reason: "unavailable" };
        },
        async inspect(_actor, inspectedId) {
          return db.transaction(async (tx: Tx) => {
            const row = await repo.lock(id, tx);
            assertPublicDraft(row, secret);
            const file = (await repo.files(id, tx)).find(
              (file) => file.id === inspectedId,
            );
            if (!file || file.status === "deleting")
              return {
                kind: "rejected" as const,
                reason: "unavailable" as const,
              };
            const upload = descriptor(file);
            return file.status === "ready"
              ? { kind: "ready" as const, value: upload.ready }
              : { kind: "pending" as const, upload };
          });
        },
        async commitReady(upload) {
          return db.transaction(async (tx: Tx) => {
            const row = await repo.lock(id, tx);
            // Preserve another completion's ready object even if signup has since
            // claimed the parent. Returning conflict would make the upload module delete it.
            const current = (await repo.files(id, tx)).find(
              (file) => file.id === upload.id,
            );
            if (
              current?.status === "ready" &&
              row?.secretHash === guestSecretHash(secret)
            )
              return "already-ready" as const;
            try {
              assertPublicDraft(row, secret);
            } catch {
              return "conflict" as const;
            }
            if (await repo.markFile(upload.id, "pending", "ready", tx))
              return "committed" as const;
            const file = (await repo.files(id, tx)).find(
              (file) => file.id === upload.id,
            );
            return file?.status === "ready"
              ? ("already-ready" as const)
              : ("conflict" as const);
          });
        },
        async remove(upload) {
          return repo.markFile(upload.id, "pending", "deleting");
        },
        async takeStale() {
          return [];
        },
      };
    return createPresignedUploadModule({
      adapter,
      storage: getStorage(),
    }).complete(id, fileId);
  }
  async finishPublic(id: string, secret: string, revision: number) {
    return this.db.transaction(async (tx: Tx) => {
      const row = await this.repo.lock(id, tx);
      assertPublicDraft(row, secret);
      if (row.revision !== revision) throw new Error("GUEST_DRAFT_CHANGED");
      const files = await this.repo.files(id, tx);
      if (
        row.fileIds.some(
          (id) =>
            !files.some(
              (file) => file.clientId === id && file.status === "ready",
            ),
        )
      )
        throw new Error("GUEST_FILES_NOT_READY");
      return { id, revision };
    });
  }
  async bindSignup(
    input: { id: string; secret: string },
    owner: { userId: string; workspaceId: string; applicationId: string },
    tx: Tx,
  ): Promise<GuestSignupSnapshot> {
    const row = await this.repo.lock(input.id, tx);
    assertPublicDraft(row, input.secret);
    const files = await this.repo.files(row.id, tx);
    const selected = row.fileIds.map((id) =>
      files.find((file) => file.clientId === id && file.status === "ready"),
    );
    if (selected.some((file) => !file))
      throw new Error("GUEST_FILES_NOT_READY");
    for (const file of files)
      if (!row.fileIds.includes(file.clientId))
        await this.repo.retireFile(file, tx);
    await this.repo.update(row.id, { ...owner, expiresAt: null }, tx);
    await this.repo.bindRequest(row.id, new Date(), tx);
    await withGuestJourney(tx, repo => repo.bindSignup(row.id, guestSecretHash(input.secret), owner, new Date()));
    const industryName = row.answers.data.industryGroupId
      ? await this.repo.industryName(row.answers.data.industryGroupId, tx)
      : undefined;
    return {
      answers: row.answers.data,
      files: selected.map((file) => ({ name: file!.name, size: file!.size })),
      industryName,
    };
  }
  async savePublic(input: SaveGuestDraft, secret: string, now = new Date()) {
    const answers = {
      version: 1 as const,
      data: guestAnswersSchema.parse(input.answers),
    };
    return this.db.transaction(async (tx: Tx) => {
      if (input.revision === 0) {
        await this.repo.insert(
          {
            id: input.id,
            secretHash: guestSecretHash(secret),
            answers,
            fileIds: input.files,
            updatedAt: now,
            expiresAt: new Date(now.getTime() + 86400000),
          },
          tx,
        );
        // A zero revision is create-only. Retrying identical creation is harmless.
        const row = await this.repo.lock(input.id, tx);
        assertPublicDraft(row, secret, now);
        if (
          row.revision !== 1 ||
          !isDeepStrictEqual(row.answers.data, answers.data) ||
          !isDeepStrictEqual(row.fileIds, input.files)
        )
          throw new Error("GUEST_DRAFT_CHANGED");
        return { id: row.id, revision: row.revision };
      }
      const row = await this.repo.lock(input.id, tx);
      assertPublicDraft(row, secret, now);
      await this.repo.assertEditable(row.id, tx);
      if (
        row.revision === input.revision + 1 &&
        isDeepStrictEqual(row.answers, answers) &&
        isDeepStrictEqual(row.fileIds, input.files)
      )
        return { id: row.id, revision: row.revision };
      if (row.revision !== input.revision)
        throw new Error("GUEST_DRAFT_CHANGED");
      for (const file of await this.repo.files(row.id, tx))
        if (!input.files.includes(file.clientId))
          await this.repo.retireFile(file, tx);
      const updated = await this.repo.update(
        row.id,
        {
          answers,
          fileIds: input.files,
          revision: row.revision + 1,
          updatedAt: now,
          expiresAt: new Date(now.getTime() + 86400000),
        },
        tx,
      );
      return { id: updated.id, revision: updated.revision };
    });
  }
  async reservePublicFile(id: string, secret: string, value: GuestFileInput) {
    const input = guestFileInputSchema.parse(value);
    return this.db.transaction(async (tx: Tx) => {
      assertPublicDraft(await this.repo.lock(id, tx), secret);
      const files = await this.repo.files(id, tx);
      const existing = files.find(
        (file) =>
          file.clientId === input.clientId && file.status !== "deleting",
      );
      if (existing) {
        if (
          existing.name !== input.name ||
          existing.size !== input.size ||
          existing.mime !== input.mime
        )
          throw new Error("GUEST_FILE_CHANGED");
        return existing;
      }
      if (files.length >= 5)
        throw new Error("GUEST_FILE_LIMIT");
      return this.repo.insertFile(
        { ...input, id: randomUUID(), draftId: id },
        tx,
      );
    });
  }
}
export async function getGuestDraftService() {
  return new GuestDraftService(await getDb(), await getGuestDraftRepo());
}
