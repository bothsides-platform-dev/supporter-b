import type { MerchantTier } from './bid';

export type BizProfile = {
  bizNo?: string;
  taxType?: 'general' | 'simple' | 'exempt';
  status?: 'active' | 'suspended' | 'closed';
  // 가맹점 영세·중소 등급 — 견적 수수료 구간(MerchantTier)과 단일 타입으로 통합됨(영세=sole).
  grade?: MerchantTier;
  gradeSource: 'user_confirmed' | 'user_overridden' | 'unset' | 'admin_confirmed';
  gradeConfirmedBy?: string;
  gradeConfirmedAt?: string;
};
