export type PgRecommendationGroup = {
  id: string;
  name: string;
  mccCode?: string;
  pgWorkspaceIds: string[];
};

export type PublicIndustry = Pick<PgRecommendationGroup, 'id' | 'name' | 'mccCode'>;
