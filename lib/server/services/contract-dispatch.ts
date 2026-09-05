import type {
  BidRepo,
  PgSigningTemplateRepo,
  RfpRepo,
  SigningContractRepo,
} from '@/lib/server/repositories/types';
import type { RFP } from '@/lib/types/rfp';
import type { PgSigningTemplate, SigningContract } from '@/lib/types/signing';
import type { Actor, ServiceResult } from './types';

export type ContractDispatchInput =
  | { source: 'template'; rfpId: string; actor: Actor; takeOver?: boolean }
  | { source: 'compose'; rfpId: string; actor: Actor; takeOver?: boolean };

type DispatchContext<Source extends ContractDispatchInput['source']> = {
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

type ContractDispatchDeps = {
  rfpRepo: RfpRepo;
  signingRepo: SigningContractRepo;
  bidRepo: BidRepo;
  templateRepo: PgSigningTemplateRepo;
  resolveParty(rfp: RFP, actor: Actor): Promise<'buyer' | 'pg' | null | undefined>;
  adapters: {
    template(input: DispatchContext<'template'>): Promise<ServiceResult>;
    compose(input: DispatchContext<'compose'>): Promise<ServiceResult>;
  };
};

/**
 * 저장된 계약서 서식 발송의 단일 내부 진입점.
 *
 * 두 공급자 경로가 공유하는 존재·ACL·상태·봉인·서식 소유/종류 게이트를 여기서
 * 한 번만 통과시킨 뒤, PDF 템플릿과 조항형 어댑터에 좁혀진 문맥을 넘긴다.
 */
export class ContractDispatch {
  constructor(private readonly deps: ContractDispatchDeps) {}

  async dispatch(input: ContractDispatchInput): Promise<ServiceResult> {
    const rfp = await this.deps.rfpRepo.findById(input.rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    if ((await this.deps.resolveParty(rfp, input.actor)) !== 'pg') {
      return { ok: false, error: 'FORBIDDEN' };
    }

    const active = await this.deps.signingRepo.findActiveByRfp(input.rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    if (active.status !== 'awaiting_pg_template') {
      return { ok: false, error: 'ALREADY_SENT' };
    }

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
