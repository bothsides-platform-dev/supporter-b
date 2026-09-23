import type { AgreementParties, AgreementFeeRow } from '@/lib/contract-doc/agreement';
import type { SentContractSnapshot } from './signing';

export type AgreementSigner = { name: string; email: string; phone?: string };
export type AgreementSnapshot = SentContractSnapshot & {
  agreement: {
    version: string;
    rateVersion: number;
    bidId: string;
    signers: { buyer: AgreementSigner; pg: AgreementSigner };
  };
};
export type AgreementView = {
  ok: true;
  mode: 'agreement';
  editable: boolean;
  contractId: string;
  revision: number;
  rfpCode: string;
  parties?: AgreementParties;
  signers?: { buyer: AgreementSigner; pg: AgreementSigner };
  /** Live send prerequisites, exposed only to the PG before dispatch. */
  sendReadiness?: { buyer: boolean; pg: boolean };
  fees: AgreementFeeRow[];
  error?: string;
  stamp?: string;
  snapshot?: AgreementSnapshot;
};
