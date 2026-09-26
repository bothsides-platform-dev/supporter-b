import { z } from 'zod';

export const cleanIndustryName = (name: string) => name.trim().replace(/\s+/g, ' ');
export const industryNameKey = (name: string) => cleanIndustryName(name).toLowerCase();
export const customIndustryNameSchema = z.string().trim().min(1).max(100).transform(cleanIndustryName);
export const industrySelectionSchema = z.object({
  industryGroupId: z.string().uuid().optional(),
  customIndustryName: customIndustryNameSchema.optional(),
}).strict().refine(value => (value.industryGroupId !== undefined) !== (value.customIndustryName !== undefined));
export type IndustrySelection = z.input<typeof industrySelectionSchema>;


type IndustryDraft = { industryMode?: 'registered' | 'custom'; industryGroupId?: string; customIndustryName?: string };
export function draftIndustrySelection(draft: IndustryDraft): IndustrySelection {
  return draft.industryMode === 'custom'
    ? { customIndustryName: draft.customIndustryName ?? '' }
    : { industryGroupId: draft.industryGroupId };
}
export function isIndustrySelectionValid(draft: IndustryDraft, groups: readonly { id: string }[]) {
  return draft.industryMode === 'custom'
    ? customIndustryNameSchema.safeParse(draft.customIndustryName).success
    : groups.some(group => group.id === draft.industryGroupId);
}
