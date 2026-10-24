import { AsyncLocalStorage } from 'node:async_hooks';

export type VerificationSessionRenewal = {
  userId: string;
  fromVersion: number;
  toVersion: number;
};

// Only the successful verification action enters this scope. Auth.js session
// POST input cannot create it. AsyncLocalStorage isolates simultaneous requests.
const renewal = new AsyncLocalStorage<VerificationSessionRenewal>();
export const withVerificationSessionRenewal = <T>(proof: VerificationSessionRenewal, run: () => Promise<T>): Promise<T> => renewal.run(proof, run);
export const currentVerificationSessionRenewal = () => renewal.getStore();
