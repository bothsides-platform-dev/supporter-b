import { z } from "zod";
import {
  AgreementDraftSchema,
  AgreementPartiesSchema,
} from "@/lib/contract-doc/agreement";
import type { LayoutInput } from "@/lib/contract-doc/layout";
import type { AgreementSigner } from "./agreement";

export const PlatformAgreementDraftSchema = z
  .object({ buyer: AgreementDraftSchema.shape.buyer })
  .strict();
export const PlatformAgreementCompleteSchema = z
  .object({ buyer: AgreementPartiesSchema.shape.buyer })
  .strict();
export type PlatformAgreementDraft = z.infer<
  typeof PlatformAgreementDraftSchema
>;
export type PlatformAgreementSnapshot = Extract<
  LayoutInput,
  { kind: "platform_buyer" }
> & {
  _v: 1;
  agreement: {
    version: string;
    rateVersion: number;
    bidId: string;
    pgWsId: string;
    pgName: string;
    signer: AgreementSigner;
  };
};
export type PlatformAgreementView = {
  ok: true;
  editable: boolean;
  contractId: string;
  revision: number;
  stamp?: string;
  parties: PlatformAgreementSnapshot["parties"];
  signer: AgreementSigner;
  snapshot: PlatformAgreementSnapshot;
  error?: string;
  canSign: boolean;
};
