'use client';

import { Chip, type ChipColor } from '@/components/primitives/Chip';

function statusToColor(status: string): ChipColor {
  switch (status) {
    case 'submitted':
    case 'review_pending':
    case 'needs_more_info':
    case 'pending':
    case 'draft':
      return 'warning';
    case 'approved':
    case 'active':
    case 'sent':
    case 'awarded':
      return 'tertiary';
    case 'rejected':
    case 'suspended':
    case 'cancelled':
    case 'withdrawn':
      return 'error';
    case 'closed':
      return 'surface';
    default:
      return 'surface';
  }
}

function statusToLabel(status: string): string {
  switch (status) {
    case 'submitted': return '신청됨';
    case 'review_pending': return '심사 중';
    case 'needs_more_info': return '보완 요청';
    case 'pending': return '대기';
    case 'approved': return '승인';
    case 'active': return '활성';
    case 'rejected': return '반려';
    case 'suspended': return '정지';
    // RFP statuses
    case 'draft': return '초안';
    case 'sent': return '발송됨';
    case 'closed': return '마감';
    case 'cancelled': return '취소';
    case 'withdrawn': return '철회';
    case 'awarded': return '낙찰';
    default: return status;
  }
}

type AdminStatusBadgeProps = {
  status: string;
};

export function AdminStatusBadge({ status }: AdminStatusBadgeProps) {
  return <Chip color={statusToColor(status)} label={statusToLabel(status)} />;
}
