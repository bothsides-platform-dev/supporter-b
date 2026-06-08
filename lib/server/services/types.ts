export type Actor = { userId: string; workspaceId: string };

export type ServiceResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };
