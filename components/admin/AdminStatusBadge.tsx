'use client';

import { Chip, type ChipColor } from '@/components/primitives/Chip';

function statusToColor(status: string): ChipColor {
  switch (status) {
    case 'submitted':
    case 'review_pending':
    case 'needs_more_info':
    case 'pending':
      return 'warning';
    case 'approved':
    case 'active':
      return 'tertiary';
    case 'rejected':
    case 'suspended':
      return 'error';
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
    default: return status;
  }
}

type AdminStatusBadgeProps = {
  status: string;
};

export function AdminStatusBadge({ status }: AdminStatusBadgeProps) {
  return <Chip color={statusToColor(status)} label={statusToLabel(status)} />;
}
