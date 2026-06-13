export type RfpRequoteRequestStatus = 'pending' | 'responded';

export type RfpRequoteRequest = {
  id: string;
  rfpId: string;
  pgWsId: string;
  round: number;
  message: string;
  deadline: string; // ISO 8601
  status: RfpRequoteRequestStatus;
  createdByUserId: string;
  createdAt: string; // ISO 8601
  respondedAt?: string; // ISO 8601
};
