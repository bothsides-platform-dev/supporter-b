'use client';

import type { QuoteTemplateOption } from '@/lib/types/bid';

/**
 * QuoteTemplateDrawer — slide-over drawer for creating/editing a quote template.
 * Implementation is provided in a follow-up task; this stub satisfies the import.
 */
export function QuoteTemplateDrawer({
  open: _open,
  onOpenChange: _onOpenChange,
  template: _template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: QuoteTemplateOption | null;
}) {
  // TODO: implement full drawer UI
  return null;
}
