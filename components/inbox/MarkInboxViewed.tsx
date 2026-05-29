'use client';

import { useEffect } from 'react';
import { useRecentlyViewedInbox } from '@/lib/stores/recently-viewed-inbox';

export function MarkInboxViewed({ rfpId }: { rfpId: string }) {
  const markViewed = useRecentlyViewedInbox((s) => s.markViewed);
  useEffect(() => {
    markViewed(rfpId);
  }, [rfpId, markViewed]);
  return null;
}
