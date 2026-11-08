import { z } from "zod";
import { createRfpInputSchema } from "@/lib/rfp/intake/schema";

// Pick from the canonical input shape. Do not accept workspace, test-PG, business
// identity overrides, guest attribution or attachments from an agent.
const {
  guestDraft: _guest,
  journeyDraftId: _journey,
  requestKey: _key,
  send: _send,
  bizProfileMode: _mode,
  bizNoOverride: _biz,
  gradeOverride: _grade,
  boardVisible: _board,
  rfpAttachmentIds: _files,
  ...fields
} = createRfpInputSchema.shape;
export const agentRequestContent = z
  .object({
    ...fields,
    title: fields.title.optional(),
    deadline: z.string().datetime({ offset: true }).optional(),
    allowedPgWorkspaceIds: z.array(z.string().uuid()).max(1).default([]),
  })
  .strict();
export const prepareAgentRequestInput = z
  .object({
    requestKey: z
      .string()
      .uuid()
      .describe(
        "Generate once per consultation and reuse when a response is lost.",
      ),
    requestId: z.string().uuid().optional(),
    expectedRevision: z.number().int().positive().optional(),
    content: agentRequestContent,
  })
  .strict();
export type PrepareAgentRequestInput = z.input<typeof prepareAgentRequestInput>;
