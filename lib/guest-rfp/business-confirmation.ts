import { z } from 'zod';
import { isValidBizNo } from '@/lib/validation/biz-no';
import { normalizeWebsiteUrl } from '@/lib/validation/website-url';
import type { QuoteContext } from './quote-context';

export const businessConfirmationSchema = z
  .object({
    website: z.string().min(1).max(500),
    bizNo: z
      .string()
      .regex(/^\d{10}$/)
      .refine((n) => n !== '0000000000' && isValidBizNo(n)),
  })
  .strict();
export type BusinessConfirmation = z.infer<typeof businessConfirmationSchema>;
export function confirmedBusiness(
  context: QuoteContext | undefined,
  website: string | undefined,
): BusinessConfirmation | undefined {
  const site = normalizeWebsiteUrl(website?.trim() ?? '');
  if (!site || context?.confirmedWebsite !== site || !context.confirmed.includes('business-number'))
    return;
  const result = businessConfirmationSchema.safeParse({ website: site, bizNo: context.bizNo });
  return result.success ? result.data : undefined;
}
