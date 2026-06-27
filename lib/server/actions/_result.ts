// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ActionResult<T extends object = {}> =
  | ({ ok: true } & T)
  | { ok: false; error: string };
