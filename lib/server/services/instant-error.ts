export class InstantError extends Error {}
export function deny(message: string): never {
  throw new InstantError(message);
}
