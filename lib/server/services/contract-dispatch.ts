import type { AgreementDraftLookupRepo } from '@/lib/server/repositories/types';
import type {
  BidRepo,
  PgSigningTemplateRepo,
  RfpRepo,
  SigningContractRepo,
} from '@/lib/server/repositories/types';
import type { RFP } from '@/lib/types/rfp';
import type { PgSigningTemplate, SigningContract } from '@/lib/types/signing';
import type { Actor, ServiceResult } from './types';
import { requiresCommonAgreement } from '@/lib/server/signing/agreement-boundary';

export type ContractDispatchInput =
  | { source: 'template'; rfpId: string; actor: Actor; takeOver?: boolean }
  | { source: 'compose'; rfpId: string; actor: Actor; takeOver?: boolean }
  | { source: 'agreement'; contractId: string; actor: Actor; stamp: string };

type DispatchContext<Source extends 'template' | 'compose'> = {
  source: Source;
  rfp: RFP & { awardedBidId: string };
  active: SigningContract;
  actor: Actor;
  takeOver?: boolean;
  template: Extract<
    PgSigningTemplate,
    { kind: Source extends 'template' ? 'pdf' : 'composed' }
  >;
};

export type TemplateDispatchContext = DispatchContext<'template'>;
export type ComposedDispatchContext = DispatchContext<'compose'>;
export type AgreementDispatchContext = {
  source: 'agreement';
  rfp: RFP & { awardedBidId: string };
  active: SigningContract;
  actor: Actor;
  stamp: string;
  takeOver?: false;
};

type ContractDispatchDeps = {
  agreementRepo: AgreementDraftLookupRepo;
  rfpRepo: RfpRepo;
  signingRepo: SigningContractRepo;
  bidRepo: BidRepo;
  templateRepo: PgSigningTemplateRepo;
  resolveParty(rfp: RFP, actor: Actor): Promise<'buyer' | 'pg' | null | undefined>;
  adapters: {
    template(input: DispatchContext<'template'>): Promise<ServiceResult>;
    compose(input: DispatchContext<'compose'>): Promise<ServiceResult>;
    agreement(input: AgreementDispatchContext): Promise<ServiceResult>;
  };
};

/**
 * 서버에서 준비한 계약서 발송의 단일 내부 진입점.
 *
 * PDF 템플릿·조항형 서식·공통 합의서가 공유하는 존재·ACL·상태 게이트를
 * 통과시킨다. 저장된 서식 경로만 봉인된 견적의 서식 소유/종류를 확인한다.
 */
export class ContractDispatch {
  constructor(private readonly deps: ContractDispatchDeps) {}

  async dispatch(input: ContractDispatchInput): Promise<ServiceResult> {
    let agreementContract: SigningContract | undefined;
    let rfpId: string;
    if (input.source === 'agreement') {
      agreementContract = (await this.deps.signingRepo.findById(input.contractId))?.contract;
      if (!agreementContract) return { ok: false, error: 'FORBIDDEN' };
      rfpId = agreementContract.rfpId;
    } else {
      rfpId = input.rfpId;
    }
    const rfp = await this.deps.rfpRepo.findById(rfpId);
    if (!rfp) {
      return { ok: false, error: input.source === 'agreement' ? 'FORBIDDEN' : 'RFP_NOT_FOUND' };
    }
    if ((await this.deps.resolveParty(rfp, input.actor)) !== 'pg') {
      return { ok: false, error: 'FORBIDDEN' };
    }
    const awardedBidId = rfp.awardedBidId;
    if (input.source === 'agreement' && !awardedBidId) {
      return { ok: false, error: 'FORBIDDEN' };
    }

    const active = input.source === 'agreement'
      ? agreementContract
      : await this.deps.signingRepo.findActiveByRfp(input.rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    if (active.status !== 'awaiting_pg_template') {
      return { ok: false, error: 'ALREADY_SENT' };
    }
    const commonAgreement = await requiresCommonAgreement(active, this.deps.agreementRepo);
    if (input.source === 'agreement') {
      if (!commonAgreement) return { ok: false, error: 'AGREEMENT_NOT_APPLICABLE' };
      if (!awardedBidId) return { ok: false, error: 'FORBIDDEN' };
      return this.deps.adapters.agreement({
        source: 'agreement',
        rfp: { ...rfp, awardedBidId },
        active,
        actor: input.actor,
        stamp: input.stamp,
      });
    }
    if (commonAgreement) return { ok: false, error: 'AGREEMENT_REQUIRED' };

    if (!rfp.awardedBidId) return { ok: false, error: 'NO_LINKED_TEMPLATE' };
    const dispatchRfp = rfp as RFP & { awardedBidId: string };
    const templateId = await this.deps.bidRepo.findSigningTemplateId(rfp.awardedBidId);
    if (!templateId) return { ok: false, error: 'NO_LINKED_TEMPLATE' };
    const template = await this.deps.templateRepo.findById(templateId);
    if (!template || template.workspaceId !== input.actor.workspaceId) {
      return { ok: false, error: 'NO_LINKED_TEMPLATE' };
    }

    if (input.source === 'template') {
      if (template.kind !== 'pdf') return { ok: false, error: 'TEMPLATE_KIND_MISMATCH' };
      return this.deps.adapters.template({
        source: 'template',
        rfp: dispatchRfp,
        active,
        template,
        actor: input.actor,
        takeOver: input.takeOver,
      });
    }
    if (template.kind !== 'composed') return { ok: false, error: 'TEMPLATE_KIND_MISMATCH' };
    return this.deps.adapters.compose({
      source: 'compose',
      rfp: dispatchRfp,
      active,
      template,
      actor: input.actor,
      takeOver: input.takeOver,
    });
  }
}
