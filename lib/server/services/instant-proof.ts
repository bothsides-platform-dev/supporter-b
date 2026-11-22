import { createHmac } from 'node:crypto';

export function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
}
export function instantProof(data: unknown) {
  const key = process.env.AUTH_SECRET;
  if (!key) throw Error('AUTH_SECRET_REQUIRED');
  return createHmac('sha256', key).update(canonical(data)).digest('base64url');
}
