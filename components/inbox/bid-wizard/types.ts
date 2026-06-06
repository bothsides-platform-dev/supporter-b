import type { BidDraft } from '../useBidDraft';

export type SetBidField = <K extends keyof BidDraft>(key: K, value: BidDraft[K]) => void;
