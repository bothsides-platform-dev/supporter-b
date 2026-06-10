'use client';

import type { QuoteTemplateOption } from '@/lib/types/bid';

export function QuoteTemplateDrawer({
  open: _open,
  onClose: _onClose,
  template: _template,
  onSaved: _onSaved,
}: {
  open: boolean;
  onClose: () => void;
  template: QuoteTemplateOption | null;
  onSaved: () => void;
}) {
  return null;
}
