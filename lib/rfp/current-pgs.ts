import { z } from 'zod';

export const currentPgNameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
export const currentPgsSchema = z.array(z.object({
  pgWorkspaceId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(100),
}).strict()).max(50);
export type CurrentPg = z.infer<typeof currentPgsSchema>[number];
